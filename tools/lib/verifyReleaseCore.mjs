// The single place in this repo that knows how to verify an *already
// published* GitHub Release: its shape (exists, right tag, not a draft, not a
// prerelease) and whether it is the repository's current "Latest" release.
//
// Why this module exists at all: `gh release view --json` has no `isLatest`
// field (that name is GraphQL-only and the CLI rejects it outright as an
// unsupported field, failing the whole call), so "Latest" can only be
// confirmed through the REST `repos/{owner}/{repo}/releases/latest`
// endpoint. Previously that knowledge was duplicated as shell snippets in the
// Release workflow, the release skill and RELEASING.md, and was guarded only
// by regexes over those snippets. Centralizing it here means the exact argv
// is asserted once, in tests, and the callers cannot drift.
//
// The command runner is injected so every failure mode is testable without a
// network, a token, or a `gh` binary. Everything fails closed: any command
// error, unparseable payload, missing field or mismatch is a failure.
import { parseRepoTag } from './semver.mjs';

/** The only `gh release view --json` fields this repo may rely on. */
export const RELEASE_VIEW_FIELDS = Object.freeze(['tagName', 'isDraft', 'isPrerelease', 'targetCommitish']);

export const RELEASE_VIEW_FIELDS_ARG = RELEASE_VIEW_FIELDS.join(',');

/**
 * `gh api` expands the `{owner}`/`{repo}` placeholders from the current
 * repository context (GH_REPO in CI, the git remote locally), so the caller
 * never has to interpolate untrusted values into the endpoint.
 */
export const LATEST_RELEASE_ENDPOINT = 'repos/{owner}/{repo}/releases/latest';

/**
 * @param {string} tag
 * @returns {{command: 'gh', args: string[]}}
 */
export function releaseViewCommand(tag) {
    return { command: 'gh', args: ['release', 'view', tag, '--json', RELEASE_VIEW_FIELDS_ARG] };
}

/** @returns {{command: 'gh', args: string[]}} */
export function latestReleaseCommand() {
    return { command: 'gh', args: ['api', LATEST_RELEASE_ENDPOINT, '--jq', '.tag_name'] };
}

function describeFailure(result) {
    const parts = [];
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    if (stderr) parts.push(stderr);
    if (!stderr && stdout) parts.push(stdout);
    return parts.join(' ') || '(no output)';
}

/**
 * Executes one command through the injected runner, normalizing every
 * abnormal outcome (throw, malformed return value, non-zero exit) into a
 * failure result rather than letting it pass as success.
 */
function execute(runCommand, spec, calls) {
    calls.push(spec);
    let result;
    try {
        result = runCommand(spec);
    } catch (err) {
        return { ok: false, error: `could not run \`gh ${spec.args.join(' ')}\`: ${err?.message ?? String(err)}` };
    }
    if (!result || typeof result !== 'object' || typeof result.status !== 'number') {
        return {
            ok: false,
            error: `command runner returned an unusable result for \`gh ${spec.args.join(' ')}\` (expected an object with a numeric status)`,
        };
    }
    return { ok: true, status: result.status, stdout: typeof result.stdout === 'string' ? result.stdout : '', stderr: typeof result.stderr === 'string' ? result.stderr : '', raw: result };
}

/**
 * Verifies that the release published for `tag` exists in the expected shape
 * and is the repository's current Latest release.
 *
 * @param {{tag: unknown, runCommand: (spec: {command: string, args: string[]}) => {status: number, stdout?: string, stderr?: string}}} options
 * @returns {{ok: true, tag: string, version: string, targetCommitish: string, latestTag: string, commands: Array<{command: string, args: string[]}>}
 *          |{ok: false, error: string, commands: Array<{command: string, args: string[]}>}}
 */
export function verifyRelease({ tag, runCommand }) {
    const commands = [];
    const fail = (error) => ({ ok: false, error, commands });

    if (typeof runCommand !== 'function') {
        return fail('verifyRelease requires a runCommand function');
    }

    const parsedTag = parseRepoTag(tag);
    if (!parsedTag) {
        return fail(
            `${JSON.stringify(tag)} is not a strict repo release tag of the form vX.Y.Z (no prerelease or build metadata suffix)`,
        );
    }

    const view = execute(runCommand, releaseViewCommand(parsedTag.tag), commands);
    if (!view.ok) return fail(view.error);
    if (view.status !== 0) {
        return fail(`gh release view ${parsedTag.tag} failed (exit ${view.status}): ${describeFailure(view)}`);
    }

    let payload;
    try {
        payload = JSON.parse(view.stdout);
    } catch (err) {
        return fail(`could not parse \`gh release view ${parsedTag.tag}\` output as JSON: ${err.message}`);
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        return fail(`\`gh release view ${parsedTag.tag}\` did not return a JSON object`);
    }

    for (const field of ['tagName', 'targetCommitish']) {
        if (typeof payload[field] !== 'string' || payload[field] === '') {
            return fail(`release ${parsedTag.tag} reported no usable "${field}" (got ${JSON.stringify(payload[field])})`);
        }
    }
    for (const field of ['isDraft', 'isPrerelease']) {
        if (typeof payload[field] !== 'boolean') {
            return fail(`release ${parsedTag.tag} reported no usable "${field}" (got ${JSON.stringify(payload[field])})`);
        }
    }

    if (payload.tagName !== parsedTag.tag) {
        return fail(`release lookup for ${parsedTag.tag} returned tagName ${JSON.stringify(payload.tagName)}`);
    }
    if (payload.isDraft) {
        return fail(`release ${parsedTag.tag} is still a draft`);
    }
    if (payload.isPrerelease) {
        return fail(`release ${parsedTag.tag} is marked as a prerelease`);
    }

    const latest = execute(runCommand, latestReleaseCommand(), commands);
    if (!latest.ok) return fail(latest.error);
    if (latest.status !== 0) {
        return fail(`querying ${LATEST_RELEASE_ENDPOINT} failed (exit ${latest.status}): ${describeFailure(latest)}`);
    }

    const latestTag = latest.stdout.trim();
    if (latestTag === '') {
        return fail(`${LATEST_RELEASE_ENDPOINT} returned an empty tag name; cannot confirm ${parsedTag.tag} is Latest`);
    }
    if (latestTag !== parsedTag.tag) {
        return fail(`${LATEST_RELEASE_ENDPOINT} reports ${JSON.stringify(latestTag)} as the Latest release, not ${parsedTag.tag}`);
    }

    return {
        ok: true,
        tag: parsedTag.tag,
        version: parsedTag.version,
        targetCommitish: payload.targetCommitish,
        latestTag,
        commands,
    };
}
