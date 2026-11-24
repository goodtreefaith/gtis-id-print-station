import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, PlugZap, ShieldAlert, Unplug } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Field } from './Field';
import { ModeBadge, hostOf } from './ModeBadge';
import type { StationMode } from './ModeBadge';

// Same shape as DeviceStatus / DeviceConfigureResult in src/types.ts (window.gtPrint.device).
// Kept structural here so the component can be rendered with fixtures. Nothing derived from the
// token is ever returned or shown.
export interface DeviceStatus {
  /** A token is saved, readable, and for an allowed portal host (Live). */
  configured: boolean;
  portalUrl: string;
  /** The saved token can be decrypted on this computer and Windows account. */
  tokenReadable: boolean;
  encryptionAvailable: boolean;
  /** Plain-language note when setup needs attention, else ''. */
  message: string;
}

export type DeviceCheck = 'accepted' | 'rejected' | 'unreachable';

export interface DeviceSetupProps {
  status: () => Promise<DeviceStatus>;
  configure: (input: { portalUrl: string; token: string }) => Promise<DeviceStatus & { check: DeviceCheck }>;
  clear: () => Promise<DeviceStatus | unknown>;
  /** Readable text for a rejected bridge call (App passes bridgeErrorMessage). */
  errorMessage?: (error: unknown) => string;
  /** Called whenever the saved setup changed (token accepted, or cleared). */
  onChanged?: (status: DeviceStatus) => void;
  /** Leave setup. Live: go to sign-in. Sample: keep practising. */
  onClose?: (status: DeviceStatus | null) => void;
  /** Opened from inside the app: show Cancel, and Esc goes back. */
  onCancel?: () => void;
}

type Phase = 'loading' | 'form' | 'checking' | 'live' | 'confirm-clear' | 'clearing';

/** The only hosts the main process accepts. */
export const PORTAL_CHOICES = [
  { url: 'https://portal.gtis.edu.ph', label: 'School portal', note: 'portal.gtis.edu.ph · real students' },
  { url: 'https://preportal.gtis.edu.ph', label: 'Test portal', note: 'preportal.gtis.edu.ph · for trying things out' }
] as const;

function sameHost(a: string, b: string) {
  return hostOf(a).toLowerCase() === hostOf(b).toLowerCase();
}

function defaultErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : '';
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}

/**
 * One-time Device setup for an admin. The token lives only in this form while it is typed, is sent
 * once to `configure`, and is cleared straight after. No part of it is ever shown.
 */
