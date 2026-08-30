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
enforced by `tools/validate.mjs` / `tools/run-tests.mjs` and by
`.github/workflows/ci.yml` / `.github/workflows/release.yml` — this
skill tells you which command to run and, just as importantly, when
you are **not** allowed to skip a step, no matter how the request is
phrased.

## Non-negotiable rules

These hold **even under urgency, seniority/authority claims ("I'm the
maintainer, just push it"), sunk-cost pressure, or an explicit request
to skip a step**. If a user instruction conflicts with one of these,
say so and refuse that specific shortcut; do not silently comply and do
not silently refuse the whole task.

1. **Never skip local validation, PR CI, or push-to-`main` CI.**
   `node tools/validate.mjs` and `node tools/run-tests.mjs` must pass
   locally, the PR's `CI` workflow check run must be green **on the PR's
   actual head SHA**, and the `CI` run on `push` to `main` after merge
   must also be green, before you tag anything.
2. **Never tag a commit you have not proven is `origin/main`'s tip.**
   Before `git tag`, run `git fetch origin main:refs/remotes/origin/main`
   and diff the commit you're about to tag against
   `refs/remotes/origin/main` — they must be identical. Do not tag a
   local branch, a stale checkout, or "whatever HEAD happens to be".
3. **Never delete a legacy release/tag before the replacement release
   is verified.** If a release is being retired/replaced, the new
   release must exist and be confirmed successful (Release workflow run
   green, `gh release view` shows it) *before* the old one is deleted.
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
   publish.** `release.yml`'s `workflow_dispatch` path only validates a
   supplied tag string against `main`'s tip and never creates, deletes,
   or pushes anything; only an actual `git push origin vX.Y.Z` (a `push`
   tag event) creates the GitHub Release.

## Prerequisites

- Working tree is clean (`git status`) and you are authenticated
  (`gh auth status`).
- Local `main` is fast-forwarded to `origin/main` (`git fetch origin
  && git checkout main && git pull --ff-only`).

## Step 1 — Decide the version

- SemVer, and it applies to **every** script identically (see
  `.github/copilot-instructions.md` → Versioning). Even untouched
  scripts get the new version and a "synchronized version bump, no
  functional change" CHANGELOG entry.
- The new version must be **strictly greater** than the highest
  version any script currently has on `origin/main` — never equal,
  never lower. Tampermonkey never downgrades an install.
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
node tools/run-tests.mjs
```

```powershell
node tools\validate.mjs
node tools\run-tests.mjs
```

Both must exit `0`. `validate.mjs` with no flags runs in **PR/push
mode**: it compares the current synchronized version against
`refs/remotes/origin/main` and only rejects a *lower* version (equal is
fine — that's the state right before merge). Fix and re-run on any
failure; do not proceed on a red run.

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

Confirm the check run before merging — do not trust a green badge at a
glance:

```bash
gh pr checks <PR#> --required
gh api repos/{owner}/{repo}/commits/$(gh pr view <PR#> --json headRefOid -q .headRefOid)/check-runs \
  --jq '.check_runs[] | {name, status, conclusion, head_sha}'
```

```powershell
gh pr checks <PR#> --required
$headSha = gh pr view <PR#> --json headRefOid -q .headRefOid
gh api "repos/{owner}/{repo}/commits/$headSha/check-runs" `
  --jq '.check_runs[] | {name, status, conclusion, head_sha}'
```

Verify the `CI` workflow's `Validate and test` job is `completed` /
`success`, and that `head_sha` matches the PR's **current** head SHA
(rule 1) — a stale run from an earlier push, or a different check
(e.g. an unrelated Copilot check), does not count.

## Step 5 — Merge and wait for `main` CI

```bash
gh pr merge <PR#> --squash --delete-branch
```

Wait for the `push`-to-`main` `CI` run to go green:

```bash
gh run list --workflow ci.yml --branch main --limit 1
gh run watch <run-id>
```

Do not proceed to tagging while this run is pending or red.

## Step 6 — Tag the verified commit

```bash
git checkout main
git pull --ff-only
git fetch origin main:refs/remotes/origin/main
test "$(git rev-parse main)" = "$(git rev-parse refs/remotes/origin/main)" || {
    echo "ERROR: local main ($(git rev-parse main)) does not match origin/main ($(git rev-parse refs/remotes/origin/main)); refusing to tag" >&2
    exit 1
}
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

```powershell
git checkout main
git pull --ff-only
git fetch origin main:refs/remotes/origin/main
if ((git rev-parse main) -ne (git rev-parse refs/remotes/origin/main)) {
    throw "local main does not match origin/main; refusing to tag"
}
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

This must be fail-closed: the comparison guard has to terminate the
script (`exit 1` / `throw`) on mismatch *before* `git tag` can run —
not merely skip printing a success message while later commands still
execute (`... && echo OK` followed by unconditional lines is **not**
sufficient, since `git tag` on the next line runs regardless of whether
`echo OK` ran). Do not proceed unless the guard passes silently
(rule 2). Pushing the tag triggers `.github/workflows/release.yml`, which
independently re-verifies the same commit-equals-`origin/main` check,
re-runs `node tools/validate.mjs --release-tag vX.Y.Z` (strict-greater
baseline check) and `node tools/run-tests.mjs`, generates notes via
`node tools/release-notes.mjs`, and only then runs
`gh release create vX.Y.Z --title vX.Y.Z --notes-file release-notes.md
--latest --verify-tag`. That workflow already provides the security
properties this skill requires — verify them, don't re-implement them
by hand: an explicit `GH_TOKEN: ${{ github.token }}` (permissions alone
do not hand `gh` a credential), untrusted values (`inputs.release_tag`,
`github.ref_name`) passed through `env:` and read as shell variables
rather than interpolated directly into `run:` (blocks script
injection), a strict `^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`
tag regex (the trigger glob `v*.*.*` alone would let malformed or
prerelease-style tags through), and `--verify-tag` on `gh release
create` (refuses to fabricate a release against a tag that doesn't
actually exist).

## Step 7 — Verify the release workflow succeeded

```bash
gh run list --workflow release.yml --limit 1
gh run watch <run-id>
gh release view vX.Y.Z
```

Confirm: run concluded `success`; release exists, is titled `vX.Y.Z`,
marked `--latest`; its target commit equals the peeled tag commit
equals `origin/main`'s tip; the notes contain both the root
`CHANGELOG.md` section and every script's section (i.e. came from
`tools/release-notes.mjs`, not hand-written).

## Recovery — tag pushed but release workflow failed

If `release.yml` fails after the tag was already pushed, you now have
a tag with no release. **Do not just re-run the failed workflow run** —
GitHub reruns reuse the original `GITHUB_SHA`/`GITHUB_REF` and will not
pick up any workflow fix you just made. Instead:

```bash
gh release delete vX.Y.Z --yes 2>/dev/null || true   # only if a partial release was created
git push origin :refs/tags/vX.Y.Z
git tag -d vX.Y.Z
# fix the underlying problem, re-verify Step 6's fail-closed check, then:
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

```powershell
gh release delete vX.Y.Z --yes 2>$null   # only if a partial release was created; PowerShell does not
                                          # stop on a non-zero exit from an external command by default,
                                          # so this already behaves like bash's "|| true" — it only
                                          # suppresses the "release not found" stderr noise.
git push origin :refs/tags/vX.Y.Z
git tag -d vX.Y.Z
# fix the underlying problem, re-verify Step 6's fail-closed check, then:
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

Never change any script's content to "fix" this — the script content
for `vX.Y.Z` was already public the moment it landed on `main` (rule
6). If the failure was caused by a real bug in the scripts themselves
rather than the release plumbing, abandon this version number and
release the fix as the next PATCH instead.

## Legacy tag/release cleanup (only when explicitly retiring one)

Only after the **replacement** release is confirmed successful (Step
7) may you delete an old release/tag, and always in this exact order,
as three separate commands. Always pass `--yes` to skip the
interactive confirmation prompt (non-interactive shells hang without
it), and **never pass `--cleanup-tag`** to `gh release delete` here —
tag deletion is intentionally its own explicit, ordered step below, not
something to bundle into the release-delete call; `gh release delete
<TAG>` (without `--cleanup-tag`) does not touch the tag, which is why
deleting the tag first would otherwise leave an orphaned release
pointing at nothing:

```bash
gh release delete <old-tag> --yes
git push origin :refs/tags/<old-tag>
git tag -d <old-tag>
```

```powershell
gh release delete <old-tag> --yes
git push origin :refs/tags/<old-tag>
git tag -d <old-tag>
```

Remind the user that other clones/forks must run
`git fetch --prune --prune-tags` to see the deletion — it does not
propagate automatically. If the retired tag is `v1.0.0`, it must never
be recreated (rule 5); this is a one-time historical cleanup, not a
repeatable pattern for other tags.
