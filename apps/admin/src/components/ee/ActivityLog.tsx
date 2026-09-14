/**
 * ActivityLog -- per-case audit trail panel for the EE Case Workspace.
 *
 * The hackathon plan calls for an audit log panel surfacing status
 * transitions, caseworker actions, and write events. medicaid-ee-service
 * writes audit events via @ht/audit-logger to CloudWatch but does not yet
 * expose them via GraphQL, so this component derives a timeline client-side
 * from fields we already have on EECase + EEDetermination, plus in-session
 * entries added when the caseworker approves / denies / issues an RFI.
 *
 * When medicaid-ee-service ships a `caseEvents` resolver, the
 * `derivedEntries` block becomes the fallback path and a real query
 * provides the canonical source.
 */

import { CheckCircle2, Circle, FilePlus, XCircle, AlertCircle, Gavel } from 'lucide-react';
import { Card, CardContent } from '../ui';
import { NoteBullets } from '../ui/note-bullets';
import { cn } from '../../lib/utils';
import type { EECase, EEDetermination } from '../../types/ee';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorRole: 'system' | 'caseworker' | 'applicant';
  icon: 'received' | 'review' | 'approved' | 'denied' | 'rfi' | 'determined';
  text: string;
}

const ICON_MAP: Record<ActivityLogEntry['icon'], { component: typeof CheckCircle2; className: string }> = {
  received: { component: FilePlus, className: 'text-blue-700 bg-blue-50 ring-blue-200' },
  review: { component: Circle, className: 'text-amber-700 bg-amber-50 ring-amber-200' },
  approved: { component: CheckCircle2, className: 'text-green-700 bg-green-50 ring-green-200' },
  denied: { component: XCircle, className: 'text-red-700 bg-red-50 ring-red-200' },
  rfi: { component: AlertCircle, className: 'text-amber-700 bg-amber-50 ring-amber-200' },
  determined: { component: Gavel, className: 'text-purple-700 bg-purple-50 ring-purple-200' },
};

const ACTOR_ROLE_LABEL: Record<ActivityLogEntry['actorRole'], string> = {
  system: 'System',
  caseworker: 'Caseworker',
  applicant: 'Applicant',
};

function fmtTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function memberLabel(det: EEDetermination): string {
  const p = det.person;
  if (p?.firstName && p.lastName) return `${p.firstName} ${p.lastName}`;
  return 'household member';
}

/**
 * Derive a baseline timeline from existing case + determination data.
 * Stable across renders; in-session events are merged on top.
 */
export function deriveActivityEntries(eeCase: EECase): ActivityLogEntry[] {
  const entries: ActivityLogEntry[] = [];

  entries.push({
    id: `received-${eeCase.id}`,
    timestamp: eeCase.createdAt,
    actor: 'sys',
    actorRole: 'system',
    icon: 'received',
    text: `Application received · case ${eeCase.caseNumber ?? eeCase.id.slice(-8).toUpperCase()} indexed to caseworker queue`,
  });

  // Determinations — order by determinedAt ascending.
  const determinations = (eeCase.determinations ?? [])
    .filter((d) => d.determinedAt != null)
    .sort((a, b) => new Date(a.determinedAt!).getTime() - new Date(b.determinedAt!).getTime());
  for (const d of determinations) {
    entries.push({
      id: `det-${d.id}`,
      timestamp: d.determinedAt!,
      actor: d.determinedBy ?? 'sys',
      actorRole: d.determinedBy ? 'caseworker' : 'system',
      icon: 'determined',
      text: `Determination for ${memberLabel(d)} — ${d.status} (${d.category === 'MAGI' ? 'MAGI' : 'Non-MAGI'})`,
    });
  }

  // Terminal status (APPROVED / DENIED). updatedAt is the best proxy we have
  // until medicaid-ee-service exposes a real event stream.
  if (eeCase.status === 'APPROVED') {
    entries.push({
      id: `status-approved-${eeCase.id}`,
      timestamp: eeCase.updatedAt,
      actor: 'caseworker',
      actorRole: 'caseworker',
      icon: 'approved',
      text: `Case approved${eeCase.statusReason ? ` — ${eeCase.statusReason.replace(/_/g, ' ').toLowerCase()}` : ''}`,
    });
  } else if (eeCase.status === 'DENIED') {
    entries.push({
      id: `status-denied-${eeCase.id}`,
      timestamp: eeCase.updatedAt,
      actor: 'caseworker',
      actorRole: 'caseworker',
      icon: 'denied',
      text: `Case denied${eeCase.statusReason ? ` — ${eeCase.statusReason.replace(/_/g, ' ').toLowerCase()}` : ''}`,
    });
  } else if (eeCase.status === 'IN_REVIEW') {
    entries.push({
      id: `status-review-${eeCase.id}`,
      timestamp: eeCase.updatedAt,
      actor: 'sys',
      actorRole: 'system',
      icon: 'review',
      text: 'Case routed to caseworker review queue',
    });
  } else if (eeCase.status === 'PENDING_VERIFICATION') {
    entries.push({
      id: `status-pending-${eeCase.id}`,
      timestamp: eeCase.updatedAt,
      actor: 'sys',
      actorRole: 'system',
      icon: 'rfi',
      text: `Verification pending${eeCase.flagReason ? ` — ${eeCase.flagReason}` : ''}`,
    });
  }

  return entries;
}

