import { db, now, toJson } from "./db.js";

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  actorRole: string;
  action: string;
  subject: string;
  meta: Record<string, unknown>;
}

export function audit(
  actor: string,
  actorRole: string,
  action: string,
  subject: string,
  meta: Record<string, unknown> = {},
): void {
  db.prepare(
    `INSERT INTO audit_log (at, actor, actor_role, action, subject, meta) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(now(), actor, actorRole, action, subject, toJson(meta));
}

interface AuditRow {
  id: number;
  at: string;
  actor: string;
  actor_role: string;
  action: string;
  subject: string;
  meta: string;
}

export function toAuditEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    actor: row.actor,
    actorRole: row.actor_role,
    action: row.action,
    subject: row.subject,
    meta: JSON.parse(row.meta) as Record<string, unknown>,
  };
}

export function recentAudit(limit: number): AuditEntry[] {
  const rows = db
    .prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`)
    .all(limit) as AuditRow[];
  return rows.map(toAuditEntry);
}

export function auditForSubject(subject: string, limit: number): AuditEntry[] {
  const rows = db
    .prepare(`SELECT * FROM audit_log WHERE subject = ? ORDER BY id DESC LIMIT ?`)
    .all(subject, limit) as AuditRow[];
  return rows.map(toAuditEntry);
}
