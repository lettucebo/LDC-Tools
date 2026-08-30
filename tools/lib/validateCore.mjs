// Core, pure/testable logic behind tools/validate.mjs. The CLI wrapper only
// parses argv and prints/exits; every check here is an exported function
// that accepts an explicit repoRoot so tests can point at fixture repos
// instead of mutating the live worktree.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isValidSemver, compareSemver, parseRepoTag } from './semver.mjs';
import { validateMetadata, parseMetadataFields } from './metadata.mjs';
import { validateScriptChangelogStructure } from './changelog.mjs';
import { listScriptIds } from './repoScripts.mjs';
import { listTags, showFileAtRef, refExists } from './gitRepo.mjs';

// Tags that are permanently retired and must never be selected as a release
// baseline again, regardless of what they parse to.
const RETIRED_TAGS = new Set(['v1.0.0']);

/**
 * Builds the list of {id, dir, userScriptPath, changelogPath} descriptors
 * for every direct `scripts/<id>/` folder in `repoRoot`.
 */
export function collectScripts(repoRoot) {
    const scriptsRoot = path.join(repoRoot, 'scripts');
    const ids = listScriptIds(scriptsRoot);
    return ids.map((id) => ({
        id,
        dir: path.join(scriptsRoot, id),
        userScriptPath: path.join(scriptsRoot, id, `${id}.user.js`),
        changelogPath: path.join(scriptsRoot, id, 'CHANGELOG.md'),
    }));
}

/** Requires `<id>.user.js` and `CHANGELOG.md` to exist for every script. */
export function checkFilesExist(scripts) {
    const errors = [];
    for (const s of scripts) {
        if (!fs.existsSync(s.userScriptPath)) errors.push(`${s.id}: missing ${s.id}.user.js`);
        if (!fs.existsSync(s.changelogPath)) errors.push(`${s.id}: missing CHANGELOG.md`);
    }
    return errors;
}

/** Runs `node --check` on a file; returns {ok, stderr}. */
export function runNodeCheck(filePath) {
    const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
    return { ok: result.status === 0, stderr: result.stderr ?? '' };
}

/**
 * Runs `node --check` + metadata validation for every script that has a
 * readable userscript file. Returns collected errors plus a map of
 * id -> @version for the scripts that parsed successfully.
 */
export function validateAllMetadata(scripts) {
    const errors = [];
    const versions = {};
    for (const s of scripts) {
        if (!fs.existsSync(s.userScriptPath)) continue; // reported by checkFilesExist
        const source = fs.readFileSync(s.userScriptPath, 'utf8');
        const check = runNodeCheck(s.userScriptPath);
        if (!check.ok) errors.push(`${s.id}: node --check failed: ${check.stderr.trim()}`);
        const metaResult = validateMetadata(s.id, source);
        if (!metaResult.ok) {
            for (const e of metaResult.errors) errors.push(`${s.id}: ${e}`);
        }
        if (metaResult.fields?.version) versions[s.id] = metaResult.fields.version;
    }
    return { ok: errors.length === 0, errors, versions };
}

/**
 * Requires every value in `versions` (a map of id -> version string) to be
 * identical, returning that shared version.
 */
export function requireSynchronizedVersion(versions) {
    const entries = Object.entries(versions);
    if (entries.length === 0) {
        return { ok: false, error: 'no script versions found', version: null };
    }
    const [firstId, firstVersion] = entries[0];
    for (const [id, v] of entries) {
        if (v !== firstVersion) {
            return { ok: false, error: `version mismatch: ${firstId}@${firstVersion} vs ${id}@${v}`, version: null };
        }
    }
    return { ok: true, error: null, version: firstVersion };
}

/** Runs the per-script CHANGELOG.md structural checks for every script. */
export function validateAllChangelogs(scripts, expectedVersion) {
    const errors = [];
    for (const s of scripts) {
        if (!fs.existsSync(s.changelogPath)) continue; // reported by checkFilesExist
        const markdown = fs.readFileSync(s.changelogPath, 'utf8');
        const result = validateScriptChangelogStructure(markdown, expectedVersion);
        if (!result.ok) {
            for (const e of result.errors) errors.push(`${s.id}: CHANGELOG.md: ${e}`);
        }
    }
    return { ok: errors.length === 0, errors };
}

/**
 * Reads `scripts/<id>/<id>.user.js` for each id as it existed at `ref` and
 * parses its @version. Missing files or invalid/missing versions are
 * reported as errors (not silently skipped) since callers rely on a
 * complete, synchronized version set at `ref`.
 */
