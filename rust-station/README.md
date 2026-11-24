# Rust ID Print Station

The Rust/Tauri prototype previews a two-sided calibration card using
synthetic artwork. The calibration app and its exports work offline.

The [released CodeIgniter station](../README.md) is built from the root of
this repository. This directory holds the Rust development builds.

## Run locally

Install Node.js 22.12 or newer, stable Rust, and the Tauri 2 build
prerequisites for your OS.
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

```sh
cd rust-station
npm ci
npm run tauri dev
```

Generate the calibration PDF and both PNGs in a new directory.

```sh
cargo run --locked --manifest-path calibration/Cargo.toml -- calibration-output
```

Both PDF pages are upright by default. Append `--rotate-back` to rotate
only the PDF's second page by 180°. The PNGs stay upright for archiving.

## Run the GTIS sample executable

From the repository root, build the existing staff screens and embed them
in the Rust sample app.

```sh
npm ci
npm run build
node rust-station/scripts/prepare-ci3-preview.mjs
cargo build --locked --release --features custom-protocol --manifest-path rust-station/ci3-preview/Cargo.toml
```

Open `rust-station/ci3-preview/target/release/gtis-id-print-station-sample.exe`
on Windows. On macOS the executable has the same name without `.exe`.
Search for sample students, update card details and preview the results.
Camera capture, print and PDF export are unavailable in this sample.

The **Rust Windows previews** workflow builds both apps. Its
`rust-id-print-station-windows-previews` artifact contains the calibration
and sample executables. The regular Windows release uses the build
instructions in the [main README](../README.md).

## First milestone

Rust renders the card sides at 1275 × 2022 pixels with 600 DPI metadata.
The desktop app displays those PNGs. The calibration PDF embeds the same
raster artwork on two portrait CR80 pages, 53.98 × 85.60 mm each.

Use the calibration PDF at Actual size or 100% when testing a Windows card
printer. Select the CR80 paper size and the printer's duplex setting. Check
the edge marks on both sides and the direction of the back. The center
ruler should measure 20 mm between the outer ticks along either axis. The
Windows driver and a physical SMART-51D still need verification.

## Laravel integration comes last

Build and verify the workflow offline first, including CR80 duplex output
on Windows. Each school will use its own account, branding, and card
template. Connect to Laravel after the offline workflow passes, starting
with staff sign-in and school isolation in two test schools.
