// eslint-disable-next-line no-restricted-syntax -- the auto-redirect timer genuinely needs useEffect (call site annotated below); this disables the unavoidable import-specifier warning.
import { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Results are recorded. With an origin app (`returnTo`), briefly confirm then
 * hand back. Staff-initiated sessions have no origin (`returnTo` null) — show a
 * terminal completion screen the applicant can simply close.
 */
export function CloseOut({ returnTo }: { returnTo: string | null }) {
  // eslint-disable-next-line no-restricted-syntax -- mount-scoped redirect timer with cleanup: a browser-navigation side effect with no event-handler or Apollo equivalent.
  useEffect(() => {
    if (!returnTo) return;
    const t = setTimeout(() => window.location.assign(returnTo), 1600);
    return () => clearTimeout(t);
  }, [returnTo]);

  if (!returnTo) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="size-9 text-[var(--civic-success-text)]" aria-hidden="true" />
          <h1 className="text-lg font-semibold">Verification complete</h1>
          <p className="text-sm text-muted-foreground">
            Thanks — your identity verification is done and your results have been sent to the agency reviewing your
            application. You can close this window.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2 className="size-9 text-[var(--civic-success-text)]" aria-hidden="true" />
        <h1 className="text-lg font-semibold">Results sent to your benefits application</h1>
        <p className="text-sm text-muted-foreground">Taking you back to your application…</p>
        <Button variant="outline" onClick={() => window.location.assign(returnTo)}>
          Return now
        </Button>
      </CardContent>
    </Card>
  );
}
