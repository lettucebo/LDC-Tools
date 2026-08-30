import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseMetadataFields,
    expectedMetadataFor,
    validateMetadata,
} from '../lib/metadata.mjs';

const GOOD_HEADER = (id, version = '0.9.0') => `// ==UserScript==
// @name         Sample
// @namespace    https://github.com/lettucebo/TampermonkeyScripts
// @version      ${version}
// @description  Sample script
// @author       lettucebo
// @license      MIT
// @homepageURL  https://github.com/lettucebo/TampermonkeyScripts/tree/main/scripts/${id}
// @supportURL   https://github.com/lettucebo/TampermonkeyScripts/issues
// @updateURL    https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/${id}/${id}.user.js
// @downloadURL  https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/${id}/${id}.user.js
// @grant        none
// ==/UserScript==

(function () { 'use strict'; })();
`;

test('parseMetadataFields extracts @key value pairs from the header block', () => {
    const fields = parseMetadataFields(GOOD_HEADER('sample-script'));
    assert.equal(fields.version, '0.9.0');
    assert.equal(fields.license, 'MIT');
    assert.equal(fields.namespace, 'https://github.com/lettucebo/TampermonkeyScripts');
});

test('parseMetadataFields returns null when there is no UserScript block', () => {
    assert.equal(parseMetadataFields('const x = 1;'), null);
});

test('expectedMetadataFor computes repo-specific URLs using the folder id', () => {
    const expected = expectedMetadataFor('sample-script');
    assert.equal(expected.namespace, 'https://github.com/lettucebo/TampermonkeyScripts');
    assert.equal(expected.license, 'MIT');
    assert.equal(
        expected.updateURL,
        'https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/sample-script/sample-script.user.js',
    );
    assert.equal(
        expected.downloadURL,
        'https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/sample-script/sample-script.user.js',
    );
    assert.equal(
        expected.homepageURL,
        'https://github.com/lettucebo/TampermonkeyScripts/tree/main/scripts/sample-script',
    );
    assert.equal(expected.supportURL, 'https://github.com/lettucebo/TampermonkeyScripts/issues');
});

test('validateMetadata passes for a correctly-formed header', () => {
    const result = validateMetadata('sample-script', GOOD_HEADER('sample-script'));
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
});

test('validateMetadata fails when @updateURL uses the wrong folder id', () => {
    const bad = GOOD_HEADER('sample-script').replace(
        '// @updateURL    https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/sample-script/sample-script.user.js',
        '// @updateURL    https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/OTHER-ID/sample-script.user.js',
    );
    const result = validateMetadata('sample-script', bad);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('@updateURL')));
});

test('validateMetadata fails when @license is not MIT', () => {
    const bad = GOOD_HEADER('sample-script').replace('// @license      MIT', '// @license      GPL-3.0');
    const result = validateMetadata('sample-script', bad);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('@license')));
});

test('validateMetadata fails when @version is missing', () => {
    const bad = GOOD_HEADER('sample-script').replace('// @version      0.9.0\n', '');
    const result = validateMetadata('sample-script', bad);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('@version')));
});

test('validateMetadata fails when @version is not valid strict SemVer', () => {
    const result = validateMetadata('sample-script', GOOD_HEADER('sample-script', 'v0.9'));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('@version')));
});

test('validateMetadata fails when there is no metadata block at all', () => {
    const result = validateMetadata('sample-script', 'not a userscript');
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
});
