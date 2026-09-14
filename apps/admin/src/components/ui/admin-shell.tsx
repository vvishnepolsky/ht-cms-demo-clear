import * as React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Copy, PanelLeft } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { Separator } from './separator';
import { Skeleton } from './skeleton';
import { SidebarStateContext } from './sidebar-nav';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminShellRecentVisit {
  id: string;
  name: string;
  onClick: () => void;
}

export interface AdminShellTitleBlock {
  /** Primary title (entity name or page heading) */
  primaryTitle: string;
  /** Secondary label shown alongside the primary title (e.g. an ID) */
  secondaryTitle?: string;
  /** Value to copy when the copy button is clicked */
  copyId?: string;
}

export interface AdminShellProps {
  /** Page content */
  children: React.ReactNode;

  // ── Top banner (teal brand bar) ─────────────────────────────────────────────
  /**
   * Brand block rendered at the left of the top banner. When provided, the
   * sidebar's org-header section is hidden (brand lives in the banner instead).
   */
  bannerBrand?: React.ReactNode;
  /** Label rendered at the right of the top banner (e.g. "Caseworker Portal") */
  bannerLabel?: React.ReactNode;

  // ── Sidebar avatar ──────────────────────────────────────────────────────────
  /** Avatar rendered at the bottom of the sidebar (e.g. signed-in user initials) */
  userAvatar?: React.ReactNode;

  // ── Org header (legacy — used when no bannerBrand is provided) ──────────────
  /** Logo rendered in the top-left of the sidebar. Typically a 32×32 rounded image. */
  logo?: React.ReactNode;
  /** Organisation name shown next to the logo when expanded */
  orgName?: string;
  /** Content rendered inside the org dropdown menu */
  orgMenuContent?: React.ReactNode;

  // ── Navigation ──────────────────────────────────────────────────────────────
  /**
   * Full nav slot. Render your search row, nav items, and sections here.
   * The component handles the sidebar container, collapse animation, and recents.
   * SidebarNavItems rendered here automatically receive the collapsed state via context —
   * do not pass `sidebarOpen` to them manually.
   */
  navContent?: React.ReactNode;

  // ── Recents ─────────────────────────────────────────────────────────────────
  /** Recent visits shown at the bottom of the sidebar when expanded */
  recentVisits?: AdminShellRecentVisit[];

  // ── Sidebar state ────────────────────────────────────────────────────────────
  /** Initial open state (uncontrolled) */
  defaultSidebarOpen?: boolean;
  /** Controlled open state */
  sidebarOpen?: boolean;
  /** Called when the sidebar toggle is clicked (controlled mode) */
  onSidebarOpenChange?: (open: boolean) => void;

  // ── Header ───────────────────────────────────────────────────────────────────
  /**
   * List page header variant for a plain page title.
   * Ignored when `titleBlock` is provided.
   */
  pageTitle?: string;
  /** Optional status badge rendered next to the page title */
  statusPill?: React.ReactNode;
  /**
   * Detail page header variant for an entity title block with optional ID and copy.
   * Takes precedence over `pageTitle`.
   */
  titleBlock?: AdminShellTitleBlock;
  /** Loading skeleton state for the title block */
  isLoading?: boolean;
  /** Empty / not-found state for the title block */
  isEmpty?: boolean;
  /** Entity label used in the empty state message */
  entityType?: string;
  /** Primary action button rendered on the right side of the header */
  primaryAction?: React.ReactNode;
  /** Secondary action buttons rendered to the left of the primary action */
  secondaryActions?: React.ReactNode[];
  /** Wizard-style left-side actions (Cancel, Previous) */
  leftActions?: React.ReactNode[];
  /**
   * Toggle rendered after the primary action, typically used to open/close
   * a right-side detail panel.
   */
  detailsPanelToggle?: React.ReactNode;

