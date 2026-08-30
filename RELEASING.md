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
>   enforces this two ways: it hard-excludes `v1.0.0` from
>   release-baseline *candidate* selection, **and** `--release-tag
>   v1.0.0` itself is rejected outright with a `FAIL [release] ...
>   permanently retired` error, before any version-equality or
>   strictly-greater check even runs — so this fails closed even if a
>   future script version happened to be `1.0.0` and a valid prior
>   baseline existed. Future `1.x` releases must start at `1.0.1` or
>   later (e.g. `1.1.0`, `2.0.0`), never `1.0.0` again.
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
  section matching that version. It accepts exactly two argument shapes —
  no arguments, or `--release-tag <value>` as two separate arguments.
  Anything else (`--release-tag=vX.Y.Z`, a misspelled flag, a stray
  positional, a repeated flag) is a hard `FAIL [args]`, never a silent
  fallback to the weaker mode. With no flags it runs **PR/push mode**:
  the current version must be `>=` the version on
  `refs/remotes/origin/main` (never lower). With
  **`--release-tag vX.Y.Z`** it instead runs **release mode**: the
  release tag itself is rejected outright if it is `v1.0.0` (the
  permanently retired tag — see Tag history above), independent of any
  other check; otherwise the current version must equal the tag's
  version and be **strictly greater** than the best matching prior
  synchronized repo-wide tag. Baseline candidates must be core `vX.Y.Z`
  tags (prerelease/build-metadata tags such as `v9.9.9-rc.1` are
  rejected, matching the workflow's tag regex), must not be `v1.0.0` or
  the tag being released, and must be **ancestors of
  `refs/remotes/origin/main`** — an off-main tag can never define the
  baseline, and if `refs/remotes/origin/main` is missing the check fails
  closed instead of considering every tag in the repository.
- **`node --test "tools/test/*.test.mjs"`** — the release tooling's own
  test suite (strict CLI argument parsing, core-only tag parsing, the
  `v1.0.0` tombstone, on-main baseline selection). These protect the
  release gate itself, so CI and the release workflow both run them.
- **`node tools/run-tests.mjs`** — discovers and runs every
  `scripts/*/test/*.test.js`; finding zero test files is treated as a
  failure (to catch a broken glob rather than silently passing).
- **`node tools/release-notes.mjs <version>`** — deterministically
  builds combined release notes: the root `CHANGELOG.md`'s
  `## [X.Y.Z]` section (repo-level changes) followed by every script's
  `## [X.Y.Z]` section, in place of manually copy-pasting changelog
  text.

Run all three locally before opening a release PR:

```bash
node tools/validate.mjs
node --test "tools/test/*.test.mjs"
node tools/run-tests.mjs
```

```powershell
node tools\validate.mjs
node --test "tools/test/*.test.mjs"
node tools\run-tests.mjs
```

## CI and release automation

- **`.github/workflows/ci.yml`** (workflow name `CI`, job `Validate and
  test`) runs on every pull request, on `push` to `main`, and on manual
  `workflow_dispatch`. It fetches `origin/main` explicitly (so the
  non-downgrade baseline check always has something to compare against)
  and runs `node tools/validate.mjs`,
  `node --test "tools/test/*.test.mjs"`, then `node tools/run-tests.mjs`.
- **`.github/workflows/release.yml`** (workflow name `Release`) runs on
  `push` of a `v*.*.*` tag, and optionally as a `workflow_dispatch` dry
  run. The workflow's default permission is `contents: read` and it is
  split into two jobs:
  - **`Validate and test (read-only)`** — `contents: read`, **no
    `GH_TOKEN`**, checkout with `persist-credentials: false`, so nothing
    in the validation path (including every manual dry run) holds a
    credential that could create, move, or delete anything. It resolves
    the tag from `github.ref_name` (or, for a dry run, the dispatch
    input) via `env:` variables rather than `run:` interpolation,
    enforces the strict
    `^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$` regex (the
    trigger glob alone would allow malformed/prerelease-style tags
    through), requires the commit under test to equal `origin/main`'s
    tip, and then runs `node tools/validate.mjs --release-tag vX.Y.Z`,
    `node --test "tools/test/*.test.mjs"`, `node tools/run-tests.mjs`
    and `node tools/release-notes.mjs`. On a dry run it stops here and
    publishes the generated notes to the run summary.
  - **`Publish GitHub release`** — guarded by
    `if: github.event_name == 'push'`, so a manual dispatch never
    instantiates it; this is the only job with `contents: write` and a
    `GH_TOKEN`. It carries its own repo-wide
    `concurrency: release-publish` group (independent of the ref) so two
    different tags can never publish at the same time and race for the
    "Latest" marker. It re-checks that its checkout is exactly the
    commit the validation job passed forward, and then **immediately
    before creating the release** re-queries the remote for
    `refs/heads/main` and for the tag's peeled commit (requiring an
    **annotated** tag) and requires both to equal that commit — so a tag
    that was moved, or a `main` that advanced, aborts the publication
    instead of overwriting a newer release. After
    `gh release create ... --latest --verify-tag` it verifies remote
    identity once more and, if anything changed mid-publication, deletes
    the release it just created and fails, reporting loudly if that
    rollback itself fails.

