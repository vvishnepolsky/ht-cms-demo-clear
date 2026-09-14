import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp } from 'lucide-react';
import type { FlowResolution, FlowSession } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const resolutionLabel = (resolution: FlowResolution, stateName: string): string =>
  resolution === 'ended_submit_proof'
    ? `You told us your ${stateName} Medicaid coverage has ended and submitted proof.`
    : `You confirmed you are still enrolled in ${stateName} Medicaid; a State-X Health & Human Services caseworker will review your application.`;

const CHECK_LABELS: Record<string, string> = {
  selfie_liveness: 'Selfie liveness',
  document_authenticity: 'Document authenticity',
  selfie_to_document_match: 'Selfie matches document',
};

function IdentitySummary({ session }: { session: FlowSession }) {
  const doc = session.traits?.document;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-[var(--civic-success-bg)] p-4">
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--civic-success-text)]" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">Identity verified</p>
        {doc ? (
          <p className="text-sm text-muted-foreground">
            {doc.first_name} {doc.last_name} — {doc.document_type === 'drivers_license' ? "driver's license" : 'ID'}{' '}
            issued by {doc.issuing_subdivision}
          </p>
        ) : null}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {session.checks.map((check) => {
            // Real CLEAR checks carry the outcome in `value` (status is just
            // "completed"); legacy mock rows used status "success".
            const passed = typeof check.value === 'boolean' ? check.value : true;
            return (
              <li key={check.name} className="flex items-center gap-1 text-xs text-muted-foreground">
                {passed ? (
                  <CheckCircle2 className="size-3 text-[var(--civic-success-text)]" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="size-3 text-[var(--civic-warning-text)]" aria-hidden="true" />
                )}
                {CHECK_LABELS[check.name] ?? check.name}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function CoverageFound({ session }: { session: FlowSession }) {
  const coverage = session.determination?.coverage;
  const stateName = session.determination?.payer_state_name ?? '';
  if (!coverage) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-muted/50 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Coverage we found
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Program</dt>
          <dd className="text-sm">{coverage.payer_name}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Coverage Type</dt>
          <dd className="text-sm">{stateName ? `${stateName} Medicaid` : 'Medicaid (another state)'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Plan Status</dt>
          <dd>
            <span className="inline-flex items-center rounded-full bg-[var(--civic-success-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--civic-success-text)]">
              {coverage.plan_status}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Member ID</dt>
          <dd className="text-sm">{coverage.insurance_member_id}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Policy Holder</dt>
          <dd className="text-sm">
            {coverage.policy_holder_first_name} {coverage.policy_holder_last_name}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Terminal results. Clean path: verified summary + return. Issue path: the
 * legacy three-part alert (warning banner, coverage card, resolution choice) —
 * resolved HERE, in the hosted flow, before anything returns to the origin.
 */
export function Results({
  session,
  onSubmitResolution,
}: {
  session: FlowSession;
  onSubmitResolution: (resolution: FlowResolution, proofName?: string) => Promise<void>;
}) {
  const [resolution, setResolution] = useState<FlowResolution | ''>('');
  const [proofName, setProofName] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const duplicate = session.determination?.duplicate_enrollment === true;
  // The finding is out-of-state coverage; the state name comes from the
  // determination (demo: South Carolina), never hardcoded.
  const stateName = session.determination?.payer_state_name ?? 'another state';
  const coverage = session.determination?.coverage;

  // Revisit after close-out: read-only completion summary.
  if (session.resolution) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <IdentitySummary session={session} />
          <p className="text-sm text-muted-foreground">{resolutionLabel(session.resolution, stateName)}</p>
          <Button className="w-full" onClick={() => window.location.assign(session.returnTo)}>
            Return to your application
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!duplicate) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <IdentitySummary session={session} />
          <p className="text-sm text-muted-foreground">
            No Medicaid coverage was found in another state. Your verified details are ready to go back to your
            State-X Medicaid application.
          </p>
          <Button className="w-full" size="lg" onClick={() => window.location.assign(session.returnTo)}>
            Return to your application
          </Button>
        </CardContent>
      </Card>
    );
  }

  const canSubmit = resolution === 'confirm_enrolled' || (resolution === 'ended_submit_proof' && proofName !== null);

  const submit = async () => {
    if (!canSubmit || !resolution) return;
    setSending(true);
    setError(false);
    try {
      await onSubmitResolution(resolution, proofName ?? undefined);
    } catch {
      setError(true);
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4">
          <IdentitySummary session={session} />

          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border p-4"
            style={{
              background: 'var(--civic-warning-bg)',
              borderColor: 'var(--civic-amber-6, var(--civic-warning-text))',
            }}
          >
            <AlertTriangle
              className="mt-0.5 size-5 shrink-0 text-[var(--civic-warning-text)]"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="text-sm font-semibold">We found active Medicaid coverage in {stateName}</p>
              <p className="text-sm">
                Records show you are currently enrolled in <strong>{coverage?.payer_name}</strong> (Member ID{' '}
                <strong>{coverage?.insurance_member_id}</strong>). Medicaid coverage can only be active in one state
                at a time, so State-X Health &amp; Human Services can't certify your State-X Medicaid eligibility
                until your {stateName} coverage is confirmed to have ended.
              </p>
            </div>
          </div>

          <CoverageFound session={session} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <h2 className="text-base font-semibold">What would you like to do?</h2>
          <RadioGroup
            aria-label="How would you like to resolve this coverage finding?"
            value={resolution}
            onValueChange={(v) => setResolution(v as FlowResolution)}
          >
            <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-normal">
              <RadioGroupItem value="ended_submit_proof" className="mt-1" />
              <span className="text-sm">
                <strong>My coverage there has ended.</strong> I'll provide proof that my {stateName} Medicaid
                coverage has ended (for example, a termination letter).
              </span>
            </Label>
            <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-normal">
              <RadioGroupItem value="confirm_enrolled" className="mt-1" />
              <span className="text-sm">
                <strong>I'm still enrolled — continue with my application.</strong> I understand a State-X
                Health &amp; Human Services caseworker will review my application and contact me about my {stateName}{' '}
                coverage before a decision is made.
              </span>
            </Label>
          </RadioGroup>

          {resolution === 'ended_submit_proof' && (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-4">
              <p className="text-sm font-medium">
                Upload proof your {stateName} Medicaid coverage has ended
                <span className="text-destructive" aria-hidden="true">
                  {' '}
                  *
                </span>
              </p>
              <p className="text-xs text-muted-foreground">For example, a termination or disenrollment letter.</p>
              <input
                ref={fileRef}
                id="proof-file"
                type="file"
                accept="image/*,.pdf"
                className="sr-only"
                onChange={(e) => setProofName(e.target.files?.[0]?.name ?? null)}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <FileUp aria-hidden="true" />
                {proofName ? 'Choose a different file' : 'Choose file'}
              </Button>
              {proofName ? (
                <p className="text-xs text-muted-foreground">
                  Selected: <span className="font-medium text-foreground">{proofName}</span>
                </p>
              ) : null}
            </div>
          )}

          {resolution === 'confirm_enrolled' && (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              A State-X Health &amp; Human Services caseworker will review your application and contact you about
              your {stateName} coverage before a decision is made. You don't need to do anything else right now.
            </p>
          )}

          <Button className="w-full" size="lg" disabled={!canSubmit || sending} loading={sending} onClick={() => void submit()}>
            Send results &amp; return to your State-X Medicaid application
          </Button>
          {!resolution && (
            <p className="text-center text-xs text-muted-foreground">Please choose an option above to continue.</p>
          )}
          {error && (
            <p role="alert" className="text-center text-xs text-destructive">
              We couldn't send your response. Please try again.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
