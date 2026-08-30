# Releasing

This repo is a collection of Tampermonkey userscripts under
`scripts/<script-id>/`. The scripts are independent in functionality but
share **one synchronized version number** using
[SemVer](https://semver.org/): every release bumps **all** scripts to the
same `@version` (even untouched ones), each aligned with its own
`CHANGELOG.md`. Because Tampermonkey never downgrades an install, the
shared version must always be **≥ the highest version any script
currently has**.

> **Prefer the `release` skill.** `.github/skills/release/SKILL.md`
> walks through this entire process, including the non-negotiable
> ordering rules (never skip CI, never tag an unverified commit, never
> delete a legacy release before its replacement is verified, never
> reuse `v1.0.0`) and failure recovery. This document is the reference
> for what each step does and why; the skill is the checklist to follow
> when actually cutting a release.

## Tag scheme

Because all scripts share one synchronized version, each release is a
**single repo-wide tag** `v<X.Y.Z>` plus **one** GitHub Release that
covers every script — for example `v0.9.0`. Do **not** create per-script
`<script-id>-v<X.Y.Z>` tags; that was the old scheme and is no longer
used for any current release.

> **Tag history**:
>
> - `v0.4.0`, `v0.5.0` are legacy repo-wide tags (the `LDC-Tools` era and
>   the May 2026 `TampermonkeyScripts` restructure). The synchronized
>   `v<X.Y.Z>` release tags (`v0.8.5`, `v0.9.0`, …) continue this single
>   repo-wide line.
> - `v1.0.0` was a legacy repo-wide tag/Release that predated
>   synchronized versioning and did not correspond to any script's real
>   version at that commit. It has been **permanently retired**: once
>   deleted, it must never be recreated or reused for any future
>   release, because existing clones/forks may still hold the old
>   annotated tag and a plain `git fetch --tags` will not overwrite an
>   existing same-name tag — reusing the name would make `v1.0.0` point
>   to different commits for different people. `tools/validate.mjs`
>   enforces this by hard-excluding `v1.0.0` from release-baseline
>   selection. Future `1.x` releases must start at `1.0.1` or later
>   (e.g. `1.1.0`, `2.0.0`), never `1.0.0` again.
> - Older per-script tags (`ldc-batch-download-v0.8.2`,
>   `ms-learn-lang-switch-tw-v0.3.0`, etc.) predate synchronization and
>   remain for history, but no new per-script tags are created.
> - Intermediate versions that are bumped in the CHANGELOG but never
>   separately tagged (e.g. `0.8.3`, `0.8.4`) live in the CHANGELOG only —
>   only the final synchronized version of a release cut gets the tag.

## Automated validation and release tooling

This repo has deterministic, dependency-free Node.js tooling in
`tools/`, run identically by a developer locally and by CI:

- **`node tools/validate.mjs`** — validates that every `scripts/<id>/`
  folder has `<id>.user.js` and `CHANGELOG.md`; runs `node --check` and
  metadata lint (`@namespace`, `@updateURL`, `@downloadURL`,
  `@homepageURL`, `@supportURL`, `@license MIT`) on every userscript;
  requires every `@version` to be identical; requires each script's
  `CHANGELOG.md` to have a single, non-empty, first-after-`[Unreleased]`
  section matching that version. With no flags it also runs **PR/push
  mode**: the current version must be `>=` the version on
  `refs/remotes/origin/main` (never lower). With
  **`--release-tag vX.Y.Z`** it instead runs **release mode**: the
  current version must equal the tag's version and be **strictly
  greater** than the best matching prior synchronized repo-wide tag
  (legacy per-script tags and the permanently retired `v1.0.0` are
  excluded from consideration).
- **`node tools/run-tests.mjs`** — discovers and runs every
  `scripts/*/test/*.test.js`; finding zero test files is treated as a
  failure (to catch a broken glob rather than silently passing).
- **`node tools/release-notes.mjs <version>`** — deterministically
  builds combined release notes: the root `CHANGELOG.md`'s
  `## [X.Y.Z]` section (repo-level changes) followed by every script's
  `## [X.Y.Z]` section, in place of manually copy-pasting changelog
  text.

Run both validators locally before opening a release PR:

```bash
node tools/validate.mjs
node tools/run-tests.mjs
```

```powershell
node tools\validate.mjs
node tools\run-tests.mjs
```

## CI and release automation

- **`.github/workflows/ci.yml`** (workflow name `CI`, job `Validate and
  test`) runs on every pull request, on `push` to `main`, and on manual
  `workflow_dispatch`. It fetches `origin/main` explicitly (so the
  non-downgrade baseline check always has something to compare against)
  and runs `node tools/validate.mjs` then `node tools/run-tests.mjs`.
- **`.github/workflows/release.yml`** (workflow name `Release`, job
  `Validate, test, and release`) runs on `push` of a `v*.*.*` tag, and
  optionally as a `workflow_dispatch` dry run. On a real tag push it:
  validates the tag against a strict `^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`
  regex (the trigger glob alone would allow malformed/prerelease-style
  tags through); fetches `origin/main` and requires the tagged commit to
  equal `origin/main`'s tip (refuses to release an unmerged/rewritten
  commit); runs `node tools/validate.mjs --release-tag vX.Y.Z` and
  `node tools/run-tests.mjs`; generates notes with
  `node tools/release-notes.mjs`; and runs
  `gh release create vX.Y.Z --title vX.Y.Z --notes-file release-notes.md
  --latest --verify-tag`. It authenticates `gh` via an explicit
  `GH_TOKEN: ${{ github.token }}` env var (the `contents: write`
  permission alone does not hand `gh` a credential), reads untrusted
  values (`inputs.release_tag`, `github.ref_name`) through `env:` into
  shell variables instead of interpolating them directly into `run:`
  (blocks shell/script injection from a crafted dispatch input), and
  uses `--verify-tag` so `gh` refuses to fabricate a release against a
  tag that doesn't exist. A `workflow_dispatch` run only validates a
  supplied tag string against `main`'s tip and never creates, deletes,
  or pushes anything.

