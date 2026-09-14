/**
 * CaseDetailsDrawer — full-viewport overlay invoked from the Cases list.
 *
 * Storyboard parity: /Downloads/CMS Demo Storyboard/src/components/CaseDetailsDrawer.jsx.
 * Layer 1 of ENG-1708 ships the chrome (header, breadcrumb, tab nav,
 * focus trap, ESC, scroll lock) with 4 stub tab contents. Layers 2-5
 * swap each stub for the real tab implementation.
 *
 * Accessibility (AC-003 / AC-004):
 * - role="dialog" + aria-modal traps screen readers inside the overlay.
 * - Focus is trapped via Tab cycling between the first/last focusable
 *   elements, and the close button receives initial focus on open.
 * - ESC closes the drawer; focus is restored to the triggering element
 *   captured at mount via document.activeElement.
 * - Body scroll is locked while open.
 *
 * Why a single full-viewport overlay (not a side sheet): mirrors the
 * storyboard. The drawer takes over the screen so the caseworker isn't
 * juggling the Cases list and a partial panel; ESC / Back returns them
 * exactly where they were.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { ChevronLeft, ClipboardList, FileText, History, Mail, type LucideIcon } from 'lucide-react';
import { getCaseDetail, hasCaseDetail, type CaseMessage } from '../../../data/case-details';
import { GET_EE_CASE_QUERY } from '../../../lib/ee-operations';
import { deriveCaseDetail } from '../../../lib/derive-case-detail';
import { eeFlagClasses } from '../../../lib/ee-flags';
import { hasPermission, useAdmin } from '../../../lib/auth-store';
import { useEscapeKeyToClose, useFocusTrapAndRestore, useScrollLock } from './hooks';
import { ApplicationDataTab } from './tabs/ApplicationDataTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { NoticesMessagesTab } from './tabs/NoticesMessagesTab';
import { ActivityLogTab } from './tabs/ActivityLogTab';
import { MessagePreviewModal, DeliveryPreviewModal, type PreviewingChannel } from './MessagePreviewModal';
import type { DrawerCaseRow, DrawerTabId } from './types';

interface PreviewingMessageState {
  message: CaseMessage;
  allChannels: ReadonlyArray<string>;
}

interface CaseDetailsDrawerProps {
  caseRow: DrawerCaseRow;
  onClose: () => void;
}

interface TabDef {
  id: DrawerTabId;
  label: string;
  icon: LucideIcon;
  /**
   * Optional Casbin permission gate. When set, the tab is hidden from users
   * whose JWT permissions claim does not include this value. Server-side
   * `requirePermission` remains the actual authority — this is affordance
   * gating only, to avoid showing tabs that would render a permission-denied
   * error state. Generalise into a TabDef field rather than hard-coding the
   * audit-log case so future per-permission tabs can opt in the same way.
   */
  requiresPermission?: string;
}

const ALL_TABS: TabDef[] = [
  { id: 'application', label: 'Application Data', icon: ClipboardList },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'messages', label: 'Messages & Notices', icon: Mail },
  // ENG-1667: hide the Activity Log tab from users without `audit_logs:read`
  // (only AUDITOR / CUSTOMER_ADMIN, per services/identity-service seed). A
  // CASEWORKER persona without the grant would otherwise see the static error
  // state on every drawer open — a worse demo experience than the tab simply
  // being absent.
  { id: 'activity', label: 'Activity Log', icon: History, requiresPermission: 'audit_logs:read' },
];

/**
 * ID helpers for the tab/panel ARIA wiring. Three+ call sites referenced the
 * raw `drawer-tab-` and `drawer-panel-` prefixes inline; centralizing them
 * keeps the tablist/tabpanel cross-references in sync as L2-L5 layers extend
 * the drawer. See standards/coding-standards.md C.1.
 */
const tabButtonId = (id: DrawerTabId) => `drawer-tab-${id}`;
const tabPanelId = (id: DrawerTabId) => `drawer-panel-${id}`;

