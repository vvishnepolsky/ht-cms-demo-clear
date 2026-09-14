import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { nanoid } from "nanoid";
import { audit } from "../audit.js";
import { getUser, isStaff, requireResident, requireAuth, requireStaff } from "../auth.js";
import { clearCreateSession, clearGetSession, clearHostedUrl } from "../clear/clear-api.js";
import type { VerificationRole } from "../clear/types.js";
import { config } from "../config.js";
import { db, fromJson, nextCounter, now, toJson } from "../db.js";
import { httpError } from "../http-error.js";
import { completeVerification } from "../pipeline.js";
import {
  flagsForVerification,
  getVerificationRow,
  toFlag,
  toResidentVerification,
  toVerification,
  type VerificationRow,
} from "../verifications.js";

export const residentRoutes = Router();

interface DraftRow {
  user_id: string;
  external_ref: string | null;
  data: string;
  sections_complete: string;
  updated_at: string;
}

function toDraft(row: DraftRow) {
  return {
    userId: row.user_id,
    externalRef: row.external_ref,
    data: fromJson<Record<string, unknown>>(row.data) ?? {},
    sectionsComplete: fromJson<string[]>(row.sections_complete) ?? [],
    updatedAt: row.updated_at,
  };
}

/** Application reference: `SX-APP-2026-NNNNNN`, minted when the application starts. */
export function mintExternalRef(): string {
  return `SX-APP-${new Date().getUTCFullYear()}-${String(nextCounter("application_ref")).padStart(6, "0")}`;
}

/**
 * The application reference travels through every downstream artifact, so it
 * is assigned when the application STARTS — first draft save or first
 * verification. Returns the ref, creating an empty draft if the user has none.
 */
function ensureDraftRef(userId: string): string {
  const row = db.prepare(`SELECT * FROM drafts WHERE user_id = ?`).get(userId) as DraftRow | undefined;
  if (row?.external_ref) return row.external_ref;
  const externalRef = mintExternalRef();
  if (row) {
    db.prepare(`UPDATE drafts SET external_ref = ? WHERE user_id = ?`).run(externalRef, userId);
  } else {
    db.prepare(
      `INSERT INTO drafts (user_id, external_ref, data, sections_complete, updated_at) VALUES (?, ?, '{}', '[]', ?)`,
    ).run(userId, externalRef, now());
  }
  return externalRef;
}

// --- draft (legacy ht-clear wizard persistence; harmless to keep) ----------------

residentRoutes.get("/api/draft", requireResident, (_req: Request, res: Response) => {
  const user = getUser(res);
  const row = db.prepare(`SELECT * FROM drafts WHERE user_id = ?`).get(user.id) as DraftRow | undefined;
  res.json({ draft: row ? toDraft(row) : null });
});

residentRoutes.put("/api/draft", requireResident, (req: Request, res: Response) => {
  const user = getUser(res);
  const { data, sectionsComplete } = (req.body ?? {}) as Record<string, unknown>;
  if (data == null || typeof data !== "object") {
    httpError(400, "invalid_draft", "Draft data must be an object.");
  }
  ensureDraftRef(user.id);
  db.prepare(`UPDATE drafts SET data = ?, sections_complete = ?, updated_at = ? WHERE user_id = ?`).run(
    toJson(data),
    toJson(Array.isArray(sectionsComplete) ? sectionsComplete : []),
    now(),
    user.id,
  );
  const row = db.prepare(`SELECT * FROM drafts WHERE user_id = ?`).get(user.id) as DraftRow;
  res.json({ draft: toDraft(row) });
});

residentRoutes.delete("/api/draft", requireResident, (_req: Request, res: Response) => {
  const user = getUser(res);
  db.prepare(`DELETE FROM drafts WHERE user_id = ?`).run(user.id);
  res.json({ ok: true });
});

// --- verifications ---------------------------------------------------------------

