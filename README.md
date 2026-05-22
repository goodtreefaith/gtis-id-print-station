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

Live mode needs the matching `idprintapi` routes deployed in the GTIS portal and a device API token configured privately on the portal server. Operators do not see or enter this token.
When live mode is on, operators must also sign in with an allowed portal admin account before searching students, editing guardians, approving photos, saving PDFs, or printing IDs.

## Development

```bash
npm install
npm run electron:dev
```

Mac testing:

- Use `Save PDF` to inspect exact CR80 output.
- Use non-silent print mode to open the system print dialog.
- Webcam capture works through Electron camera permissions.

Windows NUC target:

- Install the SMART-51D driver.
- Configure the app printer dropdown to the SMART-51D printer name.
- Turn on silent mode only after physical test prints confirm CR80 duplex behavior.

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

## Portal Adapter

Use private environment config for the device:

- Copy `.env.example` to `.env.local`.
- Set `VITE_GTIS_IDPRINT_API_TOKEN` to the same token configured in the portal.
- Keep `VITE_GTIS_IDPRINT_USE_MOCK=true` for Mac layout/photo/print testing.
- Use `VITE_GTIS_IDPRINT_USE_MOCK=false` on the Windows NUC after the portal token is configured.
- In live mode, use an allowed portal admin login at the app lock screen. The device token stays hidden from the operator.
- Use `Refresh` in the app to pull newly enrolled students, recently changed guardian contacts, updated LRN/ESC values, or approved photo updates.

See [docs/portal-api-contract.md](docs/portal-api-contract.md) for the portal API shape.
