// Pure smoke-tests for the ms-learn-lang-switch-tw URL locale toggle.
// Run with: node scripts/ms-learn-lang-switch-tw/test/pure-modules.test.js
// The userscript reads location.* (Tampermonkey / DOM globals) that don't
// exist in Node, so we hand-port the pure locale-toggle logic here. Keep this
// regex + logic in sync with ms-learn-lang-switch-tw.user.js when it changes.

const localeRe = /^\/(en-us|zh-tw)\//i;

function detectLocale(href) {
    const m = new URL(href).pathname.match(localeRe);
    return m ? { isEn: m[1].toLowerCase() === 'en-us' } : null;
}

function nextLocaleUrl(href) {
    const url = new URL(href);
    const m = url.pathname.match(localeRe);
    if (!m) return null;
    const isEn = m[1].toLowerCase() === 'en-us';
    url.pathname = url.pathname.replace(localeRe, `/${isEn ? 'zh-tw' : 'en-us'}/`);
    return url.toString();
}

let failures = 0;
function eq(name, actual, expected) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}` +
        (ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`));
}

// Mixed-case support.microsoft.com legacy KB pages (the bug this fixes).
eq('en-US -> zh-tw', nextLocaleUrl('https://support.microsoft.com/en-US/Forms/create-a-form'),
    'https://support.microsoft.com/zh-tw/Forms/create-a-form');
eq('zh-TW -> en-us', nextLocaleUrl('https://support.microsoft.com/zh-TW/windows/'),
    'https://support.microsoft.com/en-us/windows/');

// Lowercase pages still work (Microsoft Learn + newer support hubs).
eq('en-us -> zh-tw', nextLocaleUrl('https://support.microsoft.com/en-us/windows/'),
    'https://support.microsoft.com/zh-tw/windows/');
eq('learn zh-tw -> en-us', nextLocaleUrl('https://learn.microsoft.com/zh-tw/azure/'),
    'https://learn.microsoft.com/en-us/azure/');

// Query string and hash are preserved.
eq('query+hash preserved', nextLocaleUrl('https://learn.microsoft.com/en-us/dotnet/?view=net-8&x=1#frag'),
    'https://learn.microsoft.com/zh-tw/dotnet/?view=net-8&x=1#frag');

// Anchored to the first path segment: no false positive on a locale-looking
// segment deeper in the path or inside the query string.
eq('deep com/en-US/ ignored', nextLocaleUrl('https://learn.microsoft.com/foo/com/en-US/bar'), null);
eq('query com/en-US ignored', nextLocaleUrl('https://learn.microsoft.com/search?q=com/en-US/x'), null);

// No locale segment => no toggle.
eq('root path ignored', nextLocaleUrl('https://support.microsoft.com/'), null);
eq('non-locale first segment ignored', nextLocaleUrl('https://azure.microsoft.com/en-in/products/'), null);

// Button direction.
eq('en page => isEn true (label 繁)', detectLocale('https://support.microsoft.com/en-US/x/').isEn, true);
eq('zh page => isEn false (label EN)', detectLocale('https://support.microsoft.com/zh-TW/x/').isEn, false);

console.log(failures === 0 ? '\nAll pure-module tests passed.' : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
