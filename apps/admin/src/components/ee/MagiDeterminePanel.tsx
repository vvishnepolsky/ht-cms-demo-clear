/**
 * MagiDeterminePanel — Determine-phase content for MAGI cases.
 *
 * Shows a "ready for determination" summary card. The actual Approve / Deny
 * decision is captured in ReviewDecideModal, opened via the bottom
 * CaseActionBar "Review & Decide →" CTA. The radio choices are not repeated
 * here to avoid duplicating the modal content (ENG-1866).
 */

export function MagiDeterminePanel() {
  return (
    <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
      <p className="text-xs font-semibold text-foreground mb-1">Ready for determination</p>
      <p className="text-xs text-muted-foreground">
        Verification is complete. Use the <strong>Review &amp; Decide →</strong> button below to record the final
        eligibility decision and generate the Notice of Action.
      </p>
    </div>
  );
}
