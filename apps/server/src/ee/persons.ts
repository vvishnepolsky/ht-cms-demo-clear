import { randomUUID } from "node:crypto";
import { CUSTOMER_ID } from "../config.js";
import { db, fromJson, now, toJson } from "../db.js";

/**
 * identity-service replica: Person records. SSNs are never stored in full —
 * only the last four digits survive (`ssn_last4`).
 */

export interface AddressInput {
  use: string;
  type: string;
  line: string[];
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isPrimary?: boolean | null;
}

export interface PhoneInput {
  use: string;
  value: string;
  isPrimary?: boolean | null;
}

export interface EmailInput {
  value: string;
}

export interface PersonInput {
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  suffix?: string | null;
  preferredLanguage?: string | null;
  dateOfBirth?: string | null;
  ssn?: string | null;
  ssnLast4?: string | null;
  addresses?: AddressInput[] | null;
  phones?: PhoneInput[] | null;
  emails?: EmailInput[] | null;
}

export interface PersonRow {
  id: string;
  customer_id: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  dob: string | null;
  ssn_last4: string | null;
  preferred_language: string | null;
  addresses: string;
  emails: string;
  phones: string;
  created_at: string;
  updated_at: string;
}

export interface Person {
  personId: string;
  customerId: string;
  status: "ACTIVE";
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  suffix: string | null;
  preferredName: string | null;
  dateOfBirth: string | null;
  preferredLanguage: string | null;
  ssnLast4: string | null;
  addresses: Array<AddressInput & { isPrimary: boolean }>;
  phones: Array<PhoneInput & { isPrimary: boolean }>;
  emails: EmailInput[];
  createdAt: string;
  updatedAt: string;
}