export function getVersionsAtGitRef(repoRoot, ref, ids) {
    const versions = {};
    const errors = [];
    for (const id of ids) {
        const relPath = `scripts/${id}/${id}.user.js`;
        const content = showFileAtRef(repoRoot, ref, relPath);
        if (content === null) {
            errors.push(`${id}: missing at ${ref}`);
            continue;
        }
        const fields = parseMetadataFields(content);
        if (!fields || !fields.version || !isValidSemver(fields.version)) {
            errors.push(`${id}: invalid or missing @version at ${ref}`);
            continue;
        }
        versions[id] = fields.version;
    }
    return { errors, versions };
}

/**
 * PR/push mode: fails only if the current shared version is lower than the
 * version at `baseRef` (default `refs/remotes/origin/main`); equality is
 * allowed.
 */
export function runPrModeCheck(repoRoot, ids, currentVersion, baseRef = 'refs/remotes/origin/main') {
    if (!refExists(repoRoot, baseRef)) {
        return { ok: false, errors: [`base ref "${baseRef}" not found (fetch origin/main first)`] };
    }
    const { errors, versions } = getVersionsAtGitRef(repoRoot, baseRef, ids);
    if (errors.length) return { ok: false, errors };
    const sync = requireSynchronizedVersion(versions);
    if (!sync.ok) return { ok: false, errors: [`${baseRef}: ${sync.error}`] };
    if (compareSemver(currentVersion, sync.version) < 0) {
        return {
            ok: false,
            errors: [`current version ${currentVersion} is lower than ${baseRef} version ${sync.version}`],
        };
    }
    return { ok: true, errors: [], baseVersion: sync.version };
}

/**
 * Finds the release baseline for `releaseTag`: the greatest-SemVer other
 * strict repo-wide `vX.Y.Z` tag (excluding `releaseTag` itself and the
 * permanently retired `v1.0.0`) whose commit has all scripts' versions
 * equal to that tag's own version (i.e. was itself a synchronized release).
 * Legacy per-script tags (e.g. `ldc-batch-download-v0.8.2`) never match the
 * strict `vX.Y.Z` shape and are excluded automatically.
 */
export function findReleaseBaseline(repoRoot, ids, releaseTag) {
    const candidates = [];
    for (const tag of listTags(repoRoot)) {
        if (tag === releaseTag) continue;
        if (RETIRED_TAGS.has(tag)) continue;
        const parsedTag = parseRepoTag(tag);
        if (!parsedTag) continue; // not a strict repo-wide "vX.Y.Z" tag
        const { errors, versions } = getVersionsAtGitRef(repoRoot, tag, ids);
        if (errors.length) continue; // missing/invalid script at this tag
        const sync = requireSynchronizedVersion(versions);
        if (!sync.ok) continue; // not actually synchronized at this commit
        if (sync.version !== parsedTag.version) continue; // tag name lies about its content
        candidates.push({ tag, version: sync.version });
    }
    if (candidates.length === 0) {
        return { ok: false, error: 'no valid release baseline candidate tag found', baseline: null };
    }
    candidates.sort((a, b) => compareSemver(a.version, b.version));
    return { ok: true, error: null, baseline: candidates[candidates.length - 1] };
}

/**
 * Release mode (`--release-tag vX.Y.Z`): validates the tag shape, requires
 * the current shared version to equal the tag's version, selects the
 * release baseline via {@link findReleaseBaseline}, and requires the
 * current version to be strictly greater than that baseline.
 */
export function runReleaseModeCheck(repoRoot, ids, currentVersion, releaseTag) {
    const errors = [];
    const parsedTag = parseRepoTag(releaseTag);
    if (!parsedTag) {
        return { ok: false, errors: [`--release-tag "${releaseTag}" is not a valid "vX.Y.Z" tag`] };
    }
    if (parsedTag.version !== currentVersion) {
        errors.push(`current version ${currentVersion} does not match release tag version ${parsedTag.version}`);
    }
    const baselineResult = findReleaseBaseline(repoRoot, ids, releaseTag);
    if (!baselineResult.ok) {
        errors.push(baselineResult.error);
        return { ok: false, errors };
    }
    if (compareSemver(currentVersion, baselineResult.baseline.version) <= 0) {
        errors.push(
            `current version ${currentVersion} must be strictly greater than baseline ${baselineResult.baseline.tag} (${baselineResult.baseline.version})`,
        );
    }
    return { ok: errors.length === 0, errors, baseline: baselineResult.baseline };
}
