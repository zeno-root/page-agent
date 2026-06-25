# indofun-aigc-v1.8 全网页 Chrome 扩展控制器实施文档

> 日期：2026-06-25  
> 目标：让 Page Agent 扩展控制当前浏览器窗口内其他可访问标签页的点击、输入、滚动、导航和高级页面动作。  
> 实施主仓库：`/Users/indofun/Developer/page-agent`  
> v1.8 对接仓库：`/Users/indofun/Developer/indofun-aigc-v1.8/integration`

## 结论

按当前决策，第一版采用 **Unrestricted Browser Controller** 方向：

- Chrome 扩展保留 `host_permissions: ['<all_urls>']`。
- 允许控制所有浏览器可注入页面。
- 开放跨 tab、DOM 操作、tab 管理、截图、键盘、文件上传、JavaScript 执行等能力。
- v1.8 只负责提供 LLM proxy、配置入口、安装/授权说明和运行态验证。
- 后续再按域名、用户角色、页面类型、危险动作逐步收紧。

注意：`<all_urls>` 不是“绝对所有页面”。Chrome 仍会阻止扩展控制 `chrome://`、`chrome-extension://`、Chrome Web Store、DevTools、部分浏览器安全页，以及未手动允许的 `file://` 页面。

## 当前基础

Page Agent extension 已有跨标签基础设施：

| 能力 | 现有文件 | 当前状态 |
| --- | --- | --- |
| Side Panel 入口 | `packages/extension/src/entrypoints/sidepanel/App.tsx` | 已有任务输入、设置、历史 |
| Multi-page agent | `packages/extension/src/agent/MultiPageAgent.ts` | 已使用 `TabsController` + `RemotePageController` |
| Tab 管理 | `packages/extension/src/agent/TabsController.ts` | 已有 open/switch/close/group |
| Tab background API | `packages/extension/src/agent/TabsController.background.ts` | 已有 active tab/window tabs/group/close |
| 远程页面控制 | `packages/extension/src/agent/RemotePageController.ts` | 已支持 click/input/select/scroll |
| Content script 控制器 | `packages/extension/src/agent/RemotePageController.content.ts` | 每个 tab 创建 `PageController` |
| 工具注入 | `packages/extension/src/agent/tabTools.ts` | 已有 open/switch/close |
| 权限 | `packages/extension/wxt.config.js` | 已是 `host_permissions: ['<all_urls>']` |

现有不足：

- Side Panel 没有明确展示当前可控 tab 清单。
- `tabTools` 工具面偏窄，缺少 list/activate/reload/back/forward/wait。
- `RemotePageController` 没有远程 JS 执行、键盘、截图、上传文件等增强能力。
- `isContentScriptAllowed()` 仍排除 `file://`，后续如需本地文件页需单独处理。
- 扩展设置仍偏通用，需要增加 Unrestricted Mode 的显式状态和风险提示。
- v1.8 后端还没有为扩展准备稳定 LLM proxy。

## 目标架构

```text
Chrome Side Panel
  └─ MultiPageAgent
      ├─ LLM Client
      │   └─ v1.8 /api/page-agent/llm-proxy
      ├─ Tab Tools
      │   ├─ list_tabs
      │   ├─ get_current_tab
      │   ├─ open_new_tab
      │   ├─ switch_to_tab
      │   ├─ activate_tab
      │   ├─ close_tab
      │   ├─ reload_tab
      │   ├─ go_back
      │   ├─ go_forward
      │   └─ wait_until_tab_loaded
      └─ RemotePageController
          └─ background service worker
              ├─ TAB_CONTROL handlers
              ├─ PAGE_CONTROL proxy
              ├─ screenshot handler
              └─ chrome.tabs / chrome.scripting APIs
                  └─ target tab content script
                      └─ PageController
                          ├─ DOM extraction
                          ├─ click/input/select/scroll
                          ├─ keyboard/hover/upload
                          └─ execute_javascript
```

## 实施范围

### Page Agent 仓库要改

```text
packages/extension/wxt.config.js
packages/extension/src/agent/useAgent.ts
packages/extension/src/agent/MultiPageAgent.ts
packages/extension/src/agent/tabTools.ts
packages/extension/src/agent/TabsController.ts
packages/extension/src/agent/TabsController.background.ts
packages/extension/src/agent/RemotePageController.ts
packages/extension/src/agent/RemotePageController.background.ts
packages/extension/src/agent/RemotePageController.content.ts
packages/extension/src/entrypoints/sidepanel/App.tsx
packages/extension/src/components/ConfigPanel.tsx
packages/page-controller/src/PageController.ts
packages/page-controller/src/actions.ts
```

