// Quick standalone smoke-tests for the pure modules.
// Run with: node scripts/ldc-batch-download/test/pure-modules.test.js
// The userscript file uses unsafeWindow / Tampermonkey APIs that don't exist
// in Node, so we hand-port the pure parser/sanitizer here. Update both when
// the implementation changes.

const courseParser = (() => {
    function parseRowName(name) {
        if (!name || typeof name !== 'string') return { code: '', title: '', languageHint: null };
        const idx = name.indexOf(':');
        let rawCode, rest;
        if (idx === -1) { rawCode = ''; rest = name.trim(); }
        else { rawCode = name.slice(0, idx).trim(); rest = name.slice(idx + 1).trim(); }
        const { title, languageHint } = stripLanguageSuffix(rest);
        return { code: simplifyCourseCode(rawCode), title, languageHint };
    }
    function stripLanguageSuffix(title) {
        if (!title) return { title: '', languageHint: null };
        const m = title.match(/^(.*)\s*\(([^()]+)\)\s*$/);
        if (m) return { title: m[1].trim(), languageHint: m[2].trim() };
        return { title: title.trim(), languageHint: null };
    }
    function simplifyCourseCode(code) {
        if (!code || typeof code !== 'string') return code;
        return code.replace(/T00[A-Z]?$/, '').replace(/-$/, '');
    }
    function resolveLanguage(file) {
        const raw = file && file.language;
        if (!raw) return 'Unknown';
        const m = raw.match(/^(.*?)\s*\([a-z]{2,3}-[a-z]{2,4}\)\s*$/i);
        return (m ? m[1] : raw).trim();
    }
    function canonicalCourseDirName(blobUrl) {
        if (!blobUrl) return '';
        const segs = String(blobUrl).split('/');
        if (segs.length < 2) return segs[0] || '';
        const courseSeg = segs[segs.length - 2];
        const { code, title } = parseRowName(courseSeg);
        if (code) return title ? `${code} ${title}` : code;
        return courseSeg.replace(/:\s*/g, ' ');
    }
    function parseDate(value) {
        if (value === null || value === undefined || value === '') return 0;
        if (value instanceof Date) {
            const t = value.getTime();
            return Number.isFinite(t) ? t : 0;
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
        }
        if (typeof value === 'string') {
            const s = value.trim();
            if (!s) return 0;
            if (/^-?\d+(\.\d+)?$/.test(s)) {
                const n = Number(s);
                if (!Number.isFinite(n)) return 0;
                return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
            }
            const t = Date.parse(s);
            return Number.isFinite(t) ? t : 0;
        }
        return 0;
    }
    const FILE_DATE_FIELDS = ['lastModified', 'modifiedDate', 'lastUpdated', 'updatedAt', 'updateDate', 'modifiedOn', 'publishDate', 'publishedDate', 'createdDate'];
    function pickFileDate(file) {
        if (!file) return 0;
        for (const k of FILE_DATE_FIELDS) {
            if (k in file) {
                const t = parseDate(file[k]);
                if (t > 0) return t;
            }
        }
        return 0;
    }
    function courseLastModified(files) {
        if (!Array.isArray(files) || files.length === 0) return 0;
        let max = 0;
        for (const f of files) {
            const t = pickFileDate(f);
            if (t > max) max = t;
        }
        return max;
    }
    return { parseRowName, stripLanguageSuffix, simplifyCourseCode, resolveLanguage, canonicalCourseDirName, parseDate, pickFileDate, courseLastModified };
})();

