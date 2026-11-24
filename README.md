# GTIS ID Print Station

Desktop-first student ID card printing app for GTIS.

It is intentionally outside the CodeIgniter portal repo. The app can be tested on macOS, then installed on a Windows NUC connected to the SMART-51D printer.

## Current Scope

- Search students from mock data or the live GTIS portal API.
- Lazy-load student results in pages, with a manual refresh button for newly updated portal records.
- Generate QR codes from `students.admission_no`.
- Preview ISO CR80 front/back cards.
- Capture webcam photos with a head-position guide.
- Crop, retake, preview, and approve photos.
- Edit guardian emergency contact, LRN, and ESC in the app and save them back to the portal when live mode is configured.
- Include or hide LRN and ESC per print without changing the saved portal values.
- Save CR80 PDF for Mac testing.
- Print via Electron using the local OS printer driver.

Live mode needs the matching `idprintapi` routes deployed in the GTIS portal and a device API token configured privately on the portal server. School IT enters that token once on the station in **Device setup**; operators do not see or enter it.
When live mode is on, operators must also sign in with an allowed portal admin account before searching students, editing guardians, approving photos, saving PDFs, or printing IDs.

## Development

```bash
npm install
npm run electron:dev
```

Mac testing:

- Use `Save PDF` to inspect exact CR80 output.
- Use normal print mode to open the system print dialog.
- Webcam capture works through Electron camera permissions.

Windows NUC target:

- Install the SMART-51D driver from the SMART-51/31/21 support download.
- Configure the app printer dropdown to the SMART-51D printer name.
- Leave `Silent print on Windows NUC` off for the first test prints.
- Click `Print ID`, then use the SMART Windows print dialog to confirm ISO CR80/card size and front/back duplex settings.
- Turn on silent mode only after dialog-mode physical test prints confirm the SMART driver settings are correct.

## Template Assets

The app uses the Canva SVG exports as the production card artwork:

- `public/templates/2026-2027/front.canva-empty.svg`
- `public/templates/2026-2027/back.canva.svg`

The SVG front intentionally has no live photo/name/LRN/ESC data and no QR code. The app places the approved photo, QR code, name, grade, LRN, and ESC on top at print time, aligned to the Canva reference.
The school year and student-number label/value are treated as design artwork, so the app no longer overlays extra school-year or student-number text. The QR code is still generated from `students.admission_no`.

Reference assets are kept only for comparison:

- `public/templates/2026-2027/front.canva-sample.svg`
- `public/templates/2026-2027/front.reference.png`
- `public/templates/2026-2027/back.reference.png`

## Build

```bash
npm run build
```

Windows installer/portable build should be produced on the Windows NUC or another Windows machine:

```bash
npm run dist:win
```

You can also build it from GitHub:

1. Open the repository on GitHub.
2. Go to Actions.
3. Run `Build Windows EXE`.
4. Download the `gtis-id-print-station-windows` artifact from the completed workflow run.

## Security: no secrets in this repository or its builds

This repository and its GitHub releases are **public**. Nothing secret may be
committed or compiled into a build:

- Never put the device token, or any token, password or key, in a `.env`
  file. Vite compiles `VITE_*` values into `dist/`, which ships inside every
  EXE. `.env.example` intentionally contains no settings.
- The device token is entered on the station itself (see Device Setup below)
  and stored encrypted by the operating system. It never reaches the
  renderer, DevTools or any file in plain text.
- `npm run check:public` fails if a `.env` file is tracked, if any tracked file
  assigns a value to a TOKEN/SECRET/PASSWORD/KEY variable, if the build output
  contains a token, or if git history contains a token-like value. It prints
  only file, commit and line, never the value. It runs in GitHub Actions on
  every push and pull request (`Checks`) and in `Build Windows EXE`.

If a real token was ever committed or shipped in a build, rotate it on the
portal; removing it from the code does not un-publish it.

## Device Setup (once per station)

Without device setup the app runs in **Sample mode** (clearly labelled), with
sample students and nothing sent to the portal.

1. On the portal server, configure the device token (`GTIS_IDPRINT_API_TOKEN`
   or `application/config/idprint.local.php`, see the API contract).
2. On the station, open the app, click `Device setup` in the Sample mode banner.
3. Keep the portal address (`https://portal.gtis.edu.ph`) or change it, paste
   the device token (at least 32 characters) and click `Save device setup`.
4. The app checks the token with the portal before saving:
   - accepted: saved; the app switches to live mode and asks for a portal sign-in;
   - rejected: nothing is saved;
   - unreachable: saved, but not confirmed (for example the station is offline).

The token is encrypted with Electron `safeStorage` (Windows DPAPI for the
signed-in Windows user, or the macOS Keychain) in `device-config.json` under
the app's user-data folder. If the computer cannot encrypt it, the app refuses
to save it; there is no plain-text fallback. Afterwards the app shows only the
portal host and the token's last 4 characters. `Reset device setup` on the
sign-in screen removes the saved token and returns to Sample mode.

All portal calls run in the Electron main process, which adds the device token
headers and only allows `/idprintapi/` routes on the configured portal. Older
versions kept a token in browser storage; the app deletes that on startup.

## Portal Adapter

- In live mode, use an allowed portal admin login at the app lock screen. The
  sign-in screen shows which portal host you are signing in to.
- Use `Refresh` in the app to pull newly enrolled students, recently changed guardian contacts, updated LRN/ESC values, or approved photo updates.
- After a successful print, the app uploads the front and back of the card to
  the student's Documents as upright 600 DPI PNGs (1275 x 2022 px each).

See [docs/portal-api-contract.md](docs/portal-api-contract.md) for the portal API shape.

## Tests

```bash
npm run typecheck
npm run build
npm run check:public   # after build
npm run test:bridge    # portal bridge against a local fake portal
npm run test:archive   # renders the archive PNGs offscreen at display scales 1, 1.25, 1.5, 2
```

`test:archive` writes the PNGs to `archive-test-output/` and checks their size,
that the back is upright, that there are no white margins, and that the print
HTML is still byte-identical to `scripts/fixtures/` (the printer needs the back
rotated 180 degrees).
