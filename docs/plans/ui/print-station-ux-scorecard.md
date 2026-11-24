# ID Print Station: UX scorecard

> Round 1–3 capture folders are kept out of this public repo to keep it small; only `captures/round-0-baseline/` and `captures/final/` are committed. Round notes below still describe what each round showed.

Who uses it: school office staff at the Windows NUC (1920×1080), printing CR80 student IDs.
Who else is affected: the student and guardian who carry the printed card, and portal staff who
read the archived front/back PNGs in the student's Documents.

Scores run from 1 to 10. A category is "done" at 9 or above. Each round is scored only from that
round's captures in `captures/round-N/`.

## Categories and what a 9 looks like

| # | Category | What a 9 looks like |
| --- | --- | --- | --- | --- |
| 1 | Task efficiency | Every top task hits its target count below. Search is focused on open, the first match is already previewed, and one action prints. Edits are saved by printing, so there are no separate save steps. Reprinting the last card takes one click. |
| 2 | Primary-user clarity (office staff) | At a glance the operator sees who is selected, whether the card is ready, and what is blocking it, in plain words with a button to fix each blocker. There is one obvious next action. |
| 3 | Secondary-audience clarity (printed card and archive) | The preview is large enough to read every line of front and back. Text that will be cut off or shrunk too far is flagged on the field before printing. The operator can see whether the archive PNGs will be uploaded and whether they were. |
| 4 | Visual hierarchy and density | Three calm zones (list, editor, preview) with no dead space and no long scroll for the common edits. Headings, labels and values are clearly ranked. There is exactly one filled primary button per screen. |
| 5 | Consistency | Buttons, fields, chips and states share one visual language, and the same wording is used everywhere (for example "Print ID", "Emergency contact", "Sample mode"). |
| 6 | Responsiveness | The layout is designed at 1920. 1280 keeps the same three-zone arrangement. Nothing is clipped, cards are never stretched full width, and at 1024 the columns pack instead of overflowing. |
| 7 | Feedback, states and error prevention | Loading, empty, error, unsaved, printing, printed, upload and upload-failed states are all visible where the operator is looking. Errors are in plain language with Try again. Double prints and lost edits are prevented. |
| 8 | Accessibility | Every input has a visible label. Everything works from the keyboard, with visible focus. Targets are at least 44 px. Contrast is AA or better, and status is never shown by colour alone. |

## How tasks are counted

- **Click**: one pointer click or tap.
- **Typed field**: typing into one field. Moving between fields with Tab is free.
- **Key**: one shortcut or Enter press.
- **OS print dialog**: the Windows print dialog adds one more click while "silent print" is off. That
  setting belongs to the printer, not to this UI, so it is listed separately as "+1 dialog".
- Scrolling needed to reach a control is noted.
- Both columns assume the student searched for is the first match. Both the old and the new app
  select the first match automatically, and both save edits before printing. The old app just
  never said so.
- Every count also has "+1 dialog" while Windows print-dialog mode is on.

## Task benchmark

