// 后台消息处理。chrome 和 fetch 由参数传入，方便在 Node 里用假对象测试。
// 传给 executeScript 的 func 会被序列化到页面里执行：只能用参数和 window，不能引用外面的变量。
import { aggregateFill, pickResumeFile, mimeFor, base64FromBuffer, findDuplicate, bestFileTarget } from './logic.js';

export const DEFAULT_SERVER = 'http://127.0.0.1:7317';
export const AGENT_FILES = [
  'content/lib/fields.js',
  'content/lib/match.js',
  'content/lib/fill.js',
  'content/lib/clip.js',
  'content/agent.js',
];

export function createHandlers({ chrome, fetch }) {
  async function serverUrl() {
    const { serverUrl: saved } = await chrome.storage.local.get('serverUrl');
    return String(saved || DEFAULT_SERVER).replace(/\/+$/, '');
  }

  async function api(method, path, body, timeout = 4000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(`${await serverUrl()}${path}`, {
        method,
        signal: ctrl.signal,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `请求失败（${res.status}）`);
      return data;
    } catch (e) {
      if (e.name === 'AbortError' || e instanceof TypeError) throw new Error('连不上 Tracker：先双击「启动Tracker.command」');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 在线时拉最新数据并缓存；离线时用缓存（没有缓存就是空的） */
  async function getState() {
    const server = await serverUrl();
    try {
      const data = await api('GET', '/api/state', undefined, 2000);
      const cachedAt = new Date().toISOString();
      await chrome.storage.local.set({ cache: { data, cachedAt } });
      return { online: true, server, cachedAt, ...data };
    } catch {
      const { cache } = await chrome.storage.local.get('cache');
      const empty = { profile: null, answers: [], resumes: [], applications: [], settings: null };
      return { online: false, server, cachedAt: cache ? cache.cachedAt : null, ...(cache ? cache.data : empty) };
    }
  }

  /** 每次操作前重新注入：覆盖页面后来才加载的 iframe（脚本可以重复注入） */
  async function inject(tabId) {
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: AGENT_FILES });
    } catch {
      // 个别 frame（比如浏览器内部页）不允许注入，忽略
    }
  }

  async function inFrames(tabId, func, args = []) {
    await inject(tabId);
    return chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func, args });
  }

  const handlers = {
    'state:get': () => getState(),

    async 'fill:all'({ options }, tabId) {
      const state = await getState();
      if (!state.profile) throw new Error('还没有档案数据：先启动一次 Tracker，再点插件图标');
      const res = await inFrames(tabId, (payload) => (window.__jtAgent ? window.__jtAgent.fillAll(payload) : null), [{ profile: state.profile, options }]);
      return aggregateFill(res.map((r) => r.result));
    },

    async 'fill:insert'({ text }, tabId) {
      const res = await inFrames(tabId, (t) => (window.__jtAgent ? window.__jtAgent.insertFocused(t) : false), [text]);
      return { ok: res.some((r) => r.result === true) };
    },

    async 'fill:clear'(_, tabId) {
      try {
        await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => window.__jtAgent && window.__jtAgent.clearMarks() });
      } catch {
        // 忽略
      }
      return { ok: true };
    },

    async 'resume:attach'({ resumeId }, tabId) {
      const state = await getState();
      const resume = (state.resumes || []).find((r) => r.id === resumeId);
      const file = resume ? pickResumeFile(resume.files || []) : null;
      if (!file) throw new Error('这个版本还没有文件');
      const res = await fetch(`${await serverUrl()}/files/${file.stored.split('/').map(encodeURIComponent).join('/')}`);
      if (!res.ok) throw new Error('读不到简历文件：Tracker 没有启动？');
      const b64 = base64FromBuffer(await res.arrayBuffer());
      const found = await inFrames(tabId, () => (window.__jtAgent ? window.__jtAgent.findFileInputs() : []));
      const target = bestFileTarget(found.map((r) => ({ frameId: r.frameId, candidates: r.result || [] })));
      if (!target) return { ok: false, reason: '这个页面上没找到上传简历的地方' };
      const [done] = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [target.frameId] },
        func: (index, f) => window.__jtAgent.attachFile(index, f),
        args: [target.index, { name: file.name, type: mimeFor(file.name), b64 }],
      });
      return { ok: !!(done && done.result), label: target.label, file: file.name };
    },

    async 'clip:selection'(_, tabId) {
      const res = await inFrames(tabId, () => (window.getSelection ? String(window.getSelection()).trim() : ''));
      return { text: res.map((r) => r.result || '').sort((a, b) => b.length - a.length)[0] || '' };
    },

    'clip:parse': ({ text, url }) => api('POST', '/api/parse-jd', { text, url }),

    async 'clip:find'({ url, company, position }) {
      return { app: findDuplicate(await api('GET', '/api/applications'), { url, company, position }) };
    },

    async 'clip:save'({ record, jdText }) {
      const app = await api('POST', '/api/applications', record);
      if (jdText && jdText.trim()) await api('PUT', `/api/applications/${app.id}/jd`, { text: jdText });
      return { app };
    },

    async 'clip:stage'({ id, stage }) {
      return { app: await api('PATCH', `/api/applications/${id}`, { stage }) };
    },

    async 'tracker:open'({ id }) {
      await chrome.tabs.create({ url: `${await serverUrl()}/#/applications${id ? `?open=${encodeURIComponent(id)}` : ''}` });
      return { ok: true };
    },

    async 'server:set'({ url }) {
      await chrome.storage.local.set({ serverUrl: String(url || '').trim() || DEFAULT_SERVER });
      return getState();
    },
  };

  /** 打开 / 关闭侧边栏：注入执行者和侧边栏脚本，再切换 */
  async function toggle(tabId) {
    await inject(tabId);
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/panel.js'] });
    await chrome.scripting.executeScript({ target: { tabId }, func: () => window.__jtPanel && window.__jtPanel.toggle() });
  }

  return { handlers, toggle, getState, api, serverUrl };
}
