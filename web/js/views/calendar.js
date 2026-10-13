// 日程：按天列出测评、笔试、面试和网申截止（按本地时区分组，右侧显示目标时区时间）；
// 可以直接勾选完成；右侧是订阅到苹果日历的入口。
import { store } from '../store.js';
import { h, icon, ensureCss, openApp, openInvite, attempt, safeUrl, copyText, emptyState } from '../ui.js';
import { calendarUrl } from '../api.js';
import { isClosed } from '../../shared/domain.js';
import { todayInZone, formatZoned, isoToLocalInput, zonedToISO, deadlineISO, diffDays } from '../../shared/time.js';

const PREF_KEY = 'jt.calendar.showPast';
const DAY = 86400000;

export function render(root) {
  ensureCss('/css/calendar.css');
  let showPast = false;
  try {
    showPast = localStorage.getItem(PREF_KEY) === '1';
  } catch {
    // 不能存偏好时用默认值
  }
  const setShowPast = (value) => {
    showPast = value;
    try {
      localStorage.setItem(PREF_KEY, value ? '1' : '0');
    } catch {
      // 忽略
    }
    draw();
  };
  const draw = () => root.replaceChildren(build(showPast, setShowPast));
  draw();
  return store.subscribe((topic) => {
    if (['load', 'applications', 'settings'].includes(topic)) draw();
  });
}

function collect(apps, settings, now, showPast) {
  const from = showPast ? now.getTime() - 30 * DAY : now.getTime() - 2 * 3600000; // 刚开始 2 小时内的仍算「现在」
  const rows = [];
  for (const app of apps) {
    if (isClosed(app)) continue;
    for (const ev of app.events || []) {
      const at = Date.parse(ev.at);
      if (at >= from) rows.push({ at, app, ev });
    }
    if (app.stage === 'wishlist' && app.status === 'active' && app.deadline) {
      const at = Date.parse(deadlineISO(app.deadline, settings.targetTz));
      if (at >= from) rows.push({ at, app, deadline: true });
    }
  }
  return rows.sort((a, b) => a.at - b.at);
}

function build(showPast, setShowPast) {
  const { applications: apps, settings } = store.state;
  const now = new Date();
  const rows = collect(apps, settings, now, showPast);
  const today = todayInZone(settings.homeTz, now);
  const groups = new Map();
  for (const r of rows) {
    const day = todayInZone(settings.homeTz, new Date(r.at));
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(r);
  }
  const toolbar = h('div', { class: 'cal-toolbar' },
    h('label', { class: 'row small' },
      h('input', { type: 'checkbox', checked: showPast, onChange: (e) => setShowPast(e.target.checked) }),
      '显示过去 30 天'),
    h('button', { class: 'btn sm', type: 'button', onClick: openInvite }, icon('message'), '粘贴邀请'),
    h('span', { class: 'spacer' }),
    h('span', { class: 'muted small' }, `按${settings.homeTzLabel}时间分组 · 右侧是${settings.targetTzLabel}时间`));
  const list = rows.length
    ? h('div', { class: 'cal-list' }, [...groups].map(([day, items]) => dayBlock(day, items, today, settings, now)))
    : emptyState(showPast ? '最近 30 天和之后都没有日程' : '还没有之后的日程。在投递详情的「日程与复盘」里添加。');
  return h('div', { class: 'cal' }, h('div', { class: 'cal-main' }, toolbar, list), subscribeCard(settings));
}

function dayBlock(day, items, today, settings, now) {
  const d = diffDays(today, day);
  const base = formatZoned(zonedToISO(`${day}T12:00`, settings.homeTz), settings.homeTz, { time: false });
  const prefix = { '-1': '昨天 · ', 0: '今天 · ', 1: '明天 · ' }[d] || '';
  return h('section', { class: ['cal-day', d < 0 && 'past', d === 0 && 'today'] },
    h('h3', { class: 'cal-date' }, `${prefix}${base}`),
    h('div', { class: 'card cal-items' }, items.map((r) => row(r, settings, now))));
}

function toggleDone(appId, eventId, done) {
  const app = store.app(appId);
  if (!app) return;
  attempt(() => store.updateApplication(appId, { events: app.events.map((e) => (e.id === eventId ? { ...e, done } : e)) }));
}

function row(r, settings, now) {
  const iso = new Date(r.at).toISOString();
  const time = isoToLocalInput(iso, settings.homeTz).slice(11);
  const other = `${settings.targetTzLabel} ${formatZoned(iso, settings.targetTz)}`;
  const past = r.at < now.getTime();
  const who = r.app.company || r.app.position || '';

  if (r.deadline) {
    return h('div', { class: ['cal-row', past && 'past'], onClick: () => openApp(r.app.id) },
      h('span', { class: 'cal-time' }, time),
      h('span', { class: 'chip warn' }, '网申截止'),
      h('div', { class: 'cal-what' }, h('b', null, who), r.app.position && r.app.company ? h('span', { class: 'muted' }, ` · ${r.app.position}`) : null),
      h('span', { class: 'cal-other muted' }, other),
      h('span', { class: 'cal-check' }));
  }

  const { ev } = r;
  const link = safeUrl(ev.location);
  const detail = ev.title || (r.app.company ? r.app.position : '');
  return h('div', { class: ['cal-row', ev.done && 'done', past && !ev.done && 'overdue'], onClick: () => openApp(r.app.id, { tab: 'events' }) },
    h('span', { class: 'cal-time' }, time),
    h('span', { class: 'chip accent' }, ev.type),
    h('div', { class: 'cal-what' },
      h('b', null, who),
      detail ? h('span', { class: 'muted' }, ` · ${detail}`) : null,
      link
        ? h('a', { class: 'cal-link', href: link, target: '_blank', rel: 'noopener', onClick: (e) => e.stopPropagation() }, icon('link'), '会议链接')
        : ev.location ? h('span', { class: 'muted small' }, ` · ${ev.location}`) : null),
    h('span', { class: 'cal-other muted' }, other),
    h('label', { class: 'cal-check', title: '标记为已完成', onClick: (e) => e.stopPropagation() },
      h('input', { type: 'checkbox', checked: !!ev.done, onChange: (e) => toggleDone(r.app.id, ev.id, e.target.checked) })));
}

function subscribeCard(settings) {
  const httpUrl = new URL(calendarUrl(), location.href).href;
  const webcal = httpUrl.replace(/^https?:/, 'webcal:');
  return h('aside', { class: 'card cal-side' },
    h('div', { class: 'card-head' }, h('h3', null, '同步到苹果日历')),
    h('div', { class: 'card-body' },
      h('p', { class: 'small' }, '订阅以后，新加的日程会自动出现在日历里：面试前 1 小时提醒，测评和网申截止前 1 天提醒。'),
      h('div', { class: 'row wrap' },
        h('a', { class: 'btn primary', href: webcal }, icon('calendar'), '订阅'),
        h('a', { class: 'btn', href: httpUrl, download: 'job-tracker.ics' }, icon('download'), '下载 .ics'),
        h('button', { class: 'btn ghost', type: 'button', onClick: () => copyText(httpUrl, '订阅地址已复制') }, icon('copy'), '复制地址')),
      h('ul', { class: 'small muted cal-tips' },
        h('li', null, '订阅时把「移除：提醒」取消勾选，不然日历不会提醒。'),
        h('li', null, '「自动刷新」选每 15 分钟或每小时。Tracker 没启动时日历只是暂停更新，不会丢数据。'),
        h('li', null, `日历按本机时区显示（现在是${settings.homeTzLabel}）。`))));
}
