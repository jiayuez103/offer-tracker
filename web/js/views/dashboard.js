// 概览：数字卡片、需要处理、未来 7 天、投递漏斗、每周投递、赛道对比。
import { store } from '../store.js';
import { api } from '../api.js';
import { h, icon, ensureCss, openApp, openNewApp, openInvite, eventChip, deadlineChip } from '../ui.js';
import { pixelText } from '../pixel.js';
import { STAGE_LABEL, TRACKS } from '../../shared/constants.js';
import { actionItems, funnel, weeklyApplied, stageIndex, isClosed, asBi } from '../../shared/domain.js';
import { todayInZone, formatZoned, isoToLocalInput, zonedToISO, deadlineISO, addDays, diffDays } from '../../shared/time.js';

const KIND_ICON = { test: 'clock', meeting: 'calendar', deadline: 'flag', review: 'message', stale: 'alert', overdue: 'alert' };
const PLOT_HEIGHT = 120;
const LABEL_BAND = 24;

const fmtMD = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const hm = (iso, tz) => isoToLocalInput(iso, tz).slice(11);

// ---------- 共用提示框（数值在前，说明在后） ----------
let tipEl = null;

function showTip({ value, label }, x, y) {
  if (!tipEl) {
    tipEl = h('div', { class: 'viz-tip', role: 'tooltip' });
    document.body.append(tipEl);
  }
  tipEl.replaceChildren(h('b', null, value), label);
  tipEl.classList.add('on');
  const left = Math.min(x + 14, window.innerWidth - tipEl.offsetWidth - 8);
  tipEl.style.left = `${Math.max(8, left)}px`;
  tipEl.style.top = `${y + 14}px`;
}

function hideTip() {
  tipEl?.classList.remove('on');
}

function tipHandlers(content) {
  return {
    onPointermove: (e) => showTip(content, e.clientX, e.clientY),
    onPointerleave: hideTip,
    onFocus: (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      showTip(content, r.left + r.width / 2, r.bottom);
    },
    onBlur: hideTip,
  };
}

// ---------- 入口 ----------
export function render(root) {
  ensureCss('/css/dashboard.css');
  const draw = () => {
    hideTip();
    root.replaceChildren(build());
  };
  draw();
  const timer = setInterval(draw, 60000); // 倒计时每分钟刷新
  const unsubscribe = store.subscribe((topic) => {
    if (['load', 'applications', 'settings'].includes(topic)) draw();
  });
  return () => {
    clearInterval(timer);
    unsubscribe();
    hideTip();
  };
}

function build() {
  const { applications: apps, settings } = store.state;
  if (!apps.length) return welcome();
  const now = new Date();
  const today = todayInZone(settings.homeTz, now);
  return h('div', { class: 'dash' },
    inboxBar(),
    digestBar(apps, settings, now),
    kpiRow(apps, settings, today),
    h('div', { class: 'dash-grid' },
      h('div', { class: 'dash-col' }, actionCard(apps, settings, now), agendaCard(apps, settings, now)),
      h('div', { class: 'dash-col' }, funnelCard(apps), weeklyCard(apps, settings, today), trackCard(apps))));
}

function welcome() {
  const { profile, resumes } = store.state;
  const name = asBi(profile?.basic?.name);
  // 三步按顺序排开：做完的打勾，还没做的第一步就是下一步，高亮成主按钮
  const steps = [
    { icon: 'idcard', label: '填个人档案', done: Boolean(name.zh || name.en || profile?.basic?.email), go: () => { location.hash = '#/profile'; } },
    { icon: 'document', label: '上传简历', done: resumes.some((r) => (r.files || []).length), go: () => { location.hash = '#/resumes'; } },
    { icon: 'briefcase', label: '记第一条投递', done: false, go: () => openNewApp() },
  ];
  const next = steps.findIndex((s) => !s.done);
  return h('section', { class: 'card dash-welcome' },
    h('div', { class: 'card-head' }, h('h3', null, '开始')),
    h('div', { class: 'card-body steps-row' }, steps.map((s, i) => [
      i ? icon('chevron', 'icon step-arrow') : null,
      h('button', { type: 'button', class: ['step', s.done && 'done', i === next && 'next'], onClick: s.go },
        s.done ? icon('check') : pixelText(String(i + 1), 21),
        icon(s.icon),
        h('span', null, s.label)),
    ])));
}