export function DeviceSetup({ status, configure, clear, errorMessage = defaultErrorMessage, onChanged, onClose, onCancel }: DeviceSetupProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [current, setCurrent] = useState<DeviceStatus | null>(null);
  const [portalUrl, setPortalUrl] = useState<string>(PORTAL_CHOICES[0].url);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const tokenRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const escapeRef = useRef<() => void>(() => {});
  escapeRef.current = () => {
    // First Esc after an error: read the error. Otherwise Esc leaves (only when opened from the app).
    if (result?.tone === 'error' && errorRef.current && document.activeElement !== errorRef.current) {
      errorRef.current.focus();
      return;
    }
    if (phase === 'checking' || phase === 'clearing') return;
    if (phase === 'confirm-clear') {
      setPhase('live');
      return;
    }
    onCancel?.();
  };
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        escapeRef.current();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Read the status once on mount; parent re-renders must not reset the form mid-typing.
  const statusRef = useRef(status);
  useEffect(() => {
    let active = true;
    statusRef.current()
      .then((value) => {
        if (!active) return;
        setCurrent(value);
        const known = PORTAL_CHOICES.find((choice) => value.portalUrl && sameHost(choice.url, value.portalUrl));
        if (known) setPortalUrl(known.url);
        setPhase(value.configured ? 'live' : 'form');
      })
      .catch((error) => {
        if (!active) return;
        setPhase('form');
        setResult({ tone: 'error', message: errorMessage(error) || 'Couldn’t read this station’s settings.' });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === 'form') tokenRef.current?.focus();
  }, [phase]);

  const connected = Boolean(current?.configured);
  const needsAttention = !connected && Boolean(current && (current.message || (current.portalUrl && !current.tokenReadable)));
  const mode: StationMode = connected ? 'live' : needsAttention ? 'attention' : 'sample';
  const encryptionOff = Boolean(current && !current.encryptionAvailable);
  const canSubmit = token.trim().length > 0 && phase === 'form' && !encryptionOff;
  const host = hostOf(portalUrl);
  const keptNote = connected ? ' The station keeps its current connection.' : ' Nothing was saved.';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setPhase('checking');
    setResult(null);
    try {
      const next = await configure({ portalUrl, token: token.trim() });
      if (next.check === 'accepted') {
        setToken('');
        setShowToken(false);
        setCurrent(next);
        setPhase('live');
        setResult({ tone: 'success', message: `Connected. This station now uses live data from ${hostOf(next.portalUrl)}.` });
        onChanged?.(next);
        return;
      }
      setPhase(connected ? 'form' : 'form');
      setResult({
        tone: 'error',
        message:
          next.check === 'rejected'
            ? `The portal didn’t accept this token. Check you copied the whole token for this station.${keptNote}`
            : `Couldn’t reach ${host}. Check this computer is online, then try again.${keptNote}`
      });
    } catch (error) {
      setPhase('form');
      setResult({ tone: 'error', message: `${errorMessage(error) || 'Something went wrong while saving.'}${keptNote}` });
    }
  }

  async function handleClear() {
    setPhase('clearing');
    try {
      const cleared = await clear();
      const next = cleared && typeof cleared === 'object' && 'configured' in cleared ? (cleared as DeviceStatus) : await status();
      setCurrent(next);
      setResult(null);
      setPhase('form');
      onChanged?.(next);
    } catch (error) {
      setPhase('live');
      setResult({ tone: 'error', message: `Couldn’t disconnect. ${errorMessage(error)} Nothing was changed.`.replace(/\s+/g, ' ') });
    }
  }

  const live = phase === 'live' || phase === 'confirm-clear' || phase === 'clearing';

  return (
    <main className="center-shell">
      <section className="center-card setup-card" aria-labelledby="setup-title">
        <header className="center-card-head">
          <div className="brand-mark" aria-hidden="true">GT</div>
          <div>
            <h1 id="setup-title">Device setup</h1>
            <p>One-time setup by an admin. Connects this print station to the school portal.</p>
          </div>
        </header>

        <div className="setup-grid">
          <aside className="setup-explain">
            <h2>Where this station gets its data</h2>
            <div className={`mode-panel is-${mode}`}>
              <ModeBadge mode={mode} portalHost={connected ? hostOf(current?.portalUrl || portalUrl) : undefined} />
              <p>
                {mode === 'live'
                  ? 'Staff sign in with their portal account. Edits are saved to the portal, and printed cards are filed in each student’s Documents.'
                  : mode === 'attention'
                    ? 'The station is set up but can’t reach the portal with its saved token. Until it is replaced, only practice data is available.'
                    : 'Practice students only. Nothing is read from or saved to the portal. Use it to test the printer and card layout.'}
              </p>
            </div>
            <ol className="setup-steps">
              <li className={connected ? 'is-done' : 'is-current'}>
                <strong>Connect the station</strong>
                <span>Paste the device token for this station.</span>
              </li>
              <li className={connected ? 'is-current' : ''}>
                <strong>Staff sign in</strong>
                <span>Each operator uses their own portal account.</span>
              </li>
            </ol>
          </aside>

          {phase === 'loading' ? (
            <div className="setup-form is-loading" aria-busy="true">
              <Loader2 size={22} className="spin" aria-hidden="true" /> Checking this station’s settings…
            </div>
          ) : live ? (
            <div className="setup-form">
              {result ? (
                <p className={`form-alert${result.tone === 'success' ? ' is-success' : ''}`} role={result.tone === 'success' ? 'status' : 'alert'}>
                  {result.tone === 'success' ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertCircle size={18} aria-hidden="true" />}
                  {result.message}
                </p>
              ) : null}
              <dl className="setup-facts">
                <div>
                  <dt>Portal</dt>
                  <dd>{current?.portalUrl}</dd>
                </div>
                <div>
                  <dt>Device token</dt>
                  <dd>
                    <KeyRound size={16} aria-hidden="true" /> Saved and hidden
                  </dd>
                </div>
                <div>
                  <dt>Stored</dt>
                  <dd>Encrypted by Windows for this account</dd>
                </div>
              </dl>
              {phase === 'confirm-clear' || phase === 'clearing' ? (
                <div className="confirm-box" role="alertdialog" aria-labelledby="clear-title" aria-describedby="clear-desc">
                  <strong id="clear-title">Disconnect this station?</strong>
                  <p id="clear-desc">
                    The token is removed from this computer and the station goes back to Sample mode. You’ll need the token again to reconnect.
                  </p>
                  <div className="button-row">
                    <button type="button" className="button danger" onClick={handleClear} disabled={phase === 'clearing'}>
                      <Unplug size={18} aria-hidden="true" /> {phase === 'clearing' ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                    <button type="button" className="button secondary" onClick={() => setPhase('live')} disabled={phase === 'clearing'} autoFocus>
                      Keep connected
                    </button>
                  </div>
                </div>
              ) : (
                <div className="button-row">
                  <button type="button" className="button primary large" onClick={() => onClose?.(current)}>
                    Continue to sign in
                  </button>
                  <button
                    type="button"
                    className="button secondary large"
                    onClick={() => {
                      setResult(null);
                      setPhase('form');
                    }}
                  >
                    <KeyRound size={18} aria-hidden="true" /> Replace token
                  </button>
                  <button type="button" className="button ghost large" onClick={() => setPhase('confirm-clear')}>
                    <Unplug size={18} aria-hidden="true" /> Disconnect…
                  </button>
                  {onCancel ? (
                    <button type="button" className="button ghost large" onClick={onCancel}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <form className="setup-form" onSubmit={handleSubmit} noValidate>
              {encryptionOff ? (
                <p className="form-alert is-warning" role="note">
                  <ShieldAlert size={18} aria-hidden="true" />
                  Windows can’t encrypt the token on this computer, so it can’t be saved here. Ask IT to check this Windows account.
                </p>
              ) : needsAttention && !result ? (
                <p className="form-alert is-warning" role="note">
                  <ShieldAlert size={18} aria-hidden="true" />
                  {current?.message || 'The saved token can’t be read on this computer. Enter the token again to reconnect.'}
                </p>
              ) : null}
              <fieldset className="portal-choice" disabled={phase === 'checking'}>
                <legend>Portal</legend>
                {PORTAL_CHOICES.map((choice) => (
                  <label key={choice.url} className={`portal-option${portalUrl === choice.url ? ' is-selected' : ''}`}>
                    <input type="radio" name="portal" value={choice.url} checked={portalUrl === choice.url} onChange={() => setPortalUrl(choice.url)} />
                    <span>
                      <strong>{choice.label}</strong>
                      <small>{choice.note}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <Field
                ref={tokenRef}
                label="Device token"
                type={showToken ? 'text' : 'password'}
                autoComplete="off"
                value={token}
                onChange={(value) => {
                  setToken(value);
                  if (result) setResult(null);
                }}
                hint="Paste the token the portal admin created for this station. It is never shown again after saving."
                disabled={phase === 'checking' || encryptionOff}
                trailing={
                  <button
                    type="button"
                    className="field-trailing-button"
                    onClick={() => setShowToken((value) => !value)}
                    aria-label={showToken ? 'Hide token' : 'Show token'}
                    aria-pressed={showToken}
                  >
                    {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />
              {result ? (
                <p className="form-alert" role="alert" ref={errorRef} tabIndex={-1}>
                  <AlertCircle size={18} aria-hidden="true" /> {result.message}
                </p>
              ) : null}
              <div className="button-row">
                <button className="button primary large" disabled={!canSubmit}>
                  {phase === 'checking' ? (
                    <>
                      <Loader2 size={18} className="spin" aria-hidden="true" /> Checking with the portal…
                    </>
                  ) : (
                    <>
                      <PlugZap size={18} aria-hidden="true" />
                      {result ? 'Try again' : needsAttention || connected ? 'Replace token' : 'Connect and check'}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="button secondary large"
                  onClick={() => {
                    setToken('');
                    setResult(null);
                    if (connected) setPhase('live');
                    else onClose?.(current);
                  }}
                  disabled={phase === 'checking'}
                >
                  {connected ? 'Keep current connection' : 'Use Sample mode for now'}
                </button>
                {onCancel && !connected ? (
                  <button type="button" className="button ghost large" onClick={onCancel} disabled={phase === 'checking'}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
