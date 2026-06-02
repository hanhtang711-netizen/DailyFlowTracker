# DFT Classic Dark — 背景氛围光晕实现方案

> 日期：2026-06-02
> 状态：规划中（待实施）
> 对标：效果图左上角绿色呼吸光晕

---

## 1. 效果定义

**一句话：左上角绿色径向光晕，缓慢呼吸（opacity）+ 微微飘动（position），营造沉浸感但不抢内容。**

视觉参考（效果图特征）：
- 光源位置：左上角偏移（约 `at 15% 10%`）
- 颜色：`rgba(30,215,96,x)` 绿色系
- 范围：覆盖视口约 50-60%
- 动态：渐显渐隐周期 ~6-8s，位置漂移周期 ~12-15s
- 层级：在 body 底层，所有面板/内容之下

---

## 2. 现状

| 项目 | 值 | 行号 |
|------|-----|------|
| Dark `--app-bg` | `none` | `:root` 第 93 行 |
| Dark `--body-overlay` | `none` | `:root` 第 94 行 |
| Cozy `--app-bg` | 双层 radial-gradient ✅ | `[data-style="cozy"]` 第 200-202 行 |
| GSAP | 已加载（3.12.5） | `<head>` 第 16 行 |
| 已有呼吸动画 | `.ring-ambient` 的 `ambientBreathe` keyframes | 第 1718-1721 行 |
| Cozy 隐藏规则 | `.ring-ambient { opacity:0 }` in cozy | 第 1690 行 |

**结论：Cozy 有完整氛围体系，Dark 完全空白。动画引擎就位，只需补光晕层。**

---

## 3. 改动清单

### 3.1 CSS — 补 Token（`:root` 内，约第 93-94 行后）

```css
/* ===== Ambient Glow — Classic Dark Only ===== */
--glow-ambient-outer: radial-gradient(
  ellipse 70% 55% at 12% 8%,
  rgba(30, 215, 96, 0.10) 0%,
  rgba(30, 215, 96, 0.04) 30%,
  rgba(30, 215, 96, 0.01) 55%,
  transparent 75%
);
--glow-ambient-inner: radial-gradient(
  ellipse 45% 35% at 18% 14%,
  rgba(30, 215, 96, 0.07) 0%,
  rgba(30, 215, 96, 0.02) 40%,
  transparent 65%
);
```

> **参数说明：**
> - 外层：覆盖面大（70%×55%），透明度低（max 0.10），负责"环境底色"
> - 内层：更聚焦（45%×35%），稍亮（max 0.07），负责"光源中心"
> - 位置都偏左上（12%, 8%）和（18%, 14%），形成错位层次
> - **如果觉得太亮/太暗，只改这三个数字：`0.10`、`0.04`、`0.07`**

### 3.2 CSS — 新增光晕容器样式（在 `body {}` 规则之后，约第 268 行后）

```css
/* ===== Ambient Glow Layer (Classic Dark) ===== */
.ambient-glow {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.ambient-glow-layer {
  position: absolute;
  inset: -10%;
  background: var(--glow-ambient-outer);
  will-change: transform, opacity;
}

.ambient-glow-layer.inner {
  background: var(--glow-ambient-inner);
  /* 内层反向漂移方向 */
}
```

### 3.3 CSS — 确保 .app 在光晕之上（`.app {}` 规则内，约第 277 行）

确认 `.app` 有：
```css
position: relative;
z-index: 1;   /* 如果没有的话加上 */
```

### 3.4 CSS — Cozy 模式下隐藏光晕（在第 1690 行 cozy 隐藏规则附近追加）

```css
[data-style="cozy"] .ambient-glow {
  display: none;
}
```

### 3.5 JS — 创建光晕 DOM + GSAP 动画（在 `<script>` 主逻辑初始化部分）

