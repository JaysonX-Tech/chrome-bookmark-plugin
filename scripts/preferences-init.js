// 视图模式 / 当前分类 预设 —— 同步阻塞执行，在 body 渲染前
// 把 localStorage 镜像的偏好挂到 html data-* 属性上，
// CSS 立刻吃到，避免 BookmarkManager.init() 异步切换时的闪烁。
//
// localStorage 由 saveSettings() 双写维护（chrome.storage.sync 是真源，
// localStorage 是本地同步可读镜像）。
//
// MV3 默认 CSP 禁止 inline <script>，所以提取为外部文件通过 src 加载。
(function () {
    var view = null, category = null;
    try {
        view = localStorage.getItem('viewMode');
        category = localStorage.getItem('category');
    } catch (e) {
        // localStorage 不可用（隐私模式等），用默认值
    }
    document.documentElement.dataset.view = view || 'grid';
    document.documentElement.dataset.category = category || 'folder';
})();
