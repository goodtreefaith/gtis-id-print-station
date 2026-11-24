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

The app talks to the GTIS portal's `idprintapi` routes. There is **no device
token**: staff sign in with their own portal account, and that sign-in is the
only credential. Staff must sign in before searching students, editing
guardians, approving photos, saving PDFs, or printing IDs.

## Development

```bash
npm install
npm run electron:dev                        # live portal, staff sign-in
GTIS_IDPRINT_SAMPLE=1 npm run electron:dev  # sample data, no portal
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

- Never put any token, password or key in a `.env` file. Vite compiles
  `VITE_*` values into `dist/`, which ships inside every EXE. `.env.example`
  intentionally contains no settings.
- The app has no built-in credential. The device token used by earlier
  versions is retired; staff sign in with their own portal account.
- `npm run check:public` fails if a `.env` file is tracked, if any tracked file
  assigns a value to a TOKEN/SECRET/PASSWORD/KEY variable, if the build output
  contains a token, or if git history contains a token-like value. It prints
  only file, commit and line, never the value. It runs in GitHub Actions on
  every push and pull request (`Checks`) and in `Build Windows EXE`.

If a real token was ever committed or shipped in a build, rotate it on the
portal; removing it from the code does not un-publish it.

## Portal and Sign-in

- The portal is fixed: `https://portal.gtis.edu.ph`. To test against the
  pre-production portal, start the app with the environment variable
  `GTIS_IDPRINT_PORTAL=preportal` (uses `https://preportal.gtis.edu.ph`). No
  other host can be used, and no token is involved.
- The app starts in **live mode** and shows the staff sign-in screen, which
  names the portal host you are signing in to. Sign in with an allowed portal
  account. The portal limits failed sign-ins with the same lockout as the web
  login.
- **Sample mode** (sample students, nothing sent to the portal, clearly
  labelled) is only for development and testing: start the app with
  `GTIS_IDPRINT_SAMPLE=1`. There is deliberately no switch for it on the lock
  screen, so staff cannot end up printing sample data by accident.

All portal calls run in the Electron main process. It sends only the signed-in
staff member's session header, only to `/idprintapi/` routes on the fixed
portal, refuses redirects and times out. Earlier versions kept a device token
in browser storage or an encrypted file; the app deletes both on startup.

The main window can only show the app itself: navigation elsewhere and new
windows are blocked, the bridge answers only the app page, and the packaged
page has a strict Content Security Policy. Student photos are downloaded only
from the portal host over https (JPEG, PNG, WebP or GIF, at most 15 MB).

## Portal Adapter

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
