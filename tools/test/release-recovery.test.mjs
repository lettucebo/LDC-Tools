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
// ```bash`/```powershell code blocks for the two Markdown docs.
//
// Round 3: the round-2 "executable content" extraction still had blind
// spots that let *fake* Latest verification through as if it were real:
//   1. only full-line `#` comments were stripped, so an inline trailing
//      comment on an otherwise-unrelated real command line (e.g.
//      `echo "done"  # gh api ".../releases/latest" --jq '.tag_name'`)
//      left the comment's text sitting right there in "executable"
//      content for the whole-file regex to find;
//   2. PowerShell `<# ... #>` block comments were never recognized at
//      all, so a documentation-only block comment describing the check
//      satisfied the assertion with zero real code;
//   3. the "verifies Latest" regex just searched for the *text*
//      `gh api .../releases/latest ... .tag_name` anywhere in the
//      (stripped) executable content, with no requirement that it be an
//      actually-invoked command - so the identical text sitting inside an
//      `echo '...'` / `Write-Output '...'` string argument, or assigned as
//      a plain quoted string to a variable that is never executed
//      (`MSG="gh api ... --jq '.tag_name'"`), satisfied the check too.
// Round 3 fixes all three by (a) stripping comments per-line with
// quote-aware scanning so an inline `#` outside any quotes truncates the
// rest of that line (bash and PowerShell share `#` line-comment syntax),
// (b) stripping PowerShell `<# ... #>` block comments (language-tracked:
// only PowerShell fenced blocks get this treatment, never bash), and
// (c) anchoring the "verifies Latest" regexes to actual command/assignment
// syntax - a bash line must be a bare `gh api ...` invocation, an
// `IDENT="$(gh api ...)"` / `IDENT=$(gh api ...)` assignment (real command
// substitution, not a quoted string), optionally negated with `if ! `; a
// PowerShell line must be a `$var = gh api ... --jq '.tag_name'` assignment
// with `gh api` as the literal command right after `=` (a quoted string
// there fails to match). `echo`/`printf`/`Write-Output`/`Write-Host` and
// plain string-literal assignments can never satisfy these shapes because
// none of them puts `gh api` (or, for the pipeline form, `$(...jq...)`)
// directly in that anchored command position. Self-tests further down
// prove all of this - both the round-2 protections and the three new
// round-3 blind spots - using the same helpers the real per-file
// assertions use, so this file tests its own blind spots rather than
// merely trusting them fixed.
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
 * Extracts every fenced ```bash / ```powershell code block in a Markdown
 * document, tagged with its fence language. Prose, headings, and any other
 * fence language (e.g. ```text) are excluded. Language is tracked (rather
 * than concatenating everything into one indistinguishable blob) because
 * bash and PowerShell need different comment/command-shape handling below -
 * only PowerShell has `<# #>` block comments, and the two languages'
 * "verifies Latest" command shapes differ.
 */
function extractMarkdownFencedBlocks(content) {
    const fenceRe = /```(bash|powershell)\r?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;
    while ((match = fenceRe.exec(content))) {
        blocks.push({ lang: match[1], code: match[2] });
    }
    return blocks;
}

/**
 * Drops a `#` comment from a single line of bash or PowerShell (the comment
 * syntax they share), tracking single-/double-quote state so a `#` inside a
 * quoted string is never mistaken for a comment starting `#`. Unlike a
 * full-line-only strip, this also truncates an inline trailing comment after
 * real code (e.g. `gh release view "$TAG" --json ... # note`) - closing the
 * round-3 blind spot where a decoy attached to a real unrelated command
 * still counted as "executable" text for a later regex to match against.
 */
function stripLineTrailingComment(line) {
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === "'" && !inDouble) {
            inSingle = !inSingle;
        } else if (ch === '"' && !inSingle) {
            inDouble = !inDouble;
        } else if (ch === '#' && !inSingle && !inDouble) {
            return line.slice(0, i);
        }
    }
    return line;
}

