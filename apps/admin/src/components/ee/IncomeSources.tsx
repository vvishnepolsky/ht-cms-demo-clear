import { useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  SSDI_SOURCE_LABEL,
  SSI_SOURCE_LABEL,
  readMonthlyHouseholdIncome,
  readSsaVerifiedSsdiIncome,
} from '../../lib/ee-utils';
import type { EECase, EECaseStatus, IncomeVerification } from '../../types/ee';
import {
  GET_EE_CASE_QUERY,
  CREATE_ARGYLE_USER_MUTATION,
  REQUEST_INCOME_VERIFICATION_MUTATION,
} from '../../lib/ee-operations';
import { Button } from '../ui/button';
import { ArgyleSendDialog } from './ArgyleSendDialog';

const LOG_PREFIX = '[IncomeSources]' as const;
const PLACEHOLDER_LABEL = 'var(--civic-text-placeholder)';

// ── Exported pure helpers (tested in IncomeSources.test.ts) ─────────────────

export type IncomeDisplayStatus = 'not_started' | 'pending' | 'connected' | 'verified' | 'failed';

export function resolveIncomeStatus(
  incomeVerification: IncomeVerification | null,
  isSandbox: boolean,
  caseStatus: EECaseStatus,
): IncomeDisplayStatus {
  if (isSandbox) return 'verified';
  // ENG-1870: an approved case has cleared income verification by definition.
  // Demo cases auto-approve without an Argyle record, so without this override
  // the badge falls through to 'not_started' below. Only APPROVED gets this —
  // DENIED/CANCELED keep their real status (matches the prototype, where only
  // approved cases display income as Verified).
  if (caseStatus === 'APPROVED') return 'verified';
  if (!incomeVerification) return 'not_started';
  switch (incomeVerification.status) {
    case 'PENDING':
      return 'pending';
    case 'CONNECTED':
      return 'connected';
    case 'VERIFIED':
      return 'verified';
    case 'FAILED':
      return 'failed';
  }
}

export function extractApplicantContact(eeCase: EECase): { phone: string | null; email: string | null } {
  const headMember = eeCase.household.members.find((m) => m.role === 'HEAD') ?? eeCase.household.members[0];
  const headPersonId = headMember?.person?.personId;
  const person = headPersonId
    ? eeCase.determinations.find((d) => d.person?.personId === headPersonId)?.person
    : undefined;
  return {
    phone: person?.phones?.[0]?.value ?? null,
    email: person?.emails?.[0]?.value ?? null,
  };
}

// ── Internal types ───────────────────────────────────────────────────────────

interface IncomeRow {
  source: string;
  sub?: string;
  type: string;
  freq: string;
  amount: number;
}

interface HouseholdMemberIncome {
  firstName?: string;
  lastName?: string;
  income?: {
    employmentIncome?: number;
    selfEmploymentIncome?: number;
    otherIncome?: number;
  };
}