| Task | Before (main 50f0128) | Target | Round 1 | Round 2 |
| --- | --- | --- | --- | --- |
| (a) Find a student and print their ID | 2 clicks + 1 typed (click into search, type, Print ID) | 1 typed + 1 key (type, Ctrl+P), or 1 typed + 1 click | 1 typed + 1 key (search is focused on open, then Ctrl+P), or 1 typed + 1 click. Verified by the harness. | 1 typed + 1 key. After printing, the search clears and is focused, so a 30-card run costs 1 typed field + 1 key per card (+1 dialog). Checked by the harness. |
| (b) Fix the guardian phone, then print | 3 clicks + 2 typed (click into search, type, phone field, type, Print ID, which already saved edits silently). The phone field needs scrolling at 1280 and 1024, and nothing shows that the edit is unsaved. | 1 typed + 1 click + 1 typed + 1 click or key | 1 click + 2 typed + 1 key, or 2 clicks + 2 typed (phone field, then Print ID, which saves first and says so). No scrolling at any of the three sizes. The harness checks the new phone is on the printed card. | 1 click + 2 typed + 1 key. All editable fields fit on the first screen at 1920 and 1280. Checked by the harness. |
| (c) Replace the photo, then print | 5 clicks + 1 typed (click into search, Capture Photo, Capture, Save Photo, Print ID) | 4 clicks + 1 typed | 4 clicks + 1 typed (Replace photo, Take photo, Use this photo, Print ID) | 4 clicks + 1 typed |
| (d) Reprint the last student after moving on | 2 clicks + 1 typed (click into search, type the name again, Print ID) | 1 click | 1 click (Reprint last: name, in the top bar). The harness checks the previous student’s card is sent while another student is selected. | 1 click. Checked by the harness, including Try again after a failed reprint. |
| (e) First-time setup and sign-in | Setup is impossible in the app: the token is baked in at build time from `.env.local`, which needs a developer rebuild. Sign-in takes 3 clicks + 2 typed. | Setup: 1 typed + 1 click (URL prefilled). Sign-in: 2 typed + 1 key. | Sign-in: 2 typed + 1 key (email is autofocused, Enter submits). Setup: 1 typed + 1 click in the DeviceSetup component (the school portal is preselected; the test portal is the one alternative). The component is built but not wired up yet; it waits for the new preload API. | Delivered in the real app. First run opens Device setup: the school portal is preselected, then paste the token + 1 click. Sign-in: 2 typed + 1 key. Device setup is also reachable from the lock screen (Live) and the top bar (Sample). |

## Scores

| Category | Round 0 (baseline) | Round 1 (self) | Round 1 judges (1 / 2) | Round 2 (self) | Round 2 judges (1 / 2) | Round 3 (self) | Round 3 judges (1 / 2) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 Task efficiency | 4 | 9 | 8 / 8 | 9 | 9 / 8 | 9 | 9 / 9 |
| 2 Primary-user clarity | 5 | 9 | 8 / 8 | 9 | 8 / 8 | 9 | 9 / 8 |
| 3 Secondary-audience clarity | 5 | 8 | 7 / 7 | 8 | 8 / 7 | 8 | 8 / 8 |
| 4 Visual hierarchy and density | 5 | 8 | 8 / 7 | 9 | 8 / 8 | 9 | 9 / 9 |
| 5 Consistency | 6 | 9 | 8 / 8 | 9 | 8 / 8 | 9 | 9 / 8 |
| 6 Responsiveness | 3 | 8 | 7 / 7 | 8 | 6 / 7 | 8 | 8 / 8 |
| 7 Feedback, states and error prevention | 3 | 9 | 7 / 7 | 9 | 8 / 7 | 9 | 9 / 8 |
| 8 Accessibility | 4 | 8 | 7 / 6 | 8 | 7 / 7 | 8 | 8 / 8 |

### Baseline notes (round 0, `captures/round-0-baseline/`)

- **Efficiency**: search is not focused on open. There are three separate Save buttons, no reprint
  shortcut and no keyboard print. Device setup cannot be done in the app.
- **Clarity**: the readiness list uses the same tick icon for passed and failed items, and the
  difference is only green versus red. When printing is blocked, the Print button greys out with
  no reason given. Status messages are a small line at the very bottom of the editor.
- **Card and archive**: the preview is 315 px wide on a 1920 screen. Text that will be cut off is
  not flagged. The archive upload is only mentioned in the status line after printing.
- **Hierarchy**: at 1920 the preview panel is mostly empty space, while the editor is a long scroll
  of five sections, each with its own save button.
- **Responsiveness**: at 1280 the editor column is cut off on the right (`02-app-open.1280x800`).
  At 1024 the preview is cropped and the status line, including print errors, sits below the fold
  (`13-print-error.1024x768`).
- **States**: there is no unsaved-changes indicator, and switching student silently drops edits.
  There is no Try again after a failed print or upload, no loading skeleton, and Print can be
  double-fired.
- **Accessibility**: there is no custom focus style. Buttons and inputs are 38 px. Readiness is
  shown by colour alone. The search field has a placeholder but no label.

