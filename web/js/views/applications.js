// 投递页：看板 / 列表两种视图，可按赛道、公司类型筛选，顶栏搜索；看板拖拽改阶段。
import { store } from '../store.js';
import {
  h, icon, ensureCss, segmented, select, stars, stageChip, emptyState,
  openApp, openNewApp, attempt, toast, openModal,
} from '../ui.js';
import { STAGES, STAGE_LABEL, STATUS_LABEL, TRACKS, COMPANY_TYPES } from '../../shared/constants.js';
import { nextEvent, isStale, daysSinceProgress, stageIndex, isClosed } from '../../shared/domain.js';
import { daysUntil, dualTime } from '../../shared/time.js';

const PREF_KEY = 'jt.applications.prefs';
const DEFAULT_PREFS = { mode: 'board', track: '', type: '', status: 'active', sort: 'next', dir: 'asc', closedOpen: false };
const BOARD_COLUMNS = [...STAGES, { key: 'closed', label: '已结束' }];

function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    // 隐私模式等情况下不能存，忽略
  }
}

const columnOf = (app) => (isClosed(app) ? 'closed' : app.stage);
const statusMatch = (app, status) => status === 'all' || (status === 'closed' ? isClosed(app) : !isClosed(app));
const trackClass = (track) => (track === '产品' ? 'accent' : track === '市场' ? 'market' : '');

function matches(app, q) {
  if (!q) return true;
  return [app.company, app.companyEn, app.position, app.cities, app.industry, app.notes, app.referrer]
    .some((v) => String(v || '').toLowerCase().includes(q));
}

export function render(root, { params }) {
  ensureCss('/css/applications.css');
  const prefs = loadPrefs();
  const q = (params.get('q') || '').trim().toLowerCase();
  const toolbar = h('div', { class: 'apps-toolbar' });
  const content = h('div', { class: 'apps-content' });
  root.append(toolbar, content);

  const draw = () => {
    const apps = store.state.applications.filter((a) => (!prefs.track || a.track === prefs.track)
      && (!prefs.type || a.companyType === prefs.type)
      && matches(a, q));
    const visible = prefs.mode === 'list' ? apps.filter((a) => statusMatch(a, prefs.status)) : apps;
    toolbar.replaceChildren(...renderToolbar(prefs, draw, q, visible.length).filter(Boolean));
    content.replaceChildren(
      store.state.applications.length ? '' : renderWelcome(),
      prefs.mode === 'board' ? renderBoard(apps, prefs, draw) : renderList(apps, prefs, draw),
    );
  };

  draw();
  const unsubscribe = store.subscribe((topic) => {
    if (['load', 'applications', 'settings'].includes(topic)) draw();
  });
  const openId = params.get('open');
  if (openId) openApp(openId);
  return unsubscribe;
}

function renderToolbar(prefs, redraw, q, count) {
  const set = (key) => (value) => {
    prefs[key] = value;
    savePrefs(prefs);
    redraw();
  };
  return [
    segmented([{ value: 'board', label: '看板' }, { value: 'list', label: '列表' }], prefs.mode, set('mode')),
    select(TRACKS, prefs.track, set('track'), { placeholder: '全部赛道' }),
    select(COMPANY_TYPES, prefs.type, set('type'), { placeholder: '全部类型' }),
    prefs.mode === 'list'
      ? select([{ value: 'active', label: '进行中' }, { value: 'closed', label: '已结束' }, { value: 'all', label: '全部' }], prefs.status, set('status'))
      : null,
    q ? h('span', { class: 'chip accent search-chip' }, `搜索：${q}`,
      h('button', { type: 'button', 'aria-label': '清除搜索', onClick: () => { location.hash = '#/applications'; } }, '×')) : null,
    h('span', { class: 'spacer' }),
    h('span', { class: 'apps-count' }, `共 ${count} 条`),
  ];
}

function renderWelcome() {
  return h('div', { class: 'card apps-welcome' },
    h('div', null,
      h('h3', null, '还没有投递记录'),
      h('p', { class: 'muted' }, '点「新建投递」或按 N，粘贴 JD 就能自动拆出公司、岗位、城市和截止日。')),
    h('button', { class: 'btn primary', type: 'button', onClick: () => openNewApp() }, icon('plus'), '新建投递'));
}

// ---------- 看板 ----------

function sortKey(app, now) {
  const ev = nextEvent(app, now);
  if (ev) return Date.parse(ev.at);
  if (app.stage === 'wishlist' && app.deadline) return Date.parse(`${app.deadline}T23:59:00+08:00`);
  return Infinity;
}

function cardCompare(now) {
  return (a, b) => sortKey(a, now) - sortKey(b, now)
    || (b.priority || 0) - (a.priority || 0)
    || String(b.updatedAt).localeCompare(String(a.updatedAt));
}

