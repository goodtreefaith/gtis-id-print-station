import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab focus inside `ref` while `active`, calls `onEscape` on Esc, and puts focus back where it
 * was when the trap ends. `initialFocus` picks the first element to focus (default: first focusable).
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
  initialFocus?: () => HTMLElement | null | undefined
) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = initialFocus?.() || container.querySelector<HTMLElement>(FOCUSABLE) || container;
    first.focus();

    function onKey(event: KeyboardEvent) {
      if (!container) return;
      if (event.key === 'Escape' && escapeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        escapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === firstItem || !container.contains(document.activeElement))) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && (document.activeElement === lastItem || !container.contains(document.activeElement))) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [active]);
}
