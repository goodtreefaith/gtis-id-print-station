# GTIS ID Print Station

Desktop-first student ID card printing app for GTIS.

It is intentionally outside the CodeIgniter portal repo. The app can be tested on macOS, then installed on a Windows NUC connected to the SMART-51D printer.

## Current Scope

- Search students from a mock portal adapter.
- Generate QR codes from `students.admission_no`.
- Preview ISO CR80 front/back cards.
- Capture webcam photos with a head-position guide.
- Crop, retake, preview, and approve photos.
- Edit guardian emergency contact in the app.
- Save CR80 PDF for Mac testing.
- Print via Electron using the local OS printer driver.

The real portal integration needs a small API in the GTIS portal for search, guardian update, approved photo upload, and print logging.

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

The SVG front intentionally has no student data and no QR code. The app places the live webcam photo, QR code, student number, name, grade, LRN, and ESC on top at print time.

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

## Portal Adapter

The app currently uses mock data. See [docs/portal-api-contract.md](docs/portal-api-contract.md) for the expected portal API shape.