function renderBoard(apps, prefs, redraw) {
  const now = new Date();
  // 「已结束」默认收成一条窄边，让进行中的 6 列在笔记本屏幕上一屏放下
  const setClosedOpen = (open) => {
    prefs.closedOpen = open;
    savePrefs(prefs);
    redraw();
  };
  const board = h('div', { class: ['board', !prefs.closedOpen && 'closed-collapsed'] });
  for (const col of BOARD_COLUMNS) {
    const items = apps.filter((a) => columnOf(a) === col.key).sort(cardCompare(now));
    if (col.key === 'closed' && !prefs.closedOpen) {
      const strip = h('section', {
        class: 'col col-closed collapsed',
        dataset: { col: 'closed' },
        title: '展开「已结束」',
        role: 'button',
        tabindex: '0',
        onClick: () => setClosedOpen(true),
        onKeydown: (e) => { if (e.key === 'Enter') setClosedOpen(true); },
      }, h('span', { class: 'dot closed' }), h('span', { class: 'col-vlabel' }, col.label), h('span', { class: 'col-count' }, String(items.length)));
      bindDrop(strip, 'closed');
      board.append(strip);
      continue;
    }
    const column = h('section', { class: ['col', `col-${col.key}`], dataset: { col: col.key } },
      h('header', { class: 'col-head' },
        h('span', { class: `dot ${col.key}` }),
        h('span', null, col.label),
        h('span', { class: 'col-count' }, String(items.length)),
        col.key === 'closed'
          ? h('button', { type: 'button', class: 'btn sm ghost icon-only', title: '收起', onClick: () => setClosedOpen(false) }, icon('x'))
          : null),
      h('div', { class: 'col-list' },
        items.map((a) => renderCard(a, now)),
        items.length ? null : h('div', { class: 'col-empty' }, col.key === 'wishlist' ? '把想投的岗位先收在这里' : '拖到这里')));
    bindDrop(column, col.key);
    board.append(column);
  }
  return board;
}

function cardFoot(app, now) {
  const settings = store.state.settings;
  if (isClosed(app)) return h('span', { class: 'card-meta' }, `${STATUS_LABEL[app.status]}在：${STAGE_LABEL[app.stage]}`);
  const ev = nextEvent(app, now);
  if (ev) {
    return h('span', { class: 'card-meta upcoming' }, icon('clock'), `${ev.type} · ${dualTime(ev.at, ev.tz, settings).primary}`);
  }
  if (app.stage === 'wishlist' && app.deadline) {
    const d = daysUntil(app.deadline, settings.targetTz, now);
    const text = d < 0 ? `已截止 ${-d} 天` : d === 0 ? '今天截止' : `还剩 ${d} 天截止`;
    return h('span', { class: ['card-meta', d <= 3 && 'urgent'] }, icon('flag'), text);
  }
  if (isStale(app, settings, now)) return h('span', { class: 'card-meta stale' }, icon('alert'), `${daysSinceProgress(app, now)} 天没动静`);
  if (app.appliedAt) return h('span', { class: 'card-meta' }, `投递于 ${app.appliedAt.slice(5).replace('-', '/')}`);
  return null;
}

function renderCard(app, now) {
  const card = h('article', {
    class: ['card', 'app-card', isClosed(app) && 'closed'],
    draggable: 'true',
    tabindex: '0',
    dataset: { id: app.id },
    onClick: () => openApp(app.id),
    onKeydown: (e) => { if (e.key === 'Enter') openApp(app.id); },
    onDragstart: (e) => {
      e.dataTransfer.setData('text/plain', app.id);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    },
    onDragend: () => card.classList.remove('dragging'),
  },
  h('div', { class: 'card-top' },
    h('span', { class: 'card-company' }, app.company || app.companyEn || '未命名公司'),
    stars(app.priority || 2)),
  h('div', { class: 'card-position' }, app.position || '—'),
  h('div', { class: 'card-tags' },
    app.track ? h('span', { class: ['chip', trackClass(app.track)] }, app.track) : null,
    app.cities ? h('span', { class: 'chip' }, app.cities) : null,
    app.companyType ? h('span', { class: 'chip' }, app.companyType) : null),
  cardFoot(app, now));
  return card;
}

function bindDrop(column, key) {
  column.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    column.classList.add('drop');
  });
  column.addEventListener('dragleave', (e) => {
    if (!column.contains(e.relatedTarget)) column.classList.remove('drop');
  });
  column.addEventListener('drop', (e) => {
    e.preventDefault();
    column.classList.remove('drop');
    const app = store.app(e.dataTransfer.getData('text/plain'));
    if (!app || columnOf(app) === key) return;
    if (key === 'closed') {
      chooseCloseReason(app);
      return;
    }
    const patch = { stage: key };
    if (app.status !== 'active') patch.status = 'active';
    attempt(() => store.updateApplication(app.id, patch)).then((rec) => {
      if (rec) toast(`${app.company || app.position} → ${STAGE_LABEL[key]}`);
    });
  });
}

