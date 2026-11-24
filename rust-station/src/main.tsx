import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type CalibrationPreview = { front: string; back: string };
type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; card: CalibrationPreview }
  | { status: 'error'; message: string };

function App() {
  const [preview, setPreview] = useState<PreviewState>({ status: 'loading' });

  useEffect(() => {
    if (!isTauri()) {
      setPreview({ status: 'error', message: 'Open the desktop app to preview the test card.' });
      return;
    }

    let active = true;
    void invoke<CalibrationPreview>('preview_calibration').then(
      (card) => {
        if (active) setPreview({ status: 'ready', card });
      },
      () => {
        if (active) {
          setPreview({
            status: 'error',
            message: 'The test card could not be rendered. Close and reopen the app to try again.',
          });
        }
      },
    );
    return () => { active = false; };
  }, []);

  return (
    <>
      <header className="station-bar">
        <p>ID Print Station</p>
        <span>Sample mode</span>
      </header>
      <main>
        <h1>Test card preview</h1>
        <p className="description">Preview both sides of a sample CR80 card rendered at 600 DPI.</p>
        {preview.status === 'loading' && <p role="status">Rendering test card…</p>}
        {preview.status === 'error' && <p role="alert">{preview.message}</p>}
        {preview.status === 'ready' && (
          <div className="card-sides">
            <CardSide label="Front" png={preview.card.front} />
            <CardSide label="Back" png={preview.card.back} />
          </div>
        )}
      </main>
    </>
  );
}

function CardSide({ label, png }: { label: 'Front' | 'Back'; png: string }) {
  return (
    <figure>
      <figcaption>{label}</figcaption>
      <img
        src={`data:image/png;base64,${png}`}
        alt={`${label} of the sample calibration card`}
        width={1275}
        height={2022}
      />
    </figure>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
