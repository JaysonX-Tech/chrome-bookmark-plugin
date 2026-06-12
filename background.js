// Chrome书签首页展示插件 - 后台脚本

// 扩展安装时的初始化
chrome.runtime.onInstalled.addListener((details) => {
    console.log('书签首页展示插件已安装');

    // 设置默认配置
    chrome.storage.sync.set({
        theme: 'light',
        viewMode: 'grid',
        autoRefresh: true,
        showFavicons: true
    });

    // 如果是首次安装，显示欢迎页面
    if (details.reason === 'install') {
        chrome.tabs.create({
            url: chrome.runtime.getURL('newtab.html')
        });
    }
});

// 说明：以下三段历史代码已移除（保留注释便于未来 review）：
//
// 1. chrome.bookmarks.on{Created,Removed,Changed,Moved} → notifyNewTabPages()
//    原本广播书签变化给 newtab 页面，但：
//    - newtab.js 自己已经直接订阅了相同事件，重复触发；
//    - 过滤条件 `tab.url.includes('newtab.html')` 实际匹配不到 chrome://newtab/，
//      整条链路从未真正生效。
//
// 2. chrome.action.onClicked.addListener(...)
//    manifest 设置了 default_popup 后，工具栏点击直接弹 popup，onClicked 不会触发。
//
// 3. setInterval(cleanupCache, 60 * 60 * 1000)
//    MV3 Service Worker 大约 30 秒无活动即 idle，setInterval 跨不过 SW 重启，
//    永远跑不到 1 小时。如需周期清理请改用 chrome.alarms API
//    （需要在 manifest 中加 "alarms" 权限）。

// 消息路由 — 当前 newtab.js 直接调用 chrome.bookmarks.* API，没有用到这些消息，
// 但保留作为未来跨上下文调用（例如 content script、options 页面）的扩展点
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'getBookmarks':
            chrome.bookmarks.getTree((bookmarkTree) => {
                sendResponse({ bookmarks: bookmarkTree });
            });
            return true; // 保持消息通道开放

        case 'createBookmark':
            chrome.bookmarks.create({
                parentId: request.parentId || '1',
                title: request.title,
                url: request.url
            }, (bookmark) => {
                sendResponse({ success: true, bookmark });
            });
            return true;

        case 'updateBookmark':
            chrome.bookmarks.update(request.id, {
                title: request.title,
                url: request.url
            }, (bookmark) => {
                sendResponse({ success: true, bookmark });
            });
            return true;

        case 'removeBookmark':
            chrome.bookmarks.remove(request.id, () => {
                sendResponse({ success: true });
            });
            return true;

        case 'searchBookmarks':
            chrome.bookmarks.search(request.query, (results) => {
                sendResponse({ results });
            });
            return true;
    }
});
