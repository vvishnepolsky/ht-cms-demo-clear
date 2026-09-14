import * as React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { Separator } from './separator';
import { type LucideIcon } from 'lucide-react';

// ─── Sidebar state context ────────────────────────────────────────────────────

/**
 * Provides the sidebar open/collapsed state to SidebarNavItem descendants.
 * AdminShell provides this automatically — consumers do not need to manage it.
 */
const SidebarStateContext = React.createContext<boolean>(true);

/** Read the sidebar open/collapsed state provided by AdminShell. */
function useSidebarOpen(): boolean {
  return React.useContext(SidebarStateContext);
}

// ─── SidebarNavItem ───────────────────────────────────────────────────────────

export interface SidebarNavItemProps {
  /** Lucide icon component */
  icon: LucideIcon;
  /** Nav item label */
  label: string;
  /** Whether this item is the currently active route */
  isActive?: boolean;
  /**
   * Current sidebar open/collapsed state, drives label visibility animation.
   * @internal Injected automatically by AdminShell via context — do not pass manually.
   * Only use this prop when rendering SidebarNavItem outside of AdminShell.
   */
  sidebarOpen?: boolean;
  /** Notification badge count, shows a red pill when greater than 0 */
  badge?: number;
  /** Keyboard shortcut hint shown to the right of the label (e.g. "⌘K") */
  shortcut?: string;
  /** Click handler */
  onClick?: () => void;
  /** Whether to show a tooltip on the icon when the sidebar is collapsed */
  showTooltip?: boolean;
  className?: string;
}

function SidebarNavItem({
  icon: Icon,
  label,
  isActive = false,
  sidebarOpen: sidebarOpenProp,
  badge,
  shortcut,
  onClick,
  showTooltip = false,
  className,
}: SidebarNavItemProps) {
  const contextOpen = React.useContext(SidebarStateContext);
  const sidebarOpen = sidebarOpenProp ?? contextOpen;
  return (
    <Tooltip>
      <TooltipTrigger
        delay={600}
        render={
          <button
            data-slot="sidebar-nav-item"
            onClick={onClick}
            data-active={isActive ? 'true' : undefined}
            // Collapsed sidebar hides the label column, leaving an icon-only
            // button with no accessible name — name it explicitly.
            aria-label={sidebarOpen ? undefined : label}
            className={className}
          />
        }
      >
        {/* Icon column — fixed width matches collapsed sidebar */}
        <div data-slot="sidebar-nav-icon-col">
          <Icon data-slot="sidebar-nav-icon" data-active={isActive ? 'true' : undefined} />
        </div>

        {/* Label + badge/shortcut — hidden when sidebar is collapsed */}
        <div data-slot="sidebar-nav-label" data-open={sidebarOpen ? '' : undefined}>
          <span data-slot="sidebar-nav-label-text">{label}</span>

          {/* Notification badge */}
          {badge != null && badge > 0 && <span data-slot="sidebar-nav-badge">{badge > 9 ? '9+' : badge}</span>}

          {/* Keyboard shortcut */}
          {shortcut && !badge && <kbd data-slot="sidebar-nav-shortcut">{shortcut}</kbd>}
        </div>
      </TooltipTrigger>

      {showTooltip && (
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

// ─── SidebarNavGroup ──────────────────────────────────────────────────────────

export interface SidebarNavGroupProps {
  children: React.ReactNode;
  className?: string;
}

function SidebarNavGroup({ children, className }: SidebarNavGroupProps) {
  return (
    <div data-slot="sidebar-nav-group" className={className}>
      {children}
    </div>
  );
}

// ─── SidebarNavSeparator ──────────────────────────────────────────────────────

export interface SidebarNavSeparatorProps {
  className?: string;
}

function SidebarNavSeparator({ className }: SidebarNavSeparatorProps) {
  return (
    <div data-slot="sidebar-nav-separator" className={className}>
      <Separator />
    </div>
  );
}

export { SidebarNavItem, SidebarNavGroup, SidebarNavSeparator, SidebarStateContext, useSidebarOpen };
