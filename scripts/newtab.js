// 多语言配置
const i18n = {
    zh: {
        // 搜索相关
        searchPlaceholder: '搜索书签...',
        // 分类标签
        categoryFolder: '按文件夹',
        categoryDomain: '按网站',
        categoryRecent: '最近添加',
        categoryAll: '全部',
        // 视图切换
        gridView: '网格视图',
        listView: '列表视图',
        // 主题切换
        toggleTheme: '切换主题',
        followSystemTheme: '跟随系统主题',
        toggleLanguage: '切换语言',
        githubLink: 'Jayson X Github',
        // 空状态
        noBookmarks: '暂无书签',
        noBookmarksDesc: '开始添加一些书签来个性化您的新标签页吧！',
        noResults: '未找到匹配的书签',
        noResultsDesc: '尝试使用不同的关键词搜索',
        // 右键菜单
        menuOpen: '打开',
        menuOpenNewTab: '在新标签页中打开',
        menuEdit: '编辑',
        menuDelete: '删除',
        // 编辑模态框
        editBookmark: '编辑书签',
        editTitle: '标题:',
        editUrl: 'URL:',
        save: '保存',
        cancel: '取消',
        // 确认对话框（{title} 由代码替换为书签标题）
        confirmDelete: '确定要删除书签 "{title}" 吗？',
        // 错误信息
        initError: '初始化失败，请刷新页面重试',
        loadError: '加载书签失败',
        deleteError: '删除书签失败',
        saveError: '保存书签失败',
        errorOccurred: '出现错误',
        reload: '重新加载',
        // 其他书签
        otherBookmarks: '其他书签',
        recentAdded: '最近添加',
        allBookmarks: '所有书签',
        urlLabel: 'URL'
    },
    en: {
        // 搜索相关
        searchPlaceholder: 'Search bookmarks...',
        // 分类标签
        categoryFolder: 'Folder',
        categoryDomain: 'Domain',
        categoryRecent: 'Recent',
        categoryAll: 'All',
        // 视图切换
        gridView: 'Grid View',
        listView: 'List View',
        // 主题切换
        toggleTheme: 'Toggle Theme',
        followSystemTheme: 'Follow System Theme',
        toggleLanguage: 'Toggle Language',
        githubLink: 'Jayson X Github',
        // 空状态
        noBookmarks: 'No Bookmarks',
        noBookmarksDesc: 'Start adding some bookmarks to personalize your new tab page!',
        noResults: 'No matching bookmarks found',
        noResultsDesc: 'Try searching with different keywords',
        // 右键菜单
        menuOpen: 'Open',
        menuOpenNewTab: 'Open in new tab',
        menuEdit: 'Edit',
        menuDelete: 'Delete',
        // 编辑模态框
        editBookmark: 'Edit Bookmark',
        editTitle: 'Title:',
        editUrl: 'URL:',
        save: 'Save',
        cancel: 'Cancel',
        // 确认对话框（{title} replaced with bookmark title at runtime）
        confirmDelete: 'Are you sure you want to delete bookmark "{title}"?',
        // 错误信息
        initError: 'Initialization failed, please refresh the page and try again',
        loadError: 'Failed to load bookmarks',
        deleteError: 'Failed to delete bookmark',
        saveError: 'Failed to save bookmark',
        errorOccurred: 'An error occurred',
        reload: 'Reload',
        // 其他书签
        otherBookmarks: 'Other Bookmarks',
        recentAdded: 'Recently Added',
        allBookmarks: 'All Bookmarks',
        urlLabel: 'URL'
    }
};

// Chrome书签首页展示插件 - 主要逻辑
class BookmarkManager {
    constructor() {
        this.faviconRevision = Date.now();
        this.folderOrder = [];
        this.bookmarks = [];
        this.filteredBookmarks = [];
        this.currentCategory = 'folder';
        this.currentView = 'grid';
        this.searchQuery = '';
        this.theme = 'light';
        this.language = 'zh'; // 默认中文
        this.refreshTimeout = null; // 防抖定时器

        this.init();
    }

    // 获取当前语言的文本
    t(key) {
        return i18n[this.language][key] || key;
    }

