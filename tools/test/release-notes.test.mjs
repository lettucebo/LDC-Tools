import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, makeScratchDir, removeScratchDir, writeFixtureScripts } from './helpers.mjs';
import { collectReleaseNotesSources, buildReleaseNotes } from '../lib/releaseNotesCore.mjs';

const scratchDirs = [];
function scratch(prefix) {
    const dir = makeScratchDir(prefix);
    scratchDirs.push(dir);
    return dir;
}
after(() => {
    for (const dir of scratchDirs) removeScratchDir(dir);
});

test('buildReleaseNotes rejects an invalid SemVer argument', () => {
    const result = buildReleaseNotes(REPO_ROOT, 'v0.9.0');
    assert.equal(result.ok, false);
    assert.match(result.error, /not a valid strict SemVer/i);
});

test('collectReleaseNotesSources lists root then each script changelog in deterministic id order', () => {
    const dir = scratch('notes-sources');
    writeFixtureScripts(dir, ['zeta', 'alpha']);
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n');
    const sources = collectReleaseNotesSources(dir);
    assert.deepEqual(sources.map((s) => s.label), ['Root', 'alpha', 'zeta']);
});

test('buildReleaseNotes fails when the root CHANGELOG.md is missing the requested section', () => {
    const dir = scratch('notes-missing-root-section');
    writeFixtureScripts(dir, ['alpha'], '0.9.0');
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n');
    const result = buildReleaseNotes(dir, '0.9.0');
    assert.equal(result.ok, false);
    assert.match(result.error, /Root/);
});

test('buildReleaseNotes fails when a script CHANGELOG.md has a duplicate section', () => {
    const dir = scratch('notes-duplicate-section');
    writeFixtureScripts(dir, ['alpha'], '0.9.0');
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [0.9.0] — 2026-08-30\n\nRoot notes.\n');
    const changelogPath = path.join(dir, 'scripts', 'alpha', 'CHANGELOG.md');
    const original = fs.readFileSync(changelogPath, 'utf8');
    fs.writeFileSync(changelogPath, `${original}\n## [0.9.0] — dup\n\n### Added\n- dup entry.\n`);
    const result = buildReleaseNotes(dir, '0.9.0');
    assert.equal(result.ok, false);
    assert.match(result.error, /alpha/);
    assert.match(result.error, /multiple/i);
});

test('buildReleaseNotes fails when a script CHANGELOG.md section is empty', () => {
    const dir = scratch('notes-empty-section');
    writeFixtureScripts(dir, ['alpha'], '0.9.0');
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [0.9.0] — 2026-08-30\n\nRoot notes.\n');
    const changelogPath = path.join(dir, 'scripts', 'alpha', 'CHANGELOG.md');
    fs.writeFileSync(changelogPath, '## [Unreleased]\n\n## [0.9.0] — 2026-08-30\n\n## [0.8.5] — 2026-07-04\n\nolder\n');
    const result = buildReleaseNotes(dir, '0.9.0');
    assert.equal(result.ok, false);
    assert.match(result.error, /alpha/);
    assert.match(result.error, /empty/i);
});

test('buildReleaseNotes fails when a script CHANGELOG.md section only has a subheading and no actual entries', () => {
    const dir = scratch('notes-heading-only-section');
    writeFixtureScripts(dir, ['alpha'], '0.9.0');
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [0.9.0] — 2026-08-30\n\nRoot notes.\n');
    const changelogPath = path.join(dir, 'scripts', 'alpha', 'CHANGELOG.md');
    fs.writeFileSync(changelogPath, '## [Unreleased]\n\n## [0.9.0] — 2026-08-30\n\n### Added\n\n## [0.8.5] — 2026-07-04\n\n### Changed\n- old\n');
    const result = buildReleaseNotes(dir, '0.9.0');
    assert.equal(result.ok, false);
    assert.match(result.error, /alpha/);
    assert.match(result.error, /empty/i);
});

test('buildReleaseNotes fails when a script CHANGELOG.md is missing entirely', () => {
    const dir = scratch('notes-missing-file');
    writeFixtureScripts(dir, ['alpha'], '0.9.0');
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [0.9.0] — 2026-08-30\n\nRoot notes.\n');
    fs.rmSync(path.join(dir, 'scripts', 'alpha', 'CHANGELOG.md'));
    const result = buildReleaseNotes(dir, '0.9.0');
    assert.equal(result.ok, false);
    assert.match(result.error, /not found/i);
});

test('buildReleaseNotes succeeds and contains only the requested section for each source', () => {
    const dir = scratch('notes-ok');
    writeFixtureScripts(dir, ['alpha', 'beta'], '0.9.0');
    fs.writeFileSync(
        path.join(dir, 'CHANGELOG.md'),
        '# Changelog\n\n## [Unreleased]\n\n## [0.9.0] — 2026-08-30\n\nRoot release infra notes.\n\n## [0.8.5] — 2026-07-04\n\nOld root notes (must not appear).\n',
    );
    const result = buildReleaseNotes(dir, '0.9.0');
    assert.equal(result.ok, true, result.error);
    assert.match(result.notes, /Root release infra notes/);
    assert.doesNotMatch(result.notes, /Old root notes/);
    assert.match(result.notes, /Something new for this version/); // from fixture script changelogs
    const rootIdx = result.notes.indexOf('Root');
    const alphaIdx = result.notes.indexOf('alpha');
    const betaIdx = result.notes.indexOf('beta');
    assert.ok(rootIdx < alphaIdx, 'Root must appear before alpha');
    assert.ok(alphaIdx < betaIdx, 'alpha must appear before beta (deterministic id order)');
});

test('buildReleaseNotes for the real repository v0.9.0 contains Root + all 4 scripts in deterministic order', () => {
    const result = buildReleaseNotes(REPO_ROOT, '0.9.0');
    assert.equal(result.ok, true, result.error);
    const order = ['Root', 'github-docs-lang-switch-cn', 'ldc-batch-download', 'ms-learn-lang-switch-cn', 'ms-learn-lang-switch-tw'];
    let lastIdx = -1;
    for (const label of order) {
        const idx = result.notes.indexOf(`## ${label}`);
        assert.ok(idx > lastIdx, `expected "## ${label}" to appear in order (idx=${idx}, lastIdx=${lastIdx})`);
        lastIdx = idx;
    }
});