const MAX_FILENAME_LEN = 150;
const pathSanitizer = (() => {
    const WIN_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
    const ILLEGAL = /[<>:"/\\|?*\x00-\x1F\x7F-\x9F]/g;
    const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
    function shortHash(s) {
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return h.toString(36).slice(0, 8);
    }
    function sanitizeSegment(name) {
        if (!name) return '_';
        let s = String(name).replace(INVISIBLE, '');
        s = s.replace(ILLEGAL, '-');
        s = s.replace(/[\s.]+$/g, '').replace(/^\s+/, '');
        if (!s) s = '_';
        if (WIN_RESERVED.test(s)) s = '_' + s;
        if (s.length > MAX_FILENAME_LEN) {
            const dot = s.lastIndexOf('.');
            if (dot > 0 && s.length - dot <= 10) {
                const base = s.slice(0, dot);
                const ext = s.slice(dot);
                const trim = base.slice(0, MAX_FILENAME_LEN - ext.length - 9);
                s = `${trim}-${shortHash(name)}${ext}`;
            } else {
                s = `${s.slice(0, MAX_FILENAME_LEN - 9)}-${shortHash(name)}`;
            }
        }
        return s;
    }
    return { sanitizeSegment, shortHash };
})();

// downloadHistory — pure helpers only (hand-ported; the stateful load/save/reset
// methods in the userscript wrap GM.getValue/GM.setValue and can't run under Node).
// Keep this in sync with the userscript's downloadHistory module.
const HISTORY_MAX_ENTRIES = 3000;
const downloadHistory = (() => {
    function isPositiveFiniteNumber(v) {
        return typeof v === 'number' && Number.isFinite(v) && v > 0;
    }
    function isValidCap(v) {
        return typeof v === 'number' && Number.isFinite(v) && v >= 0;
    }
    function summarizeCourseCompletion(tasks) {
        const byRow = new Map();
        if (Array.isArray(tasks)) {
            for (const t of tasks) {
                if (!t || typeof t.rowName !== 'string' || !t.rowName) continue;
                if (!byRow.has(t.rowName)) byRow.set(t.rowName, []);
                byRow.get(t.rowName).push(t);
            }
        }
        const completedRowNames = [];
        for (const [rowName, rowTasks] of byRow) {
            if (rowTasks.every((t) => t.status === 'done' || t.status === 'skipped')) {
                completedRowNames.push(rowName);
            }
        }
        const allComplete = Array.isArray(tasks) && tasks.length > 0
            && tasks.every((t) => t && (t.status === 'done' || t.status === 'skipped'));
        return { completedRowNames, allComplete };
    }
    function baselineFor(rowName, map, globalTs) {
        const perCourseTs = map && typeof map === 'object' ? map[rowName] : undefined;
        if (isPositiveFiniteNumber(perCourseTs)) return perCourseTs;
        if (isPositiveFiniteNumber(globalTs)) return globalTs;
        return 0;
    }
    function isUpdatedSince(lastModified, baseline) {
        return isPositiveFiniteNumber(lastModified) && isPositiveFiniteNumber(baseline) && lastModified > baseline;
    }
    function formatLocalDateTime(ms) {
        if (!isPositiveFiniteNumber(ms)) return '—';
        const d = new Date(ms);
        if (Number.isNaN(d.getTime())) return '—';
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    function pruneHistory(map, cap) {
        const c = isValidCap(cap) ? Math.floor(cap) : HISTORY_MAX_ENTRIES;
        if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
        const entries = Object.entries(map).filter(([k, v]) => typeof k === 'string' && k && isPositiveFiniteNumber(v));
        entries.sort((x, y) => y[1] - x[1]); // newest (largest timestamp) first
        const kept = entries.slice(0, Math.max(0, c));
        const out = {};
        for (const [k, v] of kept) out[k] = v;
        return out;
    }
    function mergePersistedHistory(persisted, batch) {
        const p = persisted && typeof persisted === 'object' ? persisted : {};
        const b = batch && typeof batch === 'object' ? batch : {};
        const cap = isValidCap(b.cap) ? Math.floor(b.cap) : HISTORY_MAX_ENTRIES;
        const baseGlobal = isPositiveFiniteNumber(p.globalTs) ? p.globalTs : 0;
        const merged = pruneHistory(p.perCourse, cap);
        const ts = isPositiveFiniteNumber(b.startedAt) ? b.startedAt : 0;
        if (ts > 0 && Array.isArray(b.completedRowNames)) {
            for (const rowName of b.completedRowNames) {
                if (typeof rowName !== 'string' || !rowName) continue;
                const existing = merged[rowName];
                merged[rowName] = isPositiveFiniteNumber(existing) ? Math.max(existing, ts) : ts;
            }
        }
        return {
            globalTs: (b.advanceGlobal === true && ts > 0) ? Math.max(baseGlobal, ts) : baseGlobal,
            perCourse: pruneHistory(merged, cap),
        };
    }
    return { summarizeCourseCompletion, baselineFor, isUpdatedSince, formatLocalDateTime, pruneHistory, mergePersistedHistory };
})();

let pass = 0, fail = 0;
function eq(actual, expected, label) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a === b) { pass++; }
    else { fail++; console.error(`FAIL: ${label}\n  expected: ${b}\n  actual:   ${a}`); }
}

// Course parser tests
eq(courseParser.parseRowName('AZ-040T00: Automate Administration with PowerShell'),
    { code: 'AZ-040', title: 'Automate Administration with PowerShell', languageHint: null },
    'AZ-040T00 plain → AZ-040 (T00 stripped)');