export function CaseDetailsDrawer({ caseRow, onClose }: CaseDetailsDrawerProps) {
  const [tab, setTab] = useState<DrawerTabId>('application');
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Filter tabs by the signed-in admin's permissions. Stable as long as the
  // session doesn't change mid-drawer (which can't happen — the drawer closes
  // on logout via auth-store snapshot updates).
  const admin = useAdmin();
  const tabs = useMemo(
    () => ALL_TABS.filter((t) => !t.requiresPermission || hasPermission(admin, t.requiresPermission)),
    [admin],
  );

  // L4 — message preview modal stack. Owned at the drawer level so the
  // modals can render above the drawer chrome and survive the active-tab
  // switch (caseworker might Tab from Messages to Activity with a preview open).
  const [previewingMsg, setPreviewingMsg] = useState<PreviewingMessageState | null>(null);
  const [previewingMsgChannel, setPreviewingMsgChannel] = useState<PreviewingChannel | null>(null);

  useScrollLock();
  useFocusTrapAndRestore(containerRef, closeButtonRef);

  // Single composite ESC handler owned by the drawer. We do NOT stack
  // per-modal ESC listeners because `addEventListener` dispatches in
  // registration order (FIFO), so an earlier-registered drawer listener
  // would close the drawer before a later-registered modal listener could
  // see the event. Instead, the drawer prioritises closing the innermost
  // open overlay (channel modal → message modal → drawer).
  const handleEscape = useCallback(() => {
    if (previewingMsgChannel) {
      setPreviewingMsgChannel(null);
      return;
    }
    if (previewingMsg) {
      setPreviewingMsg(null);
      return;
    }
    onClose();
  }, [previewingMsgChannel, previewingMsg, onClose]);
  useEscapeKeyToClose(handleEscape);

  const { data: caseQueryData } = useQuery(GET_EE_CASE_QUERY, {
    variables: { id: caseRow.id },
    fetchPolicy: 'cache-first',
  });
  const eeCase = caseQueryData?.medicaidEeCase ?? null;
  const details = eeCase ? deriveCaseDetail(eeCase) : getCaseDetail(caseRow.id);
  // True when we have real case data to render — either a backend-derived
  // eeCase or a hand-authored fixture entry. False only when we'd be
  // falling through to the demo default (formerly Robert Mitchell), in
  // which case fixture-backed tabs (Application Data, Messages & Notices)
  // render an empty state instead of someone else's identity. The
  // Documents and Activity Log tabs pull from backend data and ignore
  // this flag.
  const hasRealDetails = eeCase !== null || hasCaseDetail(caseRow.id);
  const caseLabel = caseRow.caseNumber ?? caseRow.id.slice(-8).toUpperCase();

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="case-drawer-title"
      className="fixed inset-x-0 bottom-0 top-12 z-40 flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--civic-bg-app)' }}
    >
      {/* Breadcrumb / header bar */}
      <div
        className="border-b px-5 h-12 flex items-center justify-between flex-shrink-0"
        style={{
          backgroundColor: 'var(--civic-bg-card)',
          borderColor: 'var(--civic-border-subtle)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 text-xs flex-shrink-0 transition-colors"
            style={{ color: 'var(--civic-text-secondary)' }}
          >
            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back
          </button>
          <div
            className="w-px h-4 flex-shrink-0"
            style={{ backgroundColor: 'var(--civic-border-component)' }}
            aria-hidden="true"
          />
          <span
            id="case-drawer-title"
            className="font-semibold text-sm truncate"
            style={{ color: 'var(--civic-text-primary)' }}
          >
            {caseRow.applicantName}
          </span>
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--civic-text-placeholder)' }}>
            {caseLabel}
          </span>
          <StatusPill text={caseRow.status} />
          {/* Render all flag pills from the caller's flags array; if no
              array was passed, fall back to a single pill from flagReason
              for backwards compat. */}
          {(caseRow.flags && caseRow.flags.length > 0
            ? caseRow.flags
            : caseRow.flagReason
              ? [caseRow.flagReason]
              : []
          ).map((flag) => (
            <FlagPill key={flag} text={flag} />
          ))}
        </div>
      </div>

      {/* Tab nav */}
      <div
        role="tablist"
        aria-label="Case detail sections"
        className="border-b px-6 flex gap-1 flex-shrink-0"
        style={{
          backgroundColor: 'var(--civic-bg-card)',
          borderColor: 'var(--civic-border-subtle)',
        }}
      >
        {tabs.map((t) => {
          const isActive = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={tabButtonId(t.id)}
              aria-selected={isActive}
              aria-controls={tabPanelId(t.id)}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(event) => handleTabKey(event, t.id, tabs, setTab)}
              className="py-3 px-4 text-sm font-medium whitespace-nowrap transition-colors inline-flex items-center gap-2"
              style={
                isActive
                  ? {
                      color: 'var(--civic-accent-solid)',
                      borderBottom: '2px solid var(--civic-accent-solid)',
                    }
                  : { color: 'var(--civic-text-secondary)' }
              }
            >
              <t.icon className="w-4 h-4" aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--civic-bg-app)' }}>
        <div
          role="tabpanel"
          id={tabPanelId(tab)}
          aria-labelledby={tabButtonId(tab)}
          className="max-w-5xl mx-auto px-6 py-6"
        >
          {tab === 'application' && (
            <ApplicationDataTab caseRow={caseRow} details={details} hasRealDetails={hasRealDetails} />
          )}
          {tab === 'documents' && <DocumentsTab caseRow={caseRow} details={details} hasRealDetails={hasRealDetails} />}
          {tab === 'messages' && (
            <NoticesMessagesTab
              caseRow={caseRow}
              details={details}
              hasRealDetails={hasRealDetails}
              onPreviewMessage={(message, allChannels) => setPreviewingMsg({ message, allChannels })}
            />
          )}
          {tab === 'activity' && <ActivityLogTab caseRow={caseRow} details={details} hasRealDetails={hasRealDetails} />}
          {/* details is read here so the type narrows in L2-L5 swaps. */}
          {/* Narration: use the real case row name when no fixture exists,
              otherwise we'd leak the fallback fixture's identity to screen
              readers (the visible UI is gated separately by tab). */}
          <span className="sr-only">
            Case loaded for {hasRealDetails ? details.identity.fullName : caseRow.applicantName}
          </span>
        </div>
      </div>

      {/* L4 — message preview modal stack. Outer modal closes when user
       * clicks the backdrop; inner modal sits at z-[60] so it always layers
       * above the outer regardless of mount order. */}
      {previewingMsg && (
        <MessagePreviewModal
          message={previewingMsg.message}
          allChannels={previewingMsg.allChannels}
          caseRow={caseRow}
          applicantEmail={details.contact.email}
          applicantPhone={details.contact.phone}
          applicantAddress={details.contact.homeAddress}
          onClose={() => setPreviewingMsg(null)}
          onSelectChannel={(channel) => setPreviewingMsgChannel(channel)}
        />
      )}
      {previewingMsgChannel && (
        <DeliveryPreviewModal channel={previewingMsgChannel} onClose={() => setPreviewingMsgChannel(null)} />
      )}
    </div>
  );
}

/**
 * Arrow-key navigation between tabs (WCAG roving tabindex pattern).
 * Receives the currently visible tab list so permission-hidden tabs are
 * skipped during arrow traversal too.
 */
function handleTabKey(
  event: React.KeyboardEvent<HTMLButtonElement>,
  currentId: DrawerTabId,
  visibleTabs: ReadonlyArray<TabDef>,
  setTab: (id: DrawerTabId) => void,
) {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  event.preventDefault();
  const ids = visibleTabs.map((t) => t.id);
  const currentIndex = ids.indexOf(currentId);
  const nextIndex =
    event.key === 'ArrowRight' ? (currentIndex + 1) % ids.length : (currentIndex - 1 + ids.length) % ids.length;
  const nextId = ids[nextIndex]!;
  setTab(nextId);
  // Move focus to the newly active tab button.
  window.requestAnimationFrame(() => {
    document.getElementById(tabButtonId(nextId))?.focus();
  });
}

/**
 * Map a raw status string to a human label + tone. Accepts both the raw
 * EECaseStatus enum values (PENDING_VERIFICATION, IN_REVIEW, etc.) and
 * already-humanized labels ("Action Needed", "Approved"), so this works
 * whether the caller passes raw or pre-formatted text.
 */
function statusPillStyle(raw: string): { label: string; classes: string } {
  const t = raw.toUpperCase();
  if (t === 'APPROVED' || t.includes('AUTO-APPROVED') || t.includes('AUTO_APPROVED')) {
    return { label: 'Approved', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (t === 'DENIED') {
    return { label: 'Denied', classes: 'bg-red-50 text-red-700 border-red-200' };
  }
  if (t === 'CANCELED' || t === 'CANCELLED') {
    return { label: 'Canceled', classes: 'bg-slate-100 text-slate-700 border-slate-200' };
  }
  if (t.includes('WAITING')) {
    return { label: raw, classes: 'bg-blue-50 text-blue-700 border-blue-200' };
  }
  // Default — anything in PENDING_VERIFICATION / IN_REVIEW / "Action Needed"
  // family renders as the amber Action Needed pill.
  const label = raw === 'PENDING_VERIFICATION' || raw === 'IN_REVIEW' ? 'Action Needed' : raw;
  return { label, classes: 'bg-amber-50 text-amber-800 border-amber-200' };
}

function StatusPill({ text }: { text: string }) {
  const { label, classes } = statusPillStyle(text);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${classes}`}>
      {label}
    </span>
  );
}

function FlagPill({ text }: { text: string }) {
  // Reuse the shared dashboard flag color mapping so the drawer pill colors
  // match the case row pills (DIS=purple, RFI=amber, RENEWAL=blue, etc.).
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border whitespace-nowrap ${eeFlagClasses(text)}`}
    >
      {text}
    </span>
  );
}