**DOM 创建：**
```js
// === Ambient Glow Setup (Classic Dark only) ===
(function initAmbientGlow() {
  const style = document.documentElement.getAttribute('data-style');
  if (style === 'cozy') return; // Cozy 不需要

  const glowContainer = document.createElement('div');
  glowContainer.className = 'ambient-glow';
  glowContainer.innerHTML = `
    <div class="ambient-glow-layer outer"></div>
    <div class="ambient-glow-layer inner"></div>
  `;
  document.body.prepend(glowContainer);

  // --- GSAP Animation ---
  const outer = glowContainer.querySelector('.outer');
  const inner = glowContainer.querySelector('.inner');

  // 外层：大范围呼吸（主节奏）
  gsap.to(outer, {
    opacity: 0.6,
    scale: 1.03,
    duration: 7,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
  });

  // 内层：小范围漂浮（错相 3.5s，即半个周期）
  gsap.to(inner, {
    x: 25,
    y: 15,
    opacity: 0.5,
    duration: 13,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
    delay: -3.5,  // 错相位：从动画中段开始
  });

  // 微旋转让光晕边缘更自然
  gsap.to(inner, {
    rotation: 3,
    duration: 17,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
    delay: -8,
  });
})();
```

**GSAP 参数速查表：**

| 参数 | 外层 | 内层 | 含义 |
|------|------|------|------|
| `duration` | 7s | 13s / 17s | 周期长度 |
| `ease` | sine.inOut | sine.inOut | 正弦缓动（最自然的呼吸感） |
| `yoyo` | true | true | 往返播放 |
| `repeat` | -1 | -1 | 无限循环 |
| `delay` | 0 | -3.5 / -8 | **负延迟 = 错相位**，两层不同步才自然 |
| `opacity 目标` | 0.6 | 0.5 | 从 1.0 降到目标值再回来 |
| `scale 目标` | 1.03 | — | 微放大 3%，几乎不可察觉但能感觉到 |
| `x/y 目标` | — | 25px / 15px | 漂移幅度，很轻微 |

### 3.6 JS — 主题切换时同步（找到现有主题切换逻辑，追加）

```js
// 在 setTheme / 切换 data-style 的回调里加：
if (newStyle === 'classic' || newStyle === 'dark') {
  document.querySelector('.ambient-glow')?.style.removeProperty('display');
} else {
  const glow = document.querySelector('.ambient-glow');
  if (glow) glow.style.display = 'none';
}
```

---

## 4. 文件改动汇总

| 文件 | 改动位置 | 改动量 |
|------|---------|--------|
| `index.html` CSS `:root` | 第 93-94 行后插入 token | +8 行 |
| `index.html` CSS | 第 268 行后插入 `.ambient-glow` 样式 | +18 行 |
| `index.html` CSS `.app` | 确认/补 `z-index: 1` | +1 行 |
| `index.html` CSS cozy 规则 | 第 1690 行附近追加隐藏规则 | +3 行 |
| `index.html` JS | script 初始化区插入 IIFE | +35 行 |
| **总计** | | **~65 行新增，0 行删除** |

---

## 5. 验证方式

```
1. 打开 DFT → 默认 Classic Dark → 左上角应看到淡淡绿色光晕
2. 等 7-8 秒 → 光晕应有明显明暗呼吸
3. 等 13+ 秒 → 光晕中心应有微微位移
4. 切换到 Cozy → 光晕应完全消失
5. 切回 Classic Dark → 光晕恢复
6. 打开任务面板、操作番茄钟 → 光晕不应干扰交互（pointer-events: none）
7. 窗口缩放 → 光晕应跟随铺满（fixed + inset: 0）
```

---

## 6. 后续可扩展（本次不做）

- [ ] 计时中光晕收缩聚焦（GSAP timeline .pause() → 新 timeline）
- [ ] 鼠标 parallax（mousemove 监听 → 微调 x/y offset）
- [ ] 完成一个番茄时光晕闪一下（庆祝反馈）
- [ ] Cozy 模式也加对应的暖色光晕（目前 Cozy 用的是静态 CSS gradient）

---

## 7. 设计 Token 快速调参指南

觉得效果不对？只改这几个数：

| 想要的效果 | 改哪里 | 怎么改 |
|------------|--------|--------|
| 太亮/太抢眼 | `--glow-ambient-outer` 的 `0.10` | 降到 `0.06` 或 `0.04` |
| 太暗/看不见 | 同上 | 升到 `0.14` 或 `0.18` |
| 光源位置太靠边 | `at 12% 8%` | 改成 `at 20% 15%` 往中间挪 |
| 呼吸太快/太慢 | GSAP `duration: 7` | 改成 `10`（慢）或 `5`（快） |
| 漂浮幅度太大 | GSAP `x: 25, y: 15` | 改成 `x: 12, y: 8` |
| 不要漂浮只要呼吸 | 删掉 inner 层的 gsap.to | 只留外层的 opacity 动画 |