eq(courseParser.parseRowName('AZ-040T00: Automate Administration with PowerShell (Japanese)'),
    { code: 'AZ-040', title: 'Automate Administration with PowerShell', languageHint: 'Japanese' },
    'AZ-040T00 with Japanese → AZ-040');
eq(courseParser.parseRowName('MS-700T00: Managing Microsoft Teams'),
    { code: 'MS-700', title: 'Managing Microsoft Teams', languageHint: null },
    'MS-700T00 → MS-700 (T00 stripped)');
eq(courseParser.parseRowName('PL-300T00A: Microsoft Power BI Data Analyst'),
    { code: 'PL-300', title: 'Microsoft Power BI Data Analyst', languageHint: null },
    'PL-300T00A → PL-300 (T00A stripped)');
eq(courseParser.parseRowName('100-100: Example'),
    { code: '100-100', title: 'Example', languageHint: null },
    'numeric-prefix code (no T suffix)');
eq(courseParser.parseRowName('AI-3017: Microsoft AI for business leaders'),
    { code: 'AI-3017', title: 'Microsoft AI for business leaders', languageHint: null },
    'AI-3017 unchanged (no T suffix)');
eq(courseParser.parseRowName('AZ-1002: Configure secure access (Chinese Simplified)'),
    { code: 'AZ-1002', title: 'Configure secure access', languageHint: 'Chinese Simplified' },
    'AZ-1002 unchanged + multi-word language');
eq(courseParser.parseRowName('AZ-040T00B: Title'),
    { code: 'AZ-040', title: 'Title', languageHint: null },
    'T00B (any single trailing letter) stripped');

// Language resolver tests
eq(courseParser.resolveLanguage({ language: 'Japanese (ja-jp)' }), 'Japanese', 'lang ja-jp');
eq(courseParser.resolveLanguage({ language: 'English' }), 'English', 'lang English');
eq(courseParser.resolveLanguage({ language: 'Chinese Simplified (zh-cn)' }), 'Chinese Simplified', 'lang zh-cn');
eq(courseParser.resolveLanguage({ language: 'Portuguese Brazil (pt-br)' }), 'Portuguese Brazil', 'lang pt-br');
eq(courseParser.resolveLanguage({}), 'Unknown', 'lang missing');

// Canonical course dir name
eq(courseParser.canonicalCourseDirName(
    'Azure/AZ-040T00: Automate Administration with PowerShell/AZ-040T00A-ENU-Powerpoint.zip'),
    'AZ-040 Automate Administration with PowerShell',
    'canonical from blob path (T00 stripped)');
eq(courseParser.canonicalCourseDirName(
    'Azure/AZ-040T00: Automate Administration with PowerShell (Japanese)/AZ-040T00-PowerPoint.ja-JP.zip'),
    'AZ-040 Automate Administration with PowerShell',
    'canonical drops language suffix and T00');

// Sanitizer tests
eq(pathSanitizer.sanitizeSegment('AZ-040T00 Automate Administration with PowerShell'),
    'AZ-040T00 Automate Administration with PowerShell', 'normal name unchanged');
eq(pathSanitizer.sanitizeSegment('Has<illegal>:chars*?'), 'Has-illegal--chars--', 'illegal chars replaced');
eq(pathSanitizer.sanitizeSegment('CON'), '_CON', 'reserved CON');
eq(pathSanitizer.sanitizeSegment('com1'), '_com1', 'reserved com1 case-insensitive');
eq(pathSanitizer.sanitizeSegment('NUL.txt'), '_NUL.txt', 'reserved NUL.txt');
eq(pathSanitizer.sanitizeSegment('trailing.   '), 'trailing', 'trailing dots/spaces stripped');
eq(pathSanitizer.sanitizeSegment(''), '_', 'empty');
eq(pathSanitizer.sanitizeSegment(null), '_', 'null');
eq(pathSanitizer.sanitizeSegment('x'.repeat(200)).length <= MAX_FILENAME_LEN, true, 'long name truncated');
const longExt = pathSanitizer.sanitizeSegment('a'.repeat(200) + '.zip');
eq(longExt.endsWith('.zip'), true, 'long name preserves extension');
eq(longExt.length <= MAX_FILENAME_LEN, true, 'long name+ext within limit');

