// Thin wrapper around the `git` CLI used for reading tags/refs/file
// contents at arbitrary commits without mutating the working tree.
import { execFileSync, spawnSync } from 'node:child_process';

export function git(cwd, args) {
    // Explicitly pipe stderr (rather than letting it leak to the parent's
    // terminal) since gitOrNull() intentionally swallows expected failures
    // such as "path exists on disk, but not in <ref>".
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Runs git and returns its stdout, or null if the command fails. */
export function gitOrNull(cwd, args) {
    try {
        return git(cwd, args);
    } catch {
        return null;
    }
}

/** Lists all tags in the repo at `cwd`. */
export function listTags(cwd) {
    const out = gitOrNull(cwd, ['tag', '--list']);
    return out ? out.split(/\r?\n/).filter(Boolean) : [];
}

/**
 * Returns the contents of `relPath` (POSIX-style, e.g. "scripts/foo/foo.user.js")
 * as it existed at `ref`, or null if the ref or path doesn't exist.
 */
export function showFileAtRef(cwd, ref, relPath) {
    return gitOrNull(cwd, ['show', `${ref}:${relPath}`]);
}

/** True if `ref` resolves to a real object in the repo at `cwd`. */
export function refExists(cwd, ref) {
    return gitOrNull(cwd, ['rev-parse', '--verify', '--quiet', ref]) !== null;
}

/**
 * True if `ancestorRef` is an ancestor of (or identical to) `descendantRef`.
 *
 * `git merge-base --is-ancestor` exits 0 for "yes" and 1 for "no"; any other
 * exit status (bad ref, unreadable object, git missing) is an *unknown*
 * answer, not a "no". Unknown is reported as `null` so callers can fail
 * closed instead of treating an error as a definitive verdict.
 * @returns {boolean|null}
 */
export function isAncestor(cwd, ancestorRef, descendantRef) {
    const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestorRef, descendantRef], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error) return null;
    if (result.status === 0) return true;
    if (result.status === 1) return false;
    return null;
}