function chooseCloseReason(app) {
  openModal({
    title: `结束「${app.company || app.position}」`,
    body: h('p', { class: 'muted', style: { margin: 0 } }, `会记下它停在「${STAGE_LABEL[app.stage]}」这一轮。`),
    actions: [
      { label: '取消', ghost: true, onClick: (close) => close() },
      { label: '我放弃了', onClick: (close) => { close(); attempt(() => store.updateApplication(app.id, { status: 'withdrawn' })); } },
      { label: '挂了', danger: true, onClick: (close) => { close(); attempt(() => store.updateApplication(app.id, { status: 'rejected' })); } },
    ],
  });
}

// ---------- 列表 ----------

const LIST_COLUMNS = [
  { key: 'company', label: '公司', get: (a) => a.company || a.companyEn || '' },
  { key: 'position', label: '岗位', get: (a) => a.position || '' },
  { key: 'track', label: '赛道', get: (a) => a.track || '' },
  { key: 'stage', label: '进度', get: (a) => stageIndex(a.stage) + (isClosed(a) ? 10 : 0) },
  { key: 'appliedAt', label: '投递日期', get: (a) => a.appliedAt || '' },
  { key: 'deadline', label: '网申截止', get: (a) => a.deadline || '' },
  { key: 'next', label: '下一个日程', get: (a, now) => nextEvent(a, now)?.at || '' },
  { key: 'progress', label: '最近进展', get: (a, now) => daysSinceProgress(a, now) },
];

function compare(x, y, dir) {
  if (x === y) return 0;
  if (x === '') return 1; // 空值总是排在最后
  if (y === '') return -1;
  const c = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y, 'zh-Hans-CN') : (x > y ? 1 : -1); // 中文按拼音
  return c * dir;
}

function renderList(apps, prefs, redraw) {
  const now = new Date();
  const settings = store.state.settings;
  const rows = apps.filter((a) => statusMatch(a, prefs.status));
  if (!rows.length) return emptyState(apps.length ? '没有符合条件的投递' : '还没有投递记录');
  const col = LIST_COLUMNS.find((c) => c.key === prefs.sort) || LIST_COLUMNS[6];
  const dir = prefs.dir === 'desc' ? -1 : 1;
  const sortValue = (a) => (col.key === 'next' ? (nextEvent(a, now) ? Date.parse(nextEvent(a, now).at) : '') : col.get(a, now));
  rows.sort((a, b) => compare(sortValue(a), sortValue(b), dir));

  const head = h('tr', null, LIST_COLUMNS.map((c) => h('th', {
    class: ['sortable', c.key === col.key && 'sorted'],
    onClick: () => {
      if (prefs.sort === c.key) prefs.dir = prefs.dir === 'desc' ? 'asc' : 'desc';
      else Object.assign(prefs, { sort: c.key, dir: 'asc' });
      savePrefs(prefs);
      redraw();
    },
  }, c.label, c.key === col.key ? (dir === 1 ? ' ↑' : ' ↓') : '')));

  const body = rows.map((a) => {
    const ev = nextEvent(a, now);
    const days = daysSinceProgress(a, now);
    const deadlineLeft = a.deadline && a.stage === 'wishlist' ? daysUntil(a.deadline, settings.targetTz, now) : null;
    return h('tr', { onClick: () => openApp(a.id) },
      h('td', { class: 'cell-company' }, h('b', null, a.company || a.companyEn || '未命名公司'), a.company && a.companyEn ? h('span', { class: 'cell-sub' }, a.companyEn) : null),
      h('td', null, a.position || '—'),
      h('td', null, a.track ? h('span', { class: ['chip', trackClass(a.track)] }, a.track) : ''),
      h('td', null, stageChip(a)),
      h('td', null, a.appliedAt || '—'),
      h('td', { class: deadlineLeft != null && deadlineLeft <= 3 ? 'urgent-text' : '' },
        a.deadline || '—', deadlineLeft != null && deadlineLeft >= 0 ? h('span', { class: 'cell-sub' }, ` 剩 ${deadlineLeft} 天`) : null),
      h('td', null, ev ? `${ev.type} · ${dualTime(ev.at, ev.tz, settings).primary}` : '—'),
      h('td', { class: isStale(a, settings, now) ? 'stale-text' : '' }, days === 0 ? '今天' : `${days} 天前`));
  });

  return h('div', { class: 'card table-wrap' },
    h('table', { class: 'apps-table' }, h('thead', null, head), h('tbody', null, body)));
}