// Edge inputs (added in 0.2.0 for hardening)
eq(pathSanitizer.sanitizeSegment(undefined), '_', 'undefined');
eq(courseParser.parseRowName(null), { code: '', title: '', languageHint: null }, 'null input to parseRowName');
eq(courseParser.parseRowName(undefined), { code: '', title: '', languageHint: null }, 'undefined input to parseRowName');
eq(courseParser.parseRowName(42), { code: '', title: '', languageHint: null }, 'non-string input to parseRowName');

// canonicalCourseDirName edge cases
eq(courseParser.canonicalCourseDirName(''), '', 'empty blobUrl');
eq(courseParser.canonicalCourseDirName(null), '', 'null blobUrl');
eq(courseParser.canonicalCourseDirName('NoSlash.zip'), 'NoSlash.zip', 'single seg no slash');
eq(courseParser.canonicalCourseDirName('AZ-040T00: Title/file.pdf'),
    'AZ-040 Title',
    'two-segment path (T00 stripped)');

// Unicode preservation
eq(pathSanitizer.sanitizeSegment('中文檔名.txt'), '中文檔名.txt', 'CJK preserved');
eq(pathSanitizer.sanitizeSegment('café.pdf'), 'café.pdf', 'accented Latin preserved');

// Invisible / zero-width Unicode chars (0.7.1: fixes "Name is not allowed" in Chromium)
eq(pathSanitizer.sanitizeSegment('AI-3008 Extract insights from visual data on Azure\u200B'),
    'AI-3008 Extract insights from visual data on Azure',
    'trailing ZWSP stripped (real LDC bug case from AI-3008)');
eq(pathSanitizer.sanitizeSegment('a\u200Bb'), 'ab', 'ZWSP in middle deleted (not turned into -)');
eq(pathSanitizer.sanitizeSegment('a\u200Cb'), 'ab', 'ZWNJ deleted');
eq(pathSanitizer.sanitizeSegment('a\u200Eb'), 'ab', 'LRM deleted');
eq(pathSanitizer.sanitizeSegment('a\uFEFFb'), 'ab', 'BOM / ZWNBSP deleted');
eq(pathSanitizer.sanitizeSegment('\u200B\u200B\u200B'), '_', 'all-invisible name collapses to _');
eq(pathSanitizer.sanitizeSegment('name\u00ADbreak.txt'), 'namebreak.txt', 'soft hyphen deleted');
eq(pathSanitizer.sanitizeSegment('name\u007Fx'), 'name-x', 'DEL (U+007F) replaced with - (treated as control, not invisible-format)');

// Path-traversal baseline. The trailing-dot strip + empty-fallback in sanitizeSegment
// happens to neutralise `..` to `_`, which is a safer default than letting it through.
eq(pathSanitizer.sanitizeSegment('..'), '_', '`..` is neutralised to `_` (trailing-dot strip then empty-fallback)');
eq(pathSanitizer.sanitizeSegment('../etc/passwd'), '..-etc-passwd', '`/` replaced, embedded `..` preserved (only trailing dots are stripped)');

// Additional language formats
eq(courseParser.resolveLanguage({ language: 'Russian (ru-ru)' }), 'Russian', 'lang ru-ru');
eq(courseParser.resolveLanguage({ language: '' }), 'Unknown', 'empty lang string');
eq(courseParser.resolveLanguage({ language: null }), 'Unknown', 'null lang');

// Multi-colon title (split-on-first-colon must not over-split)
eq(courseParser.parseRowName('XX-1: Title with: colon (English)'),
    { code: 'XX-1', title: 'Title with: colon', languageHint: 'English' },
    'multi-colon title preserves inner colons');

// simplifyCourseCode direct cases (added in 0.3.0)
eq(courseParser.simplifyCourseCode('AZ-040T00'), 'AZ-040', 'plain T00');
eq(courseParser.simplifyCourseCode('AZ-040T00A'), 'AZ-040', 'T00A');
eq(courseParser.simplifyCourseCode('AZ-040T00B'), 'AZ-040', 'T00B (any single trailing letter)');
eq(courseParser.simplifyCourseCode('MS-700T00'), 'MS-700', 'MS-700T00');
eq(courseParser.simplifyCourseCode('PL-300T00A'), 'PL-300', 'PL-300T00A');
eq(courseParser.simplifyCourseCode('AZ-040T01'), 'AZ-040T01', 'T01 NOT stripped (only T00 family per spec)');
eq(courseParser.simplifyCourseCode('AZ-1002'), 'AZ-1002', 'no T suffix unchanged');
eq(courseParser.simplifyCourseCode('AI-3017'), 'AI-3017', 'AI-3017 unchanged');
eq(courseParser.simplifyCourseCode(''), '', 'empty passthrough');
eq(courseParser.simplifyCourseCode(null), null, 'null passthrough');
eq(courseParser.simplifyCourseCode(undefined), undefined, 'undefined passthrough');
eq(courseParser.simplifyCourseCode(42), 42, 'non-string passthrough');
eq(courseParser.simplifyCourseCode('XX-T00'), 'XX', 'trailing dash trimmed when only T00 follows');
eq(courseParser.simplifyCourseCode('T00'), '', 'bare T00 strips entirely');

