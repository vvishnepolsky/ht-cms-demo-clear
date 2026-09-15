import React from "react";
import { Icon } from "./ui";

/**
 * Small green "Verified by CLEAR" badge rendered next to the label of a field
 * that was prefilled from a completed CLEAR identity verification
 * (`primaryApplicant.identityVerification.verifiedFields`). Purely
 * presentational — the field itself stays editable.
 */
export function VerifiedChip({
  label = "Verified by CLEAR",
  className = "",
  compact = false,
}: {
  label?: string;
  className?: string;
  /** Icon-only variant for narrow columns (State / ZIP); the label stays in the tooltip + aria-label. */
  compact?: boolean;
}) {
  return (
    <span
      className={
        "verified-chip " +
        (compact ? "verified-chip--compact " : "") +
        className
      }
      aria-label={label}
      title={label}
    >
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

/**
 * Treatment for a control prefilled from a CLEAR verification: the field is
 * greyed out and locked (the verified value is the record). `inset` is
 * accepted for call-site compatibility and has no effect.
 */
export function VerifiedControl({
  verified,
  inset: _inset = false,
  children,
}: {
  verified: boolean;
  inset?: boolean;
  children: React.ReactNode;
}) {
  if (!verified) return <>{children}</>;
  return (
    <div
      className="verified-control"
      title="Verified by CLEAR"
      aria-readonly="true"
    >
      {children}
    </div>
  );
}

/**
 * A document requirement already satisfied by CLEAR verification (e.g. proof
 * of identity) — rendered in place of the upload dropzone.
 */
export function VerifiedRequirement({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="verified-requirement" role="status">
      <span className="verified-requirement-icon" aria-hidden="true">
        <Icon name="check" size={16} />
      </span>
      <div className="verified-requirement-body">
        <div className="verified-requirement-title">{title}</div>
        <div className="verified-requirement-detail">{detail}</div>
      </div>
      <span className="verified-pill verified-pill--sm">
        <Icon name="shieldCheck" size={14} aria-hidden="true" /> Verified with
        CLEAR
      </span>
    </div>
  );
}

export default VerifiedChip;
