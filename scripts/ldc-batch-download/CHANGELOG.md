# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.0] — 2026-08-30

### Added
- **Last-download tracking.** A new `⏱ Last download: <date/time>` toolbar
  label shows when the last fully successful batch started — the
  timestamp is only recorded after that batch completes with **no
  failures, not paused, not cancelled**.
  Independently, every course whose own files all finished as `done` or
  `skipped` gets its **per-course timestamp** updated, even if other
  courses in the same batch failed. Files skipped because an identical-size
  copy already exists count as success for this purpose.
- **`🆕` updated-since-last-download badge** next to each course row, shown
  when that course has files updated (by `lastModified`) after the
  applicable baseline — the course's own last-download timestamp if it has
  one, otherwise the global last-download timestamp. A course without its
  own timestamp yet still gets a baseline this way rather than showing no
  baseline at all. On first use, before any download has completed, there
  is no baseline and no badges are shown.
- **`🆕 Select updated` toolbar button** selects every currently *visible*
  course row carrying the badge (collapsed/hidden rows are skipped) and
  **adds them to the existing selection** rather than replacing it. Stays
  disabled until there is at least one tracked timestamp and the course
  list has date metadata.
- **`LDC: Reset last-download history`** Tampermonkey menu command clears
  the global and all per-course timestamps (after a confirmation dialog),
  making every `🆕` badge disappear until the next download.

### Notes
- Last-download history is stored via `GM.setValue` / `GM.getValue`, which
  is local to the browser/profile running the script — it is **not** tied
  to the chosen destination folder. See the README's "Last-download
  tracking" section for details.
- History is written back as one atomic merge guarded by a dedicated
  `ldc-download-history` Web Lock: the stored values are re-read inside the
  lock and only the finished batch's courses are advanced (`Math.max`), so
  two tabs downloading at the same time cannot erase or roll back each
  other's timestamps, and a reset in one tab is not resurrected by the
  other.
- LDC's course dates are frequently day-granular, so a course updated later
  on the same calendar day as your download may not be distinguishable
  until it receives a newer date. See the README's "Known limitations".

## [0.8.5] — 2026-07-04

### Changed
- Version bumped to `0.8.5` to stay on the repo-wide **synchronized
  version** (all userscripts share one `@version`). No functional change
  to this script.

## [0.8.3] — 2026-07-04

### Changed
- Version bumped to `0.8.3` to adopt repo-wide **synchronized
  versioning** (all userscripts in this repo share one `@version`). No
  functional change to this script.

## [0.8.2] — 2026-05-13

### Added
- Info badge (`ℹ️`) at the rightmost of the toolbar. Hover to see
  the author (`Money Yu`) and the currently-installed script version,
  sourced live from `GM_info.script.version` so the tooltip stays in
  sync with the userscript's `@version` automatically.

## [0.8.1] — 2026-05-13

### Added
- `@icon` metadata pointing at Microsoft's favicon
  (`https://www.google.com/s2/favicons?sz=64&domain=microsoft.com`),
  matching the `ms-learn-lang-switch-*` userscripts in this repo so
  the LDC entry in the Tampermonkey dashboard / installed-scripts
  list now shows a visual identifier instead of the generic
  placeholder.

## [0.8.0] — 2026-05-13

### Added
- **Status badge in the progress panel header.** The fixed
  `Download progress` title is now status-aware:
  `⏳ Downloading…` while a batch is in flight, `✓ All done` when
  everything succeeded, `⚠ Done with N failed` when finished with
  failures, and `⏸ Paused — <reason>` while paused (e.g. on a 401
  token expiry or revoked folder permission). Answers the
  "is the batch finished yet?" question at a glance instead of
  forcing the user to mentally compare `211/614 files` against
  `total`.
- **Per-status chip row in the summary.** Underneath the totals
  line (`211/614 files · 2.97 GB / 10.9 GB`) is a new row of
  colour-matched chips: `0 failed`, `4 downloading`, `2 retrying`,
  `264 pending`, `135 skipped`. `failed` is always shown (so a
  green-zero is visible and reassuring); the rest are shown when
  non-zero, plus `downloading` is shown while the batch is still
  running. Chips reuse the existing `.ldc-status-*` colour palette
  for visual consistency with the row badges.
- **Smarter `... and N more` label.** When the visible 200 rows
  overflow, the trailer now names what's hidden — e.g.
  `... and 414 more done` when the hidden tail is uniform, or
  `... and 414 more (300 done · 114 pending)` when mixed. Top two
  statuses by count are shown.

