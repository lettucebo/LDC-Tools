// CLI-contract integration tests: spawn the actual tools/*.mjs entry points
// (the exact commands the Task 2 CI/Release workflows will invoke) against
// the real repository to confirm exit codes and observable output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';

function run(scriptRelPath, args = []) {
    return spawnSync(process.execPath, [path.join(REPO_ROOT, scriptRelPath), ...args], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
    });
}

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
