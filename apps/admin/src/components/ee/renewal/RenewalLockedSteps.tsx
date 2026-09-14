/**
 * Locked Step 2 (Evaluate) and Step 3 (Determine) content for an ex-parte
 * renewal-fallout case. Both steps are gated until the beneficiary returns the
 * pre-populated renewal form — the prototype renders them as informational
 * "locked" cards rather than live evaluation/determination surfaces.
 *
 * Extracted from RenewalPage so WorkspacePage and RenewalPage share one
 * implementation. Copy/dates come from `data/renewals.ts` (DEMO_TODAY-anchored).
 */

import { Lock } from 'lucide-react';
import { Badge, Card, CardContent } from '../../ui';
import { RENEWAL_MEMBER, COVERAGE_ENDS_DISPLAY, RESPONSE_WINDOW_DAYS } from '../../../data/renewals';

// ────────────────────────────────────────────────────────────────────────
// Step 2 — Evaluate (locked)
// ────────────────────────────────────────────────────────────────────────

export function ExParteEvaluateLocked() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <Lock aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold mb-1">Step 2: Evaluate — Locked</p>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              This step will become available when {RENEWAL_MEMBER.name} responds to the pre-populated renewal form with
              updated income information.
            </p>
            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
                <p className="text-xs font-semibold mb-0.5">If income is confirmed or updated</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  → System re-runs EDBC with current income.
                  <br />→ MAGI threshold: $1,732/mo (138% FPL, HH of 1).
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
                <p className="text-xs font-semibold mb-0.5">If no response within 30-day window</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  → Case proceeds to adverse action workflow.
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Step 3 — Determine (locked)
// ────────────────────────────────────────────────────────────────────────

const DETERMINE_FACTS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Prior category', value: 'Adult Group MAGI (Eligible)' },
  { label: 'Response window', value: `${RESPONSE_WINDOW_DAYS} days from form delivery` },
  { label: 'EDBC re-run', value: 'Triggers on form return' },
  { label: 'If no response', value: 'Closure with advance notice' },
];

export function ExParteDetermineLocked() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Eligibility Determination
      </p>
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold">Adult Group MAGI — Renewal</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Family Medicaid · 19–64 · current cert through {COVERAGE_ENDS_DISPLAY}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <Badge variant="secondary" size="sm">
              <Lock className="w-3 h-3 mr-1" aria-hidden="true" />
              Pending response
            </Badge>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-[14rem]">
              Determination locked until beneficiary returns the pre-populated renewal form.
            </p>
          </div>
        </div>
        <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs bg-muted/30">
          {DETERMINE_FACTS.map((f) => (
            <div key={f.label} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="font-medium text-right">{f.value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
