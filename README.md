# Daily Flow Tracker 🍅

> 番茄钟 + 任务管理 + 日历热力图 + 极光模式 | Electron 桌面应用
>
> **版本**: v2.8.2 | **平台**: Windows / macOS

---

## 截图

```
┌────────────────────────────────────────────────────────────┐
│ Daily Flow Tracker                              ─  □  ×   │
├──────────────────┬─────────────────────────────────────────┤
│  番茄钟面板       │  任务面板 / 日历 / 热力图              │
│                  │                                         │
│  ┌────────────┐  │  ⬜ 任务1                                │
│  │  🍅 25:00  │  │  ⬜ 任务2     ✅ 任务3                   │
│  │  FOCUS     │  │  [输入框] [▼分类] [+]                   │
│  │  ▶ START   │  │  [全部|💼|📚|💪|🧹|🎯]                 │
│  └────────────┘  │                                         │
├──────────────────┴─────────────────────────────────────────┤
│  3/5 已完成 | 45min 专注 | 🍅×3 | ████░░ 60%              │
└────────────────────────────────────────────────────────────┘
```

---

## 功能总览

| 模块 | 功能 | 快捷键/操作 |
|:---|:---|:---|
| 🍅 番茄钟 | Focus / Short Break / Long Break | 点击模式标签切换 |
| | 开始/暂停/继续/重置 | 点击中央按钮 |
| | SVG 环形进度 + 呼吸动画 | 自动 |
| | 自定义时长 (5–60min) | 齿轮图标 ⚙️ |
| | 完成自动切模式 + 提示音 | 自动 |
| 📋 任务管理 | 添加任务 (5分类) | 输入框 + Enter |
| | 标记完成 / 编辑文字 / 删除 | 点击 / 双击 / hover ✕ |
| | 分类切换 (Work/Learning/Health/Life/Goals) | 点击色点循环 |
| | 拖拽排序 | HTML5 Drag & Drop |
| | 备注 (textarea) | 点击 📝 |
| | 分类筛选 chips | 点击分类标签 |
| | 跨日期导航 (← → 今天) | 日期导航栏 |
| 📅 日历视图 | 月历网格 + 任务完成度圆点 | 点击日期查看 |
| 🔥 热力图 | 12 周综合得分 (完成率×0.6 + 番茄×0.4) | 5级色阶 |
| 🎨 极光 Aurora | SVG feTurbulence 动态极光背景 | 5套色板 |
| | 进度条/按钮颜色跟随 | 自动联动 |
| | 强度/速度/暂停控制 | 齿轮面板内 |
| 🌫️ 背景光晕 | Ambient Glow Lissajous 流动荧光 | 可开关 (齿轮面板) |
| | 背景雾光 / 全局光晕 / 玻璃质感 | 三层次 |
| 🎵 提示音 | 计时结束即时播放 (base64 data URI) | macOS afplay / Win PowerShell |
| | 自定义 MP3 | 放 `custom-beep.mp3` 到数据目录 |
| 🌙 主题 | Dark / Light | 顶部栏 🌙/☀️ |
| | Classic / Cozy 风格 | 顶部栏切换 |
| 📊 统计 | 每日番茄数 / 专注时长 / 完成率 | 底部状态栏 |
| 📦 双存储 | localStorage (主) + JSON 文件 (持久化) | 1秒双向同步 |
| 🔄 HTTP Bridge | REST API 端口 25713 | Claude / Obsidian 远程操作 |

---

## 快速开始

### 下载

