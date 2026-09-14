/**
 * SensitiveValue — masks PII (SSN today, easily extended) with an eye toggle
 * to reveal. Auto-hides after 10s; a reveal is recorded to a window-scoped
 * audit log so future work can hook real audit logging. When revealed, an
 * optional copy button appears.
 *
 * Ported from the storyboard's shared.jsx SensitiveValue. The visual is
 * intentionally compact so it fits inline inside the ApplicantSidebar row
 * without breaking the existing 88px label / 1fr value grid.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';

const REVEAL_TIMEOUT_MS = 10_000;

export type SensitiveValueType = 'ssn' | 'dob' | 'last4';

interface PiiRevealLogEntry {
  ts: number;
  type: SensitiveValueType;
  valuePreview: string;
}

declare global {
  interface Window {
    __piiRevealLog?: PiiRevealLogEntry[];
  }
}

function maskSsn(raw: string): string {
  // Always render the masked form as •••-••-LLLL regardless of input format —
  // accept either "123-45-6789" or "123456789" and keep just the last 4.
  const digits = raw.replace(/\D/g, '');
  const last4 = digits.slice(-4).padStart(4, '•');
  return `•••-••-${last4}`;
}

function maskValue(raw: string, type: SensitiveValueType): string {
  if (type === 'ssn') return maskSsn(raw);
  // Date of birth: keep only the year visible (••/••/1991) — enough to sanity
  // check age without exposing the full DOB at a glance.
  if (type === 'dob') {
    const year = /(\d{4})/.exec(raw)?.[1];
    return year ? `••/••/${year}` : '••/••/••••';
  }
  // Generic short identifier (document number last-4 etc.).
  return '•'.repeat(Math.max(4, Math.min(raw.length, 8)));
}

export interface SensitiveValueProps {
  /** Full unmasked PII value (e.g., "182-47-4821"). */
  value: string;
  type?: SensitiveValueType;
  copyable?: boolean;
  className?: string;
}

export function SensitiveValue({ value, type = 'ssn', copyable = true, className }: SensitiveValueProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const masked = maskValue(value, type);
  const display = revealed ? value : masked;

  // eslint-disable-next-line no-restricted-syntax -- clean up the auto-hide timer on unmount so a revealed value doesn't try to hide after the component has gone away. The timer is owned by this component; there's no Apollo callback or event handler that could express it.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleReveal() {
    setRevealed(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setRevealed(false), REVEAL_TIMEOUT_MS);
    if (typeof window !== 'undefined') {
      window.__piiRevealLog = window.__piiRevealLog ?? [];
      window.__piiRevealLog.push({ ts: Date.now(), type, valuePreview: masked });
    }
  }

  function handleHide() {
    setRevealed(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Clipboard API can fail in non-secure contexts — swallow silently.
      });
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      {/* The display string itself is read by AT as plain text; the adjacent
          toggle button carries the aria-label + aria-pressed that name and
          state-track the value's reveal status. aria-label on a roleless
          <span> is ignored by NVDA/JAWS, so we drop it. */}
      <span className="font-mono tabular-nums tracking-tight">{display}</span>
      <button
        type="button"
        onClick={revealed ? handleHide : handleReveal}
        title={revealed ? 'Hide (auto-hides in 10s)' : 'Reveal — logged to audit trail'}
        aria-pressed={revealed}
        aria-label={revealed ? 'Hide value' : 'Reveal value'}
        className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {revealed ? (
          <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
        ) : (
          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
        )}
      </button>
      {copyable && revealed && (
        <button
          type="button"
          onClick={handleCopy}
          title={copied ? 'Copied!' : 'Copy'}
          aria-label={copied ? 'Value copied' : 'Copy value'}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-700" aria-hidden="true" />
          ) : (
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>
      )}
    </span>
  );
}
