// Shared fixture helpers for tools/test/*. All fixtures are created under a
// repo-local scratch directory (never the OS temp dir) and removed by the
// caller (or by callers' `after`/`afterEach` hooks) once a test finishes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TOOLS_ROOT = path.resolve(HERE, '..');
export const REPO_ROOT = path.resolve(TOOLS_ROOT, '..');
const SCRATCH_ROOT = path.join(HERE, '.tmp');

fs.mkdirSync(SCRATCH_ROOT, { recursive: true });

export function makeScratchDir(prefix) {
    return fs.mkdtempSync(path.join(SCRATCH_ROOT, `${prefix}-`));
}

export function removeScratchDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

const GOOD_HEADER_TEMPLATE = (id, version) => `// ==UserScript==
// @name         Sample ${id}
// @namespace    https://github.com/lettucebo/TampermonkeyScripts
// @version      ${version}
// @description  Sample script
// @author       lettucebo
// @license      MIT
// @homepageURL  https://github.com/lettucebo/TampermonkeyScripts/tree/main/scripts/${id}
// @supportURL   https://github.com/lettucebo/TampermonkeyScripts/issues
// @updateURL    https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/${id}/${id}.user.js
// @downloadURL  https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/${id}/${id}.user.js
// @grant        none
// ==/UserScript==

(function () { 'use strict'; })();
`;

const GOOD_CHANGELOG_TEMPLATE = (version) => `# Changelog

## [Unreleased]

## [${version}] — 2026-08-30

### Added
- Something new for this version.
`;

/**
 * Writes scripts/<id>/<id>.user.js + CHANGELOG.md for each requested id into
 * `repoDir`, all sharing the same synchronized version (unless overridden).
 */
export function writeFixtureScripts(repoDir, ids, version = '0.9.0') {
    for (const id of ids) {
        const dir = path.join(repoDir, 'scripts', id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${id}.user.js`), GOOD_HEADER_TEMPLATE(id, version));
        fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), GOOD_CHANGELOG_TEMPLATE(version));
    }
}

function git(cwd, args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

/** Runs an arbitrary git command inside a fixture repo (branching, checkout, ...). */
export function gitRun(repoDir, args) {
    return git(repoDir, args);
}

/**
 * Initializes a throwaway git repository in `repoDir` (already populated with
 * fixture files) and commits everything on `main`.
 */
export function gitInit(repoDir) {
    git(repoDir, ['init', '--quiet', '--initial-branch=main']);
    git(repoDir, ['config', 'user.email', 'test@example.com']);
    git(repoDir, ['config', 'user.name', 'Test']);
    git(repoDir, ['add', '-A']);
    git(repoDir, ['commit', '--quiet', '-m', 'init']);
}

export function gitCommitAll(repoDir, message) {
    git(repoDir, ['add', '-A']);
    git(repoDir, ['commit', '--quiet', '-m', message]);
}

export function gitTag(repoDir, tag) {
    git(repoDir, ['tag', tag]);
}

/** Points refs/remotes/origin/<branch> at the given ref without a real remote. */
export function gitSetFakeOriginRef(repoDir, branch, ref) {
    const sha = git(repoDir, ['rev-parse', ref]).trim();
    git(repoDir, ['update-ref', `refs/remotes/origin/${branch}`, sha]);
}

export function gitCurrentSha(repoDir, ref = 'HEAD') {
    return git(repoDir, ['rev-parse', ref]).trim();
}
