# Daily Flow Tracker — 迭代记录

> 产品版本日志，按版本倒序排列。
>
> 版本来源：Git tag 与本文件为准；`package.json` 始终与最新发布版本一致。v1.0.x 为 Git 初始化前的历史记录，未补造标签。

---

## v2.9.0 — macOS 26 Liquid Glass 图标 (260711)

### 新增
- Icon Composer `.icon` 资产接入 Electron Builder，生成 macOS 26 的 `Assets.car`，支持 Default / Dark / Mono（Tinted）渲染。
- arm64 与 x64 DMG 分别命名，避免多架构产物互相覆盖。

### 修复
- macOS 26 不再以运行时 PNG 覆盖 Dock 图标。
- 生产包纳入 Inter 与 Noto Sans SC，恢复番茄钟倒计时既有字体渲染。
- 菜单栏 Tray 恢复既有 `icon-tray.png`，不受应用图标外观切换影响。

---

## v2.8.3 — 字体自托管 (260706)

- Inter 与 Noto Sans SC 改为随应用打包，消除网络字体依赖。

---

## v2.8.2 — 同步合并修复 (260628)

- `syncAllToFile` 改为合并写入，避免覆盖 `atomicModify` 写队列。
- 轮询合并去重，并抑制轮询触发的重复 Toast。

---

## v2.8.1 — 轮询 Toast 修复 (260628)

- 跳过重复文件合并，禁止 1 秒轮询触发 Toast。

---

## v2.8.0 — macOS 直写与同步重构 (260628)

- 主进程直接文件 I/O、序列化写入队列与渲染进程启动同步修复。
- 新增 `/tasks/unfinished`，完善 HTTP Bridge 输入校验。

---

## v1.3.1 — Liquid Glass 毛玻璃与 UI 统一 (260627)

- 统一 macOS 下的 Liquid Glass 毛玻璃视觉与 UI 表现。

---

## v1.3.0 — macOS 迁移与崩溃防护 (260627)

- 完成 macOS 迁移、安全加固、崩溃恢复与提示音链路。

---

## v1.2.0 — UI 精修 + 提示音优化 (260602)

### 修复
- **CSS 注释结构损坏 → 标题栏错位** — Mist control 样式块插入时破坏了标题栏注释的 `/* */` 配对，导致 `.titlebar { display: flex; }` 被 CSS 解析器丢弃，标题栏还原为 48.8px auto 高度
- **Cozy 未完成复选框边框不可见** — `rgba(255,255,255,0.10)` 在 Cozy 浅棕背景 `#f8f2ea` 上近乎透明，改为 `rgba(0,0,0,0.15)`
- **Classic Light 任务色点与 Cozy 混淆** — `setStyle()`/`setTheme()` 切换后未调用 `renderTasks()`，任务分类圆点的 inline `background` 保留上一主题颜色

### 改进
- **Classic Dark 玻璃质感统一** — `.panel-tabs` / `.panel-tab` / `.style-toggle` 统一为与 `.mode-tabs` 一致的 `rgba(255,255,255,0.02)` 背景 + `rgba(255,255,255,0.035)` 边框
- **雾气呼吸动画** — 每层 GSAP 拆分为两个 tween：位置漂移（`repeatRefresh` 连续随机） + 透明度呼吸（`fromTo` + `yoyo` 渐显渐隐），移除 `.fg` 层的 `opacity` 硬编码冲突
- **提示音零延迟** — 主进程将 MP3 缓存为 base64 data URI，渲染器预创建 `Audio` 元素实现即时回放，替代原先 PowerShell + WinMM.MCI 冷启动方案（延迟 1-3 秒）

### 技术
- `ipcMain.handle("get-beep-data")` + `preload.js` bridge — MP3 → base64 传输通道
- GSAP 双 tween 分层设计（位置 + 透明度独立动画循环）
- CSS 解析器调试：通过 `document.styleSheets[1].cssRules` 检查规则加载状态

### 文件
- `preview-timer.html` — 开发预览版（主改文件，CSS 注释修复 + 玻璃质感 + 呼吸动画 + 提示音）
- `index.html` — 生产版（同步）
- `main.js` — 新增 `get-beep-data` IPC handler + data URI 缓存
- `preload.js` — 新增 `getBeepDataUri` bridge 方法

---

## v1.1.0 — Ambient Glow + 毛玻璃 (260602)

