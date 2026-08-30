// CLI-contract tests for tools/verify-release.mjs.
//
// The CLI's whole decision path is exercised through runVerifyRelease() with
// an injected command runner (no network, no gh binary, deterministic), plus
// spawned runs for the argument-rejection paths, which must fail before any
// command is executed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';
import { USAGE, parseArgs, runVerifyRelease, redactSecrets } from '../verify-release.mjs';

const TAG = 'v0.9.0';
const SHA = '0123456789abcdef0123456789abcdef01234567';

function okJson(overrides = {}) {
    return JSON.stringify({
        tagName: TAG,
        isDraft: false,
        isPrerelease: false,
        targetCommitish: SHA,
        ...overrides,
    });
}

function fakeRunner(results) {
    const calls = [];
    const runCommand = ({ command, args }) => {
        calls.push({ command, args });
        const next = results[calls.length - 1];
        if (!next) throw new Error(`unexpected extra command: ${command} ${args.join(' ')}`);
        return { status: next.status ?? 0, stdout: next.stdout ?? '', stderr: next.stderr ?? '' };
    };
    return { runCommand, calls };
}

function runCli(args = []) {
    return spawnSync(process.execPath, [path.join(REPO_ROOT, 'tools', 'verify-release.mjs'), ...args], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
    });
}

// ---------------------------------------------------------------------------
// Strict argument parsing: a verifier that silently accepts a typo would
// "pass" without verifying anything.
// ---------------------------------------------------------------------------

test('parseArgs accepts exactly --tag <value>', () => {
    assert.deepEqual(parseArgs(['--tag', TAG]), { ok: true, tag: TAG });
});

for (const [name, argv, pattern] of [
    ['no arguments', [], /--tag/],
    ['--tag with no value', ['--tag'], /non-empty/],
    ['--tag with an empty value', ['--tag', ''], /non-empty/],
    ['--tag= syntax', ['--tag=v0.9.0'], /"="/],
    ['a misspelled option', ['--tags', TAG], /unknown option/],
    ['a bare positional', [TAG], /positional/],
    ['extra arguments', ['--tag', TAG, '--force'], /extra argument/],
    ['a repeated flag', ['--tag', TAG, '--tag', TAG], /extra argument/],
]) {
    test(`parseArgs rejects ${name}`, () => {
        const parsed = parseArgs(argv);
        assert.equal(parsed.ok, false, `expected ${JSON.stringify(argv)} to be rejected`);
        assert.match(parsed.error, pattern);
    });
}

// ---------------------------------------------------------------------------
// End-to-end CLI logic with an injected runner.
// ---------------------------------------------------------------------------

test('runVerifyRelease succeeds and reports the verified release', () => {
    const { runCommand, calls } = fakeRunner([{ stdout: okJson() }, { stdout: `${TAG}\n` }]);
    const { ok, report } = runVerifyRelease(['--tag', TAG], runCommand);

    assert.equal(ok, true, report.join('\n'));
    assert.deepEqual(calls, [
        { command: 'gh', args: ['release', 'view', TAG, '--json', 'tagName,isDraft,isPrerelease,targetCommitish'] },
        { command: 'gh', args: ['api', 'repos/{owner}/{repo}/releases/latest', '--jq', '.tag_name'] },
    ]);
    const text = report.join('\n');
    assert.match(text, /PASS/);
    assert.match(text, /v0\.9\.0/);
});

test('runVerifyRelease fails and reports the reason when the release is not Latest', () => {
    const { runCommand } = fakeRunner([{ stdout: okJson() }, { stdout: 'v0.8.5' }]);
    const { ok, report } = runVerifyRelease(['--tag', TAG], runCommand);
    assert.equal(ok, false);
    assert.match(report.join('\n'), /FAIL .*v0\.8\.5/s);
});

test('runVerifyRelease fails on bad arguments and prints usage without running a command', () => {
    const { runCommand, calls } = fakeRunner([]);
    const { ok, report } = runVerifyRelease(['--tag=v0.9.0'], runCommand);
    assert.equal(ok, false);
    assert.deepEqual(calls, []);
    assert.ok(report.join('\n').includes(USAGE));
});

test('runVerifyRelease redacts token-shaped values out of its report', () => {
    const secret = 'ghp_0123456789abcdefghijABCDEFGHIJ0123456789';
    const { runCommand } = fakeRunner([{ status: 1, stderr: `HTTP 401 (auth token ${secret})` }]);
    const { ok, report } = runVerifyRelease(['--tag', TAG], runCommand);
    assert.equal(ok, false);
    const text = report.join('\n');
    assert.ok(!text.includes(secret), `token leaked into the report:\n${text}`);
    assert.match(text, /\*\*\*/);
});

test('redactSecrets masks configured token env values and token-shaped strings', () => {
    const env = { GH_TOKEN: 'super-secret-token-value', GITHUB_TOKEN: '' };
    const masked = redactSecrets('using super-secret-token-value and github_pat_11ABCDEFG0abcdefghijklmnop', env);
    assert.ok(!masked.includes('super-secret-token-value'));
    assert.ok(!masked.includes('github_pat_11ABCDEFG0abcdefghijklmnop'));
    assert.match(masked, /\*\*\*/);
});

// ---------------------------------------------------------------------------
// Spawned CLI: argument rejection must exit non-zero before any gh call.
// ---------------------------------------------------------------------------

for (const argv of [[], ['--tag'], ['--tag', ''], ['--tag=v0.9.0'], ['v0.9.0'], ['--tag', 'v0.9.0', 'extra'], ['--help']]) {
    test(`CLI: node tools/verify-release.mjs ${argv.join(' ')} exits non-zero with usage`, () => {
        const result = runCli(argv);
        assert.notEqual(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout + result.stderr, /Usage:/);
    });
}

test('CLI: an invalid tag shape is rejected without contacting GitHub', () => {
    const result = runCli(['--tag', 'v1.0']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /vX\.Y\.Z/);
});
