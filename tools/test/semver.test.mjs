import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSemver, isValidSemver, compareSemver, parseRepoTag } from '../lib/semver.mjs';

test('isValidSemver accepts valid strict SemVer strings', () => {
    assert.equal(isValidSemver('0.9.0'), true);
    assert.equal(isValidSemver('1.2.3'), true);
    assert.equal(isValidSemver('1.2.3-alpha.1'), true);
    assert.equal(isValidSemver('1.2.3+build.5'), true);
});

test('isValidSemver rejects invalid strings', () => {
    assert.equal(isValidSemver('0.9'), false, 'missing patch');
    assert.equal(isValidSemver('v0.9.0'), false, 'leading v not allowed');
    assert.equal(isValidSemver('01.2.3'), false, 'leading zero in major');
    assert.equal(isValidSemver('1.02.3'), false, 'leading zero in minor');
    assert.equal(isValidSemver('1.2.03'), false, 'leading zero in patch');
    assert.equal(isValidSemver(''), false, 'empty string');
    assert.equal(isValidSemver(null), false, 'null');
    assert.equal(isValidSemver(undefined), false, 'undefined');
    assert.equal(isValidSemver('1.2.3.4'), false, 'too many segments');
});

test('parseSemver returns numeric parts', () => {
    const parsed = parseSemver('1.2.3');
    assert.equal(parsed.major, 1);
    assert.equal(parsed.minor, 2);
    assert.equal(parsed.patch, 3);
    assert.equal(parsed.prerelease, null);
});

test('parseSemver returns null for invalid input', () => {
    assert.equal(parseSemver('not-a-version'), null);
});

test('compareSemver orders versions correctly', () => {
    assert.equal(compareSemver('0.8.5', '0.9.0'), -1);
    assert.equal(compareSemver('0.9.0', '0.8.5'), 1);
    assert.equal(compareSemver('0.9.0', '0.9.0'), 0);
    assert.equal(compareSemver('1.0.0', '1.0.0-alpha'), 1, 'release > prerelease');
    assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
});

test('compareSemver throws on invalid input', () => {
    assert.throws(() => compareSemver('bad', '0.9.0'));
});

test('parseRepoTag matches strict "vX.Y.Z" repo-wide tags only', () => {
    const parsed = parseRepoTag('v0.8.5');
    assert.ok(parsed);
    assert.equal(parsed.version, '0.8.5');
});

test('parseRepoTag rejects legacy per-script tags', () => {
    assert.equal(parseRepoTag('ldc-batch-download-v0.8.2'), null);
});

test('parseRepoTag rejects non-tag-looking strings', () => {
    assert.equal(parseRepoTag('v1.0'), null);
    assert.equal(parseRepoTag('1.0.0'), null);
    assert.equal(parseRepoTag(''), null);
});

// ---------------------------------------------------------------------------
// Repo-wide release tags are *core* releases only. The Release workflow's tag
// gate is the strict regex
// ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$, which admits no
// prerelease or build-metadata suffix. parseRepoTag is what decides which
// existing tags may become a release baseline, so if it were laxer than the
// workflow regex a tag like "v9.9.9-rc.1" (impossible to release through the
// workflow, but creatable by hand) could still be selected as the baseline
// and then permanently block every subsequent real release.
// ---------------------------------------------------------------------------

test('parseRepoTag rejects prerelease tags (core vX.Y.Z only)', () => {
    assert.equal(parseRepoTag('v1.0.0-alpha'), null);
    assert.equal(parseRepoTag('v1.0.0-alpha.1'), null);
    assert.equal(parseRepoTag('v0.9.0-rc.1'), null);
});

test('parseRepoTag rejects build-metadata tags (core vX.Y.Z only)', () => {
    assert.equal(parseRepoTag('v1.0.0+build.5'), null);
    assert.equal(parseRepoTag('v0.9.0+20260830'), null);
});

test('parseRepoTag rejects combined prerelease + build-metadata tags', () => {
    assert.equal(parseRepoTag('v1.0.0-rc.1+build.5'), null);
});

test('parseRepoTag still accepts every core release tag shape', () => {
    for (const tag of ['v0.0.0', 'v0.9.0', 'v1.0.0', 'v10.20.30']) {
        const parsed = parseRepoTag(tag);
        assert.ok(parsed, `expected ${tag} to parse`);
        assert.equal(parsed.tag, tag);
        assert.equal(parsed.version, tag.slice(1));
        assert.equal(parsed.parsed.prerelease, null);
        assert.equal(parsed.parsed.build, null);
    }
});
