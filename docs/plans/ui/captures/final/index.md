# final captures

Build: this round's working tree.
Fake print/portal bridge (src/ui/harness/bridgeStub.js), synthetic students, outside network blocked.
Notes marked SIMULATED live use the stub portal: the app is in Live mode, but no portal is contacted.
Files prefixed `gallery-` are components rendered with fixture props on a dev-only page, not a live app flow.

Checks passed this run:

- (a) type + Ctrl+P prints the first match; search is cleared and focused after printing
- (b) edited phone is on the printed card; Print ID saved first
- A new search selects its first match; no match clears the selection and disables Print ID
- Reprinting an already-printed student asks first; double Ctrl+P sends one job
- (d) Reprint last asks first (safe button focused), then sends the previous student while another is selected
- Try again after a printer error asks about a jam, then repeats the same reprint
- Preview back is upright; print HTML back still rotated
- Duplicate and jam dialogs focus "Don’t print": a stray Enter never prints
- Print-and-next cost per card: 1 typed field + 1 key (Ctrl+P), +1 click if the Windows dialog is on; about 2808 ms per card with the stub's 1.8 s print
- Ctrl+P right after typing waits for the search, then prints its first match
- Typing straight after a print selects the new match
- Enter right after typing waits for the search, then moves focus to Print ID
- Combobox: aria-activedescendant → student-option-stu-2026001 (role=option, aria-selected=true, listbox expanded); accessibility tree saved to a11y-student-list.txt
- Printer setting and today’s printed marks are kept after a restart
- Unsaved edits + new search + Ctrl+P: asks to switch, prints nothing, saves nothing
- A phone with letters or under 7 digits blocks printing, with the reason in the strip
- A failed search shows "Search failed. Nothing was printed." and a later search prints nothing by itself
- Printed-today storage holds only student id → time; older day keys are deleted on startup
- Waiting Ctrl+P: several matches → no print, "Several matches" + Print ID focused; exact number prints; picking a student cancels it


| State | Note | Files |
| --- | --- | --- |
| 01-sign-in | SIMULATED live lock screen | [1920x1080](01-sign-in.1920x1080.png) [1280x800](01-sign-in.1280x800.png) |
| 02-sign-in-error | SIMULATED live: wrong password | [1920x1080](02-sign-in-error.1920x1080.png) [1280x800](02-sign-in-error.1280x800.png) |
| 03b-live-app-open | SIMULATED live: signed in, Live badge with the portal host | [1920x1080](03b-live-app-open.1920x1080.png) [1280x800](03b-live-app-open.1280x800.png) |
| 03-ready | Sample mode, ready to print | [1920x1080](03-ready.1920x1080.png) [1280x800](03-ready.1280x800.png) |
| 04-blocked | blocked student: photo needed, emergency contact | [1920x1080](04-blocked.1920x1080.png) [1280x800](04-blocked.1280x800.png) |
| 05-invalid-phone | phone with letters blocks printing | [1920x1080](05-invalid-phone.1920x1080.png) [1280x800](05-invalid-phone.1280x800.png) |
| 06-printed-next | print and next (Ctrl+P), search cleared for the next name | [1920x1080](06-printed-next.1920x1080.png) [1280x800](06-printed-next.1280x800.png) |
| 07-print-error | print failed: Try again is the main action | [1920x1080](07-print-error.1920x1080.png) [1280x800](07-print-error.1280x800.png) |
| 08-live-filed | SIMULATED live: printed and filed in the portal | [1920x1080](08-live-filed.1920x1080.png) [1280x800](08-live-filed.1280x800.png) |
| 09-live-upload-failed | SIMULATED live: printed, upload failed, Try again | [1920x1080](09-live-upload-failed.1920x1080.png) [1280x800](09-live-upload-failed.1280x800.png) |
| 10-search-failed | SIMULATED live: search failed while a print was waiting | [1920x1080](10-search-failed.1920x1080.png) [1280x800](10-search-failed.1280x800.png) |