### Changed
- **Progress list now sorts active and problematic items to the
  top.** The visible 200 rows are ordered `failed → retrying →
  downloading → pending → skipped → done`. Before this change,
  tasks were iterated in worker-queue order, so early-completed
  `done` rows filled the visible 200 and anything still running /
  failing was pushed off the bottom into `... and N more`. On a
  600-file batch this meant the panel could show a wall of `done`
  while live activity was invisible. The sort runs on a *copy* of
  `state.tasks`; the orchestrator's worker loop still walks the
  original array by index, so retry / skip-if-exists semantics are
  unaffected.

## [0.7.1] — 2026-05-13

### Fixed
- **`Name is not allowed.` error from `getDirectoryHandle` on Chromium.**
  Some LDC course titles silently end in a `U+200B` (zero-width space)
  — e.g. `AI-3008 Extract insights from visual data on Azure​` or
  `AI-3003 Develop natural language solutions in Azure​`. Recent
  Chromium versions reject such names in the File System Access API,
  so the affected courses' folders could not be created and every
  file in them failed. The path sanitizer now strips all known
  invisible / zero-width / bidi-format Unicode characters
  (`U+00AD`, `U+200B`–`U+200F`, `U+202A`–`U+202E`, `U+2060`–`U+2064`,
  `U+2066`–`U+2069`, `U+FEFF`) so the resulting folder names match
  the user-visible spelling (`…on Azure`).
- `DEL` (`U+007F`) and the C1 control range (`U+0080`–`U+009F`) are
  now treated the same as the existing C0 controls and replaced with
  `-` instead of being passed through unchanged.

### Changed
- `fsaWriter.getDirHandle` and `fsaWriter.writeStream` now include
  the offending segment in the rethrown error message (e.g.
  `Name is not allowed. (segment: "…Azure\u200b")`). Failed-files
  rows in the progress panel + `Copy errors` output therefore name
  exactly which directory or file segment the underlying API
  rejected, instead of just `Name is not allowed.` with no
  identifying context.

### Upgrade notes
- If you ran an earlier version of this script on an **older
  Chromium build** that did not yet reject `U+200B`, you may have
  on-disk folders whose names end in an invisible zero-width
  character (e.g. `AI-3008 Extract insights from visual data on
  Azure​/…`). Under 0.7.1 the script writes to the cleaned-up name
  (`…Azure/…`) instead, so re-running the batch will create a *new*
  sibling folder and re-download every file. To keep your existing
  files, rename the old folder in your file manager to drop the
  trailing invisible character (it's not visible, but tab-complete
  / paste-into-rename will reveal it) before re-running.

## [0.7.0] — 2026-05-13

### Added
- **`📊 Show progress` toolbar button.** Clicking the panel's `✕`
  used to hide the floating download-progress panel with no way to
  bring it back until the next batch started. A new always-visible
  `📊 Show progress` button now lives on the right side of the blue
  toolbar (next to `⏹ Cancel`) and re-opens the panel on demand,
  preserving the task list / progress bar / summary across hide-show
  cycles.
- Empty-state placeholder ("No downloads yet.") inside the progress
  panel, shown when the button is clicked before any batch has run,
  so the freshly opened panel isn't blank.

## [0.6.0] — 2026-05-12

### Changed
- **Repo restructured**: This script moved from `src/ldc-batch-download.user.js` to `scripts/ldc-batch-download/ldc-batch-download.user.js` as part of turning `lettucebo/LDC-Tools` into a multi-script Tampermonkey collection at `lettucebo/TampermonkeyScripts`.
- Repository renamed from `LDC-Tools` to `TampermonkeyScripts`.
- `@namespace`, `@homepageURL`, `@supportURL`, `@updateURL`, `@downloadURL` updated to point at the new repo path.
- Per-script CHANGELOG / README / tests now live alongside the userscript in `scripts/ldc-batch-download/`.

### Upgrade notes
- **Existing 0.5.0 installs will not auto-update**: the previous `@updateURL` (`.../LDC-Tools/main/src/ldc-batch-download.user.js`) no longer resolves to a file once 0.6.0 moves the source. Please manually re-install from the new URL on the README to receive 0.6.0+ updates.

## [0.5.0] — 2026-05-11

### Added
- **Shift+Click range selection on course checkboxes.** Plain click on
  a checkbox still toggles that one row, but a subsequent **Shift+Click**
  on another row now bulk-selects every visible course between the last
  clicked row (the "anchor") and this one, inclusive. The range is
  intentionally limited to **the same category** — Shift+Click across
  categories (e.g. Azure → Microsoft 365) falls through to a normal
  single-row click. Collapsed / hidden rows are not included.
