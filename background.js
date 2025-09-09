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

// 监听书签变化事件
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
    console.log('书签已创建:', bookmark);
    notifyNewTabPages('bookmarkCreated', { id, bookmark });
});

chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
    console.log('书签已删除:', id);
    notifyNewTabPages('bookmarkRemoved', { id, removeInfo });
});

chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
    console.log('书签已修改:', id, changeInfo);
    notifyNewTabPages('bookmarkChanged', { id, changeInfo });
});

chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
    console.log('书签已移动:', id, moveInfo);
    notifyNewTabPages('bookmarkMoved', { id, moveInfo });
});

// 通知所有新标签页更新
function notifyNewTabPages(action, data) {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (tab.url && tab.url.includes('newtab.html')) {
                chrome.tabs.sendMessage(tab.id, {
                    action: action,
                    data: data
                }).catch(() => {
                    // 忽略无法发送消息的标签页
                });
            }
        });
    });
}

// 处理来自内容脚本的消息
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

// 处理扩展图标点击
chrome.action.onClicked.addListener((tab) => {
    // 打开新标签页
    chrome.tabs.create({
        url: chrome.runtime.getURL('newtab.html')
    });
});

// 监听存储变化
chrome.storage.onChanged.addListener((changes, namespace) => {
    console.log('存储设置已更改:', changes);
    
    // 通知所有新标签页更新设置
    notifyNewTabPages('settingsChanged', changes);
});

// 定期清理缓存（可选）
setInterval(() => {
    // 清理过期的缓存数据
    chrome.storage.local.get(null, (items) => {
        const now = Date.now();
        const keysToRemove = [];
        
        Object.keys(items).forEach(key => {
            if (key.startsWith('cache_') && items[key].expiry && items[key].expiry < now) {
                keysToRemove.push(key);
            }
        });
        
        if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove);
            console.log('已清理过期缓存:', keysToRemove.length, '项');
        }
    });
}, 60000 * 60); // 每小时清理一次