const { Plugin, ItemView, requestUrl, Notice } = require('obsidian');

const VIEW_TYPE = 'dft-bridge-view';
const DFT_HOST  = 'http://127.0.0.1:25713';
const POLL_MS   = 60000;

/* ========= helpers ========= */
function fmtDate(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function fmtDateCN(d) {
  const w = ['周日','周一','周二','周三','周四','周五','周六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 · ${w[d.getDay()]}`;
}
function dayDiff(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function isDDL(text) {
  return /截止|提交|DDL|deadline|due|到期|交稿/i.test(text);
}

/* ========= plugin ========= */
class DFTBridgePlugin extends Plugin {
  async onload() {
    try {
      // 注册 view 类型
      this.registerView(VIEW_TYPE, (leaf) => new DFTBridgeView(leaf));

      // 左侧 ribbon 图标
      this.addRibbonIcon('calendar', 'DFT Bridge', () => this.activateView());
      this.addCommand({
        id: 'open-dft-bridge',
        name: '打开 DFT Bridge',
        callback: () => this.activateView(),
      });

      // 启动后自动在右侧边栏创建标签
      // 注意：必须在 Obsidian 恢复完 workspace 布局后执行，
      // 否则旧视图还在，会跟新创建的重叠
      this.app.workspace.onLayoutReady(async () => {
        await new Promise(r => setTimeout(r, 500));
        // 清理旧布局中可能存在的错位视图
        this.app.workspace.detachLeavesOfType(VIEW_TYPE);
        // 在右侧边栏重建
        this._openInRightSidebar(false);
      });

      new Notice('✅ DFT Bridge 已加载');
    } catch (e) {
      console.error('DFT Bridge 加载失败:', e);
      new Notice('❌ DFT Bridge 加载失败: ' + e.message);
    }
  }

  _openInRightSidebar(split) {
    const { workspace } = this.app;
    try {
      const rs = workspace.rightSplit;
      if (rs && rs.collapsed) rs.expand();
    } catch (_) {}
    const leaf = workspace.getRightLeaf(split);
    if (leaf) {
      leaf.setViewState({ type: VIEW_TYPE, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  async activateView() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    this._openInRightSidebar(true);
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
}

/* ========= view ========= */
class DFTBridgeView extends ItemView {
  constructor(l) {
    super(l);
    this.status      = 'checking';   // 'checking' | 'connected' | 'disconnected'
    this.tasks       = {};           // { 'YYYY-M-D': [task, ...] }
    this.lastRefresh = null;
    this._timer      = null;
  }

  getViewType()      { return VIEW_TYPE; }
  getDisplayText()   { return 'DFT Bridge'; }
  getIcon()          { return 'calendar'; }

  /* ── lifecycle ── */
  async onOpen() {
    this._buildFrame();
    this._startPoll();
    await this.refresh();
  }
  onClose() { this._stopPoll(); }

  /* ── static frame ── */
  _buildFrame() {
    const c = this.contentEl;
    c.empty();
    c.addClass('dft-bridge');

    const hdr = c.createEl('div', { cls: 'dft-hdr' });
    const l = hdr.createEl('div', { cls: 'dft-hdr-l' });
    this._dot = l.createEl('span', { cls: 'dft-dot', text: '●' });
    this._st  = l.createEl('span', { cls: 'dft-st',  text: '检查中…' });

    const r = hdr.createEl('div', { cls: 'dft-hdr-r' });
    this._ts = r.createEl('span', { cls: 'dft-ts' });
    const btn = r.createEl('button', { cls: 'dft-ref', text: '↻' });
    btn.addEventListener('click', () => this.refresh());

    this._body = c.createEl('div', { cls: 'dft-body' });
  }

  /* ── status bar ── */
  _updStatus() {
    const setColor = c => { this._dot.style.color = c; };
    if (this.status === 'connected') {
      setColor('var(--color-green, #4caf50)');
      this._dot.textContent = '●';
      this._st.textContent  = 'DFT 已连接';
    } else if (this.status === 'disconnected') {
      setColor('var(--color-red, #f44336)');
      this._dot.textContent = '○';
      this._st.textContent  = 'DFT 未运行';
    } else {
      setColor('var(--text-muted)');
      this._dot.textContent = '●';
      this._st.textContent  = '检查失败';
    }
    if (this.lastRefresh) {
      this._ts.textContent =
        `${String(this.lastRefresh.getHours()).padStart(2,'0')}:` +
        `${String(this.lastRefresh.getMinutes()).padStart(2,'0')}`;
    }
  }

  /* ── fetch data ── */
  async refresh() {
    // 1. ping
    try {
      const r = await requestUrl({ url: `${DFT_HOST}/ping`, method: 'GET' });
      this.status = (r.text && r.text.trim() === 'pong') ? 'connected' : 'error';
    } catch (_) {
      this.status = 'disconnected';
    }

    // 2. fetch all unfinished tasks (across all dates)
    if (this.status === 'connected') {
      try {
        const r = await requestUrl({ url: `${DFT_HOST}/tasks/unfinished`, method: 'GET' });
        const j = JSON.parse(r.text);
        if (j.ok && j.groups) {
          const tasks = {};
          for (const group of j.groups) {
            tasks[group.date] = group.tasks;
          }
          this.tasks = tasks;
        } else {
          this.tasks = {};
        }
      } catch (_) {
        this.tasks = {};
      }
    }

    this.lastRefresh = new Date();
    this._updStatus();
    this._renderBody();
  }

  /* ── render body ── */
  _renderBody() {
    const b = this._body; b.empty();

    /* disconnected */
    if (this.status !== 'connected') {
      b.createEl('div', { cls: 'dft-empty', text: '⚠️ Daily Flow Tracker 未启动' });
      b.createEl('div', { cls: 'dft-hint',  text: '启动 DFT 后点击 ↻ 刷新' });
      return;
    }

    /* empty */
    const total = Object.values(this.tasks).reduce((s, t) => s + t.length, 0);
    if (!total) {
      b.createEl('div', { cls: 'dft-empty', text: '✅ 没有待完成任务' });
      b.createEl('div', { cls: 'dft-hint',  text: '安静的日子不多了' });
      return;
    }

    /* task sections — 所有日期按时间排序（过去 → 今天 → 未来） */
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const ts    = fmtDate(today);
    const dateKeys = Object.keys(this.tasks).sort((a, b) => new Date(a) - new Date(b));

    for (const ds of dateKeys) {
      const parts = ds.split('-');
      const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      this._renderSec(b, d, ds, this.tasks[ds], ds === ts);
    }

    /* urgency summary */
    this._renderSummary(b, today);
  }

  _renderSec(parent, date, dateKey, tasks, isToday) {
    const sec = parent.createEl('div', { cls: 'dft-sec' });
    const hdr = sec.createEl('div', { cls: 'dft-sec-hdr' });

    hdr.createEl('span', {
      text: isToday ? `📅 今天 · ${fmtDateCN(date)}` : `📅 ${fmtDateCN(date)}`,
    });

    const days = dayDiff(new Date(new Date().setHours(0,0,0,0)), date);
    if (days > 0) {
      const badge = hdr.createEl('span', {
        cls: `dft-badge${days <= 3 ? ' dft-hot' : ''}`,
      });
      badge.textContent = days === 1 ? '明天' : `${days} 天后`;
    }

    const list = sec.createEl('div', { cls: 'dft-list' });
    for (const t of tasks) this._renderTask(list, dateKey, t, date, days);
  }

  _renderTask(parent, ds, t, date, days) {
    const item = parent.createEl('div', { cls: `dft-task${t.done ? ' dft-done' : ''}` });

    /* row 1: checkbox + text */
    const r1 = item.createEl('div', { cls: 'dft-task-r1' });
    const cb = r1.createEl('input', { attr: { type: 'checkbox' } });
    cb.checked = t.done;
    cb.addEventListener('change', () => this._toggle(ds, t, cb));
    r1.createEl('span', { cls: 'dft-txt', text: t.text });

    /* row 2: meta */
    const r2 = item.createEl('div', { cls: 'dft-task-r2' });
    const icons = { Work: '📋', Learning: '📖', Other: '📌' };
    r2.createEl('span', { cls: 'dft-cat', text: `${icons[t.cat] || '📌'} ${t.cat}` });

    if (!t.done) {
      if (days < 0) {
        r2.createEl('span', { cls: 'dft-overdue', text: `⚠️ 逾期 ${Math.abs(days)} 天` });
      } else if (days === 0 && isDDL(t.text)) {
        r2.createEl('span', { cls: 'dft-today', text: '⏰ 今天截止' });
      } else if (days === 0) {
        r2.createEl('span', { cls: 'dft-due', text: '📌 今天' });
      }
    }
  }

  _renderSummary(parent, today) {
    let overdue = 0, dueToday = 0, thisWeek = 0;

    for (const [ds, tasks] of Object.entries(this.tasks)) {
      const parts = ds.split('-');
      const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      const days = dayDiff(today, d);
      const n = tasks.filter(t => !t.done).length;
      if (days < 0)        overdue  += n;
      else if (days === 0) dueToday += n;
      else if (days <= 7)  thisWeek += n;
    }

    if (!overdue && !dueToday && !thisWeek) return;

    const s = parent.createEl('div', { cls: 'dft-summary' });
    s.createEl('div', { cls: 'dft-sum-t', text: '📊 紧迫概览' });
    const r = s.createEl('div', { cls: 'dft-sum-r' });

    if (overdue > 0)  r.createEl('span', { cls: 'dft-sum-b dft-sum-over',  text: `🔴 过期 ${overdue}` });
    if (dueToday > 0) r.createEl('span', { cls: 'dft-sum-b dft-sum-today', text: `🟠 今日 ${dueToday}` });
    if (thisWeek > 0) r.createEl('span', { cls: 'dft-sum-b dft-sum-week',  text: `🟡 本周 ${thisWeek}` });
  }

  /* ── mark done — PATCH ── */
  async _toggle(ds, t, cb) {
    const done = cb.checked;
    try {
      await requestUrl({
        url: `${DFT_HOST}/tasks`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ date: ds, id: t.id, done }),
      });
      t.done = done;
      new Notice(done ? '✅ 任务已完成' : '↩️ 任务已恢复');
      this.refresh();
    } catch (_) {
      cb.checked = !done;   // revert
      new Notice('❌ 更新失败，DFT 未响应');
    }
  }

  /* ── polling ── */
  _startPoll() { this._timer = setInterval(() => this.refresh(), POLL_MS); }
  _stopPoll()  {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
}

module.exports = DFTBridgePlugin;