Any failing step aborts before a Release is created (fail-closed).

## Cutting a release

> The release preparation workflow is always **PR-based**: branch →
> commits → PR → review → CI green → squash-merge → `main` CI green →
> tag → release workflow verified. There is no direct-to-`main`
> exception for release preparation, including trivial doc fixes —
> every change that is part of cutting a release goes through a PR and
> CI.

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
node --test "tools/test/*.test.mjs"
node tools/run-tests.mjs
```

All three must pass before opening a PR.

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

The snippets below require `jq` on `PATH` in addition to `git` and
`gh`. Confirm the `CI` workflow's `Validate and test` job is green **on
the PR's actual head SHA** before merging — don't rely on an
at-a-glance green badge, don't use `gh pr checks --required` (it only
reports checks that branch protection marks required, so with no such
rule it tells you nothing), and don't query commit check-runs
generically (an
unrelated check, e.g. a Copilot review check, can share a similar
name). Bind the verification to the exact `ci.yml` workflow, the
`pull_request` event, and the PR's *current* head SHA, then read the
`Validate and test` job from that same run — if reruns left several
matching runs, deterministically pick the newest one so an older
success can never mask a newer failure.

```bash
set -euo pipefail
PR=<PR#>
HEAD_SHA="$(gh pr view "$PR" --json headRefOid --jq '.headRefOid')"
[ -n "$HEAD_SHA" ] || { echo "ERROR: could not read the PR head SHA" >&2; exit 1; }

RUNS_JSON="$(gh run list --workflow ci.yml --event pull_request \
  --json databaseId,headSha,event,status,conclusion,createdAt \
  --jq "[.[] | select(.headSha == \"$HEAD_SHA\" and .event == \"pull_request\")]")"
RUN_COUNT="$(printf '%s' "$RUNS_JSON" | jq 'length')"
if [ "$RUN_COUNT" -eq 0 ]; then
  echo "ERROR: no ci.yml pull_request run found for head SHA $HEAD_SHA" >&2
  exit 1
fi

# Reruns can leave several runs for the same head SHA. Sort by
# createdAt then databaseId and take the last so the newest run is
# always the one judged, never an older success sorted after it.
RUN_JSON="$(printf '%s' "$RUNS_JSON" | jq 'sort_by(.createdAt, .databaseId) | last')"
RUN_ID="$(printf '%s' "$RUN_JSON" | jq -r '.databaseId')"
RUN_STATUS="$(printf '%s' "$RUN_JSON" | jq -r '.status')"
RUN_CONCLUSION="$(printf '%s' "$RUN_JSON" | jq -r '.conclusion')"
if [ "$RUN_STATUS" != "completed" ] || [ "$RUN_CONCLUSION" != "success" ]; then
  echo "ERROR: newest ci.yml pull_request run $RUN_ID for $HEAD_SHA is status=$RUN_STATUS conclusion=$RUN_CONCLUSION; refusing to merge" >&2
  exit 1
fi

JOB_JSON="$(gh run view "$RUN_ID" --json jobs \
  --jq '[.jobs[] | select(.name == "Validate and test")]
        | if length == 1 then .[0]
          else {"status": "ambiguous(\(length) matching jobs)", "conclusion": "ambiguous(\(length) matching jobs)"} end')"
JOB_STATUS="$(printf '%s' "$JOB_JSON" | jq -r '.status')"
JOB_CONCLUSION="$(printf '%s' "$JOB_JSON" | jq -r '.conclusion')"
if [ "$JOB_STATUS" != "completed" ] || [ "$JOB_CONCLUSION" != "success" ]; then
  echo "ERROR: 'Validate and test' job in run $RUN_ID (head $HEAD_SHA) is status=$JOB_STATUS conclusion=$JOB_CONCLUSION; refusing to merge" >&2
  exit 1
fi
echo "OK: ci.yml run $RUN_ID (pull_request @ $HEAD_SHA) 'Validate and test' completed/success"
```

```powershell
$ErrorActionPreference = 'Stop'
$pr = '<PR#>'
$headSha = gh pr view $pr --json headRefOid --jq '.headRefOid'
if ($LASTEXITCODE -ne 0 -or -not $headSha) { throw 'could not read the PR head SHA' }
$headSha = $headSha.Trim()

$runsJson = gh run list --workflow ci.yml --event pull_request `
  --json databaseId,headSha,event,status,conclusion,createdAt `
  --jq "[.[] | select(.headSha == `"$headSha`" and .event == `"pull_request`")]"
