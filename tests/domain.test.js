import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newId, asBi, emptyProfile, normalizeProfile, PROFILE_ENTRY, PROFILE_LISTS,
  prepareNewApplication, applyApplicationUpdate, validateApplication,
  lastProgressAt, isStale, nextEvent, funnel, weeklyApplied, actionItems, textStats, eventMode,
} from '../shared/domain.js';
import { DEFAULT_SETTINGS } from '../shared/constants.js';

const NOW = new Date('2026-09-21T18:00:00Z'); // 洛杉矶 9/21 11:00，北京 9/22 02:00
const ctx = { nowISO: NOW.toISOString(), today: '2026-09-21' };
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const hoursLater = (n) => new Date(NOW.getTime() + n * 3600000).toISOString();

function appliedApp(extra = {}) {
  const base = prepareNewApplication({ company: 'X', stage: 'applied' }, { nowISO: daysAgo(20), today: '2026-09-01' });
  return { ...base, ...extra };
}

test('newId 格式', () => {
  assert.match(newId('app'), /^app_[0-9a-z]{10}$/);
  assert.notEqual(newId('app'), newId('app'));
});

test('asBi 兼容字符串', () => {
  assert.deepEqual(asBi('上海'), { zh: '上海', en: '' });
  assert.deepEqual(asBi({ en: 'Shanghai' }), { zh: '', en: 'Shanghai' });
  assert.deepEqual(asBi(undefined), { zh: '', en: '' });
});

test('normalizeProfile 补齐缺失字段', () => {
  const p = normalizeProfile({ basic: { phone: '123' }, skills: 'Python', education: 'oops' });
  assert.equal(p.basic.phone, '123');
  assert.deepEqual(p.basic.name, { zh: '', en: '' });
  assert.deepEqual(p.skills, { zh: 'Python', en: '' });
  assert.deepEqual(p.education, []);
  for (const k of PROFILE_LISTS) assert.ok(Array.isArray(p[k]), k);
  assert.deepEqual(Object.keys(normalizeProfile(null)), Object.keys(emptyProfile()));
});

test('每种档案条目模板都带 id', () => {
  for (const k of PROFILE_LISTS) assert.match(PROFILE_ENTRY[k]().id, /^[a-z]+_[0-9a-z]{10}$/, k);
});

test('新建投递：默认值与 created 时间线', () => {
  const a = prepareNewApplication({ company: '雀巢', position: 'MT' }, ctx);
  assert.match(a.id, /^app_/);
  assert.equal(a.stage, 'wishlist');
  assert.equal(a.status, 'active');
  assert.equal(a.priority, 2);
  assert.equal(a.appliedAt, '');
  assert.equal(a.jdFile, null);
  assert.deepEqual(a.events, []);
  assert.equal(a.timeline.length, 1);
  assert.equal(a.timeline[0].type, 'created');
  assert.equal(a.createdAt, ctx.nowISO);
});

test('新建时直接是已投递，自动填投递日期', () => {
  const a = prepareNewApplication({ company: '宝洁', stage: 'applied' }, ctx);
  assert.equal(a.appliedAt, '2026-09-21');
});

test('改阶段写时间线，并补投递日期', () => {
  const a = prepareNewApplication({ company: '雀巢' }, ctx);
  const later = { nowISO: '2026-09-22T18:00:00.000Z', today: '2026-09-22' };
  const b = applyApplicationUpdate(a, { stage: 'applied' }, later);
  assert.equal(b.appliedAt, '2026-09-22');
  const last = b.timeline.at(-1);
  assert.deepEqual([last.type, last.from, last.to, last.at], ['stage', 'wishlist', 'applied', later.nowISO]);
  assert.equal(b.updatedAt, later.nowISO);
});

test('改状态写时间线；id 和 createdAt 不可改；没变化不写', () => {
  const a = prepareNewApplication({ company: '雀巢', stage: 'interview' }, ctx);
  const b = applyApplicationUpdate(a, { status: 'rejected', id: 'hack', createdAt: 'x' }, ctx);
  assert.equal(b.id, a.id);
  assert.equal(b.createdAt, a.createdAt);
  assert.equal(b.timeline.at(-1).type, 'status');
  const c = applyApplicationUpdate(b, { notes: 'hi', stage: 'interview' }, ctx);
  assert.equal(c.timeline.length, b.timeline.length);
});

test('意向度会从字符串转成数字', () => {
  const a = prepareNewApplication({ company: '雀巢', priority: '3' }, ctx);
  assert.equal(a.priority, 3);
  assert.equal(validateApplication(a), null);
  const b = applyApplicationUpdate(a, { priority: '1' }, ctx);
  assert.equal(b.priority, 1);
});

test('校验', () => {
  const a = prepareNewApplication({ company: '雀巢' }, ctx);
  assert.equal(validateApplication(a), null);
  assert.match(validateApplication({ ...a, stage: 'nope' }), /阶段/);
  assert.match(validateApplication({ ...a, status: 'nope' }), /状态/);
  assert.match(validateApplication({ ...a, priority: 5 }), /意向度/);
  assert.match(validateApplication({ ...a, company: '', position: '' }), /至少/);
});

test('没动静：投递 20 天无进展', () => {
  assert.equal(isStale(appliedApp(), DEFAULT_SETTINGS, NOW), true);
});

