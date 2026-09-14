import { useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { DDS_DETERMINATION_REF } from '../../lib/case-assist-constants';
import { DEMO_TODAY_DISPLAY } from '../../data/demoToday';
import { useMutation } from '@apollo/client/react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { currency, readSsaVerifiedSsdiIncome, readCitizenEnteredCountableResources } from '../../lib/ee-utils';
import type { EECase, AssetVerification } from '../../types/ee';
import {
  GET_EE_CASE_QUERY,
  GET_BANKING_CONNECT_URL_MUTATION,
  REQUEST_ASSET_VERIFICATION_MUTATION,
} from '../../lib/ee-operations';
import { ArgyleSendDialog } from './ArgyleSendDialog';
import { extractApplicantContact } from './IncomeSources';

const LOG_PREFIX = '[NonMagiAssetsPanel]' as const;
const PLACEHOLDER_LABEL = 'var(--civic-text-placeholder)';
const BADGE_PASS = 'bg-green-50 text-green-700 border-green-200' as const;
const BADGE_FAIL = 'bg-red-50 text-red-700 border-red-200' as const;
const BADGE_PENDING = 'bg-amber-50 text-amber-700 border-amber-200' as const;
export const SANDBOX_INSTITUTION_NAME = 'First National Bank' as const;
export const SANDBOX_LAST_FOUR = '4421' as const;

// ── Exported pure helpers (tested in NonMagiAssetsPanel.test.ts) ─────────────

export type AssetDisplayStatus = 'not_started' | 'pending' | 'verified' | 'failed';

export function resolveAssetStatus(
  assetVerification: AssetVerification | null,
  isSandbox: boolean,
): AssetDisplayStatus {
  if (isSandbox) return 'verified';
  if (!assetVerification) return 'not_started';
  switch (assetVerification.status) {
    case 'PENDING':
      return 'pending';
    case 'VERIFIED':
      return 'verified';
    case 'FAILED':
      return 'failed';
    default:
      return 'not_started';
  }
}

export interface SavingsRow {
  institutionName: string;
  accountType: string;
  balance: number;
  lastFour: string | null;
}

/**
 * Maps only genuinely AVS-verified accounts to display rows.
 *
 * ENG-1914: this no longer fabricates a fixed $1,800 sandbox account — sandbox/demo
 * cases have no real AVS data, so the displayed account is synthesised from the
 * citizen-entered value in {@link resolveSavingsRows}. This function returns rows
 * ONLY when there is a real VERIFIED asset verification, so it no longer needs the
 * sandbox flag.
 */
export function buildSavingsRows(assetVerification: AssetVerification | null): SavingsRow[] {
  if (!assetVerification || assetVerification.status !== 'VERIFIED') return [];
  return assetVerification.accounts.map((a) => ({
    institutionName: a.institutionName,
    accountType: a.accountType,
    balance: a.balance,
    lastFour: null,
  }));
}

/**
 * Resolves the AVS account rows shown in the demo. A single `countable` value
 * flows into every asset figure (this row, the Resource Categories table, the
 * asset test) so they all agree — the ENG-1891 dual-balance-consistency invariant.
 *
 * TEMPORARY — ENG-1914 source-of-truth note:
 * Until real AVS federation is wired, the synthesised account balance is the
 * applicant's CITIZEN-ENTERED countable total (passed in as `countable`), which
 * is the source of truth. Real AVS verification is NOT available, so any AVS
 * "result" the demo previously showed (a fabricated $1,800) was removed.
 * When real AVS verification works, the AVS-returned balance should REPLACE the
 * citizen-entered value as the source of truth — i.e. genuinely verified accounts
 * (the `buildSavingsRows` branch below) become authoritative and the synthesised
 * fallback drops away.
 *
 * `_isSandbox` is retained in the signature (call sites pass `isSandbox`) for when
 * the real Argyle/AVS send flow is re-enabled, but is no longer consumed: ENG-1914
 * removed the fabricated sandbox account, so sandbox mode no longer branches here.
 */
export function resolveSavingsRows(
  assetVerification: AssetVerification | null,
  _isSandbox: boolean,
  countable: number,
): SavingsRow[] {
  const verified = buildSavingsRows(assetVerification);
  if (verified.length > 0) return verified;
  return [
    {
      institutionName: SANDBOX_INSTITUTION_NAME,
      accountType: 'savings',
      balance: countable,
      lastFour: SANDBOX_LAST_FOUR,
    },
  ];
}

// ── Internal helpers ─────────────────────────────────────────────────────────

interface ResourceRow {
  category: string;
  reported: string;
  status: string;
  ok: boolean;
}

/**
 * The countable-resource figure used across the Non-MAGI asset panel.
 *
 * TEMPORARY — ENG-1914 source-of-truth note:
 * The applicant's CITIZEN-ENTERED countable resources are the single source of
 * truth. The previously stubbed AVS value ($1,800) and the AVS `totalAssets`
 * short-circuit were removed: real AVS verification is not wired, and the bug
 * bash (Robert Mitchell, 6/1) showed AVS returning $1,800 while the applicant
 * had entered $1,500. The applicant's attestation must win.
 *
 * When real AVS verification works, the AVS-returned total should REPLACE this
 * citizen-entered value as the source of truth — re-introduce an
 * `eeCase.assetVerification?.totalAssets` read HERE (preferred over the
 * attestation) and keep the citizen figure only as the comparison input.
 */
export function readCountableResources(eeCase: EECase): number {
  return readCitizenEnteredCountableResources(eeCase);
}

// ── Exported orchestration helper (tested in NonMagiAssetsPanel.test.ts) ────

type GetBankingConnectUrlFn = (vars: {
  variables: { input: { caseId: string } };
}) => Promise<{ data?: { getArgyleBankingConnectUrl: { errors: unknown[] } } | null }>;

type RequestAssetVerificationFn = (vars: { variables: { input: { caseId: string } } }) => Promise<unknown>;

export async function executeAssetVerificationFlow(
  caseId: string,
  getBankingConnectUrl: GetBankingConnectUrlFn,
  requestAssetVerification: RequestAssetVerificationFn,
  onDomainError: () => void,
): Promise<void> {
  const urlResult = await getBankingConnectUrl({ variables: { input: { caseId } } });
  if (!urlResult.data || urlResult.data.getArgyleBankingConnectUrl.errors.length) {
    onDomainError();
    return;
  }
  await requestAssetVerification({ variables: { input: { caseId } } });
}

// ── Component ────────────────────────────────────────────────────────────────

export interface NonMagiAssetsPanelProps {
  eeCase: EECase;
  /** True once the caseworker has sent the DDS referral packet — flips the
   *  Disability Determination card to the blue "packet prepared" state. */
  ddsReferralSent?: boolean;
  /** True once the (simulated) DDS response has confirmed disability —
   *  flips the card to the green "disability confirmed" state. */
  ddsConfirmed?: boolean;
  /** Applicant first name for the referral card's eligibility footer. */
  applicantFirstName?: string;
}

export function NonMagiAssetsPanel({
  eeCase,
  ddsReferralSent = false,
  ddsConfirmed = false,
  applicantFirstName,
}: NonMagiAssetsPanelProps) {
  const isSandbox = import.meta.env.VITE_ARGYLE_SANDBOX === 'true';
  const [dialogOpen, setDialogOpen] = useState(false);

  const { phone, email } = extractApplicantContact(eeCase);
  // SSA-verified SSDI figure (per-case override or reported income; no
  // fabricated benefit, ENG-2039/2041) — matches the SSA Verification Results
  // panel above, so the Disability Determination card's "Title II benefit"
  // line agrees with the SSA Query Results.
  const income = readSsaVerifiedSsdiIncome(eeCase);

  // ENG-1891/1914: the demo always presents AVS as a completed/verified query for
  // Non-MAGI cases (the real Argyle/AVS federation is not wired here). Every asset
  // figure derives from a single `countable` value so the AVS account balance, the
  // Resource Categories table, and the asset test all agree — see resolveSavingsRows.
  // That single value is the applicant's citizen-entered countable resources
  // (the source of truth); see readCountableResources for the temporary-AVS note.
  const countable = readCountableResources(eeCase);
  const assetStatus = resolveAssetStatus(eeCase.assetVerification, true);
  const savingsRows = resolveSavingsRows(eeCase.assetVerification, isSandbox, countable);

  const [getBankingConnectUrl, { loading: gettingUrl }] = useMutation(GET_BANKING_CONNECT_URL_MUTATION, {
    onError: (err) => {
      console.error(LOG_PREFIX, 'getArgyleBankingConnectUrl error', { name: err.name });
      toast.error('Failed to generate banking connect link. Please try again.');
    },
  });

  const [requestAssetVerification, { loading: requesting }] = useMutation(REQUEST_ASSET_VERIFICATION_MUTATION, {
    refetchQueries: [{ query: GET_EE_CASE_QUERY, variables: { id: eeCase.id } }],
    awaitRefetchQueries: true,
    onCompleted: (result) => {
      if (result.requestAssetVerification.errors.length > 0) {
        toast.error('Failed to request asset verification. Please try again.');
        return;
      }
      toast.success('Banking connect link sent · Applicant has 1 hour to connect');
      setDialogOpen(false);
    },
    onError: (err) => {
      console.error(LOG_PREFIX, 'requestAssetVerification error', { name: err.name });
      toast.error('Failed to request asset verification. Please try again.');
    },
  });

  async function handleSendConfirm() {
    try {
      await executeAssetVerificationFlow(eeCase.id, getBankingConnectUrl, requestAssetVerification, () =>
        toast.error('Failed to generate banking connect link. Please try again.'),
      );
    } catch {
      // Apollo onError already surfaced the user-facing toast; swallow the network rejection
    }
  }

  // ENG-1891: because assetStatus is forced to 'verified' above, `canSend` is
  // always false and the `not_started` / `pending` JSX branches + the "Send
  // Banking Connect" button below never render in the demo. They are retained
  // (not deleted) so the real Argyle send/poll flow can be re-enabled by dropping
  // the hardcoded `true` in resolveAssetStatus once AVS federation is wired.
  const canSend = assetStatus === 'not_started' || assetStatus === 'failed';
  const busy = gettingUrl || requesting;

  const avsStatusConfig: Record<AssetDisplayStatus, { label: string; className: string }> = {
    not_started: { label: 'Not Started', className: 'bg-slate-50 text-slate-600 border-slate-200' },
    pending: { label: 'Pending', className: BADGE_PENDING },
    verified: { label: 'Returned', className: BADGE_PASS },
    failed: { label: 'Failed', className: BADGE_FAIL },
  };

  const resourceRows: ResourceRow[] = [
    {
      category: 'Savings / Checking',
      reported: `${currency(countable)} (${savingsRows.length} account${savingsRows.length === 1 ? '' : 's'})`,
      status: 'Verified via AVS',
      ok: true,
    },
    { category: 'Life Insurance', reported: 'None reported', status: 'No further action', ok: true },
    { category: 'Real Property', reported: 'None reported', status: 'No further action', ok: true },
    { category: 'Vehicles', reported: 'None reported', status: 'No further action', ok: true },
    { category: 'Additional Accounts', reported: 'None returned by AVS', status: 'No further action', ok: true },
  ];

  return (
    <div className="space-y-5">
      {/* ── Asset Verification ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: PLACEHOLDER_LABEL }}>
            Asset Verification
          </p>
          {canSend && !isSandbox && (
            <button
              aria-label="Send Banking Connect"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setDialogOpen(true)}
              disabled={busy}
            >
              Send Banking Connect →
            </button>
          )}
        </div>

        <div className="bg-card border border-border shadow-sm rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <p className="text-sm font-semibold text-foreground">AVS Query Results</p>
            <span
              className={cn(
                'inline-flex items-center font-medium rounded-md text-[10px] px-1.5 py-0.5 border',
                avsStatusConfig[assetStatus].className,
              )}
            >
              {avsStatusConfig[assetStatus].label}
            </span>
          </div>

          {assetStatus === 'not_started' && (
            <div className="px-4 pb-3 border-b border-border">
              <p className="text-xs text-muted-foreground">
                No banking connection initiated. Send the banking connect link to start AVS.
              </p>
            </div>
          )}

          {assetStatus === 'pending' && (
            <div className="px-4 pb-3 border-b border-border">
              <p className="text-xs text-muted-foreground">Banking connect link sent · Awaiting applicant connection</p>
            </div>
          )}

          {assetStatus === 'verified' && (
            <>
              <div className="px-4 pb-3 border-b border-border">
                <p className="text-xs text-muted-foreground">
                  Accounts Queried:{' '}
                  <span className="text-foreground font-medium">
                    {savingsRows.length} financial institution{savingsRows.length !== 1 ? 's' : ''}
                  </span>{' '}
                  · Result:{' '}
                  <span className="text-foreground font-medium">
                    {savingsRows.length} deposit account{savingsRows.length !== 1 ? 's' : ''} found — consistent with
                    attestation
                  </span>
                </p>
              </div>

              {savingsRows.map((row, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3 border-b border-border">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground capitalize">{row.accountType} Account</p>
                    <p className="text-xs text-muted-foreground">
                      {row.institutionName}
                      {row.lastFour ? ` · Account ending ${row.lastFour}` : ''}
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-foreground w-16 text-right flex-shrink-0">
                    {currency(row.balance)}
                  </p>
                  <span
                    className={cn(
                      'inline-flex items-center font-medium rounded-md text-[10px] px-1.5 py-0.5 border',
                      BADGE_PASS,
                    )}
                  >
                    Verified
                  </span>
                </div>
              ))}

              <div className="px-4 py-2 bg-muted/30 text-xs text-muted-foreground">
                No additional accounts identified by AVS.
              </div>
            </>
          )}
          {/* ENG-1891: the "ABD Asset Test" pass/fail (countable resources vs. the
              SSI resource standard) was removed from Verify — it is an evaluation
              test, not verification evidence. Verify shows only the confirmed AVS
              results; the resource test lives in the Evaluate rule trace. */}
        </div>
      </section>

      {/* ── Resource Categories Reviewed ────────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: PLACEHOLDER_LABEL }}>
          Resource Categories Reviewed
        </p>
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
            <span className="col-span-5">Category</span>
            <span className="col-span-4">Reported</span>
            <span className="col-span-3 text-right">Status</span>
          </div>
          {resourceRows.map((row) => (
            <div
              key={row.category}
              className="grid grid-cols-12 items-center px-4 py-2.5 gap-2 border-b border-border last:border-0"
            >
              <p className="col-span-5 text-xs font-semibold text-foreground">{row.category}</p>
              <p className="col-span-4 text-xs text-muted-foreground">{row.reported}</p>
              <div className="col-span-3 flex justify-end">
                <span
                  className={cn(
                    'inline-flex items-center font-medium rounded-md text-[10px] px-1.5 py-0.5 border',
                    BADGE_PASS,
                  )}
                >
                  {row.status} ✓
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── LTC Look-Back Period (60 months) ────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: PLACEHOLDER_LABEL }}>
          LTC Look-Back Period (60 months)
        </p>
        <div className="bg-card rounded-lg border border-border shadow-sm p-4">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs font-semibold text-foreground">Review Period: 03/2021 — 02/2026</p>
              <p className="text-xs text-muted-foreground">
                Auto-run on Non-MAGI ABD routing · Source: State HHS records
              </p>
            </div>
            <span
              className={cn(
                'inline-flex items-center font-medium rounded-md text-[10px] px-1.5 py-0.5 border',
                BADGE_PASS,
              )}
            >
              Clean
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2 bg-muted/30 rounded-md px-3 py-2 border border-border">
            <Check className="w-3.5 h-3.5" style={{ color: 'var(--civic-accent-text)' }} aria-hidden="true" />
            <p className="text-xs text-muted-foreground font-medium">
              No uncompensated transfers identified — no penalty period applies
            </p>
          </div>
        </div>
      </section>

      {/* ── COLA Disregard Evaluation ───────────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: PLACEHOLDER_LABEL }}>
          COLA Disregard Evaluation
        </p>
        <div className="bg-card rounded-lg border border-border shadow-sm p-4">
          <p className="text-xs font-semibold text-foreground mb-1">Not applicable — new applicant</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Income is below the ABD income standard at initial determination. COLA disregard applies only when an annual
            Social Security cost-of-living adjustment has put a current beneficiary over the income standard.
          </p>
        </div>
      </section>

      {/* ── Disability Determination — tracks the DDS workflow ──────────────
          Storyboard's per-state card stack (Robert Mitchell): amber pending →
          blue "packet prepared" (ddsReferred) → green "disability confirmed"
          (ddsConfirmed). One card renders at a time, in this section. */}
      <section id="dds-packet-section">
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: PLACEHOLDER_LABEL }}>
          Disability Determination
        </p>
        {ddsConfirmed ? (
          // Storyboard's ddsConfirmed card: blue accent card (bg-accent-3 /
          // text-accent-11) with a TEAL "Confirmed" badge — the card stays
          // blue; only the badge flips to the confirmed (green) treatment.
          <div className="bg-blue-50 border border-blue-200 rounded-lg shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-blue-200">
              <p className="text-xs font-semibold text-blue-800">✓ Disability Confirmed by DDS</p>
              <span className="inline-flex items-center font-medium rounded-md text-[10px] px-1.5 py-0.5 border whitespace-nowrap bg-green-50 text-green-700 border-green-200">
                Confirmed
              </span>
            </div>
            <div className="px-4 py-3 space-y-3 text-xs">
              <div>
                <p className="font-semibold text-foreground mb-1">Referral packet contents</p>
                <ul className="text-muted-foreground space-y-0.5 ml-1">
                  <li>✓ Identifying information form — completed</li>
                  <li>✓ DDS referral form (Form A-0443) — completed</li>
                  <li>✓ Medical records authorization — completed</li>
                  <li>✓ SSA Title II benefit verification — attached</li>
                </ul>
              </div>
              <div className="pt-2 border-t border-blue-200">
                <p className="font-semibold text-foreground mb-1">DDS Response</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div>
                    <span className="text-muted-foreground">Decision: </span>
                    <span className="text-foreground font-medium">Disability CONFIRMED</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">DDS Case ID: </span>
                    <span className="text-foreground font-medium">{DDS_DETERMINATION_REF}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Basis: </span>
                    <span className="text-foreground font-medium">Medical evidence supports functional limitation</span>
                  </div>
                </div>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                All eligibility criteria now pass. Validate to assign the ABD category and proceed to determination.
              </p>
            </div>
          </div>
        ) : ddsReferralSent ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-blue-200">
              <p className="text-xs font-semibold text-blue-800">✓ DDS Referral Packet Prepared</p>
              <span className="inline-flex items-center font-medium rounded-md text-[10px] px-1.5 py-0.5 border whitespace-nowrap bg-blue-100 text-blue-800 border-blue-300">
                Submitted · Awaiting DDS
              </span>
            </div>
            <div className="px-4 py-3 space-y-3 text-xs">
              <div>
                <p className="font-semibold text-foreground mb-1">Referral packet contents</p>
                <ul className="text-muted-foreground space-y-0.5 ml-1">
                  <li>✓ Identifying information form — completed</li>
                  <li>✓ DDS referral form (Form A-0443) — completed</li>
                  <li>✓ Medical records authorization — completed</li>
                  <li>✓ SSA Title II benefit verification — attached</li>
                </ul>
              </div>
              <div className="pt-2 border-t border-blue-200 grid grid-cols-2 gap-x-4 gap-y-1">
                <div>
                  <span className="text-muted-foreground">Forwarded to: </span>
                  <span className="text-foreground font-medium">State Disability Determination Services</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Referral date: </span>
                  <span className="text-foreground font-medium">{DEMO_TODAY_DISPLAY}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Case status: </span>
                  <span className="text-foreground font-medium">Open — pending DDS decision</span>
                </div>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {applicantFirstName || 'The applicant'} remains eligible on all financial criteria. Case stays open
                pending disability confirmation.
              </p>
            </div>
          </div>
        ) : (
          <div
            className="rounded-lg border shadow-sm overflow-hidden"
            style={{
              backgroundColor: 'var(--civic-warning-bg)',
              borderColor: 'var(--civic-amber-6)',
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: 'var(--civic-amber-6)' }}
            >
              <p className="text-xs font-semibold" style={{ color: 'var(--civic-warning-text)' }}>
                Disability Status
              </p>
              <span
                className="inline-flex items-center gap-1 font-medium rounded-md text-[10px] px-1.5 py-0.5 border"
                style={{
                  backgroundColor: 'var(--civic-amber-3)',
                  color: 'var(--civic-warning-text)',
                  borderColor: 'var(--civic-amber-7, #e9c162)',
                }}
              >
                <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                Pending
              </span>
            </div>
            <div className="px-4 py-3 space-y-3 text-xs">
              <div>
                <p className="font-semibold text-foreground mb-1">SSA Query Result</p>
                <p className="leading-relaxed" style={{ color: 'var(--civic-text-secondary)' }}>
                  Title II benefit: {currency(income)}/mo (verified) · Disability case status: PENDING · No prior
                  favorable disability determination on file
                </p>
              </div>
              <div className="pt-2 border-t" style={{ borderColor: 'var(--civic-amber-6)' }}>
                <p className="font-semibold text-foreground mb-1">Action Required</p>
                <p className="leading-relaxed mb-2" style={{ color: 'var(--civic-text-secondary)' }}>
                  Caseworker must prepare Disability Determination Services (DDS) referral packet. Because the applicant
                  is otherwise eligible on financial criteria (income PASS, assets PASS), the case remains open pending
                  the DDS decision.
                </p>
                <p className="font-semibold text-foreground mb-1">DDS Referral Packet</p>
                <ul className="space-y-0.5 ml-1" style={{ color: 'var(--civic-text-secondary)' }}>
                  <li>☐ Identifying information form</li>
                  <li>☐ DDS referral form (Form A-0443)</li>
                  <li>☐ Medical records authorization</li>
                  <li>☐ Available medical documentation</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ENG-1891: the "Non-MAGI Eligibility Criteria" table was removed from Verify
          — it duplicated the criteria roll-up that the SectionedRuleTrace already
          owns in the Evaluate step. Verify confirms the evidence; Evaluate owns the
          pass/fail criteria. */}

      <ArgyleSendDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleSendConfirm}
        title="Send banking connect link?"
        description="The applicant will receive a link to connect their bank account for asset verification."
        recipientPhone={phone}
        recipientEmail={email}
        expiryNote="They have 1 hour to complete it."
        loading={busy}
      />
    </div>
  );
}
