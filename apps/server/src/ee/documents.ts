import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { config, CUSTOMER_ID } from "../config.js";
import { db, now } from "../db.js";
import { getCaseRow } from "./cases.js";

/**
 * document-service replica. Metadata lives in the `documents` table; bytes are
 * written under `<dirname(DATABASE_PATH)>/uploads/<s3_key>` (the Render disk at
 * /var/data persists them). Two producers:
 *   - the resident wizard/dashboard (`createDocument` → `PUT /api/uploads/:id`
 *     → `confirmDocumentUpload`), and
 *   - the Verify Assist hosted flow's proof of disenrollment
 *     (`storeVerificationProof`, called from the resolution route).
 * Bytes are served by `GET /api/documents/:id/content` (owner or staff only).
 */

export const PROOF_OF_DISENROLLMENT_PURPOSE = "PROOF_OF_COVERAGE_TERMINATION";
export const PROOF_OF_DISENROLLMENT_CATEGORY = "proof-of-disenrollment";
/** Hard cap for a proof file coming through the JSON body (server json limit is 12 MB). */
export const MAX_PROOF_BYTES = 8 * 1024 * 1024;

export interface CreateDocumentInput {
  fileName: string;
  mimeType: string;
  fileType: string;
  documentPurpose: string;
  sensitivityLevel: string;
  retentionPolicy: string;
  sizeBytes: number;
  program: string;
  programId?: string | null;
}

interface DocumentRow {
  id: string;
  customer_id: string;
  owner_id: string;
  file_name: string;
  mime_type: string;
  file_type: string;
  document_purpose: string;
  sensitivity_level: string;
  retention_policy: string;
  size_bytes: number;
  program: string;
  program_id: string | null;
  s3_key: string;
  status: string;
  checksum_sha256: string | null;
  created_at: string;
  updated_at: string;
  /** Verify Assist verification the file was uploaded through (proof of disenrollment). */
  verification_id?: string | null;
  /** E&E case the document is attached to (set at case creation / on upload). */
  case_id?: string | null;
  /** e.g. proof-of-disenrollment | proof-of-residence */
  document_category?: string | null;
}
export type { DocumentRow };

function uploadsDir(): string {
  return join(dirname(config.databasePath), "uploads");
}

/** Absolute path of a document's bytes. */
export function documentFilePath(row: Pick<DocumentRow, "s3_key">): string {
  return join(uploadsDir(), row.s3_key.replace(/\//g, "__"));
}

export function writeDocumentBytes(row: Pick<DocumentRow, "s3_key">, bytes: Buffer): void {
  const dir = uploadsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(documentFilePath(row), bytes);
}

/** Bytes on disk, or null when nothing was ever stored for the row. */
export function readDocumentBytes(row: Pick<DocumentRow, "s3_key">): Buffer | null {
  const path = documentFilePath(row);
  return existsSync(path) ? readFileSync(path) : null;
}

const UPLOAD_TTL_MS = 15 * 60 * 1000;

function extensionFor(fileName: string, mimeType: string): string {
  const fromName = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "text/csv": "csv",
  };
  return map[mimeType] ?? "bin";
}

export function createDocument(ownerId: string, input: CreateDocumentInput) {
  const at = now();
  const id = randomUUID();
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const category = input.documentPurpose.toLowerCase().replace(/_/g, "-");
  const s3Key = `${input.program.toLowerCase().replace(/_/g, "-")}/${category}/${yyyy}/${mm}/${id}.${extensionFor(
    input.fileName,
    input.mimeType,
  )}`;
  // The resident dashboard passes its case id as `programId` so the upload
  // attaches to the case; anything else stays a plain owner-scoped document.
  const linkedCase = input.programId ? getCaseRow(input.programId) : undefined;
  const caseId = linkedCase && linkedCase.applicant_person_id === ownerId ? linkedCase.id : null;
  const row: DocumentRow = {
    id,
    customer_id: CUSTOMER_ID,
    owner_id: ownerId,
    verification_id: null,
    case_id: caseId,
    document_category: category,
    file_name: input.fileName,
    mime_type: input.mimeType,
    file_type: input.fileType,
    document_purpose: input.documentPurpose,
    sensitivity_level: input.sensitivityLevel,
    retention_policy: input.retentionPolicy,
    size_bytes: input.sizeBytes,
    program: input.program,
    program_id: input.programId ?? null,
    s3_key: s3Key,
    status: "PENDING_UPLOAD",
    checksum_sha256: null,
    created_at: at,
    updated_at: at,
  };
  db.prepare(
    `INSERT INTO documents (id, customer_id, owner_id, file_name, mime_type, file_type, document_purpose, sensitivity_level,
       retention_policy, size_bytes, program, program_id, s3_key, status, checksum_sha256, created_at, updated_at,
       verification_id, case_id, document_category)
     VALUES (@id, @customer_id, @owner_id, @file_name, @mime_type, @file_type, @document_purpose, @sensitivity_level,
       @retention_policy, @size_bytes, @program, @program_id, @s3_key, @status, @checksum_sha256, @created_at, @updated_at,
       @verification_id, @case_id, @document_category)`,
  ).run(row);
  return {
    documentId: id,
    uploadUrl: `${config.publicUrl}/api/uploads/${id}`,
    s3Key,
    expiresAt: new Date(Date.now() + UPLOAD_TTL_MS).toISOString(),
  };
}

export function getDocument(id: string): DocumentRow | undefined {
  return db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id) as DocumentRow | undefined;
}

