import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/** Terminal failed/expired verification — sympathetic, no technical detail. */
export function FlowFailed({ returnTo }: { returnTo: string | null }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 text-center">
        <AlertTriangle className="size-8 text-[var(--civic-warning-text)]" aria-hidden="true" />
        <h1 className="text-lg font-semibold">We couldn&apos;t complete your verification</h1>
        <p className="text-sm text-muted-foreground">
          This can happen if a photo didn&apos;t read clearly or the session timed out. You can return to your
          application and try again — nothing has been submitted.
        </p>
        {returnTo ? <Button onClick={() => window.location.assign(returnTo)}>Return to your application</Button> : null}
      </CardContent>
    </Card>
  );
}
