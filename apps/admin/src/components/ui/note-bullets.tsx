import * as React from 'react';

/**
 * Audit-log note formatting primitive (ENG-1733).
 *
 * `noteToBullets`, `noteSplitLabel`, `renderNoteBody`, and `<NoteBullets>` together turn a free-text
 * audit-log note string into a typographically consistent rendering — bullets for multi-fact notes,
 * a single `<p>` for one-sentence notes, label/value bolding for "Field: value" shapes, and inline
 * success/destructive tinting for ✓/✗ glyphs.
 *
 * Splitter is abbreviation-defended (Mr., a.m., U.S., single-letter initials) so caseworker prose
 * doesn't fragment mid-sentence. Recognized fact separators (collapsed to ". " pre-split):
 *   . ! ?         sentence punctuation
 *   • · → |       explicit fact dividers (require whitespace on both sides)
 *   ;             trailing whitespace only (matches natural prose: "verified; income")
 *   \n            newlines (any surrounding whitespace)
 *
 * Token note: the storyboard prototype used `text-muted` for muted prose. In this codebase the
 * `--color-muted` token is bound to the subtle background (used by `bg-muted/30`), so we instead
 * use the codebase's existing `text-muted-foreground` token, which is wired to
 * `--civic-text-secondary` and is the semantically correct choice for muted text.
 */

const SENT_MARKER = '\u0001';

const ABBR_PATTERN =
  /\b(Mr|Mrs|Ms|Dr|Sr|Jr|St|No|Inc|Ltd|Co|vs|i\.e|e\.g|approx|etc|a\.m|p\.m|Sec|Dept|Ave|Blvd|Rd|Apt|Ft|Mt|Pkwy|U\.S|U\.K)\./gi;

const INIT_PATTERN = /\b([A-Z])\./g;

export function noteToBullets(note: string | null | undefined): string[] {
  if (!note) return [];
  let s = String(note)
    .replace(/\s+•\s+/g, '. ')
    .replace(/\s*;\s+/g, '. ')
    .replace(/\s+·\s+/g, '. ')
    .replace(/\s+→\s+/g, '. ')
    .replace(/\s+\|\s+/g, '. ')
    .replace(/\s*\n+\s*/g, '. ');
  s = s.replace(ABBR_PATTERN, (m) => m.replace(/\./g, SENT_MARKER));
  s = s.replace(INIT_PATTERN, (_m, p1) => p1 + SENT_MARKER);
  return s
    .split(/(?<=[.!?])\s+(?=[A-Za-z0-9✓✗])/)
    .map((p) =>
      p
        .replace(new RegExp(SENT_MARKER, 'g'), '.')
        .trim()
        .replace(/[.\s]+$/, ''),
    )
    .map((p) => (p && /^[a-z]/.test(p) ? p[0].toUpperCase() + p.slice(1) : p))
    .filter((p) => p.length > 0);
}

export interface NoteLabelMatch {
  label: string;
  value: string;
}

export function noteSplitLabel(bullet: string | null | undefined): NoteLabelMatch | null {
  const m = String(bullet || '').match(/^([A-Z][A-Za-z0-9 \-/&()'#%]{0,28}[A-Za-z0-9)]):\s+(.+)$/);
  if (!m) return null;
  return { label: m[1], value: m[2] };
}

export function renderNoteBody(text: string): React.ReactNode[] {
  const parts = String(text).split(/(✓|✗)/);
  return parts.map((p, i) => {
    if (p === '✓')
      return (
        <span key={i} className="text-success-11 font-semibold">
          ✓
        </span>
      );
    if (p === '✗')
      return (
        <span key={i} className="text-destructive-11 font-semibold">
          ✗
        </span>
      );
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

export interface NoteBulletsProps {
  note: string | null | undefined;
  size?: 'sm' | 'xs';
  className?: string;
}

export function NoteBullets({ note, size = 'sm', className = '' }: NoteBulletsProps) {
  const bullets = noteToBullets(note);
  const textCls = size === 'xs' ? 'text-xs' : 'text-sm';
  const spaceCls = size === 'xs' ? 'space-y-0.5' : 'space-y-1';

  const renderFact = (b: string): React.ReactNode => {
    const kv = noteSplitLabel(b);
    if (kv) {
      return (
        <>
          <span className="font-semibold text-fg">{kv.label}:</span>{' '}
          <span className="text-muted-foreground">{renderNoteBody(kv.value)}</span>
        </>
      );
    }
    return renderNoteBody(b);
  };

  if (bullets.length <= 1) {
    const only = bullets[0] || '';
    return (
      <p className={`${textCls} text-muted-foreground leading-relaxed tabular-nums ${className}`}>
        {only ? renderFact(only) : note}
      </p>
    );
  }
  return (
    <ul
      role="list"
      className={`${textCls} text-muted-foreground leading-relaxed ${spaceCls} list-none tabular-nums ${className}`}
    >
      {bullets.map((b, i) => (
        <li key={i} role="listitem" className="flex gap-2">
          <span aria-hidden="true" className="text-placeholder flex-shrink-0 select-none mt-[1px]">
            •
          </span>
          <span className="min-w-0">{renderFact(b)}</span>
        </li>
      ))}
    </ul>
  );
}
