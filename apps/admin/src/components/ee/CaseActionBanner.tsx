/**
 * CaseActionBanner -- "Intelligent Case Assist" banner (ENG-1670, ENG-1828).
 *
 * Tone, eyebrow, action and context copy are derived deterministically by
 * `deriveCaseAssistBanner`. The banner deliberately does NOT echo the server's
 * Case Assist narrative any more: the Case Assist panel (right rail) owns that
 * paragraph, and repeating it here restated the same finding twice on one
 * screen. The banner is a one-line status + action; the panel is the detail.
 *
 * When the linked CLEAR verification found out-of-state Medicaid coverage and
 * the Verify Assist flag is still open, the derivation returns the red
 * "ACTION NEEDED" banner (see case-assist-derive.ts) — the banner itself
 * stays a pure renderer.
 */

import { AlertTriangle, CheckCircle2, Clock, Hourglass, Info, Sparkles, ShieldAlert } from 'lucide-react';
import type { EECase, EEDetermination } from '../../types/ee';
import { deriveCaseAssistBanner, type CaseAssistTone, type DdsFlowState } from '../../lib/case-assist-derive';

// Colors via Civic CSS vars — same tokens as the storyboard UnifiedCaseBanner.
const TONE_STYLES: Record<CaseAssistTone, { rail: string; bg: string; text: string; chipBg: string }> = {
  green: {
    rail: 'var(--civic-success-solid)',
    bg: 'var(--civic-success-bg)',
    text: 'var(--civic-success-text)',
    chipBg: 'var(--civic-success-text)',
  },
  amber: {
    rail: 'var(--civic-warning-solid)',
    bg: 'var(--civic-warning-bg)',
    text: 'var(--civic-warning-text)',
    // Dark-amber chip with white glyph — fixes yellow-on-yellow contrast.
    chipBg: 'var(--civic-warning-text)',
  },
  grey: {
    rail: 'var(--civic-text-placeholder)',
    bg: 'var(--civic-bg-subtle)',
    text: 'var(--civic-text-primary)',
    chipBg: 'var(--civic-text-secondary)',
  },
  red: {
    rail: 'var(--civic-error-solid, #dc2626)',
    bg: 'var(--civic-error-bg, rgb(254 242 242))',
    text: 'var(--civic-error-text, #991b1b)',
    chipBg: 'var(--civic-error-text, #991b1b)',
  },
  blue: {
    rail: 'var(--civic-info-solid, #2563eb)',
    bg: 'var(--civic-info-bg, rgb(239 246 255))',
    text: 'var(--civic-info-text, #1e3a8a)',
    chipBg: 'var(--civic-info-text, #1e3a8a)',
  },
};

const TONE_ICON: Record<CaseAssistTone, typeof CheckCircle2> = {
  green: CheckCircle2,
  amber: AlertTriangle,
  grey: Hourglass,
  red: ShieldAlert,
  blue: Info,
};
// `Clock` stays imported for parity with the storyboard tone set; the red
// tone now signals the Verify Assist finding, so it uses the shield glyph.
void Clock;

export interface CaseActionBannerProps {
  eeCase: EECase;
  determinations: EEDetermination[];
  /**
   * Session DDS workflow state for Non-MAGI ABD cases — advances the banner
   * copy as the caseworker sends the referral / simulates the DDS response /
   * validates (storyboard bannerByState). Omit for non-DDS cases.
   */
  ddsFlowState?: DdsFlowState;
}

export function CaseActionBanner({ eeCase, determinations, ddsFlowState }: CaseActionBannerProps) {
  const derived = deriveCaseAssistBanner(eeCase, determinations, {
    ddsFlowState,
    identityVerification: eeCase.identityVerification ?? null,
  });
  const { tone, eyebrow, action, context } = derived;
  const s = TONE_STYLES[tone];
  const Icon = TONE_ICON[tone];

  return (
    <div className="flex-shrink-0 px-6 pt-3">
      <div
        className="rounded-2xl border-y border-r border-border overflow-hidden flex"
        style={{
          backgroundColor: s.bg,
          borderLeft: `6px solid ${s.rail}`,
          boxShadow: 'var(--civic-shadow-md)',
        }}
        // role="region" — not "status". The banner renders once from
        // derived case data and isn't an in-flight announcement, so the
        // landmark role is the right semantic, not the polite live region.
        role="region"
        aria-label={`Case assist: ${eyebrow}`}
        data-slot="case-action-banner"
        data-tone={tone}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-4 px-5 py-4">
            {/* Icon chip — rounded-2xl matches storyboard */}
            <span
              className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: s.chipBg, color: '#ffffff' }}
              aria-hidden="true"
            >
              <Icon className="w-6 h-6" strokeWidth={2.25} />
            </span>

            <div className="flex-1 min-w-0">
              {/* Eyebrow with "Case Assist" branding badge */}
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                  style={{ backgroundColor: s.chipBg, color: '#ffffff', letterSpacing: '0.06em' }}
                >
                  <Sparkles className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />
                  Case Assist
                </span>
                <span className="text-xs font-semibold uppercase" style={{ color: s.text, letterSpacing: '0.04em' }}>
                  {eyebrow}
                </span>
              </div>

              {/* Action */}
              <p className="leading-snug font-semibold text-xl" style={{ color: s.text, letterSpacing: '-0.015em' }}>
                {action}
              </p>

              {/* Context */}
              {context && (
                <p className="leading-relaxed text-sm mt-2" style={{ color: s.text, opacity: 0.82 }}>
                  {context}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