if ($LASTEXITCODE -ne 0) { throw 'could not list ci.yml pull_request runs' }
$runs = $runsJson | ConvertFrom-Json
if (-not $runs -or $runs.Count -eq 0) { throw "no ci.yml pull_request run found for head SHA $headSha" }

# Reruns can leave several runs for the same head SHA. Sort by
# createdAt then databaseId and take the last so the newest run is
# always the one judged, never an older success sorted after it.
$run = $runs | Sort-Object -Property createdAt, databaseId | Select-Object -Last 1
if ($run.status -ne 'completed' -or $run.conclusion -ne 'success') {
    throw "newest ci.yml pull_request run $($run.databaseId) for $headSha is status=$($run.status) conclusion=$($run.conclusion); refusing to merge"
}

$jobJson = gh run view $run.databaseId --json jobs `
  --jq '[.jobs[] | select(.name == "Validate and test")]
        | if length == 1 then .[0]
          else {"status": "ambiguous(\(length) matching jobs)", "conclusion": "ambiguous(\(length) matching jobs)"} end'
if ($LASTEXITCODE -ne 0) { throw "could not read jobs for run $($run.databaseId)" }
$job = $jobJson | ConvertFrom-Json
if ($job.status -ne 'completed' -or $job.conclusion -ne 'success') {
    throw "'Validate and test' job in run $($run.databaseId) (head $headSha) is status=$($job.status) conclusion=$($job.conclusion); refusing to merge"
}
Write-Host "OK: ci.yml run $($run.databaseId) (pull_request @ $headSha) 'Validate and test' completed/success"
```

A stale run from an earlier push, a run from a different workflow or
event, or a job with a similar name from a different run, does not
count — that is exactly what the `ci.yml` workflow filter, the
`pull_request` event filter, the exact head-SHA filter, and reading the
job from that same run's `databaseId` rule out. When reruns leave
multiple matching runs, the newest one (sorted by `createdAt`, tie
broken by `databaseId`) is always the one judged.

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
gh run list --workflow ci.yml --branch main --event push --limit 1 \
  --json databaseId,headSha,status,conclusion
gh run watch <run-id>
```

Then tag the commit **read from the remote**, passing that SHA
explicitly to `git tag`. Do not `git checkout main` / `git pull` first:
local branch state is irrelevant here and only adds a way to tag the
wrong commit. Every native command is checked, so a failed fetch or a
failed guard stops the sequence *before* `git tag` / `git push` runs.
The tag must be **annotated** (`git tag -a`) — the release workflow
refuses to publish a lightweight tag.

```bash
set -euo pipefail
TAG=vX.Y.Z

git fetch origin main:refs/remotes/origin/main
MAIN_COMMIT="$(git rev-parse --verify "refs/remotes/origin/main^{commit}")"
echo "origin/main is $MAIN_COMMIT"

git tag -a "$TAG" -m "$TAG" "$MAIN_COMMIT"
TAG_COMMIT="$(git rev-parse --verify "$TAG^{commit}")"
if [ "$TAG_COMMIT" != "$MAIN_COMMIT" ]; then
  echo "ERROR: $TAG points at $TAG_COMMIT, not the verified origin/main commit $MAIN_COMMIT" >&2
  exit 1
