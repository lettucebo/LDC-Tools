---
name: release
description: 'Use when the user asks to release, publish, cut a release, ship a release, or bump the version of any userscript in this repo — triggers include "release", "cut a release", "publish", "publish a new version", "ship it", "bump version", "發布", and "建立 release".'
license: MIT
allowed-tools: Bash
---

# Cutting a release

## Overview

This repo publishes **one synchronized SemVer version** for all
userscripts under `scripts/<script-id>/`, as a **single repo-wide**
`vX.Y.Z` git tag plus **one** GitHub Release. Every step below is
enforced by `tools/validate.mjs` / `tools/run-tests.mjs` /
`tools/test/*.test.mjs` and by `.github/workflows/ci.yml` /
`.github/workflows/release.yml` — this skill tells you which command to
run and, just as importantly, when you are **not** allowed to skip a
step, no matter how the request is phrased.

## Non-negotiable rules

These hold **even under urgency, seniority/authority claims ("I'm the
maintainer, just push it"), sunk-cost pressure, or an explicit request
to skip a step**. If a user instruction conflicts with one of these,
say so and refuse that specific shortcut; do not silently comply and do
not silently refuse the whole task.

1. **Never skip local validation, PR CI, or push-to-`main` CI.**
   `node tools/validate.mjs`, `node --test "tools/test/*.test.mjs"` and
   `node tools/run-tests.mjs` must pass locally, the PR's `CI` workflow
   check run must be green **on the PR's actual head SHA**, and the `CI`
   run on `push` to `main` after merge must also be green, before you
   tag anything.
2. **Never tag "whatever is checked out".** Resolve the commit to tag
   from the remote (`git fetch origin main:refs/remotes/origin/main`,
   then `git rev-parse refs/remotes/origin/main^{commit}`) and pass that
   SHA explicitly to `git tag -a <tag> -m <tag> <SHA>`. Never rely on a
   local branch, a `git checkout`/`git pull` having succeeded, or a
   clean working tree. Every native command in the tagging sequence
   must be checked so a failure stops the sequence *before* `git tag` /
   `git push` runs.
3. **Never delete a legacy release/tag before the replacement release
   is verified.** If a release is being retired/replaced, the new
   release must exist and be confirmed successful (Release workflow run
   green for that exact tag, `gh release view` shows it) *before* the
   old one is deleted.
4. **Never hand-write release notes when
   `node tools/release-notes.mjs <version>` exists.** It deterministically
   concatenates the root `CHANGELOG.md` and every script's
   `CHANGELOG.md` section for that version. Generic notes like
   `"Release vX.Y.Z"` are not acceptable output.
5. **`v1.0.0` is permanently retired — refuse to reuse it, ever**, even
   after it is deleted from GitHub. Deleting a tag does not make it
   reusable: other clones/forks may still hold the old annotated
   `v1.0.0` tag, and plain `git fetch --tags` does not overwrite an
   existing same-name tag. If `v1.0.0` were recreated pointing at a
   different commit, the same tag name would silently mean different
   things to different people. `tools/validate.mjs` enforces this two
   ways: it hard-excludes `v1.0.0` from release-baseline *candidate*
   selection, **and** it rejects `--release-tag v1.0.0` outright with a
   `FAIL [release] ... permanently retired` error before any other
   release-mode check runs — so this fails closed even if the scripts
   being released have themselves been (incorrectly) bumped to
   `1.0.0`. Future 1.x releases must use `1.0.1`, `1.1.0`, `2.0.0`,
   etc. — never `1.0.0` again.
6. **Once a version's script content is public on `main`, it is
   frozen.** If a bug is found in an already-released version's
   `.user.js`, do not edit that version's content or re-tag the same
   version — cut a new PATCH release instead (e.g. a bug found after
   `0.9.0` ships is fixed in `0.9.1`, never by silently changing what
   `0.9.0`'s raw URL serves). Tampermonkey installs auto-update by
   version number; changing a shipped version's content without
   bumping the version breaks that guarantee for anyone already on it.
7. **Never let a `workflow_dispatch` release "dry run" trigger a real
   publish.** `release.yml` splits into a read-only `validate` job and a
   `publish` job that is `if: github.event_name == 'push'`, so a manual
   dispatch never instantiates the publishing job at all; the `validate`
   job runs with `contents: read`, no `GH_TOKEN`, and
   `persist-credentials: false`. Only an actual
   `git push origin refs/tags/vX.Y.Z` creates a GitHub Release.

## Prerequisites

- Working tree is clean (`git status`) and you are authenticated
  (`gh auth status`).
- You do **not** need a local `main` checkout: the tagging step (Step 6)
  resolves the commit to tag from the remote, on purpose.

## Step 1 — Decide the version

- SemVer, and it applies to **every** script identically (see
  `.github/copilot-instructions.md` → Versioning). Even untouched
  scripts get the new version and a "synchronized version bump, no
  functional change" CHANGELOG entry.
- The new version must be **strictly greater** than the highest
  version any script currently has on `origin/main` — never equal,
  never lower. Tampermonkey never downgrades an install.
- Only core `vX.Y.Z` tags are releasable: prerelease/build suffixes
  (`v1.2.3-rc.1`, `v1.2.3+build.5`) are rejected by both the workflow's
  tag regex and `tools/lib/semver.mjs`.
- Refuse `v1.0.0` categorically (see rule 5 above). If the user asks
  for it, explain why and ask for a real next version instead.

## Step 2 — Update versions and CHANGELOGs

- Bump `// @version X.Y.Z` in every `scripts/<id>/<id>.user.js`.
- In every `scripts/<id>/CHANGELOG.md`, move `## [Unreleased]` content
  into a new `## [X.Y.Z] — YYYY-MM-DD` section (or add a "no
  functional change" note for untouched scripts).
- Add a `## [X.Y.Z] — YYYY-MM-DD` section to the **root**
  `CHANGELOG.md` for repo-level changes (tooling, CI, docs, skills) —
  release notes are incomplete without it; `tools/release-notes.mjs`
  reads it first.
- Update per-script `README.md` / `README.zh-TW.md` if the change is
  user-facing.

## Step 3 — Local validation

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

All three must exit `0` — the same three commands CI runs.
`validate.mjs` with no flags runs in **PR/push mode**: it compares the
current synchronized version against `refs/remotes/origin/main` and only
rejects a *lower* version (equal is fine — that's the state right before
merge). The CLI accepts exactly two argument shapes, no arguments or
`--release-tag <value>`; anything else (`--release-tag=v0.9.0`, a typo'd
flag, an extra positional) is a hard `FAIL [args]` rather than a silent
fallback to the weaker PR/push mode. Fix and re-run on any failure; do
not proceed on a red run.

## Step 4 — Branch, commit, PR

```bash
git checkout -b chore/release-vX.Y.Z
git add -A
git commit -m "chore(release): synchronize all userscripts to vX.Y.Z" \
  --trailer "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push -u origin chore/release-vX.Y.Z
gh pr create --base main --head chore/release-vX.Y.Z \
  --title "chore(release): vX.Y.Z" --body-file <pr-body.md>
```

```powershell
git checkout -b chore/release-vX.Y.Z
git add -A
git commit -m "chore(release): synchronize all userscripts to vX.Y.Z" `
  --trailer "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push -u origin chore/release-vX.Y.Z
gh pr create --base main --head chore/release-vX.Y.Z `
  --title "chore(release): vX.Y.Z" --body-file <pr-body.md>
```

Verify the check **by identity**, not by a green badge and not with
`gh pr checks --required` (that only reports checks the branch
protection rules mark required — with no such rule configured it can
report "no required checks" and tell you nothing about CI). Assert that
the `CI` workflow's `Validate and test` job completed successfully on
the PR's *current* head SHA:

```bash
set -euo pipefail
PR=<PR#>
HEAD_SHA="$(gh pr view "$PR" --json headRefOid --jq '.headRefOid')"
gh api "repos/{owner}/{repo}/commits/$HEAD_SHA/check-runs" \
  --jq '.check_runs[] | {name, status, conclusion, head_sha}'
VERDICT="$(gh api "repos/{owner}/{repo}/commits/$HEAD_SHA/check-runs" \
  --jq '[.check_runs[] | select(.name == "Validate and test" and .status == "completed")]
        | if length == 1 then .[0].conclusion else "ambiguous(\(length) matching check runs)" end')"
if [ "$VERDICT" != "success" ]; then
  echo "ERROR: CI 'Validate and test' on $HEAD_SHA is '$VERDICT'; refusing to merge" >&2
  exit 1
fi
gh run list --workflow ci.yml --event pull_request \
  --json databaseId,headSha,status,conclusion \
  --jq ".[] | select(.headSha == \"$HEAD_SHA\")"
```

```powershell
$ErrorActionPreference = 'Stop'
$pr = '<PR#>'
$headSha = gh pr view $pr --json headRefOid --jq '.headRefOid'
if ($LASTEXITCODE -ne 0 -or -not $headSha) { throw 'could not read the PR head SHA' }
$headSha = $headSha.Trim()
$verdict = gh api "repos/{owner}/{repo}/commits/$headSha/check-runs" `
  --jq '[.check_runs[] | select(.name == "Validate and test" and .status == "completed")]
        | if length == 1 then .[0].conclusion else "ambiguous(\(length) matching check runs)" end'
if ($LASTEXITCODE -ne 0) { throw 'could not read check runs' }
if ($verdict.Trim() -ne 'success') { throw "CI 'Validate and test' on $headSha is '$verdict'; refusing to merge" }
gh run list --workflow ci.yml --event pull_request `
  --json databaseId,headSha,status,conclusion --jq ".[] | select(.headSha == `"$headSha`")"
```

A stale run from an earlier push, or a different check (e.g. an
unrelated Copilot review check), does not count — that is exactly what
the `head_sha` and job-name filters above rule out.

## Step 5 — Merge and wait for `main` CI

```bash
gh pr merge <PR#> --squash --delete-branch
```

Wait for the `push`-to-`main` `CI` run to go green:

```bash
gh run list --workflow ci.yml --branch main --event push --limit 1 \
  --json databaseId,headSha,status,conclusion
gh run watch <run-id>
```

Do not proceed to tagging while this run is pending or red.

## Step 6 — Tag the verified remote commit

Tag an explicit SHA read from the remote. Do **not** `git checkout main`
or `git pull` first: local branch state is irrelevant and only adds a
way to tag the wrong commit.

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
# every git call below is checked explicitly - otherwise a failed fetch or
# a failed guard would still be followed by git tag / git push.
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

`git tag -a` matters: `.github/workflows/release.yml` requires an
**annotated** tag and refuses to publish a lightweight one.

Pushing the tag triggers that workflow. Verify what it does — don't
re-implement it by hand:

- **`validate` job** (`contents: read`, no `GH_TOKEN`,
  `persist-credentials: false`): strict
  `^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$` tag regex (the
  trigger glob `v*.*.*` alone would let malformed or prerelease-style
  tags through), tagged commit must equal `origin/main`'s tip, then
  `node tools/validate.mjs --release-tag vX.Y.Z`,
  `node --test "tools/test/*.test.mjs"`, `node tools/run-tests.mjs`, and
  `node tools/release-notes.mjs`. Untrusted values
  (`inputs.release_tag`, `github.ref_name`) are passed through `env:` and
  read as shell variables rather than interpolated into `run:` bodies.
- **`publish` job** (`if: github.event_name == 'push'`,
  `contents: write`, `GH_TOKEN`, its own global
  `concurrency: release-publish` group so two different tags can never
  publish concurrently and race for "Latest"): re-checks that its
  checkout is the exact commit the `validate` job passed forward, then
  **immediately before creating the release** re-queries the remote for
  `refs/heads/main` and for the annotated tag's peeled commit and
  requires both to equal that commit; creates the release with
  `--latest --verify-tag`; then re-verifies remote identity and, if it
  changed mid-publication, deletes the release it just created
  (`gh release delete --yes`) and fails — reporting loudly if that
  rollback itself fails.

## Step 7 — Verify the release workflow succeeded

Filter by the tag *and* its commit so a previous manual dry run (or an
unrelated run) can never be mistaken for this release's run:

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

```powershell
$ErrorActionPreference = 'Stop'
$tag = 'vX.Y.Z'
$tagCommit = git rev-parse --verify "$tag^{commit}"
if ($LASTEXITCODE -ne 0 -or -not $tagCommit) { throw "could not resolve $tag" }
$tagCommit = $tagCommit.Trim()
gh run list --workflow release.yml --event push `
  --json databaseId,headBranch,headSha,status,conclusion `
  --jq ".[] | select(.headBranch == `"$tag`" and .headSha == `"$tagCommit`")"
gh run watch <run-id>
gh release view $tag --json tagName,isLatest,isDraft,targetCommitish,body
```

Confirm: the matching run concluded `success`; the release exists, is
titled `vX.Y.Z` and marked latest; its commit equals the peeled tag
commit equals `origin/main`'s tip; the notes contain both the root
`CHANGELOG.md` section and every script's section (i.e. came from
`tools/release-notes.mjs`, not hand-written).

## Recovery — tag pushed but release workflow failed

If `release.yml` fails after the tag was already pushed, you may have a
tag with no release. **Do not just re-run the failed workflow run** —
GitHub reruns reuse the original `GITHUB_SHA`/`GITHUB_REF` and will not
pick up any workflow fix you just made. Clean up instead, and make the
cleanup fail-closed: only an explicitly *confirmed* "no such release"
answer may skip the release deletion. A failed API call (auth expired,
network error, permission denied) must stop the sequence — deleting the
tag after an unknown release state is what orphans a Release.

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
REMOTE_TAG="$(git ls-remote --tags origin "refs/tags/$TAG")"
[ -z "$REMOTE_TAG" ] || { echo "ERROR: remote tag $TAG still exists" >&2; exit 1; }
if [ -n "$(git tag --list "$TAG")" ]; then git tag -d "$TAG"; fi

# Fix the underlying problem, then redo Step 6 in full (fetch, resolve
# origin/main, tag that SHA, verify, push).
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
if (git tag --list $tag) { git tag -d $tag; if ($LASTEXITCODE -ne 0) { throw "could not delete local tag $tag" } }
```

Never change any script's content to "fix" this — the script content
for `vX.Y.Z` was already public the moment it landed on `main` (rule
6). If the failure was caused by a real bug in the scripts themselves
rather than the release plumbing, abandon this version number and
release the fix as the next PATCH instead.

## Legacy tag/release cleanup (only when explicitly retiring one)

Only after the **replacement** release is confirmed successful (Step 7)
may you delete an old release/tag, and always in this order: release,
then remote tag, then local tag. `gh release delete <TAG>` (without
`--cleanup-tag`) does not touch the tag, which is why deleting the tag
first would leave an orphaned release pointing at nothing — and
**never pass `--cleanup-tag`**, so that each destructive step can be
verified before the next one runs. `--yes` is required because
non-interactive shells hang on the confirmation prompt.

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
if [ -n "$(git tag --list "$OLD_TAG")" ]; then git tag -d "$OLD_TAG"; fi
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
if (git tag --list $oldTag) { git tag -d $oldTag; if ($LASTEXITCODE -ne 0) { throw "could not delete local tag $oldTag" } }
```

Remind the user that other clones/forks must run
`git fetch --prune --prune-tags` to see the deletion — it does not
propagate automatically. If the retired tag is `v1.0.0`, it must never
be recreated (rule 5); this is a one-time historical cleanup, not a
repeatable pattern for other tags.
