/**
 * CompletedCaseDetail -- post-decision workspace view shown when an E&E case
 * has reached a terminal status (APPROVED / DENIED). Replaces the active-case
 * MAGI engine + EligibilityResult + ActionBar + ApprovedBanner blocks with a
 * richer summary: outcome banner, flag badges, decision details, correspondences
 * sent, and a processing timeline.
 *
 * Phase 1 (ENG-1773):
 *   - UnifiedCaseBanner (green for approvals, red for denials)
 *   - Flag badge row (Auto-Approved / NO-TOUCH / EX-PARTE)
 *   - Page-level tab strip: Overview / Messages / Audit Log
 *
 * Phase 2 (ENG-1773):
 *   - Applicant Information section (two-column dl grid)
 *   - Income Verification table (IncomeSources reuse)
 *   - Per-Member Determination cards (MemberCards reuse)
 *   - Eligibility Determination verifications (expand/collapse block)
 *   - Bottom action bar (View Audit Log / View Notice stub)
 *
 * Storyboard reference: CMS Demo Storyboard / src/components/CompletedCaseDetail.jsx
 */

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { CheckCircle, XCircle, Mail, Inbox, MessageSquare, AtSign, FileText } from 'lucide-react';
import { coverageEffectiveDate, coverageEndDate, toIsoDate } from '@ht/coverage-dates';
import { GET_ELIGIBILITY_NOTICE_QUERY } from '../../lib/ee-operations';
import { Button } from '../ui';
import { cn, fmtDate, toCalendarDate } from '../../lib/utils';
import { type EECase, type EEDetermination } from '../../types/ee';
import { SensitiveValue } from './SensitiveValue';
import { IncomeSources } from './IncomeSources';
import { MemberCards } from './MemberCards';
import { CompletedMessagesTab } from './CompletedMessagesTab';
import { ActivityLogTab } from './drawer/tabs/ActivityLogTab';
import { MessagePreviewModal, DeliveryPreviewModal, type PreviewingChannel } from './drawer/MessagePreviewModal';
import {
  getCaseDetail,
  hasCaseDetail,
  DEFAULT_CASE_ID,
  MAGI_DEFAULT_CASE_ID,
  type CaseMessage,
} from '../../data/case-details';
import type { DrawerCaseRow } from './drawer/types';
import {
  isNonMagiCase,
  ABD_ASSET_DEFS,
  abdLimitForHousehold,
  formatAbdNote,
  readCitizenEnteredCountableResources,
} from '../../lib/ee-utils';
import { NO_COUNTABLE_RESOURCES_NOTE } from '../../lib/derive-case-detail';

export interface CompletedCaseDetailProps {
  eeCase: EECase;
  applicantName: string;
}

type PageTab = 'overview' | 'messages' | 'activity';

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function pickLatestDetermination(eeCase: EECase): EEDetermination | null {
  const determined = (eeCase.determinations ?? []).filter((d) => d.determinedAt != null);
  if (determined.length === 0) return eeCase.determinations?.[0] ?? null;
  return determined.sort((a, b) => new Date(b.determinedAt!).getTime() - new Date(a.determinedAt!).getTime())[0];
}

function humanizeReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return reason
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (s) => s.toUpperCase());
}

