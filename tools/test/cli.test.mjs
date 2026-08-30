// CLI-contract integration tests: spawn the actual tools/*.mjs entry points
// (the exact commands the Task 2 CI/Release workflows will invoke) against
// the real repository to confirm exit codes and observable output.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
import { parseArgs, runValidate } from '../validate.mjs';

function run(scriptRelPath, args = []) {
    return spawnSync(process.execPath, [path.join(REPO_ROOT, scriptRelPath), ...args], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
    });
}

const scratchDirs = [];
function scratch(prefix) {
    const dir = makeScratchDir(prefix);
    scratchDirs.push(dir);
    return dir;
}
after(() => {
    for (const dir of scratchDirs) removeScratchDir(dir);
});

test('CLI: node tools/validate.mjs (PR/push mode) succeeds on the real repository', () => {
    const result = run('tools/validate.mjs');
    assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('CLI: node tools/validate.mjs --release-tag v0.9.0 succeeds and reports the v0.8.5 baseline', () => {
    const result = run('tools/validate.mjs', ['--release-tag', 'v0.9.0']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /v0\.8\.5/);
});

test('CLI: node tools/validate.mjs --release-tag v1.0.0 fails (retired tag reused)', () => {
    const result = run('tools/validate.mjs', ['--release-tag', 'v1.0.0']);
    assert.notEqual(result.status, 0);
});

// ---------------------------------------------------------------------------
// CRITICAL 1 regression at the CLI layer: the real repository's current
// version is 0.9.0, so the test above only ever reaches the "does not match
// release tag version" branch and never actually exercises the tombstone
// rejection. runValidate() takes an explicit repoRoot (exactly what the CLI
// entry point calls with the real repo root), so it can be exercised here
// against a fixture repo whose scripts really are bumped to 1.0.0, proving
// the CLI-level call path rejects --release-tag v1.0.0 for the right reason
// (retired), not merely because of a version mismatch that happens not to
// apply in the fixture.
// ---------------------------------------------------------------------------

test('runValidate rejects --release-tag v1.0.0 for the "retired" reason when current scripts are themselves 1.0.0 with a valid prior v0.9.0 baseline', () => {
    const dir = scratch('cli-retired-current-tag');
    const ids = ['alpha', 'beta'];
    writeFixtureScripts(dir, ids, '0.9.0');
    gitInit(dir);
    gitTag(dir, 'v0.9.0');

    writeFixtureScripts(dir, ids, '1.0.0');
    gitCommitAll(dir, 'bump to 1.0.0 (attempting to reuse retired tag)');
    gitSetFakeOriginRef(dir, 'main', 'HEAD');

    const { ok, report } = runValidate(['--release-tag', 'v1.0.0'], dir);
    assert.equal(ok, false, report.join('\n'));
    assert.ok(
        report.some((line) => /retired/i.test(line) && /v1\.0\.0/.test(line)),
        `expected a "retired"/v1.0.0 FAIL line, got:\n${report.join('\n')}`,
    );
});

test('CLI: node tools/validate.mjs --release-tag with no value fails (does not silently fall back to PR/push mode)', () => {
    const result = run('tools/validate.mjs', ['--release-tag']);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout, /Mode: PR\/push/);
    assert.match(result.stdout + result.stderr, /--release-tag/);
});

test('CLI: node tools/validate.mjs --release-tag "" (explicit empty value) fails (does not silently fall back to PR/push mode)', () => {
    const result = run('tools/validate.mjs', ['--release-tag', '']);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout, /Mode: PR\/push/);
    assert.match(result.stdout + result.stderr, /--release-tag/);
});

test('parseArgs distinguishes a bare --release-tag (flag present, no value) from no flag at all', () => {
    const bare = parseArgs(['--release-tag']);
    assert.equal(bare.releaseTagProvided, true);
    assert.equal(bare.releaseTag, undefined);

    const empty = parseArgs(['--release-tag', '']);
    assert.equal(empty.releaseTagProvided, true);
    assert.equal(empty.releaseTag, '');

    const none = parseArgs([]);
    assert.equal(none.releaseTagProvided, false);
    assert.equal(none.releaseTag, null);

    const withValue = parseArgs(['--release-tag', 'v0.9.0']);
    assert.equal(withValue.releaseTagProvided, true);
    assert.equal(withValue.releaseTag, 'v0.9.0');
});

test('CLI: node tools/run-tests.mjs discovers and passes exactly 3 files', () => {
    const result = run('tools/run-tests.mjs');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Discovered 3 test file/);
});

test('CLI: node tools/release-notes.mjs 0.9.0 emits Root + all 4 scripts in order', () => {
    const result = run('tools/release-notes.mjs', ['0.9.0']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const order = ['## Root', '## github-docs-lang-switch-cn', '## ldc-batch-download', '## ms-learn-lang-switch-cn', '## ms-learn-lang-switch-tw'];
    let lastIdx = -1;
    for (const label of order) {
        const idx = result.stdout.indexOf(label);
        assert.ok(idx > lastIdx, `expected "${label}" in order`);
        lastIdx = idx;
    }
});

test('CLI: node tools/release-notes.mjs with a missing argument fails', () => {
    const result = run('tools/release-notes.mjs');
    assert.notEqual(result.status, 0);
});

test('CLI: node tools/release-notes.mjs with an invalid version fails', () => {
    const result = run('tools/release-notes.mjs', ['v0.9.0']);
    assert.notEqual(result.status, 0);
});