export function toPerson(row: PersonRow): Person {
  return {
    personId: row.id,
    customerId: row.customer_id,
    status: "ACTIVE",
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    suffix: row.suffix,
    preferredName: null,
    dateOfBirth: row.dob,
    preferredLanguage: row.preferred_language,
    ssnLast4: row.ssn_last4,
    addresses: (fromJson<AddressInput[]>(row.addresses) ?? []).map((a) => ({ ...a, isPrimary: a.isPrimary ?? false })),
    phones: (fromJson<PhoneInput[]>(row.phones) ?? []).map((p) => ({ ...p, isPrimary: p.isPrimary ?? false })),
    emails: fromJson<EmailInput[]>(row.emails) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getPersonRow(id: string): PersonRow | undefined {
  return db.prepare(`SELECT * FROM persons WHERE id = ?`).get(id) as PersonRow | undefined;
}

export function getPerson(id: string): Person | null {
  const row = getPersonRow(id);
  return row ? toPerson(row) : null;
}

function last4(ssn: string | null | undefined, explicit: string | null | undefined): string | null {
  if (explicit && /^\d{4}$/.test(explicit)) return explicit;
  const digits = (ssn ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function sanitizeAddresses(list: AddressInput[] | null | undefined): AddressInput[] {
  if (!Array.isArray(list)) return [];
  return list.map((a) => ({
    use: a.use,
    type: a.type,
    line: Array.isArray(a.line) ? a.line.filter((l) => typeof l === "string") : [],
    city: a.city ?? "",
    state: a.state ?? "",
    postalCode: a.postalCode ?? "",
    country: a.country ?? "US",
    isPrimary: a.isPrimary ?? false,
  }));
}

export function createPerson(input: PersonInput & { personId?: string }): Person {
  const at = now();
  const row: PersonRow = {
    id: input.personId ?? randomUUID(),
    customer_id: CUSTOMER_ID,
    first_name: input.firstName ?? null,
    middle_name: input.middleName ?? null,
    last_name: input.lastName ?? null,
    suffix: input.suffix ?? null,
    dob: input.dateOfBirth ?? null,
    ssn_last4: last4(input.ssn, input.ssnLast4),
    preferred_language: input.preferredLanguage ?? null,
    addresses: toJson(sanitizeAddresses(input.addresses)),
    emails: toJson(Array.isArray(input.emails) ? input.emails.map((e) => ({ value: e.value })) : []),
    phones: toJson(
      Array.isArray(input.phones)
        ? input.phones.map((p) => ({ use: p.use, value: p.value, isPrimary: p.isPrimary ?? false }))
        : [],
    ),
    created_at: at,
    updated_at: at,
  };
  db.prepare(
    `INSERT INTO persons (id, customer_id, first_name, middle_name, last_name, suffix, dob, ssn_last4, preferred_language,
       addresses, emails, phones, created_at, updated_at)
     VALUES (@id, @customer_id, @first_name, @middle_name, @last_name, @suffix, @dob, @ssn_last4, @preferred_language,
       @addresses, @emails, @phones, @created_at, @updated_at)`,
  ).run(row);
  return toPerson(row);
}

/** Partial update: only fields present (non-undefined) on the input are written. */
export function updatePerson(personId: string, input: PersonInput): Person | null {
  const row = getPersonRow(personId);
  if (!row) return null;
  const next: PersonRow = { ...row, updated_at: now() };
  if (input.firstName !== undefined) next.first_name = input.firstName;
  if (input.lastName !== undefined) next.last_name = input.lastName;
  if (input.middleName !== undefined) next.middle_name = input.middleName;
  if (input.suffix !== undefined) next.suffix = input.suffix;
  if (input.preferredLanguage !== undefined) next.preferred_language = input.preferredLanguage;
  if (input.dateOfBirth !== undefined) next.dob = input.dateOfBirth;
  if (input.ssn !== undefined || input.ssnLast4 !== undefined) {
    const l4 = last4(input.ssn, input.ssnLast4);
    if (l4) next.ssn_last4 = l4;
  }
  if (input.addresses !== undefined && input.addresses !== null) next.addresses = toJson(sanitizeAddresses(input.addresses));
  if (input.emails !== undefined && input.emails !== null) next.emails = toJson(input.emails.map((e) => ({ value: e.value })));
  if (input.phones !== undefined && input.phones !== null) {
    next.phones = toJson(input.phones.map((p) => ({ use: p.use, value: p.value, isPrimary: p.isPrimary ?? false })));
  }
  db.prepare(
    `UPDATE persons SET first_name = @first_name, middle_name = @middle_name, last_name = @last_name, suffix = @suffix,
       dob = @dob, ssn_last4 = @ssn_last4, preferred_language = @preferred_language, addresses = @addresses,
       emails = @emails, phones = @phones, updated_at = @updated_at
     WHERE id = @id`,
  ).run(next);
  return toPerson(next);
}

/** Every account is also a Person with `personId === user.id` (identity-service parity). */
export function ensurePersonForUser(user: { id: string; email: string; firstName: string; lastName: string }): Person {
  const existing = getPerson(user.id);
  if (existing) return existing;
  return createPerson({
    personId: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    emails: [{ value: user.email }],
  });
}

/** medicaid-ee `PersonRecord` projection (flattened address, policy/engagement ids). */
export function toPersonRecord(person: Person) {
  return {
    personId: person.personId,
    policyId: `pol_${person.personId}`,
    engagementId: `eng_${person.personId}`,
    customerId: person.customerId,
    firstName: person.firstName,
    lastName: person.lastName,
    middleName: person.middleName,
    suffix: person.suffix,
    preferredName: person.preferredName,
    dateOfBirth: person.dateOfBirth,
    preferredLanguage: person.preferredLanguage,
    ssnLast4: person.ssnLast4,
    addresses: person.addresses.map((a) => ({
      street: a.line.join(" ") || null,
      city: a.city || null,
      state: a.state || null,
      zip: a.postalCode || null,
    })),
    emails: person.emails.map((e) => ({ value: e.value })),
    phones: person.phones.map((p) => ({ value: p.value })),
  };
}

/**
 * Fill `ssn_last4` from a CLEAR-verified trait when the person row has none —
 * the resident never types an SSN once CLEAR verified it. Only the last four
 * digits are ever accepted; returns true when the row changed.
 */
export function setPersonSsnLast4IfEmpty(personId: string, ssnLast4: string | null | undefined): boolean {
  const l4 = typeof ssnLast4 === "string" ? ssnLast4.replace(/\D/g, "").slice(-4) : "";
  if (!/^\d{4}$/.test(l4)) return false;
  const row = getPersonRow(personId);
  if (!row || row.ssn_last4) return false;
  db.prepare(`UPDATE persons SET ssn_last4 = ?, updated_at = ? WHERE id = ?`).run(l4, now(), personId);
  return true;
}
