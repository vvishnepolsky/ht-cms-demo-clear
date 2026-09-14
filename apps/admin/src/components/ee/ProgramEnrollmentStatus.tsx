/**
 * ProgramEnrollmentStatus — lists each program/category determination on the
 * case with a sub-description and status badge. Mirrors the storyboard's
 * DynamicProgramsPanel "Program Enrollment Status" section that closes the
 * Evaluate phase, before the caseworker advances to Determine.
 */

import { cn, formatCategory } from '../../lib/utils';
import type { EECase, EEDetermination, DeterminationStatus } from '../../types/ee';

interface ProgramRow {
  key: string;
  name: string;
  sub: string;
  badge: { label: string; cls: string };
}

const STATUS_BADGE: Record<DeterminationStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  ELIGIBLE: { label: 'Eligible', cls: 'bg-green-50 text-green-700 border-green-200' },
  INELIGIBLE: { label: 'Ineligible', cls: 'bg-red-50 text-red-700 border-red-200' },
  DEFERRED: { label: 'Deferred', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

function programName(d: EEDetermination): string {
  const base = d.category === 'NON_MAGI' ? 'Non-MAGI Medicaid — ABD' : 'State Medicaid (MAGI)';
  if (!d.person?.firstName) return base;
  return `${base} — ${d.person.firstName}`;
}

function programSub(d: EEDetermination): string {
  if (d.status === 'ELIGIBLE') {
    if (d.effectiveDate) return `Effective ${d.effectiveDate.slice(0, 10)} · ${formatCategory(d.category)} pathway`;
    return `${formatCategory(d.category)} pathway · awaiting effective date`;
  }
  if (d.status === 'INELIGIBLE') {
    return d.denialReason ?? 'Does not meet eligibility criteria for this pathway';
  }
  if (d.status === 'DEFERRED') {
    return 'Deferred — pending another pathway or documentation';
  }
  // PENDING
  if (d.category === 'NON_MAGI') {
    return 'ABD pathway — awaiting AVS / DDS confirmation before final determination';
  }
  return 'MAGI EDBC pending — re-run after income/household verification';
}

export interface ProgramEnrollmentStatusProps {
  eeCase: EECase;
}

export function ProgramEnrollmentStatus({ eeCase }: ProgramEnrollmentStatusProps) {
  const rows: ProgramRow[] = eeCase.determinations.map((d) => ({
    key: d.id,
    name: programName(d),
    sub: programSub(d),
    badge: STATUS_BADGE[d.status],
  }));

  // No determinations yet — fall back to a single placeholder row derived
  // from intakeData so the section still renders during the demo.
  if (rows.length === 0) {
    const intake = (eeCase.intakeData ?? {}) as Record<string, unknown>;
    const requested = typeof intake.requestedProgram === 'string' ? intake.requestedProgram : 'State Medicaid (MAGI)';
    rows.push({
      key: 'placeholder',
      name: requested,
      sub: 'EDBC pending — determinations will populate after the rules engine runs',
      badge: STATUS_BADGE.PENDING,
    });
  }

  return (
    <div>
      <p
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: 'var(--civic-text-placeholder)' }}
      >
        Program Enrollment Status
      </p>
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        {rows.map((row) => (
          <div key={row.key} className="flex items-start px-4 py-3 gap-3 border-b border-border last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">{row.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{row.sub}</p>
            </div>
            <span
              className={cn(
                'inline-flex items-center font-medium rounded-md text-[10px] px-1.5 py-0.5 border whitespace-nowrap flex-shrink-0',
                row.badge.cls,
              )}
            >
              {row.badge.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
