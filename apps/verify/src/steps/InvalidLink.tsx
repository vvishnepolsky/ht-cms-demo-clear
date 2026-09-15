import { ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/** Missing or unknown session token — no session details are revealed. */
export function InvalidLink() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="size-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-lg font-semibold">This verification link is invalid or has expired</h1>
          <p className="text-sm text-muted-foreground">
            Return to your benefits application and start the verification again to get a new link.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
