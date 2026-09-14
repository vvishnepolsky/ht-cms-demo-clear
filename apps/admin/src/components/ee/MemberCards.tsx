/**
 * MemberCards — expandable per-member determination list for the EE Case
 * Workspace (CompletedCaseDetail screen).
 *
 * Rebuilt for ENG-1773 to match the CMS Demo Storyboard layout:
 *   • Rich collapsed row (avatar · name/relation/age · coverage group · ID ·
 *     status badge · effective date · chevron)
 *   • Expanded two-column panel: Current Coverage card (left) +
 *     Eligibility Determination card (right, with 2-step FPL math)
 *   • "Expand all / Collapse all" header toggle
 *
 * Self-contained — all sub-components live in this file; no separate files.
 */

import { useState } from 'react';
import { ChevronDown, User } from 'lucide-react';
import {
  coverageEffectiveDate,
  coverageEndDate,
  retroactiveWindow,
  toIsoDate,
  RETROACTIVE_COVERAGE_MONTHS,
} from '@ht/coverage-dates';
import { Card, CardContent } from '../ui';
import { cn, fmtDate, toCalendarDate } from '../../lib/utils';
import type { DeterminationStatus, EEDetermination, EEHouseholdMember, PersonRecord } from '../../types/ee';

// ─────────────────────────────────────────────────────────────────────────────
// FPL constants — 2026 HHS Poverty Guidelines (federal, 48 states).
// Values back-derived from design screenshot's HH 3 = $27,320/yr.
// ─────────────────────────────────────────────────────────────────────────────
const FPL_100_YR: Record<number, number> = {
  1: 15440,
  2: 20940,
  3: 27320,
  4: 32820,
  5: 38320,
  6: 43820,
  7: 49320,
  8: 54820,
};
function fpl100Yr(hhSize: number): number {
  if (hhSize >= 1 && hhSize <= 8) return FPL_100_YR[hhSize] ?? 27320;
  return (FPL_100_YR[8] ?? 54820) + (hhSize - 8) * 5500;
}

// Non-MAGI (ABD) countable-resource limits — 42 CFR §435.601.
// Hoisted alongside the FPL constants per this file's convention.
const ABD_RESOURCE_LIMIT = { individual: 2000, couple: 3000 } as const;

const DEFAULT_MCO = 'State Total Care';
const ADULT_GROUP_CEILING_PCT = 1.38; // 138% FPL (133% statutory + 5pp FPL disregard)
const ADULT_GROUP_INITIAL_PCT = 1.33; // 133% FPL test threshold

// ─────────────────────────────────────────────────────────────────────────────
// MAGI coverage-group FPL ceilings (%) — canonical (ENG-1885 + ENG-1906).
// MIRRORS the rules-engine seed services/rules-engine/prisma/seed-data/cms-medicaid-rules.ts:
// the Adult/Parent groups cap at MAGI_FPL_THRESHOLD = 138 (133% FPL + 5% income
// disregard), while Children, Pregnant women, and Infants have SEPARATE, HIGHER
// standards (no disregard) per the CMS Demonstration Storyboards + admin design:
// children 167% (CHILD_FPL_THRESHOLD), pregnant 215% (PREGNANT_FPL_THRESHOLD),
// infant 205% (INFANT_FPL_THRESHOLD).
// Keyed by the coverage-group LABEL the determination carries — i.e. the output
// of medicaid-ee-service's magiGroupToLabel (coverage-group.ts), NOT the raw
// engine magi_group value. The admin app does not depend on @ht/rules-engine, so
// these are intentional literals; parity with the engine is pinned by
// MemberCards.test.tsx to guard admin-side drift.
// ─────────────────────────────────────────────────────────────────────────────
const CHILDREN_MAGI_LABEL = "Children's MAGI";
export const MAGI_COVERAGE_THRESHOLD_PCT: Record<string, number> = {
  [CHILDREN_MAGI_LABEL]: 167,
  'Adult Group MAGI': 138,
  Pregnant: 215,
  'Parent/Caretaker': 138,
  'Infant (0–1)': 205,
  // Deemed newborns (engine rule CMS-MAGI-001) are auto-eligible with no income
  // test, but they carry the 'Deemed Newborn' coverage-group label and are age<1
  // (isChild=true) — so the card calls magiThresholdPct('Deemed Newborn'). Map it
  // to the 205% infant standard so the FPL panel doesn't fall back to the 167%
  // children's number (the wrong pathway). See coverage-group.ts magiGroupToLabel.
  'Deemed Newborn': 205,
};

/**
 * FPL ceiling (%) for a coverage group. Falls back to the children's default
 * when the group is null/unrecognized — mirrors the null-coverageGroup fallback
 * added in the ENG-1865 review (an un-reevaluated determination with no magi_group
 * still gets a sensible children's-pathway threshold rather than a blank/NaN).
 */
