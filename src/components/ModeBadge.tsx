import { FlaskConical, Radio } from 'lucide-react';

/** Set when the desktop app starts (portal.info().mode); there is no in-app switch. */
export type StationMode = 'live' | 'sample';

/** Always-visible station mode. Text carries the meaning; colour only reinforces it. */
export function ModeBadge({ mode, portalHost }: { mode: StationMode; portalHost?: string }) {
  if (mode === 'live') {
    return (
      <span className="mode-badge is-live" data-testid="mode-badge" title={`Connected to ${portalHost || 'the portal'}`}>
        <Radio size={16} aria-hidden="true" />
        <span>
          <strong>Live</strong>
          {portalHost ? <small>{portalHost}</small> : null}
        </span>
      </span>
    );
  }
  return (
    <span className="mode-badge is-sample" data-testid="mode-badge" title="Practice data. Started with GTIS_IDPRINT_SAMPLE=1; nothing is read from or saved to the portal.">
      <FlaskConical size={16} aria-hidden="true" />
      <span>
        <strong>Sample mode</strong>
        <small>Practice data only</small>
      </span>
    </span>
  );
}

export function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
