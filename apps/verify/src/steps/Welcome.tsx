import { Camera, FileSearch, Undo2 } from 'lucide-react';
import type { FlowSession } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const STEPS = [
  {
    icon: Camera,
    title: 'Verify your identity with CLEAR',
    body: 'A quick selfie and a photo of your government ID — about 2 minutes.',
  },
  {
    icon: FileSearch,
    title: 'We check for existing healthcare coverage',
    body: 'Records in other states are checked for Medicaid coverage already associated with your identity.',
  },
  {
    icon: Undo2,
    title: 'You review the results and return',
    body: 'You see exactly what we found before the results go back to your State-X Medicaid application.',
  },
] as const;

/** Process interstitial — explains the journey before anything is captured. */
export function Welcome({ session, onBegin }: { session: FlowSession; onBegin: () => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Verify your identity for your State-X Medicaid application</h1>
            <p className="text-sm text-muted-foreground">
              {session.externalRef
                ? `State-X Health & Human Services sent you here to confirm who you are for application ${session.externalRef}.`
                : 'State-X Health & Human Services sent you here to confirm who you are.'}
            </p>
          </div>

          <ol className="space-y-4">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  >
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">
                      {idx + 1}. {step.title}
                    </p>
                    <p className="text-sm text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <Button className="w-full" size="lg" onClick={onBegin}>
            Begin verification
          </Button>

          <p className="text-xs text-muted-foreground">
            By continuing, you agree that your verification results — including your verified identity details and
            any healthcare coverage we identify — are shared with State-X Health &amp; Human Services and used to verify
            your eligibility for State-X Medicaid. Identity verification is powered by CLEAR under its Terms of Use and Privacy
            Policy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
