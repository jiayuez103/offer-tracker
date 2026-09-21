// 小型 UI 工具：h() 建 DOM、图标、提示、弹窗、抽屉、确认框、常用表单控件。
// 用户输入一律作为文本节点插入；innerHTML 只用于内置的 SVG 图标。
import { STAGE_LABEL, STATUS_LABEL, CLOSED_STATUSES } from '../shared/constants.js';

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'multiple', 'readOnly', 'indeterminate']);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  let selectValue;
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' && tag === 'select') selectValue = v;
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  appendChildren(el, children);
  if (selectValue !== undefined) el.value = selectValue; // select 要等 option 加进去才能设值
  return el;
}

function appendChildren(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) appendChildren(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

// ---------- 图标（线性风格，24×24） ----------
const ICON_PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  board: '<rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
};

export function svg(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

export function icon(name, cls = 'icon') {
  const span = document.createElement('span');
  span.className = cls;
  span.innerHTML = svg(name);
  return span;
}

/** 把页面里空的 [data-icon] 元素填成 SVG（index.html 里的静态图标） */
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) if (!el.firstChild) el.innerHTML = svg(el.dataset.icon);
}

// ---------- 提示 ----------
export function toast(message, { type = 'info', action, duration = 3200 } = {}) {
  const box = document.getElementById('toasts');
  const el = h('div', { class: ['toast', type === 'error' && 'error'], role: 'status' }, h('span', null, message));
  if (action) {
    el.append(h('button', { type: 'button', onClick: () => { el.remove(); action.onClick(); } }, action.label));
  }
  box.append(el);
  setTimeout(() => el.remove(), action ? duration + 4000 : duration);
  return el;
}

/** 执行异步操作；失败时弹出错误提示并返回 undefined */
export async function attempt(fn, okMessage) {
  try {
    const result = await fn();
    if (okMessage) toast(okMessage);
    return result;
  } catch (e) {
    console.error(e);
    toast(e.message || '操作失败', { type: 'error' });
    return undefined;
  }
}

// ---------- 弹层（弹窗、抽屉共用 Esc 关闭栈） ----------
const layers = [];
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && layers.length) {
    e.preventDefault();
    layers.at(-1)();
  }
});

function pushLayer(close) {
  layers.push(close);
  return () => {
    const i = layers.indexOf(close);
    if (i >= 0) layers.splice(i, 1);
  };
}

/** actions: [{ label, primary, danger, ghost, onClick(close) }] */
export function openModal({ title, body, actions = [], wide = false, onClose }) {
  let removeLayer = () => {};
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    removeLayer();
    onClose?.();
  };
  const foot = actions.length
    ? h('div', { class: 'modal-foot' }, actions.map((a) => h('button', {
      type: 'button',
      class: ['btn', a.primary && 'primary', a.danger && 'danger', a.ghost && 'ghost'],
      onClick: () => a.onClick?.(close),
    }, a.label)))
    : null;
  const modal = h('div', { class: ['modal', wide && 'wide'], role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal-head' },
      h('h2', null, title),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn ghost icon-only', 'aria-label': '关闭', onClick: close }, icon('x'))),
    h('div', { class: 'modal-body' }, body),
    foot);
  const overlay = h('div', { class: 'overlay', onMousedown: (e) => { if (e.target === overlay) close(); } }, modal);
  document.body.append(overlay);
  removeLayer = pushLayer(close);
  requestAnimationFrame(() => modal.querySelector('.modal-body input, .modal-body textarea, .modal-body select')?.focus());
  return { close, el: modal };
}

export function confirmDialog(message, { okLabel = '确定', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value, close) => {
      answered = true;
      close();
      resolve(value);
    };
    openModal({
      title: '确认',
      body: h('p', { style: { margin: 0 } }, message),
      actions: [
        { label: '取消', onClick: (close) => answer(false, close) },
        { label: okLabel, primary: !danger, danger, onClick: (close) => answer(true, close) },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

/** 右侧抽屉；返回 { close, head, body } 两个可替换内容的容器 */
export function openDrawer({ onClose } = {}) {
  let removeLayer = () => {};
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    panel.remove();
    removeLayer();
    onClose?.();
  };
  const head = h('div', { class: 'drawer-title' });
  const body = h('div', { class: 'drawer-body' });
  const overlay = h('div', { class: 'drawer-overlay', onMousedown: close });
  const panel = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'drawer-head' },
      head, // .drawer-title 自己是 flex: 1，不要再加 spacer，否则会和标题平分宽度
      h('button', { type: 'button', class: 'btn ghost icon-only', 'aria-label': '关闭', onClick: close }, icon('x'))),
    body);
  document.body.append(overlay, panel);
  removeLayer = pushLayer(close);
  return { close, head, body };
}

