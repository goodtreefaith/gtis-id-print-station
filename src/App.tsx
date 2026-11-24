import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  Circle,
  FileDown,
  ImagePlus,
  LogOut,
  Pencil,
  Printer,
  RotateCcw,
  Save,
  Undo2,
  UserRound
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type {
  GuardianContact,
  OperatorSession,
  PortalSettings,
  PrinterInfo,
  StudentIdDetails,
  StudentNameDetails,
  StudentRecord
} from './types';
import { publicAssetToDataUrl } from './lib/assets';
import { loadOptionalIdCardFont, optionalIdCardFontFaceCss } from './lib/fonts';
import { renderArchiveHtml, renderPrintHtml } from './lib/printHtml';
import { makeAdmissionQr } from './lib/qr';
import { studentFullName, studentGradeLine } from './lib/student';
import {
  bridgeErrorMessage,
  clearOperatorSession,
  hasPortalConfig,
  hasValidOperatorSession,
  SAMPLE_PORTAL_SETTINGS,
  loadPortalSettings,
  loadOperatorSession,
  loginOperator,
  saveOperatorSession,
  searchStudents,
  updateGuardian,
  updateIdDetails,
  updateStudentName,
  uploadIdCardDocuments,
  updatePhoto
} from './lib/portalClient';
import { BACK_TEMPLATE, CardPreview, FRONT_TEMPLATE } from './components/CardPreview';
import type { CardSide } from './components/CardPreview';
import { ConfirmDialog } from './components/ConfirmDialog';
import type { ConfirmAction } from './components/ConfirmDialog';
import { Field } from './components/Field';
import { LockScreen } from './components/LockScreen';
import { ModeBadge, hostOf } from './components/ModeBadge';
import { PhotoEditor } from './components/PhotoEditor';
import { StatusStrip } from './components/StatusStrip';
import { StudentList } from './components/StudentList';
import { imageSourceToDataUrl } from './ui/images';
import type { FlowState, FlowSteps } from './ui/printFlow';
import { friendlyPrintError, friendlyUploadError, idleFlow } from './ui/printFlow';
import { useFocusTrap } from './ui/useFocusTrap';
import type { FieldIssue, FieldKey, FitReport } from './ui/validation';
import { checkFields, emptyFit, fitLabels } from './ui/validation';

const STUDENT_PAGE_LIMIT = 20;
const READ_ONLY_MESSAGE = 'This account can print IDs but cannot change portal records.';

interface PrintFieldOptions {
  includeLrn: boolean;
  includeEsc: boolean;
}

interface CardDocuments {
  /** Printer copy: back rotated 180 degrees for the card flip. */
  printHtml: string;
  /** Portal Documents copy: both sides upright. */
  archiveHtml: string;
}

interface LastPrint extends CardDocuments {
  studentId: string;
  name: string;
  /** "N. Villanueva" for the Reprint last button. */
  shortLabel: string;
  admissionNo: string;
  uploaded: boolean;
  at: number;
}

interface PendingUpload {
  studentId: string;
  name: string;
  printSummary: string;
  archiveHtml: string;
}

interface PrintJob {
  reprint?: LastPrint;
  /** The operator already confirmed a possible duplicate card. */
  confirmed?: boolean;
}

interface Blocker {
  key: string;
  label: string;
  fixLabel?: string;
  onFix?: () => void;
}

function printableStudent(
  student: StudentRecord,
  nameDraft: StudentNameDetails | null,
  guardianDraft: GuardianContact | null,
  idDraft: StudentIdDetails | null,
  printFields: PrintFieldOptions
): StudentRecord {
  const lrn = idDraft?.lrn.trim() || '';
  const esc = idDraft?.esc.trim() || '';

  return {
    ...student,
    firstName: nameDraft ? cleanValue(nameDraft.firstName) || student.firstName : student.firstName,
    lastName: nameDraft ? cleanValue(nameDraft.lastName) || student.lastName : student.lastName,
    guardian: guardianDraft || student.guardian,
    lrn: printFields.includeLrn ? lrn : '',
    esc: printFields.includeEsc ? esc : ''
  };
}

function cleanValue(value: string | undefined) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function replaceStudent(list: StudentRecord[], updated: StudentRecord) {
  return list.map((student) => (student.id === updated.id ? updated : student));
}

function mergeStudents(current: StudentRecord[], incoming: StudentRecord[]) {
  const seen = new Set(current.map((student) => student.id));
  return [...current, ...incoming.filter((student) => !seen.has(student.id))];
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** "Nathaniel Villanueva": short enough for messages and buttons. */
function shortName(student: StudentRecord) {
  const first = cleanValue(student.firstName).split(' ')[0] || '';
  return [first, cleanValue(student.lastName)].filter(Boolean).join(' ');
}

function timeOf(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const PRINTER_KEY = 'gtis-id-print-station.printer';
const PRINTED_KEY_PREFIX = 'gtis-id-print-station.printed-';

function todayKey() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${PRINTED_KEY_PREFIX}${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Student id → time printed today. No names are stored: they come from the list in memory. */
type PrintedToday = Record<string, number>;

/** Today's printed marks for this station. Older days' keys are deleted on startup. */
function readPrintedToday(): PrintedToday {
  try {
    const today = todayKey();
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PRINTED_KEY_PREFIX) && key !== today) window.localStorage.removeItem(key);
    }
    const parsed = JSON.parse(window.localStorage.getItem(today) || '{}');
    const marks: PrintedToday = {};
    if (parsed && typeof parsed === 'object') {
      for (const [id, at] of Object.entries(parsed)) {
        if (typeof at === 'number') marks[id] = at;
      }
    }
    return marks;
  } catch {
    // Unreadable or blocked storage: start empty.
    return {};
  }
}

function writePrintedToday(value: PrintedToday) {
  try {
    window.localStorage.setItem(todayKey(), JSON.stringify(value));
  } catch {
    // Storage unavailable: the marks last for this session only.
  }
}

function readPrinterPrefs(): { printer: string; silent: boolean } {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRINTER_KEY) || '{}');
    return { printer: typeof parsed.printer === 'string' ? parsed.printer : '', silent: parsed.silent === true };
  } catch {
    return { printer: '', silent: false };
  }
}

function writePrinterPrefs(printer: string, silent: boolean) {
  try {
    window.localStorage.setItem(PRINTER_KEY, JSON.stringify({ printer, silent }));
  } catch {
    // Storage unavailable: settings last for this session only.
  }
}

/** "N. Villanueva" for buttons. */
function initialName(student: StudentRecord) {
  const first = cleanValue(student.firstName);
  return [first ? `${first[0]}.` : '', cleanValue(student.lastName)].filter(Boolean).join(' ');
}

