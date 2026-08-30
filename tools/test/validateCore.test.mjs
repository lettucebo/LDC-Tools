import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
    REPO_ROOT,
    makeScratchDir,
    removeScratchDir,
    writeFixtureScripts,
    gitInit,
    gitCommitAll,
    gitTag,
    gitSetFakeOriginRef,
} from './helpers.mjs';
import { listScriptIds } from '../lib/repoScripts.mjs';
import {
    collectScripts,
    checkFilesExist,
    runNodeCheck,
    validateAllMetadata,
    requireSynchronizedVersion,
    validateAllChangelogs,
    getVersionsAtGitRef,
    runPrModeCheck,
    findReleaseBaseline,
    runReleaseModeCheck,
} from '../lib/validateCore.mjs';

const scratchDirs = [];
function scratch(prefix) {
    const dir = makeScratchDir(prefix);
    scratchDirs.push(dir);
    return dir;
}
after(() => {
    for (const dir of scratchDirs) removeScratchDir(dir);
});

// ---------------------------------------------------------------------------
// listScriptIds
// ---------------------------------------------------------------------------

test('listScriptIds returns the real repo script folders in deterministic order', () => {
    const ids = listScriptIds(path.join(REPO_ROOT, 'scripts'));
    assert.deepEqual(ids, [
        'github-docs-lang-switch-cn',
        'ldc-batch-download',
        'ms-learn-lang-switch-cn',
        'ms-learn-lang-switch-tw',
    ]);
});

// ---------------------------------------------------------------------------
// collectScripts / checkFilesExist
// ---------------------------------------------------------------------------

test('checkFilesExist reports missing userscript or CHANGELOG files', () => {
    const dir = scratch('missing-files');
    writeFixtureScripts(dir, ['alpha']);
    fs.rmSync(path.join(dir, 'scripts', 'alpha', 'CHANGELOG.md'));
    const scripts = collectScripts(dir);
    const errors = checkFilesExist(scripts);
    assert.ok(errors.some((e) => /alpha/.test(e) && /CHANGELOG/.test(e)));
});

test('checkFilesExist passes when all required files are present', () => {
    const dir = scratch('files-ok');
    writeFixtureScripts(dir, ['alpha', 'beta']);
    const scripts = collectScripts(dir);
    assert.deepEqual(checkFilesExist(scripts), []);
});

// ---------------------------------------------------------------------------
// runNodeCheck
// ---------------------------------------------------------------------------

test('runNodeCheck fails on a syntax error', () => {
    const dir = scratch('syntax-error');
    writeFixtureScripts(dir, ['alpha']);
    const file = path.join(dir, 'scripts', 'alpha', 'alpha.user.js');
    fs.appendFileSync(file, 'function broken( {\n');
    const result = runNodeCheck(file);
    assert.equal(result.ok, false);
});

test('runNodeCheck passes on syntactically valid JS', () => {
    const dir = scratch('syntax-ok');
    writeFixtureScripts(dir, ['alpha']);
    const file = path.join(dir, 'scripts', 'alpha', 'alpha.user.js');
    const result = runNodeCheck(file);
    assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// validateAllMetadata / requireSynchronizedVersion
// ---------------------------------------------------------------------------

test('validateAllMetadata + requireSynchronizedVersion pass for synchronized fixture scripts', () => {
    const dir = scratch('metadata-ok');
    writeFixtureScripts(dir, ['alpha', 'beta'], '0.9.0');
    const scripts = collectScripts(dir);
    const metaResult = validateAllMetadata(scripts);
    assert.equal(metaResult.ok, true, metaResult.errors.join('\n'));
    const sync = requireSynchronizedVersion(metaResult.versions);
    assert.equal(sync.ok, true);
    assert.equal(sync.version, '0.9.0');
});

test('requireSynchronizedVersion fails when script versions differ', () => {
    const dir = scratch('metadata-mismatch');
    writeFixtureScripts(dir, ['alpha']);
    writeFixtureScripts(dir, ['beta'], '0.8.0');
    const scripts = collectScripts(dir);
    const metaResult = validateAllMetadata(scripts);
    const sync = requireSynchronizedVersion(metaResult.versions);
    assert.equal(sync.ok, false);
    assert.match(sync.error, /mismatch/i);
});

test('validateAllMetadata fails on bad metadata (wrong namespace)', () => {
    const dir = scratch('metadata-bad-namespace');
    writeFixtureScripts(dir, ['alpha']);
    const file = path.join(dir, 'scripts', 'alpha', 'alpha.user.js');
    const content = fs.readFileSync(file, 'utf8').replace(
        'https://github.com/lettucebo/TampermonkeyScripts',
        'https://github.com/someone-else/TampermonkeyScripts',
    );
    fs.writeFileSync(file, content);
    const scripts = collectScripts(dir);
    const metaResult = validateAllMetadata(scripts);
    assert.equal(metaResult.ok, false);
    assert.ok(metaResult.errors.some((e) => /namespace/.test(e)));
});

// ---------------------------------------------------------------------------
// validateAllChangelogs
// ---------------------------------------------------------------------------

test('validateAllChangelogs passes for well-formed fixture changelogs', () => {
    const dir = scratch('changelog-ok');
    writeFixtureScripts(dir, ['alpha'], '0.9.0');
    const scripts = collectScripts(dir);
    const result = validateAllChangelogs(scripts, '0.9.0');
    assert.equal(result.ok, true);
});

test('validateAllChangelogs fails when a script CHANGELOG has no Unreleased section', () => {
    const dir = scratch('changelog-bad');
    writeFixtureScripts(dir, ['alpha'], '0.9.0');
    const changelogPath = path.join(dir, 'scripts', 'alpha', 'CHANGELOG.md');
    fs.writeFileSync(changelogPath, '## [0.9.0] — 2026-08-30\n\n### Added\n- x\n');
    const scripts = collectScripts(dir);
    const result = validateAllChangelogs(scripts, '0.9.0');
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /alpha/.test(e) && /Unreleased/.test(e)));
});