### Round 1 notes (`captures/round-1/`)

What changed: three zones at 1920 (student list, card editor, live preview), each a component under
`src/components/`. Search is focused on open, and ↑/↓ move through results with the preview
following. Enter jumps to Print ID; Ctrl+P prints and Ctrl+S saves. There is one Print ID button,
which saves edits first. Fields show inline validation and an "Edited" mark. Text that will be cut
off on the card is measured in the preview, using the same clipping rules as the print HTML, and is
flagged on the field and next to Print ID. Blockers are listed with Fix buttons. The
save → print → file-in-portal strip shows plain-language results with Try again or Retry upload. A
"Reprint last" button sends the exact last card again. A Sample/Live badge is always visible. The
operator is asked to save or discard before switching student with unsaved edits. A ref lock stops
double prints. There are empty, loading and error states for the list, preview and camera, and a
Device setup component for the new preload API.

Self-scores and what still keeps each one below 9:

- **3 Secondary audience (8)**: at 1024 the preview cards are only about 185 px wide. The archive
  upload states (uploading, filed, failed with retry) appear only in the strip gallery, because the
  app is captured in Sample mode, where upload is skipped.
- **4 Hierarchy and density (8)**: at 1920 the editor column has empty space below the ID numbers.
  At 1280 long student names wrap to two lines in the editor header.
- **6 Responsiveness (8)**: 1280 keeps the three-zone arrangement. At 1024 the columns pack, but
  the preview is small and the printer button shows a shortened name.
- **8 Accessibility (8)**: labels, keyboard flow, visible focus and contrast are in place, and
  status always has text and an icon. Still open: no focus trap inside the photo editor and the
  switch dialog (Esc closes the photo editor), and no screen-reader pass has been done yet.

Checked by the harness on every run, which fails if any check does: (a) type + Ctrl+P prints
2026001; (b) the edited phone is in the printed card's HTML; two quick Ctrl+P presses send one job;
(d) Reprint last sends 2026001 while another student is selected; Try again after a failed reprint
repeats that reprint and not the selected student.

Not exercised against real code paths: Live upload and retry upload, the read-only operator, and a
real sign-in error. These are shown only as gallery fixtures, or not at all.

Public-repo note: the card-back artwork, a tracked template, shows a named school director and a
signature in every capture. It is template artwork, not student data, but it is a real person.

Honesty notes: `01-lock-screen` is captured from the real app in a simulated live state. It uses a
fake `.invalid` portal URL, blocks all outside network and submits nothing. Files starting with
`gallery-` are components rendered with fixture props on a dev-only page (`src/ui/harness/`). The
Device setup screen is only shown there until it is wired to the new preload API. Its fixture
follows the final device contract: no token or token hint is ever returned, the portal is a choice
between portal and preportal, and the status carries `tokenReadable` and `message`.

Harness (one command, from the repo root):
`npm exec --yes --package=playwright@1.61.1 -- node src/ui/harness/capture.mjs round-N`
(add `--baseline` to replay the round-0 script against the old UI).

### Round 2 notes (`captures/round-2/`)

Built on the merged `feature/device-setup-archive` branch. After the merge, typecheck, build,
`check:public`, `test:bridge` and `test:archive` all pass. All of its behaviour is kept: the device
token stays in the main process, portal calls go through the bridge, old token storage is removed,
the archive upload uses `renderArchiveHtml`, and Sample/Live follows `device.status()`.
`DeviceSetup` is wired to `window.gtPrint.device` with `bridgeErrorMessage`.

Round 1 judge findings, and what changed:

- **Wrong student after a search.** A new search now selects and previews its first match. No match
  clears the selection and disables Print ID. Unsaved edits ask before switching. Checked by the
  harness.
- **Stale strip messages.** The strip resets when the student changes. A blocked student shows "Not
  ready to print yet" with the blockers and Fix buttons, and Print ID's `aria-describedby` points at
  that list.
- **Printed tracking.** List rows show "Printed h:mm". Printing the same student again asks first.
  Try again after a printer error asks the operator to check for a jammed card first. After a
  successful print, the search is cleared and refocused ("print and next").
