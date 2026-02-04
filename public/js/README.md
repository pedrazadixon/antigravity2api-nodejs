# Frontend Module Documentation

The original `app.js` (1300+ lines) has been split into the following modules:

## Module Structure

```
js/
├── utils.js    - 工具函数（字体大小、敏感信息隐藏）
├── ui.js       - UI组件（Toast、Modal、Loading、Tab切换）
├── auth.js     - 认证相关（登录、登出、OAuth授权）
├── tokens.js   - Token管理（增删改查、启用禁用、内联编辑）
├── quota.js    - 额度管理（查看、刷新、缓存、内嵌显示）
├── config.js   - 配置管理（加载、保存、轮询策略）
└── main.js     - 主入口（初始化、事件绑定）
```

## Loading Order

Modules are loaded according to their dependencies (in `index.html`):

1. **utils.js** - Basic utility functions
2. **ui.js** - UI components (depends on utils)
3. **auth.js** - Authentication module (depends on ui)
4. **quota.js** - Quota module (depends on auth)
5. **tokens.js** - Token module (depends on auth, quota, ui)
6. **config.js** - Configuration module (depends on auth, ui)
7. **main.js** - Main entry point (depends on all modules)

## Module Responsibilities

### utils.js
- Font size settings and persistence
- Sensitive information visibility toggle
- localStorage management

### ui.js
- Toast notifications
- Confirm dialog
- Loading overlay
- Tab page switching

### auth.js
- User login/logout
- OAuth authorization flow
- authFetch wrapper (automatic 401 handling)
- Token authentication state management

### tokens.js
- Token list loading and rendering
- Token CRUD operations
- Inline field editing (projectId, email)
- Token details modal

### quota.js
- Quota data caching (5-minute TTL)
- Embedded quota summary display
- Quota details expand/collapse
- Quota modal (multi-account switching)
- Force refresh quota

### config.js
- Configuration loading (.env + config.json)
- Configuration saving (separate sensitive/non-sensitive)
- Polling strategy management
- Polling status display

### main.js
- Page initialization
- Login form event binding
- Configuration form event binding
- Auto-login detection

## Global Variables

Global variables shared across modules:

- `authToken` - Authentication token (auth.js)
- `cachedTokens` - Token list cache (tokens.js)
- `currentQuotaToken` - Current quota token being viewed (quota.js)
- `quotaCache` - Quota data cache object (quota.js)
- `sensitiveInfoHidden` - Sensitive information hiding state (utils.js)

## Advantages

1. **Maintainability** - Each module has a single responsibility, making it easy to locate and modify
2. **Readability** - Reasonable file sizes (200-400 lines), clear code structure
3. **Extensibility** - New features only require modifying the corresponding module
4. **Testability** - Modules are independent, facilitating unit testing
5. **Collaboration-friendly** - Reduces conflicts during multi-person development

## Notes

1. Modules communicate through global variables and functions
2. Maintain the loading order to avoid dependency issues
3. When modifying, pay attention to functions called across modules