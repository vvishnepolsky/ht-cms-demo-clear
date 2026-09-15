import {
  attachVerificationDocumentsToCase,
  MAX_PROOF_BYTES,
  parseDataUrl,
  storeVerificationProof,
  type DocumentRow,
} from "../ee/documents.js";
import { Router, type Request, type Response } from "express";
import { nanoid } from "nanoid";
import { audit } from "../audit.js";
import { config } from "../config.js";
import { db, fromJson, now, toJson } from "../db.js";
import { httpError } from "../http-error.js";
import { completeVerification } from "../pipeline.js";
import { getVerificationRow, toResidentVerification, type FlagNote, type FlagRow, type VerificationRow } from "../verifications.js";
import { syncWithClear } from "./resident-routes.js";

/**
 * The hosted Verify Assist flow (apps/verify) — the standalone application the
 * origin app hands the user to. Public by design — scoped by the unguessable
 * per-session token, which is the credential.
 */
export const flowRoutes = Router();

function findByToken(token: string): VerificationRow {
  const row = db.prepare(`SELECT * FROM verifications WHERE mock_token = ?`).get(token) as VerificationRow | undefined;
  if (!row) httpError(404, "unknown_token", "Unknown verification token.");
  return row;
}

/** Back into the resident wizard: `${RESIDENT_APP_URL}/#/personal?verified=<id>` by default. */
export function returnToOrigin(row: VerificationRow): string {
  const path = config.verifyAssistReturnPath.startsWith("/")
    ? config.verifyAssistReturnPath
    : `/${config.verifyAssistReturnPath}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${config.residentAppUrl}${path}${sep}verified=${encodeURIComponent(row.id)}`;
}

flowRoutes.get("/api/flow/sessions/:token", async (req: Request, res: Response) => {
  let row = findByToken(String(req.params.token));
  row = await syncWithClear(row);
  const view = toResidentVerification(row);
  res.json({
    session: {
      verificationId: row.id,
      status: row.status,
      role: row.role,
      mode: config.mockClear ? "mock" : "sandbox",
      externalRef: row.external_ref,
      subjectName: row.subject_name,
      checks: view.checks,
      traits: view.traits,
      determination: view.determination,
      resolution: row.resolution,
      // Sandbox mode: where the flow app sends the user for the CLEAR step.
      clearUrl: !config.mockClear ? row.clear_hosted_url : null,
      returnTo: returnToOrigin(row),
    },
  });
});

// Accepts only inline images, capped well under the body-parser limit.
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,/;
const MAX_IMAGE_CHARS = 4_000_000; // ~3 MB decoded

function sanitizeImage(v: unknown): string | null {
  return typeof v === "string" && IMAGE_DATA_URL.test(v) && v.length <= MAX_IMAGE_CHARS ? v : null;
}

// Mock mode only: stands in for CLEAR's servers completing the verification.
flowRoutes.post("/api/flow/sessions/:token/clear-complete", (req: Request, res: Response) => {
  if (!config.mockClear) httpError(404, "not_found", "Not available outside mock mode.");
  const row = findByToken(String(req.params.token));
  const body = (req.body ?? {}) as Record<string, unknown>;
  const selfie = sanitizeImage(body.selfie);
  const documentFront = sanitizeImage(body.documentFront);
  const documentBack = sanitizeImage(body.documentBack);
  const images =
    selfie || documentFront || documentBack
      ? {
          selfie,
          document_front: documentFront,
          document_back: documentBack,
          face_scan_preview_ref: null,
          source: "mock-capture" as const,
        }
      : null;
  completeVerification(row, images ? { checks: [], traits: null, images } : undefined); // idempotent on repeat calls
  res.json({ ok: true, verificationId: row.id });
});

const RESOLUTIONS = new Set(["ended_submit_proof", "confirm_enrolled"]);

/**
 * Close-out: record the applicant's answer to the coverage finding on the
 * verification and as a note on its open flag, then hand back the return URL.
 */
flowRoutes.post("/api/flow/sessions/:token/resolution", (req: Request, res: Response) => {
  const row = findByToken(String(req.params.token));
  if (row.status !== "success") {
    httpError(409, "not_completed", "Verification has not completed yet.");
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const resolution = String(body.resolution ?? "");
  if (!RESOLUTIONS.has(resolution)) {
    httpError(400, "invalid_resolution", "resolution must be 'ended_submit_proof' or 'confirm_enrolled'.");
  }
  const proofName = typeof body.proofName === "string" && body.proofName.trim() ? body.proofName.trim().slice(0, 200) : null;

  // Proof of disenrollment: the hosted flow sends the file as a base64 data URL
  // (≤ 6 MB client-side; hard cap here). Persist bytes + a documents row and
  // remember the document on the verification so the case can adopt it.
  let proofDocument: DocumentRow | null = null;
  if (resolution === "ended_submit_proof" && body.proofDataUrl !== undefined && body.proofDataUrl !== null) {
    const parsed = parseDataUrl(body.proofDataUrl);
    if (!parsed) httpError(400, "invalid_proof", "proofDataUrl must be a base64 data URL.");
    if (parsed.bytes.length === 0) httpError(400, "invalid_proof", "The proof file is empty.");
    if (parsed.bytes.length > MAX_PROOF_BYTES) {
      httpError(413, "proof_too_large", `The proof file exceeds ${Math.round(MAX_PROOF_BYTES / 1024 / 1024)} MB.`);
    }
    const mimeType =
      (typeof body.proofMimeType === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(body.proofMimeType) ? body.proofMimeType : null) ??
      parsed.mimeType ??
      "application/octet-stream";
    proofDocument = storeVerificationProof({
      ownerId: row.user_id,
      verificationId: row.id,
      fileName: proofName ?? `proof-of-disenrollment.${mimeType.split("/")[1] ?? "bin"}`,
      mimeType,
      bytes: parsed.bytes,
    });
    if (row.case_id) attachVerificationDocumentsToCase(row.id, row.case_id);
  }

  db.prepare(`UPDATE verifications SET resolution = ?, proof_document_id = COALESCE(?, proof_document_id) WHERE id = ?`).run(
    resolution,
    proofDocument?.id ?? null,
    row.id,
  );

  const flag = db
    .prepare(`SELECT * FROM flags WHERE verification_id = ? AND status IN ('open','in_review') ORDER BY created_at DESC`)
    .get(row.id) as FlagRow | undefined;
  if (flag) {
    const notes = fromJson<FlagNote[]>(flag.notes) ?? [];
    const text =
      resolution === "ended_submit_proof"
        ? `Applicant states this coverage has ended and submitted proof of disenrollment${
            proofDocument ? `: ${proofDocument.file_name} (document ${proofDocument.id})` : proofName ? `: ${proofName}` : ""
          }.`
        : "Applicant confirmed they are still enrolled in this coverage; asked to continue with caseworker review.";
    notes.push({ id: `note_${nanoid(8)}`, author: "applicant (hosted flow)", body: text, createdAt: now() });
    db.prepare(`UPDATE flags SET notes = ?, updated_at = ? WHERE id = ?`).run(toJson(notes), now(), flag.id);
  }

  audit("applicant", "resident", "verification.resolution_recorded", row.id, {
    resolution,
    proofName,
    proofDocumentId: proofDocument?.id ?? null,
    flagId: flag?.id ?? null,
  });
  res.json({ ok: true, returnTo: returnToOrigin(row), proofDocumentId: proofDocument?.id ?? null });
});
