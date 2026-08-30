// Unit tests for the centralized post-publication release verifier.
//
// These assert the *exact* argv handed to `gh`, so the unsupported
// `isLatest` field (GraphQL-only; `gh release view --json` rejects it and
// fails the whole call) can never reappear: there is exactly one place in
// the repo that builds these commands, and it is pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    RELEASE_VIEW_FIELDS,
    RELEASE_VIEW_FIELDS_ARG,
    LATEST_RELEASE_ENDPOINT,
    releaseViewCommand,
    latestReleaseCommand,
    verifyRelease,
} from '../lib/verifyReleaseCore.mjs';

const TAG = 'v0.9.0';
const SHA = '0123456789abcdef0123456789abcdef01234567';

const RELEASE_VIEW_ARGV = ['release', 'view', TAG, '--json', 'tagName,isDraft,isPrerelease,targetCommitish'];
const LATEST_ARGV = ['api', 'repos/{owner}/{repo}/releases/latest', '--jq', '.tag_name'];

function okJson(overrides = {}) {
    return JSON.stringify({
        tagName: TAG,
        isDraft: false,
        isPrerelease: false,
        targetCommitish: SHA,
        ...overrides,
    });
}

/**
 * Builds a fake command runner that replays scripted results in order and
 * records every invocation verbatim.
 * @param {Array<{status?: number, stdout?: string, stderr?: string, throws?: Error}>} results
 */
function fakeRunner(results) {
    const calls = [];
    const runCommand = ({ command, args }) => {
        calls.push({ command, args });
        const next = results[calls.length - 1];
        if (!next) throw new Error(`unexpected extra command: ${command} ${args.join(' ')}`);
        if (next.throws) throw next.throws;
        return { status: next.status ?? 0, stdout: next.stdout ?? '', stderr: next.stderr ?? '' };
    };
    return { runCommand, calls };
}

// ---------------------------------------------------------------------------
// Command contract: the only gh commands this repo may use to verify a
// published release, pinned argv-exactly.
// ---------------------------------------------------------------------------

test('release view command uses only supported --json fields and never isLatest', () => {
    assert.deepEqual(RELEASE_VIEW_FIELDS, ['tagName', 'isDraft', 'isPrerelease', 'targetCommitish']);
    assert.equal(RELEASE_VIEW_FIELDS_ARG, 'tagName,isDraft,isPrerelease,targetCommitish');
    assert.ok(!RELEASE_VIEW_FIELDS.includes('isLatest'));
    assert.ok(!/isLatest/.test(RELEASE_VIEW_FIELDS_ARG));
    assert.deepEqual(releaseViewCommand(TAG), { command: 'gh', args: RELEASE_VIEW_ARGV });
});

test('latest command queries the REST releases/latest endpoint for .tag_name', () => {
    assert.equal(LATEST_RELEASE_ENDPOINT, 'repos/{owner}/{repo}/releases/latest');
    assert.deepEqual(latestReleaseCommand(), { command: 'gh', args: LATEST_ARGV });
});

test('verifyRelease succeeds and runs exactly the two supported commands, in order', () => {
    const { runCommand, calls } = fakeRunner([{ stdout: okJson() }, { stdout: `${TAG}\n` }]);
    const result = verifyRelease({ tag: TAG, runCommand });

    assert.equal(result.ok, true, result.error);
    assert.equal(result.tag, TAG);
    assert.equal(result.version, '0.9.0');
    assert.equal(result.targetCommitish, SHA);
    assert.equal(result.latestTag, TAG);
    assert.deepEqual(calls, [
        { command: 'gh', args: RELEASE_VIEW_ARGV },
        { command: 'gh', args: LATEST_ARGV },
    ]);
    assert.deepEqual(result.commands, calls);
});

test('verifyRelease never passes isLatest in any executed argv', () => {
    const { runCommand, calls } = fakeRunner([{ stdout: okJson() }, { stdout: TAG }]);
    verifyRelease({ tag: TAG, runCommand });
    const flat = calls.map((c) => [c.command, ...c.args].join(' ')).join('\n');
    assert.ok(!/isLatest/.test(flat), `isLatest leaked into an executed command:\n${flat}`);
});

// ---------------------------------------------------------------------------
// Tag shape: identical strictness to the workflow's tag gate.
// ---------------------------------------------------------------------------

for (const badTag of ['', 'v0.9', '0.9.0', 'v0.9.0-rc.1', 'v0.9.0+build.5', 'ldc-batch-download-v0.8.2', 'v01.9.0', ' v0.9.0']) {
    test(`verifyRelease rejects tag ${JSON.stringify(badTag)} without running any command`, () => {
        const { runCommand, calls } = fakeRunner([]);
        const result = verifyRelease({ tag: badTag, runCommand });
        assert.equal(result.ok, false);
        assert.match(result.error, /vX\.Y\.Z/);
        assert.deepEqual(calls, []);
    });
}

test('verifyRelease rejects a non-string tag without running any command', () => {
    const { runCommand, calls } = fakeRunner([]);
    const result = verifyRelease({ tag: undefined, runCommand });
    assert.equal(result.ok, false);
    assert.deepEqual(calls, []);
});

// ---------------------------------------------------------------------------
// Fail-closed behavior on every failure mode.
// ---------------------------------------------------------------------------

