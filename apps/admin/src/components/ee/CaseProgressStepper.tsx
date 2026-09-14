import { Fragment } from 'react';
import { cn } from '../../lib/utils';
import type { EECaseStatus } from '../../types/ee';

export type CasePhase = 'verify' | 'evaluate' | 'determine';

type StepState = 'complete' | 'active' | 'pending' | 'locked';

interface Step {
  id: CasePhase;
  label: string;
  state: StepState;
}

function deriveSteps(status: EECaseStatus, isNonMagi: boolean, ddsValidated: boolean): Step[] {
  if (status === 'APPROVED') {
    return [
      { id: 'verify', label: 'Verify', state: 'complete' },
      { id: 'evaluate', label: 'Evaluate', state: 'complete' },
      { id: 'determine', label: 'Determine', state: 'complete' },
    ];
  }

  if (status === 'PENDING_VERIFICATION') {
    return [
      { id: 'verify', label: 'Verify', state: 'active' },
      { id: 'evaluate', label: 'Evaluate', state: 'pending' },
      { id: 'determine', label: 'Determine', state: 'locked' },
    ];
  }

  if (status === 'IN_REVIEW' && isNonMagi) {
    // After caseworker validation (storyboard abd_assigned) Verify and
    // Evaluate are both complete — only the determination remains.
    if (ddsValidated) {
      return [
        { id: 'verify', label: 'Verify', state: 'complete' },
        { id: 'evaluate', label: 'Evaluate', state: 'complete' },
        { id: 'determine', label: 'Determine', state: 'active' },
      ];
    }
    return [
      { id: 'verify', label: 'Verify', state: 'complete' },
      { id: 'evaluate', label: 'Evaluate', state: 'active' },
      { id: 'determine', label: 'Determine', state: 'pending' },
    ];
  }

  // IN_REVIEW MAGI — verifications complete, ready to determine.
  return [
    { id: 'verify', label: 'Verify', state: 'complete' },
    { id: 'evaluate', label: 'Evaluate', state: 'complete' },
    { id: 'determine', label: 'Determine', state: 'active' },
  ];
}

const SUBTITLE_BY_PHASE: Record<CasePhase, { magi: string; nonMagi: string }> = {
  verify: {
    magi: 'Income verification, identity checks, and data source reconciliation',
    nonMagi: 'Asset verification and SSA income sources',
  },
  evaluate: {
    magi: 'Coverage group evaluation, EDBC rule engine, and program matching',
    nonMagi: '',
  },
  determine: {
    magi: 'Caseworker review and final eligibility determination',
    nonMagi: 'Caseworker review and final eligibility determination',
  },
};

function phaseSubtitle(phase: CasePhase, isNonMagi: boolean, status: EECaseStatus): string {
  if (status === 'APPROVED') {
    return 'All steps complete — determination issued';
  }
  return isNonMagi ? SUBTITLE_BY_PHASE[phase].nonMagi : SUBTITLE_BY_PHASE[phase].magi;
}

export interface CaseProgressStepperProps {
  status: EECaseStatus;
  isNonMagi: boolean;
  /** Explicit phase override — when set, this step renders as active in the visual. */
  activePhase?: CasePhase;
  /** When provided, non-locked steps become clickable and emit the selected phase. */
  onPhaseChange?: (phase: CasePhase) => void;
  /** True once the caseworker validated the DDS result — Verify AND Evaluate
   *  render complete (✓), with Determine active (storyboard abd_assigned). */
  ddsValidated?: boolean;
}

export function CaseProgressStepper({
  status,
  isNonMagi,
  activePhase,
  onPhaseChange,
  ddsValidated = false,
}: CaseProgressStepperProps) {
  const baseSteps = deriveSteps(status, isNonMagi, ddsValidated);
  // When activePhase is set, override visual "active" — but keep the original
  // complete/locked states. The previously-active step (auto-derived) just
  // becomes "pending" so it doesn't show as active alongside the override.
  const steps: Step[] = activePhase
    ? baseSteps.map((s) => {
        if (s.id === activePhase && s.state !== 'locked') return { ...s, state: 'active' };
        if (s.state === 'active' && s.id !== activePhase) return { ...s, state: 'pending' };
        return s;
      })
    : baseSteps;

  const activeStep = steps.find((s) => s.state === 'active');
  const subtitle = activeStep ? phaseSubtitle(activeStep.id, isNonMagi, status) : '';

  return (
    <div className="bg-card border-b border-border px-6 py-3.5 flex-shrink-0">
      <nav aria-label="Case progress">
        {/* Steps are flex-shrink-0 so they hug their content; the connectors
            between them are flex-1 and split the remaining width evenly. This
            mirrors the storyboard's HorizontalStepper layout — wrapping each
            step+leading-connector in its own flex-1 container would distribute
            space per-step and produce asymmetric connectors. */}
        <div className="flex items-center w-full max-w-4xl mx-auto">
          {steps.map((step, idx) => {
            const isClickable =
              !!onPhaseChange && (step.state === 'complete' || step.state === 'active' || step.state === 'pending');
            const isActive = step.state === 'active';
            const isLast = idx === steps.length - 1;

            return (
              <Fragment key={step.id}>
                <button
                  type="button"
                  onClick={isClickable ? () => onPhaseChange?.(step.id) : undefined}
                  disabled={!isClickable}
                  title={step.state === 'locked' ? 'Locked — complete previous steps first' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 flex-shrink-0 px-1 py-0.5 rounded-md',
                    isClickable && 'cursor-pointer hover:bg-muted/50 transition-colors',
                    !isClickable && step.state === 'locked' && 'cursor-not-allowed',
                    !isClickable && step.state !== 'locked' && 'cursor-default',
                  )}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {step.state === 'complete' ? (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--civic-success-solid)' }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : isActive ? (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--civic-accent-solid)' }}
                    >
                      <span className="text-xs font-bold text-white">{idx + 1}</span>
                    </div>
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-white border-2"
                      style={{ borderColor: 'var(--civic-border-strong)' }}
                    >
                      <span className="text-xs" style={{ color: 'var(--civic-text-placeholder)' }}>
                        {idx + 1}
                      </span>
                    </div>
                  )}

                  <span
                    className={cn(
                      'text-sm whitespace-nowrap',
                      isActive
                        ? 'font-semibold text-foreground'
                        : step.state === 'complete'
                          ? 'font-medium text-foreground'
                          : 'font-medium text-muted-foreground',
                    )}
                  >
                    {step.label}
                  </span>
                </button>

                {!isLast && (
                  <div className="flex-1 flex items-center px-2 min-w-[20px]" aria-hidden="true">
                    <div
                      className="w-full h-px"
                      style={{
                        backgroundColor:
                          step.state === 'complete'
                            ? 'var(--civic-success-solid)'
                            : 'var(--civic-border-strong, #d1d5db)',
                      }}
                    />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>

        {subtitle && <p className="text-xs text-muted-foreground mt-2.5 max-w-4xl mx-auto">{subtitle}</p>}
      </nav>
    </div>
  );
}