export function confirmDocumentUpload(id: string, sizeBytes: number, checksumSha256: string): boolean {
  const res = db
    .prepare(`UPDATE documents SET status = 'UPLOADED', size_bytes = ?, checksum_sha256 = ?, updated_at = ? WHERE id = ?`)
    .run(sizeBytes, checksumSha256, now(), id);
  return res.changes > 0;
}

/** `PUT /api/uploads/:id` — store the bytes on disk and mark the row received. */
export function markUploadReceived(id: string, bytes: Buffer | null, sizeBytes: number): boolean {
  const row = getDocument(id);
  if (!row) return false;
  if (bytes && bytes.length > 0) writeDocumentBytes(row, bytes);
  const res = db
    .prepare(`UPDATE documents SET status = CASE status WHEN 'UPLOADED' THEN status ELSE 'RECEIVED' END, size_bytes = ?, updated_at = ? WHERE id = ?`)
    .run(sizeBytes, now(), id);
  return res.changes > 0;
}

// --- Verify Assist proof of disenrollment ---------------------------------------------------

const DATA_URL = /^data:([\w.+-]+\/[\w.+-]+)?(?:;[^,]*?)?;base64,(.*)$/s;

export interface ParsedDataUrl {
  mimeType: string | null;
  bytes: Buffer;
}

/** Decode a base64 data URL; null when malformed. Callers enforce the byte cap. */
export function parseDataUrl(value: unknown): ParsedDataUrl | null {
  if (typeof value !== "string") return null;
  const m = DATA_URL.exec(value);
  if (!m) return null;
  try {
    return { mimeType: m[1] ?? null, bytes: Buffer.from(m[2] ?? "", "base64") };
  } catch {
    return null;
  }
}

export interface StoreProofInput {
  ownerId: string;
  verificationId: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}

/**
 * Persist the applicant's proof of disenrollment uploaded in the hosted flow:
 * bytes on disk + an UPLOADED `documents` row owned by the verification's user,
 * categorised `proof-of-disenrollment`, linked to the verification (and to the
 * case, once one is created — see attachVerificationDocumentsToCase).
 */
export function storeVerificationProof(input: StoreProofInput): DocumentRow {
  const at = now();
  const id = randomUUID();
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const s3Key = `medicaid/${PROOF_OF_DISENROLLMENT_CATEGORY}/${yyyy}/${mm}/${id}.${extensionFor(input.fileName, input.mimeType)}`;
  const row: DocumentRow = {
    id,
    customer_id: CUSTOMER_ID,
    owner_id: input.ownerId,
    file_name: input.fileName,
    mime_type: input.mimeType,
    file_type: extensionFor(input.fileName, input.mimeType),
    document_purpose: PROOF_OF_DISENROLLMENT_PURPOSE,
    sensitivity_level: "PHI",
    retention_policy: "CASE_RECORD",
    size_bytes: input.bytes.length,
    program: "MEDICAID",
    program_id: null,
    s3_key: s3Key,
    status: "UPLOADED",
    checksum_sha256: null,
    created_at: at,
    updated_at: at,
    verification_id: input.verificationId,
    case_id: null,
    document_category: PROOF_OF_DISENROLLMENT_CATEGORY,
  };
  writeDocumentBytes(row, input.bytes);
  db.prepare(
    `INSERT INTO documents (id, customer_id, owner_id, file_name, mime_type, file_type, document_purpose, sensitivity_level,
       retention_policy, size_bytes, program, program_id, s3_key, status, checksum_sha256, created_at, updated_at,
       verification_id, case_id, document_category)
     VALUES (@id, @customer_id, @owner_id, @file_name, @mime_type, @file_type, @document_purpose, @sensitivity_level,
       @retention_policy, @size_bytes, @program, @program_id, @s3_key, @status, @checksum_sha256, @created_at, @updated_at,
       @verification_id, @case_id, @document_category)`,
  ).run(row);
  return row;
}

/** Case creation: documents uploaded through the linked verification now belong to the case. */
export function attachVerificationDocumentsToCase(verificationId: string, caseId: string): number {
  return db
    .prepare(`UPDATE documents SET case_id = ?, updated_at = ? WHERE verification_id = ? AND case_id IS NULL`)
    .run(caseId, now(), verificationId).changes;
}

export function documentsForCase(caseId: string): DocumentRow[] {
  return db
    .prepare(`SELECT * FROM documents WHERE case_id = ? AND status IN ('UPLOADED','RECEIVED') ORDER BY created_at DESC`)
    .all(caseId) as DocumentRow[];
}

/** Public URL (same origin) that streams the bytes to the owner or staff. */
export function documentContentUrl(id: string): string {
  return `/api/documents/${encodeURIComponent(id)}/content`;
}

/** GraphQL `MedicaidEeCaseDocument` projection. */
export function toCaseDocument(row: DocumentRow) {
  return {
    id: row.id,
    caseId: row.case_id ?? "",
    s3Key: row.s3_key,
    documentCategory: row.document_category ?? row.document_purpose.toLowerCase().replace(/_/g, "-"),
    createdAt: row.created_at,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.updated_at,
    source: row.verification_id ? "verify_assist" : "resident_upload",
    url: documentContentUrl(row.id),
  };
}

/** GraphQL `IdentityVerification.proofDocument` projection. */
export function toProofDocument(row: DocumentRow) {
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.updated_at,
    url: documentContentUrl(row.id),
  };
}
