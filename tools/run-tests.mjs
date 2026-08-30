#!/usr/bin/env node
// CLI that discovers and runs every scripts/*/test/*.test.js file. See
// tools/lib/runTestsCore.mjs for the underlying, independently-tested logic.
//
// Usage:
//   node tools/run-tests.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runAll } from './lib/runTestsCore.mjs';

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const { ok } = runAll(repoRoot);
    process.exit(ok ? 0 : 1);
}