// ---------- 今明两天 ----------
const DIGEST_KINDS = new Set(['test', 'meeting', 'deadline', 'overdue']);

/** 今明两天真正要动手的事；没有就不渲染这一条 */
/** 邮件一键导入进来的待确认条目：点一下打开预填好的确认框 */
function inboxBar() {
  const box = h('section', { class: 'digest inbox-bar', hidden: true });
  api.get('/api/inbox').then((list) => {
    if (!list.length) return;
    box.hidden = false;
    box.replaceChildren(
      h('span', { class: 'digest-label' }, icon('mail'), `邮件导入待确认 ${list.length} 条`),
      h('ul', { class: 'digest-list' }, list.map((it) => h('li', null,
        h('button', {
          type: 'button',
          class: 'digest-item',
          onClick: () => openInvite({ pending: it }),
        },
        h('b', null, it.company || '未知公司'),
        h('span', null, `${it.type}${it.deadline ? '' : ' · 期限待填'}`))))),
      h('span', { class: 'spacer' }),
      h('button', {
        class: 'btn sm ghost',
        type: 'button',
        onClick: async () => {
          for (const it of list) await api.del(`/api/inbox/${it.id}`);
          box.hidden = true;
        },
      }, '全部忽略'));
  }).catch(() => {});
  return box;
}

function digestBar(apps, settings, now) {
  const limit = now.getTime() + 2 * 86400000;
  const items = actionItems(apps, settings, now).filter((it) => {
    if (!DIGEST_KINDS.has(it.kind)) return false;
    if (!it.event) return it.kind !== 'overdue'; // 网申截止：只留还没过期的
    const at = Date.parse(it.event.at);
    return at >= now.getTime() && at <= limit;
  });
  if (!items.length) return null;
  return h('section', { class: 'digest' },
    h('span', { class: 'digest-label' }, icon('clock'), '今明两天'),
    h('ul', { class: 'digest-list' }, items.map((it) => h('li', null,
      h('button', {
        type: 'button',
        class: `digest-item kind-${it.kind}`,
        onClick: () => openApp(it.app.id, { tab: it.event ? 'events' : 'info' }),
      },
      h('b', null, it.app.company || it.app.position || '未命名'),
      h('span', null, it.text))))));
}

// ---------- 数字卡片 ----------
function tile(label, value) {
  return h('div', { class: 'card kpi' },
    h('div', { class: 'kpi-label' }, label),
    h('div', { class: 'kpi-value' }, pixelText(String(value), 34)));
}

function weekTile(count, goal) {
  const pct = goal ? Math.min(100, Math.round((count / goal) * 100)) : 0;
  return h('div', { class: 'card kpi' },
    h('div', { class: 'kpi-label' }, '本周投递'),
    h('div', { class: 'kpi-value' }, pixelText(String(count), 34), goal ? h('span', { class: 'kpi-goal' }, pixelText(`/ ${goal}`, 16)) : null),
    goal
      ? h('div', { class: 'meter', role: 'meter', 'aria-label': '本周投递进度', 'aria-valuenow': String(count), 'aria-valuemin': '0', 'aria-valuemax': String(goal) },
        h('span', { style: { width: `${pct}%` } }))
      : null);
}

