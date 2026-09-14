import { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Results are recorded — brief confirmation, then hand back to the origin.
 * `returnTo` is used verbatim (it is a hash URL such as
 * `http://localhost:5181/#/personal?verified=<id>`), so the fragment survives.
 */
export function CloseOut({ returnTo }: { returnTo: string }) {
  useEffect(() => {
    const t = setTimeout(() => window.location.assign(returnTo), 1600);
    return () => clearTimeout(t);
  }, [returnTo]);

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2 className="size-9 text-[var(--civic-success-text)]" aria-hidden="true" />
        <h1 className="text-lg font-semibold">Results sent to your State-X Medicaid application</h1>
        <p className="text-sm text-muted-foreground">Taking you back to your application…</p>
        <Button variant="outline" onClick={() => window.location.assign(returnTo)}>
          Return now
        </Button>
      </CardContent>
    </Card>
  );
}
