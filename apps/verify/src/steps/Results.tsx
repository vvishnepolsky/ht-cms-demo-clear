import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp } from 'lucide-react';
import type { FlowResolution, FlowSession } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const RESOLUTION_LABELS: Record<FlowResolution, string> = {
  ended_submit_proof: 'You told us this coverage has ended and submitted proof.',
  confirm_enrolled: 'You confirmed you are still enrolled; a caseworker will review your application.',
};

const CHECK_LABELS: Record<string, string> = {
  selfie_liveness: 'Selfie liveness',
  document_authenticity: 'Document authenticity',
  selfie_to_document_match: 'Selfie matches document',
};

function IdentitySummary({ session }: { session: FlowSession }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-[var(--civic-success-bg)] p-4">
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--civic-success-text)]" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">Identity verified</p>
        {(() => {
          // Don't list every granular CLEAR check — show a concise summary, and
          // surface only any checks that did NOT pass.
          const failed = session.checks.filter((c) => typeof c.value === 'boolean' && c.value === false);
          const total = session.checks.length;
          if (total === 0) return null;
          if (failed.length === 0) {
            return (
              <p className="pt-1 text-xs text-muted-foreground">
                All {total} identity {total === 1 ? 'check' : 'checks'} passed.
              </p>
            );
          }
          return (
            <div className="space-y-1 pt-1">
              <p className="text-xs text-muted-foreground">
                {total - failed.length} of {total} checks passed.
              </p>
              <ul className="flex flex-col gap-1">
                {failed.map((check) => (
                  <li key={check.name} className="flex items-center gap-1 text-xs text-[var(--civic-warning-text)]">
                    <AlertTriangle className="size-3" aria-hidden="true" />
                    {CHECK_LABELS[check.name] ?? check.name}
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function CoverageFound({ session }: { session: FlowSession }) {
  const coverage = session.determination?.coverage;
  if (!coverage) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-muted/50 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Coverage we found
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Insurance Provider</dt>
          <dd className="text-sm">{coverage.payer_name}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Coverage Type</dt>
          <dd className="text-sm">Medicaid</dd>
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
 * Return-to-origin button, or a terminal "you can close this window" note when
 * the session is staff-initiated (no origin app — `returnTo` is null).
 */
function ReturnOrDone({ returnTo }: { returnTo: string | null }) {
  if (!returnTo) {
    return (
      <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
        Your results have been sent to the agency reviewing your application. You can close this window.
      </p>
    );
  }
  return (
    <Button className="w-full" size="lg" onClick={() => window.location.assign(returnTo)}>
      Return to your application
    </Button>
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
  identityOnly = false,
}: {
  session: FlowSession;
  onSubmitResolution: (
    resolution: FlowResolution,
    proof?: { name: string; proofDataUrl?: string; proofMimeType?: string },
  ) => Promise<void>;
  identityOnly?: boolean;
}) {
  const [resolution, setResolution] = useState<FlowResolution | ''>('');
  const [proofName, setProofName] = useState<string | null>(null);
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);
  const [proofMimeType, setProofMimeType] = useState<string | null>(null);
  const [proofTooLarge, setProofTooLarge] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const MAX_PROOF_BYTES = 6 * 1024 * 1024; // ~6 MB; server caps too

  function onProofSelected(file: File | undefined) {
    if (!file) {
      setProofName(null);
      setProofDataUrl(null);
      setProofMimeType(null);
      return;
    }
    setProofTooLarge(false);
    if (file.size > MAX_PROOF_BYTES) {
      setProofTooLarge(true);
      setProofName(null);
      setProofDataUrl(null);
      setProofMimeType(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProofName(file.name);
      setProofMimeType(file.type || 'application/octet-stream');
      setProofDataUrl(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(file);
  }

  const duplicate = session.determination?.duplicate_enrollment === true;
  const stateName = session.determination?.payer_state_name ?? 'the other state';
  const coverage = session.determination?.coverage;

  // Providers verify identity only — no coverage card, duplicate-enrollment
  // alert, or resolution choice. Just the verified-identity summary and return.
  if (identityOnly) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <IdentitySummary session={session} />
          <p className="text-sm text-muted-foreground">
            {session.returnTo
              ? 'Your identity has been verified. Your verified details are ready to go back to your application.'
              : 'Your identity has been verified and your results have been sent to the agency reviewing your application.'}
          </p>
          <ReturnOrDone returnTo={session.returnTo} />
        </CardContent>
      </Card>
    );
  }

  // Revisit after close-out: read-only completion summary.
  if (session.resolution) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <IdentitySummary session={session} />
          <p className="text-sm text-muted-foreground">{RESOLUTION_LABELS[session.resolution]}</p>
          <ReturnOrDone returnTo={session.returnTo} />
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
            {session.returnTo
              ? 'No existing healthcare coverage was found. Your verified details are ready to go back to your application.'
              : 'No existing healthcare coverage was found. Your verification is complete and your results have been sent to the agency reviewing your application.'}
          </p>
          <ReturnOrDone returnTo={session.returnTo} />
        </CardContent>
      </Card>
    );
  }

  const canSubmit =
    resolution === 'confirm_enrolled' || (resolution === 'ended_submit_proof' && proofName !== null && !!proofDataUrl);

  const submit = async () => {
    if (!canSubmit || !resolution) return;
    setSending(true);
    setError(false);
    try {
      await onSubmitResolution(
        resolution,
        proofName
          ? { name: proofName, proofDataUrl: proofDataUrl ?? undefined, proofMimeType: proofMimeType ?? undefined }
          : undefined,
      );
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
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--civic-warning-text)]" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">We identified a potential duplicate enrollment</p>
              <p className="text-sm">
                Our records show you have active Medicaid coverage with <strong>{coverage?.payer_name}</strong> (Member
                ID <strong>{coverage?.insurance_member_id}</strong>). You may be required to provide additional
                verification as part of your application process.
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
                <strong>I have ended this coverage.</strong> I&apos;ll provide proof that my {stateName} Medicaid
                coverage has ended (for example, a termination letter).
              </span>
            </Label>
            <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-normal">
              <RadioGroupItem value="confirm_enrolled" className="mt-1" />
              <span className="text-sm">
                <strong>I am still enrolled — continue with my application.</strong> I understand a caseworker will
                review my application and contact me about my coverage in {stateName} before a decision is made.
              </span>
            </Label>
          </RadioGroup>

          {resolution === 'ended_submit_proof' && (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-4">
              <p className="text-sm font-medium">
                Upload proof your {stateName} coverage has ended
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
                aria-label="Upload proof of coverage ending"
                accept="image/*,.pdf"
                className="sr-only"
                onChange={(e) => onProofSelected(e.target.files?.[0])}
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
              {proofTooLarge ? (
                <p className="text-xs text-destructive" role="alert">
                  That file is too large. Please choose a file under 6 MB.
                </p>
              ) : null}
            </div>
          )}

          {resolution === 'confirm_enrolled' && (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              A caseworker will review your application and contact you about your {stateName} coverage before a
              decision is made. You don&apos;t need to do anything else right now.
            </p>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={!canSubmit || sending}
            loading={sending}
            onClick={() => void submit()}
          >
            Send results &amp; return to your application
          </Button>
          {!resolution && (
            <p className="text-center text-xs text-muted-foreground">Please choose an option above to continue.</p>
          )}
          {error && (
            <p role="alert" className="text-center text-xs text-destructive">
              We couldn&apos;t send your response. Please try again.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