    // 初始化
    async init() {
        try {
            await this.loadSettings();
            try {
                const saved = typeof chrome !== 'undefined' && chrome.storage?.local
                    ? (await chrome.storage.local.get('folderOrder')).folderOrder
                    : JSON.parse(localStorage.getItem('folderOrder') || '[]');
                if (Array.isArray(saved)) this.folderOrder = saved.filter(id => typeof id === 'string');
            } catch (error) { console.warn('无法读取文件夹顺序', error); }
            await this.loadBookmarks();
            // 书签变化监听器只在初始化时注册一次，避免每次刷新累积
            this.setupBookmarkListeners();
            this.setupEventListeners();
            this.applyTheme();
            this.applyLanguage();
            // 应用上次记住的视图模式(网格/列表)和分类(文件夹/网址/最近/全部) ——
            // switchView / switchCategory 内部都会触发一次 saveSettings(),init 时是冗余写,
            // 但只发生一次且无害,换来代码简单。
            this.switchView(this.currentView);
            this.switchCategory(this.currentCategory);

            // 一切就绪 —— 加 html.ready,让按钮 active 着色"由浅入深"平滑过渡出现。
            // 双 RAF：确保浏览器先完成首次 paint(中性按钮),
            // 下一帧才 add class,这样 CSS transition 才会真正触发(否则浏览器可能
            // 把 add class 和首次 paint 合并,看不到过渡)。
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    document.documentElement.classList.add('ready');
                });
            });
        } catch (error) {
            console.error('初始化失败:', error);
            this.showError(this.t('initError'));
        }
    }

    // 加载设置
    // 检查系统是否为深色模式
    isSystemDarkMode() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    async loadSettings() {
        try {
            // 检查是否在Chrome扩展环境中
            if (typeof chrome !== 'undefined' && chrome.storage) {
                const result = await chrome.storage.sync.get(['theme', 'viewMode', 'language', 'autoSystemTheme', 'category']);
                this.theme = result.theme || 'light';
                this.currentView = result.viewMode || 'grid';
                this.language = result.language || 'zh';
                this.autoSystemTheme = result.autoSystemTheme !== false; // 默认开启跟随系统主题
                this.currentCategory = result.category || 'folder';
            } else {
                // 在普通浏览器环境中使用localStorage
                this.theme = localStorage.getItem('theme') || 'light';
                this.currentView = localStorage.getItem('viewMode') || 'grid';
                this.language = localStorage.getItem('language') || 'zh';
                this.autoSystemTheme = localStorage.getItem('autoSystemTheme') !== 'false'; // 默认开启跟随系统主题
                this.currentCategory = localStorage.getItem('category') || 'folder';
            }
            
            // 跟随系统主题时，以系统当前状态为准（对称处理 dark/light），
            // 避免新标签页未打开时错过 matchMedia 的 change 事件，导致卡在旧主题
            if (this.autoSystemTheme) {
                this.theme = this.isSystemDarkMode() ? 'dark' : 'light';
            }
        } catch (error) {
            console.error('加载设置失败:', error);
        }
    }

    // 保存设置 —— 双写：chrome.storage.sync 是真源(跨设备同步)，
    // localStorage 是本地同步可读镜像，给 head 的 preferences-init.js / theme-init.js 用。
    async saveSettings() {
        // 1) localStorage 镜像（同步,任何环境都尝试写）—— 让下次打开新标签页时
        //    preferences-init.js 能在 body 渲染前立刻读到,实现 0 闪烁
        try {
            localStorage.setItem('theme', this.theme);
            localStorage.setItem('viewMode', this.currentView);
            localStorage.setItem('language', this.language);
            localStorage.setItem('autoSystemTheme', this.autoSystemTheme.toString());
            localStorage.setItem('category', this.currentCategory);
        } catch (e) {
            // localStorage 不可用（隐私模式等），跳过镜像
        }

        // 2) chrome.storage.sync 真源（仅扩展环境）—— 跨设备同步
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                await chrome.storage.sync.set({
                    theme: this.theme,
                    viewMode: this.currentView,
                    language: this.language,
                    autoSystemTheme: this.autoSystemTheme,
                    category: this.currentCategory
                });
            }
        } catch (error) {
            console.error('保存设置失败:', error);
        }
    }

    // 加载书签数据
    async loadBookmarks() {
        const containerEl = document.getElementById('bookmarksContainer');
        
        try {
            // 检查是否在Chrome扩展环境中
            if (typeof chrome !== 'undefined' && chrome.bookmarks) {
                const bookmarkTree = await chrome.bookmarks.getTree();
                this.bookmarks = this.parseBookmarkTree(bookmarkTree);
                // 监听器在 init() 中只注册一次，loadBookmarks 不再调用 setupBookmarkListeners，
                // 否则每次防抖刷新都会重复 addListener，长时间使用会内存泄漏和重复触发
            } else {
                // 在普通浏览器环境中使用模拟数据
                this.bookmarks = this.getMockBookmarks();
            }
            
            this.filteredBookmarks = [...this.bookmarks];
            
            containerEl.classList.remove('hidden');
        } catch (error) {
            console.error('加载书签失败:', error);
            this.showError('加载书签失败');
        }
    }

    // 解析书签树
    parseBookmarkTree(tree, parentPath = '') {
        const bookmarks = [];
        const folderOrder = new Map(); // 记录文件夹的原始顺序
        let folderIndex = 0;
        
        const traverse = (nodes, path, parentIndex = 0) => {
            nodes.forEach((node, index) => {
                if (node.url) {
                    // 这是一个书签
                    const bookmark = {
                        id: node.id,
                        title: node.title || '未命名书签',
                        url: node.url,
                        dateAdded: node.dateAdded,
                        parentId: node.parentId,
                        folderPath: path,
                        folderOrder: folderOrder.get(path) || 0,
                        bookmarkIndex: index, // 书签在文件夹中的位置
                        domain: this.extractDomain(node.url),
                        favicon: this.getFaviconUrl(node.url)
                    };
                    bookmarks.push(bookmark);
                } else if (node.children) {
                    // 这是一个文件夹
                    const folderPath = path ? `${path} > ${node.title}` : node.title;
                    if (!folderOrder.has(folderPath)) {
                        folderOrder.set(folderPath, folderIndex++);
                    }
                    traverse(node.children, folderPath, index);
                }
            });
        };
        
        traverse(tree, parentPath);
        return bookmarks;
    }

    // 提取域名
    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch {
            return 'unknown';
        }
    }

    // 扩展内按完整页面地址读取浏览器缓存，保留同域名不同页面的图标。
    getFaviconUrl(url) {
        try {
            const urlObj = new URL(url);
            if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
                const faviconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
                faviconUrl.searchParams.set('pageUrl', url);
                faviconUrl.searchParams.set('size', '32');
                faviconUrl.searchParams.set('_refresh', String(this.faviconRevision));
                return faviconUrl.href;
            }
            // 普通网页预览没有扩展接口，仅在此环境使用公开图标服务。
            return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
        } catch {
            return null;
        }
    }

    // 只更新图片，不重绘卡片，保留滚动位置、展开状态和拖动状态。
    refreshFavicons() {
        if (document.visibilityState !== 'visible' ||
            typeof chrome === 'undefined' || !chrome.runtime?.id) return;
        this.faviconRevision = Math.max(Date.now(), this.faviconRevision + 1);
        const byId = new Map();
        this.bookmarks.forEach(bookmark => {
            bookmark.favicon = this.getFaviconUrl(bookmark.url);
            byId.set(bookmark.id, bookmark);
        });
        document.querySelectorAll('[data-bookmark-id] img.bookmark-favicon').forEach(img => {
            const bookmark = byId.get(img.closest('[data-bookmark-id]').dataset.bookmarkId);
            if (bookmark?.favicon) img.src = bookmark.favicon;
        });
    }

    // 设置事件监听器
    setupEventListeners() {
        // 搜索功能
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        const clearSearch = document.getElementById('clearSearch');
        
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            clearSearch.hidden = !e.target.value;
            this.filterAndRenderBookmarks();
        });
        
        searchBtn.addEventListener('click', () => {
            searchInput.focus();
        });

        const clearQuery = () => {
            searchInput.value = '';
            this.searchQuery = '';
            clearSearch.hidden = true;
            this.filterAndRenderBookmarks();
            searchInput.focus();
        };
        clearSearch.addEventListener('click', clearQuery);
        searchInput.addEventListener('keydown', event => {
            if (event.key === 'Escape' && searchInput.value) {
                event.preventDefault();
                clearQuery();
            }
        });

        document.getElementById('resetFolderOrder').addEventListener('click', () => this.resetFolderOrder());

        // 分类切换
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchCategory(e.target.dataset.category);
            });
        });

        // 视图切换
        document.getElementById('gridView').addEventListener('click', () => {
            this.switchView('grid');
        });
        
        document.getElementById('listView').addEventListener('click', () => {
            this.switchView('list');
        });

        // 主题切换
        document.getElementById('themeToggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        // 语言切换
        document.getElementById('languageToggle').addEventListener('click', () => {
            this.toggleLanguage();
        });

        // GitHub链接
        document.getElementById('githubLink').addEventListener('click', () => {
            window.open('https://github.com/JaysonX-Tech/chrome-bookmark-plugin', '_blank');
        });

        // 返回页面时刷新一次，并稍后补读一次，给浏览器图标缓存留出更新时间。
        const scheduleFaviconRefresh = () => {
            clearTimeout(this.faviconRefreshTimer);
            clearTimeout(this.faviconRetryTimer);
            if (document.visibilityState !== 'visible') return;
            this.faviconRefreshTimer = setTimeout(() => {
                this.refreshFavicons();
                this.faviconRetryTimer = setTimeout(() => this.refreshFavicons(), 2000);
            }, 150);
        };
        document.addEventListener('visibilitychange', scheduleFaviconRefresh);
        window.addEventListener('focus', scheduleFaviconRefresh);
        window.addEventListener('pageshow', scheduleFaviconRefresh);

        // 系统主题变化监听
        this.setupSystemThemeListener();

        // 右键菜单
        this.setupContextMenu();

        // 编辑模态框
        this.setupEditModal();

        // 窗口大小变化时重排瀑布流(150ms 防抖,避免拖拽时频繁布局)
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this.layoutMasonry(), 150);
        });
    }

    // 获取模拟书签数据（仅用于非扩展环境下的本地预览/调试，请勿写入任何真实业务 URL）
    getMockBookmarks() {
        return [
            {
                id: '1',
                title: 'GitHub',
                url: 'https://github.com',
                dateAdded: Date.now() - 86400000,
                parentId: 'dev',
                folderPath: '开发工具',
                domain: 'github.com',
                favicon: 'https://www.google.com/s2/favicons?domain=github.com&sz=32'
            },
            {
                id: '2',
                title: 'MDN Web Docs',
                url: 'https://developer.mozilla.org/',
                dateAdded: Date.now() - 172800000,
                parentId: 'dev',
                folderPath: '开发工具',
                domain: 'developer.mozilla.org',
                favicon: 'https://www.google.com/s2/favicons?domain=developer.mozilla.org&sz=32'
            },
            {
                id: '3',
                title: 'Stack Overflow',
                url: 'https://stackoverflow.com',
                dateAdded: Date.now() - 259200000,
                parentId: 'dev',
                folderPath: '开发工具',
                domain: 'stackoverflow.com',
                favicon: 'https://www.google.com/s2/favicons?domain=stackoverflow.com&sz=32'
            },
            {
                id: '4',
                title: 'Wikipedia',
                url: 'https://www.wikipedia.org',
                dateAdded: Date.now() - 345600000,
                parentId: 'reference',
                folderPath: '参考资料',
                domain: 'wikipedia.org',
                favicon: 'https://www.google.com/s2/favicons?domain=wikipedia.org&sz=32'
            },
            {
                id: '5',
                title: 'Google Scholar',
                url: 'https://scholar.google.com',
                dateAdded: Date.now() - 432000000,
                parentId: 'reference',
                folderPath: '参考资料',
                domain: 'scholar.google.com',
                favicon: 'https://www.google.com/s2/favicons?domain=scholar.google.com&sz=32'
            },
            {
                id: '6',
                title: 'YouTube',
                url: 'https://www.youtube.com',
                dateAdded: Date.now() - 518400000,
                parentId: 'media',
                folderPath: '娱乐',
                domain: 'youtube.com',
                favicon: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=32'
            },
            {
                id: '7',
                title: 'Bilibili',
                url: 'https://www.bilibili.com',
                dateAdded: Date.now() - 604800000,
                parentId: 'media',
                folderPath: '娱乐',
                domain: 'bilibili.com',
                favicon: 'https://www.google.com/s2/favicons?domain=bilibili.com&sz=32'
            },
            {
                id: '8',
                title: '掘金',
                url: 'https://juejin.cn/recommended',
                dateAdded: Date.now() - 691200000,
                parentId: 'websites',
                folderPath: '常用网站',
                domain: 'juejin.cn',
                favicon: 'https://www.google.com/s2/favicons?domain=juejin.cn&sz=32'
            },
            {
                id: '9',
                title: '知乎',
                url: 'https://www.zhihu.com',
                dateAdded: Date.now() - 777600000,
                parentId: 'websites',
                folderPath: '常用网站',
                domain: 'zhihu.com',
                favicon: 'https://www.google.com/s2/favicons?domain=zhihu.com&sz=32'
            },
            {
                id: '10',
                title: 'Hacker News',
                url: 'https://news.ycombinator.com',
                dateAdded: Date.now() - 864000000,
                parentId: 'websites',
                folderPath: '常用网站',
                domain: 'news.ycombinator.com',
                favicon: 'https://www.google.com/s2/favicons?domain=news.ycombinator.com&sz=32'
            }
        ];
    }

    // 设置书签变化监听
    setupBookmarkListeners() {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            // 监听来自background.js的消息
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.action && message.action.startsWith('bookmark')) {
                    console.log('收到书签变化通知:', message.action, message.data);
                    this.debouncedRefresh();
                }
            });
        }
        
        // 备用：直接监听书签API（如果消息机制失效）
        if (typeof chrome !== 'undefined' && chrome.bookmarks) {
            chrome.bookmarks.onCreated.addListener(() => {
                this.debouncedRefresh();
            });
            
            chrome.bookmarks.onRemoved.addListener(() => {
                this.debouncedRefresh();
            });
            
            chrome.bookmarks.onChanged.addListener(() => {
                this.debouncedRefresh();
            });
            
            chrome.bookmarks.onMoved.addListener(() => {
                this.debouncedRefresh();
            });
        }
    }

    // 防抖刷新书签数据
    debouncedRefresh() {
        if (this.bookmarkMoving || this.draggedBookmark) { this.bookmarkRefreshPending = true; return; }
        // 清除之前的定时器
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        
        // 设置新的定时器，300ms后执行刷新
        this.refreshTimeout = setTimeout(() => {
            console.log('执行防抖刷新书签数据');
            this.loadBookmarks().then(() => {
                // 刷新完成后重新渲染当前视图
                this.filterAndRenderBookmarks();
            }).catch(error => {
                console.error('防抖刷新失败:', error);
            });
            this.refreshTimeout = null;
        }, 300);
    }

    // 切换分类
    switchCategory(category) {
        this.currentCategory = category;
        // 同步写 html data 属性 —— CSS 立刻吃到（与 preferences-init.js 用同一套选择器）
        document.documentElement.dataset.category = category;

        // 更新标签状态
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-category="${category}"]`).classList.add('active');

        this.filterAndRenderBookmarks();
        this.saveSettings(); // 记住用户选择,刷新后保持
    }

    // 切换视图
    switchView(view) {
        this.currentView = view;
        // 同步写 html data 属性 —— CSS 立刻吃到（与 preferences-init.js 用同一套选择器）
        document.documentElement.dataset.view = view;

        // 更新按钮状态
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(view + 'View').classList.add('active');

        // 更新容器类名
        const container = document.getElementById('bookmarksContainer');
        if (view === 'list') {
            container.classList.add('list-view');
        } else {
            container.classList.remove('list-view');
        }

        this.saveSettings();
        // 视图切换后列数变了(grid 3 列 → list 1 列),必须重排瀑布流。
        // CSS 的 .list-view / html[data-view] 规则在 JS 接管模式下不再决定布局,
        // 真正的列数由 layoutMasonry() 根据 this.currentView 计算。
        this.layoutMasonry();
    }

    // 切换主题
    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        this.applyTheme();
        this.saveSettings();
    }

    // 应用主题
    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        const themeBtn = document.getElementById('themeToggle');
        themeBtn.textContent = this.theme === 'light' ? '🌙' : '☀️';
        themeBtn.title = this.t('toggleTheme');
    }

    // 切换语言
    toggleLanguage() {
        this.language = this.language === 'zh' ? 'en' : 'zh';
        this.applyLanguage();
        this.saveSettings();
        // 重新渲染界面以应用新语言
        this.filterAndRenderBookmarks();
    }

    // 应用语言
    applyLanguage() {
        document.documentElement.lang = this.language === 'zh' ? 'zh-CN' : 'en';
        const languageBtn = document.getElementById('languageToggle');
        languageBtn.textContent = this.language === 'zh' ? '中' : 'EN';
        languageBtn.title = this.t('toggleLanguage');
        
        // 更新页面标题
        document.title = this.language === 'zh' ? '书签首页' : 'Bookmark Canvas';
        
        // 更新搜索框占位符
        const searchInput = document.getElementById('searchInput');
        searchInput.placeholder = this.t('searchPlaceholder');
        searchInput.setAttribute('aria-label', this.t('searchPlaceholder'));
        document.getElementById('searchBtn').setAttribute('aria-label', this.t('searchPlaceholder'));
        document.getElementById('clearSearch').setAttribute('aria-label', this.language === 'zh' ? '清空搜索' : 'Clear search');
        
        // 更新分类标签
        const categoryTabs = document.querySelectorAll('.category-tab');
        categoryTabs.forEach(tab => {
            const category = tab.dataset.category;
            switch(category) {
                case 'folder':
                    tab.textContent = this.t('categoryFolder');
                    break;
                case 'domain':
                    tab.textContent = this.t('categoryDomain');
                    break;
                case 'recent':
                    tab.textContent = this.t('categoryRecent');
                    break;
                case 'all':
                    tab.textContent = this.t('categoryAll');
                    break;
            }
        });
        
        // 更新视图切换按钮
        document.getElementById('gridView').title = this.t('gridView');
        document.getElementById('listView').title = this.t('listView');
        
        // 更新GitHub按钮
        document.getElementById('githubLink').title = this.t('githubLink');
        
        // 更新主题按钮
        document.getElementById('themeToggle').title = this.t('toggleTheme');
        
        // 更新空状态文本
        const emptyState = document.getElementById('emptyState');
        if (emptyState) {
            const h3 = emptyState.querySelector('h3');
            const p = emptyState.querySelector('p');
            if (h3) h3.textContent = this.t('noBookmarks');
            if (p) p.textContent = this.t('noBookmarksDesc');
        }
        
        // 更新无结果状态文本
        const noResults = document.getElementById('noResults');
        if (noResults) {
            const h3 = noResults.querySelector('h3');
            const p = noResults.querySelector('p');
            if (h3) h3.textContent = this.t('noResults');
            if (p) p.textContent = this.t('noResultsDesc');
        }
        
        // 更新右键菜单
        this.updateContextMenu();
        
        // 更新编辑模态框
        this.updateEditModal();
    }

    // 过滤和渲染书签
    filterAndRenderBookmarks() {
        let filtered = [...this.bookmarks];
        
        // 搜索过滤
        if (this.searchQuery) {
            filtered = filtered.filter(bookmark => 
                bookmark.title.toLowerCase().includes(this.searchQuery) ||
                bookmark.url.toLowerCase().includes(this.searchQuery) ||
                bookmark.domain.toLowerCase().includes(this.searchQuery)
            );
        }
        
        // 分类过滤
        switch (this.currentCategory) {
            case 'recent':
                filtered = filtered
                    .sort((a, b) => b.dateAdded - a.dateAdded)
                    .slice(0, 50);
                break;
            case 'folder':
            case 'domain':
                // 这些在渲染时处理分组
                break;
        }
        
        this.filteredBookmarks = filtered;
        this.renderBookmarks();
    }

    // 渲染书签
    renderBookmarks() {
        const resetButton = document.getElementById('resetFolderOrder');
        resetButton.hidden = this.currentCategory !== 'folder';
        resetButton.disabled = !this.folderOrder.length || !!this.orderSaving;
        resetButton.textContent = this.language === 'zh' ? '↺ 恢复顺序' : '↺ Reset order';
        resetButton.title = this.language === 'zh' ? '恢复为浏览器书签中的文件夹顺序' : 'Restore browser bookmark folder order';
        const container = document.getElementById('bookmarksContainer');
        const emptyState = document.getElementById('emptyState');
        const noResults = document.getElementById('noResults');
        
        // 设置容器的分类属性，用于CSS样式控制
        container.setAttribute('data-category', this.currentCategory);
        
        // 清空容器
        container.innerHTML = '';
        
        if (this.filteredBookmarks.length === 0) {
            container.classList.add('hidden');
            if (this.searchQuery) {
                noResults.classList.remove('hidden');
                emptyState.classList.add('hidden');
            } else {
                emptyState.classList.remove('hidden');
                noResults.classList.add('hidden');
            }
            return;
        }
        
        container.classList.remove('hidden');
        emptyState.classList.add('hidden');
        noResults.classList.add('hidden');
        
        // 根据分类方式分组
        const groups = this.groupBookmarks(this.filteredBookmarks);
        
        // 渲染分组
        groups.forEach(group => {
            const groupEl = this.createBookmarkGroup(group, groups);
            container.appendChild(groupEl);
        });

        // 启用 JS 瀑布流接管布局,然后用"行优先 + 最矮列"算法重排,
        // 让卡片视觉顺序跟书签栏顺序一致(默认 CSS multi-column 是列优先)
        container.classList.add('masonry-js');
        this.layoutMasonry();
    }

    // 瀑布流布局(Pinterest 风格 —— 行优先 + 最矮列追加)
    layoutMasonry() {
        const container = document.getElementById('bookmarksContainer');
        if (!container || container.classList.contains('hidden')) return;

        const cards = Array.from(container.querySelectorAll(':scope > .bookmark-group'));
        if (this.folderDragPreview) {
            const ranks = new Map(this.folderDragPreview.map((id, index) => [id, index]));
            cards.sort((a, b) => ranks.get(a.dataset.groupId) - ranks.get(b.dataset.groupId));
        }
        if (cards.length === 0) {
            container.style.height = '';
            return;
        }

        // 决定列数 —— 跟原 CSS media query 一致
        const cw = container.clientWidth;
        const singleColCategory = this.currentCategory === 'recent' || this.currentCategory === 'all';
        let cols;
        if (this.currentView === 'list' || singleColCategory || cw < 768) {
            cols = 1;
        } else if (cw < 1200) {
            cols = 2;
        } else {
            cols = 3;
        }

        const gap = 24;
        const colW = cols === 1 ? cw : Math.floor((cw - (cols - 1) * gap) / cols);

        // 先批量设宽度,触发一次 reflow,再统一读 offsetHeight 性能更好
        cards.forEach(card => {
            card.style.width = colW + 'px';
        });

        // 行优先放置:遍历卡片(=书签栏顺序),每张放到当前最矮列
        const colHeights = new Array(cols).fill(0);
        cards.forEach(card => {
            // 选最矮列
            let minIdx = 0;
            for (let i = 1; i < cols; i++) {
                if (colHeights[i] < colHeights[minIdx]) minIdx = i;
            }
            const x = minIdx * (colW + gap);
            const y = colHeights[minIdx];
            card.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            colHeights[minIdx] += card.offsetHeight + gap;
        });

        // 容器高度 = 最高列(减最后一个无用 gap)
        container.style.height = (Math.max(...colHeights) - gap) + 'px';
    }

    // 分组书签
    groupBookmarks(bookmarks) {
        const groups = new Map();
        
        bookmarks.forEach(bookmark => {
            let groupKey;
            let groupTitle;
            let groupIcon;
            let groupOrder = 0;
            
            switch (this.currentCategory) {
                case 'folder':
                    groupKey = bookmark.parentId || bookmark.folderPath || this.t('otherBookmarks');
                    groupTitle = bookmark.folderPath || this.t('otherBookmarks');
                    groupIcon = '';
                    groupOrder = bookmark.folderOrder || 0;
                    break;
                case 'domain':
                    groupKey = bookmark.domain;
                    groupTitle = bookmark.domain;
                    groupIcon = '';
                    break;
                case 'recent':
                    groupKey = 'recent';
                    groupTitle = this.t('recentAdded');
                    groupIcon = '';
                    break;
                default:
                    groupKey = 'all';
                    groupTitle = this.t('allBookmarks');
                    groupIcon = '';
            }
            
            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    id: String(groupKey),
                    title: groupTitle,
                    icon: groupIcon,
                    order: groupOrder,
                    bookmarks: []
                });
            }
            
            groups.get(groupKey).bookmarks.push(bookmark);
        });
        
        // 转换为数组并按原始顺序排序
        const groupsArray = Array.from(groups.values());
        
        // 根据分类方式决定排序规则
        if (this.currentCategory === 'folder') {
            // 按文件夹的原始顺序排序
            const ranks = new Map(this.folderOrder.map((id, index) => [id, index]));
            groupsArray.sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity) || a.order - b.order);
            // 同时保持每个文件夹内书签的原始顺序
            groupsArray.forEach(group => {
                group.bookmarks.sort((a, b) => (a.bookmarkIndex || 0) - (b.bookmarkIndex || 0));
            });
        } else if (this.currentCategory === 'recent') {
            // 最近添加保持时间顺序
            groupsArray.forEach(group => {
                group.bookmarks.sort((a, b) => b.dateAdded - a.dateAdded);
            });
        } else if (this.currentCategory === 'domain') {
            // 域名分组按字母顺序
            groupsArray.sort((a, b) => a.title.localeCompare(b.title));
        }
        
        return groupsArray;
    }

    // 创建书签分组元素
    createBookmarkGroup(group, groups = []) {
        const groupEl = document.createElement('div');
        groupEl.className = 'bookmark-group';
        groupEl.dataset.groupId = group.id;

        const labels = document.createElement('div');
        labels.className = 'folder-labels';
        const title = document.createElement('h2');
        title.className = 'folder-name';
        const parts = group.title.split(' > ');
        const isFolder = this.currentCategory === 'folder';
        const name = isFolder ? parts[parts.length - 1] : group.title;
        const fullPath = isFolder ? parts.join(' / ') : group.title;
        title.textContent = name;
        title.title = fullPath;
        labels.appendChild(title);
        if (isFolder) {
            const peers = groups.filter(other => other.title !== group.title && other.title.split(' > ').pop() === name);
            if (peers.length && parts.length > 1) {
                let depth = 1;
                const parents = parts.slice(0, -1);
                while (depth < parents.length && peers.some(other =>
                    other.title.split(' > ').slice(0, -1).slice(-depth).join(' / ') === parents.slice(-depth).join(' / ')
                )) depth++;
                const parent = document.createElement('span');
                parent.className = 'folder-parent';
                parent.textContent = '· ' + parents.slice(-depth).join(' / ');
                parent.title = fullPath;
                labels.appendChild(parent);
            }
            const info = document.createElement('span');
            info.className = 'folder-info';
            const svgNS = 'http://www.w3.org/2000/svg';
            const icon = document.createElementNS(svgNS, 'svg');
            icon.setAttribute('viewBox', '0 0 24 24');
            icon.setAttribute('width', '20');
            icon.setAttribute('height', '20');
            icon.setAttribute('fill', 'none');
            icon.setAttribute('stroke', 'currentColor');
            icon.setAttribute('stroke-width', '1.8');
            icon.setAttribute('stroke-linecap', 'round');
            icon.setAttribute('aria-hidden', 'true');
            const circle = document.createElementNS(svgNS, 'circle');
            circle.setAttribute('cx', '12');
            circle.setAttribute('cy', '12');
            circle.setAttribute('r', '9');
            const stem = document.createElementNS(svgNS, 'path');
            stem.setAttribute('d', 'M12 11v6');
            const dot = document.createElementNS(svgNS, 'circle');
            dot.setAttribute('cx', '12');
            dot.setAttribute('cy', '7.5');
            dot.setAttribute('r', '1');
            dot.setAttribute('fill', 'currentColor');
            dot.setAttribute('stroke', 'none');
            icon.append(circle, stem, dot);
            info.appendChild(icon);
            info.tabIndex = 0;
            info.setAttribute('aria-label', fullPath);
            const tooltip = document.createElement('span');
            tooltip.className = 'folder-tooltip';
            tooltip.textContent = fullPath;
            info.appendChild(tooltip);
            labels.appendChild(info);
        }
        const count = document.createElement('span');
        count.className = 'folder-total';
        count.textContent = `(${group.bookmarks.length})`;
        title.insertAdjacentElement('afterend', count);

        const tableEl = document.createElement('table');
        tableEl.className = 'bookmark-table';
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const iconHeader = document.createElement('th');
        const pathInfo = labels.querySelector('.folder-info');
        if (pathInfo) iconHeader.appendChild(pathInfo);
        const nameHeader = document.createElement('th');
        nameHeader.scope = 'col';
        nameHeader.appendChild(labels);
        const urlHeader = document.createElement('th');
        urlHeader.scope = 'col';
        const urlHeading = document.createElement('div');
        urlHeading.className = 'folder-url-heading';
        const urlLabel = document.createElement('span');
        urlLabel.textContent = this.t('urlLabel');
        urlHeading.appendChild(urlLabel);
        urlHeader.appendChild(urlHeading);
        headerRow.append(iconHeader, nameHeader, urlHeader);
        thead.appendChild(headerRow);
        tableEl.appendChild(thead);
        if (isFolder && !this.searchQuery) this.setupFolderDrag(groupEl, thead, group);
        if (isFolder) this.setupBookmarkDrop(groupEl, group);
        // 创建表体
        const tbodyEl = document.createElement('tbody');
        tbodyEl.className = 'bookmark-list';

        group.bookmarks.forEach(bookmark => {
            const rowEl = this.createBookmarkTableRow(bookmark);
            tbodyEl.appendChild(rowEl);
        });

        tableEl.appendChild(tbodyEl);
        groupEl.appendChild(tableEl);

        if (group.bookmarks.length > 10 && !this.searchQuery) {
            const key = this.currentCategory + ':' + group.title;
            this.expandedGroups ||= new Set();
            const toggle = document.createElement('button');
            toggle.className = 'folder-expand';
            const update = () => {
                const expanded = this.expandedGroups.has(key);
                Array.from(tbodyEl.children).forEach((row, index) => {
                    row.hidden = !expanded && index >= 8;
                    row.classList.toggle('last-visible-row', index === (expanded ? group.bookmarks.length - 1 : 7));
                });
                toggle.setAttribute('aria-expanded', String(expanded));
                toggle.textContent = expanded
                    ? (this.language === 'zh' ? '收起 ↑' : 'Show less ↑')
                    : (this.language === 'zh' ? `展开其余 ${group.bookmarks.length - 8} 条 ↓` : `Show ${group.bookmarks.length - 8} more ↓`);
            };
            toggle.addEventListener('click', () => {
                if (this.expandedGroups.has(key)) this.expandedGroups.delete(key);
                else this.expandedGroups.add(key);
                update();
                this.layoutMasonry();
            });
            update();
            groupEl.appendChild(toggle);
        }

        return groupEl;
    }

    // 仅调整首页展示顺序，不移动浏览器书签目录。
    setupFolderDrag(card, heading, group) {
        card.classList.add('folder-draggable');
        const hint = this.language === 'zh' ? '拖动顶部调整顺序' : 'Drag header to reorder';
        heading.title = hint;
        // 只有表头和卡片顶部空白可发起拖动，链接和展开按钮保持原有行为。
        card.addEventListener('mousedown', event => {
            card.draggable = event.button === 0 &&
                (heading.contains(event.target) || (event.target === card && event.clientY < heading.getBoundingClientRect().bottom)) &&
                !event.target.closest('.folder-info');
        });
        card.addEventListener('dragstart', event => {
            if (event.target !== card) return;
            if (!card.draggable || this.orderSaving || this.bookmarkMoving) { event.preventDefault(); return; }
            this.clearOrderNotice();
            this.draggedFolder = group.id;
            this.folderDragPreview = this.groupBookmarks(this.bookmarks).map(item => item.id);
            this.folderDragLastMove = 0;
            this.folderDragPoint = null;
            card.parentElement.classList.add('folder-sorting');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', group.id);
            card.classList.add('folder-dragging');
        });
        const container = card.parentElement || document.getElementById('bookmarksContainer');
        if (!container.dataset.dragBound) {
            container.dataset.dragBound = 'true';
            container.addEventListener('dragover', event => {
                if (this.draggedFolder) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                }
            });
            container.addEventListener('drop', event => {
                if (!this.draggedFolder) return;
                event.preventDefault();
                this.finishFolderDrag(true);
            });
        }
        card.addEventListener('dragover', event => {
            if (!this.draggedFolder || this.draggedFolder === group.id) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            // 动画完成且指针确实移动后再换位，避免卡片在静止鼠标下反复跳动。
            const now = performance.now();
            if (now - this.folderDragLastMove < 240) return;
            const point = this.folderDragPoint;
            if (point && Math.hypot(event.clientX - point.x, event.clientY - point.y) < 8) return;
            const order = [...this.folderDragPreview];
            const from = order.indexOf(this.draggedFolder);
            const to = order.indexOf(group.id);
            order.splice(from, 1);
            order.splice(to, 0, this.draggedFolder);
            this.folderDragPreview = order;
            this.folderDragLastMove = now;
            this.folderDragPoint = { x: event.clientX, y: event.clientY };
            this.layoutMasonry();
        });
        card.addEventListener('dragend', () => {
            card.draggable = false;
            card.classList.remove('folder-dragging');
            if (this.draggedFolder) this.finishFolderDrag(false);
        });
    }

    async storeFolderOrder(order) {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            if (order.length) await chrome.storage.local.set({ folderOrder: order });
            else await chrome.storage.local.remove('folderOrder');
        } else {
            if (order.length) localStorage.setItem('folderOrder', JSON.stringify(order));
            else localStorage.removeItem('folderOrder');
        }
    }

    clearOrderNotice() {
        clearTimeout(this.orderNoticeTimer);
        document.getElementById('orderNotice')?.remove();
    }

    async resetFolderOrder() {
        if (this.orderSaving || !this.folderOrder.length) return;
        const previous = [...this.folderOrder];
        this.orderSaving = true;
        document.getElementById('resetFolderOrder').disabled = true;
        try {
            await this.storeFolderOrder([]);
            this.folderOrder = [];
            this.clearOrderNotice();
            const notice = document.createElement('div');
            notice.id = 'orderNotice';
            notice.className = 'order-notice';
            notice.setAttribute('role', 'status');
            const label = document.createElement('span');
            label.textContent = this.language === 'zh' ? '已恢复顺序' : 'Order restored';
            const undo = document.createElement('button');
            undo.textContent = this.language === 'zh' ? '撤销' : 'Undo';
            undo.addEventListener('click', async () => {
                if (this.orderSaving) return;
                this.orderSaving = true;
                undo.disabled = true;
                clearTimeout(this.orderNoticeTimer);
                try {
                    await this.storeFolderOrder(previous);
                    this.folderOrder = previous;
                } catch (error) {
                    alert(this.language === 'zh' ? '撤销失败，请重试' : 'Could not undo. Please retry.');
                } finally {
                    this.orderSaving = false;
                    this.clearOrderNotice();
                    this.renderBookmarks();
                }
            });
            notice.append(label, undo);
            document.body.appendChild(notice);
            this.orderNoticeTimer = setTimeout(() => this.clearOrderNotice(), 8000);
        } catch (error) {
            alert(this.language === 'zh' ? '恢复失败，请重试' : 'Could not restore order. Please retry.');
        } finally {
            this.orderSaving = false;
            this.renderBookmarks();
        }
    }

    async finishFolderDrag(commit) {
        const previous = this.folderOrder;
        const order = this.folderDragPreview;
        this.draggedFolder = null;
        this.folderDragPreview = null;
        const container = document.getElementById('bookmarksContainer');
        container.classList.remove('folder-sorting');
        container.querySelectorAll('.folder-dragging').forEach(card => {
            card.classList.remove('folder-dragging');
            card.draggable = false;
        });
        if (commit && order) {
            this.folderOrder = order;
            this.orderSaving = true;
            document.getElementById('resetFolderOrder').disabled = true;
            try {
                await this.storeFolderOrder(order);
            } catch (error) {
                this.folderOrder = previous;
                alert(this.language === 'zh' ? '顺序保存失败，请重试' : 'Could not save order. Please retry.');
            }
        }
        this.orderSaving = false;
        this.renderBookmarks();
    }

    clearBookmarkDrop() {
        document.querySelectorAll('.bookmark-drop-before, .bookmark-drop-after, .bookmark-drop-folder').forEach(el => {
            el.classList.remove('bookmark-drop-before', 'bookmark-drop-after', 'bookmark-drop-folder');
        });
    }

    setupBookmarkRowDrag(row, bookmark) {
        row.draggable = true;
        row.classList.add('bookmark-row-draggable');
        row.addEventListener('dragstart', event => {
            event.stopPropagation();
            if (this.bookmarkMoving || this.draggedFolder || this.orderSaving) { event.preventDefault(); return; }
            this.draggedBookmark = bookmark.id;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', bookmark.id);
            row.classList.add('bookmark-row-dragging');
        });
        row.addEventListener('dragend', event => {
            event.stopPropagation();
            this.draggedBookmark = null;
            row.classList.remove('bookmark-row-dragging');
            this.clearBookmarkDrop();
            if (this.bookmarkRefreshPending && !this.bookmarkMoving) {
                this.bookmarkRefreshPending = false;
                this.debouncedRefresh();
            }
        });
    }

    setupBookmarkDrop(card, group) {
        const targetAt = event => {
            const row = event.target.closest('tr[data-bookmark-id]');
            if (!row || !card.contains(row)) return { parentId: group.id };
            const rect = row.getBoundingClientRect();
            return { parentId: group.id, anchorId: row.dataset.bookmarkId,
                after: event.clientY >= rect.top + rect.height / 2, row };
        };
        card.addEventListener('dragover', event => {
            if (!this.draggedBookmark || this.bookmarkMoving) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'move';
            this.clearBookmarkDrop();
            const target = targetAt(event);
            if (target.anchorId === this.draggedBookmark) return;
            if (target.row) target.row.classList.add(target.after ? 'bookmark-drop-after' : 'bookmark-drop-before');
            else card.classList.add('bookmark-drop-folder');
        });
        card.addEventListener('dragleave', event => {
            if (!card.contains(event.relatedTarget)) this.clearBookmarkDrop();
        });
        card.addEventListener('drop', async event => {
            if (!this.draggedBookmark || this.bookmarkMoving) return;
            event.preventDefault();
            event.stopPropagation();
            const id = this.draggedBookmark;
            this.draggedBookmark = null;
            const target = targetAt(event);
            this.clearBookmarkDrop();
            if (id === target.anchorId) return;
            this.bookmarkMoving = true;
            card.classList.add('bookmark-saving');
            try {
                await this.moveBookmarkTo(id, target);
            } catch (error) {
                console.error('移动书签失败', error);
                alert(this.language === 'zh' ? '移动失败，书签可能已被修改或目标文件夹不允许编辑。请刷新后重试。' : 'Move failed. The bookmark may have changed or the folder may be read-only. Refresh and retry.');
            } finally {
                clearTimeout(this.refreshTimeout);
                await this.loadBookmarks();
                this.bookmarkMoving = false;
                this.bookmarkRefreshPending = false;
                this.filterAndRenderBookmarks();
            }
        });
    }

    async moveBookmarkTo(id, target) {
        const [source] = await chrome.bookmarks.get(id);
        if (!source?.url || source.unmodifiable) throw new Error('Bookmark is not editable');
        const [folder] = await chrome.bookmarks.get(target.parentId);
        if (!folder || folder.url || folder.unmodifiable) throw new Error('Folder is not editable');
        // 实时读取所有子节点（含子文件夹），不用过滤后的可见行号作为真实索引。
        const children = await chrome.bookmarks.getChildren(target.parentId);
        let index = children.length;
        if (target.anchorId) {
            const anchorIndex = children.findIndex(child => child.id === target.anchorId);
            if (anchorIndex < 0) throw new Error('Drop target changed');
            index = anchorIndex + (target.after ? 1 : 0);
        }
        // Chrome move 的 index 是移除源节点之前的位置；同目录下移由浏览器修正。
        return chrome.bookmarks.move(id, { parentId: target.parentId, index });
    }

    // 创建书签表格行元素
    createBookmarkTableRow(bookmark) {
        const rowEl = document.createElement('tr');
        // 不要给 tr 加 .bookmark-item class — CSS 中 .bookmark-item { display:none }
        // 会把所有行藏掉。右键菜单监听器通过 [data-bookmark-id] 定位即可。
        rowEl.dataset.bookmarkId = bookmark.id;
        if (this.currentCategory === 'folder' && typeof chrome !== 'undefined' && chrome.bookmarks?.move) this.setupBookmarkRowDrag(rowEl, bookmark);

        // favicon 列
        const faviconCellEl = document.createElement('td');
        faviconCellEl.className = 'bookmark-favicon-cell';
        faviconCellEl.appendChild(this.createFaviconElement(bookmark));

        // 标题列
        const titleCellEl = document.createElement('td');
        const titleLinkEl = document.createElement('a');
        titleLinkEl.href = bookmark.url;
        titleLinkEl.draggable = false;
        titleLinkEl.textContent = bookmark.title;
        titleLinkEl.title = `${bookmark.title}\n${bookmark.url}`;
        titleCellEl.appendChild(titleLinkEl);


        // URL列
        const urlCellEl = document.createElement('td');
        const urlLinkEl = document.createElement('a');
        urlLinkEl.href = bookmark.url;
        urlLinkEl.draggable = false;
        urlLinkEl.textContent = bookmark.url;
        urlLinkEl.title = bookmark.url;
        urlCellEl.appendChild(urlLinkEl);

        rowEl.appendChild(faviconCellEl);
        rowEl.appendChild(titleCellEl);
        rowEl.appendChild(urlCellEl);

        return rowEl;
    }

    // 创建 favicon 元素；扩展环境的图标来自浏览器缓存。
    // 这是预期行为，不再做首字母圆 fallback。
    createFaviconElement(bookmark) {
        const img = document.createElement('img');
        img.className = 'bookmark-favicon';
        img.alt = '';
        img.draggable = false;
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        if (bookmark.favicon) img.src = bookmark.favicon;
        return img;
    }
    
    // 保留原有的书签项目创建方法作为备用
    createBookmarkItem(bookmark) {
        const itemEl = document.createElement('a');
        itemEl.className = 'bookmark-item';
        itemEl.href = bookmark.url;
        itemEl.dataset.bookmarkId = bookmark.id;
        
        const faviconEl = document.createElement('img');
        faviconEl.className = 'bookmark-favicon';
        faviconEl.src = bookmark.favicon;
        faviconEl.onerror = () => {
            faviconEl.style.display = 'none';
            const defaultEl = document.createElement('div');
            defaultEl.className = 'bookmark-favicon default';
            defaultEl.textContent = bookmark.title.charAt(0).toUpperCase();
            itemEl.insertBefore(defaultEl, faviconEl.nextSibling);
        };
        
        const infoEl = document.createElement('div');
        infoEl.className = 'bookmark-info';
        
        const titleEl = document.createElement('div');
        titleEl.className = 'bookmark-title';
        titleEl.textContent = bookmark.title;
        titleEl.title = bookmark.title;
        
        const urlEl = document.createElement('div');
        urlEl.className = 'bookmark-url';
        urlEl.textContent = bookmark.domain;
        urlEl.title = bookmark.url;
        
        infoEl.appendChild(titleEl);
        infoEl.appendChild(urlEl);
        
        itemEl.appendChild(faviconEl);
        itemEl.appendChild(infoEl);
        
        return itemEl;
    }

    // 切换分组展开/折叠 —— 已移除,表头不再可点击
    // toggleGroup(groupEl, headerEl) { ... }

    // 设置系统主题变化监听
    setupSystemThemeListener() {
        if (window.matchMedia) {
            const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
            
            // 监听系统主题变化(跟随系统时不写回 storage,storage 只记用户的显式选择)
            darkModeQuery.addEventListener('change', (e) => {
                if (this.autoSystemTheme) {
                    this.theme = e.matches ? 'dark' : 'light';
                    this.applyTheme();
                }
            });
        }
    }

    // 设置右键菜单
    setupContextMenu() {
        const contextMenu = document.getElementById('contextMenu');
        let currentBookmarkId = null;
        
        document.addEventListener('contextmenu', (e) => {
            // 用 data 属性定位书签节点（兼容 table 行和旧的 grid item 两种结构）；
            // 不能用 .bookmark-item，CSS 中该 class 是 display:none，table 行不能挂它
            const bookmarkItem = e.target.closest('[data-bookmark-id]');
            if (bookmarkItem) {
                e.preventDefault();
                currentBookmarkId = bookmarkItem.dataset.bookmarkId;

                // .context-menu 是 position: fixed,所以用 viewport 坐标(clientX/Y)。
                // 不能用 pageX/Y(那是相对 document 的坐标 = clientY + scrollY),
                // 否则页面滚动后菜单会跑到视口下方很远的位置,看起来"没反应"。
                contextMenu.style.left = e.clientX + 'px';
                contextMenu.style.top = e.clientY + 'px';
                contextMenu.classList.remove('hidden');
            }
        });
        
        document.addEventListener('click', () => {
            contextMenu.classList.add('hidden');
        });
        
        // 菜单项点击事件
        contextMenu.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action && currentBookmarkId) {
                this.handleContextMenuAction(action, currentBookmarkId);
            }
            contextMenu.classList.add('hidden');
        });
    }

    // 处理右键菜单操作
    async handleContextMenuAction(action, bookmarkId) {
        const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
        if (!bookmark) return;
        
        switch (action) {
            case 'open':
                window.open(bookmark.url, '_self');
                break;
            case 'open-new-tab':
                window.open(bookmark.url, '_blank');
                break;
            case 'edit':
                this.showEditModal(bookmark);
                break;
            case 'delete':
                {
                    // 完整的句子放进 i18n 词条，避免英文环境下蹦出硬编码的"吗？"
                    const confirmMsg = this.t('confirmDelete').replace('{title}', bookmark.title);
                    if (confirm(confirmMsg)) {
                        try {
                            await chrome.bookmarks.remove(bookmarkId);
                        } catch (error) {
                            console.error('删除书签失败:', error);
                            alert(this.t('deleteError'));
                        }
                    }
                }
                break;
        }
    }

    // 设置编辑模态框
    setupEditModal() {
        const modal = document.getElementById('editModal');
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = document.getElementById('cancelEdit');
        const saveBtn = document.getElementById('saveEdit');
        
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
        
        cancelBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
        
        saveBtn.addEventListener('click', () => {
            this.saveBookmarkEdit();
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }

    // 显示编辑模态框
    showEditModal(bookmark) {
        const modal = document.getElementById('editModal');
        const titleInput = document.getElementById('editTitle');
        const urlInput = document.getElementById('editUrl');
        
        titleInput.value = bookmark.title;
        urlInput.value = bookmark.url;
        modal.dataset.bookmarkId = bookmark.id;
        
        modal.classList.remove('hidden');
        titleInput.focus();
    }

    // 保存书签编辑
    async saveBookmarkEdit() {
        const modal = document.getElementById('editModal');
        const titleInput = document.getElementById('editTitle');
        const urlInput = document.getElementById('editUrl');
        const bookmarkId = modal.dataset.bookmarkId;
        
        if (!bookmarkId) return;
        
        try {
            await chrome.bookmarks.update(bookmarkId, {
                title: titleInput.value.trim(),
                url: urlInput.value.trim()
            });
            modal.classList.add('hidden');
        } catch (error) {
            console.error('保存书签失败:', error);
            alert(this.t('saveError'));
        }
    }

    // 更新右键菜单文本
    updateContextMenu() {
        const contextMenu = document.getElementById('contextMenu');
        const menuItems = contextMenu.querySelectorAll('.menu-item');
        
        menuItems.forEach(item => {
            const action = item.dataset.action;
            switch(action) {
                case 'open':
                    item.textContent = this.t('menuOpen');
                    break;
                case 'open-new-tab':
                    item.textContent = this.t('menuOpenNewTab');
                    break;
                case 'edit':
                    item.textContent = this.t('menuEdit');
                    break;
                case 'delete':
                    item.textContent = this.t('menuDelete');
                    break;
            }
        });
    }

    // 更新编辑模态框文本
    updateEditModal() {
        const modal = document.getElementById('editModal');
        const title = modal.querySelector('.modal-header h3');
        const titleLabel = modal.querySelector('label[for="editTitle"]');
        const urlLabel = modal.querySelector('label[for="editUrl"]');
        const saveBtn = document.getElementById('saveEdit');
        const cancelBtn = document.getElementById('cancelEdit');
        
        if (title) title.textContent = this.t('editBookmark');
        if (titleLabel) titleLabel.textContent = this.t('editTitle');
        if (urlLabel) urlLabel.textContent = this.t('editUrl');
        if (saveBtn) saveBtn.textContent = this.t('save');
        if (cancelBtn) cancelBtn.textContent = this.t('cancel');
    }

    // 显示错误信息
    showError(message) {
        const container = document.getElementById('bookmarksContainer');
        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <h3>${this.t('errorOccurred')}</h3>
                <p>${message}</p>
                <button onclick="location.reload()" class="btn btn-primary">${this.t('reload')}</button>
            </div>
        `;
        container.classList.remove('hidden');
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new BookmarkManager();
});
