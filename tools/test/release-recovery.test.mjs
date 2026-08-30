// Contract test for the runtime recovery bugfix: `gh release view --json`
// does not support an `isLatest` field (GitHub Actions run 33331923814
// failed on exactly this after v0.9.0 was tagged). This guards the
// workflow and both operator docs so none of them ever regress back to
// requesting that unsupported field, and each of them verifies "Latest"
// through the supported `repos/.../releases/latest` REST endpoint instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';

const FILES_TO_CHECK = [
    '.github/workflows/release.yml',
    '.github/skills/release/SKILL.md',
    'RELEASING.md',
];

// Matches any `gh release view ... --json <fields>` invocation and captures
// the comma-separated field list so it can be checked for `isLatest`.
const GH_RELEASE_VIEW_JSON_RE = /gh release view[^\n]*--json\s+([^\s'"]+)/g;

// A supported Latest verification: a `gh api repos/.../releases/latest`
// call whose result's `.tag_name` is extracted shortly after - whether
// inline via `--jq '.tag_name'`, or via a separate `jq -r '.tag_name'` on
// the captured JSON (the style release.yml already uses for its other
// remote-identity checks) - and whether the repo slug is `$GH_REPO`, an
// env-derived path, or the gh `{owner}/{repo}` placeholder used in the
// user-facing docs.
const RELEASES_LATEST_RE = /gh api\s+["'][^"'\n]*repos\/[^"'\n]*\/releases\/latest["'][\s\S]{0,300}?\.tag_name/;

for (const relPath of FILES_TO_CHECK) {
    test(`${relPath} never requests the unsupported gh release view --json isLatest field`, () => {
        const filePath = path.join(REPO_ROOT, relPath);
        const content = fs.readFileSync(filePath, 'utf8');

        const offendingCalls = [];
        let match;
        GH_RELEASE_VIEW_JSON_RE.lastIndex = 0;
        while ((match = GH_RELEASE_VIEW_JSON_RE.exec(content))) {
            const fields = match[1].split(',');
            if (fields.includes('isLatest')) {
                offendingCalls.push(match[0]);
            }
        }

        assert.deepEqual(
            offendingCalls,
            [],
            `${relPath} requests unsupported --json field "isLatest" via: ${offendingCalls.join('; ')}\n` +
                '`gh release view --json` does not support `isLatest` (it is a GraphQL-only field); ' +
                'verify Latest via `gh api repos/.../releases/latest --jq .tag_name` instead.'
        );
    });

    test(`${relPath} verifies Latest via the supported releases/latest REST endpoint`, () => {
        const filePath = path.join(REPO_ROOT, relPath);
        const content = fs.readFileSync(filePath, 'utf8');

        assert.match(
            content,
            RELEASES_LATEST_RE,
            `${relPath} must verify "Latest" using a supported ` +
                "'gh api repos/.../releases/latest --jq .tag_name' call (or equivalent)."
        );
    });
}
