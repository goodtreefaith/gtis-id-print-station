// One state type for the save → print → upload strip.
// App.tsx produces these values and the dev gallery renders the same type,
// so the gallery can only show states the app can actually reach.

export type StepState = 'waiting' | 'active' | 'done' | 'failed' | 'skipped';

export interface FlowSteps {
  save: StepState;
  print: StepState;
  upload: StepState;
}

export type FlowTone = 'neutral' | 'working' | 'success' | 'warning' | 'error';

export interface FlowState {
  tone: FlowTone;
  title: string;
  detail?: string;
  /** Present while a print job is running or after it finished. */
  steps?: FlowSteps;
  /** Which action "Try again" repeats. */
  retry?: 'print' | 'upload' | 'list';
  /** The student this message is about. The strip resets when another student is chosen. */
  studentId?: string;
}

export function idleFlow(liveMode: boolean, readOnly = false): FlowState {
  return {
    tone: 'neutral',
    title: 'Ready when you are.',
    detail: !liveMode
      ? 'Sample mode: printing works, but nothing is saved to or uploaded to the portal.'
      : readOnly
        ? 'Print ID prints this card and files it in the student’s portal Documents.'
        : 'Print ID saves your changes, prints, then files the card in the student’s portal Documents.'
  };
}

function sentence(raw: string) {
  const text = raw.replace(/^printer (said|reported):\s*/i, '').trim();
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function friendlyPrintError(raw: string | undefined, who?: string) {
  return {
    title: who ? `${who}’s ID didn’t print.` : 'The card didn’t print.',
    detail: `${raw ? `Printer said: ${sentence(raw)} ` : ''}Check the printer is on and has cards and ribbon. If a card came out, don’t print it again.`
  };
}

export function friendlyUploadError(raw: string | undefined) {
  return {
    title: 'Printed, but the archive copy didn’t upload.',
    detail: `The card is fine. Try again so the portal keeps a copy.${raw ? ` Portal said: ${sentence(raw)}` : ''}`
  };
}
