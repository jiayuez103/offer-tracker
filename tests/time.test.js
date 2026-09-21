import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  zonedToISO, isoToLocalInput, formatZoned, dualTime, todayInZone,
  daysUntil, deadlineISO, weekStartOf, addDays, diffDays, tzOffsetMinutes,
} from '../shared/time.js';
import { DEFAULT_SETTINGS } from '../shared/constants.js';

const SH = 'Asia/Shanghai';
const LA = 'America/Los_Angeles';

test('墙上时间 → 带偏移的 ISO', () => {
  assert.equal(zonedToISO('2026-09-25T14:00', SH), '2026-09-25T14:00:00+08:00');
  assert.equal(zonedToISO('2026-09-25T14:00', LA), '2026-09-25T14:00:00-07:00');
  assert.equal(zonedToISO('2026-11-02T10:00', LA), '2026-11-02T10:00:00-08:00');
  assert.throws(() => zonedToISO('9/25 14:00', SH));
});

test('偏移量随夏令时变化', () => {
  assert.equal(tzOffsetMinutes(new Date('2026-10-30T00:00:00Z'), LA), -420);
  assert.equal(tzOffsetMinutes(new Date('2026-11-02T00:00:00Z'), LA), -480);
  assert.equal(tzOffsetMinutes(new Date('2026-11-02T00:00:00Z'), SH), 480);
});

test('北京时间换算到洛杉矶（含 11-01 夏令时结束）', () => {
  assert.equal(isoToLocalInput('2026-09-25T14:00:00+08:00', LA), '2026-09-24T23:00');
  assert.equal(isoToLocalInput('2026-10-30T10:00:00+08:00', LA), '2026-10-29T19:00');
  assert.equal(isoToLocalInput('2026-11-02T10:00:00+08:00', LA), '2026-11-01T18:00');
});

test('格式化与双时区显示', () => {
  assert.equal(formatZoned('2026-09-25T14:00:00+08:00', SH), '9/25 周五 14:00');
  assert.equal(formatZoned('2026-09-25T14:00:00+08:00', SH, { time: false }), '9/25 周五');
  assert.deepEqual(dualTime('2026-09-25T14:00:00+08:00', SH, DEFAULT_SETTINGS), {
    primary: '9/25 周五 14:00 北京',
    secondary: '洛杉矶 9/24 周四 23:00',
  });
  assert.deepEqual(dualTime('2026-09-24T23:00:00-07:00', LA, DEFAULT_SETTINGS), {
    primary: '9/24 周四 23:00 洛杉矶',
    secondary: '北京 9/25 周五 14:00',
  });
});

test('今天、剩余天数、截止时刻', () => {
  const now = new Date('2026-09-21T03:00:00Z'); // 北京 9/21 11:00，洛杉矶 9/20 20:00
  assert.equal(todayInZone(SH, now), '2026-09-21');
  assert.equal(todayInZone(LA, now), '2026-09-20');
  assert.equal(daysUntil('2026-09-25', SH, now), 4);
  assert.equal(daysUntil('2026-09-21', SH, now), 0);
  assert.equal(daysUntil('2026-09-20', SH, now), -1);
  assert.equal(deadlineISO('2026-10-15', SH), '2026-10-15T23:59:00+08:00');
});

test('日期工具', () => {
  assert.equal(weekStartOf('2026-09-20'), '2026-09-14'); // 周日 → 本周一
  assert.equal(weekStartOf('2026-09-21'), '2026-09-21'); // 周一
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(diffDays('2026-09-21', '2026-10-01'), 10);
});
