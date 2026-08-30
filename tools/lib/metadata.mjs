// Parses and validates Tampermonkey `// ==UserScript== ... ==/UserScript==`
// metadata blocks against this repo's required conventions.
import { isValidSemver } from './semver.mjs';

const HEADER_RE = /\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/;
const FIELD_LINE_RE = /^\/\/\s*@(\S+)\s+(.*)$/;

/**
 * Extracts the raw text between the `==UserScript==` / `==/UserScript==`
 * markers, or null if the userscript has no metadata block.
 */
export function extractHeaderBlock(source) {
    const m = HEADER_RE.exec(source);
    return m ? m[1] : null;
}

/**
 * Parses `// @key value` metadata lines into a plain object keyed by field
 * name (e.g. "version", "namespace", "license"). The first occurrence of a
 * given key wins (localized variants like `@name:zh-TW` are a distinct key
 * and do not collide with `@name`).
 * @returns {Record<string,string>|null} null if there is no metadata block.
 */
export function parseMetadataFields(source) {
    const block = extractHeaderBlock(source);
    if (block === null) return null;
    const fields = {};
    for (const rawLine of block.split(/\r?\n/)) {
        const m = FIELD_LINE_RE.exec(rawLine.trim());
        if (!m) continue;
        const [, key, value] = m;
        if (!(key in fields)) fields[key] = value.trim();
    }
    return fields;
}

/**
 * The repo-specific metadata values every userscript must carry, computed
 * from its folder id per the project conventions in the root
 * copilot-instructions (@namespace, @updateURL/@downloadURL/@homepageURL
 * using the folder id, @supportURL, @license MIT).
 */
export function expectedMetadataFor(id) {
    const base = 'https://github.com/lettucebo/TampermonkeyScripts';
    const rawUrl = `https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/${id}/${id}.user.js`;
    return {
        namespace: base,
        updateURL: rawUrl,
        downloadURL: rawUrl,
        homepageURL: `${base}/tree/main/scripts/${id}`,
        supportURL: `${base}/issues`,
        license: 'MIT',
    };
}

/**
 * Validates a userscript's metadata against the repo conventions:
 * exact-match @namespace/@updateURL/@downloadURL/@homepageURL/@supportURL
 * (URLs built from the folder id) and @license MIT, plus a present, valid
 * strict-SemVer @version.
 * @returns {{ok: boolean, errors: string[], fields: Record<string,string>|null}}
 */
export function validateMetadata(id, source) {
    const fields = parseMetadataFields(source);
    if (!fields) {
        return { ok: false, errors: ['missing "==UserScript==" metadata block'], fields: null };
    }
    const errors = [];
    const expected = expectedMetadataFor(id);
    for (const key of Object.keys(expected)) {
        const actual = fields[key];
        if (actual !== expected[key]) {
            errors.push(`@${key} expected "${expected[key]}" but found "${actual ?? '(missing)'}"`);
        }
    }
    if (!fields.version || !isValidSemver(fields.version)) {
        errors.push(`@version "${fields.version ?? '(missing)'}" is not valid strict SemVer`);
    }
    return { ok: errors.length === 0, errors, fields };
}
