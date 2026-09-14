/**
 * RecommendationCard — one Case Assist recommendation: severity stripe,
 * title, body, "Why" rationale with cited field paths as monospace chips,
 * and the suggested actions as a checklist.
 *
 * Actions the caller knows how to perform (`onAction` returns true) render
 * as buttons; anything else is a local checklist item the caseworker can
 * tick off for the session.
 */

import { useState } from 'react';
import { AlertOctagon, AlertTriangle, ChevronDown, Info, Square, SquareCheck } from 'lucide-react';
import type { CaseAssistRecommendation } from '../../../types/ee';
import { cn } from '../../../lib/utils';

const SEVERITY: Record<string, { rail: string; bg: string; text: string; label: string; Icon: typeof Info }> = {
  critical: {
    rail: 'var(--civic-error-solid, #dc2626)',
    bg: 'var(--civic-error-bg, rgb(254 242 242))',
    text: 'var(--civic-error-text, #991b1b)',
    label: 'Critical',
    Icon: AlertOctagon,
  },
  warning: {
    rail: 'var(--civic-warning-solid, #d97706)',
    bg: 'var(--civic-warning-bg, rgb(255 251 235))',
    text: 'var(--civic-warning-text, #92400e)',
    label: 'Warning',
    Icon: AlertTriangle,
  },
  info: {
    rail: 'var(--civic-info-solid, #2563eb)',
    bg: 'var(--civic-info-bg, rgb(239 246 255))',
    text: 'var(--civic-info-text, #1e3a8a)',
    label: 'Info',
    Icon: Info,
  },
};

const SOURCE_LABELS: Record<string, string> = {
  verify_assist: 'Verify Assist · CLEAR',
  rules: 'Rules engine',
  intake: 'Application intake',
};

export interface RecommendationCardProps {
  recommendation: CaseAssistRecommendation;
  /**
   * Perform a suggested action. Return true when the action was handled
   * (renders as a button); false/undefined leaves it as a checklist item.
   */
  onAction?: (recommendation: CaseAssistRecommendation, action: string) => boolean;
  /** Which actions the caller can perform — decides button vs checklist rendering. */
  canPerform?: (recommendation: CaseAssistRecommendation, action: string) => boolean;
  /** Start expanded (critical recommendations default to open). */
  defaultOpen?: boolean;
}

export function RecommendationCard({ recommendation: rec, onAction, canPerform, defaultOpen }: RecommendationCardProps) {
  const sev = SEVERITY[rec.severity] ?? SEVERITY.info;
  const [open, setOpen] = useState(defaultOpen ?? rec.severity === 'critical');
  const [done, setDone] = useState<Record<string, boolean>>({});
  const bodyId = `case-assist-rec-${rec.id}`;

  return (
    <article
      className="rounded-lg border border-border bg-card shadow-sm overflow-hidden"
      style={{ borderLeft: `4px solid ${sev.rail}` }}
      aria-labelledby={`${bodyId}-title`}
      data-severity={rec.severity}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        <span
          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ backgroundColor: sev.bg, color: sev.text }}
          aria-hidden="true"
        >
          <sev.Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-1 py-px rounded"
              style={{ backgroundColor: sev.bg, color: sev.text }}
            >
              {sev.label}
            </span>
            <span className="text-[10px] text-muted-foreground">
              P{rec.priority} · {SOURCE_LABELS[rec.source] ?? rec.source}
            </span>
          </span>
          <span id={`${bodyId}-title`} className="block text-sm font-semibold text-foreground leading-snug mt-0.5">
            {rec.title}
          </span>
        </span>
        <ChevronDown
          className={cn('w-4 h-4 text-muted-foreground flex-shrink-0 mt-1 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div id={bodyId} className="px-3 pb-3 space-y-3">
          <p className="text-xs text-foreground leading-relaxed">{rec.body}</p>

          {/* Why */}
          <div className="rounded-md bg-muted/40 border border-border px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Why</p>
            <p className="text-xs text-foreground leading-relaxed">{rec.rationale.summary}</p>
            {rec.rationale.citedFieldPaths.length > 0 && (
              <ul className="flex flex-wrap gap-1 mt-1.5" aria-label="Cited fields">
                {rec.rationale.citedFieldPaths.map((path) => (
                  <li
                    key={path}
                    className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-card text-muted-foreground"
                  >
                    {path}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Suggested actions */}
          {rec.suggestedActions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Suggested actions
              </p>
              <ul className="space-y-1">
                {rec.suggestedActions.map((action) => {
                  const performable = canPerform?.(rec, action) ?? false;
                  if (performable) {
                    return (
                      <li key={action}>
                        <button
                          type="button"
                          onClick={() => onAction?.(rec, action)}
                          className="w-full text-left text-xs font-semibold px-2.5 py-1.5 rounded-md border transition-colors hover:brightness-95"
                          style={{ backgroundColor: sev.bg, color: sev.text, borderColor: sev.rail }}
                        >
                          {action} →
                        </button>
                      </li>
                    );
                  }
                  const checked = !!done[action];
                  return (
                    <li key={action}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => setDone((d) => ({ ...d, [action]: !checked }))}
                        className={cn(
                          'w-full flex items-start gap-2 text-left text-xs px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors',
                          checked ? 'text-muted-foreground line-through' : 'text-foreground',
                        )}
                      >
                        {checked ? (
                          <SquareCheck className="w-3.5 h-3.5 mt-px flex-shrink-0 text-green-700" aria-hidden="true" />
                        ) : (
                          <Square className="w-3.5 h-3.5 mt-px flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span>{action}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
