import type { ReactNode } from 'react';
import { cn } from '@/components/lib/utils';
import logoColor from '@/assets/verify-assist-logo-color.png';

export type FlowStage = 'identity' | 'coverage' | 'review';

const ALL_STAGES: Array<{ key: FlowStage; label: string }> = [
  { key: 'identity', label: 'Verify your identity' },
  { key: 'coverage', label: 'Coverage check' },
  { key: 'review', label: 'Review & return' },
];

// Providers verify identity only — there is no coverage step, so drop that
// stage from the stepper rather than maintaining a second hardcoded list.
function stagesFor(identityOnly: boolean) {
  return identityOnly ? ALL_STAGES.filter((s) => s.key !== 'coverage') : ALL_STAGES;
}

function Stepper({ current, identityOnly }: { current: FlowStage; identityOnly: boolean }) {
  const stages = stagesFor(identityOnly);
  const currentIdx = stages.findIndex((s) => s.key === current);
  return (
    <ol className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1" aria-label="Verification progress">
      {stages.map((stage, idx) => {
        const state = idx < currentIdx ? 'done' : idx === currentIdx ? 'active' : 'todo';
        return (
          <li
            key={stage.key}
            aria-current={state === 'active' ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 text-xs font-medium',
              state === 'active' && 'text-foreground',
              state === 'done' && 'text-muted-foreground',
              state === 'todo' && 'text-muted-foreground/60',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold',
                state === 'active' && 'border-primary bg-primary text-primary-foreground',
                state === 'done' && 'border-primary/40 bg-primary/10 text-primary',
                state === 'todo' && 'border-border bg-card',
              )}
            >
              {idx + 1}
            </span>
            {stage.label}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The hosted flow's chrome: Verify Assist brand bar, the three-stage stepper,
 * and a centered content column. Every step renders inside this shell.
 */
export function FlowShell({
  stage,
  externalRef,
  npi,
  identityOnly = false,
  children,
}: {
  stage: FlowStage;
  externalRef?: string | null;
  npi?: string | null;
  identityOnly?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2.5">
            <img src={logoColor} alt="" aria-hidden="true" className="h-9 w-9 shrink-0 object-contain" />
            <span>
              <span className="block text-sm leading-tight font-semibold text-foreground">Verify Assist</span>
              <span className="block text-xs leading-tight text-muted-foreground">
                Identity &amp; coverage verification
              </span>
            </span>
          </div>
          {npi ? (
            <span className="text-xs text-muted-foreground">
              NPI: <span className="font-medium text-foreground">{npi}</span>
            </span>
          ) : externalRef ? (
            <span className="text-xs text-muted-foreground">
              Application ref: <span className="font-medium text-foreground">{externalRef}</span>
            </span>
          ) : null}
        </div>
      </header>

      <div className="border-b border-border bg-card/60 py-3">
        <Stepper current={stage} identityOnly={identityOnly} />
      </div>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-border py-4">
        <p className="mx-auto max-w-2xl px-4 text-center text-xs text-muted-foreground">
          Verification results are shared with the originating agency and used for eligibility verification. Identity
          verification is powered by CLEAR.
        </p>
      </footer>
    </div>
  );
}
