import {
  Camera,
  CheckCircle2,
  FileDown,
  LogIn,
  LogOut,
  Printer,
  RefreshCw,
  Save,
  Search,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import type {
  GuardianContact,
  OperatorSession,
  PortalSettings,
  PrinterInfo,
  StudentIdDetails,
  StudentRecord
} from './types';
import { assetToDataUrl } from './lib/assets';
import {
  emergencyAddressFontPx,
  emergencyNameFontPx,
  emergencyPhoneFontPx
} from './lib/cardText';
import { loadOptionalIdCardFont, optionalIdCardFontFaceCss } from './lib/fonts';
import { cardLayers } from './lib/layout';
import { renderPrintHtml } from './lib/printHtml';
import { makeAdmissionQr } from './lib/qr';
import { readinessFor, studentFullName, studentGradeLine } from './lib/student';
import {
  clearOperatorSession,
  hasPortalConfig,
  hasValidOperatorSession,
  loadPortalSettings,
  loadOperatorSession,
  loginOperator,
  saveOperatorSession,
  searchStudents,
  updateGuardian,
  updateIdDetails,
  updatePhoto
} from './lib/portalClient';

const FRONT_TEMPLATE = '/templates/2026-2027/front.canva-empty.svg';
const BACK_TEMPLATE = '/templates/2026-2027/back.canva.svg';
const STUDENT_PAGE_LIMIT = 20;

interface PrintFieldOptions {
  includeLrn: boolean;
  includeEsc: boolean;
}

function previewNameStyle(name: string): CSSProperties {
  const lines = splitNameLines(name);
  const longestLine = Math.max(...lines.map((line) => line.length));
  let fontSize = 21;

  if (lines.length > 1) {
    if (longestLine > 28) {
      fontSize = 13;
    } else if (longestLine > 24) {
      fontSize = 14;
    } else if (longestLine > 20) {
      fontSize = 15;
    } else {
      fontSize = 16;
    }
  } else if (longestLine > 30) {
    fontSize = 13;
  } else if (longestLine > 26) {
    fontSize = 16;
  } else if (longestLine > 22) {
    fontSize = 18;
  }

  return {
    ...cardLayers.name,
    fontSize: `${fontSize}px`,
    lineHeight: lines.length > 1 ? 0.9 : 0.98
  };
}

function previewGradeStyle(grade: string): CSSProperties {
  const length = grade.length;
  const fontSize = length > 28 ? 12 : length > 23 ? 13 : length > 18 ? 15 : 17;

  return {
    ...cardLayers.grade,
    fontSize: `${fontSize}px`
  };
}

function splitNameLines(name: string) {
  const words = name.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (name.length <= 26 || words.length <= 1) {
    return [name];
  }

  let bestIndex = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const first = words.slice(0, index).join(' ');
    const second = words.slice(index).join(' ');
    const score = Math.abs(first.length - second.length);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return [words.slice(0, bestIndex).join(' '), words.slice(bestIndex).join(' ')];
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
  guardianDraft: GuardianContact | null,
  idDraft: StudentIdDetails | null,
  printFields: PrintFieldOptions
): StudentRecord {
  const lrn = idDraft?.lrn.trim() || '';
  const esc = idDraft?.esc.trim() || '';

  return {
    ...student,
    guardian: guardianDraft || student.guardian,
    lrn: printFields.includeLrn ? lrn : '',
    esc: printFields.includeEsc ? esc : ''
  };
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
  const [guardianDraft, setGuardianDraft] = useState<GuardianContact | null>(null);
  const [idDraft, setIdDraft] = useState<StudentIdDetails | null>(null);
  const [printFields, setPrintFields] = useState<PrintFieldOptions>({ includeLrn: true, includeEsc: true });
  const [captureOpen, setCaptureOpen] = useState(false);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [silentPrint, setSilentPrint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [portalSettings, setPortalSettings] = useState<PortalSettings>(() => loadPortalSettings());
  const [operatorSession, setOperatorSession] = useState<OperatorSession | null>(() => loadOperatorSession());
  const [loginDraft, setLoginDraft] = useState({ username: '', password: '' });
  const [loginBusy, setLoginBusy] = useState(false);
  const [status, setStatus] = useState(() =>
    hasPortalConfig(loadPortalSettings())
      ? 'Sign in with your portal account.'
      : 'Sample data loaded for local testing.'
  );
  const liveMode = hasPortalConfig(portalSettings);
  const operatorReady = !liveMode || hasValidOperatorSession(operatorSession);
  const operatorCanUseStation = !liveMode || operatorSession?.permissions?.canView !== false;
  const operatorCanEditPortal = !liveMode || operatorSession?.permissions?.canEdit !== false;

  useEffect(() => {
    void loadOptionalIdCardFont();
  }, []);

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
      setGuardianDraft(null);
      setIdDraft(null);
      return;
    }

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
    return selected ? printableStudent(selected, guardianDraft, idDraft, printFields) : null;
  }, [selected, guardianDraft, idDraft, printFields]);

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

  async function buildPrintHtml() {
    if (!previewStudent || !qrDataUrl) {
      throw new Error('Select a student before printing.');
    }

    const [front, back, idCardFontFaceCss] = await Promise.all([
      assetToDataUrl(new URL(FRONT_TEMPLATE, window.location.href).toString()),
      assetToDataUrl(new URL(BACK_TEMPLATE, window.location.href).toString()),
      optionalIdCardFontFaceCss()
    ]);

    return renderPrintHtml(previewStudent, qrDataUrl, { front, back, idCardFontFaceCss });
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
      const updated = await updateGuardian(selected.id, guardianDraft, portalSettings, operatorSession?.token);
      setStudents((current) => replaceStudent(current, updated));
      setSelected(updated);
      setStatus(hasPortalConfig(portalSettings) ? 'Guardian contact saved.' : 'Guardian contact saved in sample data.');
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
      const nextDetails = {
        lrn: idDraft.lrn.trim(),
        esc: idDraft.esc.trim()
      };
      const updated = await updateIdDetails(selected.id, nextDetails, portalSettings, operatorSession?.token);
      setStudents((current) => replaceStudent(current, updated));
      setSelected(updated);
      setPrintFields((current) => ({
        includeLrn: nextDetails.lrn ? current.includeLrn : false,
        includeEsc: nextDetails.esc ? current.includeEsc : false
      }));
      setStatus(hasPortalConfig(portalSettings) ? 'Student identifiers saved.' : 'Student identifiers saved in sample data.');
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
      const html = await buildPrintHtml();
      if (window.gtPrint) {
        const result = await window.gtPrint.printCard(html, {
          deviceName: selectedPrinter || undefined,
          silent: silentPrint
        });
        setStatus(result.ok ? 'Print job sent.' : result.error || 'Print failed.');
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
      const html = await buildPrintHtml();
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
    setPortalSettings(loadPortalSettings());
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
            {selected && readiness && guardianDraft && idDraft ? (
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
          studentName={studentFullName(selected)}
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
  const idLines = [student.lrn ? `LRN: ${student.lrn}` : '', student.esc ? `ESC: ${student.esc}` : ''].filter(Boolean);
  const name = studentFullName(student);
  const nameLines = splitNameLines(name);
  const gradeLine = studentGradeLine(student);

  return (
    <div className="cards-wrap">
      <div className="card-shell">
        <CardPage background={FRONT_TEMPLATE}>
          {student.photoUrl ? <img className="layer photo-layer" src={student.photoUrl} style={cardLayers.photo} /> : null}
          <img className="layer qr-layer" src={qrDataUrl} style={cardLayers.qr} />
          <div className="layer student-no-layer" style={cardLayers.studentNo}>
            {student.admissionNo}
          </div>
          <div className="layer name-layer" style={previewNameStyle(name)}>
            {nameLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
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
        <CardPage background={BACK_TEMPLATE}>
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

function CardPage({ background, children }: { background: string; children: React.ReactNode }) {
  return (
    <div className="card-page">
      <img src={background} className="card-bg" alt="" />
      {children}
    </div>
  );
}

function CaptureModal({
  studentName,
  onApprove,
  onClose
}: {
  studentName: string;
  onApprove: (photoDataUrl: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [rawCapture, setRawCapture] = useState('');
  const [zoom, setZoom] = useState(1.15);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

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
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => setError('Camera is unavailable. Use manual upload in the production connector.'));

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

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
    setRawCapture(canvas.toDataURL('image/jpeg', 0.95));
  }

  async function approve() {
    if (!rawCapture) {
      return;
    }
    const cropped = await renderCroppedPhoto(rawCapture, zoom, offsetX, offsetY);
    onApprove(cropped);
  }

  return (
    <div className="modal-backdrop">
      <section className="capture-modal">
        <header>
          <div>
            <h2>Capture Photo</h2>
            <p>{studentName}</p>
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
                    transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`
                  }}
                />
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

          <aside className="capture-controls">
            {error ? <div className="warning">{error}</div> : null}
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
                <button className="button secondary wide" onClick={() => setRawCapture('')}>
                  <RefreshCw size={17} /> Retake
                </button>
                <button className="button primary wide" onClick={approve}>
                  <CheckCircle2 size={17} /> Approve Photo
                </button>
              </>
            ) : (
              <button className="button primary wide" onClick={captureFrame} disabled={Boolean(error)}>
                <Camera size={17} /> Capture
              </button>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}

async function renderCroppedPhoto(source: string, zoom: number, offsetX: number, offsetY: number) {
  const image = await loadImage(source);
  const outputWidth = 840;
  const outputHeight = 1260;
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    return source;
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, outputWidth, outputHeight);

  const baseScale = Math.max(outputWidth / image.width, outputHeight / image.height);
  const scale = baseScale * zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (outputWidth - width) / 2 + offsetX * 2;
  const y = (outputHeight - height) / 2 + offsetY * 2;

  context.drawImage(image, x, y, width, height);
  return canvas.toDataURL('image/jpeg', 0.94);
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load captured photo.'));
    image.src = source;
  });
}
