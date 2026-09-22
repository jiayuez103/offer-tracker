// 秋招助手侧边栏：只在顶层 frame 显示，放在 closed shadow root 里，和网页样式互不影响。
// 数据都通过后台拿；点选填充的按钮在 mousedown 时阻止默认行为，这样网页输入框不会失去焦点。
(() => {
  if (window.__jtPanel) return;

  const STAGES = [['wishlist', '待投递'], ['applied', '已投递'], ['assessment', '测评/笔试'], ['interview', '面试'], ['final', '终面'], ['offer', 'Offer']];
  const STAGE_LABEL = Object.fromEntries(STAGES);
  const CLOSED = { rejected: '挂了', withdrawn: '放弃', accepted: '已接受', declined: '已拒绝' };
  const LIST_NAMES = { education: '教育', work: '实习 / 工作', projects: '项目', activities: '校园经历', awards: '获奖', languages: '语言', certificates: '证书' };

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .root { position: relative; height: 100%; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; color: var(--text); }
    .root { --bg: #fff; --bg2: #f4f3ef; --bg3: #e8e6e0; --line: #e4e2dc; --line2: #d3d0c8; --text: #1d1c1a; --text2: #5f5c56; --text3: #8f8b83;
            --accent: #4f5bd5; --accent2: #4350c4; --accent-soft: #eceefd; --accent-text: #3b46b3;
            --ok: #2f8a57; --ok-soft: #e7f4ec; --warn: #b7791f; --warn-soft: #fcf3e3; --err: #c2413b; }
    @media (prefers-color-scheme: dark) {
      .root { --bg: #1f1f1d; --bg2: #262624; --bg3: #30302d; --line: #33322f; --line2: #44433f; --text: #ecebe7; --text2: #aeaba4; --text3: #7d7a73;
              --accent: #7c86f0; --accent2: #8e97f3; --accent-soft: #272a4a; --accent-text: #aab1ff;
              --ok: #55b981; --ok-soft: #1c3226; --warn: #e0a444; --warn-soft: #362b17; --err: #ec6a63; }
    }
    .panel { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 12px 40px rgba(20, 19, 17, 0.24); }
    .head { display: flex; align-items: center; gap: 8px; padding: 12px 12px 8px 14px; }
    .logo { width: 18px; height: 18px; flex: none; border-radius: 6px; background: var(--accent); box-shadow: inset 0 -5px 0 rgba(0,0,0,.12); }
    .title { flex: 1; font-size: 14px; font-weight: 650; }
    .lang { height: 26px; padding: 0 4px; font-size: 12px; }
    .icon { width: 26px; height: 26px; border: 0; border-radius: 6px; background: none; color: var(--text2); cursor: pointer; font-size: 16px; line-height: 1; }
    .icon:hover { background: var(--bg2); color: var(--text); }
    .tabs { display: flex; gap: 2px; padding: 0 14px; border-bottom: 1px solid var(--line); }
    .tabs button { margin-bottom: -1px; padding: 7px 8px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--text2); cursor: pointer; font: inherit; }
    .tabs button.on { border-bottom-color: var(--accent); color: var(--text); font-weight: 600; }
    .body { flex: 1; overflow: auto; padding: 12px 14px 16px; }
    .foot { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-top: 1px solid var(--line); color: var(--text3); font-size: 11.5px; }
    .dot { width: 7px; height: 7px; flex: none; border-radius: 50%; background: var(--ok); }
    .dot.off { background: var(--warn); }
    .grow { flex: 1; min-width: 0; }
    .row { display: flex; align-items: center; gap: 8px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .section { margin-top: 18px; }
    .section.first { margin-top: 0; }
    .section > h3 { margin: 0 0 6px; color: var(--text3); font-size: 12px; font-weight: 600; letter-spacing: .02em; }
    .hint { margin: 6px 0 0; color: var(--text3); font-size: 12px; }
    .pad { padding: 6px; }
    .empty { padding: 28px 8px; color: var(--text3); text-align: center; }
    button { font: inherit; color: inherit; }
    .primary { height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; }
    .primary:hover { background: var(--accent2); }
    .primary:disabled { opacity: .6; cursor: default; }
    .big { width: 100%; height: 38px; font-size: 14px; }
    .btn { height: 30px; padding: 0 10px; border: 1px solid var(--line2); border-radius: 8px; background: var(--bg); cursor: pointer; white-space: nowrap; }
    .btn:hover { background: var(--bg2); }
    .link { padding: 0; border: 0; background: none; color: var(--accent-text); cursor: pointer; white-space: nowrap; }
    input, select, textarea { font: inherit; color: inherit; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); padding: 4px 8px; outline: none; }
    input:focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    input, select { height: 30px; }
    textarea { width: 100%; min-height: 160px; resize: vertical; line-height: 1.5; }
    .opts { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; color: var(--text2); font-size: 12px; }
    .opts label { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
    .opts input { height: auto; accent-color: var(--accent); }
    .result { margin-top: 10px; }
    .sum { padding: 8px 10px; border-radius: 8px; background: var(--ok-soft); color: var(--ok); }
    .sum.muted { background: var(--bg2); color: var(--text2); }
    .result .row { justify-content: space-between; margin-top: 6px; }
    .err { color: var(--err); }
    details { margin-top: 8px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
    summary { display: flex; align-items: center; gap: 6px; padding: 8px 10px; cursor: pointer; font-weight: 600; list-style: none; }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: "›"; display: inline-block; color: var(--text3); transition: transform .15s; }
    details[open] > summary::before { transform: rotate(90deg); }
    .items { display: flex; flex-direction: column; padding: 0 4px 6px; }
    .item-row { display: flex; align-items: flex-start; gap: 4px; }
    .item { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 8px; padding: 6px; border: 0; border-radius: 6px; background: none; text-align: left; cursor: pointer; }
    .item:hover { background: var(--bg2); }
    .item .k { flex: none; width: 60px; padding-top: 1px; color: var(--text3); font-size: 12px; }
    .item .v { flex: 1; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
    .item.answer .v { -webkit-line-clamp: 3; }
    .alt { flex: none; margin-top: 5px; padding: 0 5px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: var(--text2); font-size: 10.5px; cursor: pointer; }
    .alt:hover { border-color: var(--accent); color: var(--accent-text); }
    .search { width: calc(100% - 16px); margin: 0 8px 6px; }
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
    .field > span { color: var(--text2); font-size: 12px; }
    .field input, .field select { width: 100%; }
    .seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 7px; background: var(--bg3); align-self: flex-start; }
    .seg button { padding: 3px 10px; border: 0; border-radius: 5px; background: none; color: var(--text2); cursor: pointer; }
    .seg button.on { background: var(--bg); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
    .jd { margin: 4px 0 12px; }
    .jd textarea { display: block; width: calc(100% - 16px); margin: 0 8px 8px; }
    .actions { margin-top: 4px; }
    .dup, .saved { margin-bottom: 12px; padding: 10px 12px; border-radius: 10px; }
    .dup { border: 1px solid var(--warn); background: var(--warn-soft); }
    .saved { border: 1px solid var(--ok); background: var(--ok-soft); }
    .dup .row, .saved .row { margin-top: 8px; flex-wrap: wrap; }
    .toast { position: absolute; left: 14px; right: 14px; bottom: 46px; padding: 8px 10px; border-radius: 8px; background: #262523; color: #f4f3ef; font-size: 12.5px; box-shadow: 0 6px 20px rgba(0,0,0,.25); }
    .toast.ok { background: #1f6b43; }
    .toast.err { background: #c2413b; }
    .pill { display: flex; align-items: center; gap: 6px; padding: 8px 10px 8px 8px; border: 1px solid var(--line); border-right: 0; border-radius: 10px 0 0 10px; background: var(--bg); color: var(--text); box-shadow: 0 6px 20px rgba(20,19,17,.2); cursor: pointer; font-weight: 600; }
  `;

  let host = null;
  let app = null;
  let toastEl = null;
  let state = null;
  let tab = 'fill';
  let minimized = false;
  let clip = null;
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
  async function detect() {
    const info = window.__jtAgent ? window.__jtAgent.pageInfo() : { url: location.href, text: '', company: '', position: '' };
    let text = info.text || '';
    try {
      const sel = await send({ type: 'clip:selection' });
      if (sel.text && sel.text.length >= 30) text = sel.text; // 选中了一段就只存选中的
    } catch {
      // 忽略
    }
    let parsed = {};
    try {
      parsed = await send({ type: 'clip:parse', text, url: info.url });
    } catch {
      // 出错时只用页面信息
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
    clip = { record, text, dup, saved: null };
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
