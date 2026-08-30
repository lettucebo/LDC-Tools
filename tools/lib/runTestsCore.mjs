// Core, testable logic behind tools/run-tests.mjs: discovers
// `scripts/*/test/*.test.js` and runs each as an independent child process.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { listScriptIds } from './repoScripts.mjs';

/**
 * Discovers every `scripts/<id>/test/*.test.js` file in `repoRoot`, sorted
 * deterministically (by script id, then filename).
 */
export function discoverTestFiles(repoRoot) {
    const scriptsRoot = path.join(repoRoot, 'scripts');
    if (!fs.existsSync(scriptsRoot)) return [];
    const files = [];
    for (const id of listScriptIds(scriptsRoot)) {
        const testDir = path.join(scriptsRoot, id, 'test');
        if (!fs.existsSync(testDir)) continue;
        const entries = fs
            .readdirSync(testDir)
            .filter((f) => f.endsWith('.test.js'))
            .sort((a, b) => a.localeCompare(b));
        for (const f of entries) files.push(path.join(testDir, f));
    }
    return files;
}

/** Runs a single test file as a child process with inherited stdio. */
export function runTestFile(filePath) {
    const result = spawnSync(process.execPath, [filePath], { stdio: 'inherit' });
    return { file: filePath, ok: result.status === 0, status: result.status };
}

/**
 * Discovers and runs every `scripts/*\/test/*.test.js` file. Fails if zero
 * files are discovered, or if any child test process exits non-zero.
 */
export function runAll(repoRoot, { log = console.log } = {}) {
    const files = discoverTestFiles(repoRoot);
    log(`Discovered ${files.length} test file(s):`);
    for (const f of files) log(`  - ${path.relative(repoRoot, f)}`);
    if (files.length === 0) {
        log('FAIL: no test files discovered.');
        return { ok: false, files };
    }
    let allOk = true;
    for (const f of files) {
        log(`\n--- Running ${path.relative(repoRoot, f)} ---`);
        const result = runTestFile(f);
        if (!result.ok) {
            allOk = false;
            log(`FAIL: ${path.relative(repoRoot, f)} exited with status ${result.status}`);
        }
    }
    log(allOk ? '\nAll discovered test files passed.' : '\nOne or more test files failed.');
    return { ok: allOk, files };
}
