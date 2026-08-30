// Thin wrapper around the `git` CLI used for reading tags/refs/file
// contents at arbitrary commits without mutating the working tree.
import { execFileSync } from 'node:child_process';

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
