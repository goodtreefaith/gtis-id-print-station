import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { StudentRecord } from '../types';
import {
  emergencyAddressFontPx,
  emergencyNameFontPx,
  emergencyPhoneFontPx,
  frontFirstNameFontPx,
  frontGradeFontPx,
  frontLastNameFontPx
} from '../lib/cardText';
import { cardLayers } from '../lib/layout';
import {
  studentFirstNameLine,
  studentGradeLine,
  studentIdentifierLines,
  studentLastNameLine
} from '../lib/student';
import type { FitReport } from '../ui/validation';

export const FRONT_TEMPLATE = 'templates/2026-2027/front.clean-2026.svg';
export const BACK_TEMPLATE = 'templates/2026-2027/back.canva.svg';

/** The card layers are tuned for a 315 px wide card. Larger previews scale this box, never re-layout it. */
export const CARD_BASE_WIDTH = 315;
export const CARD_BASE_HEIGHT = (CARD_BASE_WIDTH * 85.6) / 53.98;

function lastNameStyle(lastName: string): CSSProperties {
  return { ...cardLayers.lastName, fontSize: `${frontLastNameFontPx(lastName)}px` };
}

function firstNameStyle(firstName: string): CSSProperties {
  return { ...cardLayers.firstName, fontSize: `${frontFirstNameFontPx(firstName)}px` };
}

function gradeStyle(grade: string): CSSProperties {
  return { ...cardLayers.grade, fontSize: `${frontGradeFontPx(grade)}px` };
}

export function CardPage({ background, children, rotated = false }: { background: string; children: ReactNode; rotated?: boolean }) {
  return (
    <div className="card-page">
      <div className={`card-content${rotated ? ' card-content-rotated' : ''}`}>
        <img src={background} className="card-bg" alt="" />
        {children}
      </div>
    </div>
  );
}

