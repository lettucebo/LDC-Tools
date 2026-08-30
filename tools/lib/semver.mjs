// Strict SemVer 2.0.0 parsing/comparison, plus the repo's "vX.Y.Z" tag shape.
// See https://semver.org/ for the canonical grammar this regex encodes.

const STRICT_SEMVER_RE =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/**
 * Parses a strict SemVer 2.0.0 string.
 * @param {unknown} input
 * @returns {{raw: string, major: number, minor: number, patch: number, prerelease: string|null, build: string|null}|null}
 */
export function parseSemver(input) {
    if (typeof input !== 'string') return null;
    const m = STRICT_SEMVER_RE.exec(input);
    if (!m) return null;
    return {
        raw: input,
        major: Number(m[1]),
        minor: Number(m[2]),
        patch: Number(m[3]),
        prerelease: m[4] ?? null,
        build: m[5] ?? null,
    };
}

export function isValidSemver(input) {
    return parseSemver(input) !== null;
}

function comparePrereleaseIdentifiers(a, b) {
    const asIds = a.split('.');
    const bsIds = b.split('.');
    const len = Math.max(asIds.length, bsIds.length);
    for (let i = 0; i < len; i++) {
        if (asIds[i] === undefined) return -1; // fewer fields has lower precedence
        if (bsIds[i] === undefined) return 1;
        const aIsNum = /^\d+$/.test(asIds[i]);
        const bIsNum = /^\d+$/.test(bsIds[i]);
        if (aIsNum && bIsNum) {
            const na = Number(asIds[i]);
            const nb = Number(bsIds[i]);
            if (na !== nb) return na < nb ? -1 : 1;
        } else if (aIsNum !== bIsNum) {
            return aIsNum ? -1 : 1; // numeric identifiers have lower precedence than alphanumeric
        } else if (asIds[i] !== bsIds[i]) {
            return asIds[i] < bsIds[i] ? -1 : 1;
        }
    }
    return 0;
}

/**
 * Compares two strict SemVer strings per semver.org precedence rules.
 * @returns {-1|0|1}
 */
export function compareSemver(a, b) {
    const pa = parseSemver(a);
    const pb = parseSemver(b);
    if (!pa || !pb) {
        throw new Error(`compareSemver: invalid SemVer input (a=${JSON.stringify(a)}, b=${JSON.stringify(b)})`);
    }
    if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
    if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
    if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
    if (pa.prerelease === pb.prerelease) return 0;
    if (pa.prerelease === null) return 1; // a is a release version, b is a prerelease -> a is greater
    if (pb.prerelease === null) return -1;
    return comparePrereleaseIdentifiers(pa.prerelease, pb.prerelease);
}

/**
 * Parses a repo-wide release tag of the exact shape "v<major>.<minor>.<patch>",
 * e.g. "v0.8.5" — a *core* release version only.
 *
 * Prerelease ("v1.0.0-rc.1") and build-metadata ("v1.0.0+build.5") suffixes
 * are rejected on purpose so this function stays exactly as strict as the
 * Release workflow's tag gate
 * (`^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`). Anything laxer
 * here would let a hand-created tag that can never be released through the
 * workflow still be selected as the release baseline, where a high
 * prerelease tag would block every subsequent real release.
 *
 * Legacy per-script tags such as "ldc-batch-download-v0.8.2" are rejected
 * too (they don't start with "v<digit>").
 * @param {unknown} tag
 * @returns {{tag: string, version: string, parsed: object}|null}
 */
export function parseRepoTag(tag) {
    if (typeof tag !== 'string' || tag.length < 2 || tag[0] !== 'v') return null;
    const version = tag.slice(1);
    const parsed = parseSemver(version);
    if (!parsed) return null;
    if (parsed.prerelease !== null || parsed.build !== null) return null;
    return { tag, version, parsed };
}