// Contract-pinning nitpicks (PR #3 review)
eq(courseParser.simplifyCourseCode(courseParser.simplifyCourseCode('AZ-040T00')),
    'AZ-040',
    'idempotent — running simplifyCourseCode twice yields the same result');
eq(courseParser.simplifyCourseCode('AZ-040T00AA'), 'AZ-040T00AA',
    'T00AA (two trailing letters) NOT stripped — regex only allows zero or one letter');
eq(courseParser.simplifyCourseCode('AZ-040t00'), 'AZ-040t00',
    'lowercase t00 NOT stripped — regex is case-sensitive');

// ── parseDate / pickFileDate / courseLastModified ──────────────────────────
// parseDate: missing inputs → 0
eq(courseParser.parseDate(undefined), 0, 'parseDate undefined → 0');
eq(courseParser.parseDate(null), 0, 'parseDate null → 0');
eq(courseParser.parseDate(''), 0, 'parseDate empty string → 0');
eq(courseParser.parseDate('   '), 0, 'parseDate whitespace → 0');
eq(courseParser.parseDate('not-a-date'), 0, 'parseDate garbage → 0');
eq(courseParser.parseDate({}), 0, 'parseDate object → 0');

// parseDate: ISO strings
eq(courseParser.parseDate('2024-01-15T00:00:00Z'), Date.UTC(2024, 0, 15), 'parseDate ISO');
eq(courseParser.parseDate('2024-01-15'), Date.parse('2024-01-15'), 'parseDate date-only');

// parseDate: numeric epochs (heuristic: < 1e12 = seconds, else ms)
eq(courseParser.parseDate(1700000000), 1700000000 * 1000, 'parseDate epoch_s number');
eq(courseParser.parseDate(1700000000000), 1700000000000, 'parseDate epoch_ms number');
eq(courseParser.parseDate('1700000000'), 1700000000 * 1000, 'parseDate epoch_s string');
eq(courseParser.parseDate('1700000000000'), 1700000000000, 'parseDate epoch_ms string');

// parseDate: 1e12 boundary cases (the heuristic switches between seconds and milliseconds here)
// 1e12 ms is 2001-09-09; 1e12 s is year 33658, so values >= 1e12 cannot reasonably be seconds.
eq(courseParser.parseDate(999999999999), 999999999999 * 1000, 'parseDate just below 1e12 → treated as seconds');
eq(courseParser.parseDate(1e12), 1e12, 'parseDate exactly 1e12 → treated as ms (>= boundary)');
eq(courseParser.parseDate(1000000000001), 1000000000001, 'parseDate just above 1e12 → treated as ms');

// parseDate: Date instance
eq(courseParser.parseDate(new Date(Date.UTC(2024, 0, 15))), Date.UTC(2024, 0, 15), 'parseDate Date instance');

// pickFileDate: probes multiple field names
eq(courseParser.pickFileDate({ lastModified: '2024-03-01T00:00:00Z' }), Date.UTC(2024, 2, 1), 'pickFileDate lastModified');
eq(courseParser.pickFileDate({ modifiedDate: '2024-03-01T00:00:00Z' }), Date.UTC(2024, 2, 1), 'pickFileDate modifiedDate');
eq(courseParser.pickFileDate({ updatedAt: '2024-03-01T00:00:00Z' }), Date.UTC(2024, 2, 1), 'pickFileDate updatedAt');
eq(courseParser.pickFileDate({ publishDate: '2024-03-01T00:00:00Z' }), Date.UTC(2024, 2, 1), 'pickFileDate publishDate');
eq(courseParser.pickFileDate({ unrelated: '2024-03-01T00:00:00Z' }), 0, 'pickFileDate unknown field → 0');
eq(courseParser.pickFileDate({}), 0, 'pickFileDate empty → 0');
eq(courseParser.pickFileDate(null), 0, 'pickFileDate null → 0');
// First parseable field wins (probed in declared order, lastModified before modifiedDate)
eq(courseParser.pickFileDate({ lastModified: '2024-01-01T00:00:00Z', modifiedDate: '2025-01-01T00:00:00Z' }),
    Date.UTC(2024, 0, 1),
    'pickFileDate first defined field wins (lastModified before modifiedDate)');