### 新增
- **流动荧光背景** — Spotify 翠绿多 blob Lissajous 运动系统，11 个径向渐变色块在 8 轴独立 GSAP 动画驱动下产生非重复有机流动，覆盖 >40% 画面
- **毛玻璃面板** — Classic Dark 模式下所有 UI 面板（顶部栏、番茄钟面板、任务面板、底部统计栏）统一为 `rgba(18,18,18,0.28)` + `backdrop-filter: blur(20px)`，背景荧光可穿透显示
- **全透明容器** — `.app` 层透明化，光晕可直接从 body 层穿透所有 UI 层

### 改进
- **文字颜色统一** — Classic Dark 模式全部文字/按键统一为 `#c0c0c0`（柔和白），覆盖顶部栏、底部栏、模式标签、分类芯片、任务项、统计数字等所有 UI 元素
- **窗口标题栏全透明** — frameless 标题栏透明处理
- **光晕羽化优化** — blur 参数调优，消除方形边缘纹路

### 技术
- GSAP 8 轴 Lissajous 动画（X/Y/Rotation/Opacity × outer/inner 双层），各轴使用互质周期避免重复轨迹
- 多 blob `radial-gradient` + `filter: blur()` 实现柔和羽化边缘

### 文件
- `preview-timer.html` — 开发预览版
- `index.html` — 生产版

---

## v1.0.6 — HTTP Bridge 完善 + 自动备份 (260601)

### 新增
- **HTTP bridge `PATCH /tasks` 端点** — Claude 可修改任务的 text/cat/done 字段
- **HTTP bridge `DELETE /tasks` 端点** — Claude 可按 ID 删除任务
- **HTTP bridge `GET /stats` 端点** — Claude 可查询每日统计（任务数/完成率/番茄数/专注分钟数）
- **写入自动备份** — 数据文件覆写前自动备份至 `backups/`，保留最近 50 份

### 改进
- HTTP bridge 现支持完整 CRUD：GET 读取 / POST 创建 / PATCH 更新 / DELETE 删除

### 文件
- `main.js` — HTTP 路由 + 备份逻辑
- `preload.js` — 新增 IPC 通道
- `index.html` — 新增 PATCH/DELETE 事件处理 + i18n

---

## v1.0.5 — GSAP 动效集成 (260601)

### 新增
- **GSAP v3.12.5 动效引擎** — CDN 引入，所有动效基于 GSAP 实现
- **Toast 弹性动画** — 弹出 `back.out(1.7)` 缩放入场，消失 `power2.in` 淡出
- **任务入场动画** — 新建任务弹性滑入（`autoAlpha` + `y` + `scale`）
- **任务删除动画** — 折叠退场（`autoAlpha` + `x` + `height` 收缩）

### 改进
- 外部 `DELETE /tasks` 复用 GSAP 动画
- 全链路 graceful fallback（GSAP 不可用时降级为无动画）

### 文件
- `index.html` — GSAP CDN + 所有动效逻辑

---

## v1.0.4 — HTTP Bridge 三项改进 (260601)

### 新增
- **HTTP bridge `GET /tasks` 端点** — Claude 可查询任意日期的任务列表
- **任务分类快捷切换** — 点击任务左侧色点循环切换分类（Work→Learning→Health→Life→Goals）

### 改进
- **时间戳冲突检测** — 文件 ↔ localStorage 同步增加 `dft_lastSyncAt` 机制，避免 Claude 写文件后 app 用旧数据覆盖

---

## v1.0.3 — 图标更换 (260526)

### 改进
- 应用图标更换 — Pillow 裁切圆形 + ICO 多分辨率生成 + electron-builder 重建

---

## v1.0.2 — 日程调整 (260523)

### 改进
- 作息标准化调整（08:00 → 09:00）

---

## v1.0.1 — 数据写入修复 (260516)

### 修复
- DFT 数据文件写入问题 — 进程锁 + UTF-8 无 BOM 编码

---

## v1.0.0 — 初始版本

Daily Flow Tracker 首个可用版本。功能包括：
- 番茄钟（Focus / Break / Long Break）
- 任务管理（添加/完成/删除/分类）
- 日历热力图
- 日视图导航
- 数据本地持久化（localStorage + JSON 文件）
- Dark/Light 主题 + Classic/Cozy 风格
- 中英文双语界面
- HTTP bridge 基础（`POST /tasks` 创建任务）
- Frameless 窗口 + 自定义标题栏
- Electron 便携式 exe 打包