fi
git push origin "refs/tags/$TAG"
```

```powershell
$ErrorActionPreference = 'Stop'
$tag = 'vX.Y.Z'

# PowerShell does not stop on a non-zero exit from a native command, so
# every git call below is checked explicitly.
git fetch origin main:refs/remotes/origin/main
if ($LASTEXITCODE -ne 0) { throw 'git fetch failed; refusing to tag' }

$mainCommit = git rev-parse --verify 'refs/remotes/origin/main^{commit}'
if ($LASTEXITCODE -ne 0 -or -not $mainCommit) { throw 'could not resolve origin/main; refusing to tag' }
$mainCommit = $mainCommit.Trim()
Write-Host "origin/main is $mainCommit"

git tag -a $tag -m $tag $mainCommit
if ($LASTEXITCODE -ne 0) { throw "git tag $tag failed" }

$tagCommit = git rev-parse --verify "$tag^{commit}"
if ($LASTEXITCODE -ne 0 -or -not $tagCommit) { throw "could not resolve $tag" }
if ($tagCommit.Trim() -ne $mainCommit) { throw "$tag points at $($tagCommit.Trim()), not $mainCommit; refusing to push" }

git push origin "refs/tags/$tag"
if ($LASTEXITCODE -ne 0) { throw "git push of $tag failed" }
```

### 6. Let the Release workflow publish it, then verify

Pushing the tag triggers `.github/workflows/release.yml`, which
validates and tests again, generates notes via
`node tools/release-notes.mjs`, re-verifies the remote tag/`main`
identity immediately before and after publishing, and creates the GitHub
Release automatically. Verify it actually succeeded — do not assume, and
filter by the tag *and* its commit so a previous manual dry run (or any
other run) cannot be mistaken for this release's run:

```bash
set -euo pipefail
TAG=vX.Y.Z
TAG_COMMIT="$(git rev-parse --verify "$TAG^{commit}")"
gh run list --workflow release.yml --event push \
  --json databaseId,headBranch,headSha,status,conclusion \
  --jq ".[] | select(.headBranch == \"$TAG\" and .headSha == \"$TAG_COMMIT\")"
gh run watch <run-id>
gh release view "$TAG" --json tagName,isLatest,isDraft,targetCommitish,body
```

Confirm the matching run concluded `success`, the release is titled
`vX.Y.Z` and marked Latest, its target commit matches the peeled tag
commit and `origin/main`'s tip, and the notes contain both the root
`CHANGELOG.md` section and every script's section.

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
afterward. Clean up first, fail-closed: only an explicitly *confirmed*
"no such release" answer may skip the release deletion. An API call that
fails (expired auth, network error, permission denied) is **not** a
not-found — deleting the tag in that state is exactly what orphans a
Release.

```bash
set -euo pipefail
TAG=vX.Y.Z

# A successful, fully paginated listing that does not contain $TAG is a
# confirmed "not found"; any API failure exits non-zero here instead.
RELEASE_ID="$(gh api --paginate "repos/{owner}/{repo}/releases" \
  --jq ".[] | select(.tag_name == \"$TAG\") | .id")"
if [ -n "$RELEASE_ID" ]; then
  gh release delete "$TAG" --yes
  STILL="$(gh api --paginate "repos/{owner}/{repo}/releases" \
    --jq ".[] | select(.tag_name == \"$TAG\") | .id")"
  [ -z "$STILL" ] || { echo "ERROR: release $TAG still exists after delete" >&2; exit 1; }
else
  echo "Confirmed: the releases API listed successfully and has no release for $TAG."
fi

git push origin ":refs/tags/$TAG"
[ -z "$(git ls-remote --tags origin "refs/tags/$TAG")" ] \
  || { echo "ERROR: remote tag $TAG still exists" >&2; exit 1; }
TAG_LIST="$(git tag --list "$TAG")"
if [ -n "$TAG_LIST" ]; then git tag -d "$TAG"; fi

# Fix the underlying problem, then redo step 5 in full.
```

```powershell
$ErrorActionPreference = 'Stop'
$tag = 'vX.Y.Z'

