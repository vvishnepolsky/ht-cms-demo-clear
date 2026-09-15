/**
 * IdentityVerificationCard — Verify-step card for the CLEAR / Verify Assist
 * identity verification linked to the case.
 *
 * Sections:
 *   - Header: CLEAR provider mark, status badge, completed time, mode chip
 *   - Checks: selfie_liveness / document_authenticity / selfie_document_match
 *     (renders whatever check names arrive) with green/red icons
 *   - Document: type, issuing state, number last-4 (SensitiveValue), expiration
 *   - Verified identity: name, DOB (SensitiveValue), address
 *   - Checks footer: server-curated summary ("8 identity checks passed · …")
 *   - "Coverage discovered" sub-card when the coverage check found active
 *     out-of-state Medicaid (payer, plan status, member id, start date, and
 *     the applicant's self-resolution mapped to friendly text) — red while the
 *     Verify Assist flag is open, neutral with a Resolved/Dismissed tag after
 *
 * Pure renderer — no data fetching. WorkspacePage passes
 * `eeCase.identityVerification`.
 */

import { CheckCircle2, Clock, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { isFlagClosed } from './case-assist/OutOfStateCoverageCard';
import type { IdentityVerification, VerificationCheck } from '../../types/ee';
import { cn, DASH, fmtDate } from '../../lib/utils';
import { SensitiveValue } from './SensitiveValue';

const PLACEHOLDER_LABEL = 'var(--civic-text-placeholder)';

const CHECK_LABELS: Record<string, string> = {
  selfie_liveness: 'Selfie liveness',
  document_authenticity: 'Document authenticity',
  selfie_document_match: 'Selfie ↔ document match',
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  drivers_license: "Driver's license",
  state_id: 'State ID',
  passport: 'Passport',
};

const RESOLUTION_LABELS: Record<string, string> = {
  ended_submit_proof: 'Applicant says the coverage has ended and will submit proof of disenrollment.',
  confirm_enrolled: 'Applicant confirmed they are still enrolled in the other state’s Medicaid.',
};

function humanize(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function checkLabel(name: string): string {
  return CHECK_LABELS[name] ?? humanize(name);
}

export function documentTypeLabel(type: string | null | undefined): string {
  if (!type) return DASH;
  return DOCUMENT_TYPE_LABELS[type] ?? humanize(type);
}

export function resolutionLabel(resolution: string | null | undefined): string | null {
  if (!resolution) return null;
  return RESOLUTION_LABELS[resolution] ?? humanize(resolution);
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
    success: { label: 'Verified', cls: 'bg-green-50 text-green-700 border-green-200', Icon: ShieldCheck },
    failed: { label: 'Failed', cls: 'bg-red-50 text-red-700 border-red-200', Icon: ShieldAlert },
    expired: { label: 'Expired', cls: 'bg-red-50 text-red-700 border-red-200', Icon: ShieldAlert },
    in_progress: { label: 'In progress', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
    awaiting_user: { label: 'Awaiting applicant', cls: 'bg-gray-100 text-gray-600 border-gray-200', Icon: Clock },
  };
  const s = map[status] ?? { label: humanize(status), cls: 'bg-gray-100 text-gray-600 border-gray-200', Icon: Clock };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        s.cls,
      )}
    >
      <s.Icon className="w-3 h-3" aria-hidden="true" />
      {s.label}
    </span>
  );
}

function CheckRow({ check }: { check: VerificationCheck }) {
  const ok = check.status === 'success';
  const pending = !ok && check.status !== 'failed';
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2">
      <span className="text-xs text-foreground">{checkLabel(check.name)}</span>
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[11px] font-semibold',
          ok ? 'text-green-700' : pending ? 'text-amber-700' : 'text-red-700',
        )}
      >
        {ok ? (
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
        ) : pending ? (
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
        ) : (
          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
        )}
        {ok ? 'Passed' : pending ? humanize(check.status) : 'Failed'}
      </span>
    </li>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  const display = value === null || value === undefined || value === '' ? DASH : value;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn('text-xs text-foreground leading-snug mt-0.5', mono && 'font-mono')}>{display}</dd>
    </div>
  );
}

export interface IdentityVerificationCardProps {
  identityVerification: IdentityVerification;
}