Any failing step aborts before a Release is created (fail-closed).

## Cutting a release

> The recommended workflow is **PR-based**: branch → commits → PR →
> review → CI green → squash-merge → `main` CI green → tag → release
> workflow verified. Direct-to-`main` commits are tolerated for trivial
> doc fixes only.

### 1. Bump **every** script's `@version` to the new shared version

Edit the `// @version  X.Y.Z` line in **every**
`scripts/<script-id>/<script-id>.user.js` so all scripts carry the same
new version (see the synchronized-versioning rule above) — including
scripts with no functional change. Tampermonkey auto-update needs this to
trigger a fresh download for existing installs.

### 2. Update the changelogs (and README if applicable)

In **every** `scripts/<script-id>/CHANGELOG.md`, move anything from
`## [Unreleased]` into a new `## [X.Y.Z] — YYYY-MM-DD` section (for a
script with no functional change, add an entry noting a synchronized
version bump), and update any compare-URL footnotes at the bottom of the
file.

Also add a `## [X.Y.Z] — YYYY-MM-DD` section to the **root**
`CHANGELOG.md` for repo-level changes (CI, tooling, docs, skills) — this
is what makes those changes show up in the combined release notes.

If the change is user-facing (new toolbar button, new visible UI,
new keyboard shortcut, etc.), also update
`scripts/<script-id>/README.md` and `README.zh-TW.md` so the
documented feature list stays in sync with what users see.

### 3. Local validation

```bash
node tools/validate.mjs
node tools/run-tests.mjs
```

Both must pass before opening a PR.

### 4. Branch, PR, and squash-merge

```bash
git checkout main
git pull --ff-only
git checkout -b chore/release-vX.Y.Z
git add -A
git commit -m "chore(release): synchronize all userscripts to vX.Y.Z" \
           --trailer "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push -u origin chore/release-vX.Y.Z
gh pr create --base main --head chore/release-vX.Y.Z \
  --title "chore(release): vX.Y.Z" --body-file <pr-body.md>
```

```powershell
git checkout main
git pull --ff-only
git checkout -b chore/release-vX.Y.Z
git add -A
git commit -m "chore(release): synchronize all userscripts to vX.Y.Z" `
           --trailer "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push -u origin chore/release-vX.Y.Z
gh pr create --base main --head chore/release-vX.Y.Z `
  --title "chore(release): vX.Y.Z" --body-file <pr-body.md>
```

Confirm the `CI` workflow's `Validate and test` job is green **on the
PR's actual head SHA** before merging — don't rely on an at-a-glance
green badge, since this repo has other checks (e.g. a Copilot review
check) that are easy to mistake for CI:

```bash
gh pr checks <PR#> --required
```

Then squash-merge with the branch auto-deleted:

```bash
gh pr merge <PR#> --squash --delete-branch
```

> **Multiple versions in one PR**: it is fine to bump through
> multiple version lines inside a single PR (e.g. 0.7.0 → 0.7.1 →
> 0.8.0 → 0.8.1 → 0.8.2 as separate intermediate commits), as long
> as each gets its own `## [X.Y.Z]` CHANGELOG entry. After
> squash-merge, **tag and release only the final version**; the
> intermediate versions live in the CHANGELOG only and don't each
> get their own tag.