如果新增工具测试，优先放：

```text
packages/extension/src/agent/*.test.ts
packages/page-controller/src/*.test.ts
```

### v1.8 integration 要改

```text
server/src/routes/pageAgent.js
server/src/routes/pageAgent.test.js
server/src/index.js
server/.env.example
.env.docker.example
README.md
DEPLOY.md
docs/decisions/<date>-page-agent-extension-controller.md
```

v1.8 第一阶段不需要改主前端业务逻辑，除非要提供“打开扩展安装/授权说明”的页面入口。

## 权限策略

第一版按用户要求保持开放：

```js
manifest: {
  permissions: [
    'tabs',
    'tabGroups',
    'sidePanel',
    'storage',
    'scripting',
    'activeTab'
  ],
  host_permissions: ['<all_urls>']
}
```

说明：

- `tabs`：读取/更新 tab、URL、标题、导航。
- `tabGroups`：把受控 tab 分组。
- `sidePanel`：侧边栏控制台。
- `storage`：保存 LLM 配置、执行历史、mode 设置。
- `scripting`：后续用于高级注入、快捷键或 fallback 操作。
- `activeTab`：截图/当前页操作的兼容授权。
- `host_permissions: ['<all_urls>']`：向所有可注入网页注入 content script。

不建议第一版申请 `downloads`、`cookies`、`history`，除非有明确需求。

## 工具增强清单

### 第一批必须实现

在 `tabTools.ts` 增加：

| Tool | 输入 | 行为 |
| --- | --- | --- |
| `list_tabs` | `{}` | 返回当前窗口可跟踪 tab 列表 |
| `get_current_tab` | `{}` | 返回当前控制目标 tab |
| `activate_tab` | `{ tab_id }` | 激活浏览器真实 tab 并设为当前控制目标 |
| `reload_tab` | `{ tab_id? }` | 刷新当前或指定 tab |
| `go_back` | `{ tab_id? }` | 当前或指定 tab 后退 |
| `go_forward` | `{ tab_id? }` | 当前或指定 tab 前进 |
| `wait_until_tab_loaded` | `{ tab_id?, timeout_ms? }` | 等待 tab status complete |
| `capture_visible_tab` | `{}` | 截取当前窗口活动 tab 可见区域，返回 data URL 摘要或保存引用 |

保留现有：

```text
open_new_tab
switch_to_tab
close_tab
```

### 第二批增强

在 `RemotePageController` / content script 增加：

| 能力 | 建议 action | 说明 |
| --- | --- | --- |
| 键盘 | `press_key` | 支持 Enter/Escape/Tab/组合键 |
| hover | `hover_element` | 触发 hover 菜单 |
| 拖拽 | `drag_element` | 后续用于滑块/排序 |
| 文件上传 | `upload_file` | 需要设计本地文件选择边界 |
| 页面文本提取 | `extract_page_text` | 比完整 DOM 更适合总结 |
| 表格提取 | `extract_structured_table` | 管理后台/表格页常用 |
| JS 执行 | `execute_javascript` | Unrestricted Mode 开启，必须有超时和错误回传 |

## `TabsController` 改造要点

### 1. 默认跟踪当前窗口全部可访问 tabs

当前 `MultiPageAgent` 支持 `experimentalIncludeAllTabs`。Unrestricted Mode 下应把它变成明确配置：

```ts
interface AdvancedConfig {
  browserControlMode?: 'current-tab' | 'current-window' | 'unrestricted'
  includeAllTabs?: boolean
  enableDangerousTools?: boolean
  enableJavascriptExecution?: boolean
}
```

执行规则：

- `current-tab`：只纳入初始 tab。
- `current-window`：纳入当前窗口所有可访问 tab。
- `unrestricted`：纳入当前窗口所有可访问 tab，并允许新开任意 URL。

### 2. 增加 tab 操作方法

在 `TabsController.ts` 增加：

```ts
listTabs(): Promise<TabMeta[]>
getCurrentTab(): Promise<TabMeta | null>
activateTab(tabId: number): Promise<string>
reloadTab(tabId?: number): Promise<string>
goBack(tabId?: number): Promise<string>
goForward(tabId?: number): Promise<string>
waitUntilTabLoaded(tabId: number, timeoutMS?: number): Promise<string>
```

### 3. background 增加对应 action

在 `TabsController.background.ts` 增加：

```text
list_tabs
activate_tab
reload_tab
go_back
go_forward
capture_visible_tab
```

对应 Chrome API：

```ts
chrome.tabs.query({ windowId })
chrome.tabs.update(tabId, { active: true })
chrome.tabs.reload(tabId)
chrome.tabs.goBack(tabId)
chrome.tabs.goForward(tabId)
chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
```

