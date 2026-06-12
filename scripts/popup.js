// Chrome书签首页展示插件 - 弹出窗口脚本
//
// 这个脚本只操作 popup.html 中实际存在的元素，避免引用不存在的 DOM 节点导致 init 时崩溃。
// popup.html 中可用的 ID：openNewTab / addBookmark / totalBookmarks / totalFolders /
// recentCount / exportBookmarks 以及添加书签模态框相关元素。
class PopupManager {
    constructor() {
        this.currentTab = null;
        this.init();
    }

    // 初始化
    async init() {
        try {
            await this.loadCurrentTab();
            await this.loadBookmarkStats();
            this.setupEventListeners();
        } catch (error) {
            console.error('弹出窗口初始化失败:', error);
        }
    }

    // 加载当前标签页信息
    async loadCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentTab = tab;

            // 排除内部页面（chrome://、chrome-extension://），它们不能作为书签 URL
            const addBtn = document.getElementById('addBookmark');
            const canBookmark = tab && tab.url
                && !tab.url.startsWith('chrome://')
                && !tab.url.startsWith('chrome-extension://')
                && !tab.url.startsWith('edge://')
                && !tab.url.startsWith('about:');

            if (canBookmark) {
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

    // 设置事件监听器
    setupEventListeners() {
        // 打开新标签页
        document.getElementById('openNewTab').addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') });
            window.close();
        });

        // 添加当前页面为书签
        document.getElementById('addBookmark').addEventListener('click', () => {
            if (this.currentTab && this.currentTab.url
                && !this.currentTab.url.startsWith('chrome://')
                && !this.currentTab.url.startsWith('chrome-extension://')) {
                this.showAddBookmarkModal();
            }
        });

        // 导出书签
        document.getElementById('exportBookmarks').addEventListener('click', () => {
            this.exportBookmarks();
        });

        // 添加书签模态框
        this.setupAddBookmarkModal();
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

            // 刷新统计信息
            await this.loadBookmarkStats();

            // 显示成功提示
            this.showToast('书签添加成功！');
        } catch (error) {
            console.error('添加书签失败:', error);
            alert('添加书签失败，请重试');
        }
    }

    // 导出书签（Netscape Bookmark File Format —— Chrome/Firefox/Edge 都能原生导入）
    async exportBookmarks() {
        try {
            const bookmarkTree = await chrome.bookmarks.getTree();
            const html = this.bookmarksToNetscapeHtml(bookmarkTree);

            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `bookmarks_${new Date().toISOString().split('T')[0]}.html`;
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

    // 将 chrome.bookmarks 的 tree 序列化为 Netscape Bookmark File Format。
    // 这是 Chrome/Firefox/Edge/Safari 通用的书签导入格式（chrome://bookmarks → 导入）。
    bookmarksToNetscapeHtml(tree) {
        const escape = (s) => String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        // Chrome 的 dateAdded 是毫秒；Netscape 格式约定是秒
        const toSec = (ms) => ms ? Math.floor(ms / 1000) : '';
        const indent = (level) => '    '.repeat(level);

        const lines = [
            '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
            '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
            '<TITLE>Bookmarks</TITLE>',
            '<H1>Bookmarks</H1>',
            '<DL><p>'
        ];

        const walk = (nodes, level) => {
            nodes.forEach(node => {
                if (node.url) {
                    const add = toSec(node.dateAdded);
                    lines.push(
                        `${indent(level)}<DT><A HREF="${escape(node.url)}"`
                        + `${add ? ` ADD_DATE="${add}"` : ''}>`
                        + `${escape(node.title || node.url)}</A>`
                    );
                } else if (node.children) {
                    if (node.title) {
                        // 普通文件夹
                        const add = toSec(node.dateAdded);
                        const mod = toSec(node.dateGroupModified);
                        lines.push(
                            `${indent(level)}<DT><H3`
                            + `${add ? ` ADD_DATE="${add}"` : ''}`
                            + `${mod ? ` LAST_MODIFIED="${mod}"` : ''}>`
                            + `${escape(node.title)}</H3>`
                        );
                        lines.push(`${indent(level)}<DL><p>`);
                        walk(node.children, level + 1);
                        lines.push(`${indent(level)}</DL><p>`);
                    } else {
                        // 根节点没有标题，跳过包裹层直接递归子节点
                        walk(node.children, level);
                    }
                }
            });
        };

        walk(tree, 1);
        lines.push('</DL><p>');
        return lines.join('\n');
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
            background: var(--success-color, #4caf50);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 2000;
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            // 防御性检查：toast 可能因 popup 关闭等原因已被移除
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 2000);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});
