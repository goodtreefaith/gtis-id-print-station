import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useFocusTrap } from '../ui/useFocusTrap';

export interface ConfirmAction {
  label: ReactNode;
  onClick: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
}

/** Modal question with a focus trap. Esc runs `onCancel`. The first action gets focus. */
export function ConfirmDialog({
  title,
  children,
  actions,
  onCancel,
  testId
}: {
  title: string;
  children: ReactNode;
  actions: ConfirmAction[];
  onCancel: () => void;
  testId?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useFocusTrap(ref, true, onCancel);
  return (
    <div className="modal-backdrop">
      <section
        ref={ref}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        data-testid={testId}
      >
        <h2 id="confirm-title">{title}</h2>
        <div id="confirm-desc" className="confirm-body">
          {children}
        </div>
        <div className="button-row">
          {actions.map((action, index) => (
            <button
              key={index}
              type="button"
              className={`button large ${action.kind || 'secondary'}`}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
