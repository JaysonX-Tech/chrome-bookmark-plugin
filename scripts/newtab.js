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
        // 确认对话框
        confirmDelete: '确定要删除书签',
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
        // 确认对话框
        confirmDelete: 'Are you sure you want to delete bookmark',
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
            await this.loadBookmarks();
            this.setupEventListeners();
            this.applyTheme();
            this.applyLanguage();
            // 设置默认分类状态
            this.switchCategory(this.currentCategory);
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
                const result = await chrome.storage.sync.get(['theme', 'viewMode', 'language', 'autoSystemTheme']);
                this.theme = result.theme || 'light';
                this.currentView = result.viewMode || 'grid';
                this.language = result.language || 'zh';
                this.autoSystemTheme = result.autoSystemTheme !== false; // 默认开启跟随系统主题
            } else {
                // 在普通浏览器环境中使用localStorage
                this.theme = localStorage.getItem('theme') || 'light';
                this.currentView = localStorage.getItem('viewMode') || 'grid';
                this.language = localStorage.getItem('language') || 'zh';
                this.autoSystemTheme = localStorage.getItem('autoSystemTheme') !== 'false'; // 默认开启跟随系统主题
            }
            
            // 如果开启了跟随系统主题且系统为深色模式，自动切换到深色主题
            if (this.autoSystemTheme && this.isSystemDarkMode()) {
                this.theme = 'dark';
            }
        } catch (error) {
            console.error('加载设置失败:', error);
        }
    }

    // 保存设置
    async saveSettings() {
        try {
            // 检查是否在Chrome扩展环境中
            if (typeof chrome !== 'undefined' && chrome.storage) {
                await chrome.storage.sync.set({
                    theme: this.theme,
                    viewMode: this.currentView,
                    language: this.language,
                    autoSystemTheme: this.autoSystemTheme
                });
            } else {
                // 在普通浏览器环境中使用localStorage
                localStorage.setItem('theme', this.theme);
                localStorage.setItem('viewMode', this.currentView);
                localStorage.setItem('language', this.language);
                localStorage.setItem('autoSystemTheme', this.autoSystemTheme.toString());
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
                // 监听书签变化
                this.setupBookmarkListeners();
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

    // 获取网站图标URL
    getFaviconUrl(url) {
        try {
            const urlObj = new URL(url);
            return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
        } catch {
            return null;
        }
    }

    // 设置事件监听器
    setupEventListeners() {
        // 搜索功能
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.filterAndRenderBookmarks();
        });
        
        searchBtn.addEventListener('click', () => {
            searchInput.focus();
        });

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

        // 系统主题变化监听
        this.setupSystemThemeListener();
        
        // 右键菜单
        this.setupContextMenu();
        
        // 编辑模态框
        this.setupEditModal();
    }

    // 获取模拟书签数据
    getMockBookmarks() {
        return [
            {
                id: '1',
                title: '本地环境',
                url: 'http://127.0.0.1:8848/nacos',
                dateAdded: Date.now() - 86400000,
                parentId: 'nacos',
                folderPath: 'Nacos',
                domain: '127.0.0.1',
                favicon: 'https://www.google.com/s2/favicons?domain=127.0.0.1&sz=32'
            },
            {
                id: '2',
                title: 'DEV 环境',
                url: 'http://10.66.67.2:8083/nacos',
                dateAdded: Date.now() - 172800000,
                parentId: 'nacos',
                folderPath: 'Nacos',
                domain: '10.66.67.2',
                favicon: 'https://www.google.com/s2/favicons?domain=10.66.67.2&sz=32'
            },
            {
                id: '3',
                title: 'SIT 信创环境',
                url: 'https://sit-xc-nacos.faw.cn/nacos',
                dateAdded: Date.now() - 259200000,
                parentId: 'nacos',
                folderPath: 'Nacos',
                domain: 'sit-xc-nacos.faw.cn',
                favicon: 'https://www.google.com/s2/favicons?domain=sit-xc-nacos.faw.cn&sz=32'
            },
            {
                id: '4',
                title: 'SIT 环境',
                url: 'https://sit-iwork.faw.cn/login',
                dateAdded: Date.now() - 345600000,
                parentId: 'iwork',
                folderPath: '一汽云工作台',
                domain: 'sit-iwork.faw.cn',
                favicon: 'https://www.google.com/s2/favicons?domain=sit-iwork.faw.cn&sz=32'
            },
            {
                id: '5',
                title: 'UAT 环境',
                url: 'https://uat-iwork.faw.cn/login',
                dateAdded: Date.now() - 432000000,
                parentId: 'iwork',
                folderPath: '一汽云工作台',
                domain: 'uat-iwork.faw.cn',
                favicon: 'https://www.google.com/s2/favicons?domain=uat-iwork.faw.cn&sz=32'
            },
            {
                id: '6',
                title: 'PROD 环境',
                url: 'https://iwork.faw.cn/login',
                dateAdded: Date.now() - 518400000,
                parentId: 'iwork',
                folderPath: '一汽云工作台',
                domain: 'iwork.faw.cn',
                favicon: 'https://www.google.com/s2/favicons?domain=iwork.faw.cn&sz=32'
            },
            {
                id: '7',
                title: '032-流水线发布',
                url: 'https://iwork.faw.cn/devops/project/overview?appId=5022&businessId=4655969841&content=app&projectId=8333',
                dateAdded: Date.now() - 604800000,
                parentId: 'tools',
                folderPath: '快捷入口',
                domain: 'iwork.faw.cn',
                favicon: 'https://www.google.com/s2/favicons?domain=iwork.faw.cn&sz=32'
            },
            {
                id: '8',
                title: 'Kimi.ai',
                url: 'https://kimi.moonshot.cn/',
                dateAdded: Date.now() - 691200000,
                parentId: 'websites',
                folderPath: '常用网站',
                domain: 'kimi.moonshot.cn',
                favicon: 'https://www.google.com/s2/favicons?domain=kimi.moonshot.cn&sz=32'
            },
            {
                id: '9',
                title: '稀土掘金',
                url: 'https://juejin.cn/recommended',
                dateAdded: Date.now() - 777600000,
                parentId: 'websites',
                folderPath: '常用网站',
                domain: 'juejin.cn',
                favicon: 'https://www.google.com/s2/favicons?domain=juejin.cn&sz=32'
            },
            {
                id: '10',
                title: 'GitHub',
                url: 'https://github.com',
                dateAdded: Date.now() - 864000000,
                parentId: 'dev',
                folderPath: '开发工具',
                domain: 'github.com',
                favicon: 'https://www.google.com/s2/favicons?domain=github.com&sz=32'
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
        
        // 更新标签状态
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-category="${category}"]`).classList.add('active');
        
        this.filterAndRenderBookmarks();
    }

    // 切换视图
    switchView(view) {
        this.currentView = view;
        
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
        const languageBtn = document.getElementById('languageToggle');
        languageBtn.textContent = this.language === 'zh' ? '中' : 'EN';
        languageBtn.title = this.t('toggleLanguage');
        
        // 更新页面标题
        document.title = this.language === 'zh' ? '书签首页' : 'Bookmark Canvas';
        
        // 更新搜索框占位符
        const searchInput = document.getElementById('searchInput');
        searchInput.placeholder = this.t('searchPlaceholder');
        
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
            const groupEl = this.createBookmarkGroup(group);
            container.appendChild(groupEl);
        });
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
                    groupKey = bookmark.folderPath || this.t('otherBookmarks');
                    groupTitle = groupKey;
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
            groupsArray.sort((a, b) => a.order - b.order);
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
    createBookmarkGroup(group) {
        const groupEl = document.createElement('div');
        groupEl.className = 'bookmark-group';
        
        // 移除宽版逻辑，所有卡片都使用单列宽度
        // 统一为3列布局，不再根据书签数量添加wide类
        
        // 创建表格
        const tableEl = document.createElement('table');
        tableEl.className = 'bookmark-table';
        
        // 创建表头
        const theadEl = document.createElement('thead');
        const headerRowEl = document.createElement('tr');
        
        const titleHeaderEl = document.createElement('th');
        titleHeaderEl.textContent = group.title;
        titleHeaderEl.style.cursor = 'pointer';
        titleHeaderEl.addEventListener('click', () => {
            this.toggleGroup(groupEl, titleHeaderEl);
        });
        
        const urlHeaderEl = document.createElement('th');
        urlHeaderEl.textContent = this.t('urlLabel');
        
        headerRowEl.appendChild(titleHeaderEl);
        headerRowEl.appendChild(urlHeaderEl);
        theadEl.appendChild(headerRowEl);
        
        // 创建表体
        const tbodyEl = document.createElement('tbody');
        tbodyEl.className = 'bookmark-list';
        
        group.bookmarks.forEach(bookmark => {
            const rowEl = this.createBookmarkTableRow(bookmark);
            tbodyEl.appendChild(rowEl);
        });
        
        tableEl.appendChild(theadEl);
        tableEl.appendChild(tbodyEl);
        groupEl.appendChild(tableEl);
        
        return groupEl;
    }

    // 创建书签表格行元素
    createBookmarkTableRow(bookmark) {
        const rowEl = document.createElement('tr');
        rowEl.dataset.bookmarkId = bookmark.id;
        
        // 标题列
        const titleCellEl = document.createElement('td');
        const titleLinkEl = document.createElement('a');
        titleLinkEl.href = bookmark.url;
        titleLinkEl.target = '_blank';
        titleLinkEl.textContent = bookmark.title;
        titleLinkEl.title = bookmark.title;
        titleCellEl.appendChild(titleLinkEl);
        
        // URL列
        const urlCellEl = document.createElement('td');
        const urlLinkEl = document.createElement('a');
        urlLinkEl.href = bookmark.url;
        urlLinkEl.target = '_blank';
        urlLinkEl.textContent = bookmark.url;
        urlLinkEl.title = bookmark.url;
        urlCellEl.appendChild(urlLinkEl);
        
        rowEl.appendChild(titleCellEl);
        rowEl.appendChild(urlCellEl);
        
        return rowEl;
    }
    
    // 保留原有的书签项目创建方法作为备用
    createBookmarkItem(bookmark) {
        const itemEl = document.createElement('a');
        itemEl.className = 'bookmark-item';
        itemEl.href = bookmark.url;
        itemEl.target = '_blank';
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

    // 切换分组展开/折叠
    toggleGroup(groupEl, headerEl) {
        const tbodyEl = groupEl.querySelector('.bookmark-list');
        const isCollapsed = tbodyEl.style.display === 'none';
        
        if (isCollapsed) {
            tbodyEl.style.display = '';
            headerEl.style.opacity = '1';
        } else {
            tbodyEl.style.display = 'none';
            headerEl.style.opacity = '0.7';
        }
    }

    // 设置系统主题变化监听
    setupSystemThemeListener() {
        if (window.matchMedia) {
            const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
            
            // 监听系统主题变化
            darkModeQuery.addEventListener('change', (e) => {
                if (this.autoSystemTheme) {
                    this.theme = e.matches ? 'dark' : 'light';
                    this.applyTheme();
                    this.saveSettings();
                }
            });
        }
    }

    // 设置右键菜单
    setupContextMenu() {
        const contextMenu = document.getElementById('contextMenu');
        let currentBookmarkId = null;
        
        document.addEventListener('contextmenu', (e) => {
            const bookmarkItem = e.target.closest('.bookmark-item');
            if (bookmarkItem) {
                e.preventDefault();
                currentBookmarkId = bookmarkItem.dataset.bookmarkId;
                
                contextMenu.style.left = e.pageX + 'px';
                contextMenu.style.top = e.pageY + 'px';
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
                if (confirm(`${this.t('confirmDelete')} "${bookmark.title}" 吗？`)) {
                    try {
                        await chrome.bookmarks.remove(bookmarkId);
                    } catch (error) {
                        console.error('删除书签失败:', error);
                        alert(this.t('deleteError'));
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