// ---------- 表单控件 ----------
/** 带标签的表单项；控件不是单个输入框时用 tag: 'div'，避免点标签误触第一个按钮 */
export function field(label, control, { hint, full = false, tag = 'label' } = {}) {
  return h(tag, { class: ['field', full && 'full'] },
    h('span', { class: 'label' }, label),
    control,
    hint ? h('span', { class: 'hint' }, hint) : null);
}

export function input({ value = '', type = 'text', placeholder = '', onChange, onInput, list, cls } = {}) {
  return h('input', {
    class: ['input', cls],
    type,
    value: value ?? '',
    placeholder,
    list,
    onChange: onChange && ((e) => onChange(e.target.value, e)),
    onInput: onInput && ((e) => onInput(e.target.value, e)),
  });
}

export function textarea({ value = '', placeholder = '', rows = 3, onChange, onInput, cls } = {}) {
  return h('textarea', {
    class: ['textarea', cls],
    rows,
    placeholder,
    value: value ?? '',
    onChange: onChange && ((e) => onChange(e.target.value, e)),
    onInput: onInput && ((e) => onInput(e.target.value, e)),
  });
}

const normOption = (o) => (typeof o === 'string' ? { value: o, label: o } : o);

export function select(options, value, onChange, { placeholder, cls } = {}) {
  return h('select', { class: ['select', cls], value: value ?? '', onChange: (e) => onChange?.(e.target.value, e) },
    placeholder != null ? h('option', { value: '' }, placeholder) : null,
    options.map(normOption).map((o) => h('option', { value: o.value }, o.label)));
}

export function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'segmented' });
  const render = (current) => {
    wrap.replaceChildren(...options.map(normOption).map((o) => h('button', {
      type: 'button',
      class: o.value === current ? 'on' : '',
      onClick: () => {
        render(o.value);
        onChange(o.value);
      },
    }, o.label)));
  };
  render(value);
  return wrap;
}

/** 星级（默认是 3 星意向度）；不传 onChange 时只读 */
export function stars(value, onChange, max = 3, label = '意向度') {
  const wrap = h('span', { class: 'stars', title: `${label} ${value}/${max}` });
  const render = (v) => {
    wrap.replaceChildren(...Array.from({ length: max }, (_, i) => (onChange
      ? h('button', {
        type: 'button',
        class: i < v ? 'on' : '',
        'aria-label': `${label} ${i + 1}`,
        onClick: (e) => {
          e.stopPropagation();
          render(i + 1);
          onChange(i + 1);
        },
      }, '★')
      : h('span', { class: i < v ? 'on' : '' }, '★'))));
  };
  render(value);
  return wrap;
}

// ---------- 其他 ----------
export function debounce(fn, ms = 600) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** 返回一个 repaint()：用户正在 root 里输入时先记下，等焦点离开 root 再调用 draw() */
export function repaintWhenIdle(root, draw) {
  let dirty = false;
  const flush = () => {
    if (dirty && !root.contains(document.activeElement)) {
      dirty = false;
      draw();
    }
  };
  root.addEventListener('focusout', () => setTimeout(flush, 0));
  // 通知可能是在 change 事件里同步发出的，那时焦点还没移到下一个输入框，所以等这一轮事件结束再判断
  return () => {
    dirty = true;
    setTimeout(flush, 0);
  };
}

export function ensureCss(href) {
  if (document.querySelector(`link[data-css="${href}"]`)) return;
  document.head.append(h('link', { rel: 'stylesheet', href, 'data-css': href }));
}

export const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

export async function copyText(text, message = '已复制') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: '0' } });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(message);
}

export function emptyState(text, action) {
  return h('div', { class: 'empty' }, h('div', null, text), action || null);
}

export function timeAgo(iso, now = new Date()) {
  const min = Math.round((now - new Date(iso)) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

export function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function stageChip(app) {
  if (CLOSED_STATUSES.includes(app.status)) {
    return h('span', { class: 'chip' }, h('span', { class: 'dot closed' }), `${STATUS_LABEL[app.status]} · ${STAGE_LABEL[app.stage]}`);
  }
  const extra = app.status === 'accepted' ? ' · 已接受' : app.status === 'declined' ? ' · 已拒绝' : '';
  return h('span', { class: 'chip' }, h('span', { class: `dot ${app.stage}` }), `${STAGE_LABEL[app.stage]}${extra}`);
}

/** 按需加载投递详情抽屉 / 新建投递弹窗（避免模块循环依赖） */
export function openApp(id, options) {
  return import('./components/appDrawer.js').then((m) => m.openAppDrawer(id, options)).catch((e) => {
    console.error(e);
    toast(`打不开投递详情：${e.message}`, { type: 'error' });
  });
}

export function openNewApp(preset) {
  return import('./components/newApp.js').then((m) => m.openNewApp(preset)).catch((e) => {
    console.error(e);
    toast(`打不开新建投递：${e.message}`, { type: 'error' });
  });
}