## `RemotePageController` 改造要点

### 1. JS 执行

当前扩展版故意未实现 `execute_javascript`，原因是 `AbortSignal` 不能跨 context。Unrestricted Mode 可以实现有限超时版本：

```ts
async executeJavascript(script: string): Promise<DomActionReturn>
```

content script 中执行：

```ts
const timeout = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('execute_javascript timeout')), 8000)
)
const run = Promise.resolve().then(() => {
  const fn = new Function('return (async () => { ' + script + '\n})()')
  return fn()
})
const result = await Promise.race([run, timeout])
```

返回规则：

- 成功：`{ success: true, message: stringifyPreview(result) }`
- 报错：`{ success: false, message: error.message }`
- 结果最大长度建议 4000 字符。

注意：这是真正的高危能力。第一版既然开放，也要在 UI、system instruction 和日志里明确是 Unrestricted Mode。

### 2. 键盘

在 content script 中实现：

```ts
pressKey(key: string): Promise<ActionResult>
```

支持：

```text
Enter
Escape
Tab
Backspace
ArrowUp/ArrowDown/ArrowLeft/ArrowRight
Meta+L
Meta+R
Ctrl+A
Ctrl+C
Ctrl+V
```

复杂快捷键优先通过 `KeyboardEvent` 分发；涉及浏览器地址栏的快捷键可能不会被网页接收，需通过 tab tools 替代。

### 3. 文件上传

不建议第一批直接做系统级文件选择。可先支持：

- 用户在 Side Panel 手动选择文件。
- 文件转成 extension 内部 blob/data URL。
- content script 找到 file input 后构造 `DataTransfer` 注入。

这块单独实施，避免阻塞第一批跨 tab 控制。

## Side Panel 产品改造

在 `App.tsx` 增加：

1. 当前模式 badge：

```text
Mode: Unrestricted
Scope: All accessible pages
Dangerous tools: Enabled
JavaScript: Enabled/Disabled
```

2. 当前 tab 状态：

```text
Current Target: [tabId] title - url
```

3. Tab 列表入口：

- 展示 tab id、title、url、status。
- 支持点击切换控制目标。
- 支持点击激活真实 tab。

4. 截图/刷新/停止快捷按钮：

- Stop task
- Refresh tabs
- Activate current target
- Capture visible tab

5. 明确提示：

```text
Unrestricted Mode can read and operate all accessible web pages in this browser window.
```

不要在 UI 里加长篇说明，保持短句和状态可见即可。

## LLM 配置与 v1.8 proxy

虽然扩展可直接填 API Key，但 v1.8 实施建议仍走后端 proxy：

```text
POST /api/page-agent/llm-proxy/chat/completions
```

扩展设置：

```text
Base URL: http://localhost:4800/api/page-agent/llm-proxy
Model: server-configured
API Key: NA
```

v1.8 环境变量：

```text
PAGE_AGENT_EXTENSION_ENABLED=1
PAGE_AGENT_LLM_BASE_URL=https://...
PAGE_AGENT_LLM_MODEL=...
PAGE_AGENT_LLM_API_KEY=...
PAGE_AGENT_PROXY_TIMEOUT_MS=60000
PAGE_AGENT_PROXY_MAX_BYTES=300000
```

v1.8 proxy 规则：

- 不把真实 API Key 返回给扩展。
- 服务端覆盖 model，或只允许配置白名单里的 model。
- 限制 body 大小。
- 限制超时。
- 记录 request id、owner、latency、status、token usage。
- 不默认记录完整 prompt。

如果扩展要控制非 v1.8 页面，LLM proxy 仍由 v1.8 提供，只是页面操作目标不再限于 v1.8。

## System Instruction 建议

Unrestricted Mode 下 system instruction 应强调能力和执行纪律，不做权限收紧：

```text
You are Page Agent Extension running in Unrestricted Browser Controller mode.
You may inspect and operate any accessible browser tab in the current window.
Use list_tabs before switching targets when the task refers to another page.
Use activate_tab only when visual confirmation or screenshots are needed.
Prefer DOM actions over JavaScript. Use execute_javascript only when normal tools cannot complete the task.
Before destructive actions such as deleting, submitting payments, changing account permissions, or sending irreversible forms, ask the user for confirmation.
Report exact tab id, page title, and URL when actions span multiple tabs.
```

用户当前要求“后续再收紧权限”，所以第一版不做硬阻断；但不可逆操作前仍建议保留确认，避免误触造成真实损失。

## 实施步骤

### Phase 1：补齐跨 tab 控制基础

