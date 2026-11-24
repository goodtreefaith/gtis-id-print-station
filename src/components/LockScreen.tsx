import { AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Field } from './Field';
import { ModeBadge } from './ModeBadge';

export interface LockScreenProps {
  username: string;
  password: string;
  onChange: (draft: { username: string; password: string }) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  /** Error from the last sign-in attempt, in plain words. */
  error?: string;
  /** Host this sign-in goes to: portal.gtis.edu.ph, or the test portal. */
  portalHost: string;
}

export function LockScreen({ username, password, onChange, onSubmit, busy, error, portalHost }: LockScreenProps) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <main className="center-shell">
      <form className="center-card lock-card" onSubmit={onSubmit} aria-labelledby="lock-title">
        <header className="center-card-head">
          <div className="brand-mark" aria-hidden="true">GT</div>
          <div>
            <h1 id="lock-title">Sign in to print IDs</h1>
            <p>
              Signing in to <strong>{portalHost}</strong> with your GTIS portal account. The station locks again when you sign out.
            </p>
          </div>
        </header>
        <ModeBadge mode="live" portalHost={portalHost} />
        <Field
          label="Portal email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoFocus
          value={username}
          onChange={(value) => onChange({ username: value, password })}
        />
        <Field
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          value={password}
          onChange={(value) => onChange({ username, password: value })}
          trailing={
            <button
              type="button"
              className="field-trailing-button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
        />
        {error ? (
          <p className="form-alert" role="alert">
            <AlertCircle size={18} aria-hidden="true" /> {error}
          </p>
        ) : null}
        <button className="button primary large wide" disabled={busy || !username.trim() || !password}>
          <LogIn size={18} aria-hidden="true" /> {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="center-card-foot">Press Enter to sign in.</p>
      </form>
    </main>
  );
}
