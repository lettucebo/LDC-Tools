// ==UserScript==
// @name         LDC Batch Downloader
// @name:zh-TW   LDC 批次下載
// @namespace    https://github.com/lettucebo/TampermonkeyScripts
// @version      0.9.0
// @description  Batch-download multiple courses from Microsoft Learning Download Center into a chosen folder, organized as "{code} {title}/{code}-{language}/".
// @description:zh-TW 在 Microsoft Learning Download Center 一次勾選多門課程並批次下載到指定資料夾，自動依「{課程編號} {課程名稱}/{課程編號}-{語言}/」結構整理
// @author       lettucebo
// @match        https://learningdownloadcenter.microsoft.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=microsoft.com
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_info
// @license      MIT
// @homepageURL  https://github.com/lettucebo/TampermonkeyScripts/tree/main/scripts/ldc-batch-download
// @supportURL   https://github.com/lettucebo/TampermonkeyScripts/issues
// @updateURL    https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ldc-batch-download/ldc-batch-download.user.js
// @downloadURL  https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ldc-batch-download/ldc-batch-download.user.js
// ==/UserScript==

/* eslint-disable no-undef */
(() => {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // 0. Constants
    // ─────────────────────────────────────────────────────────────────────────

    const APP_ID = 'ldc-batch-downloader';
    const LOCK_NAME = 'ldc-batch-download';
    const HISTORY_LOCK_NAME = 'ldc-download-history';
    const IDB_NAME = 'ldc-batch-downloader';
    const IDB_STORE = 'state';
    const IDB_KEY_ROOT_HANDLE = 'rootDirHandle';
    const DEFAULT_CONCURRENCY = 2;
    const MAX_CONCURRENCY = 4;
    const MAX_FILENAME_LEN = 150;
    const RETRY_DELAYS_MS = [1000, 3000, 9000];
    const TOKEN_REFRESH_MARGIN_SEC = 60;
    const TOKEN_REFRESH_TIMEOUT_MS = 30000;
    const SCRIPT_VERSION = (typeof GM_info !== 'undefined' && GM_info && GM_info.script && GM_info.script.version) || '0.9.0';
    const SCRIPT_AUTHOR = 'Money Yu';
    const HISTORY_MAX_ENTRIES = 3000;
    const HISTORY_LOCK_TIMEOUT_MS = 10000;
    const LAST_DOWNLOAD_AT_KEY = 'ldc.lastDownloadAt';
    const COURSE_DOWNLOADS_KEY = 'ldc.courseDownloads';

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Token interception (must run synchronously at document-start)
    // ─────────────────────────────────────────────────────────────────────────

    const tokenInterceptor = (() => {
        let currentToken = null;
        let tokenChangedListeners = [];
        let resolveReady;
        const tokenReady = new Promise((r) => { resolveReady = r; });

        function setToken(t) {
            if (!t || t === currentToken) return;
            const wasNull = currentToken === null;
            currentToken = t;
            if (wasNull) try { console.info('[LDC] auth token captured'); } catch (_) {}
            if (resolveReady) { resolveReady(t); resolveReady = null; }
            tokenChangedListeners.forEach((fn) => { try { fn(t); } catch (_) {} });
        }

        function isApiUrl(u) {
            try {
                const url = new URL(u, location.href);
                return url.host === location.host && url.pathname.startsWith('/api/');
            } catch (_) { return false; }
        }

        function extractFromHeaders(headers) {
            if (!headers) return null;
            try {
                if (headers instanceof Headers) {
                    return headers.get('Authorization') || headers.get('authorization');
                }
                if (Array.isArray(headers)) {
                    const m = headers.find(([k]) => String(k).toLowerCase() === 'authorization');
                    return m ? m[1] : null;
                }
                if (typeof headers === 'object') {
                    for (const k of Object.keys(headers)) {
                        if (k.toLowerCase() === 'authorization') return headers[k];
                    }
                }
            } catch (_) {}
            return null;
        }

        function install() {
            if (install.__ldcInstalled) return;
            install.__ldcInstalled = true;
            const w = unsafeWindow;
            // Hook fetch
            const origFetch = w.fetch;
            if (origFetch && !origFetch.__ldcWrapped) {
                const wrapped = function (input, init) {
                    try {
                        const url = (typeof input === 'string') ? input : (input && input.url);
                        if (isApiUrl(url)) {
                            let auth = null;
                            if (init && init.headers) auth = extractFromHeaders(init.headers);
                            if (!auth && input && input.headers) auth = extractFromHeaders(input.headers);
                            if (auth && auth.startsWith('Bearer ')) setToken(auth.slice('Bearer '.length));
                        }
                    } catch (_) {}
                    // Bind explicitly to unsafeWindow rather than dynamic `this` so the
                    // wrapper works the same when called as a free function or as a method.
                    return origFetch.call(w, input, init);
                };
                wrapped.__ldcWrapped = true;
                w.fetch = wrapped;
            }
            // Hook XHR.open + setRequestHeader (defensive — site uses fetch but be safe)
            const XHRProto = w.XMLHttpRequest && w.XMLHttpRequest.prototype;
            if (XHRProto && !XHRProto.setRequestHeader.__ldcWrapped) {
                const origOpen = XHRProto.open;
                const origSet = XHRProto.setRequestHeader;
                if (!origOpen.__ldcWrapped) {
                    const wrappedOpen = function (method, url) {
                        this.__ldcUrl = url;
                        return origOpen.apply(this, arguments);
                    };
                    wrappedOpen.__ldcWrapped = true;
                    XHRProto.open = wrappedOpen;
                }
                const wrappedSet = function (name, value) {
                    try {
                        if (String(name).toLowerCase() === 'authorization' &&
                            isApiUrl(this.__ldcUrl) &&
                            typeof value === 'string' && value.startsWith('Bearer ')) {
                            setToken(value.slice('Bearer '.length));
                        }
                    } catch (_) {}
                    return origSet.apply(this, arguments);
                };
                wrappedSet.__ldcWrapped = true;
                XHRProto.setRequestHeader = wrappedSet;
            }
        }

        function decodeJwtExp(token) {
            try {
                const parts = (token || '').split('.');
                if (parts.length < 2) return null;
                // JWE (5 parts) cannot be decoded client-side; treat as opaque
                if (parts.length === 5) return null;
                const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                return typeof payload.exp === 'number' ? payload.exp : null;
            } catch (_) { return null; }
        }

        async function awaitFreshToken({ marginSec = TOKEN_REFRESH_MARGIN_SEC, timeoutMs = TOKEN_REFRESH_TIMEOUT_MS } = {}) {
            await tokenReady;
            const exp = decodeJwtExp(currentToken);
            if (exp === null) return currentToken; // opaque (JWE) — let server tell us via 401
            const nowSec = Math.floor(Date.now() / 1000);
            if (exp - nowSec > marginSec) return currentToken;

            // Token is near-expiry. Wait for a new token to arrive (SPA refresh).
            const tokenAtStart = currentToken;
            return new Promise((resolve, reject) => {
                const t0 = Date.now();
                let done = false;
                let timer;
                const cleanup = () => {
                    if (done) return;
                    done = true;
                    tokenChangedListeners = tokenChangedListeners.filter((f) => f !== onChange);
                    clearInterval(timer);
                };
                const onChange = (newToken) => {
                    if (done || !newToken || newToken === tokenAtStart) return;
                    cleanup();
                    resolve(newToken);
                };
                tokenChangedListeners.push(onChange);
                timer = setInterval(() => {
                    if (done) return;
                    if (Date.now() - t0 > timeoutMs) {
                        cleanup();
                        reject(new TokenExpiredError('Auth token near expiry and no refresh seen. Please reload the page.'));
                    }
                }, 500);
            });
        }

        return { install, get currentToken() { return currentToken; }, tokenReady, awaitFreshToken, decodeJwtExp };
    })();

    // Install hooks IMMEDIATELY — before SPA bundle runs.
    tokenInterceptor.install();

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Custom error types
    // ─────────────────────────────────────────────────────────────────────────

    class HttpError extends Error {
        constructor(message, { status, kind, retryAfterSec } = {}) {
            super(message);
            this.name = 'HttpError';
            this.status = status;
            this.kind = kind;
            this.retryAfterSec = retryAfterSec;
        }
    }
    class TokenExpiredError extends Error {
        constructor(message) { super(message); this.name = 'TokenExpiredError'; }
    }
    class FsaPermissionError extends Error {
        constructor(message) { super(message); this.name = 'FsaPermissionError'; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. API client
    // ─────────────────────────────────────────────────────────────────────────

    const api = (() => {
        async function authHeaders() {
            await tokenInterceptor.tokenReady;
            const t = tokenInterceptor.currentToken;
            if (!t) throw new TokenExpiredError('No auth token captured yet. Please wait or reload the page.');
            return { Authorization: `Bearer ${t}` };
        }

        function classifyResponse(resp) {
            const status = resp.status;
            if (status === 401) return new HttpError('Unauthorized', { status, kind: '401' });
            if (status === 403) return new HttpError('Forbidden', { status, kind: '403' });
            if (status === 429) {
                const ra = parseInt(resp.headers.get('retry-after') || '0', 10) || null;
                return new HttpError('Rate limited', { status, kind: '429', retryAfterSec: ra });
            }
            if (status >= 500 && status < 600) return new HttpError(`Server error ${status}`, { status, kind: '5xx' });
            return new HttpError(`HTTP ${status}`, { status, kind: 'http' });
        }

        async function getSearchTree(signal) {
            const headers = await authHeaders();
            const resp = await unsafeWindow.fetch('/api/search', { headers, signal, credentials: 'include' });
            if (!resp.ok) throw classifyResponse(resp);
            return resp.json();
        }

        async function downloadStream(blobPath, versionId, signal) {
            await tokenInterceptor.awaitFreshToken();
            const headers = await authHeaders();
            const params = new URLSearchParams();
            params.set('blobPath', blobPath);
            if (versionId) params.set('versionId', versionId);
            const url = `/api/download?${params.toString()}`;
            let resp;
            try {
                resp = await unsafeWindow.fetch(url, { headers, signal, credentials: 'include' });
            } catch (e) {
                if (e && e.name === 'AbortError') throw e;
                throw new HttpError(`Network error: ${e && e.message}`, { kind: 'network' });
            }
            if (!resp.ok) {
                // Drain body so connection isn't held
                try { await resp.body?.cancel(); } catch (_) {}
                throw classifyResponse(resp);
            }
            return resp;
        }

        return { getSearchTree, downloadStream };
    })();

    // ─────────────────────────────────────────────────────────────────────────
    // 4. courseParser (pure)
    // ─────────────────────────────────────────────────────────────────────────

    const courseParser = (() => {
        // Split "AZ-040T00: Automate Administration with PowerShell (Japanese)"
        // → { code, title, languageHint }
        // The returned `code` has any trailing T00 / T00A / T00B / ... stripped (see
        // simplifyCourseCode below). This is intentional — the API row name
        // (`AZ-040T00: ...`) is still used verbatim as the lookup map key and
        // selection state's stable ID; only the surfaced `code` is simplified so
        // that downstream consumers (folder names) get the cleaner form.
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

        // Strip Microsoft Official Curriculum version suffix: T00, T00A, T00B, ...
        // The `T00` is the original release, `T00<letter>` are revisions. The user
        // organises folders without this suffix (e.g. `AZ-040` rather than
        // `AZ-040T00`), so we surface the simplified form.
        // - Only `T00` family is stripped (per spec); T01, T02, L100 are left as-is.
        // - A trailing dash is trimmed for the rare `XX-T00` case so we don't
        //   leave a lone `XX-`.
        function simplifyCourseCode(code) {
            if (!code || typeof code !== 'string') return code;
            return code.replace(/T00[A-Z]?$/, '').replace(/-$/, '');
        }

        // file.language examples: "Japanese (ja-jp)", "English", "Chinese Simplified (zh-cn)"
        function resolveLanguage(file) {
            const raw = file && file.language;
            if (!raw) return 'Unknown';
            const m = raw.match(/^(.*?)\s*\([a-z]{2,3}-[a-z]{2,4}\)\s*$/i);
            return (m ? m[1] : raw).trim();
        }

        // Take a blob URL like "Azure/AZ-040T00: Automate Administration with PowerShell (Japanese)/file.zip"
        // and return the canonical course folder name from the second segment, with ": " → " ".
        // The code component is also run through simplifyCourseCode via parseRowName.
        function canonicalCourseDirName(blobUrl) {
            if (!blobUrl) return '';
            const segs = String(blobUrl).split('/');
            // Use second-to-last directory if multi-level, else first segment.
            // Typical structure: <category>/<courseRow>/<file>
            if (segs.length < 2) return segs[0] || '';
            const courseSeg = segs[segs.length - 2]; // the directory containing the file
            const { code, title } = parseRowName(courseSeg);
            if (code) return title ? `${code} ${title}` : code;
            return courseSeg.replace(/:\s*/g, ' ');
        }

        // Parse a date value coming from the LDC API into epoch milliseconds.
        // Accepts: ISO-ish strings, numeric epoch (sec or ms), Date instances.
        // Returns 0 for missing / unparseable inputs (caller treats 0 as "no date").
        function parseDate(value) {
            if (value === null || value === undefined || value === '') return 0;
            if (value instanceof Date) {
                const t = value.getTime();
                return Number.isFinite(t) ? t : 0;
            }
            if (typeof value === 'number' && Number.isFinite(value)) {
                // Heuristic: < 10^12 → seconds (epoch_s), else ms. 10^12 ms is year 2001,
                // 10^12 s is year 33658, so the boundary safely separates the two.
                return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
            }
            if (typeof value === 'string') {
                const s = value.trim();
                if (!s) return 0;
                // Pure-digit string → treat as numeric epoch.
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

        // Pick the "best" date field from a file object. The LDC API field name has
        // varied (lastModified / modifiedDate / lastUpdated / updateDate / publishDate),
        // so we probe a list of candidates and return the first one that parses.
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

        // Aggregate a course row's "last updated" timestamp from its files.
        // Returns the max parsed epoch_ms across files, or 0 if none parse.
        // This intentionally mirrors the value the LDC SPA shows in its
        // "Updated: <date>" badge next to each course row, so sorting matches
        // what the user already sees in the page.
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

    // ─────────────────────────────────────────────────────────────────────────
    // 5. pathSanitizer (pure)
    // ─────────────────────────────────────────────────────────────────────────

    const pathSanitizer = (() => {
        const WIN_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
        const ILLEGAL = /[<>:"/\\|?*\x00-\x1F\x7F-\x9F]/g;
        const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

        function shortHash(s) {
            // FNV-1a 32-bit, base36, 8 chars max (deterministic, no crypto needed)
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
                // Split at last dot (if it's an extension worth preserving)
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

        function buildRelPath(parent, sub, fileName) {
            return [parent, sub, fileName].map(sanitizeSegment);
        }

        return { sanitizeSegment, buildRelPath, shortHash };
    })();

    // ─────────────────────────────────────────────────────────────────────────
    // 6. tree (build lookup from /api/search response)
    // ─────────────────────────────────────────────────────────────────────────

    const treeIndex = (() => {
        // Returns Map<rowName, { rowName, files, courseCode, courseTitle, languageHint, parentDirName, lastModified }>
        function buildLookup(searchTree) {
            const map = new Map();
            if (!Array.isArray(searchTree)) return map;
            let withDate = 0;
            for (const cat of searchTree) {
                const catDirs = (cat && cat.directories) || [];
                for (const node of catDirs) {
                    if (!node || !node.name) continue;
                    const files = Array.isArray(node.files) ? node.files : [];
                    if (files.length === 0) continue;
                    const { code, title, languageHint } = courseParser.parseRowName(node.name);
                    // Canonical course dir name from blob path of first file (more reliable than DOM title).
                    let parentDirName = code && title ? `${code} ${title}` : (node.name || '').replace(/:\s*/g, ' ');
                    if (files[0] && files[0].url) {
                        const fromBlob = courseParser.canonicalCourseDirName(files[0].url);
                        if (fromBlob) parentDirName = fromBlob;
                    }
                    const lastModified = courseParser.courseLastModified(files);
                    if (lastModified > 0) withDate++;
                    map.set(node.name, {
                        rowName: node.name,
                        files,
                        courseCode: code,
                        courseTitle: title,
                        languageHint,
                        parentDirName,
                        lastModified,
                    });
                }
            }
            if (map.size > 0 && withDate === 0) {
                // Surface a hint via console only — the boot path will also
                // disable the sort dropdown and warn there. This earlier warn
                // is kept for cases where buildLookup is called outside of
                // the boot flow (e.g. via window.__ldc.api.getSearchTree).
                try { console.warn('[LDC] No date metadata found on any course file; sort-by-updated will be disabled.'); } catch (_) {}
            }
            return map;
        }

        function classifyAriaRow(label, lookup) {
            // aria-label e.g. "Toggle AZ-040T00: ... directory" or "Toggle Azure directory"
            const m = String(label || '').match(/^Toggle (.+) directory$/);
            if (!m) return { kind: 'unknown', name: null };
            const name = m[1];
            if (lookup.has(name)) return { kind: 'course', name };
            return { kind: 'category', name };
        }

        return { buildLookup, classifyAriaRow };
    })();

    // ─────────────────────────────────────────────────────────────────────────
    // 7. IndexedDB storage (FileSystemDirectoryHandle persistence)
    // ─────────────────────────────────────────────────────────────────────────

    const idb = (() => {
        function open() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(IDB_NAME, 1);
                req.onupgradeneeded = () => {
                    req.result.createObjectStore(IDB_STORE);
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        function promisifyRequest(req) {
            return new Promise((resolve, reject) => {
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        // Run an op against the object store inside a transaction, then close
        // the underlying connection. Without this `close()` we leak an IndexedDB
        // connection on every invocation.
        async function withDb(mode, op) {
            const db = await open();
            try {
                const tx = db.transaction(IDB_STORE, mode);
                const store = tx.objectStore(IDB_STORE);
                const result = await op(store);
                await new Promise((resolve, reject) => {
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                    tx.onabort = () => reject(tx.error || new Error('IDB transaction aborted'));
                });
                return result;
            } finally {
                try { db.close(); } catch (_) {}
            }
        }
        async function get(key)        { return withDb('readonly',  (s) => promisifyRequest(s.get(key))); }
        async function set(key, value) { return withDb('readwrite', (s) => promisifyRequest(s.put(value, key))); }
        async function del(key)        { return withDb('readwrite', (s) => promisifyRequest(s.delete(key))); }
        return { get, set, del };
    })();

    // ─────────────────────────────────────────────────────────────────────────
    // 8. FSA writer
    // ─────────────────────────────────────────────────────────────────────────

    const fsaWriter = (() => {
        let cachedRoot = null;

        async function loadCachedRoot() {
            if (cachedRoot) return cachedRoot;
            try {
                const h = await idb.get(IDB_KEY_ROOT_HANDLE);
                if (h && typeof h.queryPermission === 'function') cachedRoot = h;
            } catch (_) {}
            return cachedRoot;
        }

        async function queryPermission(handle) {
            try { return await handle.queryPermission({ mode: 'readwrite' }); }
            catch (_) { return 'denied'; }
        }

        // Must be called from a user-gesture handler.
        async function pickRoot() {
            if (!('showDirectoryPicker' in window)) {
                throw new FsaPermissionError('Your browser does not support File System Access API. Use Chrome, Edge, or another Chromium-based browser.');
            }
            const handle = await unsafeWindow.showDirectoryPicker({ id: 'ldc-root', mode: 'readwrite', startIn: 'documents' });
            cachedRoot = handle;
            try { await idb.set(IDB_KEY_ROOT_HANDLE, handle); } catch (_) {}
            return handle;
        }

        // Must be called from a user-gesture handler if permission is 'prompt'/'denied'.
        async function ensurePermission(handle) {
            if (!handle) throw new FsaPermissionError('No folder selected.');
            const p1 = await queryPermission(handle);
            if (p1 === 'granted') return true;
            try {
                const p2 = await handle.requestPermission({ mode: 'readwrite' });
                if (p2 === 'granted') return true;
                throw new FsaPermissionError('Permission to write to selected folder was not granted.');
            } catch (e) {
                if (e instanceof FsaPermissionError) throw e;
                throw new FsaPermissionError(`Could not request folder permission: ${e && e.message}`);
            }
        }

        async function getDirHandle(rootHandle, segments) {
            let dir = rootHandle;
            for (const seg of segments) {
                const safe = pathSanitizer.sanitizeSegment(seg);
                try { dir = await dir.getDirectoryHandle(safe, { create: true }); }
                catch (e) {
                    if (e && e.name === 'NotAllowedError') throw new FsaPermissionError('Folder permission was revoked. Please choose the folder again.');
                    const msg = e && e.message ? e.message : String(e);
                    throw new Error(`${msg} (segment: ${JSON.stringify(safe)})`);
                }
            }
            return dir;
        }

        async function existingFileSize(dirHandle, fileName) {
            const safe = pathSanitizer.sanitizeSegment(fileName);
            try {
                const fh = await dirHandle.getFileHandle(safe);
                const f = await fh.getFile();
                return f.size;
            } catch (e) {
                if (e && (e.name === 'NotFoundError' || e.name === 'NotAllowedError')) return null;
                return null;
            }
        }

        async function writeStream(dirHandle, fileName, response, signal, onProgress) {
            const safe = pathSanitizer.sanitizeSegment(fileName);
            let fh;
            try { fh = await dirHandle.getFileHandle(safe, { create: true }); }
            catch (e) {
                if (e && e.name === 'NotAllowedError') throw new FsaPermissionError('Folder permission was revoked. Please choose the folder again.');
                const msg = e && e.message ? e.message : String(e);
                throw new Error(`${msg} (segment: ${JSON.stringify(safe)})`);
            }
            const writable = await fh.createWritable();
            try {
                if (response.body && typeof response.body.getReader === 'function' && onProgress) {
                    const reader = response.body.getReader();
                    let received = 0;
                    try {
                        while (true) {
                            if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
                            const { done, value } = await reader.read();
                            if (done) break;
                            await writable.write(value);
                            received += value.byteLength;
                            try { onProgress(received); } catch (_) {}
                        }
                    } finally {
                        // Releasing the reader is essential when the loop exits via abort
                        // — otherwise the body remains locked and the connection cannot
                        // be reused or garbage-collected.
                        try { reader.releaseLock(); } catch (_) {}
                    }
                } else if (response.body && response.body.pipeTo) {
                    // pipeTo automatically calls writable.close() when the source closes,
                    // and writable.abort() if the source errors, so we can return without
                    // an explicit close here.
                    await response.body.pipeTo(writable, { signal });
                    return;
                } else {
                    const blob = await response.blob();
                    await writable.write(blob);
                }
                await writable.close();
            } catch (e) {
                try { await writable.abort(); } catch (_) {}
                throw e;
            }
        }

        async function clearCachedRoot() {
            cachedRoot = null;
            try { await idb.del(IDB_KEY_ROOT_HANDLE); } catch (_) {}
        }

        return { loadCachedRoot, queryPermission, pickRoot, ensurePermission, getDirHandle, existingFileSize, writeStream, clearCachedRoot, get cachedRoot() { return cachedRoot; } };
    })();

    // ─────────────────────────────────────────────────────────────────────────
    // 9. Selection store (stable IDs)
    // ─────────────────────────────────────────────────────────────────────────

    const selection = (() => {
        const set = new Set();
        const listeners = new Set();
        function notify() { for (const l of listeners) { try { l(); } catch (_) {} } }
        function rowId(rowName) { return rowName; } // rowName is unique enough
        return {
            has: (id) => set.has(id),
            add: (id) => { if (!set.has(id)) { set.add(id); notify(); } },
            addMany: (ids) => {
                let changed = false;
                for (const id of ids) {
                    if (!set.has(id)) { set.add(id); changed = true; }
                }
                if (changed) notify();
            },
            remove: (id) => { if (set.has(id)) { set.delete(id); notify(); } },
            toggle: (id) => { if (set.has(id)) set.delete(id); else set.add(id); notify(); },
            clear: () => { if (set.size) { set.clear(); notify(); } },
            ids: () => [...set],
            size: () => set.size,
            onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
            rowId,
        };
    })();

    // ─────────────────────────────────────────────────────────────────────────
    // 10. downloadHistory (last-download tracking; pure helpers + GM storage)
    // ─────────────────────────────────────────────────────────────────────────

    const downloadHistory = (() => {
        let globalTs = 0;      // ms epoch of the last fully-successful batch, or 0
        let perCourse = {};    // rowName → ms epoch of last completion for that course

        function isPositiveFiniteNumber(v) {
            return typeof v === 'number' && Number.isFinite(v) && v > 0;
        }
        function isValidCap(v) {
            return typeof v === 'number' && Number.isFinite(v) && v >= 0;
        }

        // Groups tasks by rowName; a course "completes" only when every one of its
        // tasks is done or skipped. Courses with any pending/downloading/retrying/
        // failed task (e.g. left behind by a cancel or a paused queue) are excluded.
        // allComplete additionally requires a non-empty task list where every task
        // (across all courses) is done or skipped.
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

        // Baseline used for the "updated since" predicate: a valid per-course
        // timestamp wins, otherwise the valid global timestamp, otherwise 0
        // (meaning "no baseline yet" — nothing should be considered updated).
        function baselineFor(rowName, map, gTs) {
            const perCourseTs = map && typeof map === 'object' ? map[rowName] : undefined;
            if (isPositiveFiniteNumber(perCourseTs)) return perCourseTs;
            if (isPositiveFiniteNumber(gTs)) return gTs;
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

        // Retains only valid positive-timestamp entries, newest first, capped at `cap`
        // (default HISTORY_MAX_ENTRIES). Any non-plain-object map (null, string, array,
        // etc.) is treated as malformed and yields an empty object.
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

        // Merges one finished batch into the persisted state. `persisted` must be the
        // state re-read from storage inside the history lock — never the in-memory
        // snapshot taken at boot, otherwise another tab's reset or newer writes would
        // be resurrected/clobbered. Only `batch.completedRowNames` are touched; every
        // other persisted key is carried over untouched, and every write is monotonic
        // (Math.max), so a slow tab finishing an older batch can never regress history.
        // The global timestamp advances only when `batch.advanceGlobal` is true.
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

        function hasGM() {
            return typeof GM !== 'undefined' && GM && typeof GM.getValue === 'function' && typeof GM.setValue === 'function';
        }

        // Serializes history read-modify-write cycles across tabs. Web Locks are
        // origin-scoped, so two tabs finishing batches at the same moment take turns
        // instead of overwriting each other. Degrades to an unlocked run when the Lock
        // Manager is missing or refuses the request (single-tab behaviour is identical).
        // The wait is bounded: a wedged holder must never leave the caller — and with
        // it the post-download UI — hanging. On timeout the merge still re-reads
        // storage first, so only the cross-tab atomicity is lost.
        async function withHistoryLock(fn) {
            const locks = (typeof navigator !== 'undefined' && navigator.locks
                && typeof navigator.locks.request === 'function') ? navigator.locks : null;
            if (!locks) return fn();
            let opts = {};
            try {
                if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
                    opts = { signal: AbortSignal.timeout(HISTORY_LOCK_TIMEOUT_MS) };
                }
            } catch (_) { opts = {}; }
            let entered = false;
            try {
                return await locks.request(HISTORY_LOCK_NAME, opts, async () => { entered = true; return fn(); });
            } catch (e) {
                if (entered) throw e; // the callback itself failed — never run it twice
                return fn();
            }
        }

        // Reads the authoritative state for a merge. With GM storage present that is
        // the freshly re-read persisted pair; without it there is no shared state, so
        // the in-memory values are authoritative. Returns null when storage exists but
        // cannot be read — the caller then skips the write rather than risk persisting
        // a truncated map (fail closed: history stays stale, never falsely advanced).
        async function readAuthoritative() {
            if (!hasGM()) return { globalTs, perCourse, stored: false };
            try {
                const g = await GM.getValue(LAST_DOWNLOAD_AT_KEY, 0);
                const m = await GM.getValue(COURSE_DOWNLOADS_KEY, {});
                return { globalTs: g, perCourse: m, stored: true };
            } catch (_) { return null; }
        }

        // Loads persisted state from GM storage. Safe when GM is missing/broken —
        // falls back to defaults (global=0, perCourse={}) in every failure path.
        async function load() {
            globalTs = 0;
            perCourse = {};
            if (!hasGM()) return;
            try {
                const g = await GM.getValue(LAST_DOWNLOAD_AT_KEY, 0);
                globalTs = isPositiveFiniteNumber(g) ? g : 0;
            } catch (_) { globalTs = 0; }
            try {
                const m = await GM.getValue(COURSE_DOWNLOADS_KEY, {});
                perCourse = pruneHistory(m, HISTORY_MAX_ENTRIES);
            } catch (_) { perCourse = {}; }
        }

        // Records one finished batch as a single atomic operation: acquire the history
        // lock, re-read storage, merge only this batch's rows, persist, then adopt the
        // merged result as the new in-memory state. Never throws — a storage failure
        // leaves history untouched rather than aborting the caller's success path.
        async function recordBatch(completedRowNames, startedAt, advanceGlobal) {
            try {
                await withHistoryLock(async () => {
                    const current = await readAuthoritative();
                    if (!current) return;
                    const merged = mergePersistedHistory(current, {
                        completedRowNames, startedAt, advanceGlobal, cap: HISTORY_MAX_ENTRIES,
                    });
                    if (current.stored) {
                        // Per-course map first: if the second write fails, the global stays
                        // behind, which only ever under-reports "synced" — never over-reports.
                        try { await GM.setValue(COURSE_DOWNLOADS_KEY, merged.perCourse); } catch (_) {}
                        try { await GM.setValue(LAST_DOWNLOAD_AT_KEY, merged.globalTs); } catch (_) {}
                    }
                    globalTs = merged.globalTs;
                    perCourse = merged.perCourse;
                });
            } catch (_) {}
        }

        // Resets both keys back to their defaults (0 / {}) — no new GM grant needed,
        // reuses the existing GM.setValue grant. Held under the same lock as
        // recordBatch so a concurrent batch can never half-resurrect the cleared state.
        async function reset() {
            try {
                await withHistoryLock(async () => {
                    if (hasGM()) {
                        try { await GM.setValue(COURSE_DOWNLOADS_KEY, {}); } catch (_) {}
                        try { await GM.setValue(LAST_DOWNLOAD_AT_KEY, 0); } catch (_) {}
                    }
                    globalTs = 0;
                    perCourse = {};
                });
            } catch (_) {}
        }

        function getGlobal() { return globalTs; }
        function getPerCourseMap() { return perCourse; }
        function getBaseline(rowName) { return baselineFor(rowName, perCourse, globalTs); }
        function trackedCourseCount() { return Object.keys(perCourse).length; }

        return {
            summarizeCourseCompletion, baselineFor, isUpdatedSince, formatLocalDateTime, pruneHistory,
            mergePersistedHistory,
            load, recordBatch, reset,
            getGlobal, getPerCourseMap, getBaseline, trackedCourseCount,
        };
    })();

    // ─────────────────────────────────────────────────────────────────────────
    // 11. Orchestrator (queue + retry + checkpoint)
    // ─────────────────────────────────────────────────────────────────────────

    const orchestrator = (() => {
        let abortController = null;
        let running = false;
        let listeners = new Set();
        let state = null;
        let concurrencyOverride = null;

        function emit(event) {
            for (const l of listeners) { try { l(event); } catch (_) {} }
        }

        function buildPlan(selectedRowNames, lookup) {
            const tasks = [];
            for (const rowName of selectedRowNames) {
                const node = lookup.get(rowName);
                if (!node) {
                    try { console.warn('[LDC] selected row not found in API tree:', rowName); } catch (_) {}
                    continue;
                }
                const language = node.languageHint || courseParser.resolveLanguage(node.files[0] || {});
                const subDirName = node.courseCode ? `${node.courseCode}-${language}` : language;
                for (const f of node.files) {
                    const fileLang = courseParser.resolveLanguage(f) || language;
                    const fileSub = node.courseCode ? `${node.courseCode}-${fileLang}` : fileLang;
                    tasks.push({
                        id: `${rowName}::${f.name}`,
                        rowName,
                        courseCode: node.courseCode,
                        parentDir: node.parentDirName,
                        subDir: fileSub,
                        fileName: f.name,
                        blobPath: f.url,
                        versionId: f.versionId,
                        size: f.size || 0,
                        status: 'pending', // pending | downloading | retrying | skipped | failed | done
                        bytes: 0,
                        attempts: 0,
                        error: null,
                    });
                }
            }
            return tasks;
        }

        function totalBytes(tasks) {
            return tasks.reduce((a, t) => a + (t.size || 0), 0);
        }

        async function runTask(task, rootHandle, signal) {
            task.status = 'downloading';
            task.attempts += 1;
            emit({ type: 'task-start', task });
            const dir = await fsaWriter.getDirHandle(rootHandle, [task.parentDir, task.subDir]);
            // Skip-existing check
            const existing = await fsaWriter.existingFileSize(dir, task.fileName);
            if (existing !== null && task.size > 0 && existing === task.size) {
                task.status = 'skipped';
                task.bytes = existing;
                emit({ type: 'task-skipped', task });
                return;
            }
            const resp = await api.downloadStream(task.blobPath, task.versionId, signal);
            await fsaWriter.writeStream(dir, task.fileName, resp, signal, (received) => {
                task.bytes = received;
                emit({ type: 'task-progress', task });
            });
            task.status = 'done';
            emit({ type: 'task-done', task });
        }

        async function runWithRetry(task, rootHandle, signal) {
            const maxAttempts = RETRY_DELAYS_MS.length + 1; // initial + retries
            let lastErr;
            while (task.attempts < maxAttempts) {
                try {
                    await runTask(task, rootHandle, signal);
                    return;
                } catch (e) {
                    lastErr = e;
                    if (e && e.name === 'AbortError') throw e;
                    // 401 → propagate to outer to pause whole queue
                    if (e instanceof HttpError && e.kind === '401') throw new TokenExpiredError('Session expired (401). Please reload the page.');
                    if (e instanceof TokenExpiredError) throw e;
                    if (e instanceof FsaPermissionError) throw e;
                    // 403 → fail without retry
                    if (e instanceof HttpError && e.kind === '403') break;
                    // Otherwise (429 / 5xx / network) retry
                    if (task.attempts >= maxAttempts) break;
                    const baseDelay = RETRY_DELAYS_MS[task.attempts - 1] || 9000;
                    const retryAfter = (e instanceof HttpError && e.retryAfterSec) ? e.retryAfterSec * 1000 : 0;
                    const delay = Math.max(baseDelay, retryAfter);
                    if (e instanceof HttpError && e.kind === '429') {
                        state.concurrency = 1; // drop globally
                        emit({ type: 'rate-limited', delay });
                    }
                    task.status = 'retrying';
                    task.error = e.message;
                    emit({ type: 'task-retrying', task, delay });
                    await new Promise((r) => setTimeout(r, delay));
                    if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
                }
            }
            task.status = 'failed';
            task.error = (lastErr && lastErr.message) || 'unknown error';
            emit({ type: 'task-failed', task });
        }

        async function runQueue(tasks, rootHandle) {
            if (running) throw new Error('Already running');
            running = true;
            abortController = new AbortController();
            const signal = abortController.signal;
            state = {
                tasks,
                total: tasks.length,
                done: 0,
                failed: 0,
                skipped: 0,
                bytesTotal: totalBytes(tasks),
                bytesDone: 0,
                concurrency: concurrencyOverride || DEFAULT_CONCURRENCY,
                startedAt: Date.now(),
                paused: false,
                pauseReason: null,
            };
            try { console.info(`[LDC] queue starting: ${tasks.length} files, ${state.bytesTotal} bytes total, concurrency=${state.concurrency}`); } catch (_) {}
            emit({ type: 'queue-start', state });

            // Try to acquire multi-tab lock.
            //
            // navigator.locks.request resolves only when its callback returns, and
            // we want the callback to keep holding the lock for the whole batch.
            // So we split into two promises: one signals "lock acquired" so the
            // caller can proceed, and another one ("released") keeps the callback
            // alive until we explicitly release the lock in the finally block.
            let releaseLock = () => {};
            if (navigator.locks && typeof navigator.locks.request === 'function') {
                let signalAcquired;
                const acquired = new Promise((r) => { signalAcquired = r; });
                const released = new Promise((r) => { releaseLock = r; });
                navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
                    signalAcquired(!!lock);
                    if (!lock) return;
                    await released;
                }).catch(() => signalAcquired(false));
                const got = await acquired;
                if (!got) {
                    running = false;
                    emit({ type: 'queue-busy' });
                    throw new Error('Another tab is already running a batch download. Close it or wait, then try again.');
                }
                try { console.info('[LDC] navigator.locks acquired'); } catch (_) {}
            }

            try {
                let idx = 0;
                const next = async () => {
                    while (true) {
                        if (signal.aborted) return;
                        const myIdx = idx++;
                        if (myIdx >= tasks.length) return;
                        const task = tasks[myIdx];
                        try {
                            await runWithRetry(task, rootHandle, signal);
                            if (task.status === 'done') state.done++;
                            else if (task.status === 'skipped') { state.skipped++; state.done++; }
                            else if (task.status === 'failed') state.failed++;
                            state.bytesDone += (task.bytes || 0);
                        } catch (e) {
                            if (e instanceof TokenExpiredError || e instanceof FsaPermissionError) {
                                abortController.abort();
                                state.paused = true;
                                state.pauseReason = e.message;
                                emit({ type: 'queue-paused', error: e });
                                return;
                            }
                            if (e && e.name === 'AbortError') return;
                            // Unexpected — mark task failed
                            task.status = 'failed';
                            task.error = e && e.message;
                            state.failed++;
                            emit({ type: 'task-failed', task });
                        }
                        emit({ type: 'queue-progress', state });
                    }
                };
                const workers = [];
                for (let i = 0; i < state.concurrency; i++) workers.push(next());
                await Promise.all(workers);
                try { console.info(`[LDC] queue finished: done=${state.done}, failed=${state.failed}, skipped=${state.skipped}, paused=${state.paused}`); } catch (_) {}
                emit({ type: state.paused ? 'queue-paused-end' : 'queue-end', state });
            } finally {
                running = false;
                releaseLock();
            }
        }

        function cancel() { if (abortController) abortController.abort(); }
        function setConcurrency(n) {
            const v = Math.max(1, Math.min(MAX_CONCURRENCY, parseInt(n, 10) || DEFAULT_CONCURRENCY));
            concurrencyOverride = v;
        }
        function getConcurrency() { return concurrencyOverride || DEFAULT_CONCURRENCY; }

        return {
            buildPlan, runQueue, cancel, setConcurrency, getConcurrency,
            on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
            get state() { return state; },
            get isRunning() { return running; },
        };
    })();

    // ─────────────────────────────────────────────────────────────────────────
    // 12. UI
    // ─────────────────────────────────────────────────────────────────────────

    const ui = (() => {
        const STYLE = `
            #ldc-bar {
                position: sticky;
                top: 0;
                z-index: 9999;
                display: flex;
                gap: 8px;
                align-items: center;
                padding: 8px 12px;
                background: #0078d4;
                color: white;
                border-bottom: 2px solid #005a9e;
                font-family: 'Segoe UI', Roboto, sans-serif;
                font-size: 13px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.15);
            }
            #ldc-bar button, #ldc-bar select {
                padding: 6px 12px;
                border-radius: 4px;
                border: none;
                cursor: pointer;
                font: inherit;
                color: #0078d4;
                background: white;
            }
            #ldc-bar button:hover:not(:disabled) { background: #f0f6fc; }
            #ldc-bar button:disabled { opacity: 0.5; cursor: not-allowed; }
            #ldc-bar select.ldc-sort {
                padding: 6px 8px;
                border-radius: 4px;
                border: none;
                font: inherit;
                color: #0078d4;
                background: white;
                cursor: pointer;
            }
            #ldc-bar select.ldc-sort:disabled { opacity: 0.5; cursor: not-allowed; }
            #ldc-bar .ldc-spacer { flex: 1; }
            #ldc-bar .ldc-status { font-size: 12px; opacity: 0.9; }
            #ldc-bar .ldc-folder { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.95; }
            #ldc-bar .ldc-primary { background: #ffd700; color: #333; font-weight: 600; }
            #ldc-bar .ldc-primary:hover:not(:disabled) { background: #ffea4d; }
            #ldc-bar .ldc-info {
                cursor: help;
                font-size: 16px;
                opacity: 0.85;
                padding: 0 2px;
                user-select: none;
            }
            #ldc-bar .ldc-info:hover { opacity: 1; }
            #ldc-bar .ldc-last-download { font-size: 12px; opacity: 0.9; cursor: help; }

            .ldc-row-checkbox {
                width: 18px; height: 18px;
                margin-right: 6px;
                vertical-align: middle;
                cursor: pointer;
                accent-color: #0078d4;
            }
            .ldc-row-wrap {
                display: inline-flex;
                align-items: center;
                margin-right: 4px;
                user-select: none;
                -webkit-user-select: none;
            }
            .ldc-updated-badge {
                margin-left: 2px;
                font-size: 13px;
                cursor: help;
                user-select: none;
                -webkit-user-select: none;
            }

            #ldc-progress {
                position: fixed;
                bottom: 16px;
                right: 16px;
                width: 420px;
                max-height: 70vh;
                background: white;
                border: 1px solid #ccc;
                border-radius: 8px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.2);
                font-family: 'Segoe UI', Roboto, sans-serif;
                font-size: 12px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
            }
            #ldc-progress.ldc-hidden { display: none; }
            #ldc-progress header {
                padding: 10px 12px;
                background: #f3f3f3;
                border-bottom: 1px solid #e0e0e0;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            #ldc-progress header .ldc-progress-title { flex: 1; }
            #ldc-progress header button {
                padding: 4px 10px;
                font-size: 12px;
                cursor: pointer;
                border: 1px solid #ccc;
                background: white;
                border-radius: 4px;
            }
            #ldc-progress .ldc-progress-summary {
                padding: 8px 12px;
                border-bottom: 1px solid #f0f0f0;
            }
            #ldc-progress .ldc-progress-statline {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 4px;
                align-items: center;
            }
            #ldc-progress .ldc-progress-statline .ldc-chip {
                font-size: 11px;
                padding: 2px 6px;
                border-radius: 3px;
            }
            #ldc-progress .ldc-progress-bar {
                height: 6px;
                background: #e0e0e0;
                border-radius: 3px;
                overflow: hidden;
                margin-top: 6px;
            }
            #ldc-progress .ldc-progress-bar > div {
                height: 100%;
                background: linear-gradient(90deg, #0078d4, #50e6ff);
                width: 0%;
                transition: width 0.2s;
            }
            #ldc-progress .ldc-progress-list {
                flex: 1;
                overflow-y: auto;
                padding: 4px 12px 12px;
            }
            #ldc-progress .ldc-task {
                padding: 4px 0;
                border-bottom: 1px solid #f0f0f0;
                display: flex;
                gap: 8px;
                align-items: center;
            }
            #ldc-progress .ldc-task .ldc-task-name {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            #ldc-progress .ldc-task .ldc-task-status {
                font-size: 11px;
                padding: 2px 6px;
                border-radius: 3px;
            }
            .ldc-status-pending { background: #f0f0f0; color: #666; }
            .ldc-status-downloading { background: #cce4f7; color: #0078d4; }
            .ldc-status-retrying { background: #fff4ce; color: #b78f00; }
            .ldc-status-skipped { background: #e6e6e6; color: #555; }
            .ldc-status-done { background: #dff6dd; color: #107c10; }
            .ldc-status-failed { background: #fde7e9; color: #a4262c; }

            .ldc-modal-backdrop {
                position: fixed; inset: 0; background: rgba(0,0,0,0.4);
                z-index: 10001; display: flex; align-items: center; justify-content: center;
                font-family: 'Segoe UI', Roboto, sans-serif;
            }
            .ldc-modal {
                background: white; border-radius: 8px; padding: 20px 24px;
                max-width: 480px; box-shadow: 0 16px 40px rgba(0,0,0,0.3);
            }
            .ldc-modal h2 { margin: 0 0 12px 0; font-size: 18px; }
            .ldc-modal table { width: 100%; border-collapse: collapse; margin: 12px 0; }
            .ldc-modal td { padding: 4px 0; font-size: 13px; }
            .ldc-modal td:first-child { color: #666; padding-right: 16px; }
            .ldc-modal-buttons {
                display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;
            }
            .ldc-modal button {
                padding: 8px 16px; border-radius: 4px; border: 1px solid #ccc;
                background: white; cursor: pointer; font: inherit;
            }
            .ldc-modal button.ldc-primary {
                background: #0078d4; color: white; border-color: #0078d4; font-weight: 600;
            }

            .ldc-toast {
                position: fixed; top: 60px; right: 16px;
                background: #323130; color: white;
                padding: 10px 16px; border-radius: 4px;
                z-index: 10002; max-width: 360px;
                font-family: 'Segoe UI', Roboto, sans-serif; font-size: 13px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            .ldc-toast.ldc-toast-error { background: #a4262c; }
            .ldc-toast.ldc-toast-warn { background: #b78f00; }
        `;

        function injectStyle() {
            if (typeof GM_addStyle === 'function') GM_addStyle(STYLE);
            else {
                const s = document.createElement('style');
                s.textContent = STYLE;
                document.head.appendChild(s);
            }
        }

        // Tiny element builder. Intentionally supports only `text` (textContent) — never
        // `html` / `innerHTML` — to avoid XSS footguns when future contributors plumb
        // user-provided strings (file names, error messages) through this helper.
        function el(tag, props = {}, children = []) {
            const e = document.createElement(tag);
            for (const [k, v] of Object.entries(props)) {
                if (k === 'class') e.className = v;
                else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
                else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
                else if (k === 'text') e.textContent = v;
                else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v);
            }
            for (const c of (Array.isArray(children) ? children : [children])) {
                if (c == null) continue;
                e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
            }
            return e;
        }

        function fmtBytes(n) {
            if (!n) return '0 B';
            const u = ['B', 'KB', 'MB', 'GB', 'TB'];
            let i = 0; let v = n;
            while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
            return `${v.toFixed(v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2)} ${u[i]}`;
        }

        function showToast(msg, kind = 'info', ms = 4000) {
            const t = el('div', { class: `ldc-toast${kind === 'error' ? ' ldc-toast-error' : kind === 'warn' ? ' ldc-toast-warn' : ''}`, text: msg });
            document.body.appendChild(t);
            setTimeout(() => t.remove(), ms);
        }

        async function showPreflight({ courseCount, fileCount, totalBytes, destName }) {
            return new Promise((resolve) => {
                const onChoose = (ok) => { backdrop.remove(); resolve(ok); };
                const backdrop = el('div', { class: 'ldc-modal-backdrop' }, [
                    el('div', { class: 'ldc-modal' }, [
                        el('h2', { text: 'Confirm batch download' }),
                        el('p', { text: 'About to download:' }),
                        el('table', {}, [
                            el('tr', {}, [el('td', { text: 'Courses' }), el('td', { text: String(courseCount) })]),
                            el('tr', {}, [el('td', { text: 'Files' }), el('td', { text: String(fileCount) })]),
                            el('tr', {}, [el('td', { text: 'Total size' }), el('td', { text: fmtBytes(totalBytes) })]),
                            el('tr', {}, [el('td', { text: 'Destination' }), el('td', { text: destName })]),
                        ]),
                        el('p', { text: 'Existing files of identical size will be skipped.', style: { color: '#666', fontSize: '12px' } }),
                        el('div', { class: 'ldc-modal-buttons' }, [
                            el('button', { onClick: () => onChoose(false), text: 'Cancel' }),
                            el('button', { class: 'ldc-primary', onClick: () => onChoose(true), text: 'Start download' }),
                        ]),
                    ]),
                ]);
                document.body.appendChild(backdrop);
            });
        }

        // Control bar
        let bar, btnFolder, btnSelectAll, btnClear, btnSelectUpdated, btnDownload, btnCancel, btnShowProgress, infoBadge, lblFolder, lblCount, lblLastDownload, selSort;

        function buildBar() {
            bar = el('div', { id: 'ldc-bar' });
            btnFolder = el('button', { text: '📁 Choose folder', title: 'Pick destination root folder' });
            lblFolder = el('span', { class: 'ldc-folder', text: '(no folder chosen)' });
            btnSelectAll = el('button', { text: '☑ Select all visible' });
            btnClear = el('button', { text: '✗ Clear selection' });
            btnSelectUpdated = el('button', { text: '🆕 Select updated', disabled: true });
            selSort = el('select', { class: 'ldc-sort', 'aria-label': 'Sort courses within each category by last-updated date', title: 'Sort courses within each category by last-updated date' }, [
                el('option', { value: 'none', text: '⇅ Sort: Default' }),
                el('option', { value: 'date-desc', text: '⇅ Sort: Updated ↓ (newest first)' }),
                el('option', { value: 'date-asc', text: '⇅ Sort: Updated ↑ (oldest first)' }),
            ]);
            const spacer = el('span', { class: 'ldc-spacer' });
            lblLastDownload = el('span', { class: 'ldc-last-download', text: '⏱ Last download: —' });
            lblCount = el('span', { class: 'ldc-status', text: '0 selected' });
            btnDownload = el('button', { class: 'ldc-primary', text: '⬇ Download selected', disabled: true });
            btnCancel = el('button', { text: '⏹ Cancel', style: { display: 'none' } });
            btnShowProgress = el('button', { text: '📊 Show progress', title: 'Re-open the download progress panel' });
            infoBadge = el('span', {
                class: 'ldc-info',
                text: 'ℹ️',
                title: `Author: ${SCRIPT_AUTHOR}\nVersion: ${SCRIPT_VERSION}`,
            });
            bar.append(btnFolder, lblFolder, btnSelectAll, btnClear, btnSelectUpdated, selSort, spacer, lblLastDownload, lblCount, btnDownload, btnCancel, btnShowProgress, infoBadge);
            return bar;
        }

        function updateBar() {
            const n = selection.size();
            lblCount.textContent = `${n} selected`;
            btnDownload.disabled = n === 0;
        }

        // Reference to the downloadHistory module, injected via setHistory(). Kept as a
        // plain reference (mirrors how setLookup() plumbs the course lookup Map into
        // this module) so the UI layer can read timestamps/baselines without owning them.
        // Named historyApi (not `history`) to avoid shadowing window.history.
        let historyApi = null;
        function setHistory(h) { historyApi = h; }

        function updateHistoryUI() {
            if (!lblLastDownload) return;
            const g = historyApi ? historyApi.getGlobal() : 0;
            const label = historyApi ? historyApi.formatLocalDateTime(g) : '—';
            lblLastDownload.textContent = `⏱ Last download: ${label}`;
            const count = historyApi ? historyApi.trackedCourseCount() : 0;
            const fullTime = g > 0 ? new Date(g).toString() : 'never';
            lblLastDownload.title = `Full local time: ${fullTime}\nTracked courses: ${count}\n`
                + `The global "last download" time only advances after a completely successful batch `
                + `(no failures, not paused, not cancelled).`;
            updateSelectUpdatedButton();
        }

        function updateSelectUpdatedButton() {
            if (!btnSelectUpdated) return;
            const hasBaseline = !!historyApi && (historyApi.getGlobal() > 0 || historyApi.trackedCourseCount() > 0);
            const hasDates = hasAnyDateMetadata();
            btnSelectUpdated.disabled = !(hasBaseline && hasDates);
            if (!hasDates) {
                btnSelectUpdated.title = '⚠️ No date metadata available on any course; select-updated disabled';
            } else if (!hasBaseline) {
                btnSelectUpdated.title = 'No last-download history yet — download at least one course, then this becomes available';
            } else {
                btnSelectUpdated.title = 'Select all currently visible courses updated since your last download';
            }
        }

        async function refreshFolderLabel() {
            await fsaWriter.loadCachedRoot();
            const h = fsaWriter.cachedRoot;
            if (h) {
                const perm = await fsaWriter.queryPermission(h);
                lblFolder.textContent = `${h.name}${perm === 'granted' ? '' : ' (permission needed)'}`;
            } else {
                lblFolder.textContent = '(no folder chosen)';
            }
        }

        // Row checkbox injection
        let lookup = null;
        function setLookup(l) { lookup = l; }

        // Anchor for Shift-range selection: id of the most recently
        // clicked (non-shift) row. Reset when the user uses the
        // toolbar "Select all visible" or "Clear selection".
        let lastAnchorId = null;
        function clearAnchor() { lastAnchorId = null; }

        // Shift+Click delivery: the click handler stashes the computed
        // range here and lets the browser's natural toggle proceed. The
        // change handler — which fires AFTER the toggle is committed —
        // reads this back, force-corrects `cb.checked = true`, and
        // applies the rest of the range. This avoids any reliance on
        // preventDefault + microtask timing for the legacy-canceled-
        // activation revert, which proved unreliable in practice.
        // Single-threaded JS means there's no real concurrency hazard.
        let pendingShiftRange = null;

        // Compute the inclusive Shift-range between two row ids.
        // Returns an array of row ids in DOM order, or null when the
        // range cannot be established (anchor missing/invisible,
        // different category, etc.) — in which case Shift+Click should
        // fall through to a plain click.
        function getRangeBetween(anchorId, currentId) {
            if (!anchorId || !currentId) return null;
            if (anchorId === currentId) return [currentId];
            const sel = (rid) => `input.ldc-row-checkbox[data-ldc-row-id="${CSS.escape(rid)}"]`;
            const anchorCb = document.querySelector(sel(anchorId));
            const currentCb = document.querySelector(sel(currentId));
            if (!anchorCb || !currentCb) return null;
            // Both endpoints must be visible.
            if (anchorCb.offsetParent === null || currentCb.offsetParent === null) return null;
            const anchorToggle = anchorCb.closest('[role="button"][aria-label^="Toggle "]');
            const currentToggle = currentCb.closest('[role="button"][aria-label^="Toggle "]');
            if (!anchorToggle || !currentToggle) return null;
            const anchorContainer = findRowContainer(anchorToggle);
            const currentContainer = findRowContainer(currentToggle);
            if (!anchorContainer || !currentContainer) return null;
            const parent = anchorContainer.parentElement;
            // Same-category constraint: both row containers must share the
            // same parent in the DOM (LDC renders all course rows of one
            // category as siblings of a single parent).
            if (!parent || parent !== currentContainer.parentElement) return null;
            const children = Array.from(parent.children);
            const ai = children.indexOf(anchorContainer);
            const ci = children.indexOf(currentContainer);
            if (ai === -1 || ci === -1) return null;
            const [lo, hi] = ai <= ci ? [ai, ci] : [ci, ai];
            const ids = [];
            for (let i = lo; i <= hi; i++) {
                const innerCb = children[i].querySelector?.('input.ldc-row-checkbox');
                if (!innerCb) continue;
                if (innerCb.offsetParent === null) continue;
                const rid = innerCb.getAttribute('data-ldc-row-id');
                if (rid) ids.push(rid);
            }
            return ids;
        }

        function injectRowCheckbox(toggleEl) {
            if (!toggleEl || toggleEl.dataset.ldcEnhanced === '1') return;
            const label = toggleEl.getAttribute('aria-label') || '';
            const cls = treeIndex.classifyAriaRow(label, lookup);
            if (cls.kind !== 'course') return;
            toggleEl.dataset.ldcEnhanced = '1';
            const id = selection.rowId(cls.name);
            const cb = el('input', { type: 'checkbox', class: 'ldc-row-checkbox', 'data-ldc-row-id': id });
            cb.checked = selection.has(id);
            ['click', 'mousedown', 'keydown'].forEach((evt) => {
                cb.addEventListener(evt, (e) => e.stopPropagation());
            });
            // Shift-range: suppress the browser's text-selection behaviour
            // that kicks in on shift+mousedown, so the page doesn't get
            // a giant highlight from the previous click to here.
            cb.addEventListener('mousedown', (e) => {
                if (e.shiftKey) e.preventDefault();
            });
            // Shift+Click: stash the computed range so the upcoming
            // `change` event (which fires after the browser's natural
            // toggle is committed) can apply it. Crucially, we do NOT
            // preventDefault here — letting the browser toggle the
            // clicked checkbox is what lets us avoid fighting the
            // legacy-canceled-activation revert dance. Same-category
            // and visibility constraints are enforced by
            // getRangeBetween; if it returns null we clear the pending
            // range so the change handler falls through to a normal
            // single-row click.
            cb.addEventListener('click', (e) => {
                if (!e.shiftKey) {
                    pendingShiftRange = null;
                    return;
                }
                const range = getRangeBetween(lastAnchorId, id);
                pendingShiftRange = (range && range.length > 0) ? range : null;
                if (pendingShiftRange) {
                    try { window.getSelection()?.removeAllRanges(); } catch (_) {}
                }
            });
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                const range = pendingShiftRange;
                pendingShiftRange = null;
                if (range) {
                    // Shift+Click: always SELECT the entire range,
                    // including the clicked row. The browser just toggled
                    // `cb.checked` as part of its natural click activation;
                    // force it back to `true` no matter which direction
                    // the toggle went (Shift+Click never deselects, per
                    // spec). Anchor is intentionally NOT updated, so
                    // repeat Shift+Clicks keep pivoting on the same
                    // anchor.
                    cb.checked = true;
                    selection.addMany(range);
                    for (const rid of range) {
                        if (rid === id) continue;
                        const other = document.querySelector(`input.ldc-row-checkbox[data-ldc-row-id="${CSS.escape(rid)}"]`);
                        if (other) other.checked = true;
                    }
                    return;
                }
                // Plain click (incl. Ctrl/⌘+Click on a checkbox list,
                // which the browser handles the same way): mirror
                // `cb.checked` into selection state and update the
                // anchor for the next potential Shift+Click.
                if (cb.checked) selection.add(id); else selection.remove(id);
                lastAnchorId = id;
            });
            const wrap = el('span', { class: 'ldc-row-wrap' }, [cb]);
            ['click', 'mousedown', 'keydown'].forEach((evt) => {
                wrap.addEventListener(evt, (e) => e.stopPropagation());
            });
            applyBadgeForRow(wrap, cls.name);
            // The toggle <div role="button"> is itself flex, and its first child is an
            // inner `<div class="flex items-center">` containing the chevron + title.
            // Inserting our checkbox into THAT inner flex (before the chevron) keeps
            // it on the same line and aligns vertically. stopPropagation prevents the
            // checkbox from triggering the toggle's expand/collapse.
            const innerFlex = toggleEl.querySelector(':scope > div.flex.items-center')
                || toggleEl.querySelector('.flex.items-center');
            if (innerFlex) {
                innerFlex.insertBefore(wrap, innerFlex.firstChild);
            } else {
                toggleEl.insertBefore(wrap, toggleEl.firstChild);
            }
        }

        // Adds/removes the "🆕" updated-since-last-download badge on a row's wrap
        // element. baseline = perCourse[rowName] ?? global (via historyApi.getBaseline);
        // with no baseline at all (0), nothing is ever considered updated, so no
        // badges show up on first use before any download history exists.
        function applyBadgeForRow(wrap, rowName) {
            if (!wrap) return;
            const existing = wrap.querySelector('.ldc-updated-badge');
            if (existing) existing.remove();
            if (!historyApi || !lookup) return;
            const node = lookup.get(rowName);
            if (!node) return;
            const baseline = historyApi.getBaseline(rowName);
            if (!historyApi.isUpdatedSince(node.lastModified, baseline)) return;
            const badge = el('span', {
                class: 'ldc-updated-badge',
                text: '🆕',
                title: `Updated ${historyApi.formatLocalDateTime(node.lastModified)} — after your last download (${historyApi.formatLocalDateTime(baseline)})`,
            });
            wrap.appendChild(badge);
        }

        // Re-evaluates the updated-since badge on every currently-injected row.
        // Called after a successful history write (post-download) or a history reset.
        function refreshBadges() {
            document.querySelectorAll('.ldc-row-wrap').forEach((wrap) => {
                const cb = wrap.querySelector('input.ldc-row-checkbox');
                if (!cb) return;
                applyBadgeForRow(wrap, cb.getAttribute('data-ldc-row-id'));
            });
        }

        function refreshAllCheckboxes() {
            // Re-sync existing checkboxes to selection state (after Clear etc.)
            document.querySelectorAll('input.ldc-row-checkbox').forEach((cb) => {
                const id = cb.getAttribute('data-ldc-row-id');
                cb.checked = selection.has(id);
            });
        }

        function processAddedSubtree(node) {
            if (!(node instanceof Element)) return;
            if (node.matches?.('[role="button"][aria-label^="Toggle "]')) injectRowCheckbox(node);
            node.querySelectorAll?.('[role="button"][aria-label^="Toggle "]').forEach(injectRowCheckbox);
        }

        // ── Sort engine ──────────────────────────────────────────────────────
        // Sort courses within each category by their last-updated date. We do
        // this by walking every course toggle currently in the DOM, grouping
        // them by their immediate parentElement (LDC renders all course toggles
        // under one category as siblings of the same parent), and reordering
        // each group's wrapper element via parent.appendChild(...). Stable for
        // ties and for missing-date courses (which sink to the bottom).
        let sortMode = 'none'; // 'none' | 'date-desc' | 'date-asc'
        let sorting = false;   // reentrancy guard against our own DOM mutations

        function getSortMode() { return sortMode; }
        function setSortMode(m) {
            if (m !== 'none' && m !== 'date-desc' && m !== 'date-asc') m = 'none';
            sortMode = m;
            applySortIfNeeded();
        }

        // Find the "row container" — the outermost ancestor of `toggleEl` that
        // is a direct child of the category's row list. Heuristic: walk up
        // until we hit an element whose parent contains other siblings that
        // also (transitively) hold a course toggle. We cap the walk at 6
        // levels to avoid escaping the category. If we can't find a stable
        // container, fall back to the toggle itself.
        function findRowContainer(toggleEl) {
            let cur = toggleEl;
            for (let i = 0; i < 6; i++) {
                const parent = cur.parentElement;
                if (!parent || parent === document.body) break;
                // If parent has multiple children that each contain a course toggle,
                // `cur` is the row container we want to move around.
                let siblingRows = 0;
                for (const sib of parent.children) {
                    if (sib === cur) { siblingRows++; continue; }
                    if (sib.querySelector?.('[role="button"][aria-label^="Toggle "]')) siblingRows++;
                }
                if (siblingRows >= 2) return cur;
                cur = parent;
            }
            // Walked the full 6-level cap without finding a multi-row parent.
            // This means the SPA layout has changed in a way our heuristic
            // doesn't recognise; sorting will silently no-op for this row.
            // Surface a warning so the regression is detectable in DevTools.
            try {
                console.warn('[LDC] findRowContainer: could not locate row container for toggle', toggleEl.getAttribute?.('aria-label'));
            } catch (_) {}
            return toggleEl;
        }

        function getCourseLastModified(rowName) {
            const node = lookup && lookup.get(rowName);
            return (node && node.lastModified) || 0;
        }

        function applySortIfNeeded() {
            if (sortMode === 'none') return;
            if (!lookup || lookup.size === 0) return;
            if (sorting) return;
            sorting = true;
            try {
                // Collect all course toggles currently in the DOM.
                const toggles = document.querySelectorAll('[role="button"][aria-label^="Toggle "]');
                // Group containers by parent element.
                const groups = new Map(); // parent → Array<{ container, rowName, t, originalIdx }>
                toggles.forEach((tg) => {
                    const label = tg.getAttribute('aria-label') || '';
                    const cls = treeIndex.classifyAriaRow(label, lookup);
                    if (cls.kind !== 'course') return;
                    const container = findRowContainer(tg);
                    const parent = container.parentElement;
                    if (!parent) return;
                    if (!groups.has(parent)) groups.set(parent, []);
                    const list = groups.get(parent);
                    list.push({
                        container,
                        rowName: cls.name,
                        t: getCourseLastModified(cls.name),
                        originalIdx: list.length, // tie-break: preserve current order
                    });
                });
                const dir = sortMode === 'date-desc' ? -1 : 1;
                for (const [parent, items] of groups) {
                    if (items.length < 2) continue;
                    const sorted = items.slice().sort((a, b) => {
                        // Missing-date items always sink to the bottom regardless of dir.
                        if (a.t === 0 && b.t === 0) return a.originalIdx - b.originalIdx;
                        if (a.t === 0) return 1;
                        if (b.t === 0) return -1;
                        if (a.t !== b.t) return (a.t - b.t) * dir;
                        return a.originalIdx - b.originalIdx;
                    });
                    // Skip if already in target order (avoid mutation churn).
                    let same = true;
                    for (let i = 0; i < sorted.length; i++) {
                        if (sorted[i].container !== items[i].container) { same = false; break; }
                    }
                    if (same) continue;
                    // Re-append in target order. Using appendChild moves the node.
                    for (const it of sorted) parent.appendChild(it.container);
                }
            } catch (e) {
                try { console.warn('[LDC] sort failed:', e); } catch (_) {}
            } finally {
                sorting = false;
            }
        }

        function hasAnyDateMetadata() {
            if (!lookup) return false;
            for (const v of lookup.values()) {
                if (v && v.lastModified > 0) return true;
            }
            return false;
        }

        let rowObserver = null;
        function observeRows() {
            if (rowObserver) return rowObserver; // idempotent
            // Initial pass
            document.querySelectorAll('[role="button"][aria-label^="Toggle "]').forEach(injectRowCheckbox);
            applySortIfNeeded();

            let pending = false;
            const queue = [];
            // The "if (sorting) return" guard that lived here used to try to
            // ignore mutations caused by our own re-appendChild calls inside
            // applySortIfNeeded. It was effectively dead code: MutationObserver
            // callbacks are delivered as microtasks, and the synchronous
            // `sorting = false` in applySortIfNeeded's `finally` runs before
            // any of those microtasks. We rely on applySortIfNeeded's own
            // "skip if already in target order" early-return to avoid loops.
            rowObserver = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    for (const n of m.addedNodes) queue.push(n);
                }
                if (!pending) {
                    pending = true;
                    requestAnimationFrame(() => {
                        pending = false;
                        const batch = queue.splice(0);
                        for (const n of batch) processAddedSubtree(n);
                        applySortIfNeeded();
                    });
                }
            });
            rowObserver.observe(document.body, { childList: true, subtree: true });
            return rowObserver;
        }

        function disposeRows() {
            if (rowObserver) {
                try { rowObserver.disconnect(); } catch (_) {}
                rowObserver = null;
            }
        }

        // Progress panel
        let panel, panelHeader, panelTitle, panelSummary, panelBar, panelList;
        function buildPanel() {
            panel = el('div', { id: 'ldc-progress', class: 'ldc-hidden' });
            panelTitle = el('span', { class: 'ldc-progress-title', text: 'Download progress' });
            panelHeader = el('header', {}, [
                panelTitle,
                el('button', { text: 'Copy errors', onClick: copyErrors }),
                el('button', { text: '✕', onClick: () => panel.classList.add('ldc-hidden') }),
            ]);
            panelSummary = el('div', { class: 'ldc-progress-summary' });
            panelBar = el('div', { class: 'ldc-progress-bar' }, [el('div')]);
            panelList = el('div', { class: 'ldc-progress-list' });
            panel.append(panelHeader, panelSummary, panelBar, panelList);
            return panel;
        }

        function copyErrors() {
            const s = orchestrator.state;
            if (!s) return;
            const failed = s.tasks.filter((t) => t.status === 'failed');
            if (failed.length === 0) { showToast('No failed items to copy', 'info'); return; }
            const text = failed.map((t) => `${t.parentDir}/${t.subDir}/${t.fileName}\t${t.error}`).join('\n');
            navigator.clipboard.writeText(text).then(() => showToast(`Copied ${failed.length} error rows`));
        }

        function showPanel() { panel.classList.remove('ldc-hidden'); }

        let renderPending = false;
        function scheduleRender() {
            if (renderPending) return;
            renderPending = true;
            requestAnimationFrame(() => { renderPending = false; renderPanel(); });
        }

        const STATUS_RANK = { failed: 0, retrying: 1, downloading: 2, pending: 3, skipped: 4, done: 5 };

        function statusChip(label, statusClass) {
            return el('span', { class: `ldc-chip ldc-status-${statusClass}`, text: label });
        }

        function renderPanel() {
            const s = orchestrator.state;
            if (!s) {
                panelTitle.textContent = 'Download progress';
                panelBar.firstChild.style.width = '0%';
                panelSummary.innerHTML = '';
                panelList.innerHTML = '';
                panelList.appendChild(el('div', { class: 'ldc-task', text: 'No downloads yet.' }));
                return;
            }

            // Count statuses not already on state (downloading / retrying / pending).
            // state.done already includes skipped (orchestrator increments both); state.failed
            // and state.skipped are direct counters.
            let downloading = 0, retrying = 0, pending = 0;
            for (const t of s.tasks) {
                if (t.status === 'downloading') downloading++;
                else if (t.status === 'retrying') retrying++;
                else if (t.status === 'pending') pending++;
            }

            // Header status badge — derived purely from existing state.
            const terminal = s.done + s.failed;
            const ended = s.total > 0 && terminal >= s.total;
            let title;
            if (s.paused) title = `⏸ Paused — ${s.pauseReason || ''}`.trim();
            else if (ended) title = s.failed > 0 ? `⚠ Done with ${s.failed} failed` : '✓ All done';
            else title = '⏳ Downloading…';
            panelTitle.textContent = title;

            // Progress bar.
            const pct = s.bytesTotal ? Math.min(100, (s.bytesDone / s.bytesTotal) * 100) : 0;
            panelBar.firstChild.style.width = `${pct.toFixed(1)}%`;

            // Two-line summary: totals on line 1, status chips on line 2.
            panelSummary.innerHTML = '';
            panelSummary.appendChild(el('div', { class: 'ldc-progress-totals',
                text: `${s.done}/${s.total} files · ${fmtBytes(s.bytesDone)} / ${fmtBytes(s.bytesTotal)}`
            }));
            const statline = el('div', { class: 'ldc-progress-statline' });
            statline.appendChild(statusChip(`${s.failed} failed`, 'failed'));
            if (downloading > 0 || (!ended && !s.paused)) statline.appendChild(statusChip(`${downloading} downloading`, 'downloading'));
            if (retrying > 0) statline.appendChild(statusChip(`${retrying} retrying`, 'retrying'));
            if (pending > 0) statline.appendChild(statusChip(`${pending} pending`, 'pending'));
            if (s.skipped > 0) statline.appendChild(statusChip(`${s.skipped} skipped`, 'skipped'));
            panelSummary.appendChild(statline);

            // Sort a *copy* of tasks for display — never mutate state.tasks since the orchestrator
            // worker loop walks the original array by index.
            const sorted = [...s.tasks].sort((a, b) => {
                const ra = STATUS_RANK[a.status];
                const rb = STATUS_RANK[b.status];
                return (ra === undefined ? 99 : ra) - (rb === undefined ? 99 : rb);
            });
            const visible = sorted.slice(0, 200);
            panelList.innerHTML = '';
            for (const t of visible) {
                const row = el('div', { class: 'ldc-task' }, [
                    el('span', { class: 'ldc-task-name', text: t.fileName, title: `${t.parentDir}/${t.subDir}/${t.fileName}` }),
                    el('span', { class: `ldc-task-status ldc-status-${t.status}`, text: t.status }),
                ]);
                panelList.appendChild(row);
            }
            if (sorted.length > 200) {
                // Describe the hidden tail so "... and N more" isn't opaque.
                const hidden = sorted.slice(200);
                const counts = {};
                for (const t of hidden) counts[t.status] = (counts[t.status] || 0) + 1;
                const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                let label;
                if (entries.length === 1) {
                    label = `... and ${hidden.length} more ${entries[0][0]}`;
                } else {
                    const top2 = entries.slice(0, 2).map(([k, v]) => `${v} ${k}`).join(' · ');
                    label = `... and ${hidden.length} more (${top2})`;
                }
                panelList.appendChild(el('div', { class: 'ldc-task', text: label }));
            }
        }

        return {
            injectStyle, buildBar, updateBar, refreshFolderLabel, setLookup, observeRows, disposeRows, refreshAllCheckboxes, clearAnchor,
            buildPanel, showPanel, renderPanel: scheduleRender, showPreflight, showToast,
            getSortMode, setSortMode, applySortIfNeeded, hasAnyDateMetadata,
            setHistory, updateHistoryUI, updateSelectUpdatedButton, refreshBadges,
            get bar() { return bar; },
            get btnFolder() { return btnFolder; },
            get btnSelectAll() { return btnSelectAll; },
            get btnClear() { return btnClear; },
            get btnSelectUpdated() { return btnSelectUpdated; },
            get btnDownload() { return btnDownload; },
            get btnCancel() { return btnCancel; },
            get btnShowProgress() { return btnShowProgress; },
            get lblFolder() { return lblFolder; },
            get selSort() { return selSort; },
        };
    })();

    // ─────────────────────────────────────────────────────────────────────────
    // 13. Wiring / boot
    // ─────────────────────────────────────────────────────────────────────────

    let lookup = null;
    let lookupReady;
    const lookupReadyPromise = new Promise((r) => { lookupReady = r; });

    async function loadLookup() {
        const tree = await api.getSearchTree();
        lookup = treeIndex.buildLookup(tree);
        ui.setLookup(lookup);
        lookupReady(lookup);
        try { console.info(`[LDC] course lookup built: ${lookup.size} course rows`); } catch (_) {}
        return lookup;
    }

    async function onChooseFolder() {
        try {
            await fsaWriter.pickRoot();
            await ui.refreshFolderLabel();
            ui.showToast('Folder selected.');
        } catch (e) {
            if (e && e.name === 'AbortError') return; // user cancelled picker
            ui.showToast(`Could not pick folder: ${e && e.message}`, 'error');
        }
    }

    function onSelectAllVisible() {
        const cbs = document.querySelectorAll('input.ldc-row-checkbox');
        cbs.forEach((cb) => {
            // Only consider checkboxes whose row is currently visible (offsetParent != null)
            if (cb.offsetParent !== null) {
                const id = cb.getAttribute('data-ldc-row-id');
                selection.add(id);
                cb.checked = true;
            }
        });
        ui.clearAnchor();
    }

    function onClearSelection() {
        selection.clear();
        ui.refreshAllCheckboxes();
        ui.clearAnchor();
    }

    // Selects only currently-visible rows (offsetParent !== null) whose course was
    // updated since the applicable baseline (per-course, else global). Adds to the
    // existing selection rather than replacing it, and clears the shift-range anchor
    // like the other toolbar selection actions.
    function onSelectUpdated() {
        if (!lookup) { ui.showToast('Course list not loaded yet.', 'warn'); return; }
        const cbs = document.querySelectorAll('input.ldc-row-checkbox');
        let matched = 0;
        cbs.forEach((cb) => {
            if (cb.offsetParent === null) return; // not currently visible
            const rowName = cb.getAttribute('data-ldc-row-id');
            const node = lookup.get(rowName);
            if (!node) return;
            const baseline = downloadHistory.getBaseline(rowName);
            if (!downloadHistory.isUpdatedSince(node.lastModified, baseline)) return;
            matched++;
            selection.add(rowName);
            cb.checked = true;
        });
        ui.clearAnchor();
        if (matched === 0) ui.showToast('No visible courses updated since your last download.', 'info');
        else ui.showToast(`Selected ${matched} updated course${matched === 1 ? '' : 's'}.`);
    }

    async function onDownload() {
        if (orchestrator.isRunning) return;
        const ids = selection.ids();
        if (ids.length === 0) return;
        await lookupReadyPromise;

        // Ensure folder
        await fsaWriter.loadCachedRoot();
        let root = fsaWriter.cachedRoot;
        if (!root) {
            ui.showToast('Please choose a destination folder first.', 'warn');
            try { root = await fsaWriter.pickRoot(); } catch (e) {
                ui.showToast(`Could not pick folder: ${e && e.message}`, 'error'); return;
            }
            await ui.refreshFolderLabel();
        }
        try { await fsaWriter.ensurePermission(root); }
        catch (e) {
            ui.showToast(`${e && e.message} Click "Choose folder" to re-grant.`, 'error');
            await fsaWriter.clearCachedRoot();
            await ui.refreshFolderLabel();
            return;
        }

        const tasks = orchestrator.buildPlan(ids, lookup);
        if (tasks.length === 0) { ui.showToast('No files to download.', 'warn'); return; }
        const totalBytes = tasks.reduce((a, t) => a + (t.size || 0), 0);
        const ok = await ui.showPreflight({
            courseCount: ids.length,
            fileCount: tasks.length,
            totalBytes,
            destName: root.name,
        });
        if (!ok) return;

        ui.showPanel();
        ui.btnDownload.disabled = true;
        ui.btnCancel.style.display = '';
        try {
            await orchestrator.runQueue(tasks, root);
            const s = orchestrator.state;
            const { completedRowNames, allComplete } = downloadHistory.summarizeCourseCompletion(s.tasks);
            const advanceGlobal = allComplete && s.failed === 0 && s.paused === false;
            // One atomic, cross-tab-safe read-modify-write for the whole batch.
            await downloadHistory.recordBatch(completedRowNames, s.startedAt, advanceGlobal);
            // Refresh the toolbar label/button and any already-injected row badges,
            // regardless of whether anything actually advanced (cheap and idempotent).
            ui.updateHistoryUI();
            ui.refreshBadges();
            if (s.paused) {
                ui.showToast(`Download paused: ${s.pauseReason}`, 'error', 8000);
            } else if (s.failed > 0) {
                ui.showToast(`Done with ${s.failed} failed. See panel.`, 'warn');
            } else {
                ui.showToast(`✓ All ${s.done} files complete.`);
            }
        } catch (e) {
            ui.showToast(`Download error: ${e && e.message}`, 'error');
        } finally {
            ui.btnDownload.disabled = selection.size() === 0;
            ui.btnCancel.style.display = 'none';
        }
    }

    function onCancel() { orchestrator.cancel(); }

    const SORT_MODE_KEY = 'ldc.sortMode';

    async function loadSortMode() {
        try {
            if (typeof GM !== 'undefined' && GM && typeof GM.getValue === 'function') {
                const v = await GM.getValue(SORT_MODE_KEY, 'none');
                return (v === 'date-asc' || v === 'date-desc') ? v : 'none';
            }
        } catch (_) {}
        return 'none';
    }

    async function saveSortMode(mode) {
        try {
            if (typeof GM !== 'undefined' && GM && typeof GM.setValue === 'function') {
                await GM.setValue(SORT_MODE_KEY, mode);
            }
        } catch (_) {}
    }

    function setupBar() {
        const bar = ui.buildBar();
        ui.btnFolder.addEventListener('click', onChooseFolder);
        ui.btnSelectAll.addEventListener('click', onSelectAllVisible);
        ui.btnClear.addEventListener('click', onClearSelection);
        ui.btnSelectUpdated.addEventListener('click', onSelectUpdated);
        ui.btnDownload.addEventListener('click', onDownload);
        ui.btnCancel.addEventListener('click', onCancel);
        ui.btnShowProgress.addEventListener('click', () => {
            ui.showPanel();
            ui.renderPanel();
        });
        ui.selSort.addEventListener('change', async () => {
            const mode = ui.selSort.value;
            ui.setSortMode(mode);
            await saveSortMode(mode);
        });
        // page-lifetime listener — selection lives until page unload, so the unsubscribe
        // returned by onChange is intentionally discarded.
        selection.onChange(() => ui.updateBar());
        ui.updateBar();
        // Insert at the very top of <body>
        document.body.insertBefore(bar, document.body.firstChild);
    }

    function setupPanel() {
        const panel = ui.buildPanel();
        document.body.appendChild(panel);
        orchestrator.on(() => ui.renderPanel());
    }

    function registerMenuCommands() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        GM_registerMenuCommand('LDC: Reset chosen folder', async () => {
            await fsaWriter.clearCachedRoot();
            await ui.refreshFolderLabel();
            ui.showToast('Cached folder cleared.');
        });
        GM_registerMenuCommand('LDC: Set concurrency (1-4)', () => {
            const cur = orchestrator.getConcurrency();
            const v = prompt(`Concurrent downloads (1–${MAX_CONCURRENCY}):`, String(cur));
            if (v === null) return;
            orchestrator.setConcurrency(v);
            ui.showToast(`Concurrency = ${orchestrator.getConcurrency()}`);
        });
        GM_registerMenuCommand('LDC: Token status', () => {
            const t = tokenInterceptor.currentToken;
            if (!t) { ui.showToast('No token captured yet.', 'warn'); return; }
            const exp = tokenInterceptor.decodeJwtExp(t);
            if (exp === null) ui.showToast('Token captured (opaque, JWE).');
            else {
                const left = exp - Math.floor(Date.now() / 1000);
                ui.showToast(`Token expires in ${left}s (${new Date(exp * 1000).toLocaleTimeString()}).`);
            }
        });
        GM_registerMenuCommand('LDC: Reset last-download history', async () => {
            const ok = confirm('Reset last-download history?\n\nThis clears the global "last download" timestamp and all per-course timestamps. Updated-course badges will disappear until you download again.');
            if (!ok) return;
            await downloadHistory.reset();
            ui.updateHistoryUI();
            ui.refreshBadges();
            ui.showToast('Last-download history cleared.');
        });
    }

    async function boot() {
        ui.injectStyle();
        setupBar();
        setupPanel();
        registerMenuCommands();
        ui.setHistory(downloadHistory);
        await ui.refreshFolderLabel();

        // Restore persisted sort mode (UI only; engine waits until lookup loads).
        const savedSort = await loadSortMode();
        if (ui.selSort) ui.selSort.value = savedSort;

        // Load last-download history before the initial observeRows() pass, so the
        // very first badge injection sees the correct baseline.
        await downloadHistory.load();
        ui.updateHistoryUI();

        // Wait for SPA to render the results container, then load lookup and start observing.
        try {
            await loadLookup();
        } catch (e) {
            if (e instanceof TokenExpiredError) {
                ui.showToast('Waiting for sign-in to finish... Try again in a moment.', 'warn', 8000);
            } else {
                ui.showToast(`Failed to load course list: ${e && e.message}`, 'error', 8000);
            }
        }

        // Now lookup is (possibly) loaded — decide if sort is usable.
        if (!ui.hasAnyDateMetadata()) {
            if (ui.selSort) {
                ui.selSort.disabled = true;
                ui.selSort.setAttribute('aria-disabled', 'true');
                ui.selSort.title = '⚠️ No date metadata available; sort disabled';
                ui.selSort.value = 'none';
            }
            ui.setSortMode('none');
            // Warn AFTER the dropdown has been visibly disabled so the message
            // order matches what the user sees.
            try { console.warn('[LDC] No date metadata found on any course file; sort-by-updated disabled.'); } catch (_) {}
        } else {
            if (ui.selSort) {
                ui.selSort.disabled = false;
                ui.selSort.removeAttribute('aria-disabled');
            }
            ui.setSortMode(savedSort);
        }
        // Course lookup is now settled; recompute select-updated button availability.
        ui.updateSelectUpdatedButton();

        ui.observeRows();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Expose for debugging (read-only handle on `window.__ldc`)
    // ─────────────────────────────────────────────────────────────────────────
    try {
        unsafeWindow.__ldc = Object.freeze({
            tokenInterceptor, courseParser, pathSanitizer, treeIndex,
            selection, orchestrator, fsaWriter, api, downloadHistory,
            getLookup: () => lookup,
        });
    } catch (_) {}
})();
