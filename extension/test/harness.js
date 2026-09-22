// 测试页的「假后台」：模拟 chrome.runtime.sendMessage，把请求直接交给当前页和同源 iframe 里的 __jtAgent。
// 页面先用普通 <script> 加载内容脚本和 fixture-data.js，再用 <script type="module"> 加载本文件。
import { aggregateFill, bestFileTarget } from '../bg/logic.js';
import { parseJD } from '/shared/jdparse.js';

const DATA = window.JT_FIXTURE;

// 测试时把侧边栏的 closed shadow root 改成 open，方便用脚本检查里面的内容
const attach = Element.prototype.attachShadow;
Element.prototype.attachShadow = function attachOpen(init) {
  return attach.call(this, { ...init, mode: 'open' });
};

function agents() {
  const out = [];
  const walk = (w) => {
    try {
      if (w.__jtAgent) out.push(w);
    } catch {
      return; // 跨域 frame
    }
    for (let i = 0; i < w.frames.length; i += 1) walk(w.frames[i]);
  };
  walk(window);
  return out;
}

const handlers = {
  'state:get': async () => ({ online: true, server: 'http://127.0.0.1:7317', cachedAt: new Date().toISOString(), ...DATA }),
  'fill:all': async ({ options }) => {
    const results = [];
    for (const w of agents()) results.push(await w.__jtAgent.fillAll({ profile: DATA.profile, options }));
    return aggregateFill(results);
  },
  'fill:insert': async ({ text }) => ({ ok: agents().some((w) => w.__jtAgent.insertFocused(text)) }),
  'fill:clear': async () => {
    agents().forEach((w) => w.__jtAgent.clearMarks());
    return { ok: true };
  },
  'resume:attach': async () => {
    const list = agents();
    const target = bestFileTarget(list.map((w, frameId) => ({ frameId, candidates: w.__jtAgent.findFileInputs() })));
    if (!target) return { ok: false, reason: '这个页面上没找到上传简历的地方' };
    const file = { name: '测试简历.pdf', type: 'application/pdf', b64: btoa('%PDF-1.4 test') };
    return { ok: list[target.frameId].__jtAgent.attachFile(target.index, file), label: target.label, file: file.name };
  },
  'clip:selection': async () => ({ text: agents().map((w) => String(w.getSelection())).sort((a, b) => b.length - a.length)[0] || '' }),
  'clip:parse': async ({ text, url }) => parseJD(text, url),
  'clip:find': async () => ({ app: window.jtTest.dup }),
  'clip:save': async ({ record, jdText }) => {
    window.jtTest.saved = { record, jdText };
    return { app: { id: 'app_test', ...record } };
  },
  'clip:stage': async ({ id, stage }) => ({ app: { ...(window.jtTest.dup || {}), id, stage } }),
  'tracker:open': async () => ({ ok: true }),
  'server:set': async () => handlers['state:get'](),
};

window.chrome = window.chrome || {};
window.chrome.runtime = {
  sendMessage: async (msg) => {
    try {
      return await handlers[msg.type](msg);
    } catch (e) {
      return { error: e.message };
    }
  },
};

window.jtTest = {
  dup: null,
  saved: null,
  fill: (options = {}) => handlers['fill:all']({ options: { lang: 'auto', overwrite: false, reverse: false, ...options } }),
  insert: (text) => handlers['fill:insert']({ text }),
  attach: () => handlers['resume:attach']({}),
  panelRoot: () => document.getElementById('jt-panel-host')?.shadowRoot || null,
  async openPanel() {
    if (!window.__jtPanel) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/extension/content/panel.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.append(s);
      });
    }
    if (!window.__jtPanel.isOpen()) window.__jtPanel.open();
  },
};
document.documentElement.dataset.harness = 'ready';
