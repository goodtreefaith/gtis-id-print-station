import { AlertCircle, Check, CircleDashed, Info, Loader2, Minus, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FlowState, StepState } from '../ui/printFlow';

const stepLabels: Array<[keyof NonNullable<FlowState['steps']>, string]> = [
  ['save', 'Save changes'],
  ['print', 'Print card'],
  ['upload', 'File in portal']
];

const stepWords: Record<StepState, string> = {
  waiting: 'waiting',
  active: 'in progress',
  done: 'done',
  failed: 'failed',
  skipped: 'not needed'
};

function StepIcon({ state }: { state: StepState }) {
  switch (state) {
    case 'active':
      return <Loader2 size={16} className="spin" aria-hidden="true" />;
    case 'done':
      return <Check size={16} aria-hidden="true" />;
    case 'failed':
      return <AlertCircle size={16} aria-hidden="true" />;
    case 'skipped':
      return <Minus size={16} aria-hidden="true" />;
    default:
      return <CircleDashed size={16} aria-hidden="true" />;
  }
}

/**
 * The save → print → upload strip next to Print ID. One plain-language result, one "Try again".
 * Errors and warnings are announced as alerts; everything else politely.
 */
export function StatusStrip({
  flow,
  onRetry,
  retryDisabled,
  retryPrimary,
  actions,
  children,
  compactSteps
}: {
  /** Finished result: on narrow screens the step chips fold away (the title already says it). */
  compactSteps?: boolean;
  flow: FlowState;
  onRetry?: () => void;
  retryDisabled?: boolean;
  /** While a print error shows, Try again is the main action. */
  retryPrimary?: boolean;
  /** Extra buttons (for example Save / Discard while edits are unsaved). */
  actions?: ReactNode;
  /** Extra content under the message (for example the list of blockers). */
  children?: ReactNode;
}) {
  const urgent = flow.tone === 'error' || flow.tone === 'warning';
  return (
    <div className={`status-strip tone-${flow.tone}${compactSteps ? ' is-result' : ''}`} data-testid="status-strip">
      <div id="print-status" className="status-main" role={urgent ? 'alert' : 'status'} aria-live={urgent ? 'assertive' : 'polite'}>
        <span className="status-icon" aria-hidden="true">
          {flow.tone === 'working' ? (
            <Loader2 size={20} className="spin" />
          ) : flow.tone === 'success' ? (
            <Check size={20} />
          ) : urgent ? (
            <AlertCircle size={20} />
          ) : (
            <Info size={20} />
          )}
        </span>
        <div className="status-text">
          <strong>{flow.title}</strong>
          {flow.detail ? <span>{flow.detail}</span> : null}
        </div>
        {flow.retry && onRetry ? (
          <button
            type="button"
            className={`button ${retryPrimary ? 'primary' : 'secondary'}`}
            onClick={onRetry}
            disabled={retryDisabled}
            title={flow.retry === 'upload' ? 'Upload the archive copy again' : undefined}
          >
            <RotateCcw size={16} aria-hidden="true" /> Try again
          </button>
        ) : null}
        {actions ? <div className="status-actions">{actions}</div> : null}
      </div>
      {children}
      {flow.steps ? (
        <ol className="status-steps" aria-label="Print progress">
          {stepLabels.map(([key, label]) => {
            const state = flow.steps![key];
            return (
              <li key={key} className={`step is-${state}`}>
                <StepIcon state={state} />
                <span>
                  {label}
                  <span className="sr-only">: {stepWords[state]}</span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
