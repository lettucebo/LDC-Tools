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

export const USAGE = [
    'Usage:',
    '  node tools/validate.mjs                       # PR/push mode',
    '  node tools/validate.mjs --release-tag vX.Y.Z  # Release mode',
].join('\n');

/**
 * Strictly parses the CLI's only two accepted argument shapes: no arguments
 * at all, or exactly `--release-tag <value>` as two separate arguments.
 *
 * Anything else is a hard error. A release validator must never silently
 * downgrade its own mode: an ignored typo (`--release-tag=v0.9.0`,
 * `--relase-tag v0.9.0`, a bare positional `v0.9.0`) would previously run
 * the far weaker PR/push mode - no tag/version equality check, no
 * strictly-greater baseline gate, no `v1.0.0` tombstone check - while still
 * exiting 0 and looking like a successful release validation.
 *
 * @returns {{ok: true, releaseTag: string|null, releaseTagProvided: boolean}
 *          |{ok: false, error: string}}
 */
export function parseArgs(argv) {
    if (argv.length === 0) {
        return { ok: true, releaseTag: null, releaseTagProvided: false };
    }
    if (argv[0] !== '--release-tag') {
        if (argv[0].startsWith('--release-tag=')) {
            return {
                ok: false,
                error: `"${argv[0]}": --release-tag does not support "=" syntax; pass the value as a separate argument (--release-tag v0.9.0)`,
            };
        }
        const kind = argv[0].startsWith('-') ? 'unknown option' : 'unexpected positional argument';
        return { ok: false, error: `${kind} "${argv[0]}"` };
    }
    if (argv.length === 1) {
        return { ok: false, error: '--release-tag requires a non-empty vX.Y.Z value (e.g. --release-tag v0.9.0)' };
    }
    if (argv.length > 2) {
        return {
            ok: false,
            error: `unexpected extra argument(s) after --release-tag ${JSON.stringify(argv[1])}: ${argv
                .slice(2)
                .map((a) => JSON.stringify(a))
                .join(', ')} (--release-tag may be given at most once, with exactly one value)`,
        };
    }
    if (argv[1] === '') {
        return { ok: false, error: '--release-tag requires a non-empty vX.Y.Z value (e.g. --release-tag v0.9.0)' };
    }
    return { ok: true, releaseTag: argv[1], releaseTagProvided: true };
}

/**
 * Runs every validation check against `repoRoot` for the given CLI argv.
 * @returns {{ok: boolean, report: string[]}}
 */
export function runValidate(argv, repoRoot) {
    const report = [];
    const log = (line) => report.push(line);
    const parsed = parseArgs(argv);

    if (!parsed.ok) {
        log(`FAIL [args] ${parsed.error}`);
        log(USAGE);
        return { ok: false, report };
    }
    const { releaseTag, releaseTagProvided } = parsed;

    log(releaseTagProvided ? `Mode: release (--release-tag ${releaseTag})` : 'Mode: PR/push');

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
    if (releaseTagProvided) {
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
