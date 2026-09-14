import React from 'react';
import { Icon } from './ui';

/**
 * Small green "Verified by CLEAR" badge rendered next to the label of a field
 * that was prefilled from a completed CLEAR identity verification
 * (`primaryApplicant.identityVerification.verifiedFields`). Purely
 * presentational — the field itself stays editable.
 */
export function VerifiedChip({ label = 'Verified by CLEAR', className = '' }: { label?: string; className?: string }) {
  return (
    <span className={'verified-chip ' + className} aria-label={label} title={label}>
      <Icon name="check" size={11} aria-hidden="true" />
      {label}
    </span>
  );
}

/** Field label + verified chip, for `<Field label={...}>`. */
export function VerifiedLabel({ text, verified }: { text: React.ReactNode; verified: boolean }) {
  if (!verified) return <>{text}</>;
  return (
    <span className="verified-label">
      {text}
      <VerifiedChip />
    </span>
  );
}

export default VerifiedChip;
