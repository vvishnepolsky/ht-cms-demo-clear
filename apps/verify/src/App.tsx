// eslint-disable-next-line no-restricted-syntax -- initial token-validation routing genuinely needs useEffect (call site annotated below); this disables the unavoidable import-specifier warning.
import { useCallback, useEffect, useState } from 'react';
import { completeClearStep, getFlowSession, isTokenGone, sendResolution } from '@/lib/api';
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
 * application hands the user here (`/verify/flow?token=…`); the app owns the
 * journey (welcome → CLEAR → processing → results/resolution → close-out) and
 * finishes by sending the user back to `session.returnTo`.
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

// Providers have no coverage stage, so the processing (evaluation) phase stays
// under "Verify your identity" instead of the coverage stage the applicant flow
// uses. Every other phase already maps to a stage that exists in both stepper
// variants.
function phaseToStage(phase: Exclude<Phase, 'loading' | 'invalid'>, identityOnly: boolean): FlowStage {
  if (identityOnly && phase === 'processing') return 'identity';
  return PHASE_STAGE[phase];
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  // The token is the sole credential — read it from `?token=` regardless of the
  // path prefix. The deployed page route is `/verify/flow?token=…`, so pinning
  // to a specific pathname would break under the `/verify/` base path.
  const token = params.get('token');
  const returnedFromClear = params.get('returned') === '1';

  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<FlowSession | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);

  // Initial routing: validate the token and drop the user into the right step
  // for the session's current state (fresh, mid-flow return, revisit).
  // eslint-disable-next-line no-restricted-syntax -- one-shot fetch-on-mount keyed to the arrival URL: no user event or Apollo callback exists in this REST-only app; the cancelled flag handles unmount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setPhase('invalid');
        return;
      }
      // Returning from CLEAR, the first read can fail even though the link is
      // valid: the server runs the completion pipeline INSIDE this same request
      // (pollIfPending → complete), and a momentary error there (e.g. the status
      // is set terminal but a later step throws, 500ing the response) makes the
      // app dead-end to the invalid/expired screen — a plain reload then works.
      // Retry a few times on the return path so the user never has to reload; a
      // genuine 404/410 (unknown/expired token) stops retrying immediately, and
      // a fresh arrival needs no retry at all.
      const maxAttempts = returnedFromClear ? 6 : 1;
      let s: FlowSession | null = null;
      for (let attempt = 0; attempt < maxAttempts && !cancelled; attempt++) {
        try {
          s = await getFlowSession(token);
          break;
        } catch (err) {
          if (isTokenGone(err) || attempt === maxAttempts - 1) break;
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
      if (cancelled) return;
      if (!s) {
        setPhase('invalid');
        return;
      }
      setSession(s);
      if (s.status === 'failed' || s.status === 'expired') {
        setPhase('failed');
      } else if (s.status === 'success' || s.status === 'pending') {
        // Completed earlier (or a revisit) — go straight to the results.
        // 'pending' = verified with CLEAR but held for back-office review
        // (provider name/DOB mismatch); the applicant is still done here.
        setPhase('results');
      } else if (returnedFromClear) {
        // Back from CLEAR's hosted UI (sandbox mode) — evaluate.
        setPhase('processing');
      } else if (s.mode !== 'mock' && s.clearUrl) {
        // Fresh arrival (sandbox): skip the "Continue to CLEAR" interstitial —
        // the verification + CLEAR session were already created upstream, so
        // send the applicant straight into CLEAR. CLEAR returns them to
        // /verify/flow?token=…&returned=1 for the results.
        window.location.assign(s.clearUrl);
      } else {
        // Mock mode (in-app capture) or no CLEAR URL — fall into the step UI.
        setPhase(s.mode === 'mock' ? 'clear' : 'clear-redirect');
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
    async (images: CaptureImages, phone: string) => {
      if (!token) return;
      try {
        await completeClearStep(token, images, phone);
        setPhase('processing');
      } catch (err) {
        setPhase(isTokenGone(err) ? 'invalid' : 'failed');
      }
    },
    [token],
  );

  const processingDone = useCallback((s: FlowSession) => {
    setSession(s);
    setPhase(s.status === 'success' || s.status === 'pending' ? 'results' : 'failed');
  }, []);

  const submitResolution = useCallback(
    async (resolution: FlowResolution, proof?: { name: string; proofDataUrl?: string; proofMimeType?: string }) => {
      if (!token) return;
      const res = await sendResolution(token, resolution, proof);
      setReturnTo(res.returnTo);
      setPhase('closeout');
    },
    [token],
  );

  if (phase === 'invalid') return <InvalidLink />;
  if (phase === 'loading') return <div className="min-h-screen bg-background" aria-busy="true" />;

  // Providers verify identity only — no healthcare-coverage step or coverage UI.
  const identityOnly = session?.role === 'provider';
  const stage = phaseToStage(phase, identityOnly);
  return (
    <FlowShell stage={stage} externalRef={session?.externalRef} npi={session?.npi} identityOnly={identityOnly}>
      {phase === 'welcome' && session && <Welcome session={session} onBegin={begin} identityOnly={identityOnly} />}
      {phase === 'clear' && <ClearCapture onComplete={(images, phone) => void clearDone(images, phone)} />}
      {phase === 'clear-redirect' && session && <ClearRedirect session={session} />}
      {phase === 'processing' && token && (
        <Processing token={token} onDone={processingDone} identityOnly={identityOnly} />
      )}
      {phase === 'results' && session && (
        <Results session={session} onSubmitResolution={submitResolution} identityOnly={identityOnly} />
      )}
      {phase === 'closeout' && <CloseOut returnTo={returnTo ?? session?.returnTo ?? null} />}
      {phase === 'failed' && <FlowFailed returnTo={session?.returnTo ?? null} />}
    </FlowShell>
  );
}