- Repeated Shift+Click keeps pivoting around the same anchor (standard
  Windows Explorer / Outlook behaviour). The anchor is reset by a plain
  click on any row, or by using the toolbar's `Select all visible` /
  `Clear selection` buttons.
- New `selection.addMany(ids)` helper that batches multiple selections
  into a single change notification, so the range select doesn't churn
  the toolbar count.

### Fixed
- Make sure Shift+Click also visually checks the clicked row (the
  range's last endpoint). Drive Shift-range selection from the
  `change` event instead of `click` + `preventDefault`: stash the
  computed range in the click handler and apply it after the browser
  has committed its natural toggle. The previous attempt that used
  `preventDefault` + `queueMicrotask` did not reliably defer the DOM
  `checked` sync past the browser's legacy-canceled-activation
  revert, which left the clicked row visually unchecked even though
  the selection state correctly included it.

## [0.4.0] — 2026-05-09

### Added
- New `Sort:` dropdown in the toolbar with three modes (`Default`,
  `Updated ↓ (newest first)`, `Updated ↑ (oldest first)`). Sorting only
  reorders courses **within each category** — the order of the categories
  themselves is left untouched. The chosen mode is persisted via
  `GM.setValue` and restored on the next page load.
- Courses without any parseable date metadata stably sink to the bottom of
  their category. If no course in the API has any date field at all, the
  sort dropdown auto-disables with a ⚠️ tooltip.
- Pure helpers in `courseParser` (`parseDate`, `pickFileDate`,
  `courseLastModified`) so the sort source is testable without a browser.
  Tests grew 56 → 93 cases.

### Changed
- Sort `<select>` keeps `aria-disabled` in sync with `disabled` for
  better screen-reader behaviour.
- `courseLastModified` is documented to mirror the SPA's `Updated:` badge,
  so the sort order matches what users already see in the page.

### Fixed
- `findRowContainer` now `console.warn`s when its 6-level walk exhausts
  without finding a row container, so future LDC layout regressions are
  detectable instead of failing silently.
- `saveSortMode` now awaits `GM.setValue` so the persisted choice survives
  a fast tab close.
- Removed a dead `if (sorting) return` MutationObserver guard whose
  `sorting` flag was always already reset by the time the microtask fired;
  the same-order short-circuit inside `applySortIfNeeded` is the real
  re-entrancy guard.

## [0.3.0] — 2026-05-09

### Added
- Tampermonkey auto-update support via `@updateURL` / `@downloadURL`
  pointing at the GitHub raw URL, so installed scripts pick up new
  versions automatically.

### Changed
- Course folder names now strip the `T00` / `T00A` Microsoft training
  course version suffix (e.g. `AZ-040T00` → `AZ-040`,
  `PL-300T00A` → `PL-300`). File names themselves keep Microsoft's
  original naming.
- Hardening pass from code review: fixed resource leaks, removed dead
  code, and tightened error handling across the orchestrator and FSA
  writer.

### Fixed
- Checkbox alignment in the course list.
- Queue deadlock that could occur when `navigator.locks` was held across
  multiple tabs.

### Upgrade notes
- Folders downloaded by 0.2.x (e.g. `AZ-040T00 ...`) are treated as
  non-existent under 0.3.0 and will be re-downloaded under the new name
  (`AZ-040 ...`). To keep existing files, manually rename the old
  folders to drop the `T00` / `T00A` suffix; rename their sub-folders
  too.

## [0.2.0] — 2026-05-07

### Added
- First usable release of the LDC Batch Downloader Tampermonkey
  userscript.
  - Course batch selection, header toolbar, floating progress panel,
    preflight confirmation dialog.
  - Local writes via the File System Access API; chosen folder handle
    persisted in IndexedDB.
  - Concurrent download queue with retry, skip-if-exists, and multi-tab
    mutual exclusion via `navigator.locks`.
  - Token interception (fetch + XHR hook at `document-start`), JWT
    expiry pre-detection, and handling for HTTP 429 (rate limit) and
    401 (token expired).

[Unreleased]: https://github.com/lettucebo/TampermonkeyScripts/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/lettucebo/TampermonkeyScripts/compare/v0.8.5...v0.9.0
[0.8.5]: https://github.com/lettucebo/TampermonkeyScripts/compare/ldc-batch-download-v0.8.2...v0.8.5
[0.5.0]: https://github.com/lettucebo/TampermonkeyScripts/compare/v0.4.0...v0.5.0
