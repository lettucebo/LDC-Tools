// Core, testable logic behind tools/release-notes.mjs: combines the root
// CHANGELOG.md and every script CHANGELOG.md's matching `## [version]`
// section into a single release-notes Markdown document.
import fs from 'node:fs';
import path from 'node:path';
import { isValidSemver } from './semver.mjs';
import { extractSection } from './changelog.mjs';
import { listScriptIds } from './repoScripts.mjs';

/**
 * Lists the release-notes sources in deterministic order: the root
 * CHANGELOG.md first (labeled "Root"), then each script's CHANGELOG.md in
 * folder-id order (labeled with its id).
 */
export function collectReleaseNotesSources(repoRoot) {
    const scriptsRoot = path.join(repoRoot, 'scripts');
    const sources = [{ label: 'Root', path: path.join(repoRoot, 'CHANGELOG.md') }];
    for (const id of listScriptIds(scriptsRoot)) {
        sources.push({ label: id, path: path.join(scriptsRoot, id, 'CHANGELOG.md') });
    }
    return sources;
}

/**
 * Builds the combined release-notes Markdown document for `version` from
 * the root CHANGELOG.md and every script CHANGELOG.md, in deterministic
 * order. Fails on an invalid version argument, a missing changelog file, or
 * a missing/duplicate/empty `## [version]` section in any source.
 * @returns {{ok: true, notes: string} | {ok: false, error: string}}
 */
export function buildReleaseNotes(repoRoot, version) {
    if (!isValidSemver(version)) {
        return { ok: false, error: `"${version}" is not a valid strict SemVer version`, notes: null };
    }
    const sources = collectReleaseNotesSources(repoRoot);
    const parts = [];
    for (const src of sources) {
        if (!fs.existsSync(src.path)) {
            return { ok: false, error: `${src.label}: CHANGELOG.md not found at ${src.path}`, notes: null };
        }
        const markdown = fs.readFileSync(src.path, 'utf8');
        const result = extractSection(markdown, version);
        if (!result.ok) {
            return { ok: false, error: `${src.label}: ${result.error}`, notes: null };
        }
        parts.push(`## ${src.label}\n\n${result.body.trim()}\n`);
    }
    const notes = `# Release v${version}\n\n${parts.join('\n')}`;
    return { ok: true, error: null, notes };
}