  /** Additional class names for the root element */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

function AdminShell({
  children,
  bannerBrand,
  bannerLabel,
  userAvatar,
  logo,
  orgName,
  orgMenuContent,
  navContent,
  recentVisits = [],
  defaultSidebarOpen = true,
  sidebarOpen: sidebarOpenProp,
  onSidebarOpenChange,
  pageTitle,
  statusPill,
  titleBlock,
  isLoading = false,
  isEmpty = false,
  entityType = 'record',
  primaryAction,
  secondaryActions = [],
  leftActions = [],
  detailsPanelToggle,
  className,
}: AdminShellProps) {
  const hasBanner = bannerBrand !== undefined || bannerLabel !== undefined;
  // ── Sidebar open state (uncontrolled or controlled) ─────────────────────────
  const [_sidebarOpen, _setSidebarOpen] = React.useState(defaultSidebarOpen);
  const isControlled = sidebarOpenProp !== undefined;
  const sidebarOpen = isControlled ? sidebarOpenProp : _sidebarOpen;

  const setSidebarOpen = React.useCallback(
    (value: boolean) => {
      if (!isControlled) _setSidebarOpen(value);
      onSidebarOpenChange?.(value);
    },
    [isControlled, onSidebarOpenChange],
  );

  // ── Tooltip delay — wait for collapse animation before enabling ─────────────
  const [showTooltips, setShowTooltips] = React.useState(false);
  // eslint-disable-next-line no-restricted-syntax -- imperative timer tied to a sidebar-collapse animation; the 200ms delay needs to be cancelled if sidebarOpen flips back during the wait. Named alternatives don't fit: this isn't a key-reset (the same component stays mounted), not a mutation callback, and not a user-event handler — it's an animation-coordination side effect.
  React.useEffect(() => {
    if (!sidebarOpen) {
      const t = setTimeout(() => setShowTooltips(true), 200);
      return () => clearTimeout(t);
    }
    setShowTooltips(false);
  }, [sidebarOpen]);

  // ── Copy ID ─────────────────────────────────────────────────────────────────
  const handleCopyId = React.useCallback(() => {
    if (!titleBlock?.copyId) return;
    const text = titleBlock.secondaryTitle
      ? `${titleBlock.primaryTitle} — ${titleBlock.secondaryTitle}`
      : titleBlock.primaryTitle;
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }, [titleBlock]);

  return (
    <div data-slot="admin-shell" data-banner={hasBanner ? '' : undefined} className={className}>
      {/* ── Top banner (teal brand bar) ─────────────────────────────────────── */}
      {hasBanner && (
        <div data-slot="admin-shell-banner">
          {bannerBrand && <div data-slot="admin-shell-banner-brand">{bannerBrand}</div>}
          {bannerLabel && <div data-slot="admin-shell-banner-label">{bannerLabel}</div>}
        </div>
      )}

      {/* ── Body: sidebar + main ────────────────────────────────────────────── */}
      <div data-slot="admin-shell-body">
        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <div data-slot="admin-shell-sidebar" data-open={sidebarOpen ? '' : undefined}>
          {/* Org header — hidden when banner is rendered, since brand lives there */}
          {!hasBanner && (
            <div data-slot="admin-shell-org-header">
              {orgMenuContent ? (
                <Tooltip>
                  <TooltipTrigger delay={600} render={<button data-slot="admin-shell-org-trigger" />}>
                    <div data-slot="admin-shell-logo-col">{logo}</div>
                    <div data-slot="admin-shell-org-name" data-open={sidebarOpen ? '' : undefined}>
                      <span data-slot="admin-shell-org-name-text">{orgName}</span>
                      <ChevronDown data-slot="admin-shell-org-chevron" />
                    </div>
                  </TooltipTrigger>
                  {showTooltips && (
                    <TooltipContent side="right" sideOffset={8}>
                      {orgName}
                    </TooltipContent>
                  )}
                </Tooltip>
              ) : (
                <div data-slot="admin-shell-org-static">
                  <div data-slot="admin-shell-logo-col">{logo}</div>
                  <div data-slot="admin-shell-org-name" data-open={sidebarOpen ? '' : undefined}>
                    <span data-slot="admin-shell-org-name-text">{orgName}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Nav slot */}
          <nav data-slot="admin-shell-nav">
            <SidebarStateContext.Provider value={sidebarOpen}>{navContent}</SidebarStateContext.Provider>

            {/* Recents */}
            {recentVisits.length > 0 && sidebarOpen && (
              <div data-slot="admin-shell-recents">
                <div data-slot="admin-shell-recents-separator">
                  <Separator />
                </div>
                <div data-slot="admin-shell-recents-label">
                  <span>Recent</span>
                </div>
                <ul data-slot="admin-shell-recents-list">
                  {recentVisits.map((visit) => (
                    <li key={visit.id}>
                      <button onClick={visit.onClick} data-slot="admin-shell-recent-item">
                        <span data-slot="admin-shell-recent-name">{visit.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </nav>

          {/* User avatar at sidebar bottom */}
          {userAvatar && <div data-slot="admin-shell-sidebar-avatar">{userAvatar}</div>}
        </div>

        {/* ── Main ────────────────────────────────────────────────────────────── */}
        <div data-slot="admin-shell-main">
          {/* Header */}
          <header data-slot="admin-shell-header">
            {/* Left: toggle + history nav — hidden when banner provides the brand chrome */}
            {!hasBanner && (
              <div data-slot="admin-shell-header-left">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        data-slot="admin-shell-icon-btn"
                        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                      />
                    }
                  >
                    <PanelLeft data-slot="admin-shell-header-icon" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}</TooltipContent>
                </Tooltip>

                <div data-slot="admin-shell-history-nav">
                  <button onClick={() => window.history.back()} data-slot="admin-shell-icon-btn" aria-label="Go back">
                    <ChevronLeft data-slot="admin-shell-header-icon" />
                  </button>
                  <button
                    onClick={() => window.history.forward()}
                    data-slot="admin-shell-icon-btn"
                    aria-label="Go forward"
                  >
                    <ChevronRight data-slot="admin-shell-header-icon" />
                  </button>
                </div>
              </div>
            )}

            {/* Center: title */}
            <div data-slot="admin-shell-title-area">
              {titleBlock ? (
                isLoading ? (
                  <div data-slot="admin-shell-title-loading">
                    <Skeleton data-slot="admin-shell-skeleton-title" />
                    <Skeleton data-slot="admin-shell-skeleton-subtitle" />
                  </div>
                ) : isEmpty ? (
                  <div>
                    <p data-slot="admin-shell-title-primary">Unknown {entityType}</p>
                    <p data-slot="admin-shell-title-secondary">The requested {entityType} could not be found.</p>
                  </div>
                ) : (
                  <div data-slot="admin-shell-title-block">
                    <Tooltip>
                      <TooltipTrigger
                        render={<h2 data-slot="admin-shell-title-primary" style={{ maxWidth: '30vw' }} />}
                      >
                        {titleBlock.primaryTitle}
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="start">
                        {titleBlock.primaryTitle}
                      </TooltipContent>
                    </Tooltip>
                    {titleBlock.secondaryTitle && (
                      <div data-slot="admin-shell-secondary-title-group">
                        <p data-slot="admin-shell-title-secondary">{titleBlock.secondaryTitle}</p>
                        {titleBlock.copyId && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button onClick={handleCopyId} data-slot="admin-shell-copy-btn" aria-label="Copy ID" />
                              }
                            >
                              <Copy data-slot="admin-shell-copy-icon" />
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Copy ID</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    )}
                  </div>
                )
              ) : pageTitle ? (
                <div data-slot="admin-shell-page-title-row">
                  <h2 data-slot="admin-shell-title-primary">{pageTitle}</h2>
                  {statusPill && <div data-slot="admin-shell-status-pill">{statusPill}</div>}
                </div>
              ) : null}
            </div>

            {/* Right: actions */}
            <div data-slot="admin-shell-header-right">
              {leftActions.length > 0 && (
                <div data-slot="admin-shell-left-actions">
                  {leftActions.map((action, i) => (
                    <div key={i}>{action}</div>
                  ))}
                </div>
              )}
              {secondaryActions.length > 0 && (
                <div data-slot="admin-shell-secondary-actions">
                  {secondaryActions.map((action, i) => (
                    <div key={i}>{action}</div>
                  ))}
                </div>
              )}
              {primaryAction && <div>{primaryAction}</div>}
              {detailsPanelToggle && <div>{detailsPanelToggle}</div>}
            </div>
          </header>

          {/* Page content */}
          <main data-slot="admin-shell-content">{children}</main>
        </div>
      </div>
      {/* /admin-shell-body */}
    </div>
  );
}

export { AdminShell };