### 5. Wait for `main` CI, then create the tag

Wait for the `push`-to-`main` `CI` run to go green before tagging:

```bash
gh run list --workflow ci.yml --branch main --limit 1
gh run watch <run-id>
```

Then verify the local `main` you're about to tag is exactly
`origin/main`'s tip, and only then tag and push:

```bash
git checkout main
git pull --ff-only
git fetch origin main:refs/remotes/origin/main
test "$(git rev-parse main)" = "$(git rev-parse refs/remotes/origin/main)" && echo OK
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

```powershell
git checkout main
git pull --ff-only
git fetch origin main:refs/remotes/origin/main
if ((git rev-parse main) -eq (git rev-parse refs/remotes/origin/main)) { 'OK' }
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

### 6. Let the Release workflow publish it, then verify

Pushing the tag triggers `.github/workflows/release.yml`, which
validates and tests again, generates notes via
`node tools/release-notes.mjs`, and creates the GitHub Release
automatically. Verify it actually succeeded — do not assume:

```bash
gh run list --workflow release.yml --limit 1
gh run watch <run-id>
gh release view vX.Y.Z
```

Confirm the run concluded `success`, the release is titled `vX.Y.Z` and
marked Latest, its target commit matches the peeled tag commit and
`origin/main`'s tip, and the notes contain both the root `CHANGELOG.md`
section and every script's section.

### 7. No release assets needed

Tampermonkey pulls the userscript via `@updateURL` / `@downloadURL`
from the GitHub raw URL, not from release attachments. Attaching
the `.user.js` to the release is optional and only serves archival
purposes.

## Failure recovery — tag pushed but the release workflow failed

If `release.yml` fails after the tag has already been pushed, you have a
tag with no (or a partial) Release. **Do not just re-run the failed
workflow run** — GitHub reruns reuse the original
`GITHUB_SHA`/`GITHUB_REF` and will not pick up a workflow fix made
afterward. Instead:

```bash
gh release delete vX.Y.Z --yes 2>/dev/null || true   # only if a partial release exists
git push origin :refs/tags/vX.Y.Z
git tag -d vX.Y.Z
# fix the underlying problem, re-verify the origin/main equality check, then:
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

**Never change any script's content to work around this.** A version's
script content is frozen the moment it lands on `main` (raw URLs are
public immediately). If the underlying bug is in the scripts themselves
rather than the release plumbing, abandon this version number and ship
the fix as the next PATCH release instead (e.g. a bug discovered right
after `0.9.0` ships is fixed in `0.9.1`, not by altering what `0.9.0`
serves).

## Retiring a legacy release/tag

Only retire a release/tag **after its replacement release has been
confirmed successful** (Release workflow run green, `gh release view`
shows it) — never delete the old one first as a "cleanup" step before
the new one is verified. `gh release delete <TAG>` does not remove the
tag unless `--cleanup-tag` is passed, so delete the release, then the
remote tag, then the local tag, in that order (deleting the tag first
would leave an orphaned release pointing at nothing):

```bash
gh release delete <old-tag>
git push origin :refs/tags/<old-tag>
git tag -d <old-tag>
```

Other clones/forks must run `git fetch --prune --prune-tags` to see the
deletion; it does not propagate automatically. If the tag being retired
is `v1.0.0`, it is **permanently** off-limits for reuse afterward (see
Tag history above) — this is a one-time historical cleanup, not a
repeatable pattern.

## Verifying

- Tampermonkey users should see the new version on their next daily
  update check (or immediately if they trigger **Check for userscript
  updates**).
- The release should appear on the repo home page under "Releases",
  tagged `vX.Y.Z` and marked Latest.
- The userscript at each `@updateURL` path on `main` should now have
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
   bilingual) and `CHANGELOG.md` in the same folder, starting from
   whatever the current synchronized shared version is (see
   `.github/copilot-instructions.md` → Versioning) — never `1.0.0`.
3. If the script has any pure (non-DOM) logic — parsing,
   sanitizing, lookup-table building — add `scripts/<new-id>/test/`
   with at least a `pure-modules.test.js` runnable via `node`
   (`tools/run-tests.mjs` discovers `scripts/*/test/*.test.js`
   automatically). See `ldc-batch-download` for the established
   pattern (no test framework, plain `node` + a tiny `eq()` helper).
4. Update the root `README.md` / `README.zh-TW.md` index to add the
   new script.
5. Run `node tools/validate.mjs` and `node tools/run-tests.mjs` locally,
   then follow "Cutting a release" above — the new script is folded
   into the next synchronized `vX.Y.Z` release like any other script;
   it does not get its own tag.
