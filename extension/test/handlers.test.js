import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandlers, AGENT_FILES } from '../bg/handlers.js';

const BASE = 'http://127.0.0.1:7317';

/** 假 chrome：executeScript 的 func 会在每个假 frame 上运行（把它设成全局 window） */
function setup({ frames = [], routes = {}, offline = false } = {}) {
  const store = {};
  const calls = { scripts: [], fetches: [], tabs: [] };
  const chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: store[key] }),
        set: async (obj) => { Object.assign(store, obj); },
      },
    },
    scripting: {
      executeScript: async ({ target, files, func, args = [] }) => {
        calls.scripts.push({ target, files: files || null });
        const ids = target.frameIds || (target.allFrames ? frames.map((_, i) => i) : [0]);
        if (files) return ids.map((frameId) => ({ frameId, result: undefined }));
        const results = [];
        for (const frameId of ids) {
          globalThis.window = frames[frameId];
          try {
            results.push({ frameId, result: await func(...args) });
          } finally {
            delete globalThis.window;
          }
        }
        return results;
      },
    },
    tabs: { create: async (opts) => { calls.tabs.push(opts); } },
  };
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.fetches.push({ url, method, body: init.body ? JSON.parse(init.body) : undefined });
    if (offline) throw new TypeError('fetch failed');
    const route = routes[`${method} ${url.replace(BASE, '')}`];
    if (!route) return { ok: false, status: 404, json: async () => ({ error: '接口不存在' }) };
    const body = typeof route === 'function' ? route(init) : route;
    return { ok: true, status: 200, json: async () => body, arrayBuffer: async () => body };
  };
  return { ...createHandlers({ chrome, fetch }), calls, store };
}

const STATE = {
  profile: { basic: {} },
  answers: [],
  applications: [],
  settings: {},
  resumes: [{ id: 'res_1', files: [{ name: 'a.docx', stored: 'resumes/res_1__x__a.docx' }, { name: 'a.pdf', stored: 'resumes/res_1__y__a.pdf' }] }],
};

test('读取状态并缓存；离线时用缓存', async () => {
  const online = setup({ routes: { 'GET /api/state': STATE } });
  const s = await online.handlers['state:get']({});
  assert.equal(s.online, true);
  assert.ok(online.store.cache.cachedAt);
  const offline = setup({ offline: true });
  offline.store.cache = online.store.cache;
  const s2 = await offline.handlers['state:get']({});
  assert.equal(s2.online, false);
  assert.equal(s2.resumes.length, 1);
  assert.equal(s2.cachedAt, online.store.cache.cachedAt);
});

test('一键填写：先注入脚本，再在所有 frame 执行并汇总', async () => {
  const frames = [
    { __jtAgent: { fillAll: async () => ({ filled: 2, uncertain: 0, manual: 1, skipped: 0, missing: {} }) } },
    { __jtAgent: { fillAll: async ({ options }) => ({ filled: options.overwrite ? 5 : 1, uncertain: 1, manual: 0, skipped: 0, missing: { work: 1 } }) } },
  ];
  const h = setup({ frames, routes: { 'GET /api/state': STATE } });
  const sum = await h.handlers['fill:all']({ options: { overwrite: true } }, 7);
  assert.deepEqual(sum, { filled: 7, uncertain: 1, manual: 1, skipped: 0, missing: { work: 1 }, frames: 2 });
  assert.deepEqual(h.calls.scripts[0].files, AGENT_FILES);
  assert.equal(h.calls.scripts[0].target.tabId, 7);
});

test('没有档案时一键填写给出提示', async () => {
  const h = setup({ offline: true });
  await assert.rejects(h.handlers['fill:all']({ options: {} }, 1), /档案/);
});

test('点选填充：交给有焦点的 frame', async () => {
  const got = [];
  const frames = [
    { __jtAgent: { insertFocused: () => false } },
    { __jtAgent: { insertFocused: (t) => { got.push(t); return true; } } },
  ];
  const h = setup({ frames });
  assert.deepEqual(await h.handlers['fill:insert']({ text: '你好' }, 1), { ok: true });
  assert.deepEqual(got, ['你好']);
});

test('上传简历：优先 PDF，放进得分最高的上传框', async () => {
  let attached = null;
  const frames = [
    { __jtAgent: { findFileInputs: () => [{ index: 0, score: 3, label: '附件' }], attachFile: () => { throw new Error('不该选这个'); } } },
    { __jtAgent: { findFileInputs: () => [{ index: 2, score: 13, label: '上传简历' }], attachFile: (i, f) => { attached = { i, ...f }; return true; } } },
  ];
  const pdf = new TextEncoder().encode('%PDF').buffer;
  const h = setup({ frames, routes: { 'GET /api/state': STATE, 'GET /files/resumes/res_1__y__a.pdf': pdf } });
  assert.deepEqual(await h.handlers['resume:attach']({ resumeId: 'res_1' }, 1), { ok: true, label: '上传简历', file: 'a.pdf' });
  assert.equal(attached.i, 2);
  assert.equal(attached.type, 'application/pdf');
  assert.equal(atob(attached.b64), '%PDF');
});

test('页面上没有上传框时说明原因', async () => {
  const frames = [{ __jtAgent: { findFileInputs: () => [] } }];
  const h = setup({ frames, routes: { 'GET /api/state': STATE, 'GET /files/resumes/res_1__y__a.pdf': new ArrayBuffer(1) } });
  const res = await h.handlers['resume:attach']({ resumeId: 'res_1' }, 1);
  assert.equal(res.ok, false);
  assert.match(res.reason, /没找到/);
});

test('记录投递：先建记录，再存 JD', async () => {
  const h = setup({
    routes: {
      'POST /api/applications': (init) => ({ id: 'app_1', ...JSON.parse(init.body) }),
      'PUT /api/applications/app_1/jd': { ok: true },
    },
  });
  const { app } = await h.handlers['clip:save']({ record: { company: '示例公司', position: 'MT' }, jdText: '职责……' });
  assert.equal(app.id, 'app_1');
  assert.deepEqual(h.calls.fetches.map((c) => `${c.method} ${c.url.replace(BASE, '')}`), ['POST /api/applications', 'PUT /api/applications/app_1/jd']);
  assert.deepEqual(h.calls.fetches[1].body, { text: '职责……' });
});

test('连不上服务时给出清楚的提示', async () => {
  const h = setup({ offline: true });
  await assert.rejects(h.handlers['clip:parse']({ text: 'x', url: '' }), /连不上 Tracker/);
});

test('服务地址可以改；打开 Tracker 时定位到这条投递', async () => {
  const h = setup();
  await h.handlers['server:set']({ url: 'http://127.0.0.1:9999/' });
  assert.equal(await h.serverUrl(), 'http://127.0.0.1:9999');
  const h2 = setup();
  await h2.handlers['tracker:open']({ id: 'app_1' });
  assert.deepEqual(h2.calls.tabs, [{ url: `${BASE}/#/applications?open=app_1` }]);
});
