// ==UserScript==
// @name         GitHub Docs Lang Switch (zh-CN)
// @name:zh-TW   GitHub Docs 中英快速切換 — 簡體中文
// @namespace    https://github.com/lettucebo/TampermonkeyScripts
// @version      0.8.3
// @description  Toggle docs.github.com pages between English (en) and Simplified Chinese (zh) with a floating top-right button.
// @description:zh-TW 在 docs.github.com 頁面右上角加一個浮動按鈕，一鍵在英文 (en) 與簡體中文 (zh) 之間切換。
// @author       lettucebo
// @match        https://docs.github.com/*/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @license      MIT
// @homepageURL  https://github.com/lettucebo/TampermonkeyScripts/tree/main/scripts/github-docs-lang-switch-cn
// @supportURL   https://github.com/lettucebo/TampermonkeyScripts/issues
// @updateURL    https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/github-docs-lang-switch-cn/github-docs-lang-switch-cn.user.js
// @downloadURL  https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/github-docs-lang-switch-cn/github-docs-lang-switch-cn.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    const m = location.href.match(/com\/(en|zh)\//);
    if (m) {
        const isEn = m[1] === 'en';
        const style = document.createElement('style');
        style.innerHTML = `
#gh-lang-switch {
    position:fixed;top:6px;right:6px;z-index:999;opacity:0.3;cursor:pointer;
    padding:2px 6px;background-color:cadetblue;color:white;font-size:11pt;
}
#gh-lang-switch:hover {
    opacity: 1;
}
`;
        document.head.appendChild(style);
        const div = document.createElement('div');
        div.innerText = isEn ? '簡' : 'EN';
        div.id = 'gh-lang-switch';
        div.onclick = function () {
            const toUrl = location.toString().replace(/com\/(en|zh)\//, `com/${(isEn ? 'zh' : 'en')}/`);
            location.href = toUrl;
        };
        document.body.appendChild(div);
    }
})();
