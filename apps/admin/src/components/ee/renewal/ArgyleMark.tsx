/**
 * Argyle brand mark — used wherever the Argyle vendor surfaces in caseworker
 * views (ex-parte data-source rows, reasonable-compatibility comparison).
 *
 * Ported from the CMS Demo Storyboard (`shared.jsx` → ArgyleMark). Co-branded
 * per product decision: a small argyle-diamond glyph in Argyle violet
 * (#5840FF) plus an optional wordmark in the same hue. Size scales with the
 * `size` prop.
 */

export const ARGYLE_VIOLET = '#5840FF';
/** Shared brand discriminant — use instead of the inline string literal 'argyle'. */
export const ARGYLE_BRAND = 'argyle' as const;

interface ArgyleMarkProps {
  size?: number;
  /** Render the "Argyle" wordmark next to the glyph. Defaults to true. */
  wordmark?: boolean;
  className?: string;
  /** Pass true when a sibling sr-only element already provides the accessible name. */
  'aria-hidden'?: true;
}

export function ArgyleMark({ size = 14, wordmark = true, className = '', 'aria-hidden': ariaHidden }: ArgyleMarkProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 align-middle ${className}`} aria-hidden={ariaHidden}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden={wordmark ? true : undefined}
        aria-label={wordmark ? undefined : 'Argyle'}
        role={wordmark ? undefined : 'img'}
        style={{ flexShrink: 0 }}
      >
        <path d="M8 0.5L13 8L8 15.5L3 8Z" fill={ARGYLE_VIOLET} />
        <path d="M8 4L10.5 8L8 12L5.5 8Z" fill="#FFFFFF" fillOpacity="0.32" />
      </svg>
      {wordmark && (
        <span
          className="font-semibold tracking-tight"
          style={{ color: ARGYLE_VIOLET, fontSize: size <= 12 ? 11 : size <= 14 ? 12 : 13, lineHeight: 1 }}
        >
          Argyle
        </span>
      )}
    </span>
  );
}
