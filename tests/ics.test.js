import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, escapeText, foldLine, icsDate } from '../shared/ics.js';
import { DEFAULT_SETTINGS } from '../shared/constants.js';

const NOW = new Date('2026-09-21T18:00:00Z');
const enc = new TextEncoder();

test('UTC 时间格式与文本转义', () => {
  assert.equal(icsDate(new Date('2026-09-25T14:00:00+08:00')), '20260925T060000Z');
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});

test('长行按 75 字节折行且不拆开中文', () => {
  const line = 'SUMMARY:' + '面试｜联合利华 市场部管培生'.repeat(6);
  const parts = foldLine(line).split('\r\n');
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(enc.encode(p).length <= 75, p);
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(''), line);
});

test('生成日历：日程 + 待投递岗位的截止日', () => {
  const apps = [
    {
      id: 'app_1', company: '雀巢', position: 'Marketing MT', stage: 'interview', status: 'active', deadline: '2026-10-15',
      events: [{ id: 'evt_1', type: '面试', title: '二面', at: '2026-09-25T14:00:00+08:00', tz: 'Asia/Shanghai', durationMin: 45, location: 'https://meeting.example.com/1', done: false }],
    },
    { id: 'app_2', company: '宝洁', position: 'Brand MT', stage: 'wishlist', status: 'active', deadline: '2026-10-15', events: [], applyUrl: 'https://careers.example.com/apply' },
    { id: 'app_3', company: '已放弃', position: 'X', stage: 'wishlist', status: 'withdrawn', deadline: '2026-10-15', events: [] },
  ];
  const ics = buildCalendar(apps, DEFAULT_SETTINGS, NOW);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /UID:evt_1@job-tracker/);
  assert.match(ics, /DTSTART:20260925T060000Z/);
  assert.match(ics, /DTEND:20260925T064500Z/);
  assert.match(ics, /SUMMARY:面试｜雀巢 Marketing MT · 二面/);
  assert.match(ics, /URL:https:\/\/meeting\.example\.com\/1/);
  assert.match(ics, /TRIGGER:-PT60M/);
  assert.match(ics, /UID:deadline-app_2@job-tracker/);
  assert.match(ics, /DTSTART:20261015T155900Z/); // 北京 10/15 23:59
  assert.doesNotMatch(ics, /已放弃/);
  assert.doesNotMatch(ics, /deadline-app_1/); // 已经投了，不再提醒截止
});

const oneEvent = (ev) => buildCalendar(
  [{ id: 'app_1', company: '示例公司', position: '管培生', stage: 'assessment', status: 'active', events: [ev] }],
  DEFAULT_SETTINGS,
  NOW,
);
const triggers = (ics) => (ics.match(/TRIGGER:-PT\d+M/g) || []);

test('截止型日程响两次：提前 1 天 + 当天早上 9 点', () => {
  // 洛杉矶 10/14 14:00 截止 → 当天 9:00 距截止 300 分钟
  const ics = oneEvent({ id: 'evt_1', type: '测评', at: '2026-10-14T14:00:00-07:00', durationMin: 60, done: false });
  assert.deepEqual(triggers(ics), ['TRIGGER:-PT1440M', 'TRIGGER:-PT300M']);
});

test('截止时间在凌晨时，第二次闹钟退化成提前 2 小时', () => {
  const ics = oneEvent({ id: 'evt_1', type: 'AI面', at: '2026-10-17T02:42:00-07:00', durationMin: 30, done: false });
  assert.deepEqual(triggers(ics), ['TRIGGER:-PT1440M', 'TRIGGER:-PT120M']);
});

test('会议型日程还是只响一次', () => {
  const ics = oneEvent({ id: 'evt_1', type: '面试', at: '2026-10-14T14:00:00-07:00', durationMin: 60, done: false });
  assert.deepEqual(triggers(ics), ['TRIGGER:-PT60M']);
});

test('约好时间的 AI 面可以设成会议型', () => {
  const ics = oneEvent({ id: 'evt_1', type: 'AI面', mode: 'meeting', at: '2026-10-14T14:00:00-07:00', durationMin: 30, done: false });
  assert.deepEqual(triggers(ics), ['TRIGGER:-PT60M']);
});