1. 扩展 `TabAction` 类型。
2. 在 background 增加 list/activate/reload/back/forward/capture handlers。
3. 在 `TabsController` 增加对应方法。
4. 在 `tabTools` 暴露新工具。
5. `summarizeTabs()` 保留在 browser state 中，确保 LLM 每步知道 tab id。
6. 设置默认 `experimentalIncludeAllTabs` 或新 `browserControlMode=unrestricted`。

验收：

- Side Panel 输入“列出当前窗口所有标签页”能返回 tab 清单。
- 输入“切换到 tab X 并点击页面中的 Y”能切换目标并执行。
- 输入“刷新当前目标页”能刷新目标 tab。

### Phase 2：高级页面动作

1. `RemotePageController` 增加 `executeJavascript`。
2. content script 增加 `execute_javascript` 实现和超时。
3. 增加 `press_key`。
4. 增加 `hover_element`。
5. 为截图增加 `capture_visible_tab` 工具。

验收：

- 可在非 v1.8 普通网页执行点击、输入、滚动。
- 可执行一个只读 JS，例如 `return document.title`。
- JS 抛错能返回可见错误，不导致 agent 卡死。
- 截图工具返回成功消息或可查看引用。

### Phase 3：v1.8 LLM proxy

1. 新增 `server/src/routes/pageAgent.js`。
2. 挂载到 `server/src/index.js`。
3. 增加 `.env.example` 和 `.env.docker.example`。
4. 增加 route tests。
5. README/DEPLOY 增加扩展配置说明。

验收：

- `PAGE_AGENT_EXTENSION_ENABLED=0` 时 proxy 关闭。
- `PAGE_AGENT_EXTENSION_ENABLED=1` 时扩展可通过 proxy 调模型。
- 前端和扩展 storage 中没有真实 LLM API Key。

### Phase 4：打包和安装验证

在 Page Agent 仓库：

```bash
npm run build:ext
```

生成扩展 zip 后安装到 Chrome。开发时也可：

```bash
npm run dev:ext
```

验证：

- 打开多个普通网页和 v1.8 页面。
- 打开 Side Panel。
- 运行跨 tab 任务。
- 查看执行历史。
- 停止任务后 mask/highlight 清理干净。

## 测试建议

### Page Agent extension

至少补单元测试覆盖：

- `TabsController` 方法调用正确 background action。
- `tabTools` schema 和输出。
- `isContentScriptAllowed()` 对受限页面仍返回 false。
- `execute_javascript` 超时和异常路径。
- `press_key` 参数规范化。

可手动验证的真实浏览器测试：

1. `https://example.com`：读取标题、点击链接。
2. 一个表单页：输入、Tab、Enter。
3. v1.8 `http://localhost:4800`：切换页面、填写 prompt。
4. 两个不同域名 tab：从 A 切到 B 操作，再回 A。
5. `chrome://settings`：应明确返回不可控制，而不是假成功。

### v1.8

```bash
cd /Users/indofun/Developer/indofun-aigc-v1.8/integration
node server/src/routes/pageAgent.test.js
```

如果改了 docs/README，可不跑全量；如果改了 auth/proxy 挂载，补跑相关 auth route tests。

## 回滚

v1.8 回滚：

```text
PAGE_AGENT_EXTENSION_ENABLED=0
```

扩展回滚：

- 从 Chrome 禁用或卸载扩展。
- 如已发布 zip，回退到上一版 zip。

代码回滚：

- Page Agent 仓库 revert 扩展增强提交。
- v1.8 仓库 revert `pageAgent` route 和文档提交。

## 明确不处理的内容

第一轮不处理：

- 浏览器内置页面控制。
- 系统级文件选择器自动控制。
- 跨浏览器窗口的全局 tab 管理。
- cookie/history/downloads 权限。
- 企业级策略、域名白名单、角色权限收敛。
- 对高风险操作做强制阻断。

这些留到后续“权限收紧和审计增强”阶段。

## 最终验收标准

完成后应满足：

1. 扩展能列出当前窗口所有可访问标签页。
2. Agent 能选择其他 tab 作为控制目标。
3. Agent 能在其他 tab 执行点击、输入、滚动、选择。
4. Agent 能打开、关闭、刷新、前进、后退标签页。
5. Agent 能按需激活真实浏览器 tab。
6. Agent 能执行受超时保护的 JavaScript。
7. Agent 能截取当前活动 tab 的可见区域。
8. v1.8 LLM proxy 可供扩展调用，真实 API Key 不进入扩展。
9. 受限浏览器页面返回明确不可控制错误。
10. 用户能在 Side Panel 清楚看到当前处于 Unrestricted Mode。