test('没动静：有未来日程、刚跟进过、待投递、已结束都不算', () => {
  const upcoming = appliedApp({ events: [{ id: 'e', type: '面试', at: hoursLater(30), done: false }] });
  assert.equal(isStale(upcoming, DEFAULT_SETTINGS, NOW), false);
  const followed = appliedApp();
  followed.timeline = [...followed.timeline, { id: 't', type: 'followup', at: daysAgo(3) }];
  assert.equal(isStale(followed, DEFAULT_SETTINGS, NOW), false);
  assert.equal(isStale(appliedApp({ stage: 'wishlist' }), DEFAULT_SETTINGS, NOW), false);
  assert.equal(isStale(appliedApp({ status: 'rejected' }), DEFAULT_SETTINGS, NOW), false);
});

test('最后进展包含已过去的日程', () => {
  const a = appliedApp({ events: [{ id: 'e', type: '笔试', at: daysAgo(2), done: true }] });
  assert.equal(lastProgressAt(a, NOW).toISOString(), daysAgo(2));
  assert.equal(isStale(a, DEFAULT_SETTINGS, NOW), false);
});

test('下一个日程跳过已完成和已过去的', () => {
  const a = appliedApp({ events: [
    { id: '1', type: '笔试', at: daysAgo(1), done: false },
    { id: '2', type: '面试', at: hoursLater(50), done: false },
    { id: '3', type: '群面', at: hoursLater(5), done: true },
    { id: '4', type: '终面', at: hoursLater(10), done: false },
  ] });
  assert.equal(nextEvent(a, NOW).id, '4');
  assert.equal(nextEvent(appliedApp(), NOW), null);
});

test('漏斗按到达过的最高阶段计数', () => {
  const apps = [{ stage: 'wishlist' }, { stage: 'applied' }, { stage: 'interview', status: 'rejected' }, { stage: 'offer' }];
  assert.deepEqual(funnel(apps).map((f) => f.count), [3, 2, 2, 1, 1]);
  assert.deepEqual(funnel(apps).map((f) => f.key), ['applied', 'assessment', 'interview', 'final', 'offer']);
});

test('近几周投递数', () => {
  const apps = [
    { appliedAt: '2026-09-21' }, { appliedAt: '2026-09-20' }, { appliedAt: '2026-09-15' },
    { appliedAt: '2026-08-01' }, { appliedAt: '' },
  ];
  assert.deepEqual(weeklyApplied(apps, 2, '2026-09-21'), [
    { weekStart: '2026-09-14', count: 2 },
    { weekStart: '2026-09-21', count: 1 },
  ]);
});

test('待处理清单按紧急程度排序', () => {
  const apps = [
    prepareNewApplication({ company: '快截止', deadline: '2026-09-24' }, ctx), // 北京今天 9/22，还剩 2 天
    prepareNewApplication({ company: '过期', deadline: '2026-09-10' }, ctx),
    appliedApp({ company: '测评', events: [{ id: 'a', type: '测评', at: hoursLater(10), done: false }] }),
    appliedApp({ company: '明天面试', events: [{ id: 'b', type: '面试', at: hoursLater(24), done: false }] }),
    appliedApp({ company: '复盘', events: [{ id: 'c', type: '群面', at: daysAgo(1), done: true, review: null }] }),
    appliedApp({ company: '没动静' }),
  ];
  const items = actionItems(apps, DEFAULT_SETTINGS, NOW);
  assert.deepEqual(items.map((i) => `${i.kind}:${i.app.company}`), [
    'test:测评', 'meeting:明天面试', 'deadline:快截止', 'review:复盘', 'stale:没动静', 'overdue:过期',
  ]);
  assert.equal(items.find((i) => i.kind === 'deadline').text, '还剩 2 天截止，还没投');
  assert.equal(items.find((i) => i.kind === 'test').text, '测评还剩 10 小时');
  assert.equal(items.find((i) => i.kind === 'meeting').text, '明天有面试');
  assert.equal(items.find((i) => i.kind === 'stale').text, '20 天没动静');
});

test('字数统计', () => {
  assert.deepEqual(textStats('你好，世界'), { chars: 5, words: 0 });
  assert.deepEqual(textStats("I don't know well-known things"), { chars: 26, words: 5 });
  assert.deepEqual(textStats(''), { chars: 0, words: 0 });
});

test('事件分截止型和会议型', () => {
  assert.equal(eventMode({ type: '测评' }), 'deadline');
  assert.equal(eventMode({ type: '笔试' }), 'deadline');
  assert.equal(eventMode({ type: 'AI面' }), 'deadline'); // 默认是「窗口内自己找时间做」
  assert.equal(eventMode({ type: '面试' }), 'meeting');
  assert.equal(eventMode({ type: 'AI面', mode: 'meeting' }), 'meeting'); // 约好了具体时间
});

test('截止型日程一直提醒，直到做完', () => {
  const apps = [
    appliedApp({ company: '远', events: [{ id: 'a', type: '测评', at: hoursLater(120), done: false, windowStart: NOW.toISOString() }] }),
    appliedApp({ company: '近', events: [{ id: 'b', type: 'AI面', at: hoursLater(9), done: false }] }),
    appliedApp({ company: '过期', events: [{ id: 'c', type: '测评', at: daysAgo(2), done: false }] }),
    appliedApp({ company: '做完了', events: [{ id: 'd', type: '测评', at: daysAgo(2), done: true }] }),
  ];
  const items = actionItems(apps, DEFAULT_SETTINGS, NOW).filter((i) => i.event);
  assert.deepEqual(items.map((i) => i.app.company), ['近', '远', '过期']);
  assert.equal(items[0].text, 'AI面还剩 9 小时');
  assert.equal(items[1].text, '测评还剩 5 天（窗口共 5 天）');
  assert.equal(items[2].text, '测评已过期 2 天');
  assert.equal(items[0].kind, 'test');
  assert.equal(items[2].kind, 'overdue');
});
