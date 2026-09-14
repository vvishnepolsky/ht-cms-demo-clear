/**
 * Single source of truth for EE case flag badges. Used by the dashboard list
 * column and the case workspace nav bar — keep these in lockstep so a flag
 * type added in one place renders with the correct tone everywhere.
 *
 * Mirrors the storyboard's `flagColor()` map. Add new flag types here and
 * the badges on both surfaces pick them up automatically.
 *
 * Extracted per standards/coding-standards.md § C.2 (sibling-file parity) —
 * previously two divergent maps lived in DashboardPage.tsx (7 entries) and
 * CaseNavBar.tsx (13 entries), so flags only registered in one map rendered
 * with the fallback tone on the other surface.
 */

export const EE_FLAG_COLORS: Record<string, string> = {
  'Auto-Approved': 'bg-blue-600 text-white border-blue-700',
  'NO-TOUCH': 'bg-blue-50 text-blue-700 border-blue-200',
  'EX-PARTE': 'bg-blue-50 text-blue-700 border-blue-200',
  DIS: 'bg-purple-50 text-purple-700 border-purple-200',
  PREG: 'bg-pink-50 text-pink-700 border-pink-200',
  RENEW: 'bg-orange-50 text-orange-700 border-orange-200',
  RENEWAL: 'bg-blue-50 text-blue-700 border-blue-200',
  APPEAL: 'bg-orange-50 text-orange-700 border-orange-200',
  EXPED: 'bg-red-50 text-red-700 border-red-200',
  EMERG: 'bg-red-50 text-red-700 border-red-200',
  MCO: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  SSI: 'bg-purple-50 text-purple-700 border-purple-200',
  NEWBORN: 'bg-blue-50 text-blue-700 border-blue-200',
  PE: 'bg-teal-50 text-teal-700 border-teal-200',
  ROP: 'bg-blue-50 text-blue-700 border-blue-200',
  FR: 'bg-amber-50 text-amber-700 border-amber-200',
  // Verify Assist (CLEAR): server-set out-of-state Medicaid finding, and the
  // client-derived "identity verified by CLEAR" chip.
  'OOS-MCD': 'bg-red-50 text-red-700 border-red-200',
  'ID-CLEAR': 'bg-green-50 text-green-700 border-green-200',
};

/** Human-readable tooltip for terse flag codes (rendered as `title`). */
export const EE_FLAG_LABELS: Record<string, string> = {
  'OOS-MCD': 'Out-of-state Medicaid coverage',
  'ID-CLEAR': 'Identity verified by CLEAR',
  DIS: 'Disability indicated',
  PREG: 'Pregnancy',
  SSI: 'SSI / SSDI recipient',
  EXPED: 'Expedited',
  EMERG: 'Emergency',
};

export function eeFlagLabel(flag: string): string | undefined {
  return EE_FLAG_LABELS[flag];
}

export const EE_FLAG_FALLBACK = 'bg-gray-100 text-gray-600 border-gray-200';

export const EE_FLAG_DIS = 'DIS' as const;
export const EE_FLAG_PREG = 'PREG' as const;
export const EE_FLAG_SSI = 'SSI' as const;

export function eeFlagClasses(flag: string): string {
  return EE_FLAG_COLORS[flag] ?? EE_FLAG_FALLBACK;
}
