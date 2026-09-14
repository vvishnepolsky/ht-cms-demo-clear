/**
 * ActionBar — sticky bottom bar matching the storyboard's CaseActionBar.
 *
 * Single status icon + status text on the left; up to three buttons on the
 * right: Add Note, Request Clarification, and one primary CTA. The
 * approve/deny choice no longer lives on the bar — it moved into
 * ReviewDecideModal triggered by the CTA. The parent owns CTA wiring.
 */

import { cn } from '../../lib/utils';

export type ActionBarTone = 'ready' | 'review' | 'waiting';

export interface ActionBarCta {
  label: string;
  onClick: () => void;
  /** Render with a dashed border + ⚙ Simulate prefix to mark demo-only state transitions. */
  demo?: boolean;
  disabled?: boolean;
}

export interface ActionBarProps {
  tone?: ActionBarTone;
  /** One-line summary text rendered next to the tone icon. */
  status?: string | null;
  /** Single primary CTA. Omit to render no primary button. */
  cta?: ActionBarCta | null;
  /** Opens an internal note modal. Omit to hide the Add Note button. */
  onAddNote?: () => void;
  /** Opens the RFI / clarification modal. Omit to hide the Request Clarification button. */
  onClarify?: () => void;
}

function ToneIcon({ tone }: { tone: ActionBarTone }) {
  // Glyphs are decorative — the adjacent status text already conveys tone
  // to assistive tech, so hide these from the accessibility tree to avoid
  // double-announce ("checkmark, ready to approve").
  if (tone === 'ready') {
    return (
      <span
        aria-hidden="true"
        className="w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-[11px] font-bold shrink-0"
      >
        ✓
      </span>
    );
  }
  if (tone === 'review') {
    return (
      <span
        aria-hidden="true"
        className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[11px] font-bold shrink-0"
      >
        !
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[11px] font-bold shrink-0"
    >
      ⏳
    </span>
  );
}

export function ActionBar({ tone = 'review', status, cta, onAddNote, onClarify }: ActionBarProps) {
  return (
    <div className="border-t-2 border-border bg-card" style={{ boxShadow: '0 -4px 12px -4px rgba(15,23,42,0.12)' }}>
      <div className="px-6 py-3 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1 py-1">
          <div className="mt-0.5">
            <ToneIcon tone={tone} />
          </div>
          {status && (
            <p
              className="text-sm text-foreground font-medium leading-snug min-w-0 flex-1"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
              title={status}
            >
              {status}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {onAddNote && (
            <button
              type="button"
              onClick={onAddNote}
              className="text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
            >
              Add Note
            </button>
          )}
          {onClarify && (
            <button
              type="button"
              onClick={onClarify}
              className="text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
            >
              Request Clarification
            </button>
          )}
          {cta && (
            <button
              type="button"
              onClick={cta.onClick}
              disabled={cta.disabled}
              className={cn(
                'text-xs font-semibold px-4 py-2 rounded-lg transition-colors',
                cta.demo
                  ? 'border border-dashed border-border text-foreground bg-card hover:bg-muted flex items-center gap-1.5'
                  : 'text-white bg-blue-600 hover:bg-blue-700',
                cta.disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              {cta.demo ? (
                <>
                  <span className="text-[13px] leading-none">⚙</span>
                  <span>Simulate: {cta.label}</span>
                </>
              ) : (
                cta.label
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
