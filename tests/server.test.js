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
