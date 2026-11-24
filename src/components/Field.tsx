import { AlertCircle, AlertTriangle } from 'lucide-react';
import { forwardRef, useId } from 'react';
import type { ReactNode } from 'react';
import type { FieldIssue } from '../ui/validation';

export interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  multiline?: boolean;
  issue?: FieldIssue;
  dirty?: boolean;
  hint?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
  trailing?: ReactNode;
  /** Small control shown at the right of the label row (for example "Show on card"). */
  labelAside?: ReactNode;
  className?: string;
}

/** Labelled input with inline validation. The label is the accessible name; messages are described-by. */
export const Field = forwardRef<HTMLInputElement | HTMLTextAreaElement, FieldProps>(function Field(
  { label, value, onChange, type = 'text', multiline = false, issue, dirty, hint, disabled, autoFocus, autoComplete, inputMode, trailing, labelAside, className },
  ref
) {
  const id = useId();
  const messageId = `${id}-msg`;
  const describedBy = issue || hint ? messageId : undefined;
  const stateClass = issue ? ` has-${issue.level}` : '';

  return (
    <div className={`field${stateClass}${dirty ? ' is-dirty' : ''}${className ? ` ${className}` : ''}`}>
      <div className="field-label-row">
        <label htmlFor={id}>{label}</label>
        {dirty ? <span className="dirty-mark">Edited</span> : null}
        {labelAside}
      </div>
      <div className="field-control">
        {multiline ? (
          <textarea
            id={id}
            ref={ref as React.Ref<HTMLTextAreaElement>}
            value={value}
            rows={2}
            disabled={disabled}
            aria-invalid={issue?.level === 'error' || undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <input
            id={id}
            ref={ref as React.Ref<HTMLInputElement>}
            type={type}
            value={value}
            disabled={disabled}
            autoFocus={autoFocus}
            autoComplete={autoComplete}
            inputMode={inputMode}
            aria-invalid={issue?.level === 'error' || undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
        {trailing}
      </div>
      {issue ? (
        <p id={messageId} className={`field-message is-${issue.level}`}>
          {issue.level === 'error' ? <AlertCircle size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
          {issue.message}
        </p>
      ) : hint ? (
        <p id={messageId} className="field-message">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
