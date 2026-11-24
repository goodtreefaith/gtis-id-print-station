# round-0-baseline captures

Build: baseline (main before the redesign).
Mode: Sample mode only, fake print bridge, synthetic students. Outside network blocked.
Files prefixed `gallery-` are components rendered with fixture props on a dev-only page, not a live app flow.

| State | Note | Files |
| --- | --- | --- |
| 01-lock-screen | SIMULATED live mode (fake .invalid portal, network blocked, no submit) | [1920x1080](01-lock-screen.1920x1080.png) [1280x800](01-lock-screen.1280x800.png) [1024x768](01-lock-screen.1024x768.png) |
| 02-app-open | first student auto-selected; search not focused | [1920x1080](02-app-open.1920x1080.png) [1280x800](02-app-open.1280x800.png) [1024x768](02-app-open.1024x768.png) |
| 03-search-results | query "santos" | [1920x1080](03-search-results.1920x1080.png) [1280x800](03-search-results.1280x800.png) [1024x768](03-search-results.1024x768.png) |
| 04-search-empty | query with no match | [1920x1080](04-search-empty.1920x1080.png) [1280x800](04-search-empty.1280x800.png) [1024x768](04-search-empty.1024x768.png) |
| 05-student-incomplete | no photo, no guardian phone or address; Print disabled | [1920x1080](05-student-incomplete.1920x1080.png) [1280x800](05-student-incomplete.1280x800.png) [1024x768](05-student-incomplete.1024x768.png) |
| 06-long-text-student | long guardian name and address | [1920x1080](06-long-text-student.1920x1080.png) [1280x800](06-long-text-student.1280x800.png) [1024x768](06-long-text-student.1024x768.png) |
| 07-editor-scrolled | rest of the editor and printer settings | [1920x1080](07-editor-scrolled.1920x1080.png) [1280x800](07-editor-scrolled.1280x800.png) [1024x768](07-editor-scrolled.1024x768.png) |
| 08-unsaved-edit | guardian phone edited, not saved: no unsaved indicator | [1920x1080](08-unsaved-edit.1920x1080.png) [1280x800](08-unsaved-edit.1280x800.png) [1024x768](08-unsaved-edit.1024x768.png) |
| 09-photo-camera | fake camera feed | [1920x1080](09-photo-camera.1920x1080.png) [1280x800](09-photo-camera.1280x800.png) [1024x768](09-photo-camera.1024x768.png) |
| 10-photo-edit | synthetic photo chosen, crop controls | [1920x1080](10-photo-edit.1920x1080.png) [1280x800](10-photo-edit.1280x800.png) [1024x768](10-photo-edit.1024x768.png) |
| 11-printing | print in progress | [1920x1080](11-printing.1920x1080.png) [1280x800](11-printing.1280x800.png) [1024x768](11-printing.1024x768.png) |
| 12-print-done | print finished (sample) | [1920x1080](12-print-done.1920x1080.png) [1280x800](12-print-done.1280x800.png) [1024x768](12-print-done.1024x768.png) |
| 13-print-error | print failed (sample error) | [1920x1080](13-print-error.1920x1080.png) [1280x800](13-print-error.1280x800.png) [1024x768](13-print-error.1024x768.png) |
| 14-pdf-saved | PDF saved (sample path) | [1920x1080](14-pdf-saved.1920x1080.png) [1280x800](14-pdf-saved.1280x800.png) [1024x768](14-pdf-saved.1024x768.png) |
