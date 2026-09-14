import { randomUUID } from "node:crypto";
import { CUSTOMER_ID } from "../config.js";
import { db, now } from "../db.js";
import { getPerson } from "./persons.js";

/** household-service replica. */

export type HouseholdMemberRole = "HEAD" | "SPOUSE" | "CHILD" | "OTHER_ADULT" | "OTHER_DEPENDENT";
export const HOUSEHOLD_MEMBER_ROLES: readonly HouseholdMemberRole[] = [
  "HEAD",
  "SPOUSE",
  "CHILD",
  "OTHER_ADULT",
  "OTHER_DEPENDENT",
];

export interface HouseholdMemberInput {
  personId: string;
  role: HouseholdMemberRole;
  relationshipToHead?: string | null;
  startDate: string;
}

interface HouseholdRow {
  id: string;
  customer_id: string;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  id: string;
  household_id: string;
  person_id: string;
  role: HouseholdMemberRole;
  relationship_to_head: string | null;
  start_date: string;
  created_at: string;
}

export interface HouseholdMember {
  id: string;
  householdId: string;
  personId: string;
  role: HouseholdMemberRole;
  relationshipToHead: string | null;
  startDate: string;
}

export interface Household {
  id: string;
  customerId: string;
  createdAt: string;
  updatedAt: string;
}

export class HouseholdError extends Error {
  constructor(
    public code: "NOT_FOUND" | "DUPLICATE_SSN" | "INVALID_INPUT" | "CONFLICT" | "UNAUTHORIZED",
    message: string,
    public field: string | null = null,
  ) {
    super(message);
  }
}

function toHousehold(row: HouseholdRow): Household {
  return { id: row.id, customerId: row.customer_id, createdAt: row.created_at, updatedAt: row.updated_at };
}

function toMember(row: MemberRow): HouseholdMember {
  return {
    id: row.id,
    householdId: row.household_id,
    personId: row.person_id,
    role: row.role,
    relationshipToHead: row.relationship_to_head,
    startDate: row.start_date,
  };
}

export function getHousehold(id: string): Household | null {
  const row = db.prepare(`SELECT * FROM households WHERE id = ?`).get(id) as HouseholdRow | undefined;
  return row ? toHousehold(row) : null;
}

export function householdMembers(householdId: string): HouseholdMember[] {
  const rows = db
    .prepare(
      `SELECT * FROM household_members WHERE household_id = ?
       ORDER BY CASE role WHEN 'HEAD' THEN 0 ELSE 1 END, created_at`,
    )
    .all(householdId) as MemberRow[];
  return rows.map(toMember);
}

export function listHouseholds(page: number, limit: number): { rows: Household[]; total: number } {
  const total = (db.prepare(`SELECT COUNT(*) n FROM households`).get() as { n: number }).n;
  const rows = db
    .prepare(`SELECT * FROM households ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(limit, (page - 1) * limit) as HouseholdRow[];
  return { rows: rows.map(toHousehold), total };
}

function validateMember(m: HouseholdMemberInput): void {
  if (!m.personId) throw new HouseholdError("INVALID_INPUT", "personId is required", "personId");
  if (!HOUSEHOLD_MEMBER_ROLES.includes(m.role)) throw new HouseholdError("INVALID_INPUT", "Unknown member role", "role");
  if (!getPerson(m.personId)) throw new HouseholdError("NOT_FOUND", "Person not found", "personId");
}

function insertMember(householdId: string, m: HouseholdMemberInput): HouseholdMember {
  const row: MemberRow = {
    id: randomUUID(),
    household_id: householdId,
    person_id: m.personId,
    role: m.role,
    relationship_to_head: m.relationshipToHead ?? null,
    start_date: m.startDate || now(),
    created_at: now(),
  };
  db.prepare(
    `INSERT INTO household_members (id, household_id, person_id, role, relationship_to_head, start_date, created_at)
     VALUES (@id, @household_id, @person_id, @role, @relationship_to_head, @start_date, @created_at)`,
  ).run(row);
  return toMember(row);
}

export function createHousehold(members: HouseholdMemberInput[]): Household {
  if (!Array.isArray(members) || members.length === 0) {
    throw new HouseholdError("INVALID_INPUT", "At least one member is required", "members");
  }
  for (const m of members) validateMember(m);
  const seen = new Set<string>();
  for (const m of members) {
    if (seen.has(m.personId)) throw new HouseholdError("CONFLICT", "Duplicate member personId", "members");
    seen.add(m.personId);
  }
  const at = now();
  const row: HouseholdRow = { id: randomUUID(), customer_id: CUSTOMER_ID, created_at: at, updated_at: at };
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO households (id, customer_id, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(
      row.id,
      row.customer_id,
      row.created_at,
      row.updated_at,
    );
    for (const m of members) insertMember(row.id, m);
  });
  tx();
  return toHousehold(row);
}

export function addHouseholdMember(householdId: string, m: HouseholdMemberInput): Household {
  const hh = getHousehold(householdId);
  if (!hh) throw new HouseholdError("NOT_FOUND", "Household not found", "householdId");
  validateMember(m);
  const existing = db
    .prepare(`SELECT id FROM household_members WHERE household_id = ? AND person_id = ?`)
    .get(householdId, m.personId);
  if (existing) throw new HouseholdError("CONFLICT", "Person is already a member of this household", "personId");
  insertMember(householdId, m);
  db.prepare(`UPDATE households SET updated_at = ? WHERE id = ?`).run(now(), householdId);
  return getHousehold(householdId)!;
}

export function removeHouseholdMember(householdId: string, personId: string): Household {
  const hh = getHousehold(householdId);
  if (!hh) throw new HouseholdError("NOT_FOUND", "Household not found", "householdId");
  const res = db
    .prepare(`DELETE FROM household_members WHERE household_id = ? AND person_id = ?`)
    .run(householdId, personId);
  if (res.changes === 0) throw new HouseholdError("NOT_FOUND", "Member not found in household", "personId");
  db.prepare(`UPDATE households SET updated_at = ? WHERE id = ?`).run(now(), householdId);
  return getHousehold(householdId)!;
}

/** True when `personId` is the HEAD (or any member) of the household. */
export function isHouseholdMember(householdId: string, personId: string): boolean {
  return Boolean(
    db.prepare(`SELECT 1 FROM household_members WHERE household_id = ? AND person_id = ?`).get(householdId, personId),
  );
}
