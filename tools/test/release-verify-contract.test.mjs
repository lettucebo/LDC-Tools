// Contract test: every documented/automated post-publication verification
// path must go through the single centralized verifier, and the unsupported
// `isLatest` field must not reappear anywhere in those callers.
//
// This deliberately does NOT parse shell semantics. The behavior it used to
// approximate with regexes over YAML/Markdown snippets is now pinned
// argv-exactly in tools/test/verifyReleaseCore.test.mjs, against the one
// module that builds those commands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';

const HELPER_PATH = 'tools/verify-release.mjs';
const HELPER_COMMAND = `node ${HELPER_PATH} --tag`;

const CALLER_FILES = ['.github/workflows/release.yml', '.github/skills/release/SKILL.md', 'RELEASING.md'];

function read(relPath) {
    return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

test('the centralized release verifier exists', () => {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, HELPER_PATH)), `${HELPER_PATH} is missing`);
});

for (const relPath of CALLER_FILES) {
    test(`${relPath} verifies a published release through ${HELPER_COMMAND}`, () => {
        assert.ok(
            read(relPath).includes(HELPER_COMMAND),
            `${relPath} must verify the published release with "${HELPER_COMMAND} <tag>" instead of ad-hoc gh commands`,
        );
    });

    test(`${relPath} contains no isLatest token`, () => {
        const offenders = read(relPath)
            .split('\n')
            .map((line, i) => [i + 1, line])
            .filter(([, line]) => /isLatest/.test(line));
        assert.deepEqual(
            offenders,
            [],
            `${relPath} mentions isLatest, which "gh release view --json" rejects as an unsupported field:\n` +
                offenders.map(([n, line]) => `  ${n}: ${line.trim()}`).join('\n'),
        );
    });
}
