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

const INITIAL_ROWS: Row[] = [
  { label: 'Verifying your identity', state: 'running' },
  { label: 'Reading your verified details', state: 'pending' },
  { label: 'Checking for Medicaid coverage in other states', state: 'pending' },
];

const POLL_MS = 1500;
const MAX_POLLS = 40;

function RowIcon({ state }: { state: RowState }) {
  if (state === 'ok') return <CheckCircle2 className="size-4 text-[var(--civic-success-text)]" aria-hidden="true" />;
  if (state === 'warn')
    return <AlertTriangle className="size-4 text-[var(--civic-warning-text)]" aria-hidden="true" />;
  if (state === 'running') return <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />;
  return <span aria-hidden="true" className="block size-4 rounded-full border border-border" />;
}

/**
 * Evaluation screen — polls the session until CLEAR reports a terminal status,
 * then plays the legacy-style analysis sequence (identity → details → coverage)
 * before handing the terminal session to the results step.
 */
export function Processing({ token, onDone }: { token: string; onDone: (s: FlowSession) => void }) {
  const [rows, setRows] = useState<Row[]>(INITIAL_ROWS);
  // Behind a ref so the effect depends only on `token`: a parent re-render with
  // a fresh onDone identity must not restart the sequence mid-flight.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    // No one-shot guard here: under StrictMode the first dev invocation is
    // immediately cleaned up (cancelled = true), so the surviving second
    // invocation must be free to run its own complete loop. Each invocation
    // owns its `cancelled` flag and timers; cleanup cancels only its own.
    let cancelled = false;
    setRows(INITIAL_ROWS);
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
          if (s.status === 'success' || s.status === 'failed' || s.status === 'expired') {
            session = s;
            break;
          }
        } catch {
          // transient — keep polling
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      if (cancelled) return;
      if (!session || session.status !== 'success') {
        if (session) onDoneRef.current(session);
        else onDoneRef.current({ status: 'expired' } as FlowSession);
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
        setRow(2, { state: 'running' });
      });
      after(3400, () => {
        if (det?.duplicate_enrollment && det.coverage) {
          setRow(2, {
            state: 'warn',
            detail: `Active ${det.payer_state_name ?? 'out-of-state'} Medicaid coverage found — ${det.coverage.payer_name} (Member ID ${det.coverage.insurance_member_id})`,
          });
        } else {
          setRow(2, { state: 'ok', detail: 'No Medicaid coverage found in another state' });
        }
      });
      after(4400, () => onDoneRef.current(terminal));
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [token]);

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
