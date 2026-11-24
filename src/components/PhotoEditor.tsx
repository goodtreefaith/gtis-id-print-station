import { Camera, CameraOff, CheckCircle2, ImagePlus, Pencil, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { StudentRecord } from '../types';
import { studentFullName } from '../lib/student';
import { fileToDataUrl, imageSourceToDataUrl, renderCroppedPhoto } from '../ui/images';
import { useFocusTrap } from '../ui/useFocusTrap';
import { CardFront, ScaledCard } from './CardPreview';

export interface PhotoEditorProps {
  student: StudentRecord;
  qrDataUrl: string;
  portalBaseUrl: string;
  saving: boolean;
  /** Shown inside the editor when saving the photo failed. */
  saveError?: string;
  onApprove: (photoDataUrl: string) => void;
  onClose: () => void;
}

/** Take or choose a photo, frame it against the head guide, and see it on the card before saving. */
export function PhotoEditor({ student, qrDataUrl, portalBaseUrl, saving, saveError, onApprove, onClose }: PhotoEditorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const [error, setError] = useState('');
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'unavailable'>('starting');
  const [rawCapture, setRawCapture] = useState('');
  const [editedPreview, setEditedPreview] = useState('');
  const [editorBusy, setEditorBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const wasConfirming = useRef(false);

  // Leaving the "close without saving?" question puts focus back in the editor.
  useEffect(() => {
    if (wasConfirming.current && !confirmDiscard) dialogRef.current?.focus();
    wasConfirming.current = confirmDiscard;
  }, [confirmDiscard]);

  /** Esc or ×: close straight away, unless a framed photo would be lost — then ask once. */
  function requestClose() {
    if (saving) return;
    if (rawCapture && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  useFocusTrap(dialogRef, true, () => {
    if (confirmDiscard) setConfirmDiscard(false);
    else requestClose();
  });

  useEffect(() => {
    let active = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unavailable');
      setError('No camera found. You can still choose a photo file.');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setCameraState('ready');
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        setCameraState('unavailable');
        setError('The camera isn’t available. Check it is plugged in, or choose a photo file instead.');
      });

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Re-attach the stream when returning from the crop view to the live camera.
  useEffect(() => {
    if (!rawCapture && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [rawCapture]);


  useEffect(() => {
    if (!rawCapture) {
      setEditedPreview('');
      setEditorBusy(false);
      return;
    }
    let canceled = false;
    setEditorBusy(true);
    const timeout = window.setTimeout(() => {
      renderCroppedPhoto(rawCapture, zoom, offsetX, offsetY, brightness)
        .then((photo) => {
          if (!canceled) setEditedPreview(photo);
        })
        .catch(() => {
          if (!canceled) setError('Could not prepare this photo. Choose another image.');
        })
        .finally(() => {
          if (!canceled) setEditorBusy(false);
        });
    }, 80);
    return () => {
      canceled = true;
      window.clearTimeout(timeout);
    };
  }, [rawCapture, zoom, offsetX, offsetY, brightness]);

  const previewStudent = useMemo(
    () => ({ ...student, photoUrl: editedPreview || rawCapture || student.photoUrl || '' }),
    [editedPreview, rawCapture, student]
  );

  function resetEditor(source: string) {
    setRawCapture(source);
    setEditedPreview('');
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    setBrightness(100);
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    resetEditor(canvas.toDataURL('image/jpeg', 0.95));
    setError('');
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('That file isn’t a picture. Choose a JPG or PNG photo.');
      return;
    }
    try {
      resetEditor(await fileToDataUrl(file));
      setError('');
    } catch {
      setError('Could not open this photo. Try another file.');
    }
  }

  async function useCurrentPhoto() {
    if (!student.photoUrl) return;
    try {
      resetEditor(await imageSourceToDataUrl(student.photoUrl, portalBaseUrl));
      setError('');
    } catch {
      setError('Could not load the current portal photo for editing. Choose a file instead.');
    }
  }

  async function approve() {
    if (!rawCapture) return;
    const cropped = await renderCroppedPhoto(rawCapture, zoom, offsetX, offsetY, brightness);
    onApprove(cropped);
  }

  return (
    <div className="modal-backdrop">
      <section
        className="photo-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-editor-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="modal-head">
          <div>
            <h2 id="photo-editor-title">{student.photoUrl ? 'Replace photo' : 'Add photo'}</h2>
            <p>{studentFullName(student)} · {student.admissionNo}</p>
          </div>
          <button type="button" className="icon-button" onClick={requestClose} aria-label="Close photo editor" disabled={saving}>
            <X size={20} />
          </button>
        </header>

        {confirmDiscard ? (
          <div className="confirm-box" role="alertdialog" aria-labelledby="discard-title">
            <strong id="discard-title">Close without saving this photo?</strong>
            <p>The photo you are framing will be lost. The student keeps their current photo.</p>
            <div className="button-row">
              <button type="button" className="button primary" onClick={() => setConfirmDiscard(false)} autoFocus>
                Keep editing
              </button>
              <button type="button" className="button danger" onClick={onClose}>
                Close without saving
              </button>
            </div>
          </div>
        ) : null}

        <div className="photo-grid">
          <div className="camera-box">
            {rawCapture ? (
              <div className="crop-frame">
                <img
                  src={rawCapture}
                  alt="Photo being framed"
                  style={{
                    filter: `brightness(${brightness}%)`,
                    transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${zoom})`
                  }}
                />
                <div className="crop-guide" aria-hidden="true">
                  <div className="crop-head" />
                  <div className="crop-shoulders" />
                </div>
              </div>
            ) : cameraState === 'unavailable' ? (
              <div className="camera-empty">
                <CameraOff size={36} aria-hidden="true" />
                <strong>No camera picture</strong>
                <span>Choose a photo file instead.</span>
              </div>
            ) : (
              <div className="video-frame">
                <video ref={videoRef} autoPlay playsInline muted aria-label="Camera" />
                <div className="head-guide" aria-hidden="true">
                  <div className="head-oval" />
                  <div className="shoulder-line" />
                </div>
                <p className="camera-tip">Line up the face with the oval and the shoulders with the line.</p>
              </div>
            )}
          </div>

          <div className="photo-card-preview">
            <ScaledCard scale={0.9}>
              <CardFront student={previewStudent} qrDataUrl={qrDataUrl} />
            </ScaledCard>
            <span>{editorBusy ? 'Updating card…' : 'How it will look on the card'}</span>
          </div>

          <aside className="photo-controls">
            {error || saveError ? (
              <p className="form-alert" role="alert">
                {saveError || error}
              </p>
            ) : null}
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleUpload} />
            {rawCapture ? (
              <>
                <button type="button" className="button primary large wide" onClick={approve} disabled={editorBusy || saving}>
                  <CheckCircle2 size={18} aria-hidden="true" /> {saving ? 'Saving photo…' : 'Use this photo'}
                </button>
                <button type="button" className="button secondary wide" onClick={() => setRawCapture('')} disabled={saving}>
                  <RotateCcw size={18} aria-hidden="true" /> Retake
                </button>
                <Slider label="Zoom" min={1} max={2.4} step={0.05} value={zoom} onChange={setZoom} display={`${Math.round(zoom * 100)}%`} />
                <Slider label="Move left / right" min={-120} max={120} step={1} value={offsetX} onChange={setOffsetX} />
                <Slider label="Move up / down" min={-120} max={120} step={1} value={offsetY} onChange={setOffsetY} />
                <Slider label="Brightness" min={70} max={130} step={1} value={brightness} onChange={setBrightness} display={`${brightness}%`} />
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="button primary large wide"
                  onClick={captureFrame}
                  disabled={cameraState !== 'ready'}
                >
                  <Camera size={18} aria-hidden="true" /> {cameraState === 'starting' ? 'Starting camera…' : 'Take photo'}
                </button>
                <button type="button" className="button secondary wide" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus size={18} aria-hidden="true" /> Choose a photo file
                </button>
                {student.photoUrl ? (
                  <button type="button" className="button secondary wide" onClick={useCurrentPhoto}>
                    <Pencil size={18} aria-hidden="true" /> Re-frame current photo
                  </button>
                ) : null}
              </>
            )}
            <p className="photo-note">The photo is saved to the student’s record when you press “Use this photo”.</p>
          </aside>
        </div>
      </section>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  display
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  display?: string;
}) {
  return (
    <label className="slider">
      <span className="slider-label">
        {label}
        {display ? <small>{display}</small> : null}
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