// ---------------------------------------------------------------------------
// getVersionsAtGitRef / runPrModeCheck
// ---------------------------------------------------------------------------

test('runPrModeCheck passes for the real repository (current == origin/main)', () => {
    const ids = listScriptIds(path.join(REPO_ROOT, 'scripts'));
    const result = runPrModeCheck(REPO_ROOT, ids, '0.9.0');
    assert.equal(result.ok, true, result.errors?.join('\n'));
});

test('runPrModeCheck fails when the current version is lower than origin/main', () => {
    const dir = scratch('pr-mode-lower');
    writeFixtureScripts(dir, ['alpha', 'beta'], '0.9.0');
    gitInit(dir);
    gitSetFakeOriginRef(dir, 'main', 'HEAD');
    const ids = ['alpha', 'beta'];
    // Simulate a PR branch that (incorrectly) has a lower version than main.
    const result = runPrModeCheck(dir, ids, '0.8.0');
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /lower/.test(e)));
});

test('runPrModeCheck passes when the current version equals origin/main (equality allowed)', () => {
    const dir = scratch('pr-mode-equal');
    writeFixtureScripts(dir, ['alpha', 'beta'], '0.9.0');
    gitInit(dir);
    gitSetFakeOriginRef(dir, 'main', 'HEAD');
    const result = runPrModeCheck(dir, ['alpha', 'beta'], '0.9.0');
    assert.equal(result.ok, true);
});

test('runPrModeCheck passes when the current version is higher than origin/main', () => {
    const dir = scratch('pr-mode-higher');
    writeFixtureScripts(dir, ['alpha', 'beta'], '0.9.0');
    gitInit(dir);
    gitSetFakeOriginRef(dir, 'main', 'HEAD');
    const result = runPrModeCheck(dir, ['alpha', 'beta'], '0.9.1');
    assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// findReleaseBaseline / runReleaseModeCheck
// ---------------------------------------------------------------------------

test('findReleaseBaseline selects v0.8.5 for the real repository, not v1.0.0 or the legacy per-script tag', () => {
    const ids = listScriptIds(path.join(REPO_ROOT, 'scripts'));
    const result = findReleaseBaseline(REPO_ROOT, ids, 'v0.9.0');
    assert.equal(result.ok, true, result.error);
    assert.equal(result.baseline.tag, 'v0.8.5');
    assert.equal(result.baseline.version, '0.8.5');
});

test('runReleaseModeCheck passes for the real repository release tag v0.9.0', () => {
    const ids = listScriptIds(path.join(REPO_ROOT, 'scripts'));
    const result = runReleaseModeCheck(REPO_ROOT, ids, '0.9.0', 'v0.9.0');
    assert.equal(result.ok, true, result.errors?.join('\n'));
    assert.equal(result.baseline.tag, 'v0.8.5');
});

test('runReleaseModeCheck fails for an invalid --release-tag value', () => {
    const ids = listScriptIds(path.join(REPO_ROOT, 'scripts'));
    const result = runReleaseModeCheck(REPO_ROOT, ids, '0.9.0', 'not-a-tag');
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /not a valid/.test(e)));
});

test('runReleaseModeCheck fails when current version does not equal the tag version', () => {
    const ids = listScriptIds(path.join(REPO_ROOT, 'scripts'));
    const result = runReleaseModeCheck(REPO_ROOT, ids, '0.9.0', 'v0.9.1');
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /does not match/.test(e)));
});

