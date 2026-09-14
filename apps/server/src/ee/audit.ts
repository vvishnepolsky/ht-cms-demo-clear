import { nanoid } from "nanoid";
import { CUSTOMER_ID } from "../config.js";
import { db, fromJson, now, toJson } from "../db.js";

/**
 * medicaid-ee-service audit log replica. `metadata` is primitives-only on the
 * write side (mirrors @ht/audit-logger); the admin Activity Log renders
 * sentences from an allow-listed subset of keys.
 */

export const SERVICE_ID = "medicaid-ee-service";
export const SYSTEM_ACTOR = "system";

export type AuditActorType = "SYSTEM" | "CASEWORKER" | "APPLICANT";
export type AuditOutcome = "success" | "failure";
export type AuditMetadata = Record<string, string | number | boolean | null | undefined>;

export interface MedicaidAuditEntry {
  id: string;
  timestamp: string;
  serviceId: string;
  eventType: string;
  actorId: string;
  customerId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: AuditOutcome;
  traceId: string | null;
  metadata: Record<string, string | number | boolean> | null;
}

interface Row {
  id: string;
  timestamp: string;
  service_id: string;
  event_type: string;
  actor_id: string;
  customer_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  outcome: AuditOutcome;
  trace_id: string | null;
  metadata: string | null;
}

function toEntry(row: Row): MedicaidAuditEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    serviceId: row.service_id,
    eventType: row.event_type,
    actorId: row.actor_id,
    customerId: row.customer_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    outcome: row.outcome,
    traceId: row.trace_id,
    metadata: fromJson<Record<string, string | number | boolean>>(row.metadata),
  };
}

function cleanMetadata(meta: AuditMetadata | undefined): Record<string, string | number | boolean> | null {
  if (!meta) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

export function medicaidAudit(entry: {
  eventType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  actorId: string;
  outcome?: AuditOutcome;
  metadata?: AuditMetadata;
}): MedicaidAuditEntry {
  const row: Row = {
    id: `audit_${nanoid(14)}`,
    timestamp: now(),
    service_id: SERVICE_ID,
    event_type: entry.eventType,
    actor_id: entry.actorId,
    customer_id: CUSTOMER_ID,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId,
    outcome: entry.outcome ?? "success",
    trace_id: null,
    metadata: toJson(cleanMetadata(entry.metadata)),
  };
  db.prepare(
    `INSERT INTO medicaid_audit_log (id, timestamp, service_id, event_type, actor_id, customer_id, action, resource_type,
       resource_id, outcome, trace_id, metadata)
     VALUES (@id, @timestamp, @service_id, @event_type, @actor_id, @customer_id, @action, @resource_type,
       @resource_id, @outcome, @trace_id, @metadata)`,
  ).run(row);
  return toEntry(row);
}

export interface AuditLogFilter {
  startDate: string;
  endDate: string;
  eventType?: string | null;
  actorId?: string | null;
  action?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  outcome?: AuditOutcome | null;
  serviceId?: string | null;
}

export function queryMedicaidAudit(
  filter: AuditLogFilter,
  page: number,
  limit: number,
): { entries: MedicaidAuditEntry[]; totalCount: number; hasNextPage: boolean } {
  const where: string[] = ["timestamp >= ?", "timestamp < ?"];
  const params: unknown[] = [filter.startDate, filter.endDate];
  const eq = (col: string, v: string | null | undefined) => {
    if (v) {
      where.push(`${col} = ?`);
      params.push(v);
    }
  };
  eq("event_type", filter.eventType);
  eq("actor_id", filter.actorId);
  eq("action", filter.action);
  eq("resource_type", filter.resourceType);
  eq("resource_id", filter.resourceId);
  eq("outcome", filter.outcome);
  const sqlWhere = where.join(" AND ");
  const totalCount = (
    db.prepare(`SELECT COUNT(*) n FROM medicaid_audit_log WHERE ${sqlWhere}`).get(...params) as { n: number }
  ).n;
  const rows = db
    .prepare(`SELECT * FROM medicaid_audit_log WHERE ${sqlWhere} ORDER BY timestamp DESC, rowid DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit) as Row[];
  return { entries: rows.map(toEntry), totalCount, hasNextPage: page * limit < totalCount };
}
