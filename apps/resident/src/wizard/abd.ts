/**
 * ABD (Aged, Blind, or Disabled) household predicate.
 *
 * Identifies household members who should be routed through the Non-MAGI
 * pathway (resources, Medicare/LTC). Pure functions only — no React, no
 * effects, no eligibility/build-intake coupling.
 *
 * A member is ABD if ANY of:
 *   1. Age 65 or older (primary applicant or applying household member).
 *   2. `demographics.disability === true` (primary) /
 *      `m.hasDisability === true` (applying household member).
 *   3. They receive SSI or SSDI (`otherIncome` entry whose `recipient`
 *      matches their id and `type` is SSI/SSDI).
 *   4. Their `workRequirements[id].exemptions` includes `'65plus'`,
 *      `'ssdi_ssi'`, or `'med_frail'`.
 *
 * Pregnancy is deliberately NOT an ABD trigger — pregnant applicants stay
 * on the MAGI pathway. Non-applying household members are never ABD.
 */

import { PRIMARY_APPLICANT_ID, INCOME_TYPE_SSI, INCOME_TYPE_SSDI } from './wizard-constants';
import { ageFrom } from './eligibility';

export type AbdReason =
  | 'aged'
  | 'disabled'
  | 'ssi'
  | 'ssdi'
  | 'exemption_65plus'
  | 'exemption_ssdi_ssi'
  | 'exemption_med_frail';

const ABD_EXEMPTIONS: ReadonlyArray<{ key: string; reason: AbdReason }> = [
  { key: '65plus', reason: 'exemption_65plus' },
  { key: 'ssdi_ssi', reason: 'exemption_ssdi_ssi' },
  { key: 'med_frail', reason: 'exemption_med_frail' },
];

export function reasonLabel(r: AbdReason): string {
  switch (r) {
    case 'aged':
      return 'Age 65 or older';
    case 'disabled':
      return 'Disability';
    case 'ssi':
      return 'Receives SSI';
    case 'ssdi':
      return 'Receives SSDI';
    case 'exemption_65plus':
      return 'Work-requirement exemption · 65+';
    case 'exemption_ssdi_ssi':
      return 'Work-requirement exemption · SSDI/SSI';
    case 'exemption_med_frail':
      return 'Work-requirement exemption · medically frail';
    default:
      return r;
  }
}

interface AbdMember {
  id: string;
  name: string;
  reasons: AbdReason[];
}

/** Minimal shape of wizard form data consumed by ABD predicates. */
interface WizardData {
  primaryApplicant?: { firstName?: string; lastName?: string; dob?: string };
  demographics?: { disability?: boolean; pregnant?: boolean };
  householdMembers?: Array<{
    id: string;
    firstName?: string;
    lastName?: string;
    applying?: boolean;
    dob?: string;
    hasDisability?: boolean;
  }>;
  otherIncome?: Array<{ recipient?: string; type?: string; kind?: string }>;
  workRequirements?: Record<string, { exemptions?: string[] }>;
}

type HouseholdMember = NonNullable<WizardData['householdMembers']>[number];

function nameOf(person: { firstName?: string; lastName?: string } | undefined, fallback: string): string {
  const first = person?.firstName ?? '';
  const last = person?.lastName ?? '';
  const full = `${first} ${last}`.trim();
  return full || fallback;
}

function ssIncomeReasonsFor(data: WizardData, personId: string): AbdReason[] {
  const other = Array.isArray(data?.otherIncome) ? data.otherIncome : [];
  const reasons: AbdReason[] = [];
  for (const e of other) {
    if (e?.recipient !== personId) continue;
    const t = String(e?.type ?? e?.kind ?? '').toLowerCase();
    if (t === INCOME_TYPE_SSI) reasons.push('ssi');
    else if (t === INCOME_TYPE_SSDI) reasons.push('ssdi');
  }
  return reasons;
}

function exemptionReasonsFor(data: WizardData, personId: string): AbdReason[] {
  const wr = data?.workRequirements?.[personId];
  const exemptions: string[] = Array.isArray(wr?.exemptions) ? wr.exemptions : [];
  const reasons: AbdReason[] = [];
  for (const { key, reason } of ABD_EXEMPTIONS) {
    if (exemptions.includes(key)) reasons.push(reason);
  }
  return reasons;
}

function reasonsForPrimary(data: WizardData): AbdReason[] {
  const primary = data?.primaryApplicant ?? {};
  const demographics = data?.demographics ?? {};
  const reasons: AbdReason[] = [];

  const age = ageFrom(primary.dob);
  if (age !== null && age !== undefined && age >= 65) reasons.push('aged');
  if (demographics.disability === true) reasons.push('disabled');

  for (const r of ssIncomeReasonsFor(data, PRIMARY_APPLICANT_ID)) reasons.push(r);
  for (const r of exemptionReasonsFor(data, PRIMARY_APPLICANT_ID)) reasons.push(r);

  return reasons;
}

function reasonsForMember(data: WizardData, m: HouseholdMember): AbdReason[] {
  const reasons: AbdReason[] = [];

  const age = ageFrom(m?.dob);
  if (age !== null && age !== undefined && age >= 65) reasons.push('aged');
  if (m?.hasDisability === true) reasons.push('disabled');

  for (const r of ssIncomeReasonsFor(data, m?.id)) reasons.push(r);
  for (const r of exemptionReasonsFor(data, m?.id)) reasons.push(r);

  return reasons;
}

/**
 * Returns the list of household members who trigger the ABD pathway.
 * Primary applicant first (id PRIMARY_APPLICANT_ID), then applying members
 * in their original household order. Non-applying members are skipped.
 */
export function abdMembers(data: WizardData): AbdMember[] {
  const out: AbdMember[] = [];
  const primary = data?.primaryApplicant ?? {};
  const primaryReasons = reasonsForPrimary(data);
  if (primaryReasons.length > 0) {
    out.push({
      id: PRIMARY_APPLICANT_ID,
      name: nameOf(primary, 'Primary applicant'),
      reasons: primaryReasons,
    });
  }

  const members = Array.isArray(data?.householdMembers) ? data.householdMembers : [];
  for (const m of members) {
    if (!m || m.applying !== true) continue;
    const reasons = reasonsForMember(data, m);
    if (reasons.length === 0) continue;
    out.push({
      id: m.id,
      name: nameOf(m, 'Member'),
      reasons,
    });
  }

  return out;
}

/**
 * True when any household member triggers the ABD pathway. Used as the
 * skip predicate for the Non-MAGI wizard steps and to decide whether to
 * render the NonMagiHandoffCard on review.
 */
export function isAbdHousehold(data: WizardData): boolean {
  return abdMembers(data).length > 0;
}
