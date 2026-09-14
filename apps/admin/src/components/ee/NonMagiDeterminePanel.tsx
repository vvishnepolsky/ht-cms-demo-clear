/**
 * NonMagiDeterminePanel — Determine-phase content for Non-MAGI ABD cases.
 * Mirrors the storyboard's DecidePanel:
 *
 *   - Pre-validation: Pending DDS warning callout + locked Determination card
 *     (three radios, disabled until DDS confirms disability).
 *   - DDS confirmed: green ABD Eligible success view.
 *   - Validated (abd_assigned): the DecisionHero eligibility-determination
 *     summary card — ready for "Submit Determination →" in the ActionBar.
 *
 * Program Enrollment intentionally does NOT render on the Determine step
 * (matches the storyboard's decide step, which shows only the decision
 * content; program status lives on the dashboard / completed views).
 */

import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { currency, readSsaVerifiedSsdiIncome, readCitizenEnteredCountableResources } from '../../lib/ee-utils';
import { ABD_INCOME_LIMIT } from './AbdIncomeTest';
import type { EECase } from '../../types/ee';

const PLACEHOLDER_LABEL = 'var(--civic-text-placeholder)';

// DDS workflow label — referenced in the success card here and in
// NonMagiDeterminePanel.test.tsx assertions; exported so tests can import it.
export const ABD_ELIGIBLE_LABEL = 'ABD Eligible' as const;

export interface NonMagiDeterminePanelProps {
  eeCase: EECase;
  /**
   * True once the caseworker has clicked "Refer to DDS" — flips the panel
   * from the initial "Pending DDS" view to the "Referral sent — awaiting
   * determination" view. Defaults to false to preserve the existing static
   * render for callers that haven't wired DDS state yet.
   */
  ddsReferralSent?: boolean;
  /**
   * True once the caseworker has clicked "Confirm DDS Decision" — flips the
   * panel to the final "ABD Eligible" success view (green callout + green
   * success card). Defaults to false.
   */
  ddsConfirmed?: boolean;
  /**
   * True once the caseworker has clicked "Validate" — replaces the panel with
   * the storyboard's DecisionHero card (abd_assigned state): eligibility
   * determination summary, ready to submit. Defaults to false.
   */
  ddsValidated?: boolean;
}

// Demo-static enrollment facts shown in the DecisionHero — the MMIS/member-ID
// federation isn't wired to the EE service yet (matches the storyboard's
// MC-114488912 demo value).
const DEMO_MEDICAID_ID = 'MC-114488912' as const;

function fmtMDY(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Coverage end = application date + 12 months − 1 day (storyboard's cert period). */
function coverageEnd(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

export function NonMagiDeterminePanel({
  eeCase,
  ddsReferralSent = false,
  ddsConfirmed = false,
  ddsValidated = false,
}: NonMagiDeterminePanelProps) {
  // SSA Title II (SSDI) benefit — the SSA-verified figure the Verify-phase SSA
  // panel shows: per-case override or the reported figure (Dorothy/Miguel
  // preserved). No fabricated benefit — a $0-report case with no SSDI
  // determination yet (Robert) reads $0 (ENG-2039/2041).
  const ssdiMonthly = readSsaVerifiedSsdiIncome(eeCase);

  // ── Validated state — storyboard's DecisionHero (abd_assigned) ──────────
  // After caseworker validation the panel is replaced by the prominent
  // eligibility-determination summary card; the "Submit Determination →"
  // CTA in the bottom ActionBar finalizes the case from here.
  const fplPercent = Math.round((ssdiMonthly / ABD_INCOME_LIMIT) * 100);
  const countable = readCitizenEnteredCountableResources(eeCase);
  const heroRows: ReadonlyArray<[string, string]> = [
    ['Category', 'ABD — Disabled'],
    ['Basis', 'DDS disability determination + financial criteria'],
    ['Income / Assets', `${currency(ssdiMonthly)}/mo · ${currency(countable)} — both PASS`],
    ['Effective date', `${fmtMDY(eeCase.createdAt)} (application date)`],
    ['Coverage period', `12 months — through ${coverageEnd(eeCase.createdAt)}`],
    ['Medicaid ID', `${DEMO_MEDICAID_ID} (permanent)`],
    ['Delivery system', 'Fee-for-Service (FFS)'],
    ['MMIS transmission', 'Queued'],
  ];
  const decisionHero = (
    <div className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-1"
            style={{ color: PLACEHOLDER_LABEL }}
          >
            Eligibility Determination
          </p>
          <p className="text-xl font-bold text-foreground leading-tight">Non-MAGI ABD — Disabled</p>
          <p className="text-xs text-muted-foreground mt-0.5">Aged, Blind &amp; Disabled · ≈{fplPercent}% FPL</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-600 text-white">
            <span aria-hidden="true">⏱</span>
            <span>Ready to submit</span>
          </span>
          <p className="text-[11px] text-blue-800 text-right max-w-[220px] leading-snug">
            DDS confirmed disability. All eligibility criteria met. Caseworker validation complete.
          </p>
        </div>
      </div>
      <div className="border-t border-blue-200 bg-card/50 px-5 py-3 grid grid-cols-2 gap-x-6 gap-y-2">
        {heroRows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 text-xs min-w-0">
            <span className="text-muted-foreground flex-shrink-0">{k}</span>
            <span className="text-foreground font-medium text-right break-words min-w-0">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* ── Validated: DecisionHero replaces the callout + determination
            card (storyboard abd_assigned decide step) ─────────────────── */}
      {ddsValidated ? (
        decisionHero
      ) : (
        <>
          {/* ── DDS status callout ────────────────────────────────────────── */}
          {ddsConfirmed ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold text-green-800">
                    DDS confirmed disability — ABD category assigned
                  </p>
                  <p className="text-xs text-green-800 mt-1 leading-relaxed">
                    Disability determination returned favorable from State DDS. Non-MAGI ABD eligibility unlocked;
                    notice queued for delivery.
                  </p>
                </div>
              </div>
            </div>
          ) : ddsReferralSent ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">DDS referral sent — awaiting determination</p>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    Referral packet transmitted to State DDS. Case held pending DDS decision; financial criteria already
                    passed.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">Pending DDS disability determination</p>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    Financial criteria passed — determination will complete when disability is confirmed by State DDS.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Determination card ──────────────────────────────────────────── */}
          {ddsConfirmed ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold text-green-800">{ABD_ELIGIBLE_LABEL}</p>
                  <p className="text-xs text-green-800 mt-1 leading-relaxed">
                    Approved — Non-MAGI ABD Eligible. Audit trail complete: SSA pending → DDS referral sent → DDS
                    confirmed → ABD assigned.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-border p-4 shadow-sm opacity-40 pointer-events-none select-none">
              <p className="text-xs font-semibold text-foreground mb-3">
                Determination — locked until DDS confirms disability
              </p>
              <div className="space-y-2">
                {/* aria-label omitted: each input is already wrapped in a <label>
                whose text content is the accessible name. Adding aria-label
                on the input would shadow the richer label text (a11y rule 1). */}
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="radio" disabled /> Approve — Non-MAGI ABD Eligible
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="radio" disabled /> Deny — Reason required
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="radio" disabled /> Pend — Additional information needed
                </label>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
