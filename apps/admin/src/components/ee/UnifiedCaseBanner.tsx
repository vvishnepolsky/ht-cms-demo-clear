/**
 * UnifiedCaseBanner — generic 5-tone status banner for case workspaces.
 *
 * Fully token-driven: all colors resolve to --civic-* CSS variables.
 * No hardcoded hex values. Renders identically sized across all tones —
 * color alone signals urgency (R-006).
 */

import React from 'react';
import { CheckCircle, Info, AlertTriangle, AlertOctagon, Clock } from 'lucide-react';
import { toast } from 'sonner';

export type UnifiedCaseBannerTone = 'green' | 'blue' | 'amber' | 'red' | 'grey';

export interface UnifiedCaseBannerLink {
  href: string;
  label: string;
}

export type CtaProps =
  | { ctaLabel?: never; onCta?: never; ctaIsDemo?: never }
  | { ctaLabel: string; ctaIsDemo: true; onCta?: never }
  | { ctaLabel: string; ctaIsDemo?: false; onCta: () => void };

export type UnifiedCaseBannerProps = {
  tone: UnifiedCaseBannerTone;
  /** Primary headline text. */
  action: string;
  /** Supporting text or rich content below the headline. */
  context?: React.ReactNode;
  /** Overrides the default eyebrow label for the tone. */
  eyebrow?: string;
  /** Optional navigation link rendered as an anchor alongside or instead of onCta. */
  link?: UnifiedCaseBannerLink;
  /** Additional content rendered below the main banner row, inside the same styled container. */
  children?: React.ReactNode;
} & CtaProps;

const TONE_DEFAULTS: Record<
  UnifiedCaseBannerTone,
  {
    eyebrow: string;
    Icon: React.ComponentType<{
      className?: string;
      'aria-hidden'?: boolean | 'true' | 'false';
      style?: React.CSSProperties;
    }>;
    solid: string;
    bg: string;
    text: string;
    border: string;
  }
> = {
  green: {
    eyebrow: 'Resolved',
    Icon: CheckCircle,
    solid: 'var(--civic-success-solid)',
    bg: 'var(--civic-success-bg)',
    text: 'var(--civic-success-text)',
    border: 'var(--civic-success-solid)',
  },
  blue: {
    eyebrow: 'In progress',
    Icon: Info,
    solid: 'var(--civic-info-solid)',
    bg: 'var(--civic-info-bg)',
    text: 'var(--civic-info-text)',
    border: 'var(--civic-info-solid)',
  },
  amber: {
    eyebrow: 'Action needed',
    Icon: AlertTriangle,
    solid: 'var(--civic-warning-solid)',
    bg: 'var(--civic-warning-bg)',
    text: 'var(--civic-warning-text)',
    border: 'var(--civic-warning-solid)',
  },
  red: {
    eyebrow: 'Urgent — deadline at risk',
    Icon: AlertOctagon,
    solid: 'var(--civic-destructive-solid)',
    bg: 'var(--civic-destructive-bg)',
    text: 'var(--civic-destructive-text)',
    border: 'var(--civic-destructive-solid)',
  },
  grey: {
    eyebrow: 'Waiting',
    Icon: Clock,
    solid: 'var(--civic-slate-solid)',
    bg: 'var(--civic-slate-bg)',
    text: 'var(--civic-slate-text)',
    border: 'var(--civic-slate-border)',
  },
};

export function UnifiedCaseBanner({
  tone,
  action,
  context,
  eyebrow,
  ctaLabel,
  onCta,
  ctaIsDemo = false,
  link,
  children,
}: UnifiedCaseBannerProps) {
  const { eyebrow: defaultEyebrow, Icon, solid, bg, text, border } = TONE_DEFAULTS[tone];
  const resolvedEyebrow = eyebrow !== undefined ? eyebrow : defaultEyebrow;

  function handleCta() {
    if (ctaIsDemo) {
      toast.info('This action is not available in the demo.');
      return;
    }
    onCta?.();
  }

  return (
    <div
      className="flex overflow-hidden rounded-2xl border"
      style={{ borderColor: border, background: bg, color: text }}
      role="region"
      aria-label={resolvedEyebrow || action}
    >
      {/* 6px left rail */}
      <div className="w-1.5 flex-shrink-0" style={{ background: solid }} aria-hidden="true" />

      {/* Main content */}
      <div className="flex-1 px-4 py-3 space-y-3">
        {/* Top row: icon chip + text + CTA */}
        <div className="flex items-start gap-3">
          {/* 44×44 rounded-2xl icon chip */}
          <div
            className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center"
            style={{ background: solid }}
            aria-hidden="true"
          >
            <Icon className="w-5 h-5" aria-hidden="true" style={{ color: 'white' }} />
          </div>

          {/* Text block */}
          <div className="flex-1 min-w-0 pt-0.5">
            {/* Eyebrow — suppressed when caller passes eyebrow="" */}
            {resolvedEyebrow && (
              <p className="text-xs font-semibold uppercase tracking-wide leading-none mb-1" style={{ color: text }}>
                {resolvedEyebrow}
              </p>
            )}
            {/* Headline */}
            <p className="text-base font-semibold leading-snug" style={{ color: text }}>
              {action}
            </p>
            {/* Context */}
            {context != null && (
              <div className="text-sm mt-1" style={{ color: text, opacity: 0.85 }}>
                {context}
              </div>
            )}
          </div>

          {/* CTA / link */}
          {(ctaLabel || link) && (
            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
              {ctaLabel && (
                <button
                  type="button"
                  onClick={handleCta}
                  className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[--banner-ring]"
                  style={{
                    borderColor: border,
                    color: text,
                    background: 'transparent',
                    ['--banner-ring' as string]: solid,
                  }}
                >
                  {ctaLabel}
                </button>
              )}
              {link && (
                <a
                  href={link.href}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[--banner-ring]"
                  style={{ color: text, ['--banner-ring' as string]: solid }}
                >
                  {link.label}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Slot for tone-specific additional content (e.g. PendingRfiBanner items) */}
        {children}
      </div>
    </div>
  );
}
