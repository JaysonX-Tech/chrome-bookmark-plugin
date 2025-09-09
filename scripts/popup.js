// Chrome书签首页展示插件 - 弹出窗口脚本
class PopupManager {
    constructor() {
        this.bookmarks = [];
        this.settings = {};
        this.currentTab = null;
        
        this.init();
    }

    // 初始化
    async init() {
        try {
            await this.loadSettings();
            await this.loadCurrentTab();
            await this.loadBookmarkStats();
            await this.loadRecentBookmarks();
            this.setupEventListeners();
            this.applyTheme();
        } catch (error) {
            console.error('弹出窗口初始化失败:', error);
        }
    }

    // 加载设置
    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get([
                'theme', 'viewMode', 'autoRefresh', 'showFavicons'
            ]);
            
            this.settings = {
                theme: result.theme || 'light',
                viewMode: result.viewMode || 'grid',
                autoRefresh: result.autoRefresh !== false,
                showFavicons: result.showFavicons !== false
            };
            
            // 更新UI状态
            document.getElementById('themeToggle').checked = this.settings.theme === 'dark';
            document.getElementById('viewToggle').checked = this.settings.viewMode === 'grid';
            document.getElementById('autoRefresh').checked = this.settings.autoRefresh;
        } catch (error) {
            console.error('加载设置失败:', error);
        }
    }

    // 保存设置
    async saveSettings() {
        try {
            await chrome.storage.sync.set(this.settings);
        } catch (error) {
            console.error('保存设置失败:', error);
        }
    }

    // 加载当前标签页信息
    async loadCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentTab = tab;
            
            // 如果当前页面可以添加为书签，启用添加按钮
            const addBtn = document.getElementById('addBookmark');
            if (tab && tab.url && !tab.url.startsWith('chrome://')) {
                addBtn.disabled = false;
                addBtn.querySelector('.btn-text').textContent = '添加当前页面';
            } else {
                addBtn.disabled = true;
                addBtn.querySelector('.btn-text').textContent = '无法添加此页面';
            }
        } catch (error) {
            console.error('获取当前标签页失败:', error);
        }
    }

    // 加载书签统计信息
    async loadBookmarkStats() {
        try {
            const bookmarkTree = await chrome.bookmarks.getTree();
            const stats = this.calculateStats(bookmarkTree);
            
            document.getElementById('totalBookmarks').textContent = stats.totalBookmarks;
            document.getElementById('totalFolders').textContent = stats.totalFolders;
            document.getElementById('recentCount').textContent = stats.recentCount;
        } catch (error) {
            console.error('加载统计信息失败:', error);
            document.getElementById('totalBookmarks').textContent = '?';
            document.getElementById('totalFolders').textContent = '?';
            document.getElementById('recentCount').textContent = '?';
        }
    }

    // 计算统计信息
    calculateStats(bookmarkTree) {
        let totalBookmarks = 0;
        let totalFolders = 0;
        let recentCount = 0;
        
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        
        const traverse = (nodes) => {
            nodes.forEach(node => {
                if (node.url) {
                    totalBookmarks++;
                    if (node.dateAdded && node.dateAdded > oneWeekAgo) {
                        recentCount++;
                    }
                } else if (node.children) {
                    totalFolders++;
                    traverse(node.children);
                }
            });
        };
        
        traverse(bookmarkTree);
        
        return { totalBookmarks, totalFolders, recentCount };
    }

    // 加载最近书签
    async loadRecentBookmarks() {
        try {
            const bookmarkTree = await chrome.bookmarks.getTree();
            const recentBookmarks = this.getRecentBookmarks(bookmarkTree, 5);
            
            const recentList = document.getElementById('recentList');
            recentList.innerHTML = '';
            
            if (recentBookmarks.length === 0) {
                recentList.innerHTML = '<div class="no-recent">暂无最近书签</div>';
                return;
            }
            
            recentBookmarks.forEach(bookmark => {
                const itemEl = this.createRecentBookmarkItem(bookmark);
                recentList.appendChild(itemEl);
            });
        } catch (error) {
            console.error('加载最近书签失败:', error);
            document.getElementById('recentList').innerHTML = '<div class="error-recent">加载失败</div>';
        }
    }

    // 获取最近书签
    getRecentBookmarks(bookmarkTree, limit = 5) {
        const bookmarks = [];
        
        const traverse = (nodes) => {
            nodes.forEach(node => {
                if (node.url) {
                    bookmarks.push({
                        id: node.id,
                        title: node.title || '未命名书签',
                        url: node.url,
                        dateAdded: node.dateAdded,
                        domain: this.extractDomain(node.url),
                        favicon: this.getFaviconUrl(node.url)
                    });
                } else if (node.children) {
                    traverse(node.children);
                }
            });
        };
        
        traverse(bookmarkTree);
        
        return bookmarks
            .sort((a, b) => b.dateAdded - a.dateAdded)
            .slice(0, limit);
    }

    // 创建最近书签项目
    createRecentBookmarkItem(bookmark) {
        const itemEl = document.createElement('div');
        itemEl.className = 'recent-item';
        itemEl.addEventListener('click', () => {
            chrome.tabs.create({ url: bookmark.url });
            window.close();
        });
        
        const faviconEl = document.createElement('img');
        faviconEl.className = 'recent-favicon';
        faviconEl.src = bookmark.favicon;
        faviconEl.onerror = () => {
            faviconEl.style.display = 'none';
            const defaultEl = document.createElement('div');
            defaultEl.className = 'recent-favicon default';
            defaultEl.textContent = bookmark.title.charAt(0).toUpperCase();
            itemEl.insertBefore(defaultEl, faviconEl.nextSibling);
        };
        
        const infoEl = document.createElement('div');
        infoEl.className = 'recent-info';
        
        const titleEl = document.createElement('div');
        titleEl.className = 'recent-title';
        titleEl.textContent = bookmark.title;
        titleEl.title = bookmark.title;
        
        const domainEl = document.createElement('div');
        domainEl.className = 'recent-domain';
        domainEl.textContent = bookmark.domain;
        domainEl.title = bookmark.url;
        
        infoEl.appendChild(titleEl);
        infoEl.appendChild(domainEl);
        
        itemEl.appendChild(faviconEl);
        itemEl.appendChild(infoEl);
        
        return itemEl;
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
            return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=16`;
        } catch {
            return null;
        }
    }

    // 设置事件监听器
    setupEventListeners() {
        // 打开新标签页
        document.getElementById('openNewTab').addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') });
            window.close();
        });

        // 添加当前页面为书签
        document.getElementById('addBookmark').addEventListener('click', () => {
            if (this.currentTab && this.currentTab.url && !this.currentTab.url.startsWith('chrome://')) {
                this.showAddBookmarkModal();
            }
        });

        // 主题切换
        document.getElementById('themeToggle').addEventListener('change', (e) => {
            this.settings.theme = e.target.checked ? 'dark' : 'light';
            this.applyTheme();
            this.saveSettings();
        });

        // 视图切换
        document.getElementById('viewToggle').addEventListener('change', (e) => {
            this.settings.viewMode = e.target.checked ? 'grid' : 'list';
            this.saveSettings();
        });

        // 自动刷新切换
        document.getElementById('autoRefresh').addEventListener('change', (e) => {
            this.settings.autoRefresh = e.target.checked;
            this.saveSettings();
        });

        // 高级设置
        document.getElementById('openOptions').addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
            window.close();
        });

        // 导出书签
        document.getElementById('exportBookmarks').addEventListener('click', () => {
            this.exportBookmarks();
        });

        // 添加书签模态框
        this.setupAddBookmarkModal();
    }

    // 应用主题
    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.settings.theme);
    }

    // 设置添加书签模态框
    setupAddBookmarkModal() {
        const modal = document.getElementById('addBookmarkModal');
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = document.getElementById('cancelAdd');
        const saveBtn = document.getElementById('saveBookmark');
        
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
        
        cancelBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
        
        saveBtn.addEventListener('click', () => {
            this.saveNewBookmark();
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }

    // 显示添加书签模态框
    async showAddBookmarkModal() {
        const modal = document.getElementById('addBookmarkModal');
        const titleInput = document.getElementById('bookmarkTitle');
        const urlInput = document.getElementById('bookmarkUrl');
        const folderSelect = document.getElementById('bookmarkFolder');
        
        // 填充当前页面信息
        if (this.currentTab) {
            titleInput.value = this.currentTab.title || '';
            urlInput.value = this.currentTab.url || '';
        }
        
        // 加载文件夹选项
        await this.loadBookmarkFolders(folderSelect);
        
        modal.classList.remove('hidden');
        titleInput.focus();
    }

    // 加载书签文件夹
    async loadBookmarkFolders(selectEl) {
        try {
            const bookmarkTree = await chrome.bookmarks.getTree();
            selectEl.innerHTML = '';
            
            const addFolderOption = (folder, level = 0) => {
                if (folder.children) {
                    const option = document.createElement('option');
                    option.value = folder.id;
                    option.textContent = '  '.repeat(level) + (folder.title || '根目录');
                    selectEl.appendChild(option);
                    
                    folder.children.forEach(child => {
                        if (child.children) {
                            addFolderOption(child, level + 1);
                        }
                    });
                }
            };
            
            bookmarkTree.forEach(root => addFolderOption(root));
        } catch (error) {
            console.error('加载文件夹失败:', error);
        }
    }

    // 保存新书签
    async saveNewBookmark() {
        const titleInput = document.getElementById('bookmarkTitle');
        const urlInput = document.getElementById('bookmarkUrl');
        const folderSelect = document.getElementById('bookmarkFolder');
        const modal = document.getElementById('addBookmarkModal');
        
        const title = titleInput.value.trim();
        const url = urlInput.value.trim();
        const parentId = folderSelect.value;
        
        if (!title || !url) {
            alert('请填写标题和URL');
            return;
        }
        
        try {
            await chrome.bookmarks.create({
                parentId: parentId,
                title: title,
                url: url
            });
            
            modal.classList.add('hidden');
            
            // 刷新统计信息和最近书签
            await this.loadBookmarkStats();
            await this.loadRecentBookmarks();
            
            // 显示成功提示
            this.showToast('书签添加成功！');
        } catch (error) {
            console.error('添加书签失败:', error);
            alert('添加书签失败，请重试');
        }
    }

    // 导出书签
    async exportBookmarks() {
        try {
            const bookmarkTree = await chrome.bookmarks.getTree();
            const bookmarksData = JSON.stringify(bookmarkTree, null, 2);
            
            const blob = new Blob([bookmarksData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `bookmarks_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            
            this.showToast('书签导出成功！');
        } catch (error) {
            console.error('导出书签失败:', error);
            alert('导出书签失败，请重试');
        }
    }

    // 显示提示消息
    showToast(message) {
        // 创建简单的提示
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--success-color);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 2000;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 2000);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});