// Unparseable first field falls through to next
eq(courseParser.pickFileDate({ lastModified: 'garbage', modifiedDate: '2025-01-01T00:00:00Z' }),
    Date.UTC(2025, 0, 1),
    'pickFileDate falls through unparseable field');

// courseLastModified: max of all files
eq(courseParser.courseLastModified([
    { lastModified: '2024-01-01T00:00:00Z' },
    { lastModified: '2024-06-01T00:00:00Z' },
    { lastModified: '2024-03-01T00:00:00Z' },
]), Date.UTC(2024, 5, 1), 'courseLastModified picks max across files');

// Mixed string + numeric epoch
eq(courseParser.courseLastModified([
    { lastModified: '2024-01-01T00:00:00Z' },
    { lastModified: Date.UTC(2024, 6, 1) }, // ms numeric
]), Date.UTC(2024, 6, 1), 'courseLastModified mixed string/number');

// Some files missing date → ignored, max of the rest returned
eq(courseParser.courseLastModified([
    { lastModified: '2024-01-01T00:00:00Z' },
    {},
    { lastModified: null },
]), Date.UTC(2024, 0, 1), 'courseLastModified ignores missing-date files');

// All files missing date → 0
eq(courseParser.courseLastModified([{}, { foo: 1 }, { lastModified: null }]), 0, 'courseLastModified all missing → 0');

// Empty / non-array → 0
eq(courseParser.courseLastModified([]), 0, 'courseLastModified empty → 0');
eq(courseParser.courseLastModified(null), 0, 'courseLastModified null → 0');
eq(courseParser.courseLastModified(undefined), 0, 'courseLastModified undefined → 0');

// ── Sort comparator ─────────────────────────────────────────────────────────
// Re-implement the comparator from the userscript so we can assert its
// behaviour without a DOM. Keep this in sync with applySortIfNeeded().
function makeComparator(mode) {
    const dir = mode === 'date-desc' ? -1 : 1;
    return (a, b) => {
        if (a.t === 0 && b.t === 0) return a.originalIdx - b.originalIdx;
        if (a.t === 0) return 1;
        if (b.t === 0) return -1;
        if (a.t !== b.t) return (a.t - b.t) * dir;
        return a.originalIdx - b.originalIdx;
    };
}

(function testSortComparator() {
    const items = [
        { name: 'A', t: Date.UTC(2024, 0, 1), originalIdx: 0 },
        { name: 'B', t: Date.UTC(2024, 5, 1), originalIdx: 1 },
        { name: 'C', t: 0,                    originalIdx: 2 }, // missing date
        { name: 'D', t: Date.UTC(2024, 2, 1), originalIdx: 3 },
        { name: 'E', t: 0,                    originalIdx: 4 }, // missing date
        { name: 'F', t: Date.UTC(2024, 5, 1), originalIdx: 5 }, // tie with B
    ];
    const desc = items.slice().sort(makeComparator('date-desc')).map(x => x.name);
    eq(desc, ['B', 'F', 'D', 'A', 'C', 'E'],
        'comparator desc: newest first; ties keep original order; missing dates pinned to tail (stable)');
    const asc = items.slice().sort(makeComparator('date-asc')).map(x => x.name);
    eq(asc, ['A', 'D', 'B', 'F', 'C', 'E'],
        'comparator asc: oldest first; ties keep original order; missing dates pinned to tail (stable)');
})();

// ── downloadHistory (pure helpers) ──────────────────────────────────────────
// summarizeCourseCompletion
eq(downloadHistory.summarizeCourseCompletion([]), { completedRowNames: [], allComplete: false },
    'summarizeCourseCompletion: empty tasks → nothing complete');
eq(downloadHistory.summarizeCourseCompletion([
    { rowName: 'A', status: 'done' },
    { rowName: 'A', status: 'skipped' },
    { rowName: 'B', status: 'done' },
    { rowName: 'B', status: 'pending' }, // never ran — batch was cancelled mid-course
]), { completedRowNames: ['A'], allComplete: false },
    'summarizeCourseCompletion: course B has a pending (cancelled) task → excluded; A fully done/skipped → included');
