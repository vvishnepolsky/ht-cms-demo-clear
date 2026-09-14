import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle,
  CheckCircle2,
  Clock,
  FolderOpen,
  Play,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { AdminShell, Button } from '../components/ui';
import { EeSidebarNav } from '../components/EeSidebarNav';
import { NewCaseModal } from '../components/ee/NewCaseModal';
import { LIST_EE_CASES_QUERY } from '../lib/ee-operations';
import { isNonMagiCase } from '../lib/ee-utils';
import type { EEDeterminationListSummary, EEHouseholdMemberListSummary } from '../lib/ee-operations';
import { useDismissOnOutsideAndEscape } from '../hooks/useDismissOnOutsideAndEscape';
import { eeFlagClasses, eeFlagLabel, EE_FLAG_DIS, EE_FLAG_PREG, EE_FLAG_SSI } from '../lib/ee-flags';
import { formatRelativeTime } from '../lib/format-relative-time';
import { prioritizeOpenVerifyAssistFlags } from '../lib/case-list-order';
import {
  UNKNOWN_APPLICANT,
  EE_SLA_DAYS,
  EE_FLAG_ID_CLEAR,
  type EECaseStatus,
  type IdentityVerificationListSummary,
  WORKFLOW_STATUS_ACTION_NEEDED,
  WORKFLOW_STATUS_WAITING_APPLICANT,
  WORKFLOW_STATUS_AUTO_APPROVED,
  WORKFLOW_STATUS_AUTO_ENROLLED,
  deriveApprovalLabel,
  hasOpenOutOfStateFlag,
  hasOutOfStateCoverage,
  isIdentityVerified,
} from '../types/ee';
import { deriveActionNeeded } from '../lib/ee-utils';
import { cn, DASH } from '../lib/utils';

// ── Display-meta helpers ──────────────────────────────────────────────────────

interface DisplayMeta {
  mcNumber: string | null;
  flags: string[];
  actionNeeded: string;
  lastActivity: string;
  caseCategory: string | null;
  workflowStatus: string | null;
  daysRemaining: number | null;
  autoProcessed: boolean;
  county: string | null;
}

interface CaseDataForMeta {
  createdAt: string;
  updatedAt: string;
  status: EECaseStatus;
  // Optional so older call shapes still typecheck; the dashboard passes the
  // full list item, whose determinations feed deriveActionNeeded (ENG-1994).
  determinations?: EEDeterminationListSummary[];
  /** CLEAR / Verify Assist summary — adds the client-derived ID-CLEAR chip. */
  identityVerification?: IdentityVerificationListSummary | null;
}

