import { randomUUID } from "node:crypto";
import { config, CUSTOMER_ID } from "../config.js";
import { db, now } from "../db.js";

/**
 * document-service replica: metadata only. `uploadUrl` points at this server's
 * data-sink (`PUT /api/uploads/:documentId`), which accepts and discards bytes.
 */

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
  const row: DocumentRow = {
    id,
    customer_id: CUSTOMER_ID,
    owner_id: ownerId,
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
       retention_policy, size_bytes, program, program_id, s3_key, status, checksum_sha256, created_at, updated_at)
     VALUES (@id, @customer_id, @owner_id, @file_name, @mime_type, @file_type, @document_purpose, @sensitivity_level,
       @retention_policy, @size_bytes, @program, @program_id, @s3_key, @status, @checksum_sha256, @created_at, @updated_at)`,
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

/** Data-sink: mark the row as received; bytes are not retained. */
export function markUploadReceived(id: string, sizeBytes: number): boolean {
  const res = db
    .prepare(`UPDATE documents SET status = CASE status WHEN 'UPLOADED' THEN status ELSE 'RECEIVED' END, size_bytes = ?, updated_at = ? WHERE id = ?`)
    .run(sizeBytes, now(), id);
  return res.changes > 0;
}
