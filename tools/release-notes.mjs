#!/usr/bin/env node
// CLI that generates combined release notes for a given version from the
// root CHANGELOG.md and every script CHANGELOG.md. See
// tools/lib/releaseNotesCore.mjs for the underlying, independently-tested
// logic.
//
// Usage:
//   node tools/release-notes.mjs <version>
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildReleaseNotes } from './lib/releaseNotesCore.mjs';

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const version = process.argv[2];
    if (!version) {
        console.error('Usage: node tools/release-notes.mjs <version>');
        process.exit(1);
    }
    const result = buildReleaseNotes(repoRoot, version);
    if (!result.ok) {
        console.error(`release-notes: ${result.error}`);
        process.exit(1);
    }
    console.log(result.notes);
}
