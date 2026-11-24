// Dev-only gallery: renders components with fixture props for the screenshot harness.
// Served by the Vite dev server at /src/ui/harness/gallery.html. Not part of the app build.
// Every value here is made up. Nothing here talks to the portal.
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../styles.css';
import { LockScreen } from '../../components/LockScreen';
import { StatusStrip } from '../../components/StatusStrip';
import { StudentList } from '../../components/StudentList';
import type { FlowState } from '../printFlow';
import { friendlyPrintError, friendlyUploadError, idleFlow } from '../printFlow';

const view = new URLSearchParams(window.location.search).get('view') || 'strip-states';

const stripStates: Array<[string, FlowState]> = [
  ['Idle, Sample mode', idleFlow(false)],
  ['Idle, Live', idleFlow(true)],
  ['Saving edits before printing', { tone: 'working', title: 'Saving changes…', steps: { save: 'active', print: 'waiting', upload: 'waiting' } }],
  [
    'Printing (dialog mode)',
    {
      tone: 'working',
      title: 'Printing Jetto Morris Bamba’s ID. Confirm in the Windows print dialog.',
      steps: { save: 'done', print: 'active', upload: 'waiting' }
    }
  ],
  [
    'Uploading the archive copy (Live)',
    {
      tone: 'working',
      title: 'Printed Jetto Morris Bamba’s ID on SMART-51D Card Printer.',
      detail: 'Filing the front and back in the student’s portal Documents…',
      steps: { save: 'skipped', print: 'done', upload: 'active' }
    }
  ],
  [
    'Done (Live)',
    {
      tone: 'success',
      title: 'Printed Jetto Morris Bamba’s ID on SMART-51D Card Printer.',
      detail: 'Front and back filed in the student’s portal Documents.',
      steps: { save: 'done', print: 'done', upload: 'done' }
    }
  ],
  [
    'Upload failed after printing (Live)',
    {
      tone: 'warning',
      ...friendlyUploadError('The portal took too long to answer.'),
      title: 'Jetto Morris Bamba’s card printed, but the archive copy didn’t upload.',
      retry: 'upload',
      steps: { save: 'skipped', print: 'done', upload: 'failed' }
    }
  ],
  [
    'Print failed',
    { tone: 'error', ...friendlyPrintError('device offline'), retry: 'print', steps: { save: 'skipped', print: 'failed', upload: 'skipped' } }
  ],
  [
    'Save failed, nothing printed',
    {
      tone: 'error',
      title: 'Changes weren’t saved, so nothing was printed.',
      detail: 'The portal did not answer.',
      retry: 'print',
      steps: { save: 'failed', print: 'waiting', upload: 'waiting' }
    }
  ],
  ['Not ready', { tone: 'warning', title: 'Not ready to print yet.', detail: 'No photo yet · Emergency phone is empty' }],
  [
    'Print cancelled in the Windows dialog',
    {
      tone: 'warning',
      title: 'Printing Jetto Morris Bamba’s ID was cancelled.',
      detail: 'Nothing was printed.',
      retry: 'print',
      steps: { save: 'skipped', print: 'failed', upload: 'skipped' }
    }
  ],
  ['PDF saved', { tone: 'success', title: 'PDF saved.', detail: 'Documents/ID Cards/sample-2026001.pdf' }]
];

function Gallery() {
  if (view === 'lock-error') {
    return (
      <LockScreen
        username="operator@example.invalid"
        password="xxxxxxxx"
        onChange={() => {}}
        onSubmit={(event) => event.preventDefault()}
        busy={false}
        error="That email or password didn’t work. Check them and try again."
        portalHost="portal.gtis.edu.ph"
      />
    );
  }

  if (view === 'list-states') {
    const common = {
      students: [],
      selectedId: null,
      onSelect: () => {},
      hasMore: false,
      onLoadMore: () => {},
      onRefresh: () => {},
      onQueryChange: () => {}
    };
    return (
      <div className="gallery-row">
        <figure>
          <figcaption>Loading</figcaption>
          <StudentList {...common} query="" loading />
        </figure>
        <figure>
          <figcaption>Could not load</figcaption>
          <StudentList {...common} query="" loading={false} error="The portal did not answer. Check the internet connection." />
        </figure>
        <figure>
          <figcaption>No match</figcaption>
          <StudentList {...common} query="zzzz" loading={false} />
        </figure>
      </div>
    );
  }

  return (
    <div className="gallery-strips">
      {stripStates.map(([label, flow]) => (
        <figure key={label}>
          <figcaption>{label}</figcaption>
          <StatusStrip flow={flow} onRetry={() => {}} />
        </figure>
      ))}
      <figure>
        <figcaption>Unsaved edits (Save / Discard)</figcaption>
        <StatusStrip
          flow={{ tone: 'warning', title: 'Unsaved changes.', detail: 'Print ID saves them first.' }}
          actions={
            <>
              <button type="button" className="button secondary">
                Save <kbd>Ctrl+S</kbd>
              </button>
              <button type="button" className="button ghost">
                Discard
              </button>
            </>
          }
        />
      </figure>
    </div>
  );
}

const galleryCss = `
  .gallery-row { height: 100vh; display: grid; grid-template-columns: repeat(3, 340px); gap: 16px; padding: 16px; }
  .gallery-row figure, .gallery-strips figure { margin: 0; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
  .gallery-row figure > .zone { flex: 1; }
  .gallery-row figcaption, .gallery-strips figcaption { font-size: 13px; font-weight: 700; color: #4f5852; text-transform: uppercase; letter-spacing: .05em; }
  .gallery-strips { height: 100vh; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(440px, 1fr)); align-content: start; align-items: start; gap: 14px 20px; padding: 16px; }
  @media (max-width: 1100px) { .gallery-row { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
`;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <style>{galleryCss}</style>
    <Gallery />
  </React.StrictMode>
);