eq(downloadHistory.summarizeCourseCompletion([
    { rowName: 'A', status: 'done' },
    { rowName: 'B', status: 'skipped' },
]), { completedRowNames: ['A', 'B'], allComplete: true },
    'summarizeCourseCompletion: all tasks done/skipped across every row → allComplete true');
eq(downloadHistory.summarizeCourseCompletion([
    { rowName: 'A', status: 'done' },
    { rowName: 'A', status: 'failed' },
]), { completedRowNames: [], allComplete: false },
    'summarizeCourseCompletion: a failed task excludes its course and blocks allComplete');
eq(downloadHistory.summarizeCourseCompletion(null), { completedRowNames: [], allComplete: false },
    'summarizeCourseCompletion: non-array input → nothing complete');

// baselineFor
eq(downloadHistory.baselineFor('A', { A: 1000 }, 500), 1000, 'baselineFor: valid per-course timestamp wins over global');
eq(downloadHistory.baselineFor('B', { A: 1000 }, 500), 500, 'baselineFor: missing per-course entry falls back to global');
eq(downloadHistory.baselineFor('A', { A: 0 }, 500), 500, 'baselineFor: per-course zero is invalid, falls back to global');
eq(downloadHistory.baselineFor('A', { A: -5 }, 500), 500, 'baselineFor: per-course negative is invalid, falls back to global');
eq(downloadHistory.baselineFor('A', {}, 0), 0, 'baselineFor: neither per-course nor global valid → 0');
eq(downloadHistory.baselineFor('A', null, 500), 500, 'baselineFor: null map falls back to global');

// isUpdatedSince
eq(downloadHistory.isUpdatedSince(0, 100), false, 'isUpdatedSince: zero lastModified → false');
eq(downloadHistory.isUpdatedSince(100, 100), false, 'isUpdatedSince: equal timestamps → false (not strictly newer)');
eq(downloadHistory.isUpdatedSince(101, 100), true, 'isUpdatedSince: strictly newer → true');
eq(downloadHistory.isUpdatedSince(150, 0), false, 'isUpdatedSince: zero baseline (no history yet) → false');
eq(downloadHistory.isUpdatedSince(-5, 100), false, 'isUpdatedSince: negative lastModified → false');

// formatLocalDateTime — deterministic via a locally constructed Date (uses the
// test runner's own local timezone consistently for both input and expectation).
const sampleLocal = new Date(2024, 0, 5, 9, 3, 0); // 2024-01-05 09:03 local
eq(downloadHistory.formatLocalDateTime(sampleLocal.getTime()), '2024-01-05 09:03', 'formatLocalDateTime: pads month/day/hour/minute');
const sampleLocal2 = new Date(2024, 10, 21, 23, 59, 0); // 2024-11-21 23:59 local
eq(downloadHistory.formatLocalDateTime(sampleLocal2.getTime()), '2024-11-21 23:59', 'formatLocalDateTime: no padding needed case');
eq(downloadHistory.formatLocalDateTime(0), '—', 'formatLocalDateTime: zero → em dash');
eq(downloadHistory.formatLocalDateTime(-100), '—', 'formatLocalDateTime: negative → em dash');
eq(downloadHistory.formatLocalDateTime(NaN), '—', 'formatLocalDateTime: NaN → em dash');
eq(downloadHistory.formatLocalDateTime('not-a-number'), '—', 'formatLocalDateTime: non-number → em dash');

// pruneHistory
eq(downloadHistory.pruneHistory(null, 10), {}, 'pruneHistory: null map → empty object');
eq(downloadHistory.pruneHistory('x', 10), {}, 'pruneHistory: non-object map → empty object');
eq(downloadHistory.pruneHistory([1, 2, 3], 10), {}, 'pruneHistory: array map → empty object');
eq(downloadHistory.pruneHistory({ a: 100, b: -5, c: 'x', d: 0, e: 200 }, 10), { e: 200, a: 100 },
    'pruneHistory: drops non-positive/invalid entries, keeps valid ones (newest first)');
eq(downloadHistory.pruneHistory({ a: 100, b: 300, c: 200 }, 2), { b: 300, c: 200 },
    'pruneHistory: caps at N, keeping the newest timestamps and dropping the oldest');
