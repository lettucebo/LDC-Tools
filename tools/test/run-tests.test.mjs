import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, makeScratchDir, removeScratchDir } from './helpers.mjs';
import { discoverTestFiles, runTestFile, runAll } from '../lib/runTestsCore.mjs';

const scratchDirs = [];
function scratch(prefix) {
    const dir = makeScratchDir(prefix);
    scratchDirs.push(dir);
    return dir;
}
after(() => {
    for (const dir of scratchDirs) removeScratchDir(dir);
});

test('discoverTestFiles finds exactly the 3 current scripts/*/test/*.test.js files in the real repo, sorted', () => {
    const files = discoverTestFiles(REPO_ROOT);
    assert.equal(files.length, 3);
    const relative = files.map((f) => path.relative(REPO_ROOT, f).split(path.sep).join('/'));
    assert.deepEqual(relative, [
        'scripts/ldc-batch-download/test/pure-modules.test.js',
        'scripts/ms-learn-lang-switch-cn/test/pure-modules.test.js',
        'scripts/ms-learn-lang-switch-tw/test/pure-modules.test.js',
    ]);
});

test('discoverTestFiles returns an empty list when no scripts have test directories', () => {
    const dir = scratch('no-tests');
    fs.mkdirSync(path.join(dir, 'scripts', 'alpha'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scripts', 'alpha', 'alpha.user.js'), '// no tests here\n');
    const files = discoverTestFiles(dir);
    assert.deepEqual(files, []);
});

test('runAll fails with zero discovered tests', () => {
    const dir = scratch('zero-tests');
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    const result = runAll(dir, { log: () => {} });
    assert.equal(result.ok, false);
    assert.equal(result.files.length, 0);
});

test('runTestFile reports success for a passing child test', () => {
    const dir = scratch('child-pass');
    const file = path.join(dir, 'pass.test.js');
    fs.writeFileSync(file, 'process.exit(0);\n');
    const result = runTestFile(file);
    assert.equal(result.ok, true);
});

test('runTestFile reports failure for a failing child test', () => {
    const dir = scratch('child-fail');
    const file = path.join(dir, 'fail.test.js');
    fs.writeFileSync(file, 'process.exit(1);\n');
    const result = runTestFile(file);
    assert.equal(result.ok, false);
});

test('runAll fails overall when any discovered child test fails', () => {
    const dir = scratch('mixed-results');
    const okDir = path.join(dir, 'scripts', 'alpha', 'test');
    const badDir = path.join(dir, 'scripts', 'beta', 'test');
    fs.mkdirSync(okDir, { recursive: true });
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(okDir, 'a.test.js'), 'process.exit(0);\n');
    fs.writeFileSync(path.join(badDir, 'b.test.js'), 'process.exit(1);\n');
    const result = runAll(dir, { log: () => {} });
    assert.equal(result.ok, false);
    assert.equal(result.files.length, 2);
});

test('runAll succeeds when every discovered child test passes', () => {
    const dir = scratch('all-pass');
    const okDir = path.join(dir, 'scripts', 'alpha', 'test');
    fs.mkdirSync(okDir, { recursive: true });
    fs.writeFileSync(path.join(okDir, 'a.test.js'), 'process.exit(0);\n');
    const result = runAll(dir, { log: () => {} });
    assert.equal(result.ok, true);
});

test('runAll on the real repository discovers and passes all 3 current tests', () => {
    const result = runAll(REPO_ROOT, { log: () => {} });
    assert.equal(result.ok, true);
    assert.equal(result.files.length, 3);
});