function getDisplayMeta(intakeData: Record<string, unknown> | null, caseData?: CaseDataForMeta): DisplayMeta {
  const dm = (intakeData?.displayMeta ?? {}) as Record<string, unknown>;

  // Days Remaining: use stored value if present, else compute from 90-day SLA.
  let daysRemaining: number | null = typeof dm.daysRemaining === 'number' ? dm.daysRemaining : null;
  if (daysRemaining === null && caseData) {
    const isTerminal = caseData.status === 'APPROVED' || caseData.status === 'DENIED' || caseData.status === 'CANCELED';
    if (!isTerminal) {
      const appDateStr = typeof intakeData?.applicationDate === 'string' ? intakeData.applicationDate : null;
      const appMs = appDateStr ? new Date(appDateStr).getTime() : NaN;
      const startMs = !Number.isNaN(appMs) ? appMs : new Date(caseData.createdAt).getTime();
      if (!Number.isNaN(startMs)) {
        const daysSince = Math.floor((Date.now() - startMs) / 86_400_000);
        daysRemaining = Math.max(0, EE_SLA_DAYS - daysSince);
      }
    }
  }

  // Flags: use stored value when key is present (even if empty []); null means absent.
  const hasStoredFlags = Array.isArray(dm.flags);
  let flags: string[] = hasStoredFlags ? (dm.flags as string[]) : [];
  if (!hasStoredFlags && intakeData) {
    const applicant = (intakeData.applicant ?? {}) as Record<string, unknown>;
    const derived: string[] = [];
    if (applicant.isDisabled === true) derived.push(EE_FLAG_DIS);
    if (applicant.isPregnant === true) derived.push(EE_FLAG_PREG);
    if (applicant.receivingSSI === true || applicant.receivingSSDI === true) derived.push(EE_FLAG_SSI);
    flags = derived;
  }
  // Identity verified by CLEAR — derived here (the server only stores OOS-MCD).
  if (isIdentityVerified(caseData?.identityVerification) && !flags.includes(EE_FLAG_ID_CLEAR)) {
    flags = [...flags, EE_FLAG_ID_CLEAR];
  }

  // Action Needed: use stored value when present; null means absent, not "no action".
  // Fallback derives from real case state — status + intake flags + determinations
  // (ENG-1994: a Non-MAGI ABD case pends on DDS disability confirmation, not income).
  const storedActionNeeded = typeof dm.actionNeeded === 'string' ? dm.actionNeeded : null;
  const actionNeeded =
    storedActionNeeded ??
    (caseData ? deriveActionNeeded(caseData.status, intakeData, caseData.determinations ?? []) : DASH);

  // Last Activity: use stored value when present; null means absent.
  const storedLastActivity = typeof dm.lastActivity === 'string' ? dm.lastActivity : null;
  const lastActivity = storedLastActivity ?? (caseData ? formatRelativeTime(caseData.updatedAt) : DASH);

  return {
    mcNumber: typeof dm.mcNumber === 'string' ? dm.mcNumber : null,
    flags,
    actionNeeded,
    lastActivity,
    caseCategory: typeof dm.caseCategory === 'string' ? dm.caseCategory : null,
    workflowStatus: typeof dm.workflowStatus === 'string' ? dm.workflowStatus : null,
    daysRemaining,
    autoProcessed: dm.autoProcessed === true,
    county: typeof intakeData?.county === 'string' ? intakeData.county : null,
  };
}

function getApplicantName(
  members: EEHouseholdMemberListSummary[],
  determinations: EEDeterminationListSummary[],
  intakeData?: Record<string, unknown> | null,
  identityVerification?: IdentityVerificationListSummary | null,
): string {
  const head = members.find((m) => m.role === 'HEAD') ?? members[0];
  const headPersonId = head?.person?.personId;
  const person = headPersonId ? determinations.find((d) => d.person?.personId === headPersonId)?.person : null;
  if (person?.firstName && person.lastName) return `${person.firstName} ${person.lastName}`;
  const intakeApplicantName = typeof intakeData?.applicantName === 'string' ? intakeData.applicantName : null;
  // Last resort: the name CLEAR verified on the applicant's government ID.
  return intakeApplicantName ?? identityVerification?.subjectName ?? UNKNOWN_APPLICANT;
}

type CaseRowShape = {
  household: { members: EEHouseholdMemberListSummary[] };
  determinations: EEDeterminationListSummary[];
  intakeData: Record<string, unknown> | null;
  identityVerification?: IdentityVerificationListSummary | null;
};

function rowApplicantName(c: CaseRowShape): string {
  return getApplicantName(c.household.members, c.determinations, c.intakeData, c.identityVerification);
}