/**
 * Strips PowerShell `<# ... #>` block comments (which may span multiple
 * lines). Bash has no equivalent syntax, so this is only ever applied to
 * PowerShell-tagged content.
 */
function stripPowerShellBlockComments(code) {
    return code.replace(/<#[\s\S]*?#>/g, '');
}

/** Strips block comments (PowerShell only) then per-line trailing comments. */
function stripComments(code, lang) {
    const withoutBlockComments = lang === 'powershell' ? stripPowerShellBlockComments(code) : code;
    return withoutBlockComments
        .split('\n')
        .map(stripLineTrailingComment)
        .join('\n');
}

/**
 * Picks the right extractor for a target file and returns its executable
 * content split by language (`bash` / `powershell`), each with comments
 * stripped. The workflow YAML has no PowerShell steps (every step is
 * `shell: bash`), so its `powershell` bucket is always empty.
 */
function extractExecutableByLanguage(relPath, content) {
    if (relPath.endsWith('.yml') || relPath.endsWith('.yaml')) {
        return {
            bash: stripComments(extractYamlRunBlocks(content), 'bash'),
            powershell: '',
        };
    }
    const blocks = extractMarkdownFencedBlocks(content);
    const bash = blocks
        .filter((block) => block.lang === 'bash')
        .map((block) => stripComments(block.code, 'bash'))
        .join('\n');
    const powershell = blocks
        .filter((block) => block.lang === 'powershell')
        .map((block) => stripComments(block.code, 'powershell'))
        .join('\n');
    return { bash, powershell };
}

/** Combined (language-agnostic) executable content, comments stripped. */
function extractExecutableContent(relPath, content) {
    const { bash, powershell } = extractExecutableByLanguage(relPath, content);
    return [bash, powershell].filter(Boolean).join('\n');
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
//
// Round 3: both regexes below are anchored to an actual command/assignment
// position (line start, after only whitespace and an optional `if ! `
// negation) rather than just searching for the pattern text anywhere. This
// is what makes `echo`/`printf`/`Write-Output`/`Write-Host` string
// arguments, comments, and plain quoted-string variable assignments unable
// to satisfy either regex: none of them puts `gh api` (bash) or, for the
// assignment alternative, a real `$(` command-substitution open (not just
// a quote character) directly in that anchored position.
//
// Bash: `gh api "...releases/latest..."` as either
//   - a bare invocation (`gh api ...`, optionally after `if ! `), or
//   - an assignment via real command substitution (`IDENT="$(gh api ...)"`
//     or `IDENT=$(gh api ...)`, optionally after `if ! `) - the mandatory
//     `$(` immediately after `=`/`="` is what rejects a plain string
//     assignment like `MSG="gh api ... --jq '.tag_name'"`, which has no
//     command substitution and never executes anything.
const BASH_GH_API_LATEST_RE =
    /^[ \t]*(?:if\s*!\s*)?(?:(?:[A-Za-z_][A-Za-z0-9_]*=)"?\$\(|(?!(?:[A-Za-z_][A-Za-z0-9_]*=)))gh api\s+["'][^"'\n]*repos\/[^"'\n]*\/releases\/latest["'][^\n]*/m;

// Inline `.tag_name` extraction on the same line as the `gh api` call above.
const BASH_INLINE_JQ_TAGNAME_RE = /--jq\s*['"]\.tag_name['"]/;

// A separate real jq extraction pipeline/assignment elsewhere in the bash
// block: `IDENT="$(... | jq -r '.tag_name' ...)"` (real.yml's two-step
// "capture JSON, then `jq -r` it" style). The mandatory `$(` after `=`/`="`
// again requires actual command substitution, not a quoted string mentioning
// `jq -r '.tag_name'` as plain text.
const BASH_JQ_TAGNAME_PIPELINE_RE =
    /^[ \t]*[A-Za-z_][A-Za-z0-9_]*="?\$\([^\n]*\bjq\b[^\n]*['"]\.tag_name['"][^\n]*/m;

/** Bash: accepts either the single-line inline-`--jq` form or the two-step assignment+pipeline form. */
function hasBashLatestCheck(bashExecutableContent) {
    const apiMatch = BASH_GH_API_LATEST_RE.exec(bashExecutableContent);
    if (apiMatch && BASH_INLINE_JQ_TAGNAME_RE.test(apiMatch[0])) {
        return true;
    }
    return BASH_JQ_TAGNAME_PIPELINE_RE.test(bashExecutableContent);
}

// PowerShell: `$var = gh api "...releases/latest..." ... --jq '.tag_name'` -
// `gh api` must be the literal command right after `=` (only whitespace in
// between), which is what rejects `$var = 'gh api ... --jq ".tag_name"'`
// (a quoted string assigned to a variable, never executed).
const POWERSHELL_GH_API_LATEST_RE =
    /^[ \t]*\$[A-Za-z_][A-Za-z0-9_]*\s*=\s*gh api\s+["'][^"'\n]*repos\/[^"'\n]*\/releases\/latest["'][^\n]*--jq\s*['"]\.tag_name['"][^\n]*/m;

function hasPowerShellLatestCheck(powershellExecutableContent) {
    return POWERSHELL_GH_API_LATEST_RE.test(powershellExecutableContent);
}

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

/** `executableByLanguage` is the `{ bash, powershell }` shape from `extractExecutableByLanguage`. */
function hasSupportedLatestCheck(executableByLanguage) {
    return hasBashLatestCheck(executableByLanguage.bash) || hasPowerShellLatestCheck(executableByLanguage.powershell);
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
        const executableByLanguage = extractExecutableByLanguage(relPath, content);

        assert.ok(
            hasSupportedLatestCheck(executableByLanguage),
            `${relPath} must verify "Latest" using an EXECUTABLE ` +
                "'gh api repos/.../releases/latest --jq .tag_name' call (or equivalent); " +
                'a comment/prose/echo/Write-Output-string-only mention does not count.'
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
    const bash = stripComments(rawBashBlock, 'bash');
    assert.equal(hasSupportedLatestCheck({ bash, powershell: '' }), false);
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
        const executableByLanguage = extractExecutableByLanguage('fixture.yml', content);

        assert.equal(hasSupportedLatestCheck(executableByLanguage), false);
    } finally {
        removeScratchDir(scratchDir);
    }
});

test('self-test: an actually-executed releases/latest + .tag_name check inside run: | is accepted (single-line inline --jq form)', () => {
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
        const executableByLanguage = extractExecutableByLanguage('fixture.yml', content);
        const executableContent = extractExecutableContent('fixture.yml', content);

        assert.equal(hasSupportedLatestCheck(executableByLanguage), true);
        assert.deepEqual(findIsLatestOffenses(executableContent), []);
    } finally {
        removeScratchDir(scratchDir);
    }
});

test('self-test: the real two-step "if ! assign, then separate jq -r pipeline" form (release.yml style) is accepted', () => {
    const scratchDir = makeScratchDir('release-recovery-if-bang-pipeline-ok');
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
            '          if ! latest_json="$(gh api "repos/$GH_REPO/releases/latest" 2>&1)"; then',
            '            echo "::error::could not query releases/latest: $latest_json" >&2',
            '            exit 1',
            '          fi',
            '          latest_tag="$(printf \'%s\' "$latest_json" | jq -r \'.tag_name\')"',
            '          [ "$latest_tag" = "$TAG" ]',
            '',
        ].join('\n');
        const filePath = path.join(scratchDir, 'fixture.yml');
        fs.writeFileSync(filePath, fixtureYaml);

        const content = fs.readFileSync(filePath, 'utf8');
        const executableByLanguage = extractExecutableByLanguage('fixture.yml', content);

        assert.equal(hasSupportedLatestCheck(executableByLanguage), true);
    } finally {
        removeScratchDir(scratchDir);
    }
});

test('self-test: a real PowerShell assignment form ($var = gh api ... --jq \'.tag_name\') is accepted', () => {
    const markdown = [
        '```powershell',
        '$latestTag = gh api "repos/{owner}/{repo}/releases/latest" --jq \'.tag_name\'',
        'if ($latestTag.Trim() -ne $tag) { throw "not latest" }',
        '```',
        '',
    ].join('\n');
    const executableByLanguage = extractExecutableByLanguage('EXAMPLE.md', markdown);
    assert.equal(hasSupportedLatestCheck(executableByLanguage), true);
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

// --- Self-tests: prove the three round-3 blind spots are actually closed --
//
// Each blind spot gets a "baseline (pre-fix)" test that reproduces the exact
// round-2 helpers verbatim (permanent documentation that the bug was real,
// same style as the round-1/round-2 baseline tests above) plus a matching
// test against the current production helpers proving it is now rejected.
// Legitimate real-file-shaped forms are also proven accepted so the fix
// cannot be "solved" by simply rejecting everything.

function round2StripFullLineComments(executableContent) {
    return executableContent
        .split('\n')
        .filter((line) => !/^\s*#/.test(line))
        .join('\n');
}

function round2ExtractMarkdownCodeBlocks(content) {
    const fenceRe = /```(?:bash|powershell)\r?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;
    while ((match = fenceRe.exec(content))) {
        blocks.push(match[1]);
    }
    return blocks.join('\n');
}

const ROUND2_RELEASES_LATEST_RE = /gh api\s+["'][^"'\n]*repos\/[^"'\n]*\/releases\/latest["'][\s\S]{0,300}?\.tag_name/;

test('self-test: baseline (pre-fix) whole-file regex is fooled by an inline trailing bash comment decoy', () => {
    // Blind spot 1: only full-line `#` comments were stripped, so a decoy
    // trailing comment attached to a real but unrelated command survived
    // into "executable" content for the old whole-file regex to match.
    const raw = 'echo "step done"  # gh api "repos/{owner}/{repo}/releases/latest" --jq \'.tag_name\'';
    const executableContent = round2StripFullLineComments(raw);
    assert.equal(
        ROUND2_RELEASES_LATEST_RE.test(executableContent),
        true,
        'documents the pre-fix blind spot: this must stay true to prove the bug existed'
    );
});

test('an inline trailing bash comment decoy attached to unrelated code does not satisfy the current check', () => {
    const raw = 'echo "step done"  # gh api "repos/{owner}/{repo}/releases/latest" --jq \'.tag_name\'';
    const bash = stripComments(raw, 'bash');
    assert.equal(hasSupportedLatestCheck({ bash, powershell: '' }), false);
});

test('self-test: baseline (pre-fix) whole-file regex is fooled by a PowerShell <# #> block-comment decoy', () => {
    // Blind spot 2: `<# ... #>` block comments were never recognized, so a
    // documentation-only block comment describing the check satisfied the
    // old whole-file regex with zero real code.
    const markdown = [
        '```powershell',
        '<#',
        '$latestTag = gh api "repos/{owner}/{repo}/releases/latest" --jq \'.tag_name\'',
        '#>',
        'Write-Output "no real check here"',
        '```',
        '',
    ].join('\n');
    const executableContent = round2StripFullLineComments(round2ExtractMarkdownCodeBlocks(markdown));
    assert.equal(
        ROUND2_RELEASES_LATEST_RE.test(executableContent),
        true,
        'documents the pre-fix blind spot: this must stay true to prove the bug existed'
    );
});

test('a PowerShell <# #> block-comment decoy does not satisfy the current check', () => {
    const markdown = [
        '```powershell',
        '<#',
        '$latestTag = gh api "repos/{owner}/{repo}/releases/latest" --jq \'.tag_name\'',
        '#>',
        'Write-Output "no real check here"',
        '```',
        '',
    ].join('\n');
    const executableByLanguage = extractExecutableByLanguage('EXAMPLE.md', markdown);
    assert.equal(hasSupportedLatestCheck(executableByLanguage), false);
});

test('self-test: baseline (pre-fix) whole-file regex is fooled by an echo/Write-Output string decoy', () => {
    // Blind spot 3a (bash): the whole fake command sits inside an `echo`
    // string argument - never executed - but the old regex just searches
    // for the text anywhere.
    const raw = 'echo \'gh api "repos/{owner}/{repo}/releases/latest" --jq ".tag_name"\'';
    const executableContent = round2StripFullLineComments(raw);
    assert.equal(
        ROUND2_RELEASES_LATEST_RE.test(executableContent),
        true,
        'documents the pre-fix blind spot: this must stay true to prove the bug existed'
    );
});

test('an echo string decoy (bash) does not satisfy the current check', () => {
    const raw = 'echo \'gh api "repos/{owner}/{repo}/releases/latest" --jq ".tag_name"\'';
    const bash = stripComments(raw, 'bash');
    assert.equal(hasSupportedLatestCheck({ bash, powershell: '' }), false);
});

test('a Write-Output string decoy (PowerShell) does not satisfy the current check', () => {
    const markdown = [
        '```powershell',
        'Write-Output \'$latestTag = gh api "repos/{owner}/{repo}/releases/latest" --jq ".tag_name"\'',
        '```',
        '',
    ].join('\n');
    const executableByLanguage = extractExecutableByLanguage('EXAMPLE.md', markdown);
    assert.equal(hasSupportedLatestCheck(executableByLanguage), false);
});

test('a printf string decoy (bash) does not satisfy the current check', () => {
    const raw = 'printf \'%s\\n\' \'gh api "repos/{owner}/{repo}/releases/latest" --jq ".tag_name"\'';
    const bash = stripComments(raw, 'bash');
    assert.equal(hasSupportedLatestCheck({ bash, powershell: '' }), false);
});

test('self-test: baseline (pre-fix) whole-file regex is fooled by a quoted-string bash assignment decoy', () => {
    // Blind spot 3b (bash): the fake command is assigned as a plain quoted
    // string (no `$(` command substitution, so it is never executed) but
    // the old regex has no anchoring to a real command/assignment shape.
    const raw = 'MSG=\'gh api "repos/{owner}/{repo}/releases/latest" --jq ".tag_name" was documented\'';
    const executableContent = round2StripFullLineComments(raw);
    assert.equal(
        ROUND2_RELEASES_LATEST_RE.test(executableContent),
        true,
        'documents the pre-fix blind spot: this must stay true to prove the bug existed'
    );
});

test('a quoted-string bash assignment decoy (no command substitution) does not satisfy the current check', () => {
    const raw = 'MSG=\'gh api "repos/{owner}/{repo}/releases/latest" --jq ".tag_name" was documented\'';
    const bash = stripComments(raw, 'bash');
    assert.equal(hasSupportedLatestCheck({ bash, powershell: '' }), false);
});

test('a quoted-string PowerShell assignment decoy (no real gh api invocation) does not satisfy the current check', () => {
    const markdown = [
        '```powershell',
        '$msg = \'$latestTag = gh api "repos/{owner}/{repo}/releases/latest" --jq ".tag_name"\'',
        '```',
        '',
    ].join('\n');
    const executableByLanguage = extractExecutableByLanguage('EXAMPLE.md', markdown);
    assert.equal(hasSupportedLatestCheck(executableByLanguage), false);
});

test('a real trailing comment on an unrelated gh release view line (legacy-cleanup style) does not break isLatest offense detection', () => {
    // Mirrors the actual `gh release view "$OLD_TAG" --json tagName,name,createdAt   # confirm ...`
    // line used in SKILL.md/RELEASING.md's legacy cleanup section: a real
    // inline trailing comment on a real command with a clean field list.
    const raw = 'gh release view "$OLD_TAG" --json tagName,name,createdAt   # confirm what you are deleting';
    const bash = stripComments(raw, 'bash');
    assert.deepEqual(findIsLatestOffenses(bash), []);
});
