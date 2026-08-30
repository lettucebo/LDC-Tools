import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseChangelogSections,
    extractSection,
    validateScriptChangelogStructure,
} from '../lib/changelog.mjs';

const GOOD_CHANGELOG = `# Changelog

## [Unreleased]

## [0.9.0] — 2026-08-30

### Added
- Something new.

## [0.8.5] — 2026-07-04

### Changed
- Something old.
`;

test('parseChangelogSections splits the document into labeled sections', () => {
    const sections = parseChangelogSections(GOOD_CHANGELOG);
    assert.deepEqual(sections.map((s) => s.label), ['Unreleased', '0.9.0', '0.8.5']);
    assert.match(sections[1].body, /Something new/);
});

test('extractSection returns the single matching section body', () => {
    const result = extractSection(GOOD_CHANGELOG, '0.9.0');
    assert.equal(result.ok, true);
    assert.match(result.body, /Something new/);
    assert.doesNotMatch(result.body, /Something old/);
});

test('extractSection fails when the section is missing', () => {
    const result = extractSection(GOOD_CHANGELOG, '9.9.9');
    assert.equal(result.ok, false);
    assert.match(result.error, /no.*section/i);
});

test('extractSection fails when the section is duplicated', () => {
    const dup = `${GOOD_CHANGELOG}\n## [0.9.0] — dup\n\n### Added\n- dup entry.\n`;
    const result = extractSection(dup, '0.9.0');
    assert.equal(result.ok, false);
    assert.match(result.error, /multiple/i);
});

test('extractSection fails when the section body is empty', () => {
    const emptySection = `## [Unreleased]\n\n## [0.9.0] — 2026-08-30\n\n## [0.8.5] — 2026-07-04\n\nbody\n`;
    const result = extractSection(emptySection, '0.9.0');
    assert.equal(result.ok, false);
    assert.match(result.error, /empty/i);
});

test('extractSection fails when the section only has a subheading and no actual entry content', () => {
    const headingOnly = `## [Unreleased]\n\n## [0.9.0] — 2026-08-30\n\n### Added\n\n## [0.8.5] — 2026-07-04\n\n### Changed\n- old\n`;
    const result = extractSection(headingOnly, '0.9.0');
    assert.equal(result.ok, false);
    assert.match(result.error, /empty/i);
});

test('validateScriptChangelogStructure passes for a well-formed script changelog', () => {
    const result = validateScriptChangelogStructure(GOOD_CHANGELOG, '0.9.0');
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
});

test('validateScriptChangelogStructure fails when Unreleased section is missing', () => {
    const noUnreleased = `# Changelog\n\n## [0.9.0] — 2026-08-30\n\n### Added\n- x\n`;
    const result = validateScriptChangelogStructure(noUnreleased, '0.9.0');
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /Unreleased/.test(e)));
});

test('validateScriptChangelogStructure fails when the version section is missing', () => {
    const result = validateScriptChangelogStructure(`## [Unreleased]\n\n## [0.8.5] — 2026-07-04\n\n### x\n- y\n`, '0.9.0');
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /missing/i.test(e)));
});

test('validateScriptChangelogStructure fails when the version section is duplicated', () => {
    const dup = `${GOOD_CHANGELOG}\n## [0.9.0] — dup\n\n### Added\n- dup entry.\n`;
    const result = validateScriptChangelogStructure(dup, '0.9.0');
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /multiple/i.test(e)));
});

test('validateScriptChangelogStructure fails when the version section is empty', () => {
    const emptyBody = `## [Unreleased]\n\n## [0.9.0] — 2026-08-30\n\n## [0.8.5] — 2026-07-04\n\nbody\n`;
    const result = validateScriptChangelogStructure(emptyBody, '0.9.0');
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /no entries|empty/i.test(e)));
});

test('validateScriptChangelogStructure fails when the version section only has a subheading and no actual entry content', () => {
    const headingOnly = `## [Unreleased]\n\n## [0.9.0] — 2026-08-30\n\n### Added\n\n## [0.8.5] — 2026-07-04\n\n### Changed\n- old\n`;
    const result = validateScriptChangelogStructure(headingOnly, '0.9.0');
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /no entries|empty/i.test(e)));
});

test('validateScriptChangelogStructure fails when the version section has multiple subheadings but still no entries', () => {
    const headingOnly = `## [Unreleased]\n\n## [0.9.0] — 2026-08-30\n\n### Added\n\n### Fixed\n\n## [0.8.5] — 2026-07-04\n\n### Changed\n- old\n`;
    const result = validateScriptChangelogStructure(headingOnly, '0.9.0');
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /no entries|empty/i.test(e)));
});

test('validateScriptChangelogStructure fails when the version section is not first after Unreleased', () => {
    const notFirst = `## [Unreleased]\n\n## [0.8.6] — 2026-08-15\n\n### Added\n- interim.\n\n## [0.9.0] — 2026-08-30\n\n### Added\n- final.\n`;
    const result = validateScriptChangelogStructure(notFirst, '0.9.0');
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /first release section/i.test(e)));
});