function getPathway(
  determinations: EEDeterminationListSummary[],
  intakeData: Record<string, unknown> | null,
): 'MAGI' | 'NON_MAGI' {
  // Shared classifier with WorkspacePage (isNonMagiCase) — intake disability/
  // SSDI/SSI flags count even before the BRE produces determinations, so a
  // freshly submitted Non-MAGI application isn't mislabeled MAGI here while
  // the workspace shows the DDS flow.
  const intake = (intakeData ?? {}) as Record<string, unknown>;
  const applicant = (intake.applicant ?? {}) as Record<string, unknown>;
  return isNonMagiCase(applicant, determinations) ? 'NON_MAGI' : 'MAGI';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FlagBadge({ flag }: { flag: string }) {
  const cls = eeFlagClasses(flag);
  return (
    <span
      title={eeFlagLabel(flag)}
      className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold', cls)}
    >
      {flag}
    </span>
  );
}

/**
 * Verify Assist indicator — shield icon summarising the CLEAR identity
 * verification linked to the case: red while active out-of-state Medicaid
 * coverage is an open finding, green ("CLEAR verified") once CLEAR verified the
 * identity and any coverage finding has been resolved/dismissed.
 */
function VerifyAssistCell({ iv }: { iv: IdentityVerificationListSummary | null | undefined }) {
  if (!iv) return <span className="text-xs text-muted-foreground">—</span>;
  // Red only while the finding still needs caseworker action; once the flag is
  // resolved/dismissed the row reads as a plain CLEAR-verified identity.
  if (hasOpenOutOfStateFlag(iv)) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap text-red-700"
        title={`Out-of-state Medicaid coverage (${iv.determination?.payer_state ?? '—'}) — flag ${iv.flag?.status ?? 'open'}`}
        data-slot="verify-assist-cell"
        data-state="oos-open"
      >
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
        Out-of-state coverage
      </span>
    );
  }
  if (isIdentityVerified(iv)) {
    const resolved = hasOutOfStateCoverage(iv);
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 whitespace-nowrap"
        title={
          resolved
            ? `Identity verified by CLEAR — out-of-state coverage finding ${iv.flag?.status ?? 'closed'}`
            : 'Identity verified by CLEAR'
        }
        data-slot="verify-assist-cell"
        data-state="verified"
      >
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        CLEAR verified
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground whitespace-nowrap" data-slot="verify-assist-cell" data-state={iv.status}>
      {iv.status.replace(/_/g, ' ')}
    </span>
  );
}

const WORKFLOW_STATUS_CLASSES: Record<string, string> = {
  [WORKFLOW_STATUS_ACTION_NEEDED]: 'bg-amber-50 text-amber-700 border-amber-300',
  [WORKFLOW_STATUS_WAITING_APPLICANT]: 'bg-gray-100 text-gray-600 border-gray-200',
  Approved: 'bg-green-50 text-green-700 border-green-300',
  // deriveApprovalLabel returns 'Denied' for every DENIED case — give it a
  // distinct terminal style so it doesn't fall back to the same gray as
  // 'Waiting on Applicant'.
  Denied: 'bg-red-50 text-red-700 border-red-300',
  [WORKFLOW_STATUS_AUTO_APPROVED]: 'bg-blue-50 text-blue-600 border-blue-200',
  [WORKFLOW_STATUS_AUTO_ENROLLED]: 'bg-emerald-50 text-emerald-700 border-emerald-300',
};

function WorkflowStatusBadge({
  workflowStatus,
  caseStatus,
}: {
  workflowStatus: string | null;
  caseStatus: EECaseStatus;
}) {
  // case.status is authoritative for terminal state — a Completed-tab case
  // (APPROVED/DENIED) must never show an active label like "Action Needed"
  // even when displayMeta.workflowStatus is stale (ENG-1810).
  const label = deriveApprovalLabel(workflowStatus, caseStatus);
  const cls = WORKFLOW_STATUS_CLASSES[label] ?? 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        cls,
      )}
    >
      {label}
    </span>
  );
}

function DaysCell({ days, isCompleted }: { days: number | null; isCompleted: boolean }) {
  if (isCompleted) return <span className="text-xs text-muted-foreground">Completed</span>;
  if (days === null) return <span className="text-xs text-muted-foreground">—</span>;
  const tone = days <= 3 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-muted-foreground';
  return (
    <span className={cn('flex items-center gap-1 text-xs font-semibold', tone)}>
      <Clock className="h-3.5 w-3.5" />
      {days} days
    </span>
  );
}

function isAppeal(c: { caseNumber?: string | null }): boolean {
  return (c.caseNumber ?? '').startsWith('APL-');
}