function currency(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function readMembers(intake: Record<string, unknown>): HouseholdMemberIncome[] {
  const members = intake.householdMembers;
  if (!Array.isArray(members)) return [];
  return members.filter((m): m is HouseholdMemberIncome => typeof m === 'object' && m !== null);
}

export function buildRows(eeCase: EECase): IncomeRow[] {
  const intake = (eeCase.intakeData ?? {}) as Record<string, unknown>;
  const members = readMembers(intake);
  const applicant = (intake.applicant ?? {}) as Record<string, unknown>;
  const primaryReceivingSSDI = applicant.receivingSSDI === true;
  const primaryReceivingSSI = applicant.receivingSSI === true;
  const rows: IncomeRow[] = [];

  for (const [idx, m] of members.entries()) {
    const name = [m.firstName, m.lastName].filter(Boolean).join(' ') || 'Household member';
    const isPrimary =
      typeof (m as Record<string, unknown>).relationship === 'string'
        ? ((m as Record<string, unknown>).relationship as string).toLowerCase() === 'self'
        : idx === 0;
    const inc = m.income ?? {};
    if (inc.employmentIncome && inc.employmentIncome > 0) {
      rows.push({
        source: 'Wages — Employer',
        sub: name,
        type: 'Earned',
        freq: 'Monthly',
        amount: inc.employmentIncome,
      });
    }
    if (inc.selfEmploymentIncome && inc.selfEmploymentIncome > 0) {
      rows.push({
        source: 'Self-employment',
        sub: name,
        type: 'Earned',
        freq: 'Monthly',
        amount: inc.selfEmploymentIncome,
      });
    }
    if (inc.otherIncome && inc.otherIncome > 0) {
      const source =
        isPrimary && primaryReceivingSSDI
          ? SSDI_SOURCE_LABEL
          : isPrimary && primaryReceivingSSI
            ? SSI_SOURCE_LABEL
            : 'Other income';
      rows.push({ source, sub: name, type: 'Unearned', freq: 'Monthly', amount: inc.otherIncome });
    }
  }

  if (rows.length === 0) {
    // ENG-1947/2041: a $0-report case shows an SSA Federal-Hub-verified row ONLY
    // when an explicit per-case ssaVerifiedSsdiMonthly override supplies a value —
    // no benefit is fabricated, so Robert Mitchell (no SSDI determination yet)
    // falls through to the $0 combined row. We check the raw $0 report because
    // readSsaVerifiedSsdiIncome returns the reported figure for income-reporting
    // cases, and relabeling a real combined-total row as SSDI would be wrong.
    const reported = readMonthlyHouseholdIncome(eeCase);
    const verified = readSsaVerifiedSsdiIncome(eeCase);
    if (reported === 0 && verified > 0) {
      const source = primaryReceivingSSI && !primaryReceivingSSDI ? SSI_SOURCE_LABEL : SSDI_SOURCE_LABEL;
      rows.push({ source, sub: 'Verified by SSA — Federal Hub', type: 'Unearned', freq: 'Monthly', amount: verified });
      return rows;
    }
    const total = typeof intake.monthlyHouseholdIncome === 'number' ? intake.monthlyHouseholdIncome : 0;
    rows.push({ source: 'Household monthly income', type: 'Combined', freq: 'Monthly', amount: total });
  }

  return rows;
}

function StatusBadge({ status }: { status: IncomeDisplayStatus }) {
  const config: Record<IncomeDisplayStatus, { label: string; className: string }> = {
    not_started: { label: 'Not Started', className: 'bg-slate-50 text-slate-600 border-slate-200' },
    pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    connected: { label: 'Connected', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    verified: { label: 'Verified', className: 'bg-green-50 text-green-700 border-green-200' },
    failed: { label: 'Failed', className: 'bg-red-50 text-red-700 border-red-200' },
  };
  const { label, className } = config[status];
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-md text-[10px] px-1.5 py-0.5 border whitespace-nowrap',
        className,
      )}
    >
      {label}
    </span>
  );
}

// ── Exported orchestration helper (tested in IncomeSources.test.ts) ─────────

type CreateUserFn = (vars: {
  variables: { input: { caseId: string } };
}) => Promise<{ data?: { createArgyleUser: { errors: unknown[] } } | null }>;

type RequestVerificationFn = (vars: { variables: { input: { caseId: string } } }) => Promise<unknown>;

export async function executeIncomeVerificationFlow(
  caseId: string,
  hasExistingVerification: boolean,
  createUser: CreateUserFn,
  requestVerification: RequestVerificationFn,
  onDomainError: () => void,
): Promise<void> {
  if (!hasExistingVerification) {
    const createResult = await createUser({ variables: { input: { caseId } } });
    if (!createResult.data || createResult.data.createArgyleUser.errors.length) {
      onDomainError();
      return;
    }
  }
  await requestVerification({ variables: { input: { caseId } } });
}

// ── Component ────────────────────────────────────────────────────────────────

export interface IncomeSourcesProps {
  eeCase: EECase;
  /** When true, suppresses the outer card chrome (border, rounded, shadow, bg)
   *  and the internal eyebrow label so the component nests cleanly inside a
   *  parent unified card without producing "card within card" visual artifacts. */
  flat?: boolean;
}

