// 入口：加载数据、路由（#/页面?参数）、侧边栏徽标和双时区时钟、全局搜索和快捷键。
import { store } from './store.js';
import { h, hydrateIcons, debounce, openNewApp } from './ui.js';
import { actionItems } from '../shared/domain.js';
import { formatZoned } from '../shared/time.js';

const ROUTES = {
  dashboard: '概览',
  applications: '投递',
  calendar: '日程',
  profile: '档案',
  resumes: '简历',
  answers: '素材库',
  settings: '设置',
};
const view = document.getElementById('view');
const search = document.getElementById('global-search');
let cleanup = null;
let routeToken = 0;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, query = ''] = raw.split('?');
  return { name: ROUTES[name] ? name : 'dashboard', params: new URLSearchParams(query) };
}

async function route() {
  const token = ++routeToken;
  const { name, params } = parseHash();
  for (const a of document.querySelectorAll('[data-route]')) a.classList.toggle('active', a.dataset.route === name);
  document.getElementById('page-title').textContent = ROUTES[name];
  document.title = `${ROUTES[name]} · 秋招 Tracker`;
  if (document.activeElement !== search) search.value = name === 'applications' ? params.get('q') || '' : '';
  let mod;
  try {
    mod = await import(`./views/${name}.js`);
  } catch (e) {
    mod = { render: (root) => { root.append(h('div', { class: 'empty' }, `这个页面还没做好（${e.message}）`)); } };
  }
  if (token !== routeToken) return; // 期间又切换了页面
  cleanup?.();
  view.replaceChildren();
  view.scrollTop = 0;
  cleanup = mod.render(view, { params }) || null;
}

function setBadge(name, n) {
  const el = document.querySelector(`[data-badge="${name}"]`);
  if (el) el.textContent = n ? String(n) : '';
}

function updateBadges() {
  const { applications, settings } = store.state;
  setBadge('dashboard', actionItems(applications, settings).length);
  setBadge('applications', applications.filter((a) => a.status === 'active' && a.stage !== 'wishlist').length);
}

function renderClock() {
  const s = store.state.settings;
  if (!s) return;
  const now = new Date().toISOString();
  document.getElementById('clock').replaceChildren(
    h('div', null, `${s.homeTzLabel} ${formatZoned(now, s.homeTz)}`),
    h('div', null, `${s.targetTzLabel} ${formatZoned(now, s.targetTz)}`),
  );
}

function bindGlobal() {
  document.getElementById('new-app-btn').addEventListener('click', () => openNewApp());
  search.addEventListener('input', debounce(() => {
    const q = search.value.trim();
    const target = `#/applications${q ? `?q=${encodeURIComponent(q)}` : ''}`;
    if (location.hash !== target) location.hash = target;
  }, 250));
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('.overlay, .drawer')) return;
    if (e.key === '/') {
      e.preventDefault();
      search.focus();
    } else if (e.key === 'n') {
      e.preventDefault();
      openNewApp();
    }
  });
}

async function boot() {
  hydrateIcons();
  bindGlobal();
  try {
    await store.load();
  } catch (e) {
    document.getElementById('offline-banner').hidden = false;
    view.replaceChildren(h('div', { class: 'empty' },
      h('div', null, e.message),
      h('button', { class: 'btn', type: 'button', onClick: () => location.reload() }, '重试')));
    return;
  }
  store.subscribe((topic) => {
    if (topic === 'online') document.getElementById('offline-banner').hidden = store.state.online;
    if (topic === 'load' || topic === 'applications' || topic === 'settings') updateBadges();
    if (topic === 'load' || topic === 'settings') renderClock();
  });
  updateBadges();
  renderClock();
  setInterval(renderClock, 30000);
  store.startSync();
  window.addEventListener('hashchange', route);
  route();
}

boot();