function buildBaselineFixture() {
    const dir = scratch('release-baseline');
    const ids = ['alpha', 'beta'];
    writeFixtureScripts(dir, ids, '0.7.0');
    gitInit(dir); // commit 1: v0.7.0, tagged
    gitTag(dir, 'v0.7.0');

    writeFixtureScripts(dir, ids, '1.0.0');
    gitCommitAll(dir, 'bump to 1.0.0 (retired tag)');
    gitTag(dir, 'v1.0.0'); // retired: must always be excluded regardless of version value

    writeFixtureScripts(dir, ids, '0.8.0');
    gitCommitAll(dir, 'bump to 0.8.0');
    gitTag(dir, 'v0.8.0');

    // Legacy per-script tag: must never be treated as a repo-wide candidate,
    // even though its suffix parses as valid SemVer.
    gitTag(dir, 'alpha-v0.8.0');

    // Unsynchronized candidate: tag name says 0.8.5 but only `alpha` was
    // actually bumped there; `beta` is still 0.8.0. Must be excluded.
    fs.writeFileSync(
        path.join(dir, 'scripts', 'alpha', 'alpha.user.js'),
        fs.readFileSync(path.join(dir, 'scripts', 'alpha', 'alpha.user.js'), 'utf8').replace('0.8.0', '0.8.5'),
    );
    gitCommitAll(dir, 'unsynchronized bump');
    gitTag(dir, 'v0.8.5');

    writeFixtureScripts(dir, ids, '0.9.0');
    gitCommitAll(dir, 'bump to 0.9.0 (current, unreleased)');
    // Note: v0.9.0 itself is intentionally NOT tagged yet (it is "current").
    gitSetFakeOriginRef(dir, 'main', 'HEAD');
    return { dir, ids };
}

test('findReleaseBaseline excludes the current tag, retired v1.0.0, legacy per-script tags, and unsynchronized candidates, selecting v0.8.0', () => {
    const { dir, ids } = buildBaselineFixture();
    const result = findReleaseBaseline(dir, ids, 'v0.9.0');
    assert.equal(result.ok, true, result.error);
    assert.equal(result.baseline.tag, 'v0.8.0');
    assert.equal(result.baseline.version, '0.8.0');
});

test('runReleaseModeCheck succeeds end-to-end against the fixture history', () => {
    const { dir, ids } = buildBaselineFixture();
    const result = runReleaseModeCheck(dir, ids, '0.9.0', 'v0.9.0');
    assert.equal(result.ok, true, result.errors?.join('\n'));
    assert.equal(result.baseline.tag, 'v0.8.0');
});

test('runReleaseModeCheck fails when current version is not strictly greater than the baseline', () => {
    const dir = scratch('release-not-greater');
    const ids = ['alpha'];
    writeFixtureScripts(dir, ids, '0.8.0');
    gitInit(dir);
    gitTag(dir, 'v0.8.0');
    gitSetFakeOriginRef(dir, 'main', 'HEAD');
    // "current" is the same as the only candidate baseline -> not strictly greater.
    const result = runReleaseModeCheck(dir, ids, '0.8.0', 'v0.8.0');
    assert.equal(result.ok, false);
    // v0.8.0 both is-the-current-tag (excluded from candidates) and equals
    // current, so with no other candidate this must report an empty baseline.
    assert.ok(result.errors.some((e) => /no valid release baseline/i.test(e)));
});

test('findReleaseBaseline excludes the current release tag even when it already exists at HEAD (the real CI order: tag is pushed, then the workflow checks it out and validates)', () => {
    const dir = scratch('release-current-tag-exists');
    const ids = ['alpha'];
    writeFixtureScripts(dir, ids, '0.8.0');
    gitInit(dir);
    gitTag(dir, 'v0.8.0');

    writeFixtureScripts(dir, ids, '0.9.0');
    gitCommitAll(dir, 'bump to 0.9.0');
    gitTag(dir, 'v0.9.0'); // the tag being released already exists, as it does in the real Release workflow
    gitSetFakeOriginRef(dir, 'main', 'HEAD');

    const result = findReleaseBaseline(dir, ids, 'v0.9.0');
    assert.equal(result.ok, true, result.error);
    // Must select v0.8.0 as the baseline, not v0.9.0 (itself).
    assert.equal(result.baseline.tag, 'v0.8.0');
});

test('findReleaseBaseline fails with "no valid candidate" when only retired/current tags exist', () => {
    const dir = scratch('release-empty-baseline');
    const ids = ['alpha'];
    writeFixtureScripts(dir, ids, '1.0.0');
    gitInit(dir);
    gitTag(dir, 'v1.0.0');
    gitSetFakeOriginRef(dir, 'main', 'HEAD');
    const result = findReleaseBaseline(dir, ids, 'v0.9.0');
    assert.equal(result.ok, false);
    assert.match(result.error, /no valid release baseline/i);
});