function kpiRow(apps, settings, today) {
  const submitted = apps.filter((a) => a.stage !== 'wishlist');
  const active = submitted.filter((a) => a.status === 'active');
  const interviewing = active.filter((a) => a.stage === 'interview' || a.stage === 'final');
  const offers = apps.filter((a) => a.stage === 'offer' && !isClosed(a));
  return h('div', { class: 'kpis' },
    tile('已投递', submitted.length),
    tile('进行中', active.length),
    tile('面试中', interviewing.length),
    tile('Offer', offers.length),
    weekTile(weeklyApplied(apps, 1, today)[0].count, settings.weeklyGoal || 0));
}

// ---------- 需要处理 ----------
function actionCard(apps, settings, now) {
  const items = actionItems(apps, settings, now);
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, items.length ? `需要处理 · ${items.length}` : '需要处理')),
    h('div', { class: 'card-body' }, items.length
      ? h('ul', { class: 'todo' }, items.map((it) => h('li', null,
        h('button', {
          type: 'button',
          class: `todo-item kind-${it.kind}`,
          onClick: () => openApp(it.app.id, { tab: it.event ? 'events' : 'info' }),
        },
        icon(KIND_ICON[it.kind]),
        h('span', { class: 'todo-main' },
          h('b', null, it.app.company || it.app.position || '未命名'),
          it.app.company && it.app.position ? h('span', { class: 'muted' }, ` · ${it.app.position}`) : null),
        h('span', { class: 'todo-text' }, it.text),
        icon('chevron', 'icon go')))))
      : h('div', { class: 'empty small' }, '没有要处理的事')));
}

// ---------- 未来 7 天 ----------
function agendaCard(apps, settings, now) {
  const start = now.getTime();
  const end = start + 7 * 86400000;
  const rows = [];
  for (const app of apps) {
    if (isClosed(app)) continue;
    for (const ev of app.events || []) {
      const at = Date.parse(ev.at);
      if (!ev.done && at >= start && at <= end) rows.push({ at, app, ev });
    }
    if (app.stage === 'wishlist' && app.deadline && app.status === 'active') {
      const at = Date.parse(deadlineISO(app.deadline, settings.targetTz));
      if (at >= start && at <= end) rows.push({ at, app, deadline: true });
    }
  }
  rows.sort((a, b) => a.at - b.at);

  const today = todayInZone(settings.homeTz, now);
  const groups = new Map();
  for (const r of rows) {
    const day = todayInZone(settings.homeTz, new Date(r.at));
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(r);
  }
  const dayLabel = (day) => {
    const d = diffDays(today, day);
    const base = formatZoned(zonedToISO(`${day}T12:00`, settings.homeTz), settings.homeTz, { time: false });
    return d === 0 ? `今天 ${base}` : d === 1 ? `明天 ${base}` : base;
  };

  return h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', null, '未来 7 天'),
      h('a', { href: '#/calendar' }, '全部日程')),
    h('div', { class: 'card-body' },
      rows.length
        ? [...groups].map(([day, list]) => h('div', { class: 'agenda-day' },
          h('div', { class: 'agenda-date' }, dayLabel(day)),
          list.map((r) => agendaRow(r, settings))))
        : h('div', { class: 'empty small' }, '未来 7 天没有安排')));
}

function agendaRow(r, settings) {
  const iso = new Date(r.at).toISOString();
  const what = r.deadline
    ? `${r.app.company || ''}${r.app.position ? ` · ${r.app.position}` : ''}`
    : `${r.app.company || r.app.position || ''}${r.ev.title ? ` · ${r.ev.title}` : ''}`;
  return h('button', { type: 'button', class: 'agenda-row', onClick: () => openApp(r.app.id, { tab: r.deadline ? 'info' : 'events' }) },
    h('span', { class: 'agenda-time' }, hm(iso, settings.homeTz)),
    r.deadline ? deadlineChip() : eventChip(r.ev.type),
    h('span', { class: 'agenda-what' }, what),
    h('span', { class: 'agenda-other muted' }, `${settings.targetTzLabel} ${formatZoned(iso, settings.targetTz)}`),
    icon('chevron', 'icon go'));
}

