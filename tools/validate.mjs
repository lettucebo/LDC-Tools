#!/usr/bin/env node
// CLI for the repo's release validation checks. See tools/lib/validateCore.mjs
// for the underlying, independently-tested logic.
//
// Usage:
//   node tools/validate.mjs                       # PR/push mode
//   node tools/validate.mjs --release-tag vX.Y.Z  # Release mode
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
    collectScripts,
    checkFilesExist,
    validateAllMetadata,
    requireSynchronizedVersion,
    validateAllChangelogs,
    runPrModeCheck,
    runReleaseModeCheck,
} from './lib/validateCore.mjs';

export function parseArgs(argv) {
    let releaseTag = null;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--release-tag') {
            releaseTag = argv[i + 1];
            i++;
        }
    }
    return { releaseTag };
}

/**
 * Runs every validation check against `repoRoot` for the given CLI argv.
 * @returns {{ok: boolean, report: string[]}}
 */
export function runValidate(argv, repoRoot) {
    const report = [];
    const log = (line) => report.push(line);
    const { releaseTag } = parseArgs(argv);

    log(releaseTag ? `Mode: release (--release-tag ${releaseTag})` : 'Mode: PR/push');

    const scripts = collectScripts(repoRoot);
    log(`Found ${scripts.length} script folder(s): ${scripts.map((s) => s.id).join(', ')}`);

    const fileErrors = checkFilesExist(scripts);
    if (fileErrors.length) {
        for (const e of fileErrors) log(`FAIL [files] ${e}`);
        return { ok: false, report };
    }
    log('PASS [files] every script has <id>.user.js and CHANGELOG.md');

    const metaResult = validateAllMetadata(scripts);
    if (!metaResult.ok) {
        for (const e of metaResult.errors) log(`FAIL [metadata] ${e}`);
        return { ok: false, report };
    }
    log('PASS [metadata] node --check + @namespace/@updateURL/@downloadURL/@homepageURL/@supportURL/@license/@version all valid');

    const sync = requireSynchronizedVersion(metaResult.versions);
    if (!sync.ok) {
        log(`FAIL [version] ${sync.error}`);
        return { ok: false, report };
    }
    log(`PASS [version] synchronized shared version: ${sync.version}`);

    const changelogResult = validateAllChangelogs(scripts, sync.version);
    if (!changelogResult.ok) {
        for (const e of changelogResult.errors) log(`FAIL [changelog] ${e}`);
        return { ok: false, report };
    }
    log('PASS [changelog] every script CHANGELOG.md has a valid, first, non-empty section for the current version');

    const ids = scripts.map((s) => s.id);
    if (releaseTag) {
        const releaseResult = runReleaseModeCheck(repoRoot, ids, sync.version, releaseTag);
        if (!releaseResult.ok) {
            for (const e of releaseResult.errors) log(`FAIL [release] ${e}`);
            return { ok: false, report };
        }
        log(`PASS [release] baseline is ${releaseResult.baseline.tag} (${releaseResult.baseline.version}); current ${sync.version} is strictly greater`);
    } else {
        const prResult = runPrModeCheck(repoRoot, ids, sync.version);
        if (!prResult.ok) {
            for (const e of prResult.errors) log(`FAIL [pr] ${e}`);
            return { ok: false, report };
        }
        log(`PASS [pr] current version ${sync.version} is >= origin/main version ${prResult.baseVersion}`);
    }

    log('All checks passed.');
    return { ok: true, report };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const { ok, report } = runValidate(process.argv.slice(2), repoRoot);
    console.log(report.join('\n'));
    process.exit(ok ? 0 : 1);
}