export function IdentityVerificationCard({ identityVerification: iv }: IdentityVerificationCardProps) {
  const doc = iv.traits?.document ?? null;
  const det = iv.determination ?? null;
  const coverage = det?.coverage ?? null;
  const duplicate = det?.duplicate_enrollment === true;
  const verified = iv.status === 'success';
  // Red only while the Verify Assist flag is open / in review; once resolved or
  // dismissed the coverage block stays as evidence but renders neutral.
  const findingClosed = duplicate && isFlagClosed(iv.flag);
  const closedLabel = iv.flag?.status === 'dismissed' ? 'Dismissed' : 'Resolved';

  const fullName =
    [doc?.first_name, doc?.middle_name, doc?.last_name].filter(Boolean).join(' ') || iv.subjectName || DASH;
  const addressLine1 = [doc?.address_line1, doc?.address_line2].filter(Boolean).join(', ');
  const addressLine2 = [doc?.city, doc?.state].filter(Boolean).join(', ') + (doc?.postal_code ? ` ${doc.postal_code}` : '');
  const resolution = resolutionLabel(iv.resolution);

  return (
    <section aria-label="Identity verification (CLEAR)" data-slot="identity-verification-card">
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: PLACEHOLDER_LABEL }}>
        Identity Verification
      </p>
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center rounded-md px-1.5 h-6 text-[11px] font-black tracking-[0.18em] text-white"
              style={{ backgroundColor: '#041E42' }}
            >
              CLEAR
            </span>
            <p className="text-xs font-semibold text-foreground truncate">
              Verify Assist · {iv.provider}
              {iv.mode && iv.mode !== 'sandbox' && (
                <span className="ml-1.5 text-[10px] font-medium uppercase text-muted-foreground">{iv.mode}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={iv.status} />
            <p className="text-[11px]" style={{ color: PLACEHOLDER_LABEL }}>
              {verified ? `Completed ${formatDateTime(iv.completedAt)}` : `Started ${formatDateTime(iv.createdAt)}`}
            </p>
          </div>
        </div>

        {/* Checks */}
        {iv.checks.length > 0 && (
          <ul className="divide-y divide-border border-b border-border" aria-label="Verification checks">
            {iv.checks.map((c) => (
              <CheckRow key={c.name} check={c} />
            ))}
          </ul>
        )}
        {iv.checksSummary && (
          <p
            className="px-4 py-1.5 text-[11px] text-muted-foreground border-b border-border bg-muted/20"
            data-slot="checks-summary"
          >
            {iv.checksSummary}
          </p>
        )}

        {/* Document + identity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 px-4 py-3">
          <dl className="space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Document</p>
            <Field label="Type" value={documentTypeLabel(doc?.document_type)} />
            <Field label="Issuing state" value={doc?.issuing_state} />
            <Field
              label="Number (last 4)"
              value={
                doc?.document_number_last4 ? (
                  <SensitiveValue value={doc.document_number_last4} type="last4" copyable={false} />
                ) : null
              }
            />
            <Field label="Expires" value={doc?.expiration_date ? fmtDate(doc.expiration_date) : null} />
          </dl>
          <dl className="space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Verified identity</p>
            <Field label="Name" value={fullName} />
            <Field
              label="Date of birth"
              value={doc?.date_of_birth ? <SensitiveValue value={fmtDate(doc.date_of_birth)} type="dob" copyable={false} /> : null}
            />
            <Field
              label="Address"
              value={
                addressLine1 || addressLine2.trim() ? (
                  <span>
                    {addressLine1 && <span className="block">{addressLine1}</span>}
                    {addressLine2.trim() && <span className="block">{addressLine2.trim()}</span>}
                  </span>
                ) : null
              }
            />
            {iv.traits?.ssnLast4 && <Field label="SSN" value={`•••-••-${iv.traits.ssnLast4}`} mono />}
          </dl>
        </div>

        {/* Coverage discovered — red while the finding is open, neutral once resolved/dismissed */}
        {duplicate && (
          <div
            className={cn('mx-4 mb-4 rounded-lg border p-3', findingClosed && 'border-border bg-muted/30')}
            style={
              findingClosed
                ? undefined
                : {
                    borderColor: 'var(--civic-error-solid, #dc2626)',
                    backgroundColor: 'var(--civic-error-bg, rgb(254 242 242))',
                  }
            }
            role="note"
            aria-label="Coverage discovered"
            data-slot="coverage-discovered"
            data-state={findingClosed ? 'closed' : 'open'}
          >
            <div className="flex items-center gap-2 mb-2">
              {findingClosed ? (
                <ShieldCheck className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              ) : (
                <ShieldAlert className="w-4 h-4" style={{ color: 'var(--civic-error-text, #991b1b)' }} aria-hidden="true" />
              )}
              <p
                className={cn('text-xs font-bold uppercase tracking-wider', findingClosed && 'text-muted-foreground')}
                style={findingClosed ? undefined : { color: 'var(--civic-error-text, #991b1b)' }}
              >
                Coverage discovered — {det?.payer_state_name ?? det?.payer_state ?? 'out of state'}
              </p>
              {findingClosed && (
                <span
                  className="ml-auto inline-flex items-center rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                  data-slot="coverage-finding-tag"
                >
                  {closedLabel}
                </span>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Field label="Payer" value={coverage?.payer_name ?? (det?.payer_state ? `${det.payer_state} Medicaid` : null)} />
              <Field label="Plan status" value={coverage?.plan_status} />
              <Field label="Member ID" value={coverage?.insurance_member_id} mono />
              <Field label="Coverage start" value={coverage?.coverage_start_date ? fmtDate(coverage.coverage_start_date) : null} />
              {(coverage?.policy_holder_first_name || coverage?.policy_holder_last_name) && (
                <Field
                  label="Policy holder"
                  value={[coverage?.policy_holder_first_name, coverage?.policy_holder_last_name].filter(Boolean).join(' ')}
                />
              )}
            </dl>
            <p
              className={cn('text-[11px] mt-2 leading-snug', findingClosed && 'text-muted-foreground')}
              style={findingClosed ? undefined : { color: 'var(--civic-error-text, #991b1b)' }}
            >
              <span className="font-semibold">Applicant response: </span>
              {resolution ?? 'No response recorded in the hosted flow.'}
              {iv.proofDocument && (
                <>
                  {' '}
                  Proof submitted:{' '}
                  <a
                    href={iv.proofDocument.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline underline-offset-2"
                    data-slot="identity-proof-link"
                  >
                    {iv.proofDocument.fileName}
                  </a>
                  .
                </>
              )}
              {findingClosed && iv.flag && (
                <>
                  {' '}
                  <span className="font-semibold">Finding {closedLabel.toLowerCase()}</span>
                  {iv.flag.dispositionReason ? ` — ${iv.flag.dispositionReason.replace(/_/g, ' ')}` : ''} ({fmtDate(iv.flag.updatedAt)}).
                </>
              )}
            </p>
          </div>
        )}
        {!duplicate && det && (
          <p className="px-4 pb-3 text-[11px] text-muted-foreground">
            Coverage check: no active Medicaid coverage found in another state.
          </p>
        )}
      </div>
    </section>
  );
}
