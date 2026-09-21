import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore, StoreError, stripJdHeader } from '../server/store.js';

function tmpStore(clock) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-store-'));
  const now = clock || (() => new Date('2026-09-21T18:00:00Z'));
  return { dir, store: createStore(dir, { now }) };
}

test('空目录：返回默认值，并建好子目录', () => {
  const { dir, store } = tmpStore();
  assert.deepEqual(store.list('applications'), []);
  assert.equal(store.getSettings().staleDays, 14);
  assert.deepEqual(store.getProfile().education, []);
  for (const d of ['jd', 'resumes', 'backups']) assert.ok(fs.statSync(path.join(dir, d)).isDirectory());
});

test('增删改查', () => {
  const { store } = tmpStore();
  store.insert('answers', { id: 'ans_1', text: 'a' });
  store.insert('answers', { id: 'ans_2', text: 'b' });
  assert.equal(store.get('answers', 'ans_2').text, 'b');
  store.replace('answers', 'ans_2', { id: 'ans_2', text: 'c' });
  assert.equal(store.get('answers', 'ans_2').text, 'c');
  store.remove('answers', 'ans_1');
  assert.deepEqual(store.list('answers').map((a) => a.id), ['ans_2']);
  assert.equal(store.get('answers', 'nope'), null);
  assert.throws(() => store.remove('answers', 'nope'), (e) => e instanceof StoreError && e.code === 'NOT_FOUND');
});

test('原子写：不留临时文件，内容是格式化的 JSON', () => {
  const { dir, store } = tmpStore();
  store.insert('answers', { id: 'ans_1' });
  const files = fs.readdirSync(dir);
  assert.ok(files.includes('answers.json'));
  assert.ok(!files.some((f) => f.endsWith('.tmp')));
  assert.match(fs.readFileSync(path.join(dir, 'answers.json'), 'utf8'), /^\[\n {2}\{/);
});

test('文件损坏：读取报错，写入被拒绝且原文件不变', () => {
  const { dir, store } = tmpStore();
  fs.writeFileSync(path.join(dir, 'applications.json'), '[{ broken');
  assert.throws(() => store.list('applications'), (e) => e.code === 'CORRUPT' && /applications\.json/.test(e.message));
  assert.throws(() => store.insert('applications', { id: 'app_1' }), (e) => e.code === 'CORRUPT');
  assert.equal(fs.readFileSync(path.join(dir, 'applications.json'), 'utf8'), '[{ broken');
  fs.writeFileSync(path.join(dir, 'answers.json'), '{"not":"array"}');
  assert.throws(() => store.list('answers'), (e) => e.code === 'CORRUPT' && /数组/.test(e.message));
});

test('备份：30 分钟内只备份一次，最多保留 30 份', () => {
  let t = new Date('2026-09-21T18:00:00Z').getTime();
  const { dir, store } = tmpStore(() => new Date(t));
  const backups = () => fs.readdirSync(path.join(dir, 'backups')).filter((f) => f.startsWith('settings.'));
  store.patchSettings({ weeklyGoal: 1 }); // 文件还不存在，没东西可备份
  store.patchSettings({ weeklyGoal: 2 }); // 备份第 1 份
  store.patchSettings({ weeklyGoal: 3 }); // 30 分钟内，跳过
  assert.equal(backups().length, 1);
  for (let i = 0; i < 40; i++) {
    t += 31 * 60000;
    store.patchSettings({ weeklyGoal: 10 + i });
  }
  assert.equal(backups().length, 30);
});

test('profile / settings 按顶层 key 合并', () => {
  const { store } = tmpStore();
  store.patchProfile({ skills: { zh: 'Python', en: 'Python' } });
  const p = store.patchProfile({ selfIntro: { zh: '你好', en: 'Hi' } });
  assert.equal(p.skills.zh, 'Python');
  assert.equal(p.selfIntro.en, 'Hi');
  assert.equal(store.patchSettings({ staleDays: 7 }).staleDays, 7);
  assert.equal(store.getSettings().weeklyGoal, 10);
});

test('JD 快照：写入带标题，读出去掉标题；可删除；拒绝非法 id', () => {
  const { dir, store } = tmpStore();
  const rel = store.writeJd('app_1', '岗位职责……\n任职要求……', '# 雀巢 · MT\n\n- 链接：（无）\n');
  assert.equal(rel, 'jd/app_1.md');
  assert.match(fs.readFileSync(path.join(dir, 'jd', 'app_1.md'), 'utf8'), /^# 雀巢 · MT/);
  assert.equal(store.readJd('app_1'), '岗位职责……\n任职要求……');
  store.deleteJd('app_1');
  assert.equal(store.readJd('app_1'), '');
  assert.throws(() => store.readJd('../x'), (e) => e.code === 'BAD_REQUEST');
});

test('stripJdHeader 兼容手写的无标题文件', () => {
  assert.equal(stripJdHeader('纯文本 JD\n'), '纯文本 JD');
  assert.equal(stripJdHeader('# A · B\n\n- 链接：x\n---\n\n正文\n'), '正文');
});

test('简历文件：清理文件名、读取、拒绝路径穿越', () => {
  const { dir, store } = tmpStore();
  const f = store.saveResumeFile('res_1', '../../简历 v2?.pdf', Buffer.from('%PDF-1.4'));
  assert.equal(f.name, '简历 v2_.pdf');
  assert.match(f.stored, /^resumes\/res_1__[0-9a-z]+__简历 v2_\.pdf$/);
  assert.equal(f.size, 8);
  const stored = f.stored.replace('resumes/', '');
  assert.equal(fs.readFileSync(store.resumeFilePath(stored), 'utf8'), '%PDF-1.4');
  assert.throws(() => store.resumeFilePath('../applications.json'), (e) => e.code === 'BAD_REQUEST');
  assert.throws(() => store.resumeFilePath('nope.pdf'), (e) => e.code === 'NOT_FOUND');
  store.deleteResumeFile(stored);
  assert.ok(!fs.existsSync(path.join(dir, 'resumes', stored)));
});

test('version 随写入变化', () => {
  const { store } = tmpStore();
  const v0 = store.version();
  store.insert('answers', { id: 'ans_1' });
  assert.ok(store.version() > v0);
});