residentRoutes.post("/api/verifications", requireResident, async (req: Request, res: Response) => {
  const user = getUser(res);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const role: VerificationRole = body.role === "household" ? "household" : "applicant";
  const id = `verify_${nanoid(12)}`;
  const createdAt = now();
  // Stamp the application reference at handoff time — the primary identifier
  // must be on the verification record from creation.
  const externalRef = ensureDraftRef(user.id);

  // The user is handed to the standalone Verify Assist flow app, which owns the
  // journey (interstitial → CLEAR → findings → resolution → close-out back to
  // the origin). The flow token is the session credential in both modes; in
  // sandbox mode the flow app redirects out to CLEAR's hosted UI mid-flow.
  const flowToken = nanoid(24);
  const hostedUrl = `${config.verifyAppUrl}/flow?token=${flowToken}`;
  let clearSessionId: string | null = null;
  let clearUrl: string | null = null;

  if (!config.mockClear) {
    const state = randomUUID();
    const redirectUrl = `${config.verifyAppUrl}/flow?token=${flowToken}&returned=1&state=${state}`;
    const created = await clearCreateSession(redirectUrl);
    clearSessionId = created.clearSessionId;
    clearUrl = clearHostedUrl(created.token);
  }

  db.prepare(
    `INSERT INTO verifications (id, user_id, external_ref, role, status, hosted_url, mock_token, clear_session_id, clear_hosted_url, checks, created_at)
     VALUES (?, ?, ?, ?, 'awaiting_user', ?, ?, ?, ?, '[]', ?)`,
  ).run(id, user.id, externalRef, role, hostedUrl, flowToken, clearSessionId, clearUrl, createdAt);
  audit(user.email, user.role, "verification.created", id, {
    role,
    externalRef,
    mode: config.mockClear ? "mock" : "sandbox",
  });
  res.status(201).json({ verification: { id, externalRef, hostedUrl, status: "awaiting_user" } });
});

/** Sandbox mode: poll CLEAR for a non-terminal session; terminal → completion pipeline. */
export async function syncWithClear(row: VerificationRow): Promise<VerificationRow> {
  if (config.mockClear || !row.clear_session_id) return row;
  if (row.status !== "awaiting_user" && row.status !== "in_progress") return row;
  const clearSession = await clearGetSession(row.clear_session_id);
  if (!clearSession) return row;
  if (clearSession.status === "success") {
    completeVerification(row, clearSession);
  } else if (clearSession.status !== row.status) {
    db.prepare(`UPDATE verifications SET status = ? WHERE id = ?`).run(clearSession.status, row.id);
  }
  return getVerificationRow(row.id)!;
}

residentRoutes.get("/api/verifications/mine", requireResident, (_req: Request, res: Response) => {
  const user = getUser(res);
  const rows = db
    .prepare(`SELECT * FROM verifications WHERE user_id = ? ORDER BY created_at DESC`)
    .all(user.id) as VerificationRow[];
  res.json({ verifications: rows.map(toResidentVerification) });
});

residentRoutes.get("/api/verifications/:id", requireAuth, async (req: Request, res: Response) => {
  const user = getUser(res);
  let row = getVerificationRow(String(req.params.id));
  if (!row) httpError(404, "not_found", "Verification not found.");
  const staff = isStaff(user);
  if (!staff && row.user_id !== user.id) {
    httpError(404, "not_found", "Verification not found.");
  }
  row = await syncWithClear(row);
  // Staff get the full record; the owner gets the identity-only view (no raw
  // coverage traits, no flags — determination + resolution are kept).
  res.json({ verification: staff ? toVerification(row) : toResidentVerification(row) });
});

// Flags by verification id. Staff-only.
residentRoutes.get("/api/verifications/:id/flags", requireStaff, (req: Request, res: Response) => {
  const row = getVerificationRow(String(req.params.id));
  if (!row) httpError(404, "not_found", "Verification not found.");
  res.json({ flags: flagsForVerification(row.id).map(toFlag) });
});
