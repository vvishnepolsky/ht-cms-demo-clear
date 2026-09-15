import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

mkdirSync(dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    role          TEXT NOT NULL CHECK (role IN ('resident','caseworker','admin')),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    first_name    TEXT NOT NULL,
    last_name     TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS drafts (
    user_id           TEXT PRIMARY KEY REFERENCES users(id),
    external_ref      TEXT UNIQUE,
    data              TEXT NOT NULL,
    sections_complete TEXT NOT NULL DEFAULT '[]',
    updated_at        TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS applications (
    id           TEXT PRIMARY KEY,
    external_ref TEXT NOT NULL UNIQUE,
    user_id      TEXT NOT NULL REFERENCES users(id),
    data         TEXT NOT NULL,
    status       TEXT NOT NULL CHECK (status IN ('submitted','under_review')),
    submitted_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verifications (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users(id),
    external_ref     TEXT,
    role             TEXT NOT NULL CHECK (role IN ('applicant','household')),
    subject_name     TEXT,
    status           TEXT NOT NULL,
    hosted_url       TEXT NOT NULL,
    mock_token       TEXT UNIQUE,
    clear_session_id TEXT,
    checks           TEXT NOT NULL DEFAULT '[]',
    traits           TEXT,
    determination    TEXT,
    created_at       TEXT NOT NULL,
    completed_at     TEXT
  );

  CREATE TABLE IF NOT EXISTS runs (
    id              TEXT PRIMARY KEY,
    verification_id TEXT NOT NULL REFERENCES verifications(id),
    seq             INTEGER NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('initial','monitoring')),
    status          TEXT NOT NULL,
    determination   TEXT,
    coverage        TEXT,
    created_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS flags (
    id                 TEXT PRIMARY KEY,
    verification_id    TEXT NOT NULL REFERENCES verifications(id),
    external_ref       TEXT,
    type               TEXT NOT NULL,
    status             TEXT NOT NULL CHECK (status IN ('open','in_review','resolved','dismissed')),
    assignee           TEXT,
    disposition_reason TEXT,
    details            TEXT NOT NULL DEFAULT '{}',
    notes              TEXT NOT NULL DEFAULT '[]',
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
  );

  -- Verify Assist activity trail (ht-clear shape).
  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    at         TEXT NOT NULL,
    actor      TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action     TEXT NOT NULL,
    subject    TEXT NOT NULL,
    meta       TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS counters (
    name  TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );

  -- identity-service replica ------------------------------------------------
  CREATE TABLE IF NOT EXISTS persons (
    id                 TEXT PRIMARY KEY,
    customer_id        TEXT NOT NULL,
    first_name         TEXT,
    middle_name        TEXT,
    last_name          TEXT,
    suffix             TEXT,
    dob                TEXT,
    ssn_last4          TEXT,
    preferred_language TEXT,
    addresses          TEXT NOT NULL DEFAULT '[]',
    emails             TEXT NOT NULL DEFAULT '[]',
    phones             TEXT NOT NULL DEFAULT '[]',
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS engagements (
    id          TEXT PRIMARY KEY,
    person_id   TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    program     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at  TEXT NOT NULL
  );

  -- household-service replica -----------------------------------------------
  CREATE TABLE IF NOT EXISTS households (
    id          TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS household_members (
    id                   TEXT PRIMARY KEY,
    household_id         TEXT NOT NULL REFERENCES households(id),
    person_id            TEXT NOT NULL,
    role                 TEXT NOT NULL,
    relationship_to_head TEXT,
    start_date           TEXT NOT NULL,
    created_at           TEXT NOT NULL,
    UNIQUE (household_id, person_id)
  );

  -- medicaid-ee-service replica ---------------------------------------------
  CREATE TABLE IF NOT EXISTS medicaid_ee_cases (
    id                          TEXT PRIMARY KEY,
    customer_id                 TEXT NOT NULL,
    case_number                 TEXT,
    case_type                   TEXT NOT NULL DEFAULT 'INITIAL',
    status                      TEXT NOT NULL,
    status_reason               TEXT,
    notes                       TEXT,
    flag_reason                 TEXT,
    intake_data                 TEXT,
    rule_evaluations            TEXT,
    rfi_details                 TEXT,
    document_id                 TEXT,
    household_id                TEXT NOT NULL,
    applicant_person_id         TEXT NOT NULL,
    linked_case_id              TEXT,
    case_assist_narrative       TEXT,
    case_assist_narrative_source TEXT,
    case_assist_rec_ids         TEXT,
    income_verification         TEXT,
    asset_verification          TEXT,
    created_at                  TEXT NOT NULL,
    updated_at                  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS medicaid_ee_determinations (
    id                 TEXT PRIMARY KEY,
    customer_id        TEXT NOT NULL,
    case_id            TEXT NOT NULL REFERENCES medicaid_ee_cases(id),
    person_id          TEXT,
    coverage_group     TEXT,
    status             TEXT NOT NULL,
    category           TEXT NOT NULL,
    effective_date     TEXT,
    expiration_date    TEXT,
    denial_reason      TEXT,
    notes              TEXT,
    determined_at      TEXT,
    determined_by      TEXT,
    notice_document_id TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS medicaid_audit_log (
    id            TEXT PRIMARY KEY,
    timestamp     TEXT NOT NULL,
    service_id    TEXT NOT NULL,
    event_type    TEXT NOT NULL,
    actor_id      TEXT NOT NULL,
    customer_id   TEXT NOT NULL,
    action        TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id   TEXT NOT NULL,
    outcome       TEXT NOT NULL,
    trace_id      TEXT,
    metadata      TEXT
  );
  CREATE INDEX IF NOT EXISTS medicaid_audit_log_resource_idx ON medicaid_audit_log(resource_id, timestamp);

  -- document-service replica (metadata; bytes stored under <data dir>/uploads/) --
  CREATE TABLE IF NOT EXISTS documents (
    id                TEXT PRIMARY KEY,
    customer_id       TEXT NOT NULL,
    owner_id          TEXT NOT NULL,
    file_name         TEXT NOT NULL,
    mime_type         TEXT NOT NULL,
    file_type         TEXT NOT NULL,
    document_purpose  TEXT NOT NULL,
    sensitivity_level TEXT NOT NULL,
    retention_policy  TEXT NOT NULL,
    size_bytes        INTEGER NOT NULL,
    program           TEXT NOT NULL,
    program_id        TEXT,
    s3_key            TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'PENDING_UPLOAD',
    checksum_sha256   TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );
`);

// Additive migrations for databases created before a column existed.
export function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
// SQLite disallows UNIQUE in ADD COLUMN — enforce via a separate index instead.
ensureColumn("drafts", "external_ref", "external_ref TEXT");
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS drafts_external_ref_idx ON drafts(external_ref)`);
// Applicant's resolution choice, captured inside the hosted Verify Assist flow.
ensureColumn("verifications", "resolution", "resolution TEXT");
// Real-sandbox mode: CLEAR's own hosted-UI URL. hosted_url points at the
// Verify Assist flow app; the flow app redirects out to this mid-flow.
ensureColumn("verifications", "clear_hosted_url", "clear_hosted_url TEXT");
// Captured verification images (JSON). Staff-only: exposed exclusively on the
// admin detail read.
ensureColumn("verifications", "images", "images TEXT");
// The E&E case this verification was linked to at createMedicaidEeCase time.
ensureColumn("verifications", "case_id", "case_id TEXT");
db.exec(`CREATE INDEX IF NOT EXISTS verifications_case_id_idx ON verifications(case_id)`);
// Verify Assist proof of disenrollment → stored document (bytes on disk under uploads/).
ensureColumn("verifications", "proof_document_id", "proof_document_id TEXT");
ensureColumn("documents", "verification_id", "verification_id TEXT");
ensureColumn("documents", "case_id", "case_id TEXT");
ensureColumn("documents", "document_category", "document_category TEXT");
ensureColumn("medicaid_ee_cases", "case_assist_narrative_source", "case_assist_narrative_source TEXT");
ensureColumn("medicaid_ee_cases", "case_assist_rec_ids", "case_assist_rec_ids TEXT");

export function now(): string {
  return new Date().toISOString();
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function fromJson<T>(raw: string | null | undefined): T | null {
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Zero-padded monotonically increasing counter, e.g. application external refs.
export function nextCounter(name: string): number {
  const row = db
    .prepare(
      `INSERT INTO counters (name, value) VALUES (?, 1)
       ON CONFLICT(name) DO UPDATE SET value = value + 1
       RETURNING value`,
    )
    .get(name) as { value: number };
  return row.value;
}
