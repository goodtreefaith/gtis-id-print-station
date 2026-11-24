import { AlertTriangle, FlaskConical, Radio } from 'lucide-react';

export type StationMode = 'live' | 'sample' | 'attention';

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
  if (mode === 'attention') {
    return (
      <span className="mode-badge is-attention" data-testid="mode-badge" title="The device token needs attention.">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>
          <strong>Not connected</strong>
          <small>Device token needs attention</small>
        </span>
      </span>
    );
  }
  return (
    <span className="mode-badge is-sample" data-testid="mode-badge" title="Practice data. Nothing is read from or saved to the portal.">
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