eq(downloadHistory.pruneHistory({ a: 100, b: 300, c: 200 }, 0), {}, 'pruneHistory: cap of zero retains no entries');
eq(downloadHistory.pruneHistory({ a: 1, b: 2 }), { b: 2, a: 1 }, 'pruneHistory: default cap (3000) keeps entries when under the limit');
eq(downloadHistory.pruneHistory({ a: 5 }, 'nope'), { a: 5 }, 'pruneHistory: invalid cap parameter falls back to default 3000');

// mergePersistedHistory — the cross-tab merge run inside the history Web Lock.
// `persisted` is always the state re-read from storage inside the lock, never the
// in-memory snapshot taken at boot; `batch` describes only the batch that just
// finished in this tab.
eq(downloadHistory.mergePersistedHistory(
    { globalTs: 500, perCourse: { A: 400, B: 450 } },
    { completedRowNames: ['A'], startedAt: 900, advanceGlobal: true }),
    { globalTs: 900, perCourse: { A: 900, B: 450 } },
    'mergePersistedHistory: advances the batch row and the global, keeps unrelated course keys');

eq(downloadHistory.mergePersistedHistory(
    { globalTs: 500, perCourse: { A: 400, B: 450 } },
    { completedRowNames: ['A'], startedAt: 900, advanceGlobal: false }),
    { globalTs: 500, perCourse: { A: 900, B: 450 } },
    'mergePersistedHistory: advanceGlobal false leaves the global timestamp untouched');

eq(downloadHistory.mergePersistedHistory(
    { globalTs: 2000, perCourse: { A: 1500 } },
    { completedRowNames: ['A'], startedAt: 900, advanceGlobal: true }),
    { globalTs: 2000, perCourse: { A: 1500 } },
    'mergePersistedHistory: monotonic — an older batch never regresses a newer persisted value');

// Another tab wrote B while this tab was busy; this tab must not erase it.
eq(downloadHistory.mergePersistedHistory(
    { globalTs: 0, perCourse: { B: 700 } },
    { completedRowNames: ['A'], startedAt: 900, advanceGlobal: false }),
    { globalTs: 0, perCourse: { A: 900, B: 700 } },
    'mergePersistedHistory: preserves a key written by another tab after this tab booted');

// Another tab reset history mid-batch: storage is empty, so only this batch's
// rows come back — stale in-memory-only keys must never be resurrected.
eq(downloadHistory.mergePersistedHistory(
    { globalTs: 0, perCourse: {} },
    { completedRowNames: ['A'], startedAt: 900, advanceGlobal: true }),
    { globalTs: 900, perCourse: { A: 900 } },
    'mergePersistedHistory: a reset performed by another tab is not resurrected');

eq(downloadHistory.mergePersistedHistory(
    { globalTs: -1, perCourse: { A: 'x', B: 0, C: 300 } },
    { completedRowNames: ['A'], startedAt: 900, advanceGlobal: true }),
    { globalTs: 900, perCourse: { A: 900, C: 300 } },
    'mergePersistedHistory: prunes malformed persisted entries and normalizes an invalid global');

eq(downloadHistory.mergePersistedHistory(
    { globalTs: 'nope', perCourse: 'not-a-map' },
    { completedRowNames: ['A', '', null, 'B'], startedAt: 900, advanceGlobal: true }),
    { globalTs: 900, perCourse: { A: 900, B: 900 } },
    'mergePersistedHistory: malformed persisted shapes degrade to defaults; blank row names ignored');

eq(downloadHistory.mergePersistedHistory(
    { globalTs: 500, perCourse: { A: 400 } },
    { completedRowNames: ['A'], startedAt: 0, advanceGlobal: true }),
    { globalTs: 500, perCourse: { A: 400 } },
    'mergePersistedHistory: an invalid startedAt records nothing and never advances the global');

eq(downloadHistory.mergePersistedHistory(
    { globalTs: 500, perCourse: { A: 400 } },
    { completedRowNames: [], startedAt: 900, advanceGlobal: true }),
    { globalTs: 900, perCourse: { A: 400 } },
    'mergePersistedHistory: a fully-successful empty-row batch still advances the global');

eq(downloadHistory.mergePersistedHistory(
    { globalTs: 100, perCourse: { A: 100, B: 300, C: 200 } },
    { completedRowNames: ['D'], startedAt: 900, advanceGlobal: true, cap: 2 }),
    { globalTs: 900, perCourse: { D: 900, B: 300 } },
    'mergePersistedHistory: honours the entry cap, keeping the newest timestamps');

eq(downloadHistory.mergePersistedHistory(null, null),
    { globalTs: 0, perCourse: {} },
    'mergePersistedHistory: null inputs degrade to empty state');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
