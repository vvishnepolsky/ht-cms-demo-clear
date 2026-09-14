import { useCallback, useEffect, useState } from 'react';
import { completeClearStep, getFlowSession, sendResolution } from '@/lib/api';
import type { CaptureImages, FlowResolution, FlowSession } from '@/lib/api';
import { FlowShell, type FlowStage } from '@/components/FlowShell';
import { InvalidLink } from '@/steps/InvalidLink';
import { Welcome } from '@/steps/Welcome';
import { ClearCapture } from '@/steps/clear/ClearCapture';
import { ClearRedirect } from '@/steps/ClearRedirect';
import { Processing } from '@/steps/Processing';
import { Results } from '@/steps/Results';
import { CloseOut } from '@/steps/CloseOut';
import { FlowFailed } from '@/steps/FlowFailed';

/**
 * The hosted Verify Assist flow — a single-route state machine. The origin
 * application hands the user here (`/flow?token=…`); the app owns the journey
 * (welcome → CLEAR → processing → results/resolution → close-out) and finishes
 * by sending the user back to `session.returnTo`.
 */
type Phase =
  | 'loading'
  | 'invalid'
  | 'welcome'
  | 'clear' // mock mode: in-app CLEAR capture replica
  | 'clear-redirect' // sandbox mode: hand off to verified.clearme.com
  | 'processing'
  | 'results'
  | 'closeout'
  | 'failed';

const PHASE_STAGE: Record<Exclude<Phase, 'loading' | 'invalid'>, FlowStage> = {
  welcome: 'identity',
  clear: 'identity',
  'clear-redirect': 'identity',
  processing: 'coverage',
  results: 'review',
  closeout: 'review',
  failed: 'review',
};

export function App() {
  const params = new URLSearchParams(window.location.search);
  // Single-purpose flow app — the token in the URL is the credential, whatever
  // the path prefix (dev: /flow; deploy: /verify/flow). Read it regardless.
  const token = params.get('token');
  const returnedFromClear = params.get('returned') === '1';

  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<FlowSession | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);

  // Initial routing: validate the token and drop the user into the right step
  // for the session's current state (fresh, mid-flow return, revisit).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setPhase('invalid');
        return;
      }
      try {
        const s = await getFlowSession(token);
        if (cancelled) return;
        setSession(s);
        if (s.status === 'failed' || s.status === 'expired') {
          setPhase('failed');
        } else if (s.status === 'success') {
          // Completed earlier (or a revisit) — go straight to the results.
          setPhase('results');
        } else if (returnedFromClear) {
          // Back from CLEAR's hosted UI (sandbox mode) — evaluate.
          setPhase('processing');
        } else {
          setPhase('welcome');
        }
      } catch {
        if (!cancelled) setPhase('invalid');
      }
    })();
    return () => {
      cancelled = true;
    };
    // Init runs once for the URL the user arrived on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = useCallback(() => {
    if (!session) return;
    setPhase(session.mode === 'mock' ? 'clear' : 'clear-redirect');
  }, [session]);

  // Mock mode: the in-app capture finished — CLEAR's server side is simulated
  // (the real webcam stills ride along for the staff console), then the
  // coverage evaluation runs.
  const clearDone = useCallback(
    async (images: CaptureImages) => {
      if (!token) return;
      try {
        await completeClearStep(token, images);
        setPhase('processing');
      } catch {
        setPhase('failed');
      }
    },
    [token],
  );

  const processingDone = useCallback((s: FlowSession) => {
    setSession(s);
    setPhase(s.status === 'success' ? 'results' : 'failed');
  }, []);

  const submitResolution = useCallback(
    async (resolution: FlowResolution, proofName?: string) => {
      if (!token) return;
      const res = await sendResolution(token, resolution, proofName);
      setReturnTo(res.returnTo);
      setPhase('closeout');
    },
    [token],
  );

  if (phase === 'invalid') return <InvalidLink />;
  if (phase === 'loading') return <div className="min-h-screen bg-background" aria-busy="true" />;

  const stage = PHASE_STAGE[phase];
  return (
    <FlowShell stage={stage} externalRef={session?.externalRef}>
      {phase === 'welcome' && session && <Welcome session={session} onBegin={begin} />}
      {phase === 'clear' && <ClearCapture onComplete={(images) => void clearDone(images)} />}
      {phase === 'clear-redirect' && session && <ClearRedirect session={session} />}
      {phase === 'processing' && token && <Processing token={token} onDone={processingDone} />}
      {phase === 'results' && session && <Results session={session} onSubmitResolution={submitResolution} />}
      {phase === 'closeout' && <CloseOut returnTo={returnTo ?? session?.returnTo ?? '/'} />}
      {phase === 'failed' && <FlowFailed returnTo={session?.returnTo ?? null} />}
    </FlowShell>
  );
}
