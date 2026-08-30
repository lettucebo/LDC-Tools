// Discovers the repo's `scripts/<id>/` folder ids, deterministically.
import fs from 'node:fs';

/**
 * Lists the direct sub-directory names under `scriptsRoot` (i.e. the
 * `<id>` in `scripts/<id>/`), sorted alphabetically for determinism.
 */
export function listScriptIds(scriptsRoot) {
    return fs
        .readdirSync(scriptsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
}
