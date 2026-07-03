// ==UserScript==
// @name         MS Learn Lang Switch (zh-TW)
// @name:zh-TW   MS Learn 中英快速切換 — 繁體中文
// @namespace    https://github.com/lettucebo/TampermonkeyScripts
// @version      0.8.5
// @description  Toggle Microsoft Learn / *.microsoft.com pages between English (en-us) and Traditional Chinese (zh-tw) with a floating top-right button.
// @description:zh-TW 在 Microsoft Learn 或任何 *.microsoft.com 頁面右上角加一個浮動按鈕，一鍵在英文 (en-us) 與繁體中文 (zh-tw) 之間切換。
// @author       lettucebo
// @match        https://*.microsoft.com/*/*
// @run-at       document-end
// @icon         https://www.google.com/s2/favicons?sz=64&domain=microsoft.com
// @license      MIT
// @homepageURL  https://github.com/lettucebo/TampermonkeyScripts/tree/main/scripts/ms-learn-lang-switch-tw
// @supportURL   https://github.com/lettucebo/TampermonkeyScripts/issues
// @updateURL    https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ms-learn-lang-switch-tw/ms-learn-lang-switch-tw.user.js
// @downloadURL  https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ms-learn-lang-switch-tw/ms-learn-lang-switch-tw.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    const localeRe = /^\/(en-us|zh-tw)\//i;
    const m = location.pathname.match(localeRe);
    if (m) {
        const isEn = m[1].toLowerCase() === 'en-us';
        const style = document.createElement('style');
        style.innerHTML = `
#lang-switch-tw {
    position:fixed;top:40px;right:6px;z-index:999;opacity:0.3;cursor:pointer;
    padding:2px 6px;background-color:cadetblue;color:white;font-size:11pt;
    border:none; font:inherit; line-height:1;
}
#lang-switch-tw:hover, #lang-switch-tw:focus {
    opacity: 1;
    outline: 2px solid white;
    outline-offset: 1px;
}
`;
        document.head.appendChild(style);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'lang-switch-tw';
        btn.textContent = isEn ? '繁' : 'EN';
        btn.setAttribute('aria-label', isEn
            ? 'Switch to Traditional Chinese (zh-tw)'
            : 'Switch to English (en-us)');
        btn.addEventListener('click', () => {
            const url = new URL(location.href);
            url.pathname = url.pathname.replace(localeRe, `/${isEn ? 'zh-tw' : 'en-us'}/`);
            location.href = url.toString();
        });
        document.body.appendChild(btn);
    }
})();