function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? new Date(`${dob}T12:00:00`) : new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function CompletedCaseDetail({ eeCase, applicantName }: CompletedCaseDetailProps) {
  const isApproved = eeCase.status === 'APPROVED';
  const isDenied = eeCase.status === 'DENIED';
  const determination = pickLatestDetermination(eeCase);
  // The server stamps `determinedBy` with the caseworker who approved/denied.
  // Only a case with no such actor was genuinely auto-processed (no-touch).
  const decidedByCaseworker = (eeCase.determinations ?? []).some((d) => !!d.determinedBy);

  const decidedAtIso = determination?.determinedAt ?? eeCase.updatedAt;
  const decidedAtLabel = fmtDateTime(decidedAtIso);
  const decidedTimeLabel = fmtTime(decidedAtIso);

  // Only denials surface a reason row (ENG-2051) — approval context lives in the banner.
  const reason = isDenied ? humanizeReason(determination?.denialReason ?? eeCase.statusReason) : null;

  // ── Applicant information derivation ──────────────────────────────────────
  const intake = (eeCase.intakeData ?? {}) as Record<string, unknown>;
  const dm = (intake.displayMeta ?? {}) as Record<string, unknown>;
  const intakeMembers = Array.isArray(intake.householdMembers)
    ? (intake.householdMembers as Array<Record<string, unknown>>)
    : [];
  const headIntakeMember = intakeMembers[0] ?? null;

  // ENG-1869 defense-in-depth. The wizard-side useWireHousehold sync routine
  // (shipped alongside this filter in the same PR) keeps the Household DB
  // record aligned with the resident's final wizard state going forward. This
  // filter remains in place for cases submitted before that fix, where the
  // old early-return left ghost members attached to the Household record after
  // a Back/Continue pass in the wizard. intakeData is the source of truth for
  // who the resident actually submitted; restrict the per-member determination
  // list to that set. Fall back to showing every household member when
  // intakeData has no personIds (legacy / guest cases pre-ENG-1831).
  const intakePersonIds = new Set(
    intakeMembers
      .map((m) => (typeof m?.personId === 'string' ? m.personId : null))
      .filter((id): id is string => id !== null && id.length > 0),
  );
  const submittedHouseholdMembers =
    intakePersonIds.size > 0
      ? eeCase.household.members.filter(
          (m) => m.role === 'HEAD' || (m.person?.personId != null && intakePersonIds.has(m.person.personId)),
        )
      : eeCase.household.members;

  // Name: prefer head member from determinations, fall back to intake, then prop
  const headDetermination = eeCase.determinations.find((d) => d.person?.personId != null && d.person.firstName != null);
  const fullNameFromDet =
    headDetermination?.person?.firstName && headDetermination?.person?.lastName
      ? `${headDetermination.person.firstName} ${headDetermination.person.lastName}`
      : null;
  const fullNameFromIntake =
    typeof headIntakeMember?.firstName === 'string' && typeof headIntakeMember?.lastName === 'string'
      ? `${headIntakeMember.firstName} ${headIntakeMember.lastName}`
      : null;
  const displayName = fullNameFromDet ?? fullNameFromIntake ?? applicantName;

  // DOB
  const dob =
    typeof headIntakeMember?.dateOfBirth === 'string'
      ? headIntakeMember.dateOfBirth
      : (headDetermination?.person?.dateOfBirth ?? null);
  const age = calcAge(dob);
  const dobDisplay = dob ? `${fmtDate(dob)}${age !== null ? ` (Age ${age})` : ''}` : '—';

  // SSN — only show the real seed value (so SensitiveValue can reveal it on the
  // eye toggle). When displayMeta carries no SSN, fall through to the DASH
  // sentinel rather than synthesizing a fake one (ENG-1913).
  const ssnFull = typeof dm.ssn === 'string' ? dm.ssn : null;
  const ssnReveal: string | null = ssnFull;
  // CLEAR-verified applicants never type an SSN — show the verified last-4 masked.
  const ssnLast4FromRecord =
    eeCase.determinations[0]?.person?.ssnLast4 ?? eeCase.identityVerification?.traits?.ssnLast4 ?? null;
  const ssnFromClear = !ssnReveal && ssnLast4FromRecord ? `•••-••-${ssnLast4FromRecord}` : null;

  // County
  const county = typeof intake.county === 'string' ? intake.county : '—';

  // Applied date
  const appliedDate =
    typeof intake.applicationDate === 'string' ? fmtDate(intake.applicationDate) : fmtDate(eeCase.createdAt);

  const intakeApplicant = (intake.applicant ?? {}) as Record<string, unknown>;
  const isNonMagi = isNonMagiCase(intakeApplicant, eeCase.determinations);
  const programLabel = isNonMagi ? 'Medicaid — Aged, Blind, or Disabled' : 'State Medicaid';

  // Coverage Group — for NON-MAGI cases always show Non-MAGI regardless of which
  // determination is latest (there may be an older MAGI determination on the record).
  const coverageGroup = isNonMagi ? 'Aged, Blind, or Disabled' : determination ? 'Income-Based Medicaid' : '—';

  // Coverage Period — ENG-1820 + ENG-1855. For NON-MAGI ABD cases with no
  // determination, derive the effective date from the first of the application
  // month. When the determination has no stored expiration (or no determination
  // exists at all), fall back to the end-of-month 12-month certification. All
  // arithmetic flows through @ht/coverage-dates so the seed scripts, the
  // notice PDF, the coverage card, and this row all agree.
  const applicationDateForCoverage = isNonMagi
    ? typeof intake.applicationDate === 'string'
      ? intake.applicationDate
      : eeCase.createdAt
    : null;
  const nonMagiEffective = applicationDateForCoverage ? coverageEffectiveDate(applicationDateForCoverage) : null;
  const effectiveDateIso =
    toCalendarDate(determination?.effectiveDate) ?? (nonMagiEffective ? toIsoDate(nonMagiEffective) : null);
  const fallbackEnd = effectiveDateIso ? coverageEndDate(effectiveDateIso) : null;
  const expirationDateIso =
    toCalendarDate(determination?.expirationDate) ?? (fallbackEnd ? toIsoDate(fallbackEnd) : null);
  const coveragePeriod =
    effectiveDateIso && expirationDateIso
      ? `${fmtDate(effectiveDateIso)} – ${fmtDate(expirationDateIso)}`
      : effectiveDateIso
        ? fmtDate(effectiveDateIso)
        : '—';

  // Medicaid ID — prefer a real ID stamped on displayMeta by the auto-approval
  // handler; otherwise fall back to a deterministic demo ID. Manually approved
  // MAGI cases (Review-&-Decide path) do not stamp displayMeta, so without this
  // fallback the case-level Medicaid ID rendered '—' on every manual approval.
  const mcNumber =
    typeof dm.mcNumber === 'string' && dm.mcNumber ? dm.mcNumber : `MA-${eeCase.id.slice(-8).toUpperCase()}`;

  // ── Verifications expand/collapse state ───────────────────────────────────
  const [verifExpanded, setVerifExpanded] = useState(false);

  const DEFAULT_MAGI_VERIFICATIONS: ReadonlyArray<{ check: string; status?: string; detail?: string }> = [
    { check: 'State Residency', status: 'Verified', detail: 'Confirmed via DMV records and address on file.' },
    { check: 'US Citizenship', status: 'Verified', detail: 'Confirmed via SSA federal data hub match.' },
    { check: 'Identity', status: 'Verified', detail: 'SSN + DOB + name match via SSA hub.' },
    { check: 'Income', status: 'Verified', detail: 'Household income confirmed via IRS W-2 through FDSH.' },
    {
      check: 'Household Composition',
      status: 'Verified',
      detail: 'Constructed using tax filer rules — joint filers + claimed dependent.',
    },
    {
      check: 'Other Coverage',
      status: 'None on file',
      detail: 'No employer-sponsored coverage above ESI affordability threshold.',
    },
    { check: 'Employer Wages', status: 'Verified', detail: 'Confirmed via state SWICA / quarterly wage records.' },
  ];

  const DEFAULT_NON_MAGI_VERIFICATIONS: ReadonlyArray<{ check: string; status?: string; detail?: string }> = [
    { check: 'State Residency', status: 'Verified', detail: 'Confirmed via DMV records and address on file.' },
    { check: 'US Citizenship', status: 'Verified', detail: 'Confirmed via SSA federal data hub match.' },
    { check: 'Identity', status: 'Verified', detail: 'SSN + DOB + name match via SSA hub.' },
    { check: 'Income (SSA/SSI)', status: 'Verified', detail: 'SSA income sources verified via federal data hub.' },
    {
      check: 'Resources / Assets',
      status: 'Verified',
      detail: 'Asset test passed — countable resources within Non-MAGI limit ($2,000 individual).',
    },
    {
      check: 'Disability Determination',
      status: 'Confirmed',
      detail: 'DDS returned favorable disability determination — ABD category assigned.',
    },
  ];

  const intakeVerifications = Array.isArray((eeCase.intakeData as Record<string, unknown> | null)?.verifications)
    ? ((eeCase.intakeData as Record<string, unknown>).verifications as Array<{
        check: string;
        status?: string;
        detail?: string;
        note?: string;
      }>)
    : null;

  const verifications: Array<{ check: string; status?: string; detail?: string; note?: string }> =
    intakeVerifications && intakeVerifications.length > 0
      ? intakeVerifications
      : isNonMagi
        ? [...DEFAULT_NON_MAGI_VERIFICATIONS]
        : [...DEFAULT_MAGI_VERIFICATIONS];

  // ── Tab state ─────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<PageTab>('overview');

  // ── Eligibility notice PDF (ENG-2043) ─────────────────────────────────────
  const { data: noticeData } = useQuery(GET_ELIGIBILITY_NOTICE_QUERY, {
    variables: { caseId: eeCase.id },
    skip: !isApproved,
    fetchPolicy: 'network-only',
  });
  const pdfUrl = noticeData?.eligibilityNotice?.noticeUrl ?? null;
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  // ── Delivery channel preview state (Final Approval Notice section) ────────
  const [previewingNoticeChannel, setPreviewingNoticeChannel] = useState<PreviewingChannel | null>(null);

  // ── Message preview modal state ───────────────────────────────────────────
  const [previewingMsg, setPreviewingMsg] = useState<{
    message: CaseMessage;
    allChannels: ReadonlyArray<string>;
  } | null>(null);
  const [previewingMsgChannel, setPreviewingMsgChannel] = useState<PreviewingChannel | null>(null);

  // ── Fixture data for Messages + Audit Log tabs ────────────────────────────
  // Try caseNumber first (hand-authored fixtures), then id, then fall back to
  // the appropriate default fixture based on MAGI vs Non-MAGI pathway so a
  // live-submitted MAGI approval doesn't show Non-MAGI ABD asset-RFI messages.
  const fixtureLookupId = hasCaseDetail(eeCase.caseNumber ?? '')
    ? (eeCase.caseNumber ?? eeCase.id)
    : hasCaseDetail(eeCase.id)
      ? eeCase.id
      : isNonMagi
        ? DEFAULT_CASE_ID
        : MAGI_DEFAULT_CASE_ID;
  const details = getCaseDetail(fixtureLookupId);
  const drawerCaseRow: DrawerCaseRow = {
    id: eeCase.id,
    caseNumber: eeCase.caseNumber,
    applicantName,
    status: eeCase.status,
    flagReason: eeCase.flagReason,
  };

  const msgCount = details.messages?.length ?? 0;
  const auditCount = details.narrative?.entries?.length ?? 0;

  // ── Notice of Decision props derivation ──────────────────────────────────
  const isAutoEnrollment = eeCase.flagReason?.toLowerCase().includes('auto') === true;

  const noticeKind = isDenied
    ? 'denial'
    : eeCase.caseType === 'RENEWAL'
      ? 'renewal'
      : isAutoEnrollment
        ? 'auto-enroll'
        : 'approval';

  const noticeFormCode =
    noticeKind === 'renewal'
      ? 'A-2881'
      : noticeKind === 'auto-enroll'
        ? 'A-0489'
        : noticeKind === 'denial'
          ? 'A-0813'
          : 'A-0602';

  const noticeTitle =
    noticeKind === 'renewal'
      ? 'Notice of Renewal — Coverage Continues'
      : noticeKind === 'auto-enroll'
        ? 'Notice of Auto-Enrollment — Welcome to State Medicaid'
        : noticeKind === 'denial'
          ? 'Notice of Decision — Denial & Appeal Rights'
          : 'Notice of Decision — Approval';

  const noticeFormattedId = `Form ${noticeFormCode} (Rev. 09/24)`;

  // ── Delivery channel rows for the Final Approval Notice section ───────────
  const noticeDeliveryChannels: Array<{
    id: string;
    kind: PreviewingChannel['kind'];
    icon: typeof Mail;
    channel: string;
    status: string;
    body: string;
  }> = [
    {
      id: 'mail',
      kind: 'mail',
      icon: Mail,
      channel: 'USPS First-Class Mail',
      status: 'Mailed',
      body: `Mailed to address on file. This is the official Notice of Decision sent via USPS First-Class Mail. Full content available in the Citizen Portal.`,
    },
    {
      id: 'portal',
      kind: 'portal',
      icon: Inbox,
      channel: 'Citizen Portal Inbox',
      status: 'Delivered',
      body: `Posted to ${applicantName}'s portal inbox. This is the official Notice of Decision delivered to the Citizen Portal. Full content available in the portal.`,
    },
    {
      id: 'sms',
      kind: 'sms',
      icon: MessageSquare,
      channel: 'SMS Alert',
      status: 'Delivered',
      body: `State HHS: Your Medicaid notice is ready. Member ID: ${mcNumber}. View full details in your portal or watch for mail. Reply STOP to opt out.`,
    },
    {
      id: 'email',
      kind: 'email',
      icon: AtSign,
      channel: 'Email Alert',
      status: 'Delivered',
      body: `This is the official Notice of Decision sent to your email on file. Full content available in the Citizen Portal.`,
    },
  ];

  // ── ABD asset data (Non-MAGI only) ─────────────────────────────────────────
  type AbdAssetRow = { label: string; owner: string; amount: number; countable: boolean };
  const abdAssetRows: AbdAssetRow[] = isNonMagi
    ? intakeMembers.flatMap((m) => {
        const res = (m.nonMagiResources ?? {}) as Record<string, unknown>;
        const owner = [m.firstName, m.lastName].filter((v) => typeof v === 'string' && v).join(' ') || 'Applicant';
        return ABD_ASSET_DEFS.flatMap((def) => {
          if (res[def.hasKey] !== true) return [];
          const raw = typeof res[def.amountKey] === 'string' ? (res[def.amountKey] as string) : '';
          const amount = parseFloat(raw.replace(/[^0-9.]/g, '')) || 0;
          if (amount <= 0) return [];
          return [{ label: def.label, owner, amount, countable: !def.exempt }];
        });
      })
    : [];
  // Countable total comes from the shared selector so Verify, Evaluate, and this
  // completed-case view read one source of truth (ENG-1914). abdAssetRows above is
  // retained for rendering (it includes exempt rows the countable total excludes).
  const abdCountableTotal = readCitizenEnteredCountableResources(eeCase);
  const abdLimit = abdLimitForHousehold(Number(intake.householdSize ?? 0) || 1);
  const abdNote = isNonMagi && abdAssetRows.length > 0 ? formatAbdNote(abdCountableTotal, abdLimit) : null;

  return (
    <div>
      {/* Tab strip — full-width, page-level chrome, sits flush below the
          breadcrumb header. No outer padding so it spans the entire content
          area width (mirrors storyboard's bg-card border-b px-6 flex gap-1). */}
      <div
        role="tablist"
        aria-label="Completed case sections"
        className="bg-card border-b flex gap-1 px-6 flex-shrink-0"
        style={{ borderColor: 'var(--civic-border-subtle)' }}
      >
        {(
          [
            { id: 'overview', label: 'Overview', count: null },
            { id: 'messages', label: 'Messages', count: msgCount },
            { id: 'activity', label: 'Audit Log', count: auditCount },
          ] as const
        ).map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setTab(t.id)}
              className="py-3 px-4 text-sm font-medium whitespace-nowrap transition-colors inline-flex items-center gap-2"
              style={
                isActive
                  ? {
                      color: 'var(--civic-accent-solid)',
                      borderBottom: '2px solid var(--civic-accent-solid)',
                    }
                  : { color: 'var(--civic-text-secondary)' }
              }
            >
              {t.label}
              {t.count !== null && t.count > 0 && (
                <span
                  className="inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold min-w-[1.25rem]"
                  style={{
                    backgroundColor: isActive ? 'var(--civic-accent-solid)' : 'var(--civic-bg-component)',
                    color: isActive ? 'var(--civic-accent-on-solid)' : 'var(--civic-text-secondary)',
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content — centered wide column, matches storyboard max-w-[1100px] */}
      {tab === 'overview' && (
        <div className="max-w-[1100px] mx-auto px-6 py-5">
          {/* Single unified card — all sections separated by border-b, rounded corners clip via overflow-hidden */}
          <div className="bg-card rounded-md border border-border overflow-hidden">
            {/* ── Banner — top of card, not a separate element ─────────────── */}
            {isApproved ? (
              <div className="bg-blue-50 border-b border-blue-200 px-6 py-4">
                <div className="flex items-start gap-3">
                  <CheckCircle aria-hidden="true" className="h-5 w-5 shrink-0 mt-0.5 text-blue-700" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900">
                      {isNonMagi
                        ? 'Approved following caseworker disability determination review — Non-MAGI ABD pathway.'
                        : decidedByCaseworker
                          ? 'Approved after caseworker review.'
                          : 'This case was auto-processed. No caseworker action was required.'}
                    </p>
                    <p className="text-xs text-blue-800 mt-1">
                      {isNonMagi
                        ? 'DDS confirmation recorded'
                        : decidedByCaseworker
                          ? 'Determination recorded by the caseworker'
                          : 'Processed by Rules Engine v4.2'}{' '}
                      on{' '}
                      {fmtDate(decidedAtIso)} at {decidedTimeLabel}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-red-50 border-b border-red-200 px-6 py-4">
                <div className="flex items-start gap-3">
                  <XCircle aria-hidden="true" className="h-5 w-5 shrink-0 mt-0.5 text-red-700" />
                  <div>
                    <p className="text-sm font-semibold text-red-900">
                      Decision recorded — the applicant has been notified of appeal rights.
                    </p>
                    <p className="text-xs text-red-800 mt-1">
                      Processed by Rules Engine v4.2 on {fmtDate(decidedAtIso)} at {decidedTimeLabel}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Applicant Information ─────────────────────────────────────── */}
            <div className="px-6 py-5 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground mb-4">Applicant Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                {/* Column 1: personal */}
                <dl className="space-y-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Name</dt>
                    <dd className="mt-0.5 font-medium">{displayName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Date of Birth</dt>
                    <dd className="mt-0.5">{dobDisplay}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">SSN</dt>
                    <dd className="mt-0.5">
                      {ssnReveal ? (
                        <SensitiveValue value={ssnReveal} type="ssn" />
                      ) : ssnFromClear ? (
                        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 whitespace-nowrap" data-slot="ssn-from-clear">
                          <SensitiveValue value={ssnFromClear} type="ssn" copyable={false} />
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wider text-green-700"
                            title="Last four digits confirmed during CLEAR identity verification"
                          >
                            from CLEAR
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">County</dt>
                    <dd className="mt-0.5">{county}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Applied</dt>
                    <dd className="mt-0.5">{appliedDate}</dd>
                  </div>
                </dl>
                {/* Column 2: coverage + identifiers */}
                <dl className="space-y-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Program</dt>
                    <dd className="mt-0.5">{programLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Coverage Group</dt>
                    <dd className="mt-0.5">{coverageGroup}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Coverage Period</dt>
                    <dd className="mt-0.5">{coveragePeriod}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Medicaid ID</dt>
                    <dd className="mt-0.5 font-mono text-xs">{mcNumber}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* ── Decision Summary ──────────────────────────────────────────── */}
            <div className="px-6 py-5 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground mb-4">Decision Summary</h2>
              <dl className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Outcome</dt>
                  <dd className="mt-0.5 font-medium">{isApproved ? 'Approved' : 'Denied'}</dd>
                </div>
                {/* ENG-2051: Approval Reason + Decided By removed — the outcome
                    banner above already states why and who (Rules Engine /
                    caseworker DDS review), and the Audit Log captures actor
                    history. Denial Reason is kept: it is substantive and not
                    repeated in the denial banner. */}
                {isDenied && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Denial Reason</dt>
                    <dd className="mt-0.5">{reason ?? '—'}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-muted-foreground">Decided At</dt>
                  <dd className="mt-0.5">{decidedAtLabel}</dd>
                </div>
              </dl>
            </div>

            {/* ── Income Verification (MAGI only) ──────────────────────────────
                Non-MAGI ABD decisions rest on the SSA-verified SSDI figure +
                the asset test; the wage-style income table reads as MAGI noise
                under the decision summary, so it is suppressed for Non-MAGI. */}
            {!isNonMagi && (
              <div className="px-6 py-5 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground mb-3">Income Verification</h2>
                <IncomeSources eeCase={eeCase} flat />
              </div>
            )}

            {/* ── Asset Verification (Non-MAGI ABD only) ───────────────────── */}
            {isNonMagi && (
              <div className="px-6 py-5 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground mb-3">Asset Verification</h2>
                <div className="overflow-hidden">
                  <div className="grid grid-cols-12 px-4 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide border border-border rounded-t-md">
                    <span className="col-span-5">Asset</span>
                    <span className="col-span-4">Owner</span>
                    <span className="col-span-2 text-right">Value</span>
                    <span className="col-span-1 text-right">Status</span>
                  </div>
                  {abdAssetRows.length === 0 ? (
                    <div className="grid grid-cols-12 px-4 py-3 border-x border-b border-border rounded-b-md text-xs text-muted-foreground">
                      <span className="col-span-12">{NO_COUNTABLE_RESOURCES_NOTE}</span>
                    </div>
                  ) : (
                    abdAssetRows.map((r, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-12 items-center px-4 py-3 border-x border-b border-border last:rounded-b-md"
                      >
                        <span className="col-span-5 text-xs font-semibold text-foreground">{r.label}</span>
                        <span className="col-span-4 text-xs text-muted-foreground">{r.owner}</span>
                        <span className="col-span-2 text-xs font-semibold text-foreground text-right">
                          ${r.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                        <div className="col-span-1 flex justify-end">
                          <span
                            className={cn(
                              'inline-flex items-center font-medium rounded-md text-[10px] px-1.5 py-0.5 border whitespace-nowrap',
                              r.countable
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200',
                            )}
                          >
                            {r.countable ? 'Verified' : 'Exempt'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                  {abdAssetRows.length > 0 && (
                    <div className="grid grid-cols-12 px-4 py-3 bg-muted/30 border border-t-0 border-border rounded-b-md text-xs">
                      <span className="col-span-10 font-bold text-foreground">Total Countable</span>
                      <span className="col-span-2 text-right font-bold text-foreground">
                        $
                        {abdCountableTotal.toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </div>
                  )}
                </div>
                {abdNote && (
                  <p
                    className={`mt-1.5 text-xs ${abdCountableTotal > abdLimit ? 'text-red-600' : 'text-muted-foreground'}`}
                  >
                    {abdNote}
                  </p>
                )}
              </div>
            )}

            {/* ── Household Composition / Per-Member Determinations ─────────── */}
            {submittedHouseholdMembers.length > 0 && (
              <div className="px-6 py-5 border-b border-border">
                <MemberCards
                  members={submittedHouseholdMembers}
                  determinations={eeCase.determinations}
                  intakeData={eeCase.intakeData}
                  isNonMagi={isNonMagi}
                  caseApproved={isApproved}
                  caseId={eeCase.id}
                  flat
                />
              </div>
            )}

            {/* ── Final Approval Notice & Delivery ─────────────────────────── */}
            <div className="px-6 py-5 border-b border-border space-y-5">
              <h2 className="!text-sm font-semibold text-foreground">Final Approval Notice &amp; Delivery</h2>

              {/* ── Notice of Decision card ──────────────────────────────── */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Notice of Decision
                </p>
                <div className="rounded-md border border-border overflow-hidden">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3 px-4 py-3 bg-card">
                    <div className="flex items-start gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                      <h3 className="!text-sm !font-semibold text-foreground">{noticeTitle}</h3>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                        English
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      Auto-sent <CheckCircle className="w-3 h-3" aria-hidden="true" />
                    </span>
                  </div>

                  {/* Metadata sub-section */}
                  <div className="px-4 py-3 bg-muted/30 border-t border-border space-y-2">
                    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs">
                      <p className="text-foreground">
                        <span className="text-muted-foreground">Form:</span>{' '}
                        <span className="font-medium">{noticeFormattedId}</span>
                      </p>
                      <p className="text-foreground ml-auto">
                        <span className="text-muted-foreground">Status:</span>{' '}
                        <span className="font-medium">Sent on {decidedAtLabel}</span>
                      </p>
                    </div>
                    <p className="text-xs text-foreground">
                      <span className="text-muted-foreground">Content:</span> Eligibility decision, coverage details,
                      effective and retro dates, member rights, and appeal information.
                    </p>
                  </div>

                  {/* Footer link */}
                  <div className="px-4 py-2.5 bg-card border-t border-border flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (pdfUrl) setPdfModalOpen(true);
                      }}
                      disabled={!pdfUrl}
                      className="text-xs font-medium hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ color: 'var(--civic-accent-solid)' }}
                    >
                      {pdfUrl ? 'Preview Notice as Sent →' : 'Notice not yet generated'}
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Multi-channel delivery table ─────────────────────────── */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Multi-Channel Delivery Status
                </p>
                <div className="rounded-md border border-border overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-4 px-4 py-2 bg-muted/30 border-b border-border">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Channel
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Status
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                      Timestamp
                    </span>
                  </div>
                  {/* Rows */}
                  <ul className="divide-y divide-border" aria-label="Notice delivery channels">
                    {noticeDeliveryChannels.map((c) => {
                      const Icon = c.icon;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewingNoticeChannel({
                                kind: c.kind,
                                ch: c.channel,
                                ts: decidedAtLabel,
                                to:
                                  c.kind === 'mail'
                                    ? `${applicantName}\n${details.contact.homeAddress ?? '[Address on file]'}`
                                    : c.kind === 'sms'
                                      ? (details.contact.phone ?? 'Phone on file')
                                      : c.kind === 'email'
                                        ? (details.contact.email ?? 'Email on file')
                                        : `${applicantName} (Portal ID)`,
                                subject: noticeTitle,
                                body: c.body,
                                attachment: { label: `${noticeFormattedId}.pdf` },
                              })
                            }
                            className="w-full grid grid-cols-[1fr_1fr_auto] gap-4 items-center px-4 py-3 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--iris-9)] transition-colors text-left"
                            aria-label={`Preview ${c.channel} delivery`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <Icon className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                              <span className="text-xs font-medium text-foreground truncate">{c.channel}</span>
                            </span>
                            <span className="text-xs text-foreground">{c.status}</span>
                            <span className="text-xs text-muted-foreground text-right whitespace-nowrap">
                              {decidedAtLabel}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>

            {/* ── Eligibility Determination verifications ───────────────────── */}
            <div className="px-6 py-5 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <h2 className="!text-sm font-semibold text-foreground">Eligibility Determination</h2>
                <button
                  type="button"
                  className="text-xs font-medium hover:underline"
                  style={{ color: 'var(--civic-accent-solid)' }}
                  onClick={() => setVerifExpanded((v) => !v)}
                >
                  {verifExpanded ? '▲ Hide verification details' : '▼ View verification details'}
                </button>
              </div>
              {!verifExpanded ? (
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {verifications.map((v, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <CheckCircle
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: 'var(--civic-accent-solid)' }}
                        aria-hidden="true"
                      />
                      <span className="font-semibold text-foreground">{v.check}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {verifications.map((v, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <CheckCircle
                        className="w-4 h-4 mt-0.5 shrink-0"
                        style={{ color: 'var(--civic-accent-solid)' }}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold text-foreground">{v.check}</span>
                          {v.status && (
                            <span className="text-xs" style={{ color: 'var(--civic-accent-solid)' }}>
                              — {v.status}
                            </span>
                          )}
                        </div>
                        {v.detail && <p className="text-xs text-muted-foreground mt-0.5">{v.detail}</p>}
                        {v.note && (
                          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--civic-accent-solid)' }}>
                            {v.note}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Bottom action bar — different background, no border-b needed ── */}
            <div className="px-6 py-4 bg-muted/30 flex items-center justify-end">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setTab('activity')}>
                  View Audit Log
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    if (pdfUrl) setPdfModalOpen(true);
                  }}
                  disabled={!pdfUrl}
                >
                  View Notice
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'messages' && (
        <div className="max-w-[1100px] mx-auto px-6 py-5">
          <CompletedMessagesTab
            messages={details.messages}
            onViewAttachment={() => {
              if (pdfUrl) setPdfModalOpen(true);
            }}
          />
        </div>
      )}

      {tab === 'activity' && (
        <div className="max-w-[1100px] mx-auto px-6 py-5">
          <ActivityLogTab caseRow={drawerCaseRow} details={details} />
        </div>
      )}

      {/* Message preview modal stack (same pattern as CaseDetailsDrawer) */}
      {previewingMsg && (
        <MessagePreviewModal
          message={previewingMsg.message}
          allChannels={previewingMsg.allChannels}
          caseRow={drawerCaseRow}
          applicantEmail={details.contact.email}
          applicantPhone={details.contact.phone}
          applicantAddress={details.contact.homeAddress}
          onClose={() => setPreviewingMsg(null)}
          onSelectChannel={(channel) => setPreviewingMsgChannel(channel)}
        />
      )}
      {previewingMsgChannel && (
        <DeliveryPreviewModal channel={previewingMsgChannel} onClose={() => setPreviewingMsgChannel(null)} />
      )}

      {/* Eligibility notice PDF modal (ENG-2043) */}
      {pdfModalOpen && pdfUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Eligibility Notice"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--civic-overlay-bg)' }}
          onClick={() => setPdfModalOpen(false)}
        >
          <div
            className="rounded-xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden"
            style={{ backgroundColor: 'var(--civic-bg-card)', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-5 py-3 border-b shrink-0"
              style={{ borderColor: 'var(--civic-border-subtle)' }}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
                <span className="text-sm font-semibold" style={{ color: 'var(--civic-text-primary)' }}>
                  {noticeTitle}
                </span>
              </div>
              <button
                type="button"
                aria-label="Close notice"
                onClick={() => setPdfModalOpen(false)}
                className="rounded-full p-1 hover:bg-muted transition-colors"
                style={{ color: 'var(--civic-text-secondary)' }}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <iframe
                src={pdfUrl}
                title="Eligibility Notice PDF"
                className="w-full h-full block"
                style={{ height: '70vh', border: 'none' }}
                aria-label="Eligibility Notice PDF viewer"
              />
            </div>
            <div
              className="flex items-center justify-between px-5 py-3 border-t shrink-0"
              style={{ borderColor: 'var(--civic-border-subtle)', backgroundColor: 'var(--civic-bg-card)' }}
            >
              <span className="text-xs" style={{ color: 'var(--civic-text-secondary)' }}>
                {noticeFormattedId}
              </span>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium hover:underline"
                style={{ color: 'var(--civic-accent-solid)' }}
              >
                Open in new tab →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Delivery channel preview for Final Approval Notice rows */}
      {previewingNoticeChannel && (
        <DeliveryPreviewModal channel={previewingNoticeChannel} onClose={() => setPreviewingNoticeChannel(null)} />
      )}
    </div>
  );
}
