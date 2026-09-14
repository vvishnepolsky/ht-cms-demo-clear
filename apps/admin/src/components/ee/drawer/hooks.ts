/**
 * Named hooks for CaseDetailsDrawer's imperative side effects.
 *
 * Each hook here is a named alternative to a raw `useEffect` call, per the
 * project standard in standards/coding-standards.md § Avoid direct useEffect.
 * The drawer component imports these by name so the call sites read as intent:
 *
 *   useScrollLock();
 *   useFocusTrapAndRestore(containerRef, initialFocusRef);
 *   useEscapeKeyToClose(onClose);
 *   useReplyChannelDefault(preferredChannel, userOverridden, setReplyChannel);
 *
 * The `useEffect` import is intentionally silenced below — these ARE the named-
 * hook alternatives the standard prescribes; encapsulation is the point.
 */

// eslint-disable-next-line no-restricted-syntax -- this module IS the named-hook layer for the drawer; useEffect usage is intentional and confined here
import { useEffect, type RefObject } from 'react';

/**
 * Lock body scroll while mounted, restore previous overflow on unmount.
 * Use inside any full-viewport overlay so the page underneath cannot scroll.
 */
export function useScrollLock(): void {
  // eslint-disable-next-line no-restricted-syntax -- mount-only body.style.overflow toggle; no React adapter exists for this DOM mutation
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Trap keyboard focus inside `containerRef` while mounted. On mount: capture
 * `document.activeElement` (the trigger) and shift focus to `initialFocusRef`.
 * On unmount: restore focus to the captured trigger.
 *
 * Tab and Shift+Tab cycle within the container's focusable descendants —
 * Tab from the last focusable wraps to the first, Shift+Tab from the first
 * wraps to the last. Implements the WCAG 2.1 dialog focus-trap pattern.
 */
export function useFocusTrapAndRestore(
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
): void {
  // eslint-disable-next-line no-restricted-syntax -- mount-only trigger capture + document-level Tab interception; no React adapter for cross-tree focus management
  useEffect(() => {
    const trigger = document.activeElement;
    const focusTimer = window.setTimeout(() => initialFocusRef.current?.focus(), 0);

    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !containerRef.current) return;
      const focusable = Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleTab);
      if (trigger instanceof HTMLElement) {
        trigger.focus();
      }
    };
    // Refs are stable; intentionally not in deps.
  }, [containerRef, initialFocusRef]);
}

/**
 * Call `onClose` when the user presses Escape anywhere in the document.
 * Use inside any overlay that should be dismissible via ESC.
 *
 * Stacking note: this hook intentionally does NOT call
 * `stopImmediatePropagation()`. `addEventListener` dispatches in registration
 * order (FIFO), not LIFO, so multiple drawer/modal ESC listeners would fight
 * each other (the earliest-registered handler would close its overlay first
 * and the topmost overlay would never see the event). When you have a stack
 * of overlays, register a single composite ESC handler at the outermost
 * owner and branch to the innermost open layer inside that handler.
 */
export function useEscapeKeyToClose(onClose: () => void): void {
  // eslint-disable-next-line no-restricted-syntax -- document-level keydown listener; no React adapter for global key handling
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
}

/**
 * Re-defaults the reply channel to the applicant's preferred channel when
 * `preferredChannel` changes AND the caseworker has not actively picked
 * a different channel (`userOverridden` is false).
 *
 * Intent: if the upstream `preferredContact` changes while the drawer is
 * mounted and the caseworker hasn't touched the reply pills, re-sync the
 * default. Once the caseworker clicks a pill, set `userOverridden = true`
 * at the call site and the hook becomes a no-op for the rest of the
 * drawer's life.
 *
 * Currently unused at the call site: NoticesMessagesTab initializes
 * `replyChannel` from `preferredChannel` via `useState`, and the case
 * fixture is stable for the lifetime of the drawer (the drawer remounts
 * when a different case is opened, which resets state from `useState`
 * anyway). Kept exported as a documented utility for future flows where
 * the drawer survives a case-prop change in place.
 */
export function useReplyChannelDefault<T>(
  preferredChannel: T,
  userOverridden: boolean,
  setReplyChannel: (channel: T) => void,
): void {
  // eslint-disable-next-line no-restricted-syntax -- syncs locally-derived default to upstream prop changes; gated by an explicit "user overridden" flag rather than a null/undefined sentinel
  useEffect(() => {
    if (!userOverridden) {
      setReplyChannel(preferredChannel);
    }
    // Intentionally only react to changes in the preferred channel; do not
    // re-run when the user actively picks a different channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredChannel]);
}
