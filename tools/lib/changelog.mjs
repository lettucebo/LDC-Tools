// Parses "Keep a Changelog"-style Markdown into labeled `## [X.Y.Z]` /
// `## [Unreleased]` sections, and validates them per this repo's rules.

const HEADING_RE = /^##\s*\[([^\]]+)\]\s*(.*)$/;

/**
 * Splits a changelog Markdown document into an ordered list of sections.
 * @returns {{label: string, heading: string, body: string}[]}
 */
export function parseChangelogSections(markdown) {
    const lines = markdown.split(/\r?\n/);
    const sections = [];
    let current = null;
    for (const line of lines) {
        const m = HEADING_RE.exec(line);
        if (m) {
            current = { label: m[1], heading: m[2].trim(), bodyLines: [] };
            sections.push(current);
        } else if (current) {
            current.bodyLines.push(line);
        }
    }
    return sections.map((s) => ({ label: s.label, heading: s.heading, body: s.bodyLines.join('\n') }));
}

// A section "has content" only if at least one line is non-blank AND is not
// itself just a Markdown heading (e.g. a bare "### Added" subheading with no
// entries underneath must NOT count as content).
const SUBHEADING_RE = /^#{1,6}(\s|$)/;

function hasEntryContent(body) {
    return body.split(/\r?\n/).some((l) => {
        const trimmed = l.trim();
        return trimmed !== '' && !SUBHEADING_RE.test(trimmed);
    });
}

/**
 * Extracts exactly one `## [version]` section's body from a changelog
 * document. Used both by release-notes generation and (indirectly) by the
 * per-script structural validation below.
 * @returns {{ok: true, heading: string, body: string} | {ok: false, error: string}}
 */
export function extractSection(markdown, version) {
    const matches = parseChangelogSections(markdown).filter((s) => s.label === version);
    if (matches.length === 0) {
        return { ok: false, error: `no "## [${version}]" section found` };
    }
    if (matches.length > 1) {
        return { ok: false, error: `multiple "## [${version}]" sections found (expected exactly one)` };
    }
    const section = matches[0];
    if (!hasEntryContent(section.body)) {
        return { ok: false, error: `"## [${version}]" section is empty` };
    }
    return { ok: true, heading: section.heading, body: section.body.replace(/\n+$/, '') };
}

/**
 * Validates a *per-script* CHANGELOG.md against this repo's structural
 * rules: it must contain exactly one `## [Unreleased]` section, the
 * expected version's `## [X.Y.Z]` section must be the very next (first)
 * release section after `## [Unreleased]`, must appear exactly once, and
 * must have non-empty entries. (Root CHANGELOG.md is intentionally not
 * subject to these rules.)
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateScriptChangelogStructure(markdown, expectedVersion) {
    const errors = [];
    const sections = parseChangelogSections(markdown);

    const unreleasedIdx = sections.findIndex((s) => s.label === 'Unreleased');
    if (unreleasedIdx === -1) {
        errors.push('missing "## [Unreleased]" section');
        return { ok: false, errors };
    }

    const matching = sections.filter((s) => s.label === expectedVersion);
    if (matching.length === 0) {
        errors.push(`missing "## [${expectedVersion}]" section`);
    } else if (matching.length > 1) {
        errors.push(`multiple "## [${expectedVersion}]" sections found (expected exactly one)`);
    } else if (!hasEntryContent(matching[0].body)) {
        errors.push(`"## [${expectedVersion}]" section has no entries`);
    }

    const nextSection = sections[unreleasedIdx + 1];
    if (!nextSection) {
        errors.push('no release section found after "## [Unreleased]"');
    } else if (nextSection.label !== expectedVersion) {
        errors.push(
            `first release section after "## [Unreleased]" is "## [${nextSection.label}]", expected "## [${expectedVersion}]"`,
        );
    }

    return { ok: errors.length === 0, errors };
}