export default function App() {
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [selected, setSelected] = useState<StudentRecord | null>(null);
  const [studentPage, setStudentPage] = useState(1);
  const [hasMoreStudents, setHasMoreStudents] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [listError, setListError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [nameDraft, setNameDraft] = useState<StudentNameDetails | null>(null);
  const [guardianDraft, setGuardianDraft] = useState<GuardianContact | null>(null);
  const [idDraft, setIdDraft] = useState<StudentIdDetails | null>(null);
  const [printFields, setPrintFields] = useState<PrintFieldOptions>({ includeLrn: true, includeEsc: true });
  const [captureOpen, setCaptureOpen] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState(() => readPrinterPrefs().printer);
  const [silentPrint, setSilentPrint] = useState(() => readPrinterPrefs().silent);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [portalSettings, setPortalSettings] = useState<PortalSettings>(SAMPLE_PORTAL_SETTINGS);
  const [portalChecked, setPortalChecked] = useState(false);
  const [startError, setStartError] = useState('');
  const [operatorSession, setOperatorSession] = useState<OperatorSession | null>(() => loadOperatorSession());
  const [loginDraft, setLoginDraft] = useState({ username: '', password: '' });
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [fit, setFit] = useState<FitReport>(emptyFit);
  const [pendingSwitch, setPendingSwitch] = useState<StudentRecord | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: ReactNode; actions: ConfirmAction[]; testId: string } | null>(null);
  const [lastPrint, setLastPrint] = useState<LastPrint | null>(null);
  const [printedAt, setPrintedAt] = useState<PrintedToday>(() => readPrintedToday());
  /** Names of students printed this session (memory only, never stored). */
  const [printedNames, setPrintedNames] = useState<Record<string, string>>({});
  /** Printed cards whose archive copy did not upload yet. Kept until filed or dismissed. */
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [previewPref, setPreviewPref] = useState<{ side: CardSide; n: number }>({ side: 'front', n: 0 });
  const setPreviewSide = (side: CardSide) => setPreviewPref((current) => ({ side, n: current.n + 1 }));
  /** Query the visible results belong to; Print waits until it matches what is typed. */
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<null | 'print' | 'focus-print'>(null);
  /** Which student the edit fields belong to. Edits only count, save or print for that student. */
  const [draftOwner, setDraftOwner] = useState<string | null>(null);
  const liveMode = hasPortalConfig(portalSettings);
  const previewOnly = window.gtPrint?.previewOnly === true;
  const [flow, setFlow] = useState<FlowState>(() => idleFlow(false));
  const operatorReady = portalChecked && (!liveMode || hasValidOperatorSession(operatorSession));
  const operatorCanUseStation = !liveMode || operatorSession?.permissions?.canView !== false;
  const operatorCanEditPortal = !liveMode || operatorSession?.permissions?.canEdit !== false;

  const searchRef = useRef<HTMLInputElement | null>(null);
  const printButtonRef = useRef<HTMLButtonElement | null>(null);
  const printerButtonRef = useRef<HTMLButtonElement | null>(null);
  const printerPopoverRef = useRef<HTMLDivElement | null>(null);
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const printingRef = useRef(false);
  const dirtyRef = useRef(false);
  const studentsRef = useRef<StudentRecord[]>([]);
  const selectedRef = useRef<StudentRecord | null>(null);
  const lastLoadedQueryRef = useRef<string | null>(null);
  const lastPrintedShortRef = useRef('');
  const queryRef = useRef('');
  /** After a successful print the search is cleared; keep the printed student on screen. */
  const keepSelectionRef = useRef(false);

  /** The job "Try again" repeats, and whether a card may already have come out. */
  const retryJobRef = useRef<{ reprint?: LastPrint; mayHavePrinted?: boolean }>({});
  studentsRef.current = students;
  selectedRef.current = selected;
  queryRef.current = query;

  useEffect(() => {
    void loadOptionalIdCardFont();
    void refreshPortalSettings();
  }, []);

  /** Live or Sample comes from how the desktop app was started (portal.info); there is no in-app switch. */
  async function refreshPortalSettings() {
    try {
      setPortalSettings(await loadPortalSettings());
      setStartError('');
    } catch {
      setStartError('Could not start the portal connection. Restart the app.');
      return;
    }
    setPortalChecked(true);
  }

  useEffect(() => {
    if (!operatorReady) {
      setStudents([]);
      setSelected(null);
      return;
    }

    let canceled = false;
    const timeout = window.setTimeout(() => {
      loadStudents(1, true, () => canceled);
    }, 250);

    return () => {
      canceled = true;
      window.clearTimeout(timeout);
    };
  }, [query, portalSettings, operatorReady, operatorSession?.token, refreshCount]);

  useEffect(() => {
    if (operatorReady) {
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [operatorReady]);

  async function loadStudents(page: number, replace: boolean, isCanceled = () => false) {
    setLoadingStudents(true);
    const searched = query;
    try {
      const result = await searchStudents(searched, {
        page,
        limit: STUDENT_PAGE_LIMIT,
        settings: portalSettings,
        operatorToken: operatorSession?.token
      });

      if (isCanceled()) {
        return;
      }

      setListError('');
      setStudentPage(result.page);
      setHasMoreStudents(result.hasMore);
      const next = replace ? result.students : mergeStudents(studentsRef.current, result.students);
      const queryChanged = replace && lastLoadedQueryRef.current !== searched;
      if (replace) {
        lastLoadedQueryRef.current = searched;
        setLoadedQuery(searched);
      }
      setStudents(next);

      // Selection rule: a new search shows its first match, so Print never targets a student who
      // is not in the results. Refresh and paging keep the current student when it is still there.
      const current = selectedRef.current;
      let target: StudentRecord | null;
      if (keepSelectionRef.current) {
        keepSelectionRef.current = false;
        target = current;
      } else if (!replace) {
        target = current || next[0] || null;
      } else if (queryChanged) {
        if (current && dirtyRef.current) {
          // Unsaved edits: ask before leaving them, instead of silently switching.
          if (next[0] && next[0].id !== current.id) setPendingSwitch(next[0]);
          target = current;
        } else {
          // An exact student number beats the first match.
          const exact = next.find((student) => student.admissionNo && student.admissionNo === searched.trim());
          target = exact || next[0] || null;
        }
      } else {
        const same = current ? next.find((student) => student.id === current.id) : undefined;
        target = same ? current : current && dirtyRef.current ? current : next[0] || null;
      }
      setSelected(target);
    } catch (error) {
      if (!isCanceled()) {
        setListError(errorText(error, 'The portal did not answer.'));
        setPendingAction((pending) => {
          if (pending === 'print') {
            setFlow({ tone: 'error', title: 'Search failed. Nothing was printed.', detail: errorText(error, 'The portal did not answer.') });
          }
          return null;
        });
      }
    } finally {
      if (!isCanceled()) {
        setLoadingStudents(false);
      }
    }
  }

  // Layout effect: drafts and the status strip switch with the student before any key or click
  // can see a stale frame.
  useLayoutEffect(() => {
    setFlow((current) => {
      if (current.tone === 'working' || current.retry === 'upload') return current;
      if (current.studentId && current.studentId === selected?.id) return current;
      if (current.retry === 'print' && retryJobRef.current.reprint) return current;
      return idleFlow(hasPortalConfig(portalSettings), !operatorCanEditPortal);
    });
    if (!selected) {
      setQrDataUrl('');
      setNameDraft(null);
      setGuardianDraft(null);
      setIdDraft(null);
      setDraftOwner(null);
      return;
    }

    setDraftOwner(selected.id);
    setNameDraft({ firstName: selected.firstName || '', lastName: selected.lastName || '' });
    setGuardianDraft(selected.guardian);
    setIdDraft({ lrn: selected.lrn || '', esc: selected.esc || '' });
    setPrintFields({ includeLrn: Boolean(selected.lrn), includeEsc: Boolean(selected.esc) });
    setFit(emptyFit);
    setQrDataUrl('');
    const qrFor = selected.id;
    makeAdmissionQr(selected.admissionNo)
      .then((url) => {
        // A late QR for a student who is no longer selected must never reach the card.
        if (selectedRef.current?.id === qrFor) setQrDataUrl(url);
      })
      .catch(() => {
        if (selectedRef.current?.id !== qrFor) return;
        setQrDataUrl('');
        setPendingAction(null);
        setFlow({ tone: 'error', title: 'Couldn’t make the QR code for this student.', detail: 'Choose the student again, or restart the app.' });
      });
  }, [selected?.id]);

  useEffect(() => {
    writePrinterPrefs(selectedPrinter, silentPrint);
  }, [selectedPrinter, silentPrint]);

  useEffect(() => {
    if (!window.gtPrint) {
      return;
    }

    window.gtPrint.listPrinters().then((availablePrinters) => {
      setPrinters(availablePrinters);
      const saved = readPrinterPrefs().printer;
      const preferred =
        (saved ? availablePrinters.find((printer) => printer.name === saved) : undefined) ||
        availablePrinters.find((printer) => /smart|idp|card/i.test(printer.name)) ||
        availablePrinters.find((printer) => printer.isDefault) ||
        availablePrinters[0];
      if (preferred) {
        setSelectedPrinter(preferred.name);
      }
    });
  }, []);

  // Between choosing a student and the edit fields being refilled there is one render where the
  // fields still hold the previous student. Nothing may read them then.
  const draftsReady = Boolean(selected && draftOwner === selected.id);

  const previewStudent = useMemo(() => {
    if (!selected) return null;
    if (!draftsReady) {
      return printableStudent(selected, null, null, { lrn: selected.lrn || '', esc: selected.esc || '' }, {
        includeLrn: Boolean(selected.lrn),
        includeEsc: Boolean(selected.esc)
      });
    }
    return printableStudent(selected, nameDraft, guardianDraft, idDraft, printFields);
  }, [selected, draftsReady, nameDraft, guardianDraft, idDraft, printFields]);

  const dirty = useMemo(() => {
    if (!selected || !draftsReady) return { name: false, guardian: false, ids: false, any: false };
    const name = Boolean(
      nameDraft &&
        (cleanValue(nameDraft.firstName) !== cleanValue(selected.firstName) ||
          cleanValue(nameDraft.lastName) !== cleanValue(selected.lastName))
    );
    const guardian = Boolean(
      guardianDraft &&
        (cleanValue(guardianDraft.name) !== cleanValue(selected.guardian.name) ||
          cleanValue(guardianDraft.relation) !== cleanValue(selected.guardian.relation) ||
          cleanValue(guardianDraft.address) !== cleanValue(selected.guardian.address) ||
          cleanValue(guardianDraft.phone) !== cleanValue(selected.guardian.phone))
    );
    const ids = Boolean(
      idDraft && (cleanValue(idDraft.lrn) !== cleanValue(selected.lrn) || cleanValue(idDraft.esc) !== cleanValue(selected.esc))
    );
    return { name, guardian, ids, any: name || guardian || ids };
  }, [selected, draftsReady, nameDraft, guardianDraft, idDraft]);
  dirtyRef.current = dirty.any;

  const issues = useMemo(
    () =>
      checkFields(
        {
          firstName: nameDraft?.firstName || '',
          lastName: nameDraft?.lastName || '',
          guardianName: guardianDraft?.name || '',
          guardianAddress: guardianDraft?.address || '',
          guardianPhone: guardianDraft?.phone || '',
          lrn: printFields.includeLrn ? idDraft?.lrn || '' : '',
          esc: printFields.includeEsc ? idDraft?.esc || '' : ''
        },
        fit
      ),
    [nameDraft, guardianDraft, idDraft, printFields, fit]
  );

  function focusField(key: FieldKey) {
    const el = fieldRefs.current[key];
    el?.focus();
    el?.scrollIntoView({ block: 'nearest' });
  }

  const blockers = useMemo(() => {
    const list: Blocker[] = [];
    if (!selected) return list;
    if (!operatorCanUseStation) list.push({ key: 'access', label: 'Your account isn’t allowed to print IDs.' });
    if (!selected.photoUrl) {
      list.push({
        key: 'photo',
        label: 'No photo yet',
        fixLabel: 'Add photo',
        onFix: operatorCanEditPortal ? () => setCaptureOpen(true) : undefined
      });
    }
    if (issues.firstName?.level === 'error' || issues.lastName?.level === 'error') {
      const key: FieldKey = issues.firstName?.level === 'error' ? 'firstName' : 'lastName';
      list.push({ key: 'name', label: 'Name on the card is empty', fixLabel: 'Fix', onFix: () => focusField(key) });
    }
    const contactKeys: Array<[FieldKey, string]> = [
      ['guardianName', 'name'],
      ['guardianPhone', 'phone'],
      ['guardianAddress', 'address']
    ];
    const values: Record<string, string> = {
      guardianName: guardianDraft?.name || '',
      guardianPhone: guardianDraft?.phone || '',
      guardianAddress: guardianDraft?.address || ''
    };
    const missing = contactKeys.filter(([key]) => issues[key]?.level === 'error' && !values[key].trim());
    const badPhone = issues.guardianPhone?.level === 'error' && Boolean(values.guardianPhone.trim());
    if (missing.length || badPhone) {
      const parts = [
        ...(missing.length ? [`no ${missing.map(([, word]) => word).join(' or ')}`] : []),
        ...(badPhone ? ['phone number isn’t valid'] : [])
      ];
      list.push({
        key: 'contact',
        label: `Emergency contact: ${parts.join(', ')}`,
        fixLabel: 'Fix',
        onFix: () => focusField(missing.length ? missing[0][0] : 'guardianPhone')
      });
    }
    if (!qrDataUrl) list.push({ key: 'qr', label: 'Preparing the QR code…' });
    return list;
  }, [selected, issues, qrDataUrl, operatorCanUseStation, operatorCanEditPortal, guardianDraft]);

  const fitWarnings = (Object.keys(fit) as Array<keyof FitReport>).filter((key) => fit[key]);
  /** The list on screen belongs to what is typed (no debounce or request still pending). */
  const searchSettled = loadedQuery === query && !loadingStudents;
  const canPrint = Boolean(!previewOnly && selected && draftsReady && blockers.length === 0 && searchSettled && !pendingSwitch);

  function applyUpdatedStudent(updated: StudentRecord) {
    setStudents((current) => replaceStudent(current, updated));
    setSelected(updated);
    return updated;
  }

  async function saveNameDraftToPortal(baseStudent: StudentRecord) {
    if (!nameDraft) return baseStudent;
    if (!operatorCanEditPortal) throw new Error(READ_ONLY_MESSAGE);
    const nextName = { firstName: cleanValue(nameDraft.firstName), lastName: cleanValue(nameDraft.lastName) };
    if (!nextName.firstName || !nextName.lastName) {
      throw new Error('First name and last name are required before printing.');
    }
    const updated = await updateStudentName(baseStudent.id, nextName, portalSettings, operatorSession?.token);
    setNameDraft({ firstName: updated.firstName, lastName: updated.lastName });
    applyUpdatedStudent(updated);
    return updated;
  }

  async function saveGuardianDraftToPortal(baseStudent: StudentRecord) {
    if (!guardianDraft) return baseStudent;
    if (!operatorCanEditPortal) throw new Error(READ_ONLY_MESSAGE);
    const nextGuardian = {
      name: cleanValue(guardianDraft.name),
      relation: cleanValue(guardianDraft.relation),
      address: cleanValue(guardianDraft.address),
      phone: cleanValue(guardianDraft.phone)
    };
    const updated = await updateGuardian(baseStudent.id, nextGuardian, portalSettings, operatorSession?.token);
    setGuardianDraft(updated.guardian);
    applyUpdatedStudent(updated);
    return updated;
  }

  async function saveIdDraftToPortal(baseStudent: StudentRecord) {
    if (!idDraft) return baseStudent;
    if (!operatorCanEditPortal) throw new Error(READ_ONLY_MESSAGE);
    const nextDetails = { lrn: cleanValue(idDraft.lrn), esc: cleanValue(idDraft.esc) };
    const updated = await updateIdDetails(baseStudent.id, nextDetails, portalSettings, operatorSession?.token);
    setIdDraft({ lrn: updated.lrn || '', esc: updated.esc || '' });
    setPrintFields((current) => ({
      includeLrn: nextDetails.lrn ? current.includeLrn : false,
      includeEsc: nextDetails.esc ? current.includeEsc : false
    }));
    applyUpdatedStudent(updated);
    return updated;
  }

  /** Saves every edited section of the selected student. Returns the saved record. */
  async function saveAllDrafts(): Promise<StudentRecord> {
    if (!selected) throw new Error('Choose a student first.');
    if (!draftsReady) throw new Error('The card details are still loading. Try again.');
    if (dirty.any && !operatorCanEditPortal) {
      throw new Error(`${READ_ONLY_MESSAGE} Undo the edits to print.`);
    }
    let current = selected;
    if (dirty.name) current = await saveNameDraftToPortal(current);
    if (dirty.guardian) current = await saveGuardianDraftToPortal(current);
    if (dirty.ids) current = await saveIdDraftToPortal(current);
    return current;
  }

  function discardDrafts() {
    if (!selected) return;
    setNameDraft({ firstName: selected.firstName || '', lastName: selected.lastName || '' });
    setGuardianDraft(selected.guardian);
    setIdDraft({ lrn: selected.lrn || '', esc: selected.esc || '' });
    setPrintFields({ includeLrn: Boolean(selected.lrn), includeEsc: Boolean(selected.esc) });
  }

  function savedDetail() {
    return liveMode ? 'Saved to the portal.' : 'Saved in sample data only (Sample mode).';
  }

  async function handleSaveAll() {
    if (!selected || !dirty.any || busy) return;
    if (!operatorCanEditPortal) {
      setFlow({ tone: 'error', title: READ_ONLY_MESSAGE, studentId: selected.id });
      return;
    }
    setBusy(true);
    setFlow({ tone: 'working', title: 'Saving changes…', studentId: selected.id });
    try {
      await saveAllDrafts();
      setFlow({ tone: 'success', title: 'Changes saved.', detail: savedDetail(), studentId: selected.id });
    } catch (error) {
      setFlow({ tone: 'error', title: 'Changes weren’t saved.', detail: errorText(error, 'Try again.'), studentId: selected.id });
    } finally {
      setBusy(false);
    }
  }

  async function buildCardDocuments(studentOverride?: StudentRecord | null): Promise<CardDocuments> {
    const studentToRender = studentOverride
      ? printableStudent(studentOverride, nameDraft, guardianDraft, idDraft, printFields)
      : previewStudent;

    if (!studentToRender || !qrDataUrl) {
      throw new Error('Choose a student before printing.');
    }

    const [front, back, idCardFontFaceCss] = await Promise.all([
      publicAssetToDataUrl(FRONT_TEMPLATE),
      publicAssetToDataUrl(BACK_TEMPLATE),
      optionalIdCardFontFaceCss()
    ]);
    const studentForPrint = { ...studentToRender };
    if (studentForPrint.photoUrl) {
      studentForPrint.photoUrl = await imageSourceToDataUrl(studentForPrint.photoUrl, portalSettings.baseUrl);
    }

    const assets = { front, back, idCardFontFaceCss };
    return {
      printHtml: renderPrintHtml(studentForPrint, qrDataUrl, assets),
      archiveHtml: renderArchiveHtml(studentForPrint, qrDataUrl, assets)
    };
  }

  function handleLrnChange(value: string) {
    setIdDraft((current) => ({ lrn: value, esc: current?.esc || '' }));
    setPrintFields((current) => ({ ...current, includeLrn: value.trim() ? true : false }));
  }

  function handleEscChange(value: string) {
    setIdDraft((current) => ({ lrn: current?.lrn || '', esc: value }));
    setPrintFields((current) => ({ ...current, includeEsc: value.trim() ? true : false }));
  }

  async function handleApprovePhoto(photoDataUrl: string) {
    if (!selected) return;
    if (!operatorCanEditPortal) {
      setPhotoError(READ_ONLY_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      setPhotoError('');
      const updated = await updatePhoto(selected.id, photoDataUrl, portalSettings, operatorSession?.token);
      setStudents((current) => replaceStudent(current, updated));
      setSelected(updated);
      setCaptureOpen(false);
      setFlow({
        tone: 'success',
        title: 'Photo saved.',
        detail: liveMode ? 'The new photo is on the student’s portal record.' : 'Saved in sample data only (Sample mode).',
        studentId: updated.id
      });
    } catch (error) {
      setPhotoError(`The photo wasn’t saved. ${errorText(error, 'Try again.')}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadArchive(archiveHtml: string, studentId: string) {
    if (!window.gtPrint?.captureCardPngs) {
      throw new Error('This app version cannot capture the printed ID for upload.');
    }
    // The archive copy is upright on both sides (renderArchiveHtml), not the rotated print copy.
    const images = await window.gtPrint.captureCardPngs(archiveHtml);
    await uploadIdCardDocuments(studentId, { front: images.front, back: images.back }, portalSettings, operatorSession?.token);
  }

  function askBeforeDuplicate(job: PrintJob, title: string, body: ReactNode, testId: string) {
    setConfirm({
      title,
      body,
      testId,
      // The safe answer comes first, is the filled button and gets focus: a stray Enter never prints.
      actions: [
        { label: 'Don’t print', kind: 'primary', onClick: () => setConfirm(null) },
        {
          label: (
            <>
              <Printer size={18} aria-hidden="true" /> Print another card
            </>
          ),
          kind: 'secondary',
          onClick: () => {
            setConfirm(null);
            void runPrintJob({ ...job, confirmed: true });
          }
        }
      ]
    });
  }

  /**
   * Save edits → print → file the upright PNGs in the portal. A ref lock stops key-repeat or double
   * clicks from sending two jobs. A student already printed this session asks first.
   */
  async function runPrintJob(job: PrintJob) {
    if (previewOnly || printingRef.current) return;
    if (liveMode && !hasValidOperatorSession(operatorSession)) {
      setFlow({ tone: 'error', title: 'Sign in before printing.' });
      return;
    }
    if (!job.reprint && !canPrint) {
      printButtonRef.current?.focus();
      return;
    }
    if (!job.reprint && !job.confirmed && selected && printedAt[selected.id]) {
      askBeforeDuplicate(
        job,
        `Print ${shortName(previewStudent || selected)}’s ID again?`,
        <p>A card for this student was already printed at {timeOf(printedAt[selected.id])}. Print another only if that card was lost or wrong.</p>,
        'confirm-duplicate'
      );
      return;
    }

    printingRef.current = true;
    setBusy(true);
    const jobStudentId = job.reprint ? job.reprint.studentId : selected?.id;
    retryJobRef.current = job.reprint ? { reprint: job.reprint } : {};
    const steps: FlowSteps = {
      save: !job.reprint && dirty.any ? 'active' : 'skipped',
      print: 'waiting',
      upload: liveMode && !(job.reprint && job.reprint.uploaded) ? 'waiting' : 'skipped'
    };
    const who = job.reprint ? job.reprint.name : selected ? shortName(previewStudent || selected) : '';
    const queryAtStart = query;
    if (!job.reprint && selected) lastPrintedShortRef.current = initialName(previewStudent || selected);
    const update = (patch: Partial<FlowSteps>, state: Omit<FlowState, 'steps' | 'studentId'>) => {
      Object.assign(steps, patch);
      setFlow({ ...state, steps: { ...steps }, studentId: jobStudentId });
    };
    const failSkip = () => (steps.upload === 'waiting' ? 'skipped' : steps.upload);

    try {
      let docs: CardDocuments;
      let studentId: string;
      let admissionNo: string;
      if (job.reprint) {
        docs = { printHtml: job.reprint.printHtml, archiveHtml: job.reprint.archiveHtml };
        studentId = job.reprint.studentId;
        admissionNo = job.reprint.admissionNo;
      } else {
        if (steps.save === 'active') update({}, { tone: 'working', title: 'Saving changes…' });
        let synced: StudentRecord;
        try {
          synced = await saveAllDrafts();
        } catch (error) {
          update({ save: 'failed' }, {
            tone: 'error',
            title: 'Changes weren’t saved, so nothing was printed.',
            detail: errorText(error, 'Try again.'),
            retry: 'print'
          });
          return;
        }
        if (steps.save === 'active') steps.save = 'done';
        docs = await buildCardDocuments(synced);
        studentId = synced.id;
        admissionNo = synced.admissionNo;
      }

      if (!window.gtPrint) {
        update({ print: 'active' }, { tone: 'working', title: 'Opening the browser print dialog…' });
        const printWindow = window.open('', '_blank', 'width=720,height=960');
        if (!printWindow) {
          update({ print: 'failed', upload: failSkip() }, { tone: 'error', title: 'The print window was blocked.', detail: 'Use the desktop app, or allow pop-ups.', retry: 'print' });
          return;
        }
        printWindow.document.write(docs.printHtml);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 350);
        update({ print: 'done', upload: 'skipped' }, { tone: 'success', title: 'Opened the browser print dialog.' });
        return;
      }

      update(
        { print: 'active' },
        { tone: 'working', title: silentPrint ? `Printing ${who}’s ID…` : `Printing ${who}’s ID. Confirm in the Windows print dialog.` }
      );
      let result;
      try {
        result = await window.gtPrint.printCard(docs.printHtml, { deviceName: selectedPrinter || undefined, silent: silentPrint });
      } catch (error) {
        retryJobRef.current.mayHavePrinted = true;
        update({ print: 'failed', upload: failSkip() }, { tone: 'error', ...friendlyPrintError(errorText(error, ''), who), retry: 'print' });
        return;
      }
      if (!result.ok) {
        if (result.canceled) {
          update({ print: 'failed', upload: failSkip() }, {
            tone: 'warning',
            title: `Printing ${who}’s ID was cancelled.`,
            detail: 'Nothing was printed.',
            retry: 'print'
          });
        } else {
          retryJobRef.current.mayHavePrinted = true;
          update({ print: 'failed', upload: failSkip() }, { tone: 'error', ...friendlyPrintError(result.error || result.failureReason, who), retry: 'print' });
        }
        return;
      }

      const printedTime = Date.now();
      const printerName = result.printerName || selectedPrinter || 'the printer';
      const printSummary = `Printed ${who}’s ID on ${printerName} at ${timeOf(printedTime)}.`;
      const record: LastPrint = {
        ...docs,
        studentId,
        name: who,
        shortLabel: job.reprint ? job.reprint.shortLabel : lastPrintedShortRef.current || who,
        admissionNo,
        uploaded: job.reprint?.uploaded ?? false,
        at: printedTime
      };
      setLastPrint(record);
      setPrintedAt((current) => {
        const next = { ...current, [studentId]: printedTime };
        writePrintedToday(next);
        return next;
      });
      setPrintedNames((current) => ({ ...current, [studentId]: who }));

      // Print and next: clear the search for the next student, keep this one on screen.
      if (!job.reprint) {
        // Only clear what was there when printing started; if the operator already typed the next
        // name while the card printed, keep it.
        if (queryAtStart && queryRef.current === queryAtStart) {
          keepSelectionRef.current = true;
          setQuery('');
        }
        if (queryRef.current === queryAtStart) window.setTimeout(() => searchRef.current?.focus(), 0);
      }

      if (steps.upload !== 'waiting') {
        update({ print: 'done' }, {
          tone: 'success',
          title: printSummary,
          detail: liveMode ? 'Already filed in the portal earlier.' : 'Sample mode: the archive copy is not uploaded. Type the next name.'
        });
        return;
      }

      update({ print: 'done', upload: 'active' }, { tone: 'working', title: printSummary, detail: 'Filing the front and back in the student’s portal Documents…' });
      try {
        await uploadArchive(docs.archiveHtml, studentId);
        setLastPrint({ ...record, uploaded: true });
        update({ upload: 'done' }, { tone: 'success', title: printSummary, detail: 'Front and back filed in the student’s portal Documents. Type the next name.' });
      } catch (uploadError) {
        setPendingUploads((current) => [
          ...current.filter((item) => item.studentId !== studentId),
          { studentId, name: who, printSummary, archiveHtml: docs.archiveHtml }
        ]);
        update({ upload: 'failed' }, {
          tone: 'warning',
          ...friendlyUploadError(bridgeErrorMessage(uploadError, '')),
          title: `${who}’s card printed, but the archive copy didn’t upload.`,
          retry: 'upload'
        });
      }
    } catch (error) {
      update({ print: steps.print === 'active' ? 'failed' : steps.print }, {
        tone: 'error',
        title: `${who}’s ID didn’t print.`,
        detail: errorText(error, 'Try again.'),
        retry: 'print'
      });
    } finally {
      printingRef.current = false;
      setBusy(false);
    }
  }

  function retryPrint() {
    const retry = retryJobRef.current;
    const job: PrintJob = retry.reprint ? { reprint: retry.reprint } : {};
    if (retry.mayHavePrinted) {
      askBeforeDuplicate(
        { ...job },
        'Check the printer first',
        <p>
          The printer reported a problem, but a card may still have come out (for example after a jam). If a good card came out,
          don’t print another.
        </p>,
        'confirm-jam'
      );
      return;
    }
    // Only the jam question counts as confirming a duplicate; a failed save or cancel asks again.
    void runPrintJob(job);
  }

  /** Uploads every archive copy still waiting. Successes leave the list; failures stay. */
  async function retryUploads() {
    const waiting = pendingUploads;
    if (!waiting.length || printingRef.current) return;
    printingRef.current = true;
    setBusy(true);
    const steps: FlowSteps = { save: 'skipped', print: 'done', upload: 'active' };
    const label = waiting.length === 1 ? waiting[0].printSummary : `Uploading ${waiting.length} archive copies…`;
    setFlow({ tone: 'working', title: label, detail: 'Trying the upload again…', steps, studentId: waiting[waiting.length - 1].studentId });
    const failed: PendingUpload[] = [];
    let lastError = '';
    for (const item of waiting) {
      try {
        await uploadArchive(item.archiveHtml, item.studentId);
        setLastPrint((current) => (current && current.studentId === item.studentId ? { ...current, uploaded: true } : current));
      } catch (error) {
        failed.push(item);
        lastError = bridgeErrorMessage(error, '');
      }
    }
    setPendingUploads(failed);
    if (!failed.length) {
      setFlow({
        tone: 'success',
        title: waiting.length === 1 ? waiting[0].printSummary : `${waiting.length} archive copies filed.`,
        detail: 'Front and back filed in the student’s portal Documents.',
        steps: { ...steps, upload: 'done' },
        studentId: waiting[waiting.length - 1].studentId
      });
    } else {
      setFlow({
        tone: 'warning',
        ...friendlyUploadError(lastError),
        title: failed.length === 1 ? `${failed[0].name}’s archive copy still didn’t upload.` : `${failed.length} archive copies still didn’t upload.`,
        retry: 'upload',
        steps: { ...steps, upload: 'failed' },
        studentId: failed[failed.length - 1].studentId
      });
    }
    printingRef.current = false;
    setBusy(false);
  }

  async function handleSavePdf() {
    if (previewOnly) return;
    if (liveMode && !hasValidOperatorSession(operatorSession)) {
      setFlow({ tone: 'error', title: 'Sign in before saving.' });
      return;
    }
    const studentId = selected?.id;
    setBusy(true);
    setFlow({ tone: 'working', title: 'Making the PDF…', studentId });
    try {
      // As before: the PDF shows the card as previewed, including unsaved edits, without saving them.
      const { printHtml } = await buildCardDocuments();
      if (!window.gtPrint) throw new Error('Save PDF is available in the desktop app.');
      const result = await window.gtPrint.saveCardPdf(printHtml);
      if (result.ok) {
        setFlow({ tone: 'success', title: 'PDF saved.', detail: result.filePath, studentId });
      } else if (result.canceled) {
        setFlow({ tone: 'neutral', title: 'PDF not saved.', detail: 'You closed the save window.', studentId });
      } else {
        setFlow({ tone: 'error', title: 'The PDF wasn’t saved.', detail: result.error || 'Try again.', studentId });
      }
    } catch (error) {
      setFlow({ tone: 'error', title: 'The PDF wasn’t saved.', detail: errorText(error, 'Try again.'), studentId });
    } finally {
      setBusy(false);
    }
  }

  function handleRefreshStudents() {
    void refreshPortalSettings();
    setStudentPage(1);
    setListError('');
    setRefreshCount((value) => value + 1);
  }

  function handleLoadMoreStudents() {
    if (!loadingStudents && hasMoreStudents) {
      loadStudents(studentPage + 1, false);
    }
  }

  function selectStudent(student: StudentRecord) {
    // The operator chose a student themselves: a waiting Ctrl+P no longer applies.
    setPendingAction(null);
    if (selected && student.id === selected.id) return;
    if (selected && dirty.any) {
      setPendingSwitch(student);
      return;
    }
    setSelected(student);
  }

  async function resolveSwitch(action: 'save' | 'discard' | 'stay') {
    const target = pendingSwitch;
    if (!target) return;
    if (action === 'stay') {
      setPendingSwitch(null);
      searchRef.current?.focus();
      return;
    }
    if (action === 'save') {
      setBusy(true);
      try {
        await saveAllDrafts();
      } catch (error) {
        setFlow({ tone: 'error', title: 'Changes weren’t saved.', detail: errorText(error, 'Try again.'), studentId: selected?.id });
        setBusy(false);
        setPendingSwitch(null);
        return;
      }
      setBusy(false);
    }
    setPendingSwitch(null);
    setSelected(target);
    searchRef.current?.focus();
  }

  async function handleOperatorLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError('');
    try {
      const session = await loginOperator(portalSettings, loginDraft);
      saveOperatorSession(session);
      setOperatorSession(session);
      setLoginDraft({ username: '', password: '' });
      setRefreshCount((value) => value + 1);
    } catch (error) {
      clearOperatorSession();
      setOperatorSession(null);
      setLoginError(bridgeErrorMessage(error, 'Could not sign in. Check your email and password.'));
    } finally {
      setLoginBusy(false);
    }
  }

  function handleOperatorLogout() {
    clearOperatorSession();
    setOperatorSession(null);
    setStudents([]);
    setSelected(null);
    setLastPrint(null);
    setPendingUploads([]);
    setFlow(idleFlow(liveMode));
  }

  // Keyboard: Ctrl/Cmd+P prints, Ctrl/Cmd+S saves, Ctrl/Cmd+F or "/" finds.
  const keyActions = useRef({ print: () => {}, save: () => {} });
  keyActions.current = {
    print: () => {
      if (busy) return;
      // Typed but the search has not caught up: wait for it, then print its first match.
      if (!searchSettled) setPendingAction('print');
      else void runPrintJob({});
    },
    save: () => void handleSaveAll()
  };
  const modalOpen = captureOpen || Boolean(pendingSwitch) || Boolean(confirm);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (previewOnly && mod && key === 'p') {
        event.preventDefault();
        return;
      }
      if (modalOpen) return;
      if (mod && key === 'p') {
        event.preventDefault();
        if (!event.repeat) keyActions.current.print();
      } else if (mod && key === 's') {
        event.preventDefault();
        if (!event.repeat) keyActions.current.save();
      } else if ((mod && key === 'f') || (key === '/' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement))) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, previewOnly]);

  // Printer popover: focus trap, Esc and click outside close it, focus returns to its button.
  useFocusTrap(printerPopoverRef, printerOpen, () => setPrinterOpen(false));
  useEffect(() => {
    if (!printerOpen) return;
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!printerPopoverRef.current?.contains(target) && !printerButtonRef.current?.contains(target)) setPrinterOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [printerOpen]);

  useEffect(() => {
    // The search turned up another student while this one has unsaved edits: the operator must
    // answer the switch question first, so the waiting print is dropped, never run on this student.
    if (pendingAction && pendingSwitch) {
      setPendingAction(null);
      return;
    }
    // Wait for the search, the new student's edit fields and their QR code before acting.
    if (!pendingAction || !searchSettled || (selected && (!draftsReady || !qrDataUrl))) return;
    const action = pendingAction;
    setPendingAction(null);
    if (action === 'print') {
      // Print without looking only when the search is unambiguous.
      const exact = Boolean(selected && selected.admissionNo === query.trim());
      if (selected && (students.length === 1 || exact)) {
        void runPrintJob({});
      } else {
        printButtonRef.current?.focus();
        if (selected) {
          setFlow({
            tone: 'warning',
            title: 'Several matches. Check the student, then press Ctrl+P.',
            detail: `Showing ${shortName(selected)}, the first of ${students.length}.`,
            studentId: selected.id
          });
        }
      }
    } else printButtonRef.current?.focus();
    // runPrintJob reads this render's state, which now holds the settled search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction, pendingSwitch, searchSettled, draftsReady, qrDataUrl]);

  // Unsaved edits: ask before the window closes.
  useEffect(() => {
    if (!dirty.any) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty.any]);

  // Show the back automatically when something on the back needs attention.
  const backNeedsLook = fit.guardianName || fit.guardianNameSmall || fit.guardianAddress || fit.guardianPhone;
  useEffect(() => {
    setPreviewSide(backNeedsLook ? 'back' : 'front');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backNeedsLook, selected?.id]);

  function printedNameFor(id: string) {
    if (printedNames[id]) return printedNames[id];
    const known = students.find((student) => student.id === id);
    if (known) return shortName(known);
    if (lastPrint?.studentId === id) return lastPrint.name;
    return 'Student (name not loaded)';
  }

  const handleFit = useCallback((report: FitReport) => {
    setFit((current) => ((Object.keys(report) as Array<keyof FitReport>).some((key) => report[key] !== current[key]) ? report : current));
  }, []);

  if (!portalChecked) {
    return (
      <main className="center-shell" aria-busy={!startError}>
        <p className={startError ? 'form-alert' : 'center-card-foot'} role={startError ? 'alert' : undefined}>
          {startError || 'Starting…'}
        </p>
      </main>
    );
  }

  if (!operatorReady) {
    return (
      <LockScreen
        username={loginDraft.username}
        password={loginDraft.password}
        onChange={setLoginDraft}
        onSubmit={handleOperatorLogin}
        busy={loginBusy}
        error={loginError}
        portalHost={hostOf(portalSettings.baseUrl)}
      />
    );
  }

  let printerLabel = 'Windows print dialog';
  if (previewOnly) printerLabel = 'Printer unavailable';
  else if (selectedPrinter) printerLabel = printers.find((printer) => printer.name === selectedPrinter)?.displayName || selectedPrinter;
  const readOnly = !operatorCanEditPortal;
  const bindRef = (key: FieldKey) => (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    fieldRefs.current[key] = el;
  };

  // What the strip shows, most important first: running job or result needing action, unsaved
  // edits, blockers, no student, then the last result for this student.
  // While a print or upload failure shows, Try again is the main action and Print ID is outlined.
  const printErrorShowing = Boolean(flow.retry) && flow.tone !== 'working';
  let stripFlow: FlowState = previewOnly && flow.tone === 'neutral'
    ? { tone: 'neutral', title: 'Ready to preview.' }
    : flow;
  let stripMode: 'flow' | 'dirty' | 'blocked' = 'flow';
  if (flow.tone === 'working' || flow.retry) {
    stripFlow = flow;
  } else if (dirty.any) {
    stripMode = 'dirty';
    stripFlow =
      selected && blockers.length
        ? {
            tone: 'warning',
            title: previewOnly ? 'Unsaved changes.' : 'Unsaved changes. Not ready to print yet.',
            detail: `${blockers.map((blocker) => blocker.label).join(' · ')}.`
          }
        : { tone: 'warning', title: 'Unsaved changes.', detail: previewOnly ? undefined : 'Print ID saves them first.' };
  } else if (pendingAction === 'print') {
    stripFlow = { tone: 'working', title: `Finding “${query.trim()}”…`, detail: 'Prints as soon as the search finds one clear match.' };
  } else if (selected && blockers.length) {
    stripMode = 'blocked';
    stripFlow = {
      tone: 'warning',
      title: previewOnly ? 'Card details need attention.' : 'Not ready to print yet.',
      detail: `${blockers.map((blocker) => blocker.label).join(' · ')}. Fix these in the card details.`
    };
  } else if (!selected) {
    stripFlow = { tone: 'neutral', title: previewOnly ? 'Choose a sample student.' : 'Nothing to print yet.' };
  }

  const checks: Array<{ key: string; label: string; ok: boolean; warn?: boolean; fix?: () => void; fixLabel?: string }> = selected
    ? [
        {
          key: 'photo',
          label: selected.photoUrl ? 'Photo on file' : 'Photo needed',
          ok: Boolean(selected.photoUrl),
          fix: operatorCanEditPortal ? () => setCaptureOpen(true) : undefined,
          fixLabel: 'Add photo'
        },
        {
          key: 'name',
          label: blockers.find((b) => b.key === 'name')?.label || 'Name on the card',
          ok: !blockers.some((b) => b.key === 'name'),
          fix: blockers.find((b) => b.key === 'name')?.onFix,
          fixLabel: 'Fix'
        },
        {
          key: 'contact',
          label: blockers.find((b) => b.key === 'contact')?.label || 'Emergency contact complete',
          ok: !blockers.some((b) => b.key === 'contact'),
          fix: blockers.find((b) => b.key === 'contact')?.onFix,
          fixLabel: 'Fix'
        },
        { key: 'qr', label: `QR code for student no. ${selected.admissionNo}`, ok: Boolean(qrDataUrl) },
        { key: 'fit', label: fitWarnings.length ? 'Some text won’t fit the card' : 'All text fits the card', ok: true, warn: fitWarnings.length > 0 },
        {
          key: 'printed',
          label: printedAt[selected.id] ? `Printed today at ${timeOf(printedAt[selected.id])}` : 'Not printed yet today',
          ok: true,
          warn: false
        }
      ]
    : [];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">GT</div>
          <div>
            <strong>ID Print Station</strong>
            <span>Good Tree International School · 2026–2027 cards</span>
          </div>
        </div>
        <ModeBadge mode={liveMode ? 'live' : 'sample'} portalHost={hostOf(portalSettings.baseUrl)} />
        <div className="topbar-spacer" />
        {lastPrint ? (
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              askBeforeDuplicate(
                { reprint: lastPrint },
                `Reprint ${lastPrint.name}’s ID?`,
                <p>
                  This prints the same card again, exactly as printed at {timeOf(lastPrint.at)}. Reprint only if that card was lost or
                  spoiled.
                </p>,
                'confirm-reprint'
              )
            }
            disabled={busy}
            title={`Print ${lastPrint.name}’s card again, exactly as printed at ${timeOf(lastPrint.at)}`}
          >
            <RotateCcw size={18} aria-hidden="true" />
            <span className="reprint-label">
              Reprint last: <strong>{lastPrint.shortLabel}</strong>
            </span>
          </button>
        ) : null}
        {liveMode && operatorSession ? (
          <div className="operator">
            <UserRound size={18} aria-hidden="true" />
            <span className="operator-name" title={operatorSession.name}>
              {operatorSession.name}
            </span>
            <button type="button" className="button ghost" onClick={handleOperatorLogout} disabled={busy}>
              <LogOut size={18} aria-hidden="true" /> Sign out
            </button>
          </div>
        ) : null}
      </header>

      <main className="workspace">
        <StudentList
          ref={searchRef}
          query={query}
          onQueryChange={(value) => {
            keepSelectionRef.current = false;
            setPendingAction(null);
            setQuery(value);
          }}
          students={students}
          selectedId={selected?.id || null}
          onSelect={selectStudent}
          onConfirm={() => {
            if (previewOnly) return;
            if (searchSettled) printButtonRef.current?.focus();
            else setPendingAction('focus-print');
          }}
          loading={loadingStudents}
          error={listError}
          hasMore={hasMoreStudents}
          onLoadMore={handleLoadMoreStudents}
          onRefresh={handleRefreshStudents}
          printedAt={printedAt}
          searchPending={!searchSettled}
          previewOnly={previewOnly}
        />

        <section className="zone editor-zone" aria-label="Card details">
          {selected && nameDraft && guardianDraft && idDraft ? (
            <>
              <header className="editor-head">
                {selected.photoUrl ? (
                  <img src={selected.photoUrl} alt={`Current photo of ${studentFullName(selected)}`} className="photo-current" />
                ) : (
                  <span className="photo-current is-empty" aria-hidden="true">
                    <UserRound size={28} />
                  </span>
                )}
                <div className="editor-title">
                  <h1 title={studentFullName(selected)}>{studentFullName(selected)}</h1>
                  <p>
                    {studentGradeLine(selected)} · No. {selected.admissionNo}
                  </p>
                  <div className="editor-row">
                  <button type="button" className="button secondary small" onClick={() => setCaptureOpen(true)} disabled={readOnly || busy}>
                    {selected.photoUrl ? <Camera size={16} aria-hidden="true" /> : <ImagePlus size={16} aria-hidden="true" />}
                    {selected.photoUrl ? 'Replace photo' : 'Add photo'}
                  </button>
                {dirty.any ? (
                  <span className="pill is-dirty">
                    <Pencil size={16} aria-hidden="true" /> Unsaved
                  </span>
                ) : blockers.length === 0 && fitWarnings.length ? (
                  <span className="pill is-dirty">
                    <AlertTriangle size={16} aria-hidden="true" /> Ready, check fit
                  </span>
                ) : blockers.length === 0 ? (
                  <span className="pill is-ok">
                    <CheckCircle2 size={16} aria-hidden="true" /> Ready
                  </span>
                ) : (
                  <span className="pill is-blocked">
                    <AlertCircle size={16} aria-hidden="true" /> {blockers.length} to fix
                  </span>
                )}
                  </div>
                </div>
              </header>
              {readOnly ? <p className="readonly-note">{READ_ONLY_MESSAGE} You can still choose what shows on the card.</p> : null}

              <div className="editor-scroll">
                <section className="editor-section" aria-labelledby="sec-name" onFocus={() => setPreviewSide('front')}>
                  <h2 id="sec-name">
                    Name on the card <small>front</small>
                  </h2>
                  <div className="field-pair names">
                    <Field
                      ref={bindRef('firstName')}
                      label="First name"
                      value={nameDraft.firstName}
                      onChange={(value) => setNameDraft({ ...nameDraft, firstName: value })}
                      issue={issues.firstName}
                      dirty={cleanValue(nameDraft.firstName) !== cleanValue(selected.firstName)}
                      disabled={readOnly}
                    />
                    <Field
                      ref={bindRef('lastName')}
                      label="Last name"
                      value={nameDraft.lastName}
                      onChange={(value) => setNameDraft({ ...nameDraft, lastName: value })}
                      issue={issues.lastName}
                      dirty={cleanValue(nameDraft.lastName) !== cleanValue(selected.lastName)}
                      disabled={readOnly}
                    />
                  </div>
                </section>

                <section className="editor-section" aria-labelledby="sec-contact" onFocus={() => setPreviewSide('back')}>
                  <h2 id="sec-contact">
                    Emergency contact <small>back</small>
                  </h2>
                  <div className="field-pair contact">
                    <Field
                      ref={bindRef('guardianName')}
                      label={`Name${guardianDraft.relation ? ` (${guardianDraft.relation})` : ''}`}
                      value={guardianDraft.name}
                      onChange={(value) => setGuardianDraft({ ...guardianDraft, name: value })}
                      issue={issues.guardianName}
                      dirty={cleanValue(guardianDraft.name) !== cleanValue(selected.guardian.name)}
                      disabled={readOnly}
                    />
                    <Field
                      ref={bindRef('guardianPhone')}
                      label="Phone"
                      type="tel"
                      inputMode="tel"
                      value={guardianDraft.phone}
                      onChange={(value) => setGuardianDraft({ ...guardianDraft, phone: value })}
                      issue={issues.guardianPhone}
                      dirty={cleanValue(guardianDraft.phone) !== cleanValue(selected.guardian.phone)}
                      disabled={readOnly}
                    />
                  </div>
                  <Field
                    ref={bindRef('guardianAddress')}
                    label="Address"
                    multiline
                    value={guardianDraft.address}
                    onChange={(value) => setGuardianDraft({ ...guardianDraft, address: value })}
                    issue={issues.guardianAddress}
                    dirty={cleanValue(guardianDraft.address) !== cleanValue(selected.guardian.address)}
                    disabled={readOnly}
                  />
                </section>

                <section className="editor-section" aria-labelledby="sec-ids" onFocus={() => setPreviewSide('front')}>
                  <h2 id="sec-ids">
                    ID numbers <small>front</small>
                  </h2>
                  <div className="field-pair">
                    <IdField
                      label="LRN"
                      value={idDraft.lrn}
                      onChange={handleLrnChange}
                      include={printFields.includeLrn}
                      onInclude={(includeLrn) => setPrintFields({ ...printFields, includeLrn })}
                      issue={issues.lrn}
                      dirty={cleanValue(idDraft.lrn) !== cleanValue(selected.lrn)}
                      disabled={readOnly}
                    />
                    <IdField
                      label="ESC"
                      value={idDraft.esc}
                      onChange={handleEscChange}
                      include={printFields.includeEsc}
                      onInclude={(includeEsc) => setPrintFields({ ...printFields, includeEsc })}
                      issue={issues.esc}
                      dirty={cleanValue(idDraft.esc) !== cleanValue(selected.esc)}
                      disabled={readOnly}
                    />
                  </div>
                </section>

                <section className="editor-section readiness" aria-labelledby="sec-ready">
                  <h2 id="sec-ready">{previewOnly ? 'Card checks' : 'Ready to print?'}</h2>
                  <ul className="readiness-list">
                    {checks.map((check) => (
                      <li key={check.key} className={check.ok ? (check.warn ? 'is-warn' : 'is-ok') : 'is-blocked'}>
                        {check.ok ? (
                          check.warn ? (
                            <AlertTriangle size={16} aria-hidden="true" />
                          ) : check.key === 'printed' && !printedAt[selected.id] ? (
                            <Circle size={16} aria-hidden="true" />
                          ) : (
                            <CheckCircle2 size={16} aria-hidden="true" />
                          )
                        ) : (
                          <AlertCircle size={16} aria-hidden="true" />
                        )}
                        <span>
                          {check.label}
                          <span className="sr-only">{check.ok ? (check.warn ? ': check' : ': OK') : ': needs fixing'}</span>
                        </span>
                        {!check.ok && check.fix ? (
                          <button type="button" className="button secondary small" onClick={check.fix}>
                            {check.fixLabel}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>

                {Object.keys(printedAt).length ? (
                  <section className="editor-section printed-log" aria-labelledby="sec-log">
                    <h2 id="sec-log">
                      Printed today <small>{Object.keys(printedAt).length}</small>
                    </h2>
                    <ol>
                      {Object.entries(printedAt)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([id, at]) => (
                          <li key={id}>
                            <span>{printedNameFor(id)}</span>
                            <time>{timeOf(at)}</time>
                          </li>
                        ))}
                    </ol>
                  </section>
                ) : null}
              </div>
            </>
          ) : (
            <div className="zone-empty">
              <UserRound size={32} aria-hidden="true" />
              <strong>{loadingStudents ? 'Loading students…' : 'No student chosen'}</strong>
              <span>Pick a student from the list to check their card.</span>
            </div>
          )}
        </section>

        <section className="zone preview-zone" aria-label="Card preview and printing">
          {previewStudent ? (
            <CardPreview
              title="This is how the card will look"
              subtitle="Updates as you type."
              student={previewStudent}
              qrDataUrl={qrDataUrl}
              onFit={handleFit}
              preferSide={previewPref.side}
              preferKey={previewPref.n}
              photoPlaceholder={!previewStudent.photoUrl}
            />
          ) : (
            <>
            <header className="preview-head">
              <h2>This is how the card will look</h2>
            </header>
            <div className="preview-stage">
              <div className="zone-empty">
                <Printer size={32} aria-hidden="true" />
                <strong>The card appears here</strong>
                <span>Choose a student to see the front and back.</span>
              </div>
            </div>
            </>
          )}

          <div className="print-panel">
            {previewOnly ? <p className="readonly-note">Printing and PDF export are unavailable in the Rust sample.</p> : null}
            <div className="print-actions">
              <div className="printer-picker">
                <button
                  ref={printerButtonRef}
                  type="button"
                  className="button secondary"
                  aria-expanded={printerOpen}
                  aria-controls="printer-popover"
                  aria-label={`Printer settings. Printer: ${printerLabel}${silentPrint ? ', without dialog' : ''}`}
                  title={`Printer: ${printerLabel}`}
                  onClick={() => setPrinterOpen((open) => !open)}
                  disabled={previewOnly}
                >
                  <Printer size={18} aria-hidden="true" />
                  <span className="printer-name">{printerLabel}</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
                {printerOpen ? (
                  <div id="printer-popover" ref={printerPopoverRef} className="popover" role="dialog" aria-label="Printer settings">
                    <label className="field">
                      <span className="field-label-row">
                        <span>Printer</span>
                      </span>
                      <select value={selectedPrinter} onChange={(event) => setSelectedPrinter(event.target.value)}>
                        <option value="">Windows print dialog (choose each time)</option>
                        {printers.map((printer) => (
                          <option key={printer.name} value={printer.name}>
                            {printer.displayName || printer.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {printers.length === 0 ? (
                      <p className="field-message is-warning">
                        <AlertTriangle size={15} aria-hidden="true" /> No printers found. Check the card printer is on and its driver is installed.
                      </p>
                    ) : null}
                    <label className="toggle-row">
                      <input type="checkbox" checked={silentPrint} onChange={(event) => setSilentPrint(event.target.checked)} />
                      <span>
                        Print without the Windows dialog
                        <small>Turn on only after test cards print correctly.</small>
                      </span>
                    </label>
                    <button type="button" className="button secondary" onClick={() => setPrinterOpen(false)}>
                      Done
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => void handleSavePdf()}
                disabled={previewOnly || !selected || busy || !qrDataUrl}
                aria-label="Save PDF"
                title="Save the card as a PDF"
              >
                <FileDown size={18} aria-hidden="true" /> <span className="btn-label-collapse">Save PDF</span>
              </button>
              <button
                ref={printButtonRef}
                type="button"
                className={`button xl ${printErrorShowing ? 'secondary' : 'primary'}`}
                onClick={() => void runPrintJob({})}
                disabled={!canPrint || busy}
                aria-keyshortcuts={previewOnly ? undefined : 'Control+P'}
                aria-describedby={stripMode !== 'flow' ? 'print-status' : undefined}
              >
                <Printer size={22} aria-hidden="true" /> Print ID
                {previewOnly ? null : <kbd className="on-primary">Ctrl+P</kbd>}
              </button>
            </div>

            {pendingUploads.length && flow.retry !== 'upload' ? (
              <div className="upload-notice" role="status" data-testid="upload-notice">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>
                  <strong>
                    {pendingUploads.length === 1
                      ? `${pendingUploads[0].name}’s archive copy isn’t in the portal yet.`
                      : `${pendingUploads.length} archive copies aren’t in the portal yet.`}
                  </strong>{' '}
                  The cards printed fine.
                </span>
                <button type="button" className="button secondary small" onClick={() => void retryUploads()} disabled={busy}>
                  <RotateCcw size={16} aria-hidden="true" /> Try again
                </button>
                <button type="button" className="button ghost small" onClick={() => setPendingUploads([])} disabled={busy}>
                  Dismiss
                </button>
              </div>
            ) : null}
            <StatusStrip
              compactSteps={stripFlow.tone !== 'working'}
              flow={stripFlow}
              retryDisabled={busy}
              retryPrimary={printErrorShowing}
              onRetry={flow.retry === 'upload' ? () => void retryUploads() : flow.retry === 'print' ? retryPrint : undefined}
              actions={
                stripMode === 'dirty' ? (
                  <>
                    <button type="button" className="button secondary" onClick={() => void handleSaveAll()} disabled={busy || readOnly} aria-keyshortcuts="Control+S">
                      <Save size={16} aria-hidden="true" /> Save <kbd>Ctrl+S</kbd>
                    </button>
                    <button type="button" className="button ghost" onClick={discardDrafts} disabled={busy}>
                      <Undo2 size={16} aria-hidden="true" /> Discard
                    </button>
                  </>
                ) : undefined
              }
            >
              {stripMode === 'blocked' && fitWarnings.length ? (
                <p className="fit-note">
                  <AlertTriangle size={15} aria-hidden="true" /> Also check: {fitWarnings.map((key) => fitLabels[key]).join(', ')} won’t fit well.
                </p>
              ) : stripMode === 'flow' && fitWarnings.length && selected && (flow.tone === 'neutral' || flow.tone === 'success') ? (
                <p className="fit-note">
                  <AlertTriangle size={15} aria-hidden="true" /> Check before printing: {fitWarnings.map((key) => fitLabels[key]).join(', ')} won’t fit well.
                </p>
              ) : null}
            </StatusStrip>
          </div>
        </section>
      </main>

      {captureOpen && selected ? (
        <PhotoEditor
          student={previewStudent || selected}
          qrDataUrl={qrDataUrl}
          portalBaseUrl={portalSettings.baseUrl}
          saving={busy}
          saveError={photoError}
          onApprove={(photo) => void handleApprovePhoto(photo)}
          onClose={() => {
            setCaptureOpen(false);
            setPhotoError('');
          }}
        />
      ) : null}

      {pendingSwitch && selected ? (
        <ConfirmDialog
          title={`Save changes to ${studentFullName(selected)}?`}
          onCancel={() => void resolveSwitch('stay')}
          testId="confirm-switch"
          actions={[
            {
              label: (
                <>
                  <Save size={18} aria-hidden="true" /> Save and switch
                </>
              ),
              kind: 'primary',
              onClick: () => void resolveSwitch('save'),
              disabled: busy || readOnly
            },
            { label: 'Discard changes', kind: 'secondary', onClick: () => void resolveSwitch('discard'), disabled: busy },
            { label: 'Stay here', kind: 'ghost', onClick: () => void resolveSwitch('stay'), disabled: busy }
          ]}
        >
          <p>You edited this student’s card details. Save them before opening {studentFullName(pendingSwitch)}, or discard them.</p>
        </ConfirmDialog>
      ) : null}

      {confirm ? (
        <ConfirmDialog title={confirm.title} onCancel={() => setConfirm(null)} actions={confirm.actions} testId={confirm.testId}>
          {confirm.body}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function IdField({
  label,
  value,
  onChange,
  include,
  onInclude,
  issue,
  dirty,
  disabled
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  include: boolean;
  onInclude: (include: boolean) => void;
  issue?: FieldIssue;
  dirty: boolean;
  disabled: boolean;
}) {
  return (
    <Field
      label={label}
      value={value}
      onChange={onChange}
      issue={issue}
      dirty={dirty}
      disabled={disabled}
      inputMode="numeric"
      labelAside={
        <label className="inline-toggle" title="Only affects this print. The saved number is kept.">
          <input type="checkbox" checked={include} disabled={!value.trim()} onChange={(event) => onInclude(event.target.checked)} />
          <span className="label-long">Show on card</span>
          <span className="label-short">Show</span>
        </label>
      }
    />
  );
}
