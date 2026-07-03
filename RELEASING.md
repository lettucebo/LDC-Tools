# Releasing

This repo is a collection of Tampermonkey userscripts under
`scripts/<script-id>/`. The scripts are independent in functionality but
share **one synchronized version number** using
[SemVer](https://semver.org/): every release bumps **all** scripts to the
same `@version` (even untouched ones), each aligned with its own
`CHANGELOG.md`. Because Tampermonkey never downgrades an install, the
shared version must always be **≥ the highest version any script
currently has**.

## Tag scheme

Per-script tags use the form `<script-id>-v<X.Y.Z>`, for example:

- `ldc-batch-download-v0.8.2`
- `ms-learn-lang-switch-tw-v0.3.0`
- `ms-learn-lang-switch-cn-v0.3.0`
- `github-docs-lang-switch-cn-v0.3.0`

> **Historical exceptions to the per-script tag scheme**:
>
> - `v0.4.0` and `v0.5.0` exist as legacy repo-wide tags from when
>   this repo was named `LDC-Tools` and only held the LDC Batch
>   Downloader. They map to LDC versions of those numbers.
> - `v0.3.0` was deployed via Tampermonkey's auto-update mechanism
>   and never given an explicit Git tag — that decision still stands.
> - `v1.0.0` is the repo-wide milestone tag for the May 2026
>   restructure that renamed `LDC-Tools` → `TampermonkeyScripts` and
>   moved each userscript under `scripts/<script-id>/`. It is a
>   one-off and is **not** an LDC release — LDC's continuous
>   versioning crossed that restructure as `0.5.0` → `0.6.0`.
>
> Going forward, every new tag is namespaced with its `<script-id>-`
> prefix.

## Cutting a release

> The recommended workflow is **PR-based**: branch → commits → PR →
> review → squash-merge → tag → release. Direct-to-`main` commits
> are tolerated for trivial doc fixes only.

### 1. Bump **every** script's `@version` to the new shared version

Edit the `// @version  X.Y.Z` line in **every**
`scripts/<script-id>/<script-id>.user.js` so all scripts carry the same
new version (see the synchronized-versioning rule above) — including
scripts with no functional change. Tampermonkey auto-update needs this to
trigger a fresh download for existing installs.

### 2. Update the script's CHANGELOG (and README if applicable)

In **every** `scripts/<script-id>/CHANGELOG.md`, move anything from
`## [Unreleased]` into a new `## [X.Y.Z] — YYYY-MM-DD` section (for a
script with no functional change, add an entry noting a synchronized
version bump), and update any compare-URL footnotes at the bottom of the
file.

If the change is user-facing (new toolbar button, new visible UI,
new keyboard shortcut, etc.), also update
`scripts/<script-id>/README.md` and `README.zh-TW.md` so the
documented feature list stays in sync with what users see.

### 3. Branch, PR, and squash-merge

```bash
git checkout main
git pull --ff-only
git checkout -b feat/<script-id>-v<X.Y.Z>   # or fix/... / chore/... as appropriate
git add scripts/<script-id>/
git commit -m "<conventional-commit subject>" \
           -m "<conventional-commit body>" \
           --trailer "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push -u origin feat/<script-id>-v<X.Y.Z>
gh pr create --base main --head feat/<script-id>-v<X.Y.Z> \
  --title "<conventional-commit subject>" \
  --body-file <pr-body.md>
```

**Recommended before merge** — for non-trivial changes (anything
beyond doc / metadata-only):

```bash
# Run the code-review skill or invoke /review in your assistant
node --check scripts/<script-id>/<script-id>.user.js
node scripts/<script-id>/test/pure-modules.test.js   # if the script has tests
```

Then squash-merge with the branch auto-deleted:

```bash
gh pr merge <PR#> --squash --delete-branch \
  --subject "<final commit subject>" \
  --body-file <squash-msg.txt>
```

> **Multiple versions in one PR**: it is fine to bump through
> multiple version lines inside a single PR (e.g. 0.7.0 → 0.7.1 →
> 0.8.0 → 0.8.1 → 0.8.2 as separate intermediate commits), as long
> as each gets its own `## [X.Y.Z]` CHANGELOG entry. After
> squash-merge, **tag and release only the final version**; the
> intermediate versions live in the CHANGELOG only and don't each
> get their own tag.

### 4. Create an annotated tag and push it

```bash
git checkout main
git pull --ff-only
git tag -a <script-id>-vX.Y.Z -m "vX.Y.Z"
git push origin <script-id>-vX.Y.Z
```

### 5. Create the GitHub Release from the tag

The release title is just `vX.Y.Z` — no script-id prefix, no
descriptive tail. The script-id is already in the tag name (which
GitHub displays alongside), so the title doesn't need to repeat it.

Release notes come from the matching `CHANGELOG.md` section. Two
shell-specific recipes for extracting the section:

**Git Bash / WSL / Linux / macOS** (process substitution):

```bash
gh release create <script-id>-vX.Y.Z \
  --target main \
  --title "vX.Y.Z" \
  --notes-file <(awk '/^## \[X\.Y\.Z\]/{flag=1;print;next} /^## \[/{flag=0} flag' scripts/<script-id>/CHANGELOG.md)
```

(Escape the dots in the awk regex for the literal version, e.g.
`\[0\.6\.0\]` for `v0.6.0`.)

**Windows PowerShell** (no process substitution; use a temp file):

```powershell
$changelog = Get-Content scripts\<script-id>\CHANGELOG.md -Raw
$start = $changelog.IndexOf('## [X.Y.Z]')
$end   = $changelog.IndexOf('## [', $start + 1)
if ($end -lt 0) { $end = $changelog.Length }
$notes = $changelog.Substring($start, $end - $start).TrimEnd()
$notes | Out-File -FilePath release-notes.tmp -Encoding utf8
gh release create <script-id>-vX.Y.Z `
  --target main `
  --title "vX.Y.Z" `
  --notes-file release-notes.tmp
Remove-Item release-notes.tmp
```

> **About `--latest`**: GitHub allows **only one** release in the
> entire repo to be marked "Latest" at any time. In a multi-script
> repo this is semantically slippery — marking
> `ldc-batch-download-v0.8.2` as `--latest` un-Latests whatever
> per-script release came before it, regardless of script. The
> "Latest" badge therefore means **most recent release event in
> this repo**, not "most recent release of this script".
>
> Two defensible policies:
>
> - **Always `--latest=false`** (recommended default for a
>   multi-script repo) — the Releases page sorts by date naturally
>   and no single release wears a misleading "Latest" badge.
> - **Use `--latest` only for headline shipping events** — opt-in
>   per release, with the understanding that the next `--latest`
>   release of any script will replace it.
>
> If unsure, omit the flag.

### 6. No release assets needed

Tampermonkey pulls the userscript via `@updateURL` / `@downloadURL`
from the GitHub raw URL, not from release attachments. Attaching
the `.user.js` to the release is optional and only serves archival
purposes.

## Worked examples

### `ldc-batch-download` v0.6.0 (bash)

```bash
git tag -a ldc-batch-download-v0.6.0 -m "v0.6.0"
git push origin ldc-batch-download-v0.6.0

gh release create ldc-batch-download-v0.6.0 \
  --target main \
  --title "v0.6.0" \
  --notes-file <(awk '/^## \[0\.6\.0\]/{flag=1;print;next} /^## \[/{flag=0} flag' scripts/ldc-batch-download/CHANGELOG.md)
```

### `ms-learn-lang-switch-tw` v0.3.0 (bash)

```bash
git tag -a ms-learn-lang-switch-tw-v0.3.0 -m "v0.3.0"
git push origin ms-learn-lang-switch-tw-v0.3.0

gh release create ms-learn-lang-switch-tw-v0.3.0 \
  --target main \
  --title "v0.3.0" \
  --notes-file <(awk '/^## \[0\.3\.0\]/{flag=1;print;next} /^## \[/{flag=0} flag' scripts/ms-learn-lang-switch-tw/CHANGELOG.md)
```

### `ldc-batch-download` v0.8.2 (Windows PowerShell)

```powershell
git tag -a ldc-batch-download-v0.8.2 -m "v0.8.2"
git push origin ldc-batch-download-v0.8.2

$changelog = Get-Content scripts\ldc-batch-download\CHANGELOG.md -Raw
$start = $changelog.IndexOf('## [0.8.2]')
$end   = $changelog.IndexOf('## [0.7.1]')
if ($end -lt 0) { $end = $changelog.Length }
$notes = $changelog.Substring($start, $end - $start).TrimEnd()
$notes | Out-File -FilePath release-notes.tmp -Encoding utf8
gh release create ldc-batch-download-v0.8.2 `
  --target main `
  --title "v0.8.2" `
  --notes-file release-notes.tmp
Remove-Item release-notes.tmp
```

## Verifying

- Tampermonkey users should see the new version on their next daily
  update check (or immediately if they trigger **Check for userscript
  updates**).
- The release should appear on the repo home page under "Releases",
  tagged with the per-script identifier.
- The userscript at the `@updateURL` path on `main` should now have
  the bumped `@version` in its header.
- The CHANGELOG footer's `[X.Y.Z]: https://github.com/.../compare/<prev>...<new>`
  link should resolve to a real diff (404 means the previous tag
  doesn't exist or the new tag was never pushed).

## Adding a new userscript to the repo

When you add a new userscript, scaffolded under `scripts/<new-id>/`:

1. The userscript's `@updateURL` / `@downloadURL` / `@homepageURL` /
   `@namespace` / `@supportURL` must point at the new repo paths from
   day one (see existing scripts as templates).
2. Author the script's own `README.md` (+ `README.zh-TW.md` if
   bilingual) and `CHANGELOG.md` in the same folder.
3. If the script has any pure (non-DOM) logic — parsing,
   sanitizing, lookup-table building — add `scripts/<new-id>/test/`
   with at least a `pure-modules.test.js` runnable via `node`. See
   `ldc-batch-download` for the established pattern (no test
   framework, plain `node` + a tiny `eq()` helper).
4. Update the root `README.md` / `README.zh-TW.md` index to add the
   new script.
5. Tag the first public release as `<new-id>-v<X.Y.Z>` following the
   process above.
