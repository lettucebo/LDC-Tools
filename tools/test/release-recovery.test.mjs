// Contract test for the runtime recovery bugfix: `gh release view --json`
// does not support an `isLatest` field (GitHub Actions run 33331923814
// failed on exactly this after v0.9.0 was tagged). This guards the
// workflow and both operator docs so none of them ever regress back to
// requesting that unsupported field, and each of them verifies "Latest"
// through the supported `repos/.../releases/latest` REST endpoint instead.
//
// Round 2: the naive "grep the whole file" version of this test had two
// blind spots that would let a real regression slip through green:
//   1. it only recognized an UNQUOTED comma list after `--json`, so
//      `--json "tagName,isLatest"` (or the single-quoted PowerShell
//      equivalent) was invisible to the "reject isLatest" check;
//   2. it only checked whether the *text* `gh api .../releases/latest`
//      and `.tag_name` appeared anywhere in the file, so a `#`/prose
//      comment merely *describing* the check (with no line that actually
//      runs it) satisfied the "verifies Latest" check without any
//      executable command existing at all.
// Both are fixed below by (a) parsing quoted-or-unquoted `--json` field
// lists, and (b) evaluating both assertions only against *executable*
// content: YAML `run: |` step bodies for the workflow, fenced
// ```bash`/```powershell code blocks for the two Markdown docs, with
// full-line `#` comments stripped out of that executable content before
// either assertion runs. Self-tests further down prove both fixes work,
// using the same helpers the real per-file assertions use, so this file
// tests its own blind spots rather than merely trusting them fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, makeScratchDir, removeScratchDir } from './helpers.mjs';

const FILES_TO_CHECK = [
    '.github/workflows/release.yml',
    '.github/skills/release/SKILL.md',
    'RELEASING.md',
];

// --- Executable-content extraction --------------------------------------
//
// Only text that would actually run should be able to satisfy (or violate)
// either assertion. Comments, headings, and prose must not count.

/**
 * Extracts the concatenated bodies of every YAML block-scalar `run:` step
 * (`run: |`, `run: |-`, `run: |+`) in a GitHub Actions workflow file,
 * stripped of the block's own indentation. Everything else in the
 * workflow (job/step keys, top-level `#` comments, non-block `run:` steps)
 * is not executable shell content and is excluded.
 */
function extractYamlRunBlocks(content) {
    const lines = content.split('\n');
    const runHeaderRe = /^(\s*)run:\s*\|[+-]?\s*$/;
    const blocks = [];
    for (let i = 0; i < lines.length; i++) {
        const header = runHeaderRe.exec(lines[i]);
        if (!header) continue;
        const headerIndent = header[1].length;
        const bodyLines = [];
        let j = i + 1;
        for (; j < lines.length; j++) {
            const line = lines[j];
            if (line.trim() === '') {
                bodyLines.push('');
                continue;
            }
            const indent = line.length - line.trimStart().length;
            if (indent <= headerIndent) break;
            bodyLines.push(line);
        }
        blocks.push(bodyLines.join('\n'));
        i = j - 1;
    }
    return blocks.join('\n');
}

/**
 * Extracts the concatenated contents of every fenced ```bash / ```powershell
 * code block in a Markdown document. Prose, headings, and any other fence
 * language are excluded.
 */
function extractMarkdownCodeBlocks(content) {
    const fenceRe = /```(?:bash|powershell)\r?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;
    while ((match = fenceRe.exec(content))) {
        blocks.push(match[1]);
    }
    return blocks.join('\n');
}

/**
 * Drops full-line `#` comments (the comment syntax bash and PowerShell
 * share). A trailing/inline comment after real code is left alone - that
 * line still executes something - only lines that are *nothing but* a
 * comment are removed.
 */
function stripFullLineComments(executableContent) {
    return executableContent
        .split('\n')
        .filter((line) => !/^\s*#/.test(line))
        .join('\n');
}

/** Picks the right extractor for a target file, then strips comments. */
function extractExecutableContent(relPath, content) {
    const raw = relPath.endsWith('.yml') || relPath.endsWith('.yaml')
        ? extractYamlRunBlocks(content)
        : extractMarkdownCodeBlocks(content);
    return stripFullLineComments(raw);
}

// --- Assertions, run against executable content only ---------------------

// Matches any `gh release view ... --json <fields>` invocation and captures
// the field list whether it is unquoted, double-quoted, or single-quoted
// (PowerShell commonly single-quotes `--json` field lists).
const GH_RELEASE_VIEW_JSON_RE = /gh release view[^\n]*?--json\s+(?:"([^"\n]*)"|'([^'\n]*)'|([^\s'"]+))/g;

