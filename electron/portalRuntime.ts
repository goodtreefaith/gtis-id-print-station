// Which portal the station talks to, and whether it uses sample data.
// Decided once at startup from environment variables read at runtime (never
// compiled into the build). No Electron imports, so it can be tested in Node.
//
//   GTIS_IDPRINT_PORTAL=preportal   use https://preportal.gtis.edu.ph (testing)
//   GTIS_IDPRINT_SAMPLE=1           sample data, no portal calls (dev/testing)
//
// Both hosts are school-owned and on the allowlist, so the portal switch is
// honoured in packaged builds too (so the NUC can be tested against
// preportal); any other value is ignored. There is no secret involved.

export const LIVE_PORTAL_URL = 'https://portal.gtis.edu.ph';
export const TEST_PORTAL_URL = 'https://preportal.gtis.edu.ph';

export type PortalMode = 'live' | 'sample';

export interface PortalRuntime {
  portalUrl: string;
  mode: PortalMode;
  /** Set when an environment value was ignored, for the diagnostics log. */
  warning?: string;
}

const TRUE_VALUES = ['1', 'true', 'yes'];

export function resolvePortalRuntime(env: Record<string, string | undefined>): PortalRuntime {
  const sample = TRUE_VALUES.includes((env.GTIS_IDPRINT_SAMPLE || '').trim().toLowerCase());
  const portalChoice = (env.GTIS_IDPRINT_PORTAL || '').trim().toLowerCase();
  let portalUrl = LIVE_PORTAL_URL;
  let warning: string | undefined;

  if (portalChoice === 'preportal' || portalChoice === 'test') {
    portalUrl = TEST_PORTAL_URL;
  } else if (portalChoice !== '' && portalChoice !== 'portal' && portalChoice !== 'live') {
    warning = 'GTIS_IDPRINT_PORTAL must be "portal" or "preportal"; using the live portal.';
  }

  return { portalUrl, mode: sample ? 'sample' : 'live', warning };
}
