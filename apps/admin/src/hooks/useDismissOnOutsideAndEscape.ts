/**
 * useDismissOnOutsideAndEscape — closes a popover/dropdown when the user
 * clicks outside its container or presses Escape. The canonical pattern for
 * lightweight custom-rendered popovers that aren't using a primitive
 * dialog/popover component (which would handle this internally).
 *
 * The named hook keeps call sites readable as intent and matches the
 * "Named custom hooks" guidance in CLAUDE.md § Avoid direct useEffect.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   const [open, setOpen] = useState(false);
 *   useDismissOnOutsideAndEscape(ref, open, () => setOpen(false));
 *   return <div ref={ref}>{open && <Popover />}</div>;
 *
 * The hook is a no-op when `active` is false, so attaching/removing the
 * listeners follows the open state exactly.
 */

import { useEffect, type RefObject } from 'react';

export function useDismissOnOutsideAndEscape(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
): void {
  // eslint-disable-next-line no-restricted-syntax -- this is the named-hook encapsulation CLAUDE.md prescribes for the document-level mousedown / keydown listeners that drive click-outside + Escape dismissal. The effect cannot be replaced by a key-reset, an Apollo callback, or an event handler — it must subscribe to the document while `active` is true and unsubscribe when it flips.
  useEffect(() => {
    if (!active) return;

    function handleMouseDown(e: MouseEvent) {
      const node = containerRef.current;
      if (!node) return;
      if (e.target instanceof Node && node.contains(e.target)) return;
      onDismiss();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, containerRef, onDismiss]);
}
