import {
  Camera,
  CheckCircle2,
  FileDown,
  ImagePlus,
  LogIn,
  LogOut,
  Printer,
  RefreshCw,
  Save,
  Search,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, FormEvent } from 'react';
import type {
  DeviceStatus,
  GuardianContact,
  OperatorSession,
  PortalSettings,
  PrinterInfo,
  StudentIdDetails,
  StudentNameDetails,
  StudentRecord
} from './types';
import { publicAssetToDataUrl } from './lib/assets';
import {
  emergencyAddressFontPx,
  emergencyNameFontPx,
  emergencyPhoneFontPx,
  frontFirstNameFontPx,
  frontGradeFontPx,
  frontLastNameFontPx
} from './lib/cardText';
import { loadOptionalIdCardFont, optionalIdCardFontFaceCss } from './lib/fonts';
import { cardLayers } from './lib/layout';
import { renderArchiveHtml, renderPrintHtml } from './lib/printHtml';
import { makeAdmissionQr } from './lib/qr';
import {
  readinessFor,
  studentFirstNameLine,
  studentFullName,
  studentGradeLine,
  studentIdentifierLines,
  studentLastNameLine
} from './lib/student';
import {
  bridgeErrorMessage,
  clearOperatorSession,
  hasPortalConfig,
  hasValidOperatorSession,
  SAMPLE_PORTAL_SETTINGS,
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

const FRONT_TEMPLATE = 'templates/2026-2027/front.clean-2026.svg';
const BACK_TEMPLATE = 'templates/2026-2027/back.canva.svg';
const STUDENT_PAGE_LIMIT = 20;

interface PrintFieldOptions {
  includeLrn: boolean;
  includeEsc: boolean;
}

function previewLastNameStyle(lastName: string): CSSProperties {
  return {
    ...cardLayers.lastName,
    fontSize: `${frontLastNameFontPx(lastName)}px`
  };
}

function previewFirstNameStyle(firstName: string): CSSProperties {
  return {
    ...cardLayers.firstName,
    fontSize: `${frontFirstNameFontPx(firstName)}px`
  };
}

function previewGradeStyle(grade: string): CSSProperties {
  return {
    ...cardLayers.grade,
    fontSize: `${frontGradeFontPx(grade)}px`
  };
}

function previewEmergencyNameStyle(name: string): CSSProperties {
  return { fontSize: `${emergencyNameFontPx(name)}px` };
}

function previewEmergencyAddressStyle(address: string): CSSProperties {
  return { fontSize: `${emergencyAddressFontPx(address)}px` };
}

function previewEmergencyPhoneStyle(phone: string): CSSProperties {
  return { fontSize: `${emergencyPhoneFontPx(phone)}px` };
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

export default function App() {
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [selected, setSelected] = useState<StudentRecord | null>(null);
  const [studentPage, setStudentPage] = useState(1);
  const [hasMoreStudents, setHasMoreStudents] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [nameDraft, setNameDraft] = useState<StudentNameDetails | null>(null);
  const [guardianDraft, setGuardianDraft] = useState<GuardianContact | null>(null);
  const [idDraft, setIdDraft] = useState<StudentIdDetails | null>(null);
  const [printFields, setPrintFields] = useState<PrintFieldOptions>({ includeLrn: true, includeEsc: true });
  const [captureOpen, setCaptureOpen] = useState(false);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [silentPrint, setSilentPrint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [portalSettings, setPortalSettings] = useState<PortalSettings>(SAMPLE_PORTAL_SETTINGS);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [deviceChecked, setDeviceChecked] = useState(false);
  const [deviceSetupOpen, setDeviceSetupOpen] = useState(false);
  const [operatorSession, setOperatorSession] = useState<OperatorSession | null>(() => loadOperatorSession());
  const [loginDraft, setLoginDraft] = useState({ username: '', password: '' });
  const [loginBusy, setLoginBusy] = useState(false);
  const [status, setStatus] = useState('Checking device setup...');
  const liveMode = hasPortalConfig(portalSettings);
  const operatorReady = deviceChecked && (!liveMode || hasValidOperatorSession(operatorSession));
  const operatorCanUseStation = !liveMode || operatorSession?.permissions?.canView !== false;
  const operatorCanEditPortal = !liveMode || operatorSession?.permissions?.canEdit !== false;

  useEffect(() => {
    void loadOptionalIdCardFont();
    void refreshDeviceStatus();
  }, []);

  async function refreshDeviceStatus() {
    const bridge = window.gtPrint;
    let nextStatus: DeviceStatus | null = null;
    if (bridge?.device && bridge.portal) {
      try {
        nextStatus = await bridge.device.status();
      } catch {
        nextStatus = null;
      }
    }
    setDeviceStatus(nextStatus);
    setPortalSettings(
      nextStatus?.configured ? { baseUrl: nextStatus.portalUrl, live: true } : SAMPLE_PORTAL_SETTINGS
    );
    setDeviceChecked(true);
  }

  function handleDeviceChanged(nextStatus: DeviceStatus, message: string) {
    // A different device setup means a different portal session.
    clearOperatorSession();
    setOperatorSession(null);
    setDeviceStatus(nextStatus);
    setPortalSettings(nextStatus.configured ? { baseUrl: nextStatus.portalUrl, live: true } : SAMPLE_PORTAL_SETTINGS);
    setRefreshCount((value) => value + 1);
    setStatus(message);
  }

  useEffect(() => {
    if (!operatorReady) {
      setStudents([]);
      setSelected(null);
      setStatus('Sign in with your portal account.');
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

  async function loadStudents(page: number, replace: boolean, isCanceled = () => false) {
    setLoadingStudents(true);
    try {
      const result = await searchStudents(query, {
        page,
        limit: STUDENT_PAGE_LIMIT,
        settings: portalSettings,
        operatorToken: operatorSession?.token
      });

      if (isCanceled()) {
        return;
      }

      setStudentPage(result.page);
      setHasMoreStudents(result.hasMore);
      setStudents((current) => {
        const next = replace ? result.students : mergeStudents(current, result.students);
        setSelected((selectedStudent) => {
          if (selectedStudent && next.some((student) => student.id === selectedStudent.id)) {
            return selectedStudent;
          }
          return next[0] || null;
        });
        return next;
      });
      setStatus(result.message || (result.source === 'portal' ? 'Student records loaded.' : 'Sample data loaded for local testing.'));
    } catch (error) {
      if (!isCanceled()) {
        setStatus(error instanceof Error ? error.message : 'Could not load students.');
      }
    } finally {
      if (!isCanceled()) {
        setLoadingStudents(false);
      }
    }
  }

  useEffect(() => {
    if (!selected) {
      setQrDataUrl('');
      setNameDraft(null);
      setGuardianDraft(null);
      setIdDraft(null);
      return;
    }

    setNameDraft({ firstName: selected.firstName || '', lastName: selected.lastName || '' });
    setGuardianDraft(selected.guardian);
    setIdDraft({ lrn: selected.lrn || '', esc: selected.esc || '' });
    setPrintFields({ includeLrn: Boolean(selected.lrn), includeEsc: Boolean(selected.esc) });
    makeAdmissionQr(selected.admissionNo).then(setQrDataUrl).catch(() => {
      setQrDataUrl('');
      setStatus('QR generation failed.');
    });
  }, [selected?.id]);

  useEffect(() => {
    if (!window.gtPrint) {
      return;
    }

    window.gtPrint.listPrinters().then((availablePrinters) => {
      setPrinters(availablePrinters);
      const preferred =
        availablePrinters.find((printer) => /smart|idp|card/i.test(printer.name)) ||
        availablePrinters.find((printer) => printer.isDefault) ||
        availablePrinters[0];
      if (preferred) {
        setSelectedPrinter(preferred.name);
      }
    });
  }, []);

  const readiness = useMemo(() => {
    return selected ? readinessFor(selected, Boolean(qrDataUrl)) : null;
  }, [selected, qrDataUrl]);

  const previewStudent = useMemo(() => {
    return selected ? printableStudent(selected, nameDraft, guardianDraft, idDraft, printFields) : null;
  }, [selected, nameDraft, guardianDraft, idDraft, printFields]);

  const canPrint = Boolean(
    selected &&
      qrDataUrl &&
      operatorCanUseStation &&
      readiness?.enrolled &&
      readiness.photo &&
      readiness.guardian &&
      readiness.qr &&
      readiness.cr80
  );

  function applyUpdatedStudent(updated: StudentRecord) {
    setStudents((current) => replaceStudent(current, updated));
    setSelected(updated);
    return updated;
  }

  function hasDirtyNameDraft(student: StudentRecord) {
    return Boolean(
      nameDraft &&
        (cleanValue(nameDraft.firstName) !== cleanValue(student.firstName) ||
          cleanValue(nameDraft.lastName) !== cleanValue(student.lastName))
    );
  }

  function hasDirtyGuardianDraft(student: StudentRecord) {
    return Boolean(
      guardianDraft &&
        (cleanValue(guardianDraft.name) !== cleanValue(student.guardian.name) ||
          cleanValue(guardianDraft.relation) !== cleanValue(student.guardian.relation) ||
          cleanValue(guardianDraft.address) !== cleanValue(student.guardian.address) ||
          cleanValue(guardianDraft.phone) !== cleanValue(student.guardian.phone))
    );
  }

  function hasDirtyIdDraft(student: StudentRecord) {
    return Boolean(
      idDraft &&
        (cleanValue(idDraft.lrn) !== cleanValue(student.lrn) ||
          cleanValue(idDraft.esc) !== cleanValue(student.esc))
    );
  }

  function hasDirtyEditableDrafts(student: StudentRecord) {
    return hasDirtyNameDraft(student) || hasDirtyGuardianDraft(student) || hasDirtyIdDraft(student);
  }

  async function saveNameDraftToPortal(baseStudent: StudentRecord, quiet = false) {
    if (!nameDraft) {
      return baseStudent;
    }

    if (!operatorCanEditPortal) {
      throw new Error('This account can print IDs but cannot update portal records.');
    }

    const nextName = {
      firstName: cleanValue(nameDraft.firstName),
      lastName: cleanValue(nameDraft.lastName)
    };

    if (!nextName.firstName || !nextName.lastName) {
      throw new Error('First name and last name are required before printing.');
    }

    const updated = await updateStudentName(baseStudent.id, nextName, portalSettings, operatorSession?.token);
    setNameDraft({ firstName: updated.firstName, lastName: updated.lastName });
    applyUpdatedStudent(updated);
    if (!quiet) {
      setStatus(hasPortalConfig(portalSettings) ? 'Student name saved.' : 'Student name saved in sample data.');
    }
    return updated;
  }

  async function saveGuardianDraftToPortal(baseStudent: StudentRecord, quiet = false) {
    if (!guardianDraft) {
      return baseStudent;
    }

    if (!operatorCanEditPortal) {
      throw new Error('This account can print IDs but cannot update portal records.');
    }

    const nextGuardian = {
      name: cleanValue(guardianDraft.name),
      relation: cleanValue(guardianDraft.relation),
      address: cleanValue(guardianDraft.address),
      phone: cleanValue(guardianDraft.phone)
    };
    const updated = await updateGuardian(baseStudent.id, nextGuardian, portalSettings, operatorSession?.token);
    setGuardianDraft(updated.guardian);
    applyUpdatedStudent(updated);
    if (!quiet) {
      setStatus(hasPortalConfig(portalSettings) ? 'Guardian contact saved.' : 'Guardian contact saved in sample data.');
    }
    return updated;
  }

  async function saveIdDraftToPortal(baseStudent: StudentRecord, quiet = false) {
    if (!idDraft) {
      return baseStudent;
    }

    if (!operatorCanEditPortal) {
      throw new Error('This account can print IDs but cannot update portal records.');
    }

    const nextDetails = {
      lrn: cleanValue(idDraft.lrn),
      esc: cleanValue(idDraft.esc)
    };
    const updated = await updateIdDetails(baseStudent.id, nextDetails, portalSettings, operatorSession?.token);
    setIdDraft({ lrn: updated.lrn || '', esc: updated.esc || '' });
    setPrintFields((current) => ({
      includeLrn: nextDetails.lrn ? current.includeLrn : false,
      includeEsc: nextDetails.esc ? current.includeEsc : false
    }));
    applyUpdatedStudent(updated);
    if (!quiet) {
      setStatus(hasPortalConfig(portalSettings) ? 'Student identifiers saved.' : 'Student identifiers saved in sample data.');
    }
    return updated;
  }

  async function syncEditableDraftsBeforePrint() {
    if (!selected) {
      throw new Error('Select a student before printing.');
    }

    if (hasDirtyEditableDrafts(selected) && !operatorCanEditPortal) {
      throw new Error('Save or discard edited fields before printing. This account cannot update portal records.');
    }

    let current = selected;
    if (hasDirtyNameDraft(current)) {
      current = await saveNameDraftToPortal(current, true);
    }
    if (hasDirtyGuardianDraft(current)) {
      current = await saveGuardianDraftToPortal(current, true);
    }
    if (hasDirtyIdDraft(current)) {
      current = await saveIdDraftToPortal(current, true);
    }
    return current;
  }

  async function buildCardDocuments(studentOverride?: StudentRecord | null) {
    const studentToRender = studentOverride
      ? printableStudent(studentOverride, nameDraft, guardianDraft, idDraft, printFields)
      : previewStudent;

    if (!studentToRender || !qrDataUrl) {
      throw new Error('Select a student before printing.');
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
      // Printer copy: back rotated 180 degrees for the card flip.
      printHtml: renderPrintHtml(studentForPrint, qrDataUrl, assets),
      // Portal Documents copy: both sides upright.
      archiveHtml: renderArchiveHtml(studentForPrint, qrDataUrl, assets)
    };
  }

  async function handleSaveName() {
    if (!selected || !nameDraft) {
      return;
    }

    if (!operatorCanEditPortal) {
      setStatus('This account can print IDs but cannot update portal records.');
      return;
    }

    setBusy(true);
    try {
      await saveNameDraftToPortal(selected);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save student name.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveGuardian() {
    if (!selected || !guardianDraft) {
      return;
    }

    if (!operatorCanEditPortal) {
      setStatus('This account can print IDs but cannot update portal records.');
      return;
    }

    setBusy(true);
    try {
      await saveGuardianDraftToPortal(selected);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save guardian contact.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveIdDetails() {
    if (!selected || !idDraft) {
      return;
    }

    if (!operatorCanEditPortal) {
      setStatus('This account can print IDs but cannot update portal records.');
      return;
    }

    setBusy(true);
    try {
      await saveIdDraftToPortal(selected);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save student identifiers.');
    } finally {
      setBusy(false);
    }
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
    if (!selected) {
      return;
    }

    if (!operatorCanEditPortal) {
      setStatus('This account can print IDs but cannot update portal records.');
      return;
    }

    setBusy(true);
    try {
      const updated = await updatePhoto(selected.id, photoDataUrl, portalSettings, operatorSession?.token);
      setStudents((current) => replaceStudent(current, updated));
      setSelected(updated);
      setCaptureOpen(false);
      setStatus(hasPortalConfig(portalSettings) ? 'Approved photo saved.' : 'Approved photo saved in sample data.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not update student photo.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint() {
    if (liveMode && !hasValidOperatorSession(operatorSession)) {
      setStatus('Sign in before printing.');
      return;
    }

    setBusy(true);
    try {
      setStatus('Checking edited fields...');
      const syncedStudent = await syncEditableDraftsBeforePrint();
      const { printHtml: html, archiveHtml } = await buildCardDocuments(syncedStudent);
      if (window.gtPrint) {
        setStatus(silentPrint ? 'Sending print job...' : 'Opening Windows print dialog...');
        const result = await window.gtPrint.printCard(html, {
          deviceName: selectedPrinter || undefined,
          silent: silentPrint
        });
        if (result.ok) {
          const printerName = result.printerName || selectedPrinter || 'selected printer';
          const printStatus = result.mode === 'dialog' ? `Print dialog completed for ${printerName}.` : `Print job sent to ${printerName}.`;
          if (hasPortalConfig(portalSettings)) {
            try {
              if (!window.gtPrint.captureCardPngs) {
                throw new Error('This app version cannot capture the printed ID for upload.');
              }
              setStatus(`${printStatus} Uploading ID front/back to Documents...`);
              const images = await window.gtPrint.captureCardPngs(archiveHtml);
              await uploadIdCardDocuments(
                syncedStudent.id,
                { front: images.front, back: images.back },
                portalSettings,
                operatorSession?.token
              );
              setStatus(`${printStatus} ID front/back uploaded to student Documents.`);
            } catch (uploadError) {
              const message = uploadError instanceof Error ? uploadError.message : 'Document upload failed.';
              setStatus(`${printStatus} Document upload failed: ${message}`);
            }
          } else {
            setStatus(printStatus);
          }
        } else {
          setStatus(result.error || 'Print failed.');
        }
      } else {
        const printWindow = window.open('', '_blank', 'width=720,height=960');
        if (!printWindow) {
          throw new Error('Popup blocked. Use Electron or allow popups for browser fallback.');
        }
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 350);
        setStatus('Opened browser print dialog.');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not print card.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePdf() {
    if (liveMode && !hasValidOperatorSession(operatorSession)) {
      setStatus('Sign in before saving.');
      return;
    }

    setBusy(true);
    try {
      const { printHtml: html } = await buildCardDocuments();
      if (!window.gtPrint) {
        throw new Error('Save PDF is available in the desktop app.');
      }
      const result = await window.gtPrint.saveCardPdf(html);
      if (result.ok) {
        setStatus(`Saved PDF: ${result.filePath}`);
      } else if (result.canceled) {
        setStatus('Save PDF canceled.');
      } else {
        setStatus(result.error || 'Could not save PDF.');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save PDF.');
    } finally {
      setBusy(false);
    }
  }

  function handleRefreshStudents() {
    void refreshDeviceStatus();
    setStudentPage(1);
    setRefreshCount((value) => value + 1);
    setStatus('Refreshing students...');
  }

  function handleLoadMoreStudents() {
    if (!loadingStudents && hasMoreStudents) {
      loadStudents(studentPage + 1, false);
    }
  }

  async function handleOperatorLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginBusy(true);
    setStatus('Signing in...');
    try {
      const session = await loginOperator(portalSettings, loginDraft);
      saveOperatorSession(session);
      setOperatorSession(session);
      setLoginDraft({ username: '', password: '' });
      setRefreshCount((value) => value + 1);
      setStatus(`Signed in as ${session.name}.`);
    } catch (error) {
      clearOperatorSession();
      setOperatorSession(null);
      setStatus(error instanceof Error ? error.message : 'Could not sign in.');
    } finally {
      setLoginBusy(false);
    }
  }

  function handleOperatorLogout() {
    clearOperatorSession();
    setOperatorSession(null);
    setStudents([]);
    setSelected(null);
    setStatus('Signed out.');
  }

  if (!deviceChecked) {
    return (
      <main className="login-shell">
        <div className="status-line">{status}</div>
      </main>
    );
  }

  if (!operatorReady) {
    return (
      <main className="login-shell">
        <form className="login-card" onSubmit={handleOperatorLogin}>
          <div className="brand-lockup">
            <div className="brand-mark">GT</div>
            <div>
              <strong>GTIS ID Print Station</strong>
              <span>Sign in to continue</span>
            </div>
          </div>
          <Field
            label="Portal Email"
            value={loginDraft.username}
            onChange={(username) => setLoginDraft({ ...loginDraft, username })}
          />
          <Field
            label="Password"
            type="password"
            value={loginDraft.password}
            onChange={(password) => setLoginDraft({ ...loginDraft, password })}
          />
          <button className="button primary wide" disabled={loginBusy}>
            <LogIn size={17} /> {loginBusy ? 'Signing in...' : 'Sign In'}
          </button>
          <div className="status-line">{status}</div>
          <DeviceSetupPanel status={deviceStatus} onChanged={handleDeviceChanged} />
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="search-rail">
        <div className="brand-lockup">
          <div className="brand-mark">GT</div>
          <div>
            <strong>GTIS ID Print Station</strong>
            <span>2026-2027 ISO CR80</span>
          </div>
        </div>

        <label className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or admission no."
          />
        </label>
        <div className="search-meta">
          <span className="student-count">{students.length ? `${students.length} student${students.length === 1 ? '' : 's'}` : 'No students'}</span>
          <button className="icon-text-button" onClick={handleRefreshStudents} disabled={loadingStudents}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>

        <div className="student-list">
          {students.map((student) => (
            <button
              key={student.id}
              className={`student-row ${selected?.id === student.id ? 'is-active' : ''}`}
              onClick={() => setSelected(student)}
            >
              <img
                src={student.photoUrl || ''}
                alt=""
                className={`student-thumb ${student.photoUrl ? '' : 'is-empty'}`}
              />
              <span>
                <strong>{studentFullName(student)}</strong>
                <small>
                  {student.admissionNo} - {studentGradeLine(student)}
                </small>
              </span>
            </button>
          ))}
          {loadingStudents ? <div className="student-list-note">Loading students...</div> : null}
          {!loadingStudents && students.length === 0 ? <div className="student-list-note">No students found.</div> : null}
          {!loadingStudents && hasMoreStudents ? (
            <button className="button secondary wide" onClick={handleLoadMoreStudents}>
              Load More
            </button>
          ) : null}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Student ID Printing</h1>
            <p>
              {selected ? `${studentFullName(selected)} - ${selected.admissionNo}` : 'Select a student.'}
              {liveMode && operatorSession ? ` - Signed in: ${operatorSession.name}` : ''}
            </p>
            {!liveMode ? (
              <p>
                <strong>Sample mode</strong> - not connected to the portal. Changes stay on this computer.{' '}
                {deviceStatus?.message ? `${deviceStatus.message} ` : ''}
                {deviceStatus ? (
                  <button type="button" className="icon-text-button" onClick={() => setDeviceSetupOpen((open) => !open)}>
                    {deviceSetupOpen ? 'Hide device setup' : 'Device setup'}
                  </button>
                ) : null}
              </p>
            ) : null}

          </div>
          <div className="topbar-actions">
            {liveMode ? (
              <button className="button secondary" onClick={handleOperatorLogout} disabled={busy}>
                <LogOut size={17} /> Sign Out
              </button>
            ) : null}
            <button className="button secondary" onClick={handleSavePdf} disabled={!selected || busy}>
              <FileDown size={17} /> Save PDF
            </button>
            <button className="button primary" onClick={handlePrint} disabled={!canPrint || busy}>
              <Printer size={17} /> Print ID
            </button>
          </div>
        </header>

        <div className="content-grid">
          <section className="preview-panel">
            {previewStudent && qrDataUrl ? (
              <CardPreview
                student={previewStudent}
                qrDataUrl={qrDataUrl}
              />
            ) : (
              <div className="empty-state">Select a student to preview the ID card.</div>
            )}
          </section>

          <aside className="control-panel">
            {!liveMode && deviceSetupOpen ? (
              <section className="panel-section">
                <DeviceSetupPanel status={deviceStatus} onChanged={handleDeviceChanged} />
              </section>
            ) : null}
            {selected && readiness && nameDraft && guardianDraft && idDraft ? (
              <>
                <section className="panel-section">
                  <h2>Readiness</h2>
                  <CheckList
                    items={[
                      ['Current enrollment', readiness.enrolled],
                      ['Photo approved', readiness.photo],
                      ['Emergency contact', readiness.guardian],
                      ['Admission QR', readiness.qr],
                      ['ISO CR80 output', readiness.cr80]
                    ]}
                  />
                </section>

                <section className="panel-section">
                  <h2>Photo</h2>
                  <div className="photo-row">
                    <img
                      src={selected.photoUrl || ''}
                      alt=""
                      className={`photo-current ${selected.photoUrl ? '' : 'is-empty'}`}
                    />
                    <button className="button secondary" onClick={() => setCaptureOpen(true)} disabled={!operatorCanEditPortal}>
                      <Camera size={17} /> Capture Photo
                    </button>
                  </div>
                </section>

                <section className="panel-section">
                  <h2>Student Name</h2>
                  <Field
                    label="First Name"
                    value={nameDraft.firstName}
                    onChange={(value) => setNameDraft({ ...nameDraft, firstName: value })}
                  />
                  <Field
                    label="Last Name"
                    value={nameDraft.lastName}
                    onChange={(value) => setNameDraft({ ...nameDraft, lastName: value })}
                  />
                  <button className="button secondary wide" onClick={handleSaveName} disabled={busy || !operatorCanEditPortal}>
                    <Save size={17} /> Save Student Name
                  </button>
                </section>

                <section className="panel-section">
                  <h2>Guardian Contact</h2>
                  <Field
                    label="Name"
                    value={guardianDraft.name}
                    onChange={(value) => setGuardianDraft({ ...guardianDraft, name: value })}
                  />
                  <Field
                    label="Address"
                    multiline
                    value={guardianDraft.address}
                    onChange={(value) => setGuardianDraft({ ...guardianDraft, address: value })}
                  />
                  <Field
                    label="Phone"
                    value={guardianDraft.phone}
                    onChange={(value) => setGuardianDraft({ ...guardianDraft, phone: value })}
                  />
                  <button className="button secondary wide" onClick={handleSaveGuardian} disabled={busy || !operatorCanEditPortal}>
                    <Save size={17} /> Save Guardian Contact
                  </button>
                </section>

                <section className="panel-section">
                  <h2>Student Identifiers</h2>
                  <Field
                    label="LRN"
                    value={idDraft.lrn}
                    onChange={handleLrnChange}
                  />
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={printFields.includeLrn}
                      disabled={!idDraft.lrn.trim()}
                      onChange={(event) => setPrintFields({ ...printFields, includeLrn: event.target.checked })}
                    />
                    <span>Print LRN</span>
                  </label>
                  <Field
                    label="ESC"
                    value={idDraft.esc}
                    onChange={handleEscChange}
                  />
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={printFields.includeEsc}
                      disabled={!idDraft.esc.trim()}
                      onChange={(event) => setPrintFields({ ...printFields, includeEsc: event.target.checked })}
                    />
                    <span>Print ESC</span>
                  </label>
                  <button className="button secondary wide" onClick={handleSaveIdDetails} disabled={busy || !operatorCanEditPortal}>
                    <Save size={17} /> Save Student Identifiers
                  </button>
                </section>

                <section className="panel-section">
                  <h2>Printer</h2>
                  <label className="field">
                    <span>Device</span>
                    <select value={selectedPrinter} onChange={(event) => setSelectedPrinter(event.target.value)}>
                      <option value="">System print dialog</option>
                      {printers.map((printer) => (
                        <option key={printer.name} value={printer.name}>
                          {printer.displayName || printer.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={silentPrint}
                      onChange={(event) => setSilentPrint(event.target.checked)}
                    />
                    <span>Silent print on Windows NUC</span>
                  </label>
                </section>
              </>
            ) : null}

            <div className="status-line">{busy ? 'Working...' : status}</div>
          </aside>
        </div>
      </section>

      {captureOpen && selected ? (
        <CaptureModal
          student={previewStudent || selected}
          qrDataUrl={qrDataUrl}
          portalBaseUrl={portalSettings.baseUrl}
          onApprove={handleApprovePhoto}
          onClose={() => setCaptureOpen(false)}
        />
      ) : null}
    </main>
  );
}

function CheckList({ items }: { items: Array<[string, boolean]> }) {
  return (
    <ul className="check-list">
      {items.map(([label, ok]) => (
        <li key={label} className={ok ? 'ok' : 'needs-work'}>
          <CheckCircle2 size={16} />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Plain one-time device setup. The token goes straight to the main process,
 * is encrypted there, and nothing derived from it is ever shown again.
 */
function DeviceSetupPanel({
  status,
  onChanged
}: {
  status: DeviceStatus | null;
  onChanged: (status: DeviceStatus, message: string) => void;
}) {
  const [portalUrl, setPortalUrl] = useState(status?.portalUrl || 'https://portal.gtis.edu.ph');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const device = window.gtPrint?.device;

  if (!device || !status) {
    return null;
  }

  let portalHost = status.portalUrl;
  try {
    portalHost = new URL(status.portalUrl).host;
  } catch {
    // Show the stored value as-is.
  }

  async function handleSave() {
    if (!device) {
      return;
    }
    setBusy(true);
    setMessage('Checking the token with the portal...');
    try {
      const result = await device.configure({ portalUrl, token });
      setToken('');
      if (result.check === 'rejected') {
        setMessage('The portal rejected this device token. Nothing was saved.');
        return;
      }
      if (result.check !== 'accepted') {
        setMessage('The portal could not confirm the token (check the internet connection). Nothing was saved; try again.');
        return;
      }
      const text = 'Device set up. The portal accepted the token.';
      setMessage(text);
      onChanged(result, text);
    } catch (error) {
      setMessage(bridgeErrorMessage(error, 'Device setup failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    if (!device || !window.confirm('Remove the saved device token from this computer? The station returns to sample mode.')) {
      return;
    }
    setBusy(true);
    try {
      const next = await device.clear();
      setMessage('Device token removed.');
      onChanged(next, 'Device token removed. Sample mode.');
    } catch (error) {
      setMessage(bridgeErrorMessage(error, 'Could not remove the device token.'));
    } finally {
      setBusy(false);
    }
  }

  if (status.configured) {
    return (
      <div className="device-setup">
        <p>Portal: {portalHost}</p>
        <button type="button" className="icon-text-button" onClick={handleClear} disabled={busy}>
          Reset device setup
        </button>
        {message ? <p>{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="device-setup">
      <h2>Device setup</h2>
      <p>For school IT: enter the portal address and this station's device token once. It is stored encrypted on this computer.</p>
      {status.message ? <p>{status.message}</p> : null}
      {!status.encryptionAvailable ? (
        <p>This computer cannot encrypt the token, so it cannot be saved here.</p>
      ) : null}
      <Field label="Portal address" value={portalUrl} onChange={setPortalUrl} />
      <Field label="Device token" type="password" value={token} onChange={setToken} />
      <button
        type="button"
        className="button secondary"
        onClick={handleSave}
        disabled={busy || !status.encryptionAvailable || !portalUrl.trim() || !token.trim()}
      >
        {busy ? 'Checking...' : 'Save device setup'}
      </button>
      {message ? <p>{message}</p> : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  multiline = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  multiline?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} rows={3} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function CardPreview({ student, qrDataUrl }: { student: StudentRecord; qrDataUrl: string }) {
  const idLines = studentIdentifierLines(student);
  const lastName = studentLastNameLine(student);
  const firstName = studentFirstNameLine(student);
  const gradeLine = studentGradeLine(student);

  return (
    <div className="cards-wrap">
      <div className="card-shell">
        <CardPage background={FRONT_TEMPLATE}>
          {student.photoUrl ? <img className="layer photo-layer" src={student.photoUrl} style={cardLayers.photo} /> : null}
          <img className="layer qr-layer" src={qrDataUrl} style={cardLayers.qr} />
          <div className="layer last-name-layer" style={previewLastNameStyle(lastName)}>
            {lastName}
          </div>
          <div className="layer first-name-layer" style={previewFirstNameStyle(firstName)}>
            {firstName}
          </div>
          <div className="layer grade-layer" style={previewGradeStyle(gradeLine)}>
            {gradeLine}
          </div>
          {idLines.length ? (
            <div className="layer ids-layer" style={cardLayers.ids}>
              {idLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          ) : null}
        </CardPage>
        <span>Front</span>
      </div>

      <div className="card-shell">
        <CardPage background={BACK_TEMPLATE} rotated>
          <div className="layer emergency-layer" style={cardLayers.emergency}>
            <strong style={previewEmergencyNameStyle(student.guardian.name)}>{student.guardian.name}</strong>
            <span style={previewEmergencyAddressStyle(student.guardian.address)}>{student.guardian.address}</span>
            <b style={previewEmergencyPhoneStyle(student.guardian.phone)}>{student.guardian.phone}</b>
          </div>
        </CardPage>
        <span>Back</span>
      </div>
    </div>
  );
}

function CardPage({ background, children, rotated = false }: { background: string; children: React.ReactNode; rotated?: boolean }) {
  return (
    <div className="card-page">
      <div className={`card-content${rotated ? ' card-content-rotated' : ''}`}>
        <img src={background} className="card-bg" alt="" />
        {children}
      </div>
    </div>
  );
}

const PHOTO_OUTPUT_WIDTH = 860;
const PHOTO_OUTPUT_HEIGHT = 996;
const PHOTO_EDITOR_FRAME_WIDTH = 320;
const PHOTO_EDITOR_FRAME_HEIGHT = 370;

function CaptureModal({
  student,
  qrDataUrl,
  portalBaseUrl,
  onApprove,
  onClose
}: {
  student: StudentRecord;
  qrDataUrl: string;
  portalBaseUrl: string;
  onApprove: (photoDataUrl: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [rawCapture, setRawCapture] = useState('');
  const [editedPreview, setEditedPreview] = useState('');
  const [editorBusy, setEditorBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [brightness, setBrightness] = useState(100);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      ?.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setCameraReady(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        setCameraReady(false);
        setError('Camera is unavailable. Choose Photo still works.');
      });

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

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
          if (!canceled) {
            setEditedPreview(photo);
          }
        })
        .catch(() => {
          if (!canceled) {
            setError('Could not prepare this photo. Choose another image.');
          }
        })
        .finally(() => {
          if (!canceled) {
            setEditorBusy(false);
          }
        });
    }, 80);

    return () => {
      canceled = true;
      window.clearTimeout(timeout);
    };
  }, [rawCapture, zoom, offsetX, offsetY, brightness]);

  const previewStudent = useMemo(
    () => ({
      ...student,
      photoUrl: editedPreview || rawCapture || student.photoUrl || ''
    }),
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
    if (!video) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    resetEditor(canvas.toDataURL('image/jpeg', 0.95));
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.');
      return;
    }

    try {
      resetEditor(await fileToDataUrl(file));
      setError('');
    } catch {
      setError('Could not load this photo.');
    }
  }

  async function useCurrentPhoto() {
    if (!student.photoUrl) {
      return;
    }

    try {
      resetEditor(await imageSourceToDataUrl(student.photoUrl, portalBaseUrl));
      setError('');
    } catch {
      setError('Could not load the current portal photo for editing. Choose Photo instead.');
    }
  }

  async function approve() {
    if (!rawCapture) {
      return;
    }
    const cropped = await renderCroppedPhoto(rawCapture, zoom, offsetX, offsetY, brightness);
    onApprove(cropped);
  }

  return (
    <div className="modal-backdrop">
      <section className="capture-modal">
        <header>
          <div>
            <h2>Photo Editor</h2>
            <p>{studentFullName(student)}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="capture-grid">
          <div className="camera-box">
            {rawCapture ? (
              <div className="crop-frame">
                <img
                  src={rawCapture}
                  alt=""
                  style={{
                    filter: `brightness(${brightness}%)`,
                    transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${zoom})`
                  }}
                />
                <div className="crop-guide">
                  <div className="crop-head" />
                  <div className="crop-shoulders" />
                </div>
              </div>
            ) : (
              <div className="video-frame">
                <video ref={videoRef} autoPlay playsInline muted />
                <div className="head-guide">
                  <div className="head-oval" />
                  <div className="shoulder-line" />
                </div>
              </div>
            )}
          </div>

          <div className="capture-id-preview">
            <CaptureFrontPreview student={previewStudent} qrDataUrl={qrDataUrl} />
            <span>{editorBusy ? 'Preparing...' : 'ID Preview'}</span>
          </div>

          <aside className="capture-controls">
            {error ? <div className="warning">{error}</div> : null}
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleUpload} />
            <button className="button secondary wide" onClick={() => fileInputRef.current?.click()}>
              <ImagePlus size={17} /> Choose Photo
            </button>
            {student.photoUrl ? (
              <button className="button secondary wide" onClick={useCurrentPhoto}>
                <RefreshCw size={17} /> Edit Current Photo
              </button>
            ) : null}
            {rawCapture ? (
              <>
                <label className="field">
                  <span>Zoom</span>
                  <input
                    type="range"
                    min="1"
                    max="2.4"
                    step="0.05"
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Horizontal</span>
                  <input
                    type="range"
                    min="-120"
                    max="120"
                    value={offsetX}
                    onChange={(event) => setOffsetX(Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Vertical</span>
                  <input
                    type="range"
                    min="-120"
                    max="120"
                    value={offsetY}
                    onChange={(event) => setOffsetY(Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Brightness</span>
                  <input
                    type="range"
                    min="70"
                    max="130"
                    value={brightness}
                    onChange={(event) => setBrightness(Number(event.target.value))}
                  />
                </label>
                <button className="button secondary wide" onClick={() => setRawCapture('')}>
                  <RefreshCw size={17} /> Retake
                </button>
                <button className="button primary wide" onClick={approve} disabled={editorBusy}>
                  <CheckCircle2 size={17} /> Save Photo
                </button>
              </>
            ) : (
              <button className="button primary wide" onClick={captureFrame} disabled={!cameraReady}>
                <Camera size={17} /> Capture
              </button>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}

function CaptureFrontPreview({ student, qrDataUrl }: { student: StudentRecord; qrDataUrl: string }) {
  const lastName = studentLastNameLine(student);
  const firstName = studentFirstNameLine(student);
  const gradeLine = studentGradeLine(student);
  const idLines = studentIdentifierLines(student);

  return (
    <CardPage background={FRONT_TEMPLATE}>
      {student.photoUrl ? <img className="layer photo-layer" src={student.photoUrl} style={cardLayers.photo} /> : null}
      <img className="layer qr-layer" src={qrDataUrl} style={cardLayers.qr} />
      <div className="layer last-name-layer" style={previewLastNameStyle(lastName)}>
        {lastName}
      </div>
      <div className="layer first-name-layer" style={previewFirstNameStyle(firstName)}>
        {firstName}
      </div>
      <div className="layer grade-layer" style={previewGradeStyle(gradeLine)}>
        {gradeLine}
      </div>
      {idLines.length ? (
        <div className="layer ids-layer" style={cardLayers.ids}>
          {idLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}
    </CardPage>
  );
}

async function renderCroppedPhoto(source: string, zoom: number, offsetX: number, offsetY: number, brightness: number) {
  const image = await loadImage(source);
  const outputWidth = PHOTO_OUTPUT_WIDTH;
  const outputHeight = PHOTO_OUTPUT_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    return source;
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.filter = `brightness(${brightness}%)`;

  const baseScale = Math.max(outputWidth / image.width, outputHeight / image.height);
  const scale = baseScale * zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (outputWidth - width) / 2 + offsetX * (outputWidth / PHOTO_EDITOR_FRAME_WIDTH);
  const y = (outputHeight - height) / 2 + offsetY * (outputHeight / PHOTO_EDITOR_FRAME_HEIGHT);

  context.drawImage(image, x, y, width, height);
  return canvas.toDataURL('image/jpeg', 0.94);
}

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

async function imageSourceToDataUrl(source: string, portalBaseUrl: string) {
  if (source.startsWith('data:')) {
    return source;
  }

  const url = resolveImageSource(source, portalBaseUrl);
  if (window.gtPrint?.fetchImageDataUrl) {
    try {
      return await window.gtPrint.fetchImageDataUrl(url);
    } catch {
      throw new Error('Could not download image through the desktop app.');
    }
  }

  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Could not fetch image.');
  }
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error('Fetched file is not an image.');
  }
  return fileToDataUrl(blob);
}

function resolveImageSource(source: string, portalBaseUrl: string) {
  if (/^https?:\/\//i.test(source)) {
    return source;
  }

  const base = portalBaseUrl.trim() || window.location.href;
  return new URL(source, base).toString();
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load captured photo.'));
    image.src = source;
  });
}
