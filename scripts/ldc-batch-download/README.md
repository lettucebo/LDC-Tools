English | [繁體中文](./README.zh-TW.md)

# LDC Batch Downloader

> A Tampermonkey userscript that lets you tick multiple courses on
> [Microsoft Learning Download Center](https://learningdownloadcenter.microsoft.com/)
> and batch download them to a local folder, automatically organized into
> `{course-code} {course-name}/{course-code}-{language}/`.

## What it does

By default LDC's "Download" button only downloads one course at a time, and
each one has to be opened individually. This userscript adds, on top of the
original site:

- A ✅ checkbox next to every course row
- A header toolbar: pick folder / select all / clear / 🆕 select updated /
  download / 📊 show progress
- A floating progress panel (with retry-on-failure and copy-error-list)
- A pre-flight confirmation dialog (course count / file count / total size /
  destination)
- Last-download tracking: a `⏱ Last download` label and `🆕` badges that
  highlight courses updated since you last downloaded them (see
  [Last-download tracking](#last-download-tracking) below)

The resulting local folder layout looks like this:

```
your chosen folder/
├─ AZ-040 Automate Administration with PowerShell/      ← note: T00 is stripped automatically
│  ├─ AZ-040-English/
│  │  ├─ AZ-040T00A-ENU-Change-Log.pdf                  ← file names keep Microsoft's original naming
│  │  ├─ AZ-040T00A-ENU-Powerpoint.zip
│  │  └─ AZ-040T00A-ENU-TrainerPrepGuide.pdf
│  └─ AZ-040-Japanese/
│     ├─ AZ-040T00-PowerPoint.ja-JP.zip
│     └─ AZ-040T00-Readme.ja-JP.txt
└─ AI-3017 Microsoft AI for business leaders/
   ├─ AI-3017-Arabic/
   ├─ AI-3017-Chinese Simplified/
   └─ ...
```

> **Folder naming rule**: if the course code ends in `T00` or `T00A` (a
> Microsoft training-course version suffix), it is stripped, e.g.
> `AZ-040T00` → `AZ-040`, `PL-300T00A` → `PL-300`. Codes without `T00`
> (`AZ-1002`, `AI-3017`, `AZ-2003`, etc.) are left as-is.
> **File names themselves** (e.g. `AZ-040T00A-ENU-Powerpoint.zip`) keep
> Microsoft's original naming and are not rewritten.

> **Upgrading from 0.2.x**: previously downloaded folders (`AZ-040T00 ...`)
> will be treated as non-existent by the script and re-downloaded under the
> new name (`AZ-040 ...`). To keep your existing files and avoid
> re-downloading, manually rename the old folders (drop the `T00` / `T00A`
> suffix); rename the sub-folders too.


## Browser requirements

**Chromium-based browsers (Chrome / Edge / Brave / Opera, etc.)**.
The script writes directly into your chosen folder via the
[File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API),
which Firefox does not currently support.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/)
   (available in the Chrome / Edge / Brave stores)
2. Click the link below; Tampermonkey will pop up an install dialog:

   👉 **[Install ldc-batch-download.user.js](https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ldc-batch-download/ldc-batch-download.user.js)**
   <br/>💡 _**Ctrl/Cmd-click** (or middle-click) the link above to open it in a new tab — GitHub strips `target="_blank"` so plain clicks navigate this tab away._

3. Click **Install**
4. Open <https://learningdownloadcenter.microsoft.com/>.
   After signing in, the blue "LDC Batch Downloader" toolbar should appear in
   the page header.

> **If clicking the link shows the raw source code instead of an install
> dialog**:
>
> - Make sure the Tampermonkey extension is installed and enabled
> - Chrome 117+ requires **Developer mode** to be enabled at
>   `chrome://extensions` so Tampermonkey can trigger the install dialog
> - Still no luck? Install manually: open the Tampermonkey dashboard →
>   **Utilities** → **Import from URL** and paste the raw URL above.

## Auto-update

The script header sets `@updateURL` / `@downloadURL` to the GitHub raw URL,
and Tampermonkey checks for new versions **once per day** by default
(adjustable in Tampermonkey settings → **Externals** → *Update interval* —
immediately, hourly, or off).

When the `@version` on GitHub is higher than the local one, Tampermonkey
will automatically download the new version and prompt you.

To trigger a check immediately:

- Tampermonkey dashboard → find **LDC Batch Downloader** → click the ⟳ icon
  in the **last updated** column to force a check
- Or click **Check for userscript updates** from the Tampermonkey icon menu

## Usage

1. **First-time use**: click `📁 Choose folder` in the header and pick a
   local folder to store courses (e.g. `D:\OneDrive\MTT\Decks` or any path).
   - The browser opens its folder picker and asks for permission
   - The folder is remembered after authorization, so you don't have to
     pick it again next time
2. **Tick courses**: check the courses you want to download (across
   categories and languages is fine)
   - **Click** a checkbox to toggle that one row
   - **Shift+Click** another row to bulk-select every visible course
     between the last clicked row and this one (range is limited to
     courses inside the **same category**)
3. **Download**: click `⬇ Download selected`
   - A confirmation dialog shows up first (course count / file count /
     total size)
   - Click `Start download` to begin
4. The floating progress panel shows the live status of every file
   - Files that already exist with the same size are skipped (so you can
     re-run the same batch)
   - Failed files are displayed in the panel and you can "copy error list"
5. **On later visits**: check the `⏱ Last download` label in the toolbar,
   then click `🆕 Select updated` to add every visible course updated
   since that baseline to your current selection (see
   [Last-download tracking](#last-download-tracking) below for details)

## Tampermonkey menu commands

Click the Tampermonkey icon → LDC Batch Downloader to access:

- `LDC: Reset chosen folder` — clear the remembered folder; you'll be asked
  again next time
- `LDC: Set concurrency (1-4)` — change the parallel download count
  (default is 2)
- `LDC: Token status` — show how long the current auth token is valid for
- `LDC: Reset last-download history` — after a confirmation prompt, clears
  the global `⏱ Last download` timestamp and every per-course timestamp;
  all `🆕` badges disappear until you download again

## Sort by last-updated date

There is a `Sort:` dropdown on the right side of the toolbar with three modes:

- `Sort: Default` — keep LDC's original order
- `Sort: Updated ↓ (newest first)` — sort by most-recent update, newest first
- `Sort: Updated ↑ (oldest first)` — sort by most-recent update, oldest first

Behavior:

- **Sorting only happens within each category.** The order of the categories themselves never changes.
- A course's "updated date" is the maximum `lastModified` across all of its files.
- Courses without any date metadata stably sink to the bottom of their category.
- The order is reapplied when you switch modes or expand a new category. Switching back to `Default` restores LDC's original order on the next page reload.
- Your choice is persisted with `GM.setValue` and restored the next time you open the site.
- If the LDC API ever omits all date fields, the dropdown auto-disables and shows a ⚠️ tooltip.

## Last-download tracking

The toolbar remembers when you last successfully downloaded, so you can spot
which courses have new content without re-checking every row by hand.

- **`⏱ Last download: <date/time>`** in the toolbar shows when the last
  *fully successful* batch **started**. The timestamp is only recorded
  after that batch completes with **no failures, not paused, and not
  cancelled** — a batch that ends with any failed file, or one you
  cancel/pause partway through, never moves this label. Hover it for the
  full local timestamp and how many courses have their own tracked
  timestamp.
- **Per-course timestamps advance independently.** Even inside a batch that
  has failures elsewhere, every course whose own files *all* finished as
  `done` or `skipped` gets its per-course timestamp updated — one failing
  course does not hold back the others.
- **Skipped (same-size) files count as success.** A file skipped because an
  identical-size copy already exists on disk counts toward that course's/
  batch's completion; it is not treated as a failure.
- **`🆕` badge** appears next to a course row when that course has files
  updated (by `lastModified`) after the applicable baseline: the course's
  *own* last-download timestamp if one is tracked, otherwise the *global*
  `⏱ Last download` timestamp. A course you've never downloaded before still
  gets a baseline this way (falling back to the global timestamp) instead of
  showing no baseline at all. **On first use** — before you've completed any
  download — there is no baseline yet, so **no badges are shown**.
- **`🆕 Select updated` button** selects every *currently visible* course row
  carrying the `🆕` badge (collapsed/hidden rows and categories are
  skipped) and **adds them to your existing selection** rather than
  replacing it. It stays disabled until there is at least one tracked
  timestamp and the course list has date metadata.
- **`LDC: Reset last-download history`** (Tampermonkey menu, see above)
  clears both the global and every per-course timestamp after a
  confirmation prompt; all `🆕` badges disappear until you download again.

### Storage limitation

Last-download history is stored with `GM.setValue` / `GM.getValue`, which is
**local to the browser profile running the userscript** — it is *not* tied
to your chosen destination folder. In practice:

- Downloading into the **same destination folder** from a different browser,
  browser profile, or machine starts with no history (no `🆕` badges), even
  though the files already exist on disk there.
- Conversely, switching to a **different destination folder** in the same
  browser/profile keeps your existing last-download history — the `🆕`
  badges and `⏱ Last download` label are unaffected by which folder you pick.

## Behavior details

| Situation | Handling |
|---|---|
| File already exists with the same size | Skip |
| File exists but size differs | Overwrite (v1 default policy) |
| Large files (100MB+) | Streamed write (`response.body.pipeTo`); the whole file is never held in memory |
| Network error / 5xx | Auto-retry up to 3 times (1s → 3s → 9s back-off) |
| 429 rate limited | Pause according to `Retry-After`, drop global concurrency to 1 |
| 401 token expired | Pause the whole batch and prompt to refresh the page |
| Tab closed mid-download | Whole batch aborted; rerunning skips already-completed files |
| Multiple tabs open at once | Mutually excluded via `navigator.locks`; the second tab is blocked |
| Global `⏱ Last download` label | Advances only after a batch that finishes with no failures, not paused, not cancelled |
| Per-course last-download timestamp | Advances independently for any course whose own files all finished `done`/`skipped`, even if other courses in the batch failed |
| Skipped (same-size) file, for tracking purposes | Counts as success toward the course's/batch's completion |

## Known limitations

- ❌ Firefox is not supported (no File System Access API)
- ❌ No cross-session resume (you have to rerun the batch after a browser
  restart, but already-downloaded files are skipped automatically)
- ❌ No per-file exclusion (once a course is ticked, all its files are
  downloaded)
- ❌ No "expand every category and download the whole site" shortcut (to
  prevent accidental misuse)
- ❌ Last-download history is local to the browser/profile/machine running
  the script, not tied to the destination folder — see
  [Storage limitation](#storage-limitation) above

## Development

```powershell
# Run the pure-function tests
node scripts\ldc-batch-download\test\pure-modules.test.js

# Syntax check
node --check scripts\ldc-batch-download\ldc-batch-download.user.js
```

## Architecture

`scripts/ldc-batch-download/ldc-batch-download.user.js` is a single-file IIFE, modularized
internally:

| Module | Responsibility |
|---|---|
| `tokenInterceptor` | Hooks `fetch` + XHR at `document-start`, intercepts the SPA's ****** JWT exp pre-expiry detection |
| `api` | `getSearchTree()` / `downloadStream()`; HTTP error classification |
| `courseParser` | Parses row titles (`AZ-040T00: ... (Japanese)`) into canonical folder names |
| `pathSanitizer` | Windows illegal characters / reserved names / length limits |
| `treeIndex` | Builds a lookup table from `/api/search` results, classifies category vs course |
| `fsaWriter` | File System Access API wrapper, persists handle in IndexedDB |
| `selection` | Selection state (keyed by stable ID) |
| `orchestrator` | Concurrent queue, retry, skip-if-exists, multi-tab `navigator.locks` |
| `ui` | Toolbar, checkbox injection, progress panel, preflight dialog |

Reverse-engineered LDC API:

- `GET /api/search` — returns the full course tree in one call, including
  each file's `versionId` / `url` / `language` / `size`
- `GET /api/download?blobPath=X&versionId=Y` — returns the file binary
  (requires `Authorization: ******

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

MIT