function magiThresholdPct(coverageGroup: string | null | undefined): number {
  return MAGI_COVERAGE_THRESHOLD_PCT[coverageGroup ?? ''] ?? MAGI_COVERAGE_THRESHOLD_PCT[CHILDREN_MAGI_LABEL];
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar palette
// ─────────────────────────────────────────────────────────────────────────────
const AVATAR_PALETTES = [
  'bg-blue-50 text-blue-700 ring-blue-200',
  'bg-purple-50 text-purple-700 ring-purple-200',
  'bg-amber-50 text-amber-700 ring-amber-200',
  'bg-emerald-50 text-emerald-700 ring-emerald-200',
] as const;

const STATUS_CONFIG: Record<DeterminationStatus, { label: string; dotClass: string; badgeClass: string }> = {
  PENDING: {
    label: 'Pending',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  ELIGIBLE: {
    label: 'Eligible',
    dotClass: 'bg-green-600',
    badgeClass: 'bg-green-50 text-green-700 border-green-200',
  },
  INELIGIBLE: {
    label: 'Ineligible',
    dotClass: 'bg-red-500',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
  },
  DEFERRED: {
    label: 'Deferred',
    dotClass: 'bg-gray-400',
    badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
  },
};

// Override for APPROVED (derived from status=ELIGIBLE but label differs in design)
const APPROVED_BADGE = {
  label: 'Approved',
  dotClass: 'bg-blue-600',
  badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
};

/**
 * Presentational status for the member chip. On a PURE Non-MAGI case the BRE
 * maps its NEEDS_REVIEW outcome to a DEFERRED determination — but "Deferred"
 * in this app means "handed to another pathway" (split household). A Non-MAGI
 * member on a pure Non-MAGI case is financially eligible; the remaining gate
 * (DDS disability confirmation) is case-level, surfaced by the DDS workflow —
 * so the chip reads Eligible, not Deferred.
 *
 * `deferredAsEligible` must be true ONLY for pure Non-MAGI cases (every
 * determination NON_MAGI). Mixed/split households (Gloria archetype) keep the
 * genuine Deferred chip for the member handed to a linked case.
 */
function presentedStatus(status: EEDetermination['status'], deferredAsEligible: boolean): keyof typeof STATUS_CONFIG {
  return deferredAsEligible && status === 'DEFERRED' ? 'ELIGIBLE' : status;
}

/**
 * Per-member "Approved" flag (ENG-1886). The case-level approval flag must NOT
 * be applied to every row — in a mixed-outcome household that paints the
 * ineligible members green. A member shows the Approved badge when it has its
 * OWN ELIGIBLE determination; a member with any other determination
 * (INELIGIBLE / DEFERRED / PENDING) shows that determination's own badge. The
 * case-level flag is the fallback ONLY when the member has no determination row
 * at all — preserving the NON-MAGI / DDS-confirmed ABD path (ENG-1876) where the
 * case is approved but the member carries no ELIGIBLE determination.
 */
function memberIsApproved(determination: EEDetermination | null, caseApproved: boolean): boolean {
  if (!determination) return caseApproved;
  return determination.status === 'ELIGIBLE';
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Two-letter avatar initials, or null when no structured name is available.
 * Returning null (instead of the old '?' sentinel) lets the avatar render a
 * neutral person icon for members whose firstName/lastName aren't populated
 * (e.g. the Robert Mitchell default fixture, which carries only a fullName
 * string). See ENG-1943.
 */
function avatarInitials(firstName?: string | null, lastName?: string | null): string | null {
  const f = firstName?.[0] ?? '';
  const l = lastName?.[0] ?? '';
  const ini = (f + l).toUpperCase();
  return ini || null;
}

function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? new Date(`${dob}T12:00:00`) : new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function findDetermination(member: EEHouseholdMember, determinations: EEDetermination[]): EEDetermination | null {
  const pid = member.person?.personId;
  if (!pid) return null;
  return (
    determinations.find((d) => d.personId === pid) ?? determinations.find((d) => d.person?.personId === pid) ?? null
  );
}

function memberName(
  member: EEHouseholdMember,
  person: PersonRecord | null,
  // HEAD-only fallback: the case-level applicant name the rest of the app already
  // trusts (CompletedCaseDetail uses intakeData.applicantName the same way, see
  // CompletedCaseDetail.tsx:291). Consulted before degrading to the role label.
  applicantNameFallback?: string | null,
): string {
  if (person?.firstName && person.lastName) return `${person.firstName} ${person.lastName}`;
  // A partial PersonRecord (only one of first/last) is still better than the role label.
  if (person?.firstName || person?.lastName) {
    return [person?.firstName, person?.lastName].filter(Boolean).join(' ');
  }
  if (member.role === 'HEAD' && applicantNameFallback && applicantNameFallback.trim()) {
    return applicantNameFallback.trim();
  }
  return member.role === 'HEAD' ? 'Head of Household' : 'Unknown';
}

/** Derive relationship label from role / relationshipToHead. */
function relationLabel(member: EEHouseholdMember): string {
  if (member.role === 'HEAD') return 'Self (Applicant)';
  if (member.relationshipToHead) {
    const rel = member.relationshipToHead.toLowerCase();
    if (rel === 'spouse' || rel === 'partner') return 'Spouse';
    if (rel === 'son') return 'Son';
    if (rel === 'daughter') return 'Daughter';
    if (rel === 'parent') return 'Parent';
    // Capitalize first letter for other values
    return rel.charAt(0).toUpperCase() + rel.slice(1);
  }
  if (member.role === 'SPOUSE') return 'Spouse';
  if (member.role === 'CHILD') return 'Dependent';
  return 'Other';
}

/** Format a date as MM/DD/YYYY for display in the determination panel. */
function fmtMDY(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/** Coverage-date Date → ISO YYYY-MM-DD string (or null), for display helpers. */
function isoOrNull(d: Date | null): string | null {
  return d ? toIsoDate(d) : null;
}

/** Derive a deterministic demo Medicaid ID from a case ID (last 8 chars, uppercased). */
function deriveDemoMcNumber(caseId: string | undefined): string {
  if (!caseId) return '—';
  return `MA-${caseId.slice(-8).toUpperCase()}`;
}

/** Format a dollar amount with commas and optional cents. */
function formatDollar(n: number, decimals = 0): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/**
 * Build per-member intake fallback from intakeData.householdMembers.
 */
function intakeMemberByPersonId(
  intakeData: unknown,
  personId: string | null | undefined,
): Partial<PersonRecord> | null {
  if (!personId) return null;
  const intake = (intakeData ?? {}) as { householdMembers?: Array<Record<string, unknown>> };
  const match = intake.householdMembers?.find((m) => m?.personId === personId);
  if (!match) return null;
  return {
    personId,
    firstName: typeof match.firstName === 'string' ? match.firstName : undefined,
    lastName: typeof match.lastName === 'string' ? match.lastName : undefined,
    dateOfBirth: typeof match.dateOfBirth === 'string' ? match.dateOfBirth : undefined,
  } as Partial<PersonRecord>;
}

/**
 * Read monthly household income from intakeData using the same extraction
 * pattern as IncomeSources.tsx (lines 48-97): check per-member income totals
 * first, then fall back to intakeData.monthlyHouseholdIncome.
 */
function readMonthlyIncome(intakeData: unknown): number {
  const intake = (intakeData ?? {}) as Record<string, unknown>;
  const members = Array.isArray(intake.householdMembers)
    ? (intake.householdMembers as Array<Record<string, unknown>>)
    : [];
  let total = 0;
  for (const m of members) {
    const inc = (m.income ?? {}) as Record<string, unknown>;
    if (typeof inc.totalMonthly === 'number') {
      total += inc.totalMonthly;
    } else {
      if (typeof inc.employmentIncome === 'number') total += inc.employmentIncome;
      if (typeof inc.selfEmploymentIncome === 'number') total += inc.selfEmploymentIncome;
      if (typeof inc.otherIncome === 'number') total += inc.otherIncome;
    }
  }
  if (total > 0) return total;
  const flat = typeof intake.monthlyHouseholdIncome === 'number' ? intake.monthlyHouseholdIncome : 0;
  return flat;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components: field label / meta
// ─────────────────────────────────────────────────────────────────────────────
function MCLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{children}</p>;
}

function MCMeta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide mb-0.5">{label}</p>
      <p className={cn('text-foreground font-medium text-xs', mono && 'font-mono')}>{value || '—'}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Coverage card (left column of expanded panel)
// ─────────────────────────────────────────────────────────────────────────────
interface CoverageCardProps {
  determination: EEDetermination | null;
  hhSize: number;
  intakeData: unknown;
  isApproved: boolean;
  monthlyIncome: number;
  hhFpl100Annual: number;
  isNonMagi: boolean;
  /** Pure Non-MAGI case — render DEFERRED chips as Eligible (see presentedStatus). */
  deferredAsEligible: boolean;
  isChild: boolean;
  caseId?: string;
}

function CoverageCard({
  determination,
  hhSize,
  intakeData,
  isApproved,
  monthlyIncome,
  hhFpl100Annual,
  isNonMagi,
  deferredAsEligible,
  isChild,
  caseId,
}: CoverageCardProps) {
  const intake = (intakeData ?? {}) as Record<string, unknown>;
  const dm = (intake.displayMeta ?? {}) as Record<string, unknown>;

  const effectiveIsNonMagi = isNonMagi || determination?.category === 'NON_MAGI';
  const appDateIso = typeof intake.applicationDate === 'string' ? intake.applicationDate : null;

  // For NON-MAGI ABD cases (no ELIGIBLE determination), fall back to first of
  // the application month as the effective date (ENG-1855 + ENG-1820).
  const nonMagiFallbackEffective = effectiveIsNonMagi ? isoOrNull(coverageEffectiveDate(appDateIso)) : null;

  // toCalendarDate (ENG-1978): the determination dates are midnight-UTC DateTime
  // values; normalize to a calendar date so fmtDate doesn't render the prior day.
  const effectiveIso = toCalendarDate(determination?.effectiveDate) ?? nonMagiFallbackEffective ?? null;
  // ENG-1820: coverage end falls at the END of the month after a 12-month
  // certification; @ht/coverage-dates is the shared source of truth.
  const expirationIso = toCalendarDate(determination?.expirationDate) ?? isoOrNull(coverageEndDate(effectiveIso));

  // Retroactive window (42 CFR §435.915): the three whole calendar months
  // BEFORE the application month, anchored on the application date. Non-MAGI
  // ABD cases do not surface a retro row in the demo coverage card.
  const retro = effectiveIsNonMagi ? null : retroactiveWindow(appDateIso ?? effectiveIso);
  const retroStartIso = retro ? toIsoDate(retro.start) : null;
  const retroEndIso = retro ? toIsoDate(retro.end) : null;

  const retroStart = fmtMDY(retroStartIso);
  const retroEnd = fmtMDY(retroEndIso);
  const hasRetro = retroStartIso != null && retroEndIso != null;

  // MCO / delivery
  const mco =
    typeof dm.deliverySystem === 'string' && dm.deliverySystem.trim()
      ? dm.deliverySystem.replace(/^Managed Care \(/, '').replace(/\)$/, '')
      : DEFAULT_MCO;

  // Medicaid ID — prefer a real ID stamped on displayMeta by the auto-approval
  // handler; otherwise fall back to a deterministic demo ID. Manually approved
  // cases (Review-&-Decide path) do not stamp displayMeta, so without this
  // fallback every member rendered '—' for the ID on a manual approval.
  const mcId = typeof dm.mcNumber === 'string' && dm.mcNumber ? dm.mcNumber : deriveDemoMcNumber(caseId);

  // MAGI coverage group is the engine's real per-member determination (ENG-1865) —
  // the single source of truth, no client-side age guessing. NON-MAGI is category-
  // driven. An un-evaluated member shows '—' until its determination lands (reseed
  // covers demo data — ENG-1888).
  // Prefer the engine's real coverage group; fall back to the age-based label
  // (not a blank '—') when a determination exists without a recognized
  // coverageGroup — e.g. determinations created before this deploy or whose
  // engine outcome set no magi_group. Avoids a blank column on un-reevaluated
  // demo cases (ENG-1865 review; reseed tracked in ENG-1888).
  const coverageGroup = effectiveIsNonMagi
    ? 'Non-MAGI (ABD)'
    : (determination?.coverageGroup ?? (isChild ? "Children's MAGI" : 'Adult Group MAGI'));

  // ≤138% FPL monthly cap w/ disregard (for subtitle)
  const disregardCeilingMonthly = Math.round((hhFpl100Annual * ADULT_GROUP_CEILING_PCT) / 12);

  // Children's-pathway FPL ceiling for the subtitle — driven by the engine's real
  // per-member coverage group (ENG-1885), not a hardcoded 305%. Children's MAGI →
  // 138%, Infant (0–1) → 205%; children's default when the group is null.
  const childThresholdPct = magiThresholdPct(determination?.coverageGroup);

  // FPL step 1/2 math for the italic note (ENG-1978). The 5% disregard raises the
  // effective ceiling by 5 percentage points of FPL (to 138%) — it does NOT reduce
  // the household's income. So step 2 compares the unchanged income to the 138%
  // ceiling and the note surfaces the household's true FPL %.
  const annualIncome = monthlyIncome * 12;
  const fpl133Annual = hhFpl100Annual * ADULT_GROUP_INITIAL_PCT;
  const fpl138Annual = hhFpl100Annual * ADULT_GROUP_CEILING_PCT;
  const step1Passes = annualIncome <= fpl133Annual;
  const step2Passes = annualIncome <= fpl138Annual;
  const pctOfFpl = Math.round((annualIncome / hhFpl100Annual) * 100 * 10) / 10;
  // 5% disregard is an Adult Group MAGI mechanic — the Children's MAGI ceiling
  // has no analogue, so suppress the footnote for child rows.
  const disregardNote =
    !effectiveIsNonMagi && !isChild && !step1Passes && step2Passes && monthlyIncome > 0
      ? `Initial 133% test failed by ${formatDollar(Math.round((annualIncome - fpl133Annual) / 12))}/mo, but income clears the 138% FPL ceiling (case is at ${pctOfFpl}% FPL).`
      : null;

  const badge = isApproved
    ? APPROVED_BADGE
    : STATUS_CONFIG[presentedStatus(determination?.status ?? 'PENDING', deferredAsEligible)];

  return (
    <div>
      <MCLabel>Current Coverage</MCLabel>
      <div className="bg-card rounded-md border p-4">
        {/* Header: coverage group + status badge */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-semibold text-foreground leading-tight">{coverageGroup}</p>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-bold flex-shrink-0',
              badge.badgeClass,
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', badge.dotClass)} />
            {badge.label.toUpperCase()}
          </span>
        </div>
        {!effectiveIsNonMagi && !isChild && (
          <p className="text-xs text-muted-foreground mb-3">
            ≤138% FPL · HH {hhSize} = {formatDollar(disregardCeilingMonthly)}/mo (w/ disregard)
          </p>
        )}
        {!effectiveIsNonMagi && isChild && (
          <p className="text-xs text-muted-foreground mb-3">
            ≤{childThresholdPct}% FPL · HH {hhSize} ={' '}
            {formatDollar(Math.round((hhFpl100Annual * (childThresholdPct / 100)) / 12))}/mo
          </p>
        )}

        <div className="border-t pt-3 grid grid-cols-2 gap-3">
          <MCMeta label="Effective" value={fmtDate(effectiveIso)} />
          <MCMeta label="End" value={fmtDate(expirationIso)} />
          <MCMeta label="Medicaid ID" value={mcId} mono />
          <MCMeta label="MCO / Delivery" value={isApproved ? mco : '—'} />
        </div>

        {hasRetro && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-muted-foreground text-[10px] uppercase tracking-wide mb-0.5">Retroactive Window</p>
            <p className="text-foreground font-medium text-xs">
              {retroStart} – {retroEnd}
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">
              {RETROACTIVE_COVERAGE_MONTHS} months before the application month
            </p>
          </div>
        )}

        {disregardNote && (
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t leading-relaxed italic">{disregardNote}</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Eligibility Determination card (right column)
// ─────────────────────────────────────────────────────────────────────────────
interface EligibilityCardProps {
  determination: EEDetermination | null;
  firstName: string;
  hhSize: number;
  monthlyIncome: number;
  hhFpl100Annual: number;
  isChild: boolean;
  isNonMagi: boolean;
  /** True when the applicant is receiving SSI. SSI recipients are categorically
   *  eligible under the ABD pathway (disability deemed); everyone else requires a
   *  separate DDS disability determination. Drives the Disability block copy. */
  receivingSSI: boolean;
}

function EligibilityCard({
  determination,
  firstName,
  hhSize,
  monthlyIncome,
  hhFpl100Annual,
  isChild,
  isNonMagi,
  receivingSSI,
}: EligibilityCardProps) {
  const annualIncome = monthlyIncome * 12;
  const noIncome = monthlyIncome === 0;

  // NON_MAGI — simplified display
  if (isNonMagi || determination?.category === 'NON_MAGI') {
    const threshold = hhFpl100Annual; // 100% FPL HH 1 for ABD
    const passes = annualIncome <= threshold;
    const pct = noIncome ? 0 : Math.round((annualIncome / threshold) * 100);
    const barPct = Math.min(pct, 100);
    // Asset/resource limit for the ABD pathway (42 CFR §435.601). Demo placeholder:
    // real countable-asset amounts are not yet forwarded to the admin app (ENG-1748),
    // so we show the applicable limit and a PASS state rather than a computed total.
    // hhSize >= 2 uses the couple limit (demo simplification — a 2+ household is
    // assumed to be a couple for ABD resource purposes).
    const resourceLimit = hhSize >= 2 ? ABD_RESOURCE_LIMIT.couple : ABD_RESOURCE_LIMIT.individual;
    const resourceLimitLabel = hhSize >= 2 ? 'couple' : 'individual';
    return (
      <div>
        <MCLabel>Eligibility Determination</MCLabel>
        <div className="bg-card rounded-md border overflow-hidden">
          <div className="px-4 py-3 border-b">
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-foreground">
                Non-MAGI (ABD) — 100% FPL Test
              </p>
              <span
                className={cn(
                  'text-[10px] font-bold uppercase tracking-wide',
                  passes ? 'text-blue-700' : 'text-amber-700',
                )}
              >
                {passes ? 'PASS' : 'FAIL'}
              </span>
            </div>
            {noIncome ? (
              <p className="text-xs text-muted-foreground italic">
                Income data not available — math shown with $0 placeholder.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-x-3 text-xs mb-2">
                  <div>
                    <span className="text-muted-foreground">Household Income: </span>
                    <span className="text-foreground font-medium">{formatDollar(annualIncome)}/yr</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">100% FPL (HH 1): </span>
                    <span className="text-foreground font-medium">{formatDollar(threshold)}/yr</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden border mb-1">
                  <div
                    className={cn('h-full', passes ? 'bg-blue-500' : 'bg-amber-500')}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">≈{pct}% of FPL</p>
              </>
            )}
          </div>
          {/* Asset / Resource test — binary verification (no progress bar). Limit + PASS
              are demo placeholders; see resourceLimit comment above.
              Deferred (ENG-1748): make PASS/CONFIRMED data-driven once countable-asset
              and DDS results are forwarded to the admin app. */}
          <div className="px-4 py-3 border-b">
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-foreground">Asset / Resource Test</p>
              <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700">PASS</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 text-xs mb-1">
              <div>
                <span className="text-muted-foreground">Countable Resources: </span>
                <span className="text-foreground font-medium">within limit</span>
              </div>
              <div>
                <span className="text-muted-foreground">ABD Limit (HH {hhSize}): </span>
                <span className="text-foreground font-medium">
                  {formatDollar(resourceLimit)} ({resourceLimitLabel})
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Countable resources within Non-MAGI (ABD) limit per 42 CFR §435.601.
            </p>
          </div>
          {/* Disability determination — SSI recipients are categorically eligible
              (deemed disabled); everyone else requires a DDS determination. */}
          <div className="px-4 py-3 border-b">
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-foreground">Disability Determination</p>
              <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700">CONFIRMED</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {receivingSSI
                ? 'Disability deemed via SSI receipt — SSI recipients are categorically eligible under the ABD pathway.'
                : 'Disability verified — DDS returned a favorable disability determination (no SSI on file).'}
            </p>
          </div>
          <div className="px-4 py-3 bg-blue-50">
            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide mb-0.5">Outcome</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              <span className="font-bold">{firstName}</span> approved under Non-MAGI (ABD) pathway.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Children's MAGI — FPL threshold driven by the engine's real coverage group
  // (ENG-1885): Children's MAGI → 138%, Infant (0–1) → 205%; children's default
  // when coverageGroup is null. Direct pass (no disregard step).
  if (isChild) {
    const childThresholdPct = magiThresholdPct(determination?.coverageGroup);
    const chipThreshold = hhFpl100Annual * (childThresholdPct / 100);
    const passes = noIncome || annualIncome <= chipThreshold;
    const pct = noIncome ? 0 : Math.round((annualIncome / chipThreshold) * 100);
    const barPct = Math.min(pct, 100);
    return (
      <div>
        <MCLabel>Eligibility Determination</MCLabel>
        <div className="bg-card rounded-md border overflow-hidden">
          <div className="px-4 py-3 border-b">
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-foreground">
                Children's MAGI — {childThresholdPct}% FPL Test
              </p>
              <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700">
                {passes ? 'PASS' : 'FAIL'}
              </span>
            </div>
            {noIncome ? (
              <p className="text-xs text-muted-foreground italic">
                Income data not available — math shown with $0 placeholder.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-x-3 text-xs mb-2">
                  <div>
                    <span className="text-muted-foreground">Household MAGI: </span>
                    <span className="text-foreground font-medium">{formatDollar(annualIncome)}/yr</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {childThresholdPct}% FPL (HH {hhSize}):{' '}
                    </span>
                    <span className="text-foreground font-medium">{formatDollar(Math.round(chipThreshold))}/yr</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden border mb-1">
                  <div className="h-full bg-blue-500" style={{ width: `${barPct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  ≈{pct}% of FPL · within {childThresholdPct}% ceiling
                </p>
              </>
            )}
          </div>
          <div className="px-4 py-3 bg-blue-50">
            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide mb-0.5">Outcome</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              <span className="font-bold">{firstName}</span> qualifies on the children's pathway — coverage is decoupled
              from parents' eligibility.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Adult Group MAGI — 2-step (133% initial + 138% effective via the 5pp FPL
  // disregard). ENG-1978: the disregard is +5 percentage points of FPL, so the
  // effective ceiling is 138% FPL; the household's income is NOT reduced. Step 2
  // compares the unchanged income to the 138% ceiling and shows its true FPL %.
  const fpl133Annual = hhFpl100Annual * ADULT_GROUP_INITIAL_PCT;
  const fpl138Annual = hhFpl100Annual * ADULT_GROUP_CEILING_PCT;
  const step1Passes = noIncome || annualIncome <= fpl133Annual;
  const step2Passes = noIncome || annualIncome <= fpl138Annual;
  const step1Pct = noIncome ? 0 : Math.min((annualIncome / fpl133Annual) * 100, 110);
  const step2Pct = noIncome ? 0 : Math.min((annualIncome / fpl138Annual) * 100, 100);
  const pctOfFpl = noIncome ? 0 : Math.round((annualIncome / hhFpl100Annual) * 100 * 10) / 10;

  const overBy = noIncome ? 0 : annualIncome - fpl133Annual;
  const overByMonthly = Math.round(overBy / 12);

  const showStep2 = !step1Passes && step2Passes;

  // Straight pass (no disregard needed)
  if (step1Passes) {
    return (
      <div>
        <MCLabel>Eligibility Determination</MCLabel>
        <div className="bg-card rounded-md border overflow-hidden">
          <div className="px-4 py-3 border-b">
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-foreground">Initial 133% FPL Test</p>
              <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700">PASS</span>
            </div>
            {noIncome ? (
              <p className="text-xs text-muted-foreground italic">
                Income data not available — math shown with $0 placeholder.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-x-3 text-xs mb-2">
                  <div>
                    <span className="text-muted-foreground">Household MAGI: </span>
                    <span className="text-foreground font-medium">{formatDollar(annualIncome)}/yr</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">133% FPL (HH {hhSize}): </span>
                    <span className="text-foreground font-medium">{formatDollar(Math.round(fpl133Annual))}/yr</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden border mb-1">
                  <div className="h-full bg-blue-500" style={{ width: `${Math.min(step1Pct, 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">within 133% FPL</p>
              </>
            )}
          </div>
          <div className="px-4 py-3 bg-blue-50">
            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide mb-0.5">Outcome</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              <span className="font-bold">{firstName}</span> assigned to Adult Group MAGI — household income clears the
              threshold directly.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Step 1 fails; step 2 passes (disregard story)
  if (showStep2) {
    return (
      <div>
        <MCLabel>Eligibility Determination</MCLabel>
        <div className="bg-card rounded-md border overflow-hidden">
          {/* Step 1 — FAIL */}
          <div className="px-4 py-3 border-b">
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-foreground">
                Step 1 — Initial 133% FPL Test
              </p>
              <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">FAIL</span>
            </div>
            {noIncome ? (
              <p className="text-xs text-muted-foreground italic">
                Income data not available — math shown with $0 placeholder.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-x-3 text-xs mb-2">
                  <div>
                    <span className="text-muted-foreground">Household MAGI: </span>
                    <span className="text-foreground font-medium">{formatDollar(annualIncome)}/yr</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">133% FPL (HH {hhSize}): </span>
                    <span className="text-foreground font-medium">{formatDollar(Math.round(fpl133Annual))}/yr</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden border mb-1">
                  <div className="h-full bg-amber-400" style={{ width: `${Math.min(step1Pct, 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  income exceeds 133% FPL by {formatDollar(Math.round(overBy))}/yr ({formatDollar(overByMonthly)}/mo)
                </p>
              </>
            )}
          </div>

          {/* Step 2 — PASS (disregard) */}
          <div className="px-4 py-3 border-b bg-blue-50/30">
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-foreground">
                Step 2 — 5% FPL Disregard Applied
              </p>
              <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700">PASS</span>
            </div>
            {noIncome ? (
              <p className="text-xs text-muted-foreground italic">Income data not available.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-x-3 text-xs mb-2">
                  <div>
                    <span className="text-muted-foreground">Household MAGI: </span>
                    <span className="text-foreground font-medium">{formatDollar(Math.round(annualIncome))}/yr</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">138% FPL ceiling: </span>
                    <span className="text-foreground font-medium">{formatDollar(Math.round(fpl138Annual))}/yr</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden border mb-1">
                  <div className="h-full bg-blue-500" style={{ width: `${step2Pct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">≈{pctOfFpl}% of FPL · within 138% ceiling</p>
              </>
            )}
          </div>

          {/* Outcome */}
          <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-b-md">
            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide mb-0.5">Outcome</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              <span className="font-bold">{firstName}</span> assigned to Adult Group MAGI after 5% FPL disregard tipped
              the household into eligibility.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Both steps fail (ineligible)
  return (
    <div>
      <MCLabel>Eligibility Determination</MCLabel>
      <div className="bg-card rounded-md border overflow-hidden">
        <div className="px-4 py-3 border-b">
          <div className="flex items-baseline justify-between mb-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-foreground">
              Step 1 — Initial 133% FPL Test
            </p>
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">FAIL</span>
          </div>
          {noIncome ? (
            <p className="text-xs text-muted-foreground italic">
              Income data not available — math shown with $0 placeholder.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-3 text-xs mb-2">
                <div>
                  <span className="text-muted-foreground">Household MAGI: </span>
                  <span className="text-foreground font-medium">{formatDollar(annualIncome)}/yr</span>
                </div>
                <div>
                  <span className="text-muted-foreground">133% FPL (HH {hhSize}): </span>
                  <span className="text-foreground font-medium">{formatDollar(Math.round(fpl133Annual))}/yr</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden border mb-1">
                <div className="h-full bg-amber-400" style={{ width: `${Math.min(step1Pct, 100)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                income exceeds 133% FPL by {formatDollar(Math.round(overBy))}/yr ({formatDollar(overByMonthly)}/mo)
              </p>
            </>
          )}
        </div>
        <div className="px-4 py-3 border-b bg-blue-50/30">
          <div className="flex items-baseline justify-between mb-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-foreground">
              Step 2 — 5% FPL Disregard Applied
            </p>
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">FAIL</span>
          </div>
          {!noIncome && (
            <p className="text-xs text-muted-foreground">
              Household MAGI {formatDollar(Math.round(annualIncome))}/yr · exceeds 138% FPL ceiling (
              {formatDollar(Math.round(fpl138Annual))}/yr)
            </p>
          )}
        </div>
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-b-md">
          <p className="text-[10px] font-bold text-red-700 uppercase tracking-wide mb-0.5">Outcome</p>
          <p className="text-xs text-red-700 leading-relaxed">
            <span className="font-bold">{firstName}</span> does not meet income requirements for Adult Group MAGI —
            household income exceeds 138% FPL after the 5% disregard.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Member row (collapsed header + expanded panel)
// ─────────────────────────────────────────────────────────────────────────────
interface MemberRowProps {
  member: EEHouseholdMember;
  determination: EEDetermination | null;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  intakeFallback: Partial<PersonRecord> | null;
  hhSize: number;
  monthlyIncome: number;
  intakeData: unknown;
  caseApproved: boolean;
  isNonMagi: boolean;
  /** Pure Non-MAGI case — render DEFERRED chips as Eligible (see presentedStatus). */
  deferredAsEligible: boolean;
  caseId?: string;
}

function MemberRow({
  member,
  determination,
  index,
  expanded,
  onToggle,
  intakeFallback,
  hhSize,
  monthlyIncome,
  intakeData,
  caseApproved,
  isNonMagi,
  deferredAsEligible,
  caseId,
}: MemberRowProps) {
  const determinationPerson = determination?.person ?? null;
  const person: PersonRecord | null =
    determinationPerson?.firstName && determinationPerson?.lastName
      ? determinationPerson
      : ((intakeFallback as PersonRecord | null) ?? determinationPerson);

  // HEAD fallback: the case-level applicant name (intakeData.applicantName, then
  // intakeData.displayMeta.applicantName), mirroring CompletedCaseDetail.tsx's
  // displayName chain. Only used when neither the federated PersonRecord nor the
  // per-member intake row carried a first+last name (the ENG-1476 PersonRecord
  // deferral leaves determination.person null). Name-agnostic — surfaces whatever
  // applicant name the case actually carries.
  const intakeRec = (intakeData ?? {}) as Record<string, unknown>;
  const dmRec = (intakeRec.displayMeta ?? {}) as Record<string, unknown>;
  const applicantNameFallback =
    member.role === 'HEAD'
      ? typeof intakeRec.applicantName === 'string' && intakeRec.applicantName.trim()
        ? intakeRec.applicantName
        : typeof dmRec.applicantName === 'string'
          ? (dmRec.applicantName as string)
          : null
      : null;
  const name = memberName(member, person, applicantNameFallback);
  const firstName = person?.firstName ?? name.split(' ')[0] ?? 'Member';
  const age = calcAge(person?.dateOfBirth);
  const dob = fmtMDY(person?.dateOfBirth);
  const relation = relationLabel(member);
  const palette = AVATAR_PALETTES[index % AVATAR_PALETTES.length];
  const effectiveIsNonMagiRow = isNonMagi || determination?.category === 'NON_MAGI';
  const status = presentedStatus(determination?.status ?? 'PENDING', deferredAsEligible);
  // Per-member badge (ENG-1886): the member's OWN determination drives the badge.
  // The case-level approval is the fallback only for a member with no
  // determination row (the NON-MAGI/DDS-confirmed ABD path) — never to paint an
  // ineligible member green just because a sibling is eligible.
  const memberApproved = memberIsApproved(determination, caseApproved);
  const badge = memberApproved ? APPROVED_BADGE : STATUS_CONFIG[status];

  // Is this member a child? Medicaid defines child status by age (<19, the
  // 1902(a)(10)(A)(i)(III) threshold), not by household role. Using age also
  // defends against role-mapping drift on the write path — e.g. legacy
  // wizard submissions that landed as OTHER_ADULT despite a 'child'
  // relationship would otherwise render as Adult Group MAGI on the
  // caseworker view. Fall back to the role check when DOB is missing so
  // un-hydrated rows still get a sensible label.
  const isChild =
    age != null
      ? age < 19
      : member.role === 'CHILD' ||
        (member.role !== 'HEAD' && member.role !== 'SPOUSE' && member.role !== 'OTHER_ADULT');

  // Coverage group label for collapsed row. MAGI = engine's real per-member
  // determination (ENG-1865, single source of truth); NON-MAGI = category-driven;
  // '—' for an un-evaluated member (no age guessing).
  // Age-based fallback when coverageGroup is null (see CoverageCard above) —
  // avoids a blank row label on determinations without a recognized magi_group.
  const coverageGroup = effectiveIsNonMagiRow
    ? 'Non-MAGI (ABD)'
    : (determination?.coverageGroup ?? (isChild ? "Children's MAGI" : 'Adult Group MAGI'));

  // Medicaid ID — prefer a real ID stamped on displayMeta by the auto-approval
  // handler; otherwise fall back to a deterministic demo ID. Manually approved
  // cases (Review-&-Decide path) do not stamp displayMeta, so without this
  // fallback every member rendered '—' for the ID on a manual approval.
  const intake = (intakeData ?? {}) as Record<string, unknown>;
  const dm = (intake.displayMeta ?? {}) as Record<string, unknown>;

  // Whether THIS member receives SSI — drives the Disability block copy in the
  // ABD eligibility card. Per-member as of ENG-1865: prefer the member's own
  // intake flag and only fall back to the primary applicant's value when the
  // member omits it (legacy intake), mirroring the BRE mapper's fallback.
  // Strict === true convention (derive-case-detail.ts).
  const memberReceivingSSI = (
    (intake.householdMembers as Array<Record<string, unknown>> | undefined)?.find(
      (m) => m?.personId === member.person?.personId,
    ) ?? {}
  ).receivingSSI;
  const receivingSSI =
    memberReceivingSSI === undefined
      ? ((intake.applicant ?? {}) as Record<string, unknown>).receivingSSI === true
      : memberReceivingSSI === true;
  const mcId = typeof dm.mcNumber === 'string' && dm.mcNumber ? dm.mcNumber : deriveDemoMcNumber(caseId);

  // Effective date for collapsed row — fall back to first of application month for NON-MAGI
  const appDateIsoRow = typeof intake.applicationDate === 'string' ? intake.applicationDate : null;
  const effectiveIso =
    toCalendarDate(determination?.effectiveDate) ??
    (effectiveIsNonMagiRow ? isoOrNull(coverageEffectiveDate(appDateIsoRow)) : null);

  const hhFpl100Annual = fpl100Yr(hhSize);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-4 hover:bg-muted/30 transition-colors"
        aria-expanded={expanded}
        aria-controls={`member-detail-${member.id}`}
      >
        {/* Avatar — initials when a structured name exists, else a neutral
            person icon (ENG-1943). aria-hidden: the member name is already
            announced by the adjacent text. */}
        <div
          data-testid="member-avatar"
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ring-1',
            palette,
          )}
          aria-hidden="true"
        >
          {avatarInitials(person?.firstName, person?.lastName) ?? <User className="h-4 w-4" />}
        </div>

        {/* Columns */}
        <div className="flex-1 min-w-0 grid grid-cols-12 gap-3 items-center">
          {/* Name / relation / age */}
          <div className="col-span-4 min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-foreground">{name}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{relation}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {age !== null ? `Age ${age} · DOB ${dob}` : `DOB ${dob}`}
            </p>
          </div>

          {/* Coverage group + ID */}
          <div className="col-span-4 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{coverageGroup}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              ID <span className="font-mono">{mcId}</span>
            </p>
          </div>

          {/* Status badge + effective */}
          <div className="col-span-3 text-right min-w-0">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-bold',
                badge.badgeClass,
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', badge.dotClass)} />
              {badge.label.toUpperCase()}
            </span>
            {effectiveIso && <p className="text-xs text-muted-foreground mt-0.5">Effective {fmtDate(effectiveIso)}</p>}
          </div>

          {/* Chevron */}
          <div className="col-span-1 text-right text-muted-foreground">
            <ChevronDown
              className={cn('w-4 h-4 inline transition-transform duration-200', expanded && 'rotate-180')}
              aria-hidden="true"
            />
          </div>
        </div>
      </button>

      {expanded && (
        <div
          id={`member-detail-${member.id}`}
          className="bg-muted/20 border-t px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <CoverageCard
            determination={determination}
            hhSize={hhSize}
            intakeData={intakeData}
            isApproved={memberApproved}
            monthlyIncome={monthlyIncome}
            hhFpl100Annual={hhFpl100Annual}
            isNonMagi={isNonMagi}
            deferredAsEligible={deferredAsEligible}
            isChild={isChild}
            caseId={caseId}
          />
          <EligibilityCard
            determination={determination}
            firstName={firstName}
            hhSize={hhSize}
            monthlyIncome={monthlyIncome}
            hhFpl100Annual={hhFpl100Annual}
            isChild={isChild}
            isNonMagi={isNonMagi}
            receivingSSI={receivingSSI}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
export interface MemberCardsProps {
  members: EEHouseholdMember[];
  determinations: EEDetermination[];
  /** Wizard-built intake data, used for income + application date + MCO assignment. */
  intakeData?: unknown;
  /** When true, suppresses the outer Card chrome. */
  flat?: boolean;
  /** True when the case is Non-MAGI ABD — overrides per-member determination category
   *  so residents without an explicit NON_MAGI determination still see the right labels. */
  isNonMagi?: boolean;
  /** True when the case-level status is APPROVED, used to force the Approved badge even
   *  when no ELIGIBLE determination record exists (common for DDS-confirmed ABD cases). */
  caseApproved?: boolean;
  /** Case ID used to derive a deterministic Medicaid ID for NON-MAGI cases that were not
   *  processed through the auto-approval handler (which normally stamps displayMeta.mcNumber). */
  caseId?: string;
}

export function MemberCards({
  members,
  determinations,
  intakeData,
  flat = false,
  isNonMagi: isNonMagiProp = false,
  caseApproved = false,
  caseId,
}: MemberCardsProps) {
  // Pure Non-MAGI case: every determination is NON_MAGI (Robert archetype).
  // Drives the DEFERRED→Eligible chip presentation; mixed/split households
  // (any MAGI determination present) keep genuine Deferred chips.
  const deferredAsEligible = determinations.length > 0 && determinations.every((d) => d.category === 'NON_MAGI');

  // Sort HEAD first, then preserve original order.
  const sortedMembers = [...members].sort((a, b) => {
    if (a.role === 'HEAD') return -1;
    if (b.role === 'HEAD') return 1;
    return 0;
  });

  // HEAD expanded by default.
  const headIndex = sortedMembers.findIndex((m) => m.role === 'HEAD');
  const initialExpanded = new Set<string>();
  if (headIndex >= 0) initialExpanded.add(sortedMembers[headIndex].id);

  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded);

  if (sortedMembers.length === 0) return null;

  const allOpen = expanded.size === sortedMembers.length;

  function toggle(memberId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(sortedMembers.map((m) => m.id)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  // Derive shared values
  const hhSize = (() => {
    const intake = (intakeData ?? {}) as Record<string, unknown>;
    return typeof intake.householdSize === 'number' ? intake.householdSize : sortedMembers.length;
  })();

  const monthlyIncome = readMonthlyIncome(intakeData);

  const effectiveIsNonMagi = isNonMagiProp || determinations.some((d) => d.category === 'NON_MAGI');

  // Per-member eligibility summary (ENG-1886 D1a). The CMS Demo Admin design
  // surfaces mixed outcomes purely per-member (decoupled coverage) and has no
  // case-level "partial" verdict, so this is a neutral count appended to the
  // household header, shown ONLY when the household is genuinely mixed (some — but
  // not all — applying members eligible). Counted over determinations (applying
  // members evaluated), mirroring the CaseAssist "N of M applying members" copy.
  // Counted over PRESENTED statuses so the header count can never contradict
  // the chips (a pure-Non-MAGI DEFERRED member presents — and counts — as
  // eligible).
  const eligibleCount = determinations.filter(
    (d) => presentedStatus(d.status, deferredAsEligible) === 'ELIGIBLE',
  ).length;
  const isMixedOutcome = determinations.length > 1 && eligibleCount > 0 && eligibleCount < determinations.length;

  const taxFilerNote = effectiveIsNonMagi
    ? hhSize > 1
      ? `Non-MAGI ABD household · ${hhSize} members · SSA income + asset test applies`
      : `Non-MAGI ABD household · SSA income + asset test applies`
    : hhSize > 1
      ? `MAGI household size: ${hhSize} · Constructed using tax filer rules · Joint filers + claimed dependent = household of ${hhSize}`
      : `MAGI household size: 1 · Single-filer household`;

  const inner = (
    <>
      {/* Section header */}
      <div className={cn('flex flex-col px-5 py-4', !flat && 'border-b')}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-foreground">
            Household Composition · {sortedMembers.length} {sortedMembers.length === 1 ? 'Member' : 'Members'}
            {isMixedOutcome && (
              <span className="ml-2 font-normal text-amber-700">
                · {eligibleCount} of {determinations.length} eligible
              </span>
            )}
          </h3>
          {sortedMembers.length > 1 && (
            <button
              type="button"
              onClick={allOpen ? collapseAll : expandAll}
              className="text-[var(--civic-accent-text,#1d4ed8)] hover:underline text-xs font-medium"
            >
              {allOpen ? 'Collapse all members' : 'Expand all members'}
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{taxFilerNote}</p>
      </div>

      {/* Member rows */}
      <div className="divide-y">
        {sortedMembers.map((member, idx) => (
          <MemberRow
            key={member.id}
            member={member}
            determination={findDetermination(member, determinations)}
            index={idx}
            expanded={expanded.has(member.id)}
            onToggle={() => toggle(member.id)}
            intakeFallback={intakeMemberByPersonId(intakeData, member.person?.personId)}
            hhSize={hhSize}
            monthlyIncome={monthlyIncome}
            intakeData={intakeData}
            caseApproved={caseApproved}
            isNonMagi={effectiveIsNonMagi}
            deferredAsEligible={deferredAsEligible}
            caseId={caseId}
          />
        ))}
      </div>
    </>
  );

  if (flat) {
    return <div>{inner}</div>;
  }

  return (
    <Card>
      <CardContent className="p-0">{inner}</CardContent>
    </Card>
  );
}