- **Device setup.** An unreadable token shows an amber "Not connected" state, with Replace token as
  the main action and no Continue. Each error appears once. Portal choice is limited to the two
  allowed hosts. No part of the token is ever shown.
- **Preview.**
  - The back is shown upright, captioned "Printed rotated for the card printer".
  - The print HTML still rotates the back. The harness checks this, and also checks that the archive
    upload is the upright copy.
  - When two cards side by side would each be under 300 px, the preview shows one large side with
    Front/Back tabs that follow the field being edited. At 1280 this gives a card about 280 px wide.
  - The print panel has a fixed height, so the preview does not jump between states.
  - A dashed "Photo needed" box appears on the preview only.
  - A long emergency contact name is flagged when it would print below about 5.6 pt.
- **Accessibility.**
  - Focus trap and Esc on the switch dialog, the duplicate and jam dialogs, the photo editor (Esc
    asks before dropping a framed photo) and the printer popover (Esc or click outside closes it).
  - Errors and warnings use `role="alert"`, and the combobox's `aria-expanded` is now correct.
  - Fix buttons, Done, side tabs and sliders are 44 px. The hint text is 12 px.
  - Contrast, computed from the CSS values: placeholder 4.89:1, amber "Edited" 6.33:1, muted text
    7.37:1, white on green 6.86:1.
- **Layout and copy.**
  - Icons no longer shrink. The placeholder reads "Name or number", the one-line hint stays at 1024,
    and grades wrap instead of truncating.
  - The editor header name truncates. The photo moved into the header, the phone sits beside the
    contact name, and LRN/ESC each have a compact "Show on card" toggle.
  - The readiness summary is back: passed checks as ticks, blockers in red with Fix.
  - While a print error shows, Try again is the filled button and Print ID is outlined.
  - Copy: "Printer said: device offline." once, "Try again" everywhere, "Emergency contact"
    everywhere.

Self-scores below 9, and why:

- **3 Card and archive (8).** At 1280 the one-side card is about 280 px wide, short of the 300 px
  target. The fixed print panel and header take the remaining height.
- **6 Responsiveness (8).** Same 1280 card size. At 1024 the editor scrolls to reach LRN/ESC, and
  long printer names are truncated (the full name is in the tooltip and accessible name).
- **8 Accessibility (8).** Keyboard, focus, target size and contrast are covered, but no
  screen-reader pass has been done. The student list uses `aria-activedescendant`, which needs a real
  assistive-technology check.

Live captures (`01*`, `02g`, `02j`, `20`–`24`) are SIMULATED. The stub bridge's `portal.request`
answers from in-memory synthetic students, and no portal is contacted. The checks the harness ran are
listed in `captures/round-2/index.md`.

### Round 3 notes (`captures/round-3/`)

Correctness:

- **Wrong-student race.** Print is disabled until the visible results belong to what is typed, and
  until the new student's edit fields and QR code are loaded. Ctrl+P or Enter pressed during a
  search waits, then acts on the first match.
- **Two worse bugs, found by the round-3 checks and fixed.**
  - The edit fields stayed one render behind after a fast switch. A print during that render saved
    the previous student's name onto the new record.
  - A late QR code could land on the next student.
  Edit fields are now tied to the student they were loaded for, and a QR result for a student who
  is no longer selected is ignored. The harness checks that the printed card and the records are
  untouched.
- **`keepSelectionRef`** is cleared on every query change the operator makes.
- **Duplicate and jam dialogs** focus the filled "Don’t print". The harness presses Enter in both
  and checks that nothing prints.
- **Upload failed:** Try again is filled, Print ID is outlined, and the retry only re-uploads.

Layout and clarity:

- **Status strip.** It sizes to its content and wraps instead of truncating; the preview shrinks
  to make room.
- **Preview at 1280.** One large side, Front/Back tabs, and a live thumbnail of the other side
  (click it to swap). The preview switches to the back when the back needs attention, and back to
  the front for each new student.