export function IncomeSources({ eeCase, flat = false }: IncomeSourcesProps) {
  const isSandbox = import.meta.env.VITE_ARGYLE_SANDBOX === 'true';
  const [dialogOpen, setDialogOpen] = useState(false);

  const status = resolveIncomeStatus(eeCase.incomeVerification, isSandbox, eeCase.status);
  const { phone, email } = extractApplicantContact(eeCase);
  const rows = buildRows(eeCase);
  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  const [createArgyleUser] = useMutation(CREATE_ARGYLE_USER_MUTATION, {
    onError: (err) => {
      console.error(LOG_PREFIX, 'createArgyleUser error', { name: err.name });
      toast.error('Failed to initiate income verification. Please try again.');
    },
  });

  const [requestIncomeVerification, { loading: requesting }] = useMutation(REQUEST_INCOME_VERIFICATION_MUTATION, {
    refetchQueries: [{ query: GET_EE_CASE_QUERY, variables: { id: eeCase.id } }],
    awaitRefetchQueries: true,
    onCompleted: (result) => {
      if (result.requestIncomeVerification.errors.length > 0) {
        toast.error('Failed to request income verification. Please try again.');
        return;
      }
      toast.success('Income verification initiated');
      setDialogOpen(false);
    },
    onError: (err) => {
      console.error(LOG_PREFIX, 'requestIncomeVerification error', { name: err.name });
      toast.error('Failed to request income verification. Please try again.');
    },
  });

  async function handleSendConfirm() {
    try {
      await executeIncomeVerificationFlow(
        eeCase.id,
        !!eeCase.incomeVerification,
        createArgyleUser,
        requestIncomeVerification,
        () => toast.error('Failed to initiate income verification. Please try again.'),
      );
    } catch {
      // Apollo onError already surfaced the user-facing toast; swallow the network rejection
    }
  }

  const canSend = status === 'not_started' || status === 'failed';

  return (
    <section>
      {!flat && (
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: PLACEHOLDER_LABEL }}>
            Income Sources
          </p>
          {canSend && !isSandbox && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              aria-label="Send Verification Link"
              onClick={() => setDialogOpen(true)}
            >
              Send Verification Link →
            </Button>
          )}
        </div>
      )}
      <div className={cn('overflow-hidden', !flat && 'bg-card rounded-lg border border-border shadow-sm')}>
        <div className="grid grid-cols-12 px-4 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
          <span className="col-span-4">Source</span>
          <span className="col-span-2">Type</span>
          <span className="col-span-2">Freq.</span>
          <span className="col-span-2 text-right">Amount/mo</span>
          <span className="col-span-2 text-right">Status</span>
        </div>

        {rows.map((r, i) => (
          <div
            key={`${r.source}-${i}`}
            className="grid grid-cols-12 items-center px-4 py-3 border-b border-border last:border-0 gap-1"
          >
            <div className="col-span-4">
              <p className="text-xs font-semibold text-foreground">{r.source}</p>
              {r.sub && (
                <p className="text-xs" style={{ color: PLACEHOLDER_LABEL }}>
                  {r.sub}
                </p>
              )}
            </div>
            <span className="col-span-2 text-xs text-muted-foreground">{r.type}</span>
            <span className="col-span-2 text-xs text-muted-foreground">{r.freq}</span>
            <span className="col-span-2 text-xs font-semibold text-foreground text-right">{currency(r.amount)}</span>
            <div className="col-span-2 flex justify-end">
              <StatusBadge status={status} />
            </div>
          </div>
        ))}

        <div className="grid grid-cols-12 px-4 py-3 bg-muted/30 border-t border-border text-xs">
          <span className="col-span-10 font-bold text-foreground">Total Monthly</span>
          <span className="col-span-2 text-right font-bold text-foreground">{currency(total)}</span>
        </div>
      </div>

      {status === 'pending' && (
        <p className="text-xs text-muted-foreground mt-1.5">Verification request sent · Awaiting payroll connection</p>
      )}

      <ArgyleSendDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleSendConfirm}
        title="Send income verification link?"
        description="The applicant will receive a request to connect their payroll account for income verification."
        recipientPhone={phone}
        recipientEmail={email}
        loading={requesting}
      />
    </section>
  );
}
