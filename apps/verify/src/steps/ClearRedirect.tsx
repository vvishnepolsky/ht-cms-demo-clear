import { ExternalLink } from 'lucide-react';
import type { FlowSession } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Sandbox mode: the CLEAR step happens on verified.clearme.com. CLEAR returns
 * the user to this app (`/flow?token=…&returned=1`) when capture finishes.
 */
export function ClearRedirect({ session }: { session: FlowSession }) {
  return (
    <Card>
      <CardContent className="space-y-4 text-center">
        <h1 className="text-lg font-semibold">Continue to CLEAR</h1>
        <p className="text-sm text-muted-foreground">
          You'll take a selfie and photograph your government ID on CLEAR's secure site, then be brought right back
          here to review your results.
        </p>
        <Button
          className="w-full"
          size="lg"
          disabled={!session.clearUrl}
          onClick={() => session.clearUrl && window.location.assign(session.clearUrl)}
        >
          <ExternalLink aria-hidden="true" />
          Continue to CLEAR
        </Button>
        <p className="text-xs text-muted-foreground">Sandbox note: the one-time passcode is always 123456.</p>
      </CardContent>
    </Card>
  );
}