- **Printer button.** It stretches to show "SMART-51D Card Printer" at 1280. Save PDF is
  icon-only below 1400 px, with an aria-label and tooltip. "Reprint last: J. Bamba".
- **1024.** Two-column field pairs, so LRN/ESC are visible without scrolling. Short hint
  "↑↓ · Enter · Ctrl+P". Short "Show" toggles.
- **Blockers.** The strip summarises them. Fix buttons live in the header and the readiness list;
  readiness rows are status rows, not buttons, and only their 44 px Fix buttons are interactive.
  The no-match message appears once.
- **Copy.** "Ready, check fit" (amber) when the card is printable but some text is tight. The
  read-only operator sees "Print ID prints this card and files it in the student’s portal
  Documents."
- **Persistence and printed tracking.**
  - Stored per station, with every storage access guarded: the printer choice, silent print, and
    today's printed list (one key per day).
  - The list shows "Hide printed (n today)".
  - At 1920 a "Printed today" log under the editor replaces the dead space.
- **Text size.** No UI text is below 13 px; the card artwork is exempt.

**Accessibility tree** (Playwright `ariaSnapshot`, saved to `captures/round-3/a11y-student-list.txt`):
the combobox "Find a student" is `[expanded]`, `aria-controls` points at the listbox "Search
results", and `aria-activedescendant` points at the option marked `[selected]`. The harness checks
this wiring on every run. There is still no screen-reader pass: how NVDA/JAWS announce
`aria-activedescendant` changes is untested.

Self-scores below 9, and why:

- **3 Card and archive (8).** At 1280 the single card is about 240–280 px wide, depending on how
  tall the strip is.
- **6 Responsiveness (8).** Same 1280 card size, and at 1024 the printer name is truncated (the
  full name is in the tooltip and accessible name).
- **8 Accessibility (8).** No screen-reader pass has been done.

### Final batch (`captures/final/`, key states at 1920 and 1280)

The round 3 judges' verdicts were "ship" and "ship after bug 1". The exploratory tester found no P1
issues. Fixed in this batch:

- **Bug 1.** A waiting Ctrl+P is dropped when the switch question opens, and Print ID stays
  disabled while that question is open.
- **Bug 2.** A failed search, a QR failure or any new typing clears a waiting print. A failed
  search says "Search failed. Nothing was printed."
- **Bug 3.** A phone number with letters, or fewer than 7 digits, blocks printing, with the reason
  on the field, in the readiness list and in the strip.
- **Small fixes:**
  - "Hide printed" is kept between restarts.
  - The window never scrolls; only the panels do.
  - The photo editor's discard question focuses "Keep editing".
  - Device setup opened from the app has Cancel, and Esc returns focus to the trigger. Esc after an
    error focuses the error.
  - Esc in the search box clears it.
  - A blank name shows its reason in the strip even when there are unsaved edits.
  - A beforeunload prompt appears when there are unsaved edits.
  - At narrow widths the step chips fold away after a result, so the card keeps more room.
  - Refresh, the lock-screen link and the search clear button are 44 px targets.
  - At 1024 the printer name shows on two lines and the phone field is no longer clipped.
  - The gallery grid no longer overlaps.
  - A missing optional font file is skipped. The dev server sends HTML for missing files, which
    used to become a broken font face. In Electron, real fonts are `font/*` and unchanged.

The harness now runs 18 checks; the 3 new ones cover bugs 1–3.

**Below 9: follow-ups**

1. **Card and archive / responsiveness (8).** At 1280 the one-side card is about 265–285 px,
   depending on the strip. To reach 300 px, the print panel needs to move beside the card at that
   width, or the preview header needs to shrink further.
2. **Accessibility (8).** Run an NVDA pass on the Windows NUC. Check how `aria-activedescendant`
   changes in the student list are announced, and whether the strip's `role="alert"` messages are
   read once.
3. **Consistency and clarity (judge 2: 8).** Field messages and strip summaries still use slightly
   different wording for the same problem; unify them into one message table.
4. **Feedback (judge 2: 8).** On the real printer, confirm how the SMART-51D driver reports jams and
   cancels, and map those codes to plain messages.