从 [Releases](https://github.com/hanhtang711-netizen/DailyFlowTracker/releases) 下载对应平台的可执行文件：

- **Windows**: `DailyFlowTracker-{version}.exe` (便携版，无需安装)
- **macOS**: `DailyFlowTracker-{version}-mac.dmg`

### 运行

```bash
# Windows: 双击 exe
DailyFlowTracker-2.8.2.exe

# macOS: 双击 dmg → 拖到 Applications
open -a "Daily Flow Tracker"

# 开发模式
npm install
npx electron .
```

### 构建

```bash
npm run build:win   # → dist/DailyFlowTracker-{version}.exe
npm run build:mac   # → dist/DailyFlowTracker-{version}-mac.dmg
```

---

## 番茄钟

### 三种模式

| 模式 | 默认时长 | 用途 |
|:---|:---:|:---|
| **FOCUS** 🍅 | 25 分钟 | 专注工作 |
| **SHORT BREAK** ☕ | 5 分钟 | 短休息 |
| **LONG BREAK** 🌿 | 15 分钟 | 长休息（每 4 个🍅后） |

### 计时器操作

| 操作 | 按钮 |
|:---|:---|
| 开始 | ▶ START |
| 暂停 | ⏸ PAUSE |
| 继续 | ▶ RESUME |
| 重置 | ↺ RESET |

### 自定义时长

点击齿轮图标 ⚙️ → 分别设置 Focus / Short Break / Long Break 时长 (5–60 分钟)。

### 统计

- 左栏底部显示当日 🍅 数 + ⏱ 专注分钟数
- 跨天切换时自动存档统计

---

## 任务管理

### 添加任务

1. 在输入框输入任务文字
2. 右侧下拉选择分类（默认 Work）
3. 按 Enter 或点击 + 按钮
4. GSAP 弹性入场动画

### 5 分类系统

| 分类 | 颜色 | 图标 | 用途 |
|:---|:---|:---|:---|
| **Work** 💼 | `#1ed760` 绿 | 📋 | 作业、工作 |
| **Learning** 📚 | `#539df5` 蓝 | 📖 | 学习、阅读 |
| **Health** 💪 | `#f3727f` 红 | ❤️ | 运动、饮食 |
| **Life** 🧹 | `#ffa42b` 橙 | 🏠 | 生活杂务 |
| **Goals** 🎯 | `#c084fc` 紫 | ⭐ | 长期目标 |

### 任务交互

| 操作 | 方式 | 动效 |
|:---|:---|:---|
| 标记完成 | 点击左侧 checkbox | 划线 + 透明度 |
| 切换分类 | 点击任务左侧色点 | 循环切换 5 色 |
| 编辑文字 | 双击任务文字 | 内联输入框 |
| 备注 | 点击 📝 | 展开 textarea |
| 删除 | hover 后点击 ✕ | GSAP 折叠退场 |
| 拖拽排序 | 拖动任务卡片 | HTML5 DnD |

### 分类筛选

任务列表上方 chips 条：`全部 / 💼工作 / 📚学习 / 💪健康 / 🧹生活 / 🎯目标`

点击分类只显示该分类的任务，再次点击回到全部。

---

## 日历视图

在任务面板顶部切换到 `📅 日历` tab：
- 月历网格显示当月所有日期
- 每个日期显示任务完成度圆点 (2级: >50% / ≤50%)
- 点击日期 → 右侧展开当日任务详情
- 上月/下月导航 ← →

---

## 热力图

切换到 `🔥 热力图` tab：
- 显示过去 12 周每日综合得分
- **得分公式** = 任务完成率 × 0.6 + 番茄进度 × 0.4
- 5 级色阶：无 → 浅 → 中 → 深 → 满
- 鼠标悬停显示具体日期和得分

---

## 外观与设置

### 主题 / 风格

| 组合 | 效果 |
|:---|:---|
| Classic + Dark | Spotify 暗色（默认）— 黑底绿字 |
| Classic + Light | 白底绿字 |
| Cozy + Light | 暖色调 — 奶油棕 + 琥珀 |

顶部栏右侧操作：
- 🌙 / ☀️ — 切换 Dark / Light 主题
- Classic / Cozy — 切换风格

### 极光 Aurora

SVG feTurbulence + feDisplacementMap 五层径向渐变漂移。

| 操作 | 位置 |
|:---|:---|
| 5 套色板切换 | 顶部栏右侧 🎨 色点 |
| 强度滑块 | 齿轮面板 → Aurora 强度 |
| 速度滑块 | 齿轮面板 → Aurora 速度 |
| 暂停/恢复 | 齿轮面板 → ⏸ |

色板：`dft`(绿) / `aurora`(青紫) / `sunset`(橙红) / `neon`(霓虹粉紫) / `ocean`(蓝)

### 背景光晕

齿轮面板 → Ambient Glow 开关。11 个径向渐变色块在 8 轴 GSAP 动画下产生非重复有机流动。

### 提示音

- 计时结束自动播放 beep
- macOS: `afplay` (自定义 MP3) 或 `osascript beep`
- 应用内预缓存 base64 data URI → 零延迟回放
- 自定义 MP3 放到数据目录下的 `custom-beep.mp3`

---

## HTTP Bridge API

DFT 内置 HTTP 服务器监听 `127.0.0.1:25713`，供外部工具（Claude / Alfred / Obsidian）操作任务。

### 端点速查

| 方法 | 端点 | 功能 |
|:---|:---|:---|
| `GET` | `/ping` | 健康检查 → `pong` |
| `GET` | `/tasks?date=YYYY-M-D` | 查询某天任务 |
| `GET` | `/tasks/unfinished` | 所有日期未完成任务 |
| `GET` | `/stats?date=YYYY-M-D` | 每日统计 |
| `POST` | `/add-task` | 添加任务 `{text, cat?, date?}` |
| `PATCH` | `/tasks` | 修改任务 `{id, text?, cat?, done?}` |
| `DELETE` | `/tasks?id=xxx&date=YYYY-M-D` | 删除任务 |
| `POST` | `/sync` | 触发渲染进程同步 |

### macOS / Linux (curl)

```bash
# 添加任务
curl -s -X POST http://127.0.0.1:25713/add-task \
  -H "Content-Type: application/json" \
  -d '{"text":"完成任务","cat":"Work"}'

# 标记完成
curl -s -X PATCH http://127.0.0.1:25713/tasks \
  -H "Content-Type: application/json" \
  -d '{"id":"任务ID","done":true}'

# 查看未完成任务
curl -s http://127.0.0.1:25713/tasks/unfinished | python3 -m json.tool
```

### Windows (PowerShell)

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:25713/add-task" -Method POST `
  -ContentType "application/json; charset=utf-8" `
  -Body '{"text":"完成任务","cat":"Work"}'
```

---

## Obsidian 集成

DFT 提供 Obsidian 插件 `dft-bridge`，位于 `.obsidian/plugins/dft-bridge/`：

- 右侧边栏显示 DFT 未完成任务
- 紧迫度颜色编码：逾期 🔴 / 今日 🟠 / 3天内 🟡 / 之后 ⚪
- 倒计时天数显示
- 一键标记完成
- 60 秒自动刷新

**要求**: DFT 应用正在运行（HTTP Bridge 端口 25713）

---

## 数据与备份

### 文件位置

| 平台 | 路径 |
|:---|:---|
| Windows | `%APPDATA%/daily-flow-tracker/dft-data.json` |
| macOS | `~/Library/Application Support/daily-flow-tracker/dft-data.json` |

### 数据结构

```json
{
  "updatedAt": "2026-06-28T03:29:32.469Z",
  "settings": { "focus": 25, "short": 5, "long": 15 },
  "theme": "dark",
  "style": "classic",
  "days": {
    "2026-6-28": {
      "tasks": [
        { "id": "xxx", "text": "任务", "cat": "Work", "done": false, "note": "" }
      ],
      "stats": { "pomodoros": 3, "focusSec": 4500 }
    }
  }
}
```

### 备份机制

每次写入自动备份到 `backups/` 目录，保留最近 50 份。

---

## 版本历史

### v2.8.2 (2026-06-28)
- **修复**: syncAllToFile 覆盖 atomicModify 写入（合并而非覆写）
- **修复**: mergeFromFile 增加 `_lastFileUpdatedAt` 去重，轮询不再重复合并
- **修复**: toast 弹窗仅在 API 触发时显示

### v2.8.1 (2026-06-28)
- **修复**: 1 秒轮询禁止 toast 弹窗
- **修复**: 重复文件合并跳过

### v2.8.0 (2026-06-28)
- **新增**: `/tasks/unfinished` 端点（合并 GitHub v1.3.1）
- **修复**: macOS 写通道 → main.js 直接文件 I/O + 序列化写入队列
- **修复**: 渲染进程启动时序（`mergeFromFile(true)` 强制同步）
- **修复**: 脏 localStorage 覆写清洁文件
- **修复**: `_doSync` → `syncAllToFile` 未定义引用
- **改进**: 轮询 60s → 1s
- **改进**: 输入校验（空 text → 400, 空 id → 400）

### v1.3.1 (2026-06-27)
- Liquid Glass 毛玻璃 + UI 统一

### v1.3.0 (2026-06-27)
- macOS 迁移 + crash recovery + beep 系统 + `/tasks/unfinished`

### v1.2.0 (2026-06-02)
- UI 精修 + 提示音优化

### v1.1.0 (2026-06-02)
- Ambient Glow 毛玻璃 + 流动荧光背景

### v1.0.6 (2026-06-01)
- HTTP Bridge CRUD (PATCH/DELETE/GET /stats) + 自动备份

### v1.0.0 (2026-05-16)
- 初始版本：番茄钟 + 任务管理 + 日历热力图

---

## 技术栈

| 层 | 技术 |
|:---|:---|
| 桌面框架 | Electron 35 |
| 前端 | Vanilla JS + CSS Custom Properties |
| 动效 | GSAP 3.12.5 (CDN) |
| 数据存储 | localStorage + JSON 文件 |
| 外部接口 | HTTP Bridge (Node.js http, 端口 25713) |
| 构建 | electron-builder |
| 字体 | Inter + Noto Sans SC (Google Fonts) |
| Obsidian 插件 | Obsidian Plugin API (dft-bridge) |

---

## 数据流架构

```
Alfred/Claude ── HTTP POST ──→ main.js (atomicModify + write queue)
                                      │
                                      ├── safeWrite → dft-data.json (atomic)
                                      ├── broadcast IPC → renderer
                                      │                    │
                                      │                    ├── mergeFromFile(true)
                                      │                    └── syncAllToFile (合并)
                                      │
Obsidian dft-bridge ── HTTP GET ──→ main.js → dft-data.json
```

写操作通过 main.js 序列化队列 (`enqueue/drain`) 保证原子性，渲染进程只读。

---

## 许可证

- 私有项目

---

## 相关链接

- 完整项目文档: [wiki/DFT/项目_DFT完整项目文档_260628.md](https://github.com/hanhtang711-netizen/DailyFlowTracker/wiki)
- Obsidian dft-bridge 插件: `.obsidian/plugins/dft-bridge/`
- CHANGELOG: [CHANGELOG.md](CHANGELOG.md)