$releaseId = gh api --paginate "repos/{owner}/{repo}/releases" --jq ".[] | select(.tag_name == `"$tag`") | .id"
if ($LASTEXITCODE -ne 0) { throw "could not list releases; refusing to touch the tag for $tag" }
if ($releaseId) {
    gh release delete $tag --yes
    if ($LASTEXITCODE -ne 0) { throw "gh release delete $tag failed" }
    $still = gh api --paginate "repos/{owner}/{repo}/releases" --jq ".[] | select(.tag_name == `"$tag`") | .id"
    if ($LASTEXITCODE -ne 0 -or $still) { throw "release $tag still exists after delete" }
} else {
    Write-Host "Confirmed: the releases API listed successfully and has no release for $tag."
}

git push origin ":refs/tags/$tag"
if ($LASTEXITCODE -ne 0) { throw "could not delete remote tag $tag" }
$remoteTag = git ls-remote --tags origin "refs/tags/$tag"
if ($LASTEXITCODE -ne 0) { throw "could not verify remote tag deletion" }
if ($remoteTag) { throw "remote tag $tag still exists" }
$tagList = git tag --list $tag
if ($LASTEXITCODE -ne 0) { throw "git tag --list $tag failed; refusing to decide on the local tag" }
if ($tagList) { git tag -d $tag; if ($LASTEXITCODE -ne 0) { throw "could not delete local tag $tag" } }
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
confirmed successful** (Release workflow run green for that exact tag,
`gh release view` shows it) — never delete the old one first as a
"cleanup" step before the new one is verified. Delete the release, then
the remote tag, then the local tag, in that exact order, **verifying
each destructive step before starting the next** (deleting the tag first,
or after an unverified release delete, leaves an orphaned release
pointing at nothing). Always pass `--yes` to skip the interactive
confirmation prompt, and **never pass `--cleanup-tag`** to
`gh release delete` — tag deletion is intentionally a separate, checked
step here, not something to fold into the release-delete call:

```bash
set -euo pipefail
OLD_TAG=<old-tag>

gh release view "$OLD_TAG" --json tagName,name,createdAt   # confirm what you are deleting
gh release delete "$OLD_TAG" --yes
STILL="$(gh api --paginate "repos/{owner}/{repo}/releases" \
  --jq ".[] | select(.tag_name == \"$OLD_TAG\") | .id")"
[ -z "$STILL" ] || { echo "ERROR: release $OLD_TAG still exists; not touching the tag" >&2; exit 1; }

git push origin ":refs/tags/$OLD_TAG"
[ -z "$(git ls-remote --tags origin "refs/tags/$OLD_TAG")" ] \
  || { echo "ERROR: remote tag $OLD_TAG still exists" >&2; exit 1; }
OLD_TAG_LIST="$(git tag --list "$OLD_TAG")"
if [ -n "$OLD_TAG_LIST" ]; then git tag -d "$OLD_TAG"; fi
```

```powershell
$ErrorActionPreference = 'Stop'
$oldTag = '<old-tag>'

gh release view $oldTag --json tagName,name,createdAt
if ($LASTEXITCODE -ne 0) { throw "could not read release $oldTag; refusing to delete anything" }
gh release delete $oldTag --yes
if ($LASTEXITCODE -ne 0) { throw "gh release delete $oldTag failed" }
$still = gh api --paginate "repos/{owner}/{repo}/releases" --jq ".[] | select(.tag_name == `"$oldTag`") | .id"
if ($LASTEXITCODE -ne 0 -or $still) { throw "release $oldTag still exists; not touching the tag" }

git push origin ":refs/tags/$oldTag"
if ($LASTEXITCODE -ne 0) { throw "could not delete remote tag $oldTag" }
$remoteTag = git ls-remote --tags origin "refs/tags/$oldTag"
if ($LASTEXITCODE -ne 0) { throw "could not verify remote tag deletion" }
if ($remoteTag) { throw "remote tag $oldTag still exists" }
$oldTagList = git tag --list $oldTag
if ($LASTEXITCODE -ne 0) { throw "git tag --list $oldTag failed; refusing to decide on the local tag" }
if ($oldTagList) { git tag -d $oldTag; if ($LASTEXITCODE -ne 0) { throw "could not delete local tag $oldTag" } }
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
5. Run `node tools/validate.mjs`, `node --test "tools/test/*.test.mjs"`
   and `node tools/run-tests.mjs` locally, then follow "Cutting a
   release" above — the new script is folded into the next synchronized
   `vX.Y.Z` release like any other script; it does not get its own tag.