// ---------- 漏斗 ----------
function funnelCard(apps) {
  const rows = funnel(apps);
  const base = rows[0].count;
  if (!base) return null; // 还没投出去，整张卡片不出现
  const body = h('div', { class: 'funnel' }, rows.map((r, i) => {
      const share = r.count / base;
      const prev = i ? rows[i - 1].count : 0;
      const conv = i && prev ? Math.round((r.count / prev) * 100) : null;
      const label = i ? `${STAGE_LABEL[r.key]} · 上一步转化 ${conv ?? 0}% · 占已投递 ${Math.round(share * 100)}%` : '已投递';
      return h('div', { class: 'funnel-row', tabindex: '0', 'aria-label': `${r.count} 家 ${label}`, ...tipHandlers({ value: `${r.count} 家`, label }) },
        h('span', { class: 'funnel-label' }, STAGE_LABEL[r.key]),
        h('span', { class: 'funnel-track' },
          r.count ? h('span', { class: `funnel-bar ${r.key}`, style: { width: `${(share * 82).toFixed(1)}%` } }) : null,
          h('span', { class: 'funnel-value' }, String(r.count), conv != null ? h('span', { class: 'muted' }, ` ${conv}%`) : null)));
    }));
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, '投递漏斗')),
    h('div', { class: 'card-body' }, body));
}

// ---------- 每周投递 ----------
function weeklyCard(apps, settings, today) {
  const weeks = weeklyApplied(apps, 8, today);
  const goal = settings.weeklyGoal || 0;
  const max = Math.max(goal, ...weeks.map((w) => w.count), 1);
  const y = (v) => (v / max) * PLOT_HEIGHT;
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, '每周投递')),
    h('div', { class: 'card-body' },
      h('div', { class: 'weekly', style: { height: `${PLOT_HEIGHT + LABEL_BAND + 26}px` } },
        goal ? h('div', { class: 'goal-line', style: { bottom: `${LABEL_BAND + y(goal)}px` } }, h('span', null, `目标 ${goal}`)) : null,
        weeks.map((w, i) => {
          const current = i === weeks.length - 1;
          const range = `${fmtMD(w.weekStart)}–${fmtMD(addDays(w.weekStart, 6))}${current ? '（本周）' : ''}`;
          return h('div', {
            class: ['wk', current && 'current'],
            tabindex: '0',
            'aria-label': `${range} 投了 ${w.count} 家`,
            ...tipHandlers({ value: `${w.count} 家`, label: range }),
          },
          h('span', { class: 'wk-value' }, String(w.count)),
          w.count ? h('span', { class: 'wk-bar', style: { height: `${y(w.count)}px` } }) : null,
          h('span', { class: 'wk-label' }, current ? '本周' : fmtMD(w.weekStart)));
        }))));
}

// ---------- 赛道对比 ----------
function trackCard(apps) {
  const rows = TRACKS.map((track) => {
    const list = apps.filter((a) => a.track === track && a.stage !== 'wishlist');
    const interview = list.filter((a) => stageIndex(a.stage) >= stageIndex('interview')).length;
    return { track, total: list.length, interview, offer: list.filter((a) => a.stage === 'offer').length };
  }).filter((r) => r.total);
  if (!rows.length) return null; // 没选赛道的话整张卡片不出现
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, '赛道对比')),
    h('div', { class: 'card-body' },
      h('table', { class: 'track-table' },
        h('thead', null, h('tr', null, ['赛道', '已投递', '进入面试', '面试率', 'Offer'].map((t) => h('th', null, t)))),
        h('tbody', null, rows.map((r) => h('tr', null,
          h('td', null, r.track),
          h('td', null, String(r.total)),
          h('td', null, String(r.interview)),
          h('td', null, `${Math.round((r.interview / r.total) * 100)}%`),
          h('td', null, String(r.offer))))))));
}
