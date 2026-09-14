import React from 'react';
import { Icon } from './ui';

/**
 * Small green "Verified by CLEAR" badge rendered next to the label of a field
 * that was prefilled from a completed CLEAR identity verification
 * (`primaryApplicant.identityVerification.verifiedFields`). Purely
 * presentational — the field itself stays editable.
 */
export function VerifiedChip({
  label = 'Verified by CLEAR',
  className = '',
  compact = false,
}: {
  label?: string;
  className?: string;
  /** Icon-only variant for narrow columns (State / ZIP); the label stays in the tooltip + aria-label. */
  compact?: boolean;
}) {
  return (
    <span className={'verified-chip ' + (compact ? 'verified-chip--compact ' : '') + className} aria-label={label} title={label}>
      <Icon name="check" size={11} aria-hidden="true" />
      {compact ? null : label}
    </span>
  );
}

/** Field label + verified chip, for `<Field label={...}>`. */
export function VerifiedLabel({
  text,
  verified,
  compact = false,
}: {
  text: React.ReactNode;
  verified: boolean;
  compact?: boolean;
}) {
  if (!verified) return <>{text}</>;
  return (
    <span className="verified-label">
      {text}
      <VerifiedChip compact={compact} />
    </span>
  );
}

export default VerifiedChip;