/** Renders the 315 px card at `scale` without changing its internal layout. */
export function ScaledCard({ scale, children }: { scale: number; children: ReactNode }) {
  return (
    <div className="scaled-card" style={{ width: CARD_BASE_WIDTH * scale, height: CARD_BASE_HEIGHT * scale }}>
      <div className="scaled-card-inner" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

interface FrontRefs {
  lastName?: (el: HTMLDivElement | null) => void;
  firstName?: (el: HTMLDivElement | null) => void;
  grade?: (el: HTMLDivElement | null) => void;
  ids?: (el: HTMLDivElement | null) => void;
}

export function CardFront({
  student,
  qrDataUrl,
  refs = {},
  photoPlaceholder = false
}: {
  student: StudentRecord;
  qrDataUrl: string;
  refs?: FrontRefs;
  /** Preview only: a dashed "Photo needed" box where the photo goes. Never printed. */
  photoPlaceholder?: boolean;
}) {
  const idLines = studentIdentifierLines(student);
  const lastName = studentLastNameLine(student);
  const firstName = studentFirstNameLine(student);
  const gradeLine = studentGradeLine(student);

  return (
    <CardPage background={FRONT_TEMPLATE}>
      {student.photoUrl ? (
        <img className="layer photo-layer" src={student.photoUrl} style={cardLayers.photo} alt="" />
      ) : photoPlaceholder ? (
        <div className="layer photo-needed" style={cardLayers.photo}>
          <ImagePlus size={28} aria-hidden="true" />
          <span>Photo needed</span>
        </div>
      ) : null}
      {qrDataUrl ? <img className="layer qr-layer" src={qrDataUrl} style={cardLayers.qr} alt="" /> : null}
      <div ref={refs.lastName} className="layer last-name-layer" style={lastNameStyle(lastName)}>
        {lastName}
      </div>
      <div ref={refs.firstName} className="layer first-name-layer" style={firstNameStyle(firstName)}>
        {firstName}
      </div>
      <div ref={refs.grade} className="layer grade-layer" style={gradeStyle(gradeLine)}>
        {gradeLine}
      </div>
      {idLines.length ? (
        <div ref={refs.ids} className="layer ids-layer" style={cardLayers.ids}>
          {idLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}
    </CardPage>
  );
}

interface BackRefs {
  layer?: (el: HTMLDivElement | null) => void;
  name?: (el: HTMLElement | null) => void;
  address?: (el: HTMLElement | null) => void;
  phone?: (el: HTMLElement | null) => void;
}

/**
 * Card back. The preview shows it upright (`rotated` false). Only the print HTML in
 * lib/printHtml.ts turns it 180 degrees for the card printer.
 */
export function CardBack({ student, refs = {}, rotated = false }: { student: StudentRecord; refs?: BackRefs; rotated?: boolean }) {
  return (
    <CardPage background={BACK_TEMPLATE} rotated={rotated}>
      <div ref={refs.layer} className="layer emergency-layer" style={cardLayers.emergency}>
        <strong ref={refs.name} style={{ fontSize: `${emergencyNameFontPx(student.guardian.name)}px` }}>
          {student.guardian.name}
        </strong>
        <span ref={refs.address} style={{ fontSize: `${emergencyAddressFontPx(student.guardian.address)}px` }}>
          {student.guardian.address}
        </span>
        <b ref={refs.phone} style={{ fontSize: `${emergencyPhoneFontPx(student.guardian.phone)}px` }}>
          {student.guardian.phone}
        </b>
      </div>
    </CardPage>
  );
}

const TOLERANCE = 1;
/** Emergency contact names fitted below this preview size print under about 5.6 pt. */
const SMALL_NAME_PX = 11.5;
/** Below this card width the two-up preview is too small to read, so show one side at a time. */
const MIN_READABLE_WIDTH = 300;
/** Header thumbnail of the side not on show (about 50 px wide). */
const THUMB_SCALE = 0.16;

function overflowsX(el: HTMLElement | null) {
  return Boolean(el && el.scrollWidth > el.clientWidth + TOLERANCE);
}

/**
 * For a line-clamped element: lay it out unclamped for a moment (inside one frame, never painted),
 * count its lines, and report whether it needs more than `maxLines` or a word is wider than the box.
 */
function exceedsLines(el: HTMLElement | null, maxLines: number) {
  if (!el) return false;
  const saved = el.getAttribute('style') || '';
  el.style.display = 'block';
  el.style.setProperty('-webkit-line-clamp', 'unset');
  el.style.overflow = 'visible';
  const style = getComputedStyle(el);
  const fontSize = parseFloat(style.fontSize) || 1;
  const lineHeight = parseFloat(style.lineHeight) || fontSize;
  const lines = Math.round(el.offsetHeight / lineHeight);
  const tooWide = el.scrollWidth > el.clientWidth + TOLERANCE;
  el.setAttribute('style', saved);
  return lines > maxLines || tooWide;
}

export type CardSide = 'front' | 'back';

/**
 * Live front/back preview, scaled to fill its box. Wide screens show both sides; when a side would be
 * narrower than ~300 px it shows one large side with Front/Back tabs (the other side stays laid out,
 * hidden, so the fit checks keep working). It reports which text runs past its space through `onFit`;
 * the print HTML uses the same clipping rules, so a cut-off here is a cut-off on the printed card.
 */
export function CardPreview({
  student,
  qrDataUrl,
  onFit,
  preferSide,
  preferKey = 0,
  photoPlaceholder = false,
  maxScale = 1.6,
  title,
  subtitle
}: {
  /** Heading shown in the preview header row (the side tabs sit beside it). */
  title: string;
  subtitle?: string;
  student: StudentRecord;
  qrDataUrl: string;
  onFit?: (report: FitReport) => void;
  /** Side to show in one-side mode (follows the field being edited). */
  preferSide?: CardSide;
  /** Changes whenever App asks for `preferSide` again, so a repeat request still switches. */
  preferKey?: number;
  photoPlaceholder?: boolean;
  maxScale?: number;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<{ scale: number; single: boolean }>({ scale: 1, single: false });
  const [side, setSide] = useState<CardSide>('front');
  const els = useRef<Record<string, HTMLElement | null>>({});
  const set = (key: string) => (el: HTMLElement | null) => {
    els.current[key] = el;
  };

  useEffect(() => {
    if (preferSide) setSide(preferSide);
  }, [preferSide, preferKey]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const gap = 28;
    const labelSpace = 44;
    // One-side mode: the tabs live in the header row and the side name is on the tab.
    const singleCaption = 6;
    // In one-side mode the other side shows as a small thumbnail in the header row.
    const measure = () => {
      const style = getComputedStyle(stage);
      const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const both = Math.min(maxScale, (width - gap) / (CARD_BASE_WIDTH * 2), (height - labelSpace) / CARD_BASE_HEIGHT);
      const single = Math.min(maxScale, width / CARD_BASE_WIDTH, (height - singleCaption) / CARD_BASE_HEIGHT);
      const useSingle = both * CARD_BASE_WIDTH < MIN_READABLE_WIDTH && single > both;
      const next = Math.max(0.4, useSingle ? single : both);
      setLayout({ scale: Math.floor(next * 100) / 100, single: useSingle });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [maxScale]);

  const fitKey = [
    student.firstName,
    student.lastName,
    student.grade,
    student.section,
    student.lrn,
    student.esc,
    student.admissionNo,
    student.guardian.name,
    student.guardian.address,
    student.guardian.phone
  ].join('|');

  useEffect(() => {
    if (!onFit) return;
    let canceled = false;
    const measure = () => {
      if (canceled) return;
      const e = els.current;
      const layer = e.backLayer;
      const phone = e.phone;
      const layerInner = layer ? layer.clientWidth - 20 : 0;
      const nameCut = exceedsLines(e.name, 1);
      const name = student.guardian.name.trim();
      onFit({
        lastName: overflowsX(e.lastName),
        firstName: overflowsX(e.firstName),
        grade: overflowsX(e.grade),
        ids: overflowsX(e.ids),
        guardianName: nameCut,
        guardianAddress: exceedsLines(e.address, 2),
        guardianPhone: Boolean(phone && layer && phone.offsetWidth > layerInner + TOLERANCE),
        guardianNameSmall: Boolean(name && !nameCut && emergencyNameFontPx(name) < SMALL_NAME_PX)
      });
    };
    const frame = requestAnimationFrame(measure);
    void document.fonts?.ready.then(measure);
    return () => {
      canceled = true;
      cancelAnimationFrame(frame);
    };
  }, [fitKey, onFit, layout.single]);

  const { scale, single } = layout;
  const front = (
    <CardFront
      student={student}
      qrDataUrl={qrDataUrl}
      photoPlaceholder={photoPlaceholder}
      refs={{ lastName: set('lastName'), firstName: set('firstName'), grade: set('grade'), ids: set('ids') }}
    />
  );
  const back = <CardBack student={student} refs={{ layer: set('backLayer'), name: set('name'), address: set('address'), phone: set('phone') }} />;
  const backNote = <small>Printed rotated for the card printer</small>;

  return (
    <>
      <header className="preview-head">
        <h2>{title}</h2>
        <span>{single && side === 'back' ? 'Back shown upright. Printed rotated for the card printer.' : subtitle}</span>
        {single ? (
          <button
            type="button"
            className="side-thumb"
            onClick={() => setSide(side === 'front' ? 'back' : 'front')}
            aria-label={`Show the ${side === 'front' ? 'back' : 'front'} of the card`}
            title={`Show the ${side === 'front' ? 'back' : 'front'}`}
          >
            <ScaledCard scale={THUMB_SCALE}>
              {side === 'front' ? <CardBack student={student} /> : <CardFront student={student} qrDataUrl={qrDataUrl} photoPlaceholder={photoPlaceholder} />}
            </ScaledCard>
            <span>{side === 'front' ? 'Back' : 'Front'}</span>
          </button>
        ) : null}
        {single ? (
          <div className="side-tabs" role="tablist" aria-label="Card side">
            {(['front', 'back'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={side === value}
                className={`side-tab${side === value ? ' is-active' : ''}`}
                onClick={() => setSide(value)}
              >
                {value === 'front' ? 'Front' : 'Back'}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      <div className={`preview-stage${single ? ' is-single' : ''}`} ref={stageRef} data-testid="card-preview">
        <div className="preview-cards">
          <figure className={`preview-card${single && side !== 'front' ? ' is-offstage' : ''}`} aria-hidden={single && side !== 'front'}>
            <ScaledCard scale={scale}>{front}</ScaledCard>
            {single ? null : <figcaption>Front</figcaption>}
          </figure>
          <figure className={`preview-card${single && side !== 'back' ? ' is-offstage' : ''}`} aria-hidden={single && side !== 'back'}>
            <ScaledCard scale={scale}>{back}</ScaledCard>
            {single ? null : (
              <figcaption>
                Back
                {backNote}
              </figcaption>
            )}
          </figure>
        </div>
      </div>
    </>
  );
}
