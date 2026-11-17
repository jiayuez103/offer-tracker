// 秋招助手侧边栏：只在顶层 frame 显示，放在 closed shadow root 里，和网页样式互不影响。
// 数据都通过后台拿；点选填充的按钮在 mousedown 时阻止默认行为，这样网页输入框不会失去焦点。
(() => {
  if (window.__jtPanel) return;

  const STAGES = [['wishlist', '待投递'], ['applied', '已投递'], ['assessment', '测评/笔试'], ['interview', '面试'], ['final', '终面'], ['offer', 'Offer']];
  const STAGE_LABEL = Object.fromEntries(STAGES);
  const CLOSED = { rejected: '挂了', withdrawn: '放弃', accepted: '已接受', declined: '已拒绝' };
  const LIST_NAMES = { education: '教育', work: '实习 / 工作', projects: '项目', activities: '校园经历', awards: '获奖', languages: '语言', certificates: '证书' };

  const STYLE = `
    /* 复古桌面风，和 Tracker 网页同一套颜色：奶油色纸面、2px 黑描边、硬阴影。只有浅色一套 */
    :host { all: initial; }
    * { box-sizing: border-box; }
    .root { position: relative; height: 100%; font: 13px/1.5 "Noto Sans SC", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; color: var(--ink); }
    .root { --bg: #fbf8f0; --bg2: #f3eddf; --bg3: #e7dfcc; --ink: #1e1e1e; --ink2: #55524b; --ink3: #736e66;
            --teal: #a9d8d5; --teal-soft: #d5ece9; --teal-hover: #97cdc9; --accent-text: #17726d; --butter: #f5e3a1; --peach: #f6c5af;
            --ok: #6fae4e; --ok-soft: #ddefd2; --warn-soft: #f8e7b9; --err-soft: #f7d3ca;
            --mono: "Space Mono", ui-monospace, "SF Mono", Menlo, monospace; }
    .panel { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); border: 2px solid var(--ink); border-radius: 14px; box-shadow: 6px 6px 0 var(--ink); }
    .head { display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px; border-bottom: 2px solid var(--ink); background: var(--teal); }
    .logo { width: 16px; height: 16px; flex: none; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%23a9d8d5' d='M2 2h12v1h-12zM2 2.5h12v1h-12zM1 3h14v1h-14zM1 3.5h14v1h-14zM1 4h14v1h-14zM1 4.5h10v1h-10zM12 4.5h3v1h-3zM1 5h10v1h-10zM12 5h3v1h-3zM1 5.5h9v1h-9zM12 5.5h3v1h-3zM1 6h9v1h-9zM11 6h4v1h-4zM1 6.5h8v1h-8zM11 6.5h4v1h-4zM1 7h8v1h-8zM10 7h5v1h-5zM1 7.5h3v1h-3zM5 7.5h3v1h-3zM10 7.5h5v1h-5zM1 8h3v1h-3zM5 8h3v1h-3zM9 8h6v1h-6zM1 8.5h3v1h-3zM6 8.5h1v1h-1zM9 8.5h6v1h-6zM1 9h4v1h-4zM6 9h1v1h-1zM8 9h7v1h-7zM1 9.5h4v1h-4zM8 9.5h7v1h-7zM1 10h5v1h-5zM7 10h8v1h-8zM1 10.5h5v1h-5zM7 10.5h8v1h-8zM1 11h14v1h-14zM1 11.5h14v1h-14zM1 12h14v1h-14zM2 12.5h12v1h-12zM2 13h12v1h-12z'/%3E%3Cpath fill='%231e1e1e' d='M1 2h14v1h-14zM1 2.5h1v1h-1zM14 2.5h1v1h-1zM1 3h1v1h-1zM14 3h1v1h-1zM1 3.5h1v1h-1zM14 3.5h1v1h-1zM1 4h1v1h-1zM11 4h2v1h-2zM14 4h1v1h-1zM1 4.5h1v1h-1zM11 4.5h2v1h-2zM14 4.5h1v1h-1zM1 5h1v1h-1zM10 5h3v1h-3zM14 5h1v1h-1zM1 5.5h1v1h-1zM10 5.5h2v1h-2zM14 5.5h1v1h-1zM1 6h1v1h-1zM9 6h3v1h-3zM14 6h1v1h-1zM1 6.5h1v1h-1zM9 6.5h2v1h-2zM14 6.5h1v1h-1zM1 7h1v1h-1zM3 7h2v1h-2zM8 7h3v1h-3zM14 7h1v1h-1zM1 7.5h1v1h-1zM3 7.5h2v1h-2zM8 7.5h2v1h-2zM14 7.5h1v1h-1zM1 8h1v1h-1zM3 8h3v1h-3zM7 8h3v1h-3zM14 8h1v1h-1zM1 8.5h1v1h-1zM4 8.5h2v1h-2zM7 8.5h2v1h-2zM14 8.5h1v1h-1zM1 9h1v1h-1zM4 9h5v1h-5zM14 9h1v1h-1zM1 9.5h1v1h-1zM5 9.5h3v1h-3zM14 9.5h1v1h-1zM1 10h1v1h-1zM5 10h3v1h-3zM14 10h1v1h-1zM1 10.5h1v1h-1zM6 10.5h1v1h-1zM14 10.5h1v1h-1zM1 11h1v1h-1zM6 11h1v1h-1zM14 11h1v1h-1zM1 11.5h1v1h-1zM14 11.5h1v1h-1zM1 12h1v1h-1zM14 12h1v1h-1zM1 12.5h1v1h-1zM14 12.5h1v1h-1zM1 13h14v1h-14z'/%3E%3C/svg%3E") center / contain no-repeat; }
    .title { flex: 1; font-size: 13px; font-weight: 700; }
    .lang { height: 26px; padding: 0 22px 0 8px; font-size: 12px; background-position: right 4px center; }
    .icon { width: 26px; height: 26px; border: 0; border-radius: 6px; background: none; color: var(--ink); cursor: pointer; font-size: 17px; font-weight: 700; line-height: 1; }
    .icon:hover { background: var(--bg); }
    /* 文件夹标签：选中的那个和下面的内容连成一片 */
    .tabs { display: flex; align-items: flex-end; gap: 4px; padding: 8px 12px 0; border-bottom: 2px solid var(--ink); }
    .tabs button { margin-bottom: -2px; padding: 5px 14px 6px; border: 2px solid var(--ink); border-radius: 8px 8px 0 0; background: var(--bg3); color: var(--ink2); cursor: pointer; font: inherit; }
    .tabs button:hover { background: var(--bg2); color: var(--ink); }
    .tabs button.on { padding-bottom: 8px; border-bottom-color: var(--bg); background: var(--bg); color: var(--ink); font-weight: 700; }
    .body { flex: 1; overflow: auto; padding: 12px 12px 16px; }
    .body::-webkit-scrollbar { width: 12px; }
    .body::-webkit-scrollbar-track { background: var(--bg3); border-left: 2px solid var(--ink); }
    .body::-webkit-scrollbar-thumb { background: var(--teal); border: 2px solid var(--ink); border-radius: 4px; }
    .foot { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-top: 2px solid var(--ink); background: var(--bg2); color: var(--ink2); font-size: 12px; }
    /* 在线是实心绿点，离线是空心灰点；旁边始终有文字说明 */
    .dot { width: 10px; height: 10px; flex: none; border: 2px solid var(--ink); border-radius: 50%; background: var(--ok); }
    .dot.off { background: var(--bg3); }
    .grow { flex: 1; min-width: 0; }
    .row { display: flex; align-items: center; gap: 8px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .section { margin-top: 18px; }
    .section.first { margin-top: 0; }
    .section > h3 { margin: 0 0 6px; color: var(--ink); font-size: 13px; font-weight: 700; }
    .hint { margin: 6px 0 0; color: var(--ink3); font-size: 12px; }
    .pad { padding: 6px; }
    .empty { padding: 20px 12px; border: 2px dashed var(--ink3); border-radius: 10px; color: var(--ink2); text-align: center; }
    button { font: inherit; color: inherit; }
    .primary, .btn { border: 2px solid var(--ink); border-radius: 6px; box-shadow: 2px 2px 0 var(--ink); color: var(--ink); font-weight: 700; cursor: pointer; white-space: nowrap; transition: transform .08s, box-shadow .08s; }
    .primary:hover, .btn:hover { transform: translate(-1px, -1px); box-shadow: 3px 3px 0 var(--ink); }
    .primary:active, .btn:active { transform: translate(2px, 2px); box-shadow: 0 0 0 var(--ink); }
    .primary { height: 34px; padding: 0 14px; background: var(--teal); }
    .primary:hover { background: var(--teal-hover); }
    .primary:disabled { opacity: .5; cursor: default; transform: none; box-shadow: 2px 2px 0 var(--ink); }
    .big { width: 100%; height: 38px; font-size: 14px; }
    .btn { height: 30px; padding: 0 10px; background: var(--bg); font-size: 12px; }
    .btn:hover { background: var(--bg2); }
    .link { padding: 0; border: 0; background: none; color: var(--accent-text); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; white-space: nowrap; }
    .link:hover { color: var(--ink); }
    input, select, textarea { font: inherit; color: inherit; border: 2px solid var(--ink); border-radius: 6px; background-color: var(--bg); padding: 4px 8px; outline: none; }
    input:focus, select:focus, textarea:focus { background-color: var(--teal-soft); box-shadow: 2px 2px 0 var(--ink); }
    input, select { height: 32px; }
    select { appearance: none; -webkit-appearance: none; padding-right: 26px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%231e1e1e' d='M3 6h2v1h-2zM11 6h2v1h-2zM4 6.5h1v1h-1zM11 6.5h1v1h-1zM4 7h2v1h-2zM10 7h2v1h-2zM5 7.5h1v1h-1zM10 7.5h1v1h-1zM5 8h2v1h-2zM9 8h2v1h-2zM6 8.5h1v1h-1zM9 8.5h1v1h-1zM6 9h4v1h-4zM7 9.5h2v1h-2zM7 10h2v1h-2z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 6px center; background-size: 16px 16px; cursor: pointer; }
    textarea { width: 100%; min-height: 160px; resize: vertical; line-height: 1.5; }
    input[type="checkbox"] { appearance: none; -webkit-appearance: none; flex: none; width: 16px; height: 16px; margin: 0; padding: 0; border-radius: 4px; background: var(--bg) center / 12px 12px no-repeat; cursor: pointer; }
    input[type="checkbox"]:checked { background-color: var(--teal); background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%231e1e1e' d='M13 3h2v1h-2zM13 3.5h2v1h-2zM12 4h3v1h-3zM12 4.5h2v1h-2zM11 5h3v1h-3zM11 5.5h2v1h-2zM10 6h3v1h-3zM10 6.5h2v1h-2zM1 7h2v1h-2zM9 7h3v1h-3zM1 7.5h2v1h-2zM9 7.5h2v1h-2zM1 8h3v1h-3zM8 8h3v1h-3zM2 8.5h2v1h-2zM8 8.5h2v1h-2zM2 9h3v1h-3zM7 9h3v1h-3zM3 9.5h2v1h-2zM7 9.5h2v1h-2zM3 10h6v1h-6zM4 10.5h4v1h-4zM4 11h4v1h-4zM5 11.5h2v1h-2zM5 12h2v1h-2z'/%3E%3C/svg%3E"); }
    input[type="checkbox"]:focus { box-shadow: none; outline: 2px solid var(--accent-text); outline-offset: 2px; }
    .opts { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; color: var(--ink); font-size: 12px; }
    .opts label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .result { margin-top: 10px; padding: 10px; border: 1px dashed var(--ink3); border-radius: 10px; background: var(--bg2); }
    .result.err { border: 2px solid var(--ink); background: var(--err-soft); }
    .sum { padding: 6px 10px; border: 2px solid var(--ink); border-radius: 6px; background: var(--ok-soft); color: var(--ink); }
    .sum.muted { background: var(--bg); color: var(--ink2); }
    .result .row { justify-content: space-between; margin-top: 8px; }
    .err { color: var(--ink); font-weight: 600; }
    details { margin-top: 8px; border: 2px solid var(--ink); border-radius: 10px; overflow: hidden; background: var(--bg); }
    summary { display: flex; align-items: center; gap: 6px; padding: 7px 10px; cursor: pointer; font-weight: 700; list-style: none; }
    summary:hover { background: var(--bg2); }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: "›"; display: inline-block; color: var(--ink); font-weight: 700; transition: transform .15s; }
    details[open] > summary::before { transform: rotate(90deg); }
    details[open] > summary { border-bottom: 1px dashed var(--ink3); margin-bottom: 4px; }
    details > .hint { margin: 4px 0 6px; padding: 0 10px; }
    .items { display: flex; flex-direction: column; padding: 0 4px 6px; }
    .item-row { display: flex; align-items: flex-start; gap: 4px; }
    .item { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 8px; padding: 6px; border: 0; border-radius: 6px; background: none; text-align: left; cursor: pointer; }
    .item:hover { background: var(--teal-soft); }
    .item .k { flex: none; width: 60px; padding-top: 1px; color: var(--ink2); font-size: 12px; }
    .item .v { flex: 1; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
    .item.answer .v { -webkit-line-clamp: 3; }
    .alt { flex: none; margin-top: 5px; padding: 0 5px; border: 2px solid var(--ink); border-radius: 5px; background: var(--bg3); color: var(--ink); font: 10.5px/16px var(--mono); cursor: pointer; }
    .alt:hover { background: var(--teal); }
    .search { width: calc(100% - 16px); margin: 0 8px 6px; }
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
    .field > span { color: var(--ink2); font-size: 12px; }
    .field input, .field select { width: 100%; }
    .seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 6px; background: var(--ink); align-self: flex-start; }
    .seg button { padding: 3px 12px; border: 0; border-radius: 4px; background: var(--bg); color: var(--ink2); font-size: 12px; cursor: pointer; }
    .seg button:hover { background: var(--bg2); color: var(--ink); }
    .seg button.on { background: var(--teal); color: var(--ink); font-weight: 700; }
    .jd { margin: 4px 0 12px; }
    .jd textarea { display: block; width: calc(100% - 16px); margin: 0 8px 8px; }
    .actions { margin-top: 4px; }
    .dup, .saved { margin-bottom: 12px; padding: 10px 12px; border: 2px solid var(--ink); border-radius: 10px; }
    .dup { background: var(--butter); }
    .saved { background: var(--ok-soft); }
    .dup .row, .saved .row { margin-top: 8px; flex-wrap: wrap; }
    .toast { position: absolute; left: 12px; right: 12px; bottom: 50px; padding: 8px 12px; border: 2px solid var(--ink); border-radius: 10px; background: var(--ink); color: var(--bg); font-size: 12px; font-weight: 700; }
    .toast.ok { background: var(--ok-soft); color: var(--ink); box-shadow: 3px 3px 0 var(--ink); }
    .toast.err { background: var(--err-soft); color: var(--ink); box-shadow: 3px 3px 0 var(--ink); }
    .pill { display: flex; align-items: center; gap: 6px; padding: 8px 12px 8px 10px; border: 2px solid var(--ink); border-right: 0; border-radius: 10px 0 0 10px; background: var(--teal); color: var(--ink); cursor: pointer; font-weight: 700; }
  `;

  let host = null;
  let app = null;
  let toastEl = null;
  let state = null;
  let tab = 'fill';
  let minimized = false;
  let clip = null;
  let detecting = null;
  const ui = { lang: 'auto', overwrite: false, reverse: false, resumeId: '', query: '', result: null, attach: '' };

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    let selectValue;
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' && tag === 'select') selectValue = v;
      else if (k === 'value' || k === 'checked' || k === 'disabled') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.append(c instanceof Node ? c : String(c));
    };
    children.forEach(add);
    if (selectValue !== undefined) el.value = selectValue;
    return el;
  }

  async function send(msg) {
    const res = await chrome.runtime.sendMessage(msg);
    if (res && res.error) throw new Error(res.error);
    return res;
  }

  const asBi = (v) => (v && typeof v === 'object' ? { zh: v.zh || '', en: v.en || '' } : { zh: typeof v === 'string' ? v : '', en: '' });
  const noDefault = (e) => e.preventDefault(); // 不抢网页输入框的焦点
  const effectiveLang = () => (ui.lang !== 'auto' ? ui.lang : window.__jtAgent ? window.__jtAgent.pageLang() : 'zh');

  function toast(text, kind = 'info') {
    if (!app) return;
    if (toastEl) toastEl.remove();
    const el = h('div', { class: ['toast', kind] }, text);
    toastEl = el;
    app.append(el);
    setTimeout(() => {
      if (toastEl === el) {
        el.remove();
        toastEl = null;
      }
    }, 3200);
  }

  // ---------- 打开 / 关闭 ----------
  function place() {
    host.style.cssText = minimized
      ? 'all: initial; position: fixed; top: 40%; right: 0; z-index: 2147483647;'
      : 'all: initial; position: fixed; top: 12px; right: 12px; bottom: 12px; width: 348px; z-index: 2147483647;';
  }

  function open() {
    host = document.createElement('div');
    host.id = 'jt-panel-host';
    const shadow = host.attachShadow({ mode: 'closed' });
    app = h('div', { class: 'root' });
    shadow.append(h('style', null, STYLE), app);
    minimized = false;
    place();
    document.documentElement.append(host);
    render();
    load();
  }

  function close() {
    send({ type: 'fill:clear' }).catch(() => {});
    if (host) host.remove();
    host = null;
    app = null;
    toastEl = null;
    clip = null;
  }

  function toggle() {
    if (host && minimized) {
      minimized = false;
      place();
      render();
    } else if (host) {
      close();
    } else {
      open();
    }
  }

  async function load() {
    try {
      state = await send({ type: 'state:get' });
    } catch (e) {
      state = { online: false, error: e.message, profile: null, answers: [], resumes: [] };
    }
    render();
    // 面板刚打开、状态还没回来就切到「记录投递」的话，切页签时那次识别会被跳过，这里补上
    if (tab === 'clip' && !clip && state.online) detect();
  }

  // ---------- 整体 ----------
  function render() {
    if (!app) return;
    if (minimized) {
      app.replaceChildren(h('button', { class: 'pill', title: '展开秋招助手', onClick: () => { minimized = false; place(); render(); } }, h('span', { class: 'logo' }), '秋招'));
      return;
    }
    let body;
    if (!state) body = h('div', { class: 'empty' }, '加载中…');
    else body = tab === 'fill' ? fillView() : clipView();
    const panel = h('div', { class: 'panel' },
      header(),
      h('div', { class: 'tabs' },
        h('button', { class: tab === 'fill' ? 'on' : '', onClick: () => { tab = 'fill'; render(); } }, '填写'),
        h('button', {
          class: tab === 'clip' ? 'on' : '',
          onClick: () => {
            tab = 'clip';
            if (!clip && state && state.online) detect();
            render();
          },
        }, '记录投递')),
      h('div', { class: 'body' }, body),
      footer());
    app.replaceChildren(panel, ...(toastEl ? [toastEl] : []));
  }

  function header() {
    return h('div', { class: 'head' },
      h('span', { class: 'logo' }),
      h('span', { class: 'title' }, '秋招助手'),
      h('select', { class: 'lang', title: '填写用的语言', value: ui.lang, onChange: (e) => { ui.lang = e.target.value; render(); } },
        h('option', { value: 'auto' }, '自动'),
        h('option', { value: 'zh' }, '中文'),
        h('option', { value: 'en' }, 'English')),
      h('button', { class: 'icon', title: '收起', onClick: () => { minimized = true; place(); render(); } }, '–'),
      h('button', { class: 'icon', title: '关闭（⌥⇧J）', onClick: close }, '×'));
  }

  function footer() {
    const s = state || {};
    const when = s.cachedAt ? new Date(s.cachedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    let status = 'Tracker 未启动';
    if (s.online) status = 'Tracker 在线';
    else if (s.profile) status = `Tracker 未启动 · 用 ${when} 的缓存`;
    return h('div', { class: 'foot' },
      h('span', { class: ['dot', !s.online && 'off'] }),
      h('span', { class: 'grow' }, status),
      h('button', { class: 'link', title: s.server || '', onClick: editServer }, '地址'),
      h('button', { class: 'link', onClick: load }, '刷新'));
  }

  async function editServer() {
    const next = window.prompt('Tracker 地址', (state && state.server) || 'http://127.0.0.1:7317');
    if (!next) return;
    try {
      state = await send({ type: 'server:set', url: next });
      render();
      toast(state.online ? '已连接' : '地址保存了，但暂时连不上', state.online ? 'ok' : 'info');
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  // ---------- 填写 ----------
  async function insert(text) {
    if (!text) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // 有的页面不允许写剪贴板
    }
    try {
      const { ok } = await send({ type: 'fill:insert', text });
      if (ok) toast(copied ? '已填入（也复制到了剪贴板）' : '已填入', 'ok');
      else toast(copied ? '已复制。先点一下网页上要填的输入框，再点这里就能直接填入' : '先点一下网页上要填的输入框，再点这里', 'info');
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  function fillView() {
    const p = state.profile;
    if (!p) {
      return h('div', { class: 'empty' }, state.online
        ? '档案还是空的：先在 Tracker 的「档案」页填好。'
        : '连不上 Tracker，也没有缓存的档案。先双击「启动Tracker.command」，再点底部的「刷新」。');
    }
    const lang = effectiveLang();
    return [
      fillAllSection(),
      resumeSection(),
      h('div', { class: 'section' },
        h('h3', null, '点选填充'),
        h('p', { class: 'hint' }, '先点网页上的输入框，再点下面的内容就会填进去，同时复制到剪贴板。'),
        profileGroups(p, lang).map((g, i) => group(g, lang, i === 0)),
        answersGroup()),
    ];
  }

  function fillAllSection() {
    const btn = h('button', {
      class: 'primary big',
      onClick: async () => {
        btn.disabled = true;
        btn.textContent = '正在填写…';
        try {
          ui.result = await send({ type: 'fill:all', options: { lang: ui.lang, overwrite: ui.overwrite, reverse: ui.reverse } });
        } catch (e) {
          ui.result = { error: e.message };
        }
        render();
      },
    }, '一键填写本页');
    return h('div', { class: 'section first' },
      btn,
      h('div', { class: 'opts' },
        h('label', null, h('input', { type: 'checkbox', checked: ui.overwrite, onChange: (e) => { ui.overwrite = e.target.checked; } }), '覆盖已有内容'),
        h('label', null, h('input', { type: 'checkbox', checked: ui.reverse, onChange: (e) => { ui.reverse = e.target.checked; } }), '经历反过来填（早的在前）')),
      ui.result ? resultView(ui.result) : null);
  }

  function resultView(r) {
    if (r.error) return h('div', { class: 'result err' }, r.error);
    const parts = [h('b', null, `已填 ${r.filled} 项`)];
    if (r.uncertain) parts.push(` · 请核对 ${r.uncertain} 项（蓝框）`);
    if (r.manual) parts.push(` · 需要手动 ${r.manual} 项（黄框）`);
    const missing = Object.entries(r.missing || {}).map(([k, n]) => `${LIST_NAMES[k] || k}还差 ${n} 段`);
    let hint = '';
    if (missing.length) hint = `表单里的空位不够：${missing.join('，')}。先在网页上点「添加」，再点一次一键填写。`;
    else if (!r.filled && !r.uncertain && !r.manual) {
      hint = r.skipped
        ? `认出的 ${r.skipped} 项都已经有内容；要重填就勾上「覆盖已有内容」。`
        : '这个页面上没认出能填的字段，可以用下面的点选填充。';
    }
    return h('div', { class: 'result' },
      h('div', { class: ['sum', !r.filled && 'muted'] }, parts),
      hint ? h('p', { class: 'hint' }, hint) : null,
      r.todo && r.todo.length
        ? h('details', { class: 'todo', open: true },
          h('summary', null, `填不进去的 ${r.todo.length} 项`),
          h('p', { class: 'hint' }, '多半是只读的日期框，得你自己点日历。点一下就复制，先点网页上的输入框再点它就能填进去。'),
          h('div', { class: 'items' }, r.todo.map((t) => h('button', { class: 'item', title: t.text, onMousedown: noDefault, onClick: () => insert(t.text) },
            h('span', { class: 'k' }, t.label),
            h('span', { class: 'v' }, t.text)))))
        : null,
      h('div', { class: 'row' },
        h('span', { class: 'hint' }, '绿框已填 · 蓝框请核对 · 黄框要你来填'),
        h('button', {
          class: 'link',
          onClick: () => send({ type: 'fill:clear' }).then(() => { ui.result = null; render(); }).catch(() => {}),
        }, '清除标记')));
  }

  function resumeSection() {
    const resumes = (state.resumes || []).filter((r) => (r.files || []).length);
    if (!resumes.length) {
      return h('div', { class: 'section' }, h('h3', null, '上传简历'), h('p', { class: 'hint' }, '还没有简历文件：先在 Tracker 的「简历」页上传。'));
    }
    if (!resumes.some((r) => r.id === ui.resumeId)) ui.resumeId = resumes[0].id;
    const current = resumes.find((r) => r.id === ui.resumeId);
    const hasPdf = (current.files || []).some((f) => /\.pdf$/i.test(f.name));
    return h('div', { class: 'section' },
      h('h3', null, '上传简历'),
      h('div', { class: 'row' },
        h('select', { class: 'grow', value: ui.resumeId, onChange: (e) => { ui.resumeId = e.target.value; ui.attach = ''; render(); } },
          resumes.map((r) => h('option', { value: r.id }, r.name || '未命名版本'))),
        h('button', {
          class: 'btn',
          onClick: async () => {
            try {
              const res = await send({ type: 'resume:attach', resumeId: ui.resumeId });
              ui.attach = res.ok ? `已放进「${res.label}」：${res.file}` : res.reason;
            } catch (e) {
              ui.attach = e.message;
            }
            render();
          },
        }, '放进上传框')),
      hasPdf ? null : h('p', { class: 'hint' }, '这个版本只有 Word 文件。多数网申要 PDF，建议导出 PDF 后传到 Tracker。'),
      ui.attach ? h('p', { class: 'hint' }, ui.attach) : null);
  }

  function profileGroups(p, lang) {
    const b = p.basic || {};
    const it = p.intent || {};
    const pick = (v) => asBi(v)[lang] || asBi(v)[lang === 'zh' ? 'en' : 'zh'];
    const groups = [
      { title: '基本信息', items: [['姓名', b.name], ['英文名', b.preferredName], ['姓', b.familyName], ['名', b.givenName], ['手机', b.phone], ['区号', b.phoneCountryCode], ['邮箱', b.email], ['微信', b.wechat], ['性别', b.gender], ['出生日期', b.birthDate], ['现居城市', b.currentCity], ['籍贯', b.hometown], ['户口 / 生源地', b.residence], ['国籍', b.nationality], ['政治面貌', b.politicalStatus], ['民族', b.ethnicity], ['LinkedIn', b.linkedin], ['个人网站', b.website]] },
      { title: '求职意向', items: [['意向岗位', it.positions], ['意向城市', it.cities], ['期望薪资', it.salary], ['到岗时间', it.availableFrom], ['接受调剂', it.acceptAdjustment]] },
    ];
    (p.education || []).forEach((e, n) => groups.push({ title: `教育 ${n + 1} · ${pick(e.school)}`, items: [['学校', e.school], ['学历', e.degree], ['专业', e.major], ['学院', e.college], ['城市', e.city], ['开始', e.start], ['结束', e.end], ['GPA', e.gpa], ['满分', e.gpaScale], ['排名', e.rank], ['课程', e.courses], ['荣誉', e.honors]] }));
    (p.work || []).forEach((w, n) => groups.push({ title: `实习 ${n + 1} · ${pick(w.company)}`, items: [['公司', w.company], ['职位', w.title], ['部门', w.department], ['城市', w.city], ['开始', w.start], ['结束', w.end], ['工作内容', w.description]] }));
    (p.projects || []).forEach((x, n) => groups.push({ title: `项目 ${n + 1} · ${pick(x.name)}`, items: [['名称', x.name], ['角色', x.role], ['开始', x.start], ['结束', x.end], ['描述', x.description]] }));
    (p.activities || []).forEach((x, n) => groups.push({ title: `校园 ${n + 1} · ${pick(x.org)}`, items: [['组织', x.org], ['角色', x.role], ['开始', x.start], ['结束', x.end], ['描述', x.description]] }));
    (p.awards || []).forEach((x, n) => groups.push({ title: `获奖 ${n + 1}`, items: [['奖项', x.name], ['时间', x.date], ['说明', x.description]] }));
    (p.languages || []).forEach((x, n) => groups.push({ title: `语言 ${n + 1} · ${pick(x.language)}`, items: [['语言', x.language], ['水平', x.level], ['证书', x.certificate], ['成绩', x.score]] }));
    (p.certificates || []).forEach((x, n) => groups.push({ title: `证书 ${n + 1}`, items: [['名称', x.name], ['时间', x.date], ['成绩', x.score]] }));
    groups.push({ title: '技能与自我评价', items: [['技能', p.skills], ['自我评价', p.selfIntro], ['兴趣爱好', p.hobbies]] });
    if ((p.extras || []).length) groups.push({ title: '自定义字段', items: p.extras.map((x) => [x.label || '未命名', x.value]) });
    return groups
      .map((g) => ({ ...g, items: g.items.filter(([, v]) => asBi(v).zh || asBi(v).en) }))
      .filter((g) => g.items.length);
  }

  function group(g, lang, openByDefault) {
    const other = lang === 'zh' ? 'en' : 'zh';
    return h('details', { open: openByDefault },
      h('summary', null, g.title),
      h('div', { class: 'items' }, g.items.map(([label, value]) => {
        const bi = asBi(value);
        const main = bi[lang] || bi[other];
        const alt = bi[lang] && bi[other] && bi[other] !== bi[lang] ? bi[other] : '';
        return h('div', { class: 'item-row' },
          h('button', { class: 'item', title: main, onMousedown: noDefault, onClick: () => insert(main) },
            h('span', { class: 'k' }, label),
            h('span', { class: 'v' }, main)),
          alt ? h('button', { class: 'alt', title: alt, onMousedown: noDefault, onClick: () => insert(alt) }, other === 'en' ? 'EN' : '中') : null);
      })));
  }

  const answerItem = (a) => h('button', { class: 'item answer', title: a.text || '', onMousedown: noDefault, onClick: () => insert(a.text || '') },
    h('span', { class: 'k' }, a.category || '素材'),
    h('span', { class: 'v' }, h('b', null, a.question || '（没填题目）'), ' ', a.text || ''));

  function answersGroup() {
    const answers = state.answers || [];
    if (!answers.length) return null;
    const box = h('div', { class: 'items' });
    const refresh = () => {
      const q = ui.query.trim().toLowerCase();
      const list = answers.filter((a) => !q || [a.question, a.text, a.category, ...(a.tags || [])].join(' ').toLowerCase().includes(q));
      box.replaceChildren(...(list.length ? list.slice(0, 50).map(answerItem) : [h('div', { class: 'hint pad' }, '没有匹配的素材')]));
    };
    refresh();
    return h('details', { open: !!ui.query },
      h('summary', null, `素材库（${answers.length}）`),
      h('input', { class: 'search', placeholder: '搜索题目、回答、标签', value: ui.query, onInput: (e) => { ui.query = e.target.value; refresh(); } }),
      box);
  }

  // ---------- 记录投递 ----------
  /** 同一时间只识别一次：切页签和加载完成可能同时触发 */
  function detect() {
    if (!detecting) detecting = runDetect().finally(() => { detecting = null; });
    return detecting;
  }

  async function runDetect() {
    const info = window.__jtAgent ? window.__jtAgent.pageInfo() : { url: location.href, text: '', company: '', position: '' };
    let text = info.text || '';
    try {
      const sel = await send({ type: 'clip:selection' });
      if (sel.text && sel.text.length >= 30) text = sel.text; // 选中了一段就只存选中的
    } catch {
      // 忽略
    }
    let parsed = {};
    let parseError = '';
    try {
      parsed = await send({ type: 'clip:parse', text, url: info.url });
    } catch (e) {
      parseError = e.message || '识别失败'; // 只用页面信息，但要让用户看见，别以为是页面认不出
    }
    // 官网域名表里认出的公司名最准；否则用页面标题里的，最后才用 ATS 代号
    const company = parsed.companyType ? parsed.company : info.company || parsed.company || '';
    const record = {
      company,
      companyType: parsed.companyType || '',
      position: info.position || parsed.position || '',
      cities: parsed.cities || '',
      deadline: parsed.deadline || '',
      jdUrl: info.url,
      stage: 'wishlist',
      track: '',
      resumeId: '',
      channel: '官网',
    };
    let dup = null;
    try {
      dup = (await send({ type: 'clip:find', url: info.url, company: record.company, position: record.position })).app;
    } catch {
      // 忽略
    }
    clip = { record, text, dup, saved: null, parseError };
    render();
  }

  async function saveClip() {
    const r = clip.record;
    if (!String(r.company).trim() && !String(r.position).trim()) {
      toast('公司和岗位至少填一个', 'err');
      return;
    }
    try {
      const record = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
      const { app: saved } = await send({ type: 'clip:save', record, jdText: clip.text });
      clip.saved = saved;
      render();
      toast('已保存到 Tracker', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  const field = (label, control, tag = 'label') => h(tag, { class: 'field' }, h('span', null, label), control);

  function seg(options, value, onChange) {
    const box = h('div', { class: 'seg' });
    const draw = (v) => box.replaceChildren(...options.map(([k, label]) => h('button', { class: k === v ? 'on' : '', onClick: () => { draw(k); onChange(k); } }, label)));
    draw(value);
    return box;
  }

  const openInTracker = (id) => send({ type: 'tracker:open', id }).catch((e) => toast(e.message, 'err'));

  function dupView(a) {
    const closed = CLOSED[a.status];
    return h('div', { class: 'dup' },
      h('div', null, '这个岗位已经记过：', h('b', null, `${a.company || ''} · ${a.position || ''}`)),
      h('div', { class: 'row' },
        h('span', { class: 'hint' }, closed ? `状态：${closed}` : '阶段'),
        closed ? null : h('select', {
          value: a.stage,
          onChange: async (e) => {
            try {
              const { app: next } = await send({ type: 'clip:stage', id: a.id, stage: e.target.value });
              clip.dup = next;
              toast(`已改成「${STAGE_LABEL[next.stage]}」`, 'ok');
              render();
            } catch (err) {
              toast(err.message, 'err');
            }
          },
        }, STAGES.map(([k, label]) => h('option', { value: k }, label))),
        h('button', { class: 'link', onClick: () => openInTracker(a.id) }, '在 Tracker 里打开')));
  }

  function savedView() {
    const a = clip.saved;
    return h('div', { class: 'saved' },
      h('div', null, '已保存：', h('b', null, `${a.company || ''} · ${a.position || ''}`)),
      h('p', { class: 'hint' }, a.stage === 'applied' ? '状态：已投递，投递日期记为今天。' : '状态：待投递。投完后在 Tracker 里把卡片拖到「已投递」。'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onClick: () => openInTracker(a.id) }, '在 Tracker 里打开'),
        h('button', { class: 'link', onClick: () => { clip = null; detect(); render(); } }, '再记一条')));
  }

  function clipView() {
    if (!state.online) return h('div', { class: 'empty' }, '记录投递需要 Tracker 在运行：先双击「启动Tracker.command」，再点底部的「刷新」。');
    if (!clip) return h('div', { class: 'empty' }, '正在识别这个页面…');
    if (clip.saved) return savedView();
    const r = clip.record;
    const text = (key, placeholder = '') => h('input', { value: r[key] || '', placeholder, onInput: (e) => { r[key] = e.target.value; } });
    const resumes = state.resumes || [];
    return [
      clip.dup ? dupView(clip.dup) : null,
      clip.parseError
        ? h('div', { class: 'dup' }, `自动识别没跑成功：${clip.parseError}。Tracker 可能是旧版本在跑，双击「停止Tracker.command」再「启动Tracker.command」，然后点「重新识别」。下面的内容先手动填也行。`)
        : null,
      field('公司', text('company', '如：雀巢')),
      field('岗位', text('position', '如：Marketing MT')),
      h('div', { class: 'two' },
        field('城市', text('cities', '多个用 / 分隔')),
        field('网申截止', h('input', { type: 'date', value: r.deadline || '', onInput: (e) => { r.deadline = e.target.value; } }))),
      field('链接', text('jdUrl')),
      h('div', { class: 'two' },
        field('赛道', h('select', { value: r.track, onChange: (e) => { r.track = e.target.value; } },
          h('option', { value: '' }, '未选择'),
          ['产品', '市场', '其他'].map((t) => h('option', { value: t }, t)))),
        field('投的简历', h('select', { value: r.resumeId, onChange: (e) => { r.resumeId = e.target.value; } },
          h('option', { value: '' }, '未选择'),
          resumes.map((x) => h('option', { value: x.id }, x.name || '未命名版本'))))),
      field('状态', seg([['wishlist', '还没投'], ['applied', '已投递']], r.stage, (v) => { r.stage = v; }), 'div'),
      h('details', { class: 'jd' },
        h('summary', null, `JD 全文（${clip.text.length} 字，保存时一起存成快照）`),
        h('textarea', { value: clip.text, onInput: (e) => { clip.text = e.target.value; } })),
      h('div', { class: 'row actions' },
        h('button', { class: 'primary grow', onClick: saveClip }, clip.dup ? '仍然另存一条' : '保存到 Tracker'),
        h('button', { class: 'btn', onClick: () => { clip = null; detect(); render(); } }, '重新识别')),
    ];
  }

  window.__jtPanel = { toggle, open, close, isOpen: () => !!host };
})();