test('verifyRelease fails when gh release view exits non-zero, and does not query Latest', () => {
    const { runCommand, calls } = fakeRunner([
        { status: 1, stdout: '', stderr: 'unknown JSON field: "isLatest"' },
    ]);
    const result = verifyRelease({ tag: TAG, runCommand });
    assert.equal(result.ok, false);
    assert.match(result.error, /gh release view/);
    assert.match(result.error, /unknown JSON field/);
    assert.equal(calls.length, 1);
});

test('verifyRelease fails closed when the runner throws', () => {
    const { runCommand, calls } = fakeRunner([{ throws: new Error('spawn gh ENOENT') }]);
    const result = verifyRelease({ tag: TAG, runCommand });
    assert.equal(result.ok, false);
    assert.match(result.error, /ENOENT/);
    assert.equal(calls.length, 1);
});

test('verifyRelease fails closed when the runner returns a malformed result', () => {
    const runCommand = () => 'not a result object';
    const result = verifyRelease({ tag: TAG, runCommand });
    assert.equal(result.ok, false);
    assert.match(result.error, /runner/i);
});

test('verifyRelease fails when release view output is not valid JSON', () => {
    const { runCommand } = fakeRunner([{ stdout: 'not json at all' }, { stdout: TAG }]);
    const result = verifyRelease({ tag: TAG, runCommand });
    assert.equal(result.ok, false);
    assert.match(result.error, /JSON/);
});

test('verifyRelease fails when release view output is JSON but not an object', () => {
    const { runCommand } = fakeRunner([{ stdout: '[]' }, { stdout: TAG }]);
    const result = verifyRelease({ tag: TAG, runCommand });
    assert.equal(result.ok, false);
    assert.match(result.error, /JSON object/);
});

for (const [name, overrides, pattern] of [
    ['tagName missing', { tagName: undefined }, /tagName/],
    ['tagName wrong type', { tagName: 5 }, /tagName/],
    ['isDraft missing', { isDraft: undefined }, /isDraft/],
    ['isPrerelease wrong type', { isPrerelease: 'false' }, /isPrerelease/],
    ['targetCommitish missing', { targetCommitish: undefined }, /targetCommitish/],
]) {
    test(`verifyRelease fails when the release view payload has ${name}`, () => {
        const payload = JSON.parse(okJson());
        for (const [key, value] of Object.entries(overrides)) {
            if (value === undefined) delete payload[key];
            else payload[key] = value;
        }
        const { runCommand } = fakeRunner([{ stdout: JSON.stringify(payload) }, { stdout: TAG }]);
        const result = verifyRelease({ tag: TAG, runCommand });
        assert.equal(result.ok, false);
        assert.match(result.error, pattern);
    });
}

test('verifyRelease fails when the release reports a different tagName', () => {
    const { runCommand, calls } = fakeRunner([{ stdout: okJson({ tagName: 'v0.8.5' }) }, { stdout: TAG }]);
    const result = verifyRelease({ tag: TAG, runCommand });
    assert.equal(result.ok, false);
    assert.match(result.error, /v0\.8\.5/);
    assert.equal(calls.length, 1);
});

test('verifyRelease fails when the release is a draft', () => {
    const { runCommand } = fakeRunner([{ stdout: okJson({ isDraft: true }) }, { stdout: TAG }]);
    const result = verifyRelease({ tag: TAG, runCommand });
    assert.equal(result.ok, false);
    assert.match(result.error, /draft/i);
});

test('verifyRelease fails when the release is a prerelease', () => {
    const { runCommand } = fakeRunner([{ stdout: okJson({ isPrerelease: true }) }, { stdout: TAG }]);
    const result = verifyRelease({ tag: TAG, runCommand });
    assert.equal(result.ok, false);
    assert.match(result.error, /prerelease/i);
});

test('verifyRelease fails when the releases/latest query errors', () => {
    const { runCommand, calls } = fakeRunner([
        { stdout: okJson() },
        { status: 1, stdout: '', stderr: 'HTTP 404: Not Found' },
    ]);
    const result = verifyRelease({ tag: TAG, runCommand });
    assert.equal(result.ok, false);
    assert.match(result.error, /releases\/latest/);
    assert.match(result.error, /404/);
    assert.equal(calls.length, 2);
});

test('verifyRelease fails closed when the runner throws on the Latest query', () => {
    const { runCommand } = fakeRunner([{ stdout: okJson() }, { throws: new Error('socket hang up') }]);
    const result = verifyRelease({ tag: TAG, runCommand });
    assert.equal(result.ok, false);
    assert.match(result.error, /socket hang up/);
});

test('verifyRelease fails when releases/latest reports a different tag', () => {
    const { runCommand } = fakeRunner([{ stdout: okJson() }, { stdout: 'v0.8.5\n' }]);
    const result = verifyRelease({ tag: TAG, runCommand });
    assert.equal(result.ok, false);
    assert.match(result.error, /v0\.8\.5/);
    assert.match(result.error, /Latest/);
});

test('verifyRelease fails when releases/latest returns empty output', () => {
    const { runCommand } = fakeRunner([{ stdout: okJson() }, { stdout: '   \n' }]);
    const result = verifyRelease({ tag: TAG, runCommand });
    assert.equal(result.ok, false);
    assert.match(result.error, /empty|no tag/i);
});

test('verifyRelease requires a callable runner', () => {
    const result = verifyRelease({ tag: TAG, runCommand: null });
    assert.equal(result.ok, false);
    assert.match(result.error, /runCommand/);
});