export interface ActivityLogProps {
  eeCase: EECase;
  /**
   * In-session entries added since this workspace was opened (approve/deny
   * confirmations, RFI issuances). Rendered newest-first above the derived
   * entries so the caseworker sees immediate feedback from their own action.
   */
  sessionEntries?: ActivityLogEntry[];
}

export function ActivityLog({ eeCase, sessionEntries = [] }: ActivityLogProps) {
  const derived = deriveActivityEntries(eeCase);

  // Newest first.
  const merged = [...sessionEntries, ...derived].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-5 py-4 border-b">
          <h3 className="text-sm font-semibold text-foreground">Activity Log</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Status changes and caseworker actions are written to the case audit trail.
          </p>
        </div>
        {merged.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted-foreground italic">No activity recorded yet.</div>
        ) : (
          <ol className="divide-y" aria-label="Case activity log">
            {merged.map((entry) => {
              const icon = ICON_MAP[entry.icon];
              const IconComponent = icon.component;
              return (
                <li key={entry.id} className="px-5 py-3 flex items-start gap-3">
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ring-1 mt-0.5',
                      icon.className,
                    )}
                    aria-hidden="true"
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <NoteBullets note={entry.text} size="sm" />
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmtTimestamp(entry.timestamp)} · {ACTOR_ROLE_LABEL[entry.actorRole]}
                      {entry.actor !== 'sys' && entry.actor !== 'caseworker' && (
                        <>
                          {' '}
                          <span className="text-muted-foreground/70">({entry.actor})</span>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/** Kind constants for DDS activity-log entries.
 *
 * Exported so callers (`WorkspacePage.tsx`, `ActivityLog.test.tsx`) can
 * reference the canonical values without duplicating string literals —
 * satisfies coding-standards.md § C.1 (3+ occurrences → extract const).
 */
export const DDS_KIND_REFERRED = 'dds_referred' as const;
export const DDS_KIND_CONFIRMED = 'dds_confirmed' as const;

/** Helper for callers to build an in-session entry from a mutation result. */
export function buildSessionEntry({
  kind,
  caseworkerName,
  reason,
}: {
  kind: 'approved' | 'denied' | 'rfi' | 'rfi_resolved' | typeof DDS_KIND_REFERRED | typeof DDS_KIND_CONFIRMED;
  caseworkerName: string;
  reason?: string;
}): ActivityLogEntry {
  const id = `session-${kind}-${Date.now()}`;
  const timestamp = new Date().toISOString();
  if (kind === 'approved') {
    return {
      id,
      timestamp,
      actor: caseworkerName,
      actorRole: 'caseworker',
      icon: 'approved',
      text: `Case approved by ${caseworkerName} — audit entry written and assigned to worker ID`,
    };
  }
  if (kind === 'denied') {
    return {
      id,
      timestamp,
      actor: caseworkerName,
      actorRole: 'caseworker',
      icon: 'denied',
      text: `Case denied by ${caseworkerName}${reason ? ` — ${reason}` : ''} — audit entry written`,
    };
  }
  if (kind === 'rfi_resolved') {
    return {
      id,
      timestamp,
      actor: caseworkerName,
      actorRole: 'caseworker',
      icon: 'approved',
      text: `RFI resolved by ${caseworkerName}${reason ? ` — ${reason}` : ''}`,
    };
  }
  if (kind === DDS_KIND_REFERRED) {
    return {
      id,
      timestamp,
      actor: caseworkerName,
      actorRole: 'caseworker',
      icon: 'rfi',
      text: `DDS referral packet sent by ${caseworkerName} — case held pending disability determination`,
    };
  }
  if (kind === DDS_KIND_CONFIRMED) {
    return {
      id,
      timestamp,
      actor: caseworkerName,
      actorRole: 'caseworker',
      icon: 'determined',
      text: `DDS confirmed disability — ABD category assigned by ${caseworkerName} — eligibility notice queued`,
    };
  }
  return {
    id,
    timestamp,
    actor: caseworkerName,
    actorRole: 'caseworker',
    icon: 'rfi',
    text: `RFI issued by ${caseworkerName}${reason ? ` — ${reason}` : ''}`,
  };
}
