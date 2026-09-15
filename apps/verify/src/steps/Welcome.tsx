import { Camera, FileSearch, Undo2 } from 'lucide-react';
import type { FlowSession } from '@/lib/api';
import { ClearButton } from '@/components/ClearButton';
import { Card, CardContent } from '@/components/ui/card';

const IDENTITY_STEP = {
  icon: Camera,
  title: 'Verify your identity with CLEAR',
  body: 'A quick selfie and a photo of your government ID — about 2 minutes.',
} as const;

const COVERAGE_STEP = {
  icon: FileSearch,
  title: 'We check for existing healthcare coverage',
  body: 'State and federal records are checked for coverage already associated with your identity.',
} as const;

const REVIEW_STEP = {
  icon: Undo2,
  title: 'You review the results and return',
  body: 'You see exactly what we found before the results go back to your application.',
} as const;

/** Process interstitial — explains the journey before anything is captured. */
export function Welcome({
  session,
  onBegin,
  identityOnly = false,
}: {
  session: FlowSession;
  onBegin: () => void;
  identityOnly?: boolean;
}) {
  // Providers verify identity only — drop the coverage step from the journey.
  const steps = identityOnly ? [IDENTITY_STEP, REVIEW_STEP] : [IDENTITY_STEP, COVERAGE_STEP, REVIEW_STEP];
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Verify your identity for your benefits application</h1>
            <p className="text-sm text-muted-foreground">
              {session.externalRef
                ? `Your application ${session.externalRef} sent you here to confirm who you are.`
                : 'Your benefits application sent you here to confirm who you are.'}
            </p>
          </div>

          <ol className="space-y-4">
            {steps.map((step, idx) => {
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

          <ClearButton className="w-full" onClick={onBegin} />

          <p className="text-xs text-muted-foreground">
            By continuing, you agree that your verification results — including your verified identity details
            {identityOnly ? '' : ' and any healthcare coverage we identify'} — are shared with the agency handling your
            application and used to verify your eligibility. Identity verification is powered by CLEAR under its Terms
            of Use and Privacy Policy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