type TabKey = 'all' | 'income' | 'rfi' | 'appeals' | 'completed';

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [newCaseModalOpen, setNewCaseModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'days-asc' | 'days-desc' | 'name'>('days-asc');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [enrollBannerDismissed, setEnrollBannerDismissed] = useState(false);
  const [countyFilter, setCountyFilter] = useState<Set<string>>(new Set());
  const [showFilter, setShowFilter] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const closeSortDropdown = useCallback(() => setShowSortDropdown(false), []);
  useDismissOnOutsideAndEscape(sortDropdownRef, showSortDropdown, closeSortDropdown);
  const filterRef = useRef<HTMLDivElement>(null);
  const closeFilter = useCallback(() => setShowFilter(false), []);
  useDismissOnOutsideAndEscape(filterRef, showFilter, closeFilter);

  const { data, loading, error } = useQuery(LIST_EE_CASES_QUERY, {
    variables: { pagination: { page, limit: 20 } },
  });

  const cases = data?.medicaidEeCases?.data ?? [];
  const pagination = data?.medicaidEeCases?.pagination;
  const totalCount = pagination?.totalCount ?? 0;

  const autoProcessedCases = useMemo(
    () =>
      cases
        .filter((c) => getDisplayMeta(c.intakeData, c).autoProcessed)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [cases],
  );

  const kpis = useMemo(() => {
    const activeCases = cases.filter(
      (c) => c.status !== 'APPROVED' && c.status !== 'DENIED' && c.status !== 'CANCELED',
    );
    const actionable = activeCases.filter(
      (c) => getDisplayMeta(c.intakeData, c).workflowStatus !== WORKFLOW_STATUS_WAITING_APPLICANT,
    ).length;
    const waiting = activeCases.length - actionable;
    return {
      pendingFallout: activeCases.length,
      actionable,
      waiting,
      dueThisWeek: activeCases.filter((c) => {
        const d = getDisplayMeta(c.intakeData, c).daysRemaining;
        return d !== null && d <= 7;
      }).length,
      activeAppeals: cases.filter(isAppeal).length,
      autoProcessedToday: cases.filter((c) => c.status === 'APPROVED').length,
    };
  }, [cases]);

  const counties = useMemo(() => {
    const set = new Set<string>();
    for (const c of cases) {
      const county = getDisplayMeta(c.intakeData, c).county;
      if (county) set.add(county);
    }
    return Array.from(set).sort();
  }, [cases]);

  const tabFilteredCases = useMemo(() => {
    switch (activeTab) {
      case 'income':
        return cases.filter(
          (c) =>
            c.status === 'PENDING_VERIFICATION' ||
            getDisplayMeta(c.intakeData, c).caseCategory === 'Income / Verification',
        );
      case 'rfi':
        return cases.filter((c) => (c.flagReason ?? '').toLowerCase().includes('rfi'));
      case 'appeals':
        return cases.filter(isAppeal);
      case 'completed':
        return cases.filter((c) => c.status === 'APPROVED' || c.status === 'DENIED');
      case 'all':
      default:
        return cases.filter((c) => c.status !== 'APPROVED' && c.status !== 'DENIED' && !isAppeal(c));
    }
  }, [cases, activeTab]);

  const tabCounts = useMemo(
    () => ({
      all: cases.filter((c) => c.status !== 'APPROVED' && c.status !== 'DENIED' && !isAppeal(c)).length,
      income: cases.filter(
        (c) =>
          c.status === 'PENDING_VERIFICATION' ||
          getDisplayMeta(c.intakeData, c).caseCategory === 'Income / Verification',
      ).length,
      rfi: cases.filter((c) => (c.flagReason ?? '').toLowerCase().includes('rfi')).length,
      appeals: cases.filter(isAppeal).length,
      completed: cases.filter((c) => c.status === 'APPROVED' || c.status === 'DENIED').length,
    }),
    [cases],
  );

  const displayCases = useMemo(() => {
    let list = tabFilteredCases;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => {
        const name = rowApplicantName(c).toLowerCase();
        const mc = (getDisplayMeta(c.intakeData, c).mcNumber ?? '').toLowerCase();
        return name.includes(q) || (c.caseNumber ?? '').toLowerCase().includes(q) || mc.includes(q);
      });
    }

    if (countyFilter.size > 0) {
      list = list.filter((c) => {
        const county = getDisplayMeta(c.intakeData, c).county;
        return county ? countyFilter.has(county) : false;
      });
    }

    const sorted = [...list].sort((a, b) => {
      if (sortBy === 'name') {
        return rowApplicantName(a).localeCompare(rowApplicantName(b));
      }
      const dA = getDisplayMeta(a.intakeData, a).daysRemaining ?? 999;
      const dB = getDisplayMeta(b.intakeData, b).daysRemaining ?? 999;
      return sortBy === 'days-asc' ? dA - dB : dB - dA;
    });
    // Cases with an open Verify Assist (out-of-state Medicaid) finding are
    // pinned to the top of the queue regardless of the chosen sort.
    return prioritizeOpenVerifyAssistFlags(sorted);
  }, [tabFilteredCases, searchQuery, sortBy, countyFilter]);

  const verifyAssistOpenCount = useMemo(
    () => cases.filter((c) => hasOpenOutOfStateFlag(c.identityVerification)).length,
    [cases],
  );
  const isCompleted = activeTab === 'completed';

  return (
    <AdminShell
      bannerBrand={<span>State Eligibility &amp; Enrollment</span>}
      bannerLabel="Caseworker Portal"
      defaultSidebarOpen={false}
      navContent={<EeSidebarNav />}
    >
      <div className="ht-dashboard">
        {/* Header */}
        <div className="ht-dashboard-header">
          <div>
            <h1 className="ht-dashboard-title">Cases</h1>
            <p className="ht-dashboard-subtitle">
              Manage and process Medicaid, SNAP, WIC, Summer EBT, TANF eligibility cases
            </p>
          </div>
          <div className="ht-dashboard-actions">
            <Button variant="outline" onClick={() => setNewCaseModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Case
            </Button>
            <Button
              onClick={() => {
                const first = cases.find(
                  (c) => c.status !== 'APPROVED' && c.status !== 'DENIED' && c.status !== 'CANCELED',
                );
                if (first) navigate(`/ee/cases/${first.id}`);
              }}
              disabled={kpis.pendingFallout === 0}
            >
              <Play className="h-4 w-4 mr-1" /> Go to Workspace ({kpis.pendingFallout} fallout)
            </Button>
          </div>
        </div>

        {/* KPI tiles */}
        <div className="ht-kpi-row">
          <KpiTile
            label="Pending Fallout"
            value={kpis.pendingFallout}
            sub={`${kpis.actionable} actionable · ${kpis.waiting} waiting`}
            tone="default"
            icon={<FolderOpen className="h-5 w-5" />}
          />
          <KpiTile label="Due This Week" value={kpis.dueThisWeek} tone="warning" icon={<Clock className="h-5 w-5" />} />
          <KpiTile
            label="Active Appeals"
            value={kpis.activeAppeals}
            tone="warning"
            icon={<AlertTriangle className="h-5 w-5" />}
          />
          <KpiTile
            label="Verify Assist Flags"
            value={verifyAssistOpenCount}
            sub="Out-of-state Medicaid coverage found by CLEAR"
            tone={verifyAssistOpenCount > 0 ? 'danger' : 'default'}
            icon={<ShieldAlert className="h-5 w-5" />}
          />
          <KpiTile
            label="Auto-processed Today"
            value={kpis.autoProcessedToday}
            tone="accent"
            icon={<CheckCircle className="h-5 w-5" />}
          />
        </div>

        {/* Enrollment banner — uses Civic success tokens directly via inline
            style so the green renders correctly regardless of which Tailwind
            color utilities are present in the generated stylesheet. The
            previous Tailwind-emerald classes resolved to the default border
            color when emerald wasn't included in the compiled CSS. */}
        {!enrollBannerDismissed && autoProcessedCases.length > 0 && (
          <div
            className="rounded-lg border p-4"
            style={{
              borderColor: 'var(--civic-green-6)',
              borderLeftWidth: '4px',
              borderLeftColor: 'var(--civic-green-9)',
              backgroundColor: 'var(--civic-success-bg)',
            }}
          >
            <div className="flex items-start gap-3">
              <CheckCircle2
                className="h-5 w-5 mt-0.5 shrink-0"
                style={{ color: 'var(--civic-success-text)' }}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold mb-1.5" style={{ color: 'var(--civic-success-text)' }}>
                  {autoProcessedCases.length} enrollment{autoProcessedCases.length !== 1 ? 's' : ''} recently completed
                </p>
                <ul className="space-y-1 text-xs text-foreground">
                  {autoProcessedCases.map((c) => {
                    const name = rowApplicantName(c);
                    const meta = getDisplayMeta(c.intakeData, c);
                    return (
                      <li key={c.id} className="flex items-start gap-2">
                        <span className="mt-0.5" style={{ color: 'var(--civic-success-text)' }}>
                          •
                        </span>
                        <button
                          type="button"
                          onClick={() => navigate(`/ee/cases/${c.id}`)}
                          className="text-left hover:underline"
                        >
                          <strong>{name}</strong>
                          {meta.mcNumber && ` (${meta.mcNumber})`} — {formatRelativeTime(c.updatedAt)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => setEnrollBannerDismissed(true)}
                className="shrink-0 hover:opacity-70"
                style={{ color: 'var(--civic-success-text)' }}
                aria-label="Dismiss enrollment banner"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {(
            [
              { key: 'all', label: 'All Fallout' },
              { key: 'income', label: 'Income / Verification' },
              { key: 'rfi', label: 'RFI Pending' },
              { key: 'appeals', label: 'Appeals' },
              { key: 'completed', label: 'Completed' },
            ] as Array<{ key: TabKey; label: string }>
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                activeTab === tab.key
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'ml-1.5 text-xs px-1.5 py-0.5 rounded-full',
                  activeTab === tab.key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                {tabCounts[tab.key]}
              </span>
            </button>
          ))}
        </div>

        {/* Search / sort bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search cases"
              placeholder="Search by name, case ID, or MC#"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
            />
          </div>
          <div ref={filterRef} className="relative">
            <button
              type="button"
              onClick={() => setShowFilter((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={showFilter}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg bg-card hover:bg-muted/30 text-muted-foreground"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filter{countyFilter.size > 0 && ` (${countyFilter.size})`}
            </button>
            {showFilter && (
              <div
                role="menu"
                aria-label="Filter by county"
                className="absolute right-0 top-full mt-1 z-20 w-56 rounded-md border bg-popover p-2 shadow-md"
              >
                {counties.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground">No counties available</p>
                ) : (
                  counties.map((county) => (
                    <button
                      key={county}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={countyFilter.has(county)}
                      onClick={() => {
                        setCountyFilter((prev) => {
                          const next = new Set(prev);
                          if (next.has(county)) next.delete(county);
                          else next.add(county);
                          return next;
                        });
                      }}
                      className="flex w-full items-center gap-2 px-2 py-1 text-sm hover:bg-muted rounded text-left"
                    >
                      {/* visual checkbox indicator */}
                      <span
                        aria-hidden="true"
                        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-border"
                        style={
                          countyFilter.has(county)
                            ? { backgroundColor: 'var(--primary)', borderColor: 'var(--primary)' }
                            : undefined
                        }
                      >
                        {countyFilter.has(county) && (
                          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white" fill="currentColor">
                            <path
                              d="M10 3L5 8.5 2 5.5"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      {county}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="relative" ref={sortDropdownRef}>
            <button
              type="button"
              onClick={() => setShowSortDropdown((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={showSortDropdown}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg bg-card hover:bg-muted/30 text-muted-foreground"
            >
              <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
              Sort
            </button>
            {showSortDropdown && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[220px]"
              >
                {(
                  [
                    ['days-asc', 'Days Remaining (Low → High)'],
                    ['days-desc', 'Days Remaining (High → Low)'],
                    ['name', 'Applicant Name (A → Z)'],
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSortBy(val);
                      setShowSortDropdown(false);
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm hover:bg-muted/30',
                      sortBy === val ? 'text-primary font-medium' : 'text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <p className="text-muted-foreground">Loading cases...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load cases. Please try again or contact support.
          </div>
        )}

        {/* Case table */}
        {!loading && !error && (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {[
                      'Case',
                      'Applicant',
                      'Pathway',
                      isCompleted ? 'Status' : 'Days Remaining',
                      isCompleted ? 'Approval' : 'Status',
                      'Flags',
                      'Verify Assist',
                      isCompleted ? 'Processing Result' : 'Action Needed',
                      'Last Activity',
                    ].map((label) => (
                      <th
                        key={label}
                        scope="col"
                        className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayCases.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        {searchQuery ? 'No cases match your search.' : 'No cases in this tab.'}
                      </td>
                    </tr>
                  )}
                  {displayCases.map((c) => {
                    const applicantName = rowApplicantName(c);
                    const pathway = getPathway(c.determinations, c.intakeData);
                    const meta = getDisplayMeta(c.intakeData, c);
                    const caseLabel = c.caseNumber ?? c.id.slice(-8).toUpperCase();
                    const pinned = hasOpenOutOfStateFlag(c.identityVerification);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => navigate(`/ee/cases/${c.id}`)}
                        className={cn(
                          'hover:bg-muted/30 cursor-pointer transition-colors',
                          pinned && 'bg-red-50/40 border-l-2 border-l-red-500',
                        )}
                        data-verify-assist-pinned={pinned ? '' : undefined}
                      >
                        {/* Case ID + category */}
                        <td className="px-4 py-3.5">
                          <p className="text-xs font-semibold text-primary">{caseLabel}</p>
                          {meta.caseCategory && (
                            <p className="text-xs text-muted-foreground mt-0.5">{meta.caseCategory}</p>
                          )}
                        </td>

                        {/* Applicant + MC# */}
                        <td className="px-4 py-3.5">
                          <p className="text-sm font-medium text-foreground">{applicantName}</p>
                          {meta.mcNumber && <p className="text-xs text-muted-foreground">{meta.mcNumber}</p>}
                        </td>

                        {/* Pathway */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={cn(
                              'text-xs font-semibold whitespace-nowrap',
                              pathway === 'NON_MAGI' ? 'text-gray-500' : 'text-blue-600',
                            )}
                          >
                            {pathway === 'NON_MAGI' ? 'Non-MAGI' : 'MAGI'}
                          </span>
                        </td>

                        {/* Days remaining / "Completed" */}
                        <td className="px-4 py-3.5">
                          <DaysCell days={meta.daysRemaining} isCompleted={isCompleted} />
                        </td>

                        {/* Workflow status badge */}
                        <td className="px-4 py-3.5">
                          <WorkflowStatusBadge workflowStatus={meta.workflowStatus} caseStatus={c.status} />
                        </td>

                        {/* Flags */}
                        <td className="px-4 py-3.5">
                          {meta.flags.length > 0 ? (
                            <div className="flex gap-1 flex-wrap">
                              {meta.flags.map((f) => (
                                <FlagBadge key={f} flag={f} />
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Verify Assist (CLEAR) */}
                        <td className="px-4 py-3.5">
                          <VerifyAssistCell iv={c.identityVerification} />
                        </td>

                        {/* Action needed */}
                        <td className="px-4 py-3.5">
                          <p className="text-xs font-medium text-foreground leading-snug">{meta.actionNeeded}</p>
                        </td>

                        {/* Last activity */}
                        <td className="px-4 py-3.5">
                          <p className="text-xs text-muted-foreground leading-snug whitespace-nowrap">
                            {meta.lastActivity}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer pagination */}
        {!loading && !error && cases.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {displayCases.length} of {totalCount} case{totalCount !== 1 ? 's' : ''}
            </p>
            {pagination && pagination.totalPages > 1 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasPreviousPage}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <NewCaseModal open={newCaseModalOpen} onOpenChange={setNewCaseModalOpen} />
    </AdminShell>
  );
}

// ── KPI tile ──────────────────────────────────────────────────────────────────

type KpiTone = 'default' | 'warning' | 'danger' | 'success' | 'accent';

interface KpiTileProps {
  label: string;
  value: number;
  sub?: string;
  tone: KpiTone;
  icon: React.ReactNode;
}

function KpiTile({ label, value, sub, tone, icon }: KpiTileProps) {
  return (
    <div className="ht-kpi" data-tone={tone}>
      <div className="ht-kpi-header">
        <span className="ht-kpi-label">{label}</span>
        <span className="ht-kpi-icon">{icon}</span>
      </div>
      <div className="ht-kpi-value">{value}</div>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}
