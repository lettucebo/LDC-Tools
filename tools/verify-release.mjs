#!/usr/bin/env node
// CLI that verifies an already-published GitHub Release: it exists for the
// exact tag, is neither a draft nor a prerelease, and is the repository's
// current "Latest" release. See tools/lib/verifyReleaseCore.mjs for the
// underlying, independently-tested logic.
//
// Usage:
//   node tools/verify-release.mjs --tag vX.Y.Z
//
// Authentication and repository context are inherited from the environment
// (GH_TOKEN/GH_REPO in the Release workflow, `gh auth` + the git remote
// locally). No credential is ever read, echoed, or logged by this tool, and
// any token-shaped text in gh's own output is masked before printing.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { verifyRelease, LATEST_RELEASE_ENDPOINT } from './lib/verifyReleaseCore.mjs';

export const USAGE = ['Usage:', '  node tools/verify-release.mjs --tag vX.Y.Z'].join('\n');

const TOKEN_ENV_VARS = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN'];
const TOKEN_SHAPES = [/\bgh[pousr]_[A-Za-z0-9]{16,}/g, /\bgithub_pat_[A-Za-z0-9_]{16,}/g];

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Masks anything token-shaped before it can reach stdout/stderr: the values
 * of the known token environment variables (in case gh ever echoes one back)
 * plus the documented GitHub token formats.
 * @param {string} text
 * @param {Record<string, string|undefined>} [env]
 */
export function redactSecrets(text, env = process.env) {
    let out = String(text);
    for (const name of TOKEN_ENV_VARS) {
        const value = env?.[name];
        if (typeof value === 'string' && value.length >= 8) {
            out = out.replace(new RegExp(escapeRegExp(value), 'g'), '***');
        }
    }
    for (const shape of TOKEN_SHAPES) out = out.replace(shape, '***');
    return out;
}

/**
 * Strictly parses the CLI's only accepted argument shape: exactly
 * `--tag <value>` as two separate arguments.
 *
 * A verification tool that silently accepted a typo (`--tag=v0.9.0`,
 * `--tags v0.9.0`, a bare positional) and then verified nothing would be
 * worse than no check at all, so anything else is a hard error.
 *
 * @returns {{ok: true, tag: string}|{ok: false, error: string}}
 */
export function parseArgs(argv) {
    if (argv.length === 0) {
        return { ok: false, error: '--tag vX.Y.Z is required' };
    }
    if (argv[0] !== '--tag') {
        if (argv[0].startsWith('--tag=')) {
            return {
                ok: false,
                error: `"${argv[0]}": --tag does not support "=" syntax; pass the value as a separate argument (--tag v0.9.0)`,
            };
        }
        const kind = argv[0].startsWith('-') ? 'unknown option' : 'unexpected positional argument';
        return { ok: false, error: `${kind} "${argv[0]}"` };
    }
    if (argv.length === 1 || argv[1] === '') {
        return { ok: false, error: '--tag requires a non-empty vX.Y.Z value (e.g. --tag v0.9.0)' };
    }
    if (argv.length > 2) {
        return {
            ok: false,
            error: `unexpected extra argument(s) after --tag ${JSON.stringify(argv[1])}: ${argv
                .slice(2)
                .map((a) => JSON.stringify(a))
                .join(', ')} (--tag may be given at most once, with exactly one value)`,
        };
    }
    return { ok: true, tag: argv[1] };
}

/**
 * Runs `gh` without a shell (no interpolation of any value into a command
 * line) and inherits the ambient gh authentication/repository context.
 * @param {{command: string, args: string[]}} spec
 */
export function defaultRunCommand({ command, args }) {
    const result = spawnSync(command, args, {
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error) {
        return { status: 1, stdout: '', stderr: result.error.message };
    }
    return {
        // A signal-killed process reports a null status; treat that as a
        // failure rather than letting it fall through as success.
        status: typeof result.status === 'number' ? result.status : 1,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
    };
}

/**
 * @returns {{ok: boolean, report: string[]}}
 */
export function runVerifyRelease(argv, runCommand = defaultRunCommand) {
    const report = [];
    const log = (line) => report.push(redactSecrets(line));

    const parsed = parseArgs(argv);
    if (!parsed.ok) {
        log(`FAIL [args] ${parsed.error}`);
        log(USAGE);
        return { ok: false, report };
    }

    log(`Verifying published release ${parsed.tag}`);
    const result = verifyRelease({ tag: parsed.tag, runCommand });
    for (const { command, args } of result.commands) log(`  ran: ${command} ${args.join(' ')}`);

    if (!result.ok) {
        log(`FAIL [verify] ${result.error}`);
        return { ok: false, report };
    }

    log(`PASS [release] ${result.tag} exists, is not a draft and is not a prerelease (target ${result.targetCommitish})`);
    log(`PASS [latest] ${LATEST_RELEASE_ENDPOINT} reports ${result.latestTag} as Latest`);
    log(`Post-publication verification passed for ${result.tag}.`);
    return { ok: true, report };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
    const { ok, report } = runVerifyRelease(process.argv.slice(2));
    const text = report.join('\n');
    if (ok) console.log(text);
    else console.error(text);
    process.exit(ok ? 0 : 1);
}
