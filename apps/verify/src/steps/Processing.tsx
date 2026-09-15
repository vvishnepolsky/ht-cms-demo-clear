// eslint-disable-next-line no-restricted-syntax -- the poll loop genuinely needs useEffect (call site annotated below); this disables the unavoidable import-specifier warning.
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { getFlowSession } from '@/lib/api';
import type { FlowSession } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/components/lib/utils';

type RowState = 'pending' | 'running' | 'ok' | 'warn';

interface Row {
  label: string;
  state: RowState;
  detail?: string;
}

const IDENTITY_ROWS: Row[] = [
  { label: 'Verifying your identity', state: 'running' },
  { label: 'Reading your verified details', state: 'pending' },
];

const COVERAGE_ROW: Row = { label: 'Searching for existing healthcare coverage', state: 'pending' };

// Providers verify identity only — no coverage row. Applicant/household keep the
// original three-row sequence (identity → details → coverage).
function initialRowsFor(identityOnly: boolean): Row[] {
  return identityOnly ? IDENTITY_ROWS : [...IDENTITY_ROWS, COVERAGE_ROW];
}

const POLL_MS = 1500;
const MAX_POLLS = 40;

function RowIcon({ state }: { state: RowState }) {
  if (state === 'ok') return <CheckCircle2 className="size-4 text-[var(--civic-success-text)]" aria-hidden="true" />;
  if (state === 'warn') return <AlertTriangle className="size-4 text-[var(--civic-warning-text)]" aria-hidden="true" />;
  if (state === 'running') return <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />;
  return <span aria-hidden="true" className="block size-4 rounded-full border border-border" />;
}

/**
 * Evaluation screen — polls the session until CLEAR reports a terminal status,
 * then plays the legacy-style analysis sequence (identity → details → coverage)
 * before handing the terminal session to the results step.
 */
export function Processing({
  token,
  onDone,
  identityOnly = false,
}: {
  token: string;
  onDone: (s: FlowSession) => void;
  identityOnly?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => initialRowsFor(identityOnly));
  // Behind a ref so the effect depends only on `token`: a parent re-render with
  // a fresh onDone identity must not restart the sequence mid-flight.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // eslint-disable-next-line no-restricted-syntax -- token-keyed REST poll loop with timers and cancellation lifecycle: this app has no Apollo layer, and the loop must start on mount and cancel on unmount (StrictMode-safe by owning per-invocation state).
  useEffect(() => {
    // No one-shot guard here: under StrictMode the first dev invocation is
    // immediately cleaned up (cancelled = true), so the surviving second
    // invocation must be free to run its own complete loop. Each invocation
    // owns its `cancelled` flag and timers; cleanup cancels only its own.
    let cancelled = false;
    setRows(initialRowsFor(identityOnly));
    const timers: ReturnType<typeof setTimeout>[] = [];
    const setRow = (i: number, patch: Partial<Row>) =>
      setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    const after = (ms: number, fn: () => void) => {
      timers.push(setTimeout(() => !cancelled && fn(), ms));
    };

    (async () => {
      let session: FlowSession | null = null;
      for (let attempt = 0; attempt < MAX_POLLS && !cancelled; attempt++) {
        try {
          const s = await getFlowSession(token);
          // 'pending' is terminal for the flow UI: identity WAS verified, the
          // row is just held for back-office review (e.g. a provider name/DOB
          // mismatch — the common sandbox case, where CLEAR returns "John Doe").
          // Omitting it made the poller spin to MAX_POLLS and then wrongly show
          // a failed/expired screen instead of the results screen.
          if (s.status === 'success' || s.status === 'pending' || s.status === 'failed' || s.status === 'expired') {
            session = s;
            break;
          }
        } catch {
          // transient — keep polling
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      if (cancelled) return;
      // Verified and verified-but-held both play the analysis animation and hand
      // off to the results screen; anything else is a genuine failure/timeout.
      if (!session || (session.status !== 'success' && session.status !== 'pending')) {
        onDoneRef.current(session ?? ({ status: 'expired' } as FlowSession));
        return;
      }

      const terminal = session;
      const det = terminal.determination;
      const doc = terminal.traits?.document;

      after(700, () => {
        setRow(0, { state: 'ok', detail: 'Selfie liveness · document authenticity · selfie match' });
        setRow(1, { state: 'running' });
      });
      after(1600, () => {
        setRow(1, {
          state: 'ok',
          detail: doc ? `${doc.first_name} ${doc.last_name} — ${doc.city}, ${doc.subdivision}` : undefined,
        });
        if (!identityOnly) setRow(2, { state: 'running' });
      });
      if (identityOnly) {
        // No coverage row — hand off once identity + details have resolved.
        after(2600, () => onDoneRef.current(terminal));
      } else {
        after(3400, () => {
          if (det?.duplicate_enrollment && det.coverage) {
            setRow(2, {
              state: 'warn',
              detail: `Active Medicaid coverage found — ${det.coverage.payer_name} (Member ID ${det.coverage.insurance_member_id})`,
            });
          } else if (det?.coverage) {
            // Other coverage (e.g. the applicant's own employer plan) is not a
            // finding — complete, no warning, no plan details.
            setRow(2, { state: 'ok', detail: 'Coverage check complete' });
          } else {
            setRow(2, { state: 'ok', detail: 'No existing coverage found' });
          }
        });
        after(4400, () => onDoneRef.current(terminal));
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [token, identityOnly]);

  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Checking your verification results</h1>
          <p className="text-sm text-muted-foreground">This usually takes a few seconds.</p>
        </div>
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.label} className="flex items-start gap-3">
              <span className="mt-0.5">
                <RowIcon state={row.state} />
              </span>
              <div>
                <p
                  className={cn(
                    'text-sm font-medium',
                    row.state === 'pending' ? 'text-muted-foreground/70' : 'text-foreground',
                  )}
                >
                  {row.label}
                </p>
                {row.detail ? <p className="text-xs text-muted-foreground">{row.detail}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
