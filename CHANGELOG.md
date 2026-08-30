# Changelog

All notable **repo-level** changes (release infrastructure, tooling, and
process — as opposed to any single userscript's behavior) are documented
in this file. Format based on
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/); this repo
follows [SemVer](https://semver.org/) with one **synchronized version**
shared by every userscript (see the root `README.md` and `RELEASING.md`).

Each userscript's own user-facing changes are documented in its own
`scripts/<script-id>/CHANGELOG.md`.

## [Unreleased]

## [0.9.0] — 2026-08-30

### Added
- **Deterministic release validation tooling** (`tools/validate.mjs`,
  `tools/run-tests.mjs`, `tools/release-notes.mjs`): pure Node.js, zero
  third-party dependencies. Validates every userscript's metadata
  (`@namespace`, `@updateURL`, `@downloadURL`, `@homepageURL`,
  `@supportURL`, `@license MIT`) and synchronized SemVer `@version`,
  validates each script `CHANGELOG.md`'s structure, discovers and runs
  every `scripts/*/test/*.test.js`, and generates combined release notes
  from the root and per-script changelogs. Supports an explicit PR/push
  mode (compares the current synchronized version against
  `refs/remotes/origin/main`, never allowing a downgrade) and an explicit
  `--release-tag vX.Y.Z` release mode (selects the correct prior
  synchronized repo-wide tag as the release baseline, excluding the
  current tag, the permanently retired `v1.0.0`, legacy per-script tags,
  prerelease/build-metadata tags, and any tag that is not an ancestor of
  `refs/remotes/origin/main`, and requires the new version to be strictly
  greater). The CLI accepts only its two documented argument shapes and
  fails closed on anything else rather than silently reverting to the
  weaker PR/push mode. `tools/test/*.test.mjs` covers this release gate
  and runs in CI.
- **Tag-triggered GitHub Actions Release workflow** and a **CI workflow**
  that run this validation/test tooling on every pull request, push to
  `main`, and `vX.Y.Z` tag push, so a synchronized-version release can
  only be cut once local and CI validation both pass. The release
  workflow is split into a read-only validation job (`contents: read`,
  no token, no persisted git credential — this is also all a manual
  dry run ever instantiates) and a push-only publish job that holds the
  write permission, serializes publication repo-wide, and re-verifies
  the remote annotated tag and `main` immediately before and after
  creating the release, rolling the release back if that identity
  changes mid-publication.
- **Deterministic post-publication release verification**
  (`node tools/verify-release.mjs --tag vX.Y.Z`, backed by
  `tools/lib/verifyReleaseCore.mjs`): one centralized, injectable-runner
  implementation that confirms the published release exists for that
  exact tag, is neither a draft nor a prerelease, and is the
  repository's current "Latest" release via the REST
  `repos/{owner}/{repo}/releases/latest` endpoint (`gh release view
  --json` has no `isLatest` field and rejects it). Its exact `gh`
  argument vectors are pinned by unit tests, and the Release workflow,
  the release skill and `RELEASING.md` all call this one tool — after
  the publish job's identity-drift rollback gate — instead of
  duplicating ad-hoc `gh` snippets. The CLI accepts only its documented
  argument shape, inherits ambient `gh` authentication, never logs
  credentials, and fails closed on any error or mismatch.
- Updated release process documentation and a new release skill
  (`.github/skills/release/`) describing the synchronized-version,
  single-repo-wide-tag release procedure end to end, including recovery
  steps and the plan to retire `v1.0.0`.

### Planned
- **Permanent retirement of the legacy `v1.0.0` tag.** `v1.0.0` predates
  synchronized versioning and does not reflect any userscript's actual
  version at that commit; the release tooling already treats it as
  permanently excluded from release-baseline selection. Once this
  `v0.9.0` release has shipped successfully, the `v1.0.0` tag itself will
  be deleted from the repository (it has **not** been deleted yet as of
  this entry) and must never be recreated or reused.