// A supported Latest verification: a `gh api repos/.../releases/latest`
// call whose result's `.tag_name` is extracted shortly after - whether
// inline via `--jq '.tag_name'`, or via a separate `jq -r '.tag_name'` on
// the captured JSON (the style release.yml already uses for its other
// remote-identity checks) - and whether the repo slug is `$GH_REPO`, an
// env-derived path, or the gh `{owner}/{repo}` placeholder used in the
// user-facing docs.
const RELEASES_LATEST_RE = /gh api\s+["'][^"'\n]*repos\/[^"'\n]*\/releases\/latest["'][\s\S]{0,300}?\.tag_name/;

/** Returns every offending `gh release view ... --json ...isLatest...` match. */
function findIsLatestOffenses(executableContent) {
    const offenses = [];
    let match;
    GH_RELEASE_VIEW_JSON_RE.lastIndex = 0;
    while ((match = GH_RELEASE_VIEW_JSON_RE.exec(executableContent))) {
        const fieldList = match[1] ?? match[2] ?? match[3] ?? '';
        const fields = fieldList.split(',').map((field) => field.trim());
        if (fields.includes('isLatest')) {
            offenses.push(match[0]);
        }
    }
    return offenses;
}

function hasSupportedLatestCheck(executableContent) {
    return RELEASES_LATEST_RE.test(executableContent);
}

for (const relPath of FILES_TO_CHECK) {
    test(`${relPath} never requests the unsupported gh release view --json isLatest field`, () => {
        const filePath = path.join(REPO_ROOT, relPath);
        const content = fs.readFileSync(filePath, 'utf8');
        const executableContent = extractExecutableContent(relPath, content);

        const offendingCalls = findIsLatestOffenses(executableContent);

        assert.deepEqual(
            offendingCalls,
            [],
            `${relPath} requests unsupported --json field "isLatest" via: ${offendingCalls.join('; ')}\n` +
                '`gh release view --json` does not support `isLatest` (it is a GraphQL-only field); ' +
                'verify Latest via `gh api repos/.../releases/latest --jq .tag_name` instead.'
        );
    });

    test(`${relPath} verifies Latest via the supported releases/latest REST endpoint (executable, not comment-only)`, () => {
        const filePath = path.join(REPO_ROOT, relPath);
        const content = fs.readFileSync(filePath, 'utf8');
        const executableContent = extractExecutableContent(relPath, content);

        assert.ok(
            hasSupportedLatestCheck(executableContent),
            `${relPath} must verify "Latest" using an EXECUTABLE ` +
                "'gh api repos/.../releases/latest --jq .tag_name' call (or equivalent); " +
                'a comment/prose-only mention does not count.'
        );
    });
}

// --- Self-tests: prove the two round-2 blind spots are actually closed ----
//
// These exercise the same helper functions the per-file assertions above
// use, against small fixtures, so a future edit that reintroduces either
// blind spot (e.g. "simplify" the extraction back to whole-file regexes)
// fails here even if the three real target files happen to stay clean.

test('self-test: baseline (pre-fix) grep-the-whole-file regex misses a quoted isLatest field list', () => {
    // Documents *why* extraction/quoting handling was added: the original
    // round-1 regex required an unquoted field list and so let this
    // straight through as zero offenses.
    const baselineRe = /gh release view[^\n]*--json\s+([^\s'"]+)/g;
    const quoted = 'gh release view "$TAG" --json "tagName,isLatest,isDraft"';
    const offenses = [];
    let match;
    while ((match = baselineRe.exec(quoted))) {
        if (match[1].split(',').includes('isLatest')) offenses.push(match[0]);
    }
    assert.deepEqual(offenses, [], 'documents the pre-fix blind spot: this must stay empty to prove the bug existed');
});

test('self-test: quoted --json field list with isLatest is caught by the current parser', () => {
    const quoted = 'gh release view "$TAG" --json "tagName,isLatest,isDraft"';
    assert.notDeepEqual(findIsLatestOffenses(quoted), []);
});

test('self-test: single-quoted --json field list with isLatest is caught (PowerShell style)', () => {
    const singleQuoted = "gh release view $tag --json 'tagName,isLatest'";
    assert.notDeepEqual(findIsLatestOffenses(singleQuoted), []);
});

test('self-test: unquoted --json field list with isLatest is still caught', () => {
    const unquoted = 'gh release view "$TAG" --json tagName,isLatest,isDraft';
    assert.notDeepEqual(findIsLatestOffenses(unquoted), []);
});

test('self-test: --json field list without isLatest is not flagged', () => {
    const clean = 'gh release view "$TAG" --json "tagName,isDraft,isPrerelease"';
    assert.deepEqual(findIsLatestOffenses(clean), []);
});

test('self-test: baseline (pre-fix) whole-file regex is satisfied by a comment-only mention', () => {
    // Documents the second round-1 blind spot: testing raw content (not
    // executable-only content) let prose describing the check pass.
    const baselineRe = /gh api\s+["'][^"'\n]*repos\/[^"'\n]*\/releases\/latest["'][\s\S]{0,300}?\.tag_name/;
    const commentOnly = [
        '# gh api "repos/{owner}/{repo}/releases/latest" --jq \'.tag_name\'',
        '# describes the check but this file never actually runs it.',
        'echo done',
    ].join('\n');
    assert.equal(
        baselineRe.test(commentOnly),
        true,
        'documents the pre-fix blind spot: this must stay true to prove the bug existed'
    );
});

test('self-test: comment-only mention of releases/latest + .tag_name does not satisfy the current check', () => {
    const rawBashBlock = [
        '# gh api "repos/{owner}/{repo}/releases/latest" --jq \'.tag_name\'',
        '# describes the check but this file never actually runs it.',
        'echo done',
    ].join('\n');
    const executableContent = stripFullLineComments(rawBashBlock);
    assert.equal(hasSupportedLatestCheck(executableContent), false);
});

test('self-test: comment-only mention inside a real run: | block (workflow-shaped fixture) is rejected', () => {
    const scratchDir = makeScratchDir('release-recovery-comment-only');
    try {
        const fixtureYaml = [
            'name: fixture',
            'on: push',
            'jobs:',
            '  publish:',
            '    steps:',
            '      - name: verify',
            '        shell: bash',
            '        run: |',
            '          set -euo pipefail',
            "          # gh api \"repos/{owner}/{repo}/releases/latest\" --jq '.tag_name'",
            '          echo "not actually executed above"',
            '',
        ].join('\n');
        const filePath = path.join(scratchDir, 'fixture.yml');
        fs.writeFileSync(filePath, fixtureYaml);

        const content = fs.readFileSync(filePath, 'utf8');
        const executableContent = extractExecutableContent('fixture.yml', content);

        assert.equal(hasSupportedLatestCheck(executableContent), false);
    } finally {
        removeScratchDir(scratchDir);
    }
});

test('self-test: an actually-executed releases/latest + .tag_name check inside run: | is accepted', () => {
    const scratchDir = makeScratchDir('release-recovery-executable-ok');
    try {
        const fixtureYaml = [
            'name: fixture',
            'on: push',
            'jobs:',
            '  publish:',
            '    steps:',
            '      - name: verify',
            '        shell: bash',
            '        run: |',
            '          set -euo pipefail',
            '          latest_tag="$(gh api "repos/$GH_REPO/releases/latest" --jq \'.tag_name\')"',
            '          [ "$latest_tag" = "$TAG" ]',
            '',
        ].join('\n');
        const filePath = path.join(scratchDir, 'fixture.yml');
        fs.writeFileSync(filePath, fixtureYaml);

        const content = fs.readFileSync(filePath, 'utf8');
        const executableContent = extractExecutableContent('fixture.yml', content);

        assert.equal(hasSupportedLatestCheck(executableContent), true);
        assert.deepEqual(findIsLatestOffenses(executableContent), []);
    } finally {
        removeScratchDir(scratchDir);
    }
});

test('self-test: a quoted isLatest field list inside a real run: | block fixture is caught', () => {
    const scratchDir = makeScratchDir('release-recovery-quoted-in-block');
    try {
        const fixtureYaml = [
            'name: fixture',
            'on: push',
            'jobs:',
            '  publish:',
            '    steps:',
            '      - name: verify',
            '        shell: bash',
            '        run: |',
            '          set -euo pipefail',
            '          gh release view "$TAG" --json "tagName,isLatest,isDraft"',
            '',
        ].join('\n');
        const filePath = path.join(scratchDir, 'fixture.yml');
        fs.writeFileSync(filePath, fixtureYaml);

        const content = fs.readFileSync(filePath, 'utf8');
        const executableContent = extractExecutableContent('fixture.yml', content);

        assert.notDeepEqual(findIsLatestOffenses(executableContent), []);
    } finally {
        removeScratchDir(scratchDir);
    }
});

test('self-test: a fenced ```text block mentioning isLatest (not bash/powershell) is not treated as executable Markdown', () => {
    const markdown = [
        '# Example',
        '',
        '```text',
        'gh release view "$TAG" --json "tagName,isLatest"',
        '```',
        '',
    ].join('\n');
    const executableContent = extractExecutableContent('EXAMPLE.md', markdown);
    assert.equal(executableContent, '');
});
