import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clock = new Date('2026-09-21T18:00:00Z').getTime(); // 洛杉矶 9/21 11:00
let server;
let base;
let port;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-server-'));
  server = http.createServer(createApp({ dataDir, rootDir, now: () => new Date(clock) }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});

after(() => server.close());

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const post = async (p, body) => (await fetch(`${base}${p}`, json('POST', body))).json();

/** fetch 不允许改 Host，安全相关的测试用原始 http 请求 */
function rawRequest({ method = 'GET', pathname = '/api/ping', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: pathname, headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('ping 与 state', async () => {
  assert.deepEqual(await (await fetch(`${base}/api/ping`)).json(), { ok: true, app: 'job-tracker', version: '1.0.0' });
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual(state.applications, []);
  assert.equal(state.settings.targetTz, 'Asia/Shanghai');
  assert.ok(Array.isArray(state.profile.education));
  assert.equal(typeof state.version, 'number');
});

test('投递：新建、改阶段写时间线、非法值 400、删除', async () => {
  let res = await fetch(`${base}/api/applications`, json('POST', { company: '雀巢', position: 'MT', stage: 'applied' }));
  assert.equal(res.status, 201);
  assert.ok(res.headers.get('x-data-version'));
  const app = await res.json();
  assert.equal(app.appliedAt, '2026-09-21');
  res = await fetch(`${base}/api/applications/${app.id}`, json('PATCH', { stage: 'interview' }));
  assert.equal((await res.json()).timeline.at(-1).to, 'interview');
  res = await fetch(`${base}/api/applications/${app.id}`, json('PATCH', { stage: 'bogus' }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /阶段/);
  res = await fetch(`${base}/api/applications/${app.id}`, { method: 'DELETE' });
  assert.equal(res.status, 200);
  assert.equal((await fetch(`${base}/api/applications/${app.id}`)).status, 404);
});

test('JD 快照：写入、读取、随投递删除', async () => {
  const app = await post('/api/applications', { company: '宝洁', position: 'Brand MT' });
  const withJd = await (await fetch(`${base}/api/applications/${app.id}/jd`, json('PUT', { text: '职责：做品牌' }))).json();
  assert.equal(withJd.jdFile, `jd/${app.id}.md`);
  assert.match(fs.readFileSync(path.join(dataDir, 'jd', `${app.id}.md`), 'utf8'), /^# 宝洁 · Brand MT/);
  assert.deepEqual(await (await fetch(`${base}/api/applications/${app.id}/jd`)).json(), { text: '职责：做品牌' });
  await fetch(`${base}/api/applications/${app.id}`, { method: 'DELETE' });
  assert.ok(!fs.existsSync(path.join(dataDir, 'jd', `${app.id}.md`)));
});

test('清空 JD 文本等于删除快照', async () => {
  const app = await post('/api/applications', { company: 'A' });
  await fetch(`${base}/api/applications/${app.id}/jd`, json('PUT', { text: 'x' }));
  const cleared = await (await fetch(`${base}/api/applications/${app.id}/jd`, json('PUT', { text: '  ' }))).json();
  assert.equal(cleared.jdFile, null);
});

test('档案与设置 PATCH', async () => {
  const p = await (await fetch(`${base}/api/profile`, json('PATCH', { skills: { zh: 'SQL', en: 'SQL' } }))).json();
  assert.equal(p.skills.en, 'SQL');
  const s = await (await fetch(`${base}/api/settings`, json('PATCH', { weeklyGoal: 12 }))).json();
  assert.equal(s.weeklyGoal, 12);
  assert.equal(s.staleDays, 14);
});

test('素材库：通用集合的新建和修改，id 不可改', async () => {
  const a = await post('/api/answers', { category: '领导力', text: 'x' });
  assert.match(a.id, /^ans_/);
  const b = await (await fetch(`${base}/api/answers/${a.id}`, json('PATCH', { text: 'y', id: 'hack' }))).json();
  assert.equal(b.id, a.id);
  assert.equal(b.text, 'y');
});

test('简历：上传中文文件名、下载、删除文件、删除版本', async () => {
  const r = await post('/api/resumes', { name: '产品线-中文', track: '产品', lang: 'zh' });
  assert.deepEqual(r.files, []);
  let res = await fetch(`${base}/api/resumes/${r.id}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent('简历-产品.pdf') },
    body: Buffer.from('%PDF-test'),
  });
  assert.equal(res.status, 201);
  const withFile = await res.json();
  assert.equal(withFile.files[0].name, '简历-产品.pdf');
  const stored = withFile.files[0].stored.replace('resumes/', '');
  res = await fetch(`${base}/files/resumes/${encodeURIComponent(stored)}`);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition'), /^inline; filename\*=UTF-8''/);
  assert.equal(await res.text(), '%PDF-test');
  res = await fetch(`${base}/api/resumes/${r.id}/files/${encodeURIComponent(stored)}`, { method: 'DELETE' });
  assert.deepEqual((await res.json()).files, []);
  assert.equal((await fetch(`${base}/api/resumes/${r.id}`, { method: 'DELETE' })).status, 200);
});

test('日历导出', async () => {
  const app = await post('/api/applications', { company: '玛氏', deadline: '2026-10-20' });
  const res = await fetch(`${base}/calendar.ics`);
  assert.match(res.headers.get('content-type'), /text\/calendar/);
  assert.match(await res.text(), new RegExp(`deadline-${app.id}@job-tracker`));
});

test('静态文件：shared 可访问，路径穿越被拒，不存在返回 404', async () => {
  const res = await fetch(`${base}/shared/constants.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.equal((await rawRequest({ pathname: '/shared/..%2Fpackage.json' })).status, 403);
  assert.equal((await fetch(`${base}/nope.html`)).status, 404);
});

test('安全：Host、Origin、Content-Type、OPTIONS', async () => {
  assert.equal((await rawRequest({ headers: { Host: 'evil.com' } })).status, 403);
  assert.equal((await rawRequest({ headers: { Host: `localhost:${port}` } })).status, 200);
  assert.equal((await rawRequest({ headers: { Origin: 'https://evil.com' } })).status, 403);
  assert.equal((await rawRequest({ headers: { Origin: 'chrome-extension://abcdef' } })).status, 200);
  assert.equal((await rawRequest({ headers: { Origin: `http://127.0.0.1:${port}` } })).status, 200);
  assert.equal((await rawRequest({ method: 'OPTIONS' })).status, 403);
  const res = await fetch(`${base}/api/answers`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(res.status, 415);
});

test('数据文件损坏时返回清楚的错误', async () => {
  const file = path.join(dataDir, 'answers.json');
  const good = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, '{oops');
  const res = await fetch(`${base}/api/answers`);
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /answers\.json 不是有效的 JSON/);
  fs.writeFileSync(file, good);
});

test('写入后 version 变大', async () => {
  const v1 = (await (await fetch(`${base}/api/version`)).json()).version;
  await new Promise((r) => setTimeout(r, 10));
  const res = await fetch(`${base}/api/settings`, json('PATCH', { weeklyGoal: 9 }));
  assert.ok(Number(res.headers.get('x-data-version')) > v1);
});

test('解析 JD：复用 shared/jdparse.js', async () => {
  const res = await fetch(`${base}/api/parse-jd`, json('POST', { text: '岗位：品牌管培生\n工作地点：上海', url: 'https://www.pgcareers.com/job/1' }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { company: '宝洁', companyType: '外企', position: '品牌管培生', cities: '上海', deadline: '' });
});

test('AI 配置：API key 绝不出服务端', async () => {
  const get = async () => (await fetch(`${base}/api/settings`)).json();
  const patch = async (ai) => (await fetch(`${base}/api/settings`, json('PATCH', { ai }))).json();

  const before = await get();
  assert.equal(before.ai.hasKey, false);
  assert.equal('apiKey' in before.ai, false);

  const saved = await patch({ format: 'openai', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: 'sk-secret-123', enabled: true });
  assert.equal(saved.ai.hasKey, true);
  assert.equal('apiKey' in saved.ai, false);
  assert.equal(saved.ai.model, 'deepseek-chat');

  // 空串 = 不修改，别把已存的 key 洗掉
  const kept = await patch({ model: 'deepseek-reasoner', apiKey: '' });
  assert.equal(kept.ai.hasKey, true);
  assert.equal(kept.ai.model, 'deepseek-reasoner');

  const state = await (await fetch(`${base}/api/state`)).text();
  assert.equal(state.includes('sk-secret-123'), false);
  assert.equal(JSON.parse(state).settings.ai.hasKey, true);

  // null = 显式清空
  const cleared = await patch({ apiKey: null });
  assert.equal(cleared.ai.hasKey, false);
});

// ---- AI 诊断 ----
function aiServer({ reply, status = 200 }) {
  const calls = [];
  const fake = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(reply), { status, headers: { 'Content-Type': 'application/json' } });
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-ai-'));
  const app = http.createServer(createApp({ dataDir: dir, rootDir, now: () => new Date(clock), fetchImpl: fake }));
  return { calls, dir, app };
}

async function withAi(reply, status, fn) {
  const { calls, app } = aiServer({ reply, status });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${app.address().port}`;
  const api = async (p, body, method = 'POST') => {
    const res = await fetch(`${url}${p}`, body === undefined ? undefined : json(method, body));
    return { status: res.status, data: await res.json().catch(() => null), raw: res };
  };
  try {
    await api('/api/settings', { ai: { format: 'openai', baseUrl: 'https://api.example.com', model: 'm1', apiKey: 'sk-leak-test', enabled: true } }, 'PATCH');
    const { data: created } = await api('/api/applications', { company: '示例公司', position: '管培生', stage: 'applied' });
    await fetch(`${url}/api/applications/${created.id}/jd`, json('PUT', { text: '岗位要求：市场营销相关专业，有快消实习经历。' }));
    await fn({ api, appId: created.id, calls });
  } finally {
    app.close();
  }
}

const DIAGNOSIS = { summary: '整体匹配', requirements: [{ text: '市场营销专业', match: 'strong', evidence: '硕士在读' }], keywords: ['快消'], rewrites: [] };

test('AI 诊断：调模型、落缓存、第二次不再花钱', async () => {
  await withAi({ choices: [{ message: { content: '```json\n' + JSON.stringify(DIAGNOSIS) + '\n```' } }], usage: { total_tokens: 100 } }, 200, async ({ api, appId, calls }) => {
    const first = await api('/api/ai/diagnose', { appId });
    assert.equal(first.status, 200);
    assert.equal(first.data.diagnosis.summary, '整体匹配');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-leak-test');

    const second = await api('/api/ai/diagnose', { appId });
    assert.equal(second.status, 200);
    assert.equal(calls.length, 1, '有缓存就不该再调模型');
    assert.ok(second.data.cached);

    const forced = await api('/api/ai/diagnose', { appId, force: true });
    assert.equal(forced.status, 200);
    assert.equal(calls.length, 2);
  });
});

test('AI 诊断：没配置、没 JD、上游报错都给人话', async () => {
  await withAi({ choices: [{ message: { content: '{}' } }] }, 200, async ({ api }) => {
    const { data } = await api('/api/ai/diagnose', { appId: 'app_nope' });
    assert.match(data.error, /找不到|不存在/);
  });
  await withAi({ error: { message: 'Invalid API key' } }, 401, async ({ api, appId }) => {
    const { status, data } = await api('/api/ai/diagnose', { appId });
    assert.equal(status, 400);
    assert.match(data.error, /key/i);
  });
});

test('AI 接口的响应里绝不出现 key', async () => {
  await withAi({ choices: [{ message: { content: JSON.stringify(DIAGNOSIS) } }] }, 200, async ({ api, appId }) => {
    const out = await api('/api/ai/diagnose', { appId });
    assert.equal(JSON.stringify(out.data).includes('sk-leak-test'), false);
  });
});

test('AI 对话：转成 SSE 流，并把来回都记进缓存', async () => {
  const chunks = [
    'data: {"choices":[{"delta":{"content":"先"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"改这段"}}]}\n\n',
    'data: [DONE]\n\n',
  ];
  const fake = async () => new Response(new ReadableStream({
    start(c) {
      for (const s of chunks) c.enqueue(new TextEncoder().encode(s));
      c.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-ai2-'));
  const app = http.createServer(createApp({ dataDir: dir, rootDir, now: () => new Date(clock), fetchImpl: fake }));
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${app.address().port}`;
  try {
    await fetch(`${url}/api/settings`, json('PATCH', { ai: { format: 'openai', baseUrl: 'https://api.example.com', model: 'm1', apiKey: 'sk-x', enabled: true } }));
    const created = await (await fetch(`${url}/api/applications`, json('POST', { company: '示例公司', stage: 'applied' }))).json();
    await fetch(`${url}/api/applications/${created.id}/jd`, json('PUT', { text: '要求：市场营销' }));

    const res = await fetch(`${url}/api/ai/chat`, json('POST', { appId: created.id, message: '帮我改短一点' }));
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    const body = await res.text();
    assert.match(body, /先/);
    assert.match(body, /改这段/);

    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'ai', `${created.id}.json`), 'utf8'));
    assert.equal(saved.chat.length, 2);
    assert.equal(saved.chat[0].content, '帮我改短一点');
    assert.equal(saved.chat[1].content, '先改这段');
  } finally {
    app.close();
  }
});

test('面试准备：生成、缓存、强制重算', async () => {
  const reply = { summary: '围绕快消新品和消费者洞察', questions: [{ category: '行为', q: '讲讲海天那个项目', why: 'JD 要求消费者洞察', use: ['work_1'], points: ['先说结构', '再说结果'] }] };
  await withAi({ choices: [{ message: { content: JSON.stringify(reply) } }] }, 200, async ({ api, appId, calls }) => {
    const first = await api('/api/ai/interview', { appId });
    assert.equal(first.status, 200);
    assert.equal(first.data.interview.questions.length, 1);
    assert.equal(calls.length, 1);

    const second = await api('/api/ai/interview', { appId });
    assert.ok(second.data.cached);
    assert.equal(calls.length, 1);

    await api('/api/ai/interview', { appId, force: true });
    assert.equal(calls.length, 2);
  });
});
