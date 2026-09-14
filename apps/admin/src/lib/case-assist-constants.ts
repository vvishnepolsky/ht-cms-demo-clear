/** Shared eyebrow label constants for Case Assist banner copy (ENG-1670). */

export const EYEBROW_ACTION_NEEDED = 'ACTION NEEDED' as const;
export const EYEBROW_CASE_APPROVED = 'CASE APPROVED' as const;
export const EYEBROW_CASE_DENIED = 'CASE DENIED' as const;
export const EYEBROW_READY_FOR_APPROVAL = 'READY FOR APPROVAL' as const;
export const EYEBROW_CASE_IN_PROGRESS = 'CASE IN PROGRESS' as const;

/**
 * Demo-static DDS determination reference shown once DDS confirms disability.
 * Mirrors the storyboard's "DDS-2026-IA-058293" adapted to the State X
 * case-number prefix (SX). Canonical here (leaf module) so the Disability
 * Determination card (NonMagiAssetsPanel) and the Case Assist banner
 * derivation reference the same value — the DDS federation isn't wired to
 * the EE service yet.
 */
export const DDS_DETERMINATION_REF = 'DDS-2026-SX-058293' as const;
