// 主题检测脚本 - 必须在页面加载前同步执行，避免主题切换 FOUC（白闪一下）。
// 抽到外部文件是因为 MV3 默认 CSP（script-src 'self'）禁止 inline <script>；
// 写在 newtab.html 里 inline 会被 CSP 拒绝执行，看不出来但事实上不工作。
(function() {
    // 检查系统是否为深色模式
    function isSystemDarkMode() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // 立即设置初始主题，避免闪烁
    var initialTheme = 'light'; // 默认浅色主题

    // 检查系统深色模式偏好
    if (isSystemDarkMode()) {
        initialTheme = 'dark';
    }

    // 立即应用初始主题
    document.documentElement.setAttribute('data-theme', initialTheme);

    // 检查是否在Chrome扩展环境中
    if (typeof chrome !== 'undefined' && chrome.storage) {
        // Chrome扩展环境：异步获取用户设置的主题
        chrome.storage.sync.get(['theme', 'autoSystemTheme'], function(result) {
            // 跟随系统主题（默认开启）时，initialTheme 已按系统状态设过，不让 storage 残留值覆盖
            var follow = result.autoSystemTheme !== false;
            if (follow) return;
            if (result.theme && result.theme !== initialTheme) {
                document.documentElement.setAttribute('data-theme', result.theme);
            }
        });
    } else {
        // 普通浏览器环境：同步获取主题设置
        try {
            var follow = localStorage.getItem('autoSystemTheme') !== 'false';
            if (!follow) {
                var savedTheme = localStorage.getItem('theme');
                if (savedTheme && savedTheme !== initialTheme) {
                    document.documentElement.setAttribute('data-theme', savedTheme);
                }
            }
        } catch (error) {
            // localStorage不可用时，保持系统偏好主题
            console.warn('localStorage不可用，使用系统主题偏好');
        }
    }
})();
