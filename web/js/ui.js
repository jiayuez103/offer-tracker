// 小型 UI 工具：h() 建 DOM、图标、提示、弹窗、抽屉、确认框、常用表单控件。
// 用户输入一律作为文本节点插入；innerHTML 只用于内置的像素图标。
import { STAGE_LABEL, STATUS_LABEL, CLOSED_STATUSES, EVENT_STAGE } from '../shared/constants.js';
import { iconSvg } from './pixel.js';

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

// ---------- 图标（16×16 像素图标，位图在 pixel.js） ----------
export function svg(name) {
  return iconSvg(name);
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
  const el = h('div', { class: ['toast', type === 'error' && 'error'], role: 'status' },
    type === 'error' ? icon('alert') : null,
    h('span', null, message));
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
      h('button', { type: 'button', class: 'btn ghost sm icon-only', 'aria-label': '关闭', onClick: close }, icon('x'))),
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

/** 浮在页面右侧的详情窗口；返回 { close, head, body }，head 和 body 是两个可替换内容的容器 */
export function openDrawer({ onClose, title = '详情' } = {}) {
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
  const panel = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'window-bar active' },
      h('span', { class: 'window-title' }, title),
      h('span', { class: 'window-meta' }, 'esc 关闭'),
      h('button', { type: 'button', class: 'btn ghost sm icon-only', 'aria-label': '关闭', onClick: close }, icon('x'))),
    h('div', { class: 'drawer-head' }, head),
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
      }, icon('star'))
      : h('span', { class: i < v ? 'on' : '' }, icon('star')))));
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

/** 一个带标题栏的窗口。action 是放在标题栏右侧的小按钮或链接 */
export function windowCard(title, body, { cls, bodyCls, action, tag = 'section' } = {}) {
  return h(tag, { class: ['card', cls] },
    h('div', { class: 'card-head' }, h('h3', null, title), action || null),
    h('div', { class: ['card-body', bodyCls] }, body));
}

/** 日程类型标签：小色块用它所属阶段的颜色，文字照常写出类型 */
export function eventChip(type) {
  return h('span', { class: 'chip' }, h('span', { class: `dot ${EVENT_STAGE[type] || 'wishlist'}` }), type);
}

export function deadlineChip() {
  return h('span', { class: 'chip warn' }, h('span', { class: 'dot due' }), '网申截止');
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

export function openInvite(options) {
  return import('./components/inviteForm.js').then((m) => m.openInviteForm(options)).catch((e) => {
    console.error(e);
    toast(`打不开粘贴邀请：${e.message}`, { type: 'error' });
  });
}

export function openNewApp(preset) {
  return import('./components/newApp.js').then((m) => m.openNewApp(preset)).catch((e) => {
    console.error(e);
    toast(`打不开新建投递：${e.message}`, { type: 'error' });
  });
}
