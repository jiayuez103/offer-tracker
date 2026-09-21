import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_KEYS, STAGE_LABEL, STATUS_LABEL, CLOSED_STATUSES,
  EVENT_TYPES, INTERVIEW_EVENT_TYPES, EVENT_STAGE,
  DEFAULT_SETTINGS, COLLECTIONS, ID_PREFIX,
} from '../shared/constants.js';

test('阶段按流程顺序排列', () => {
  assert.deepEqual(STAGE_KEYS, ['wishlist', 'applied', 'assessment', 'interview', 'final', 'offer']);
  assert.equal(STAGE_LABEL.assessment, '测评/笔试');
});

test('已结束状态都在状态表里', () => {
  for (const s of CLOSED_STATUSES) assert.ok(STATUS_LABEL[s], s);
});

test('日程类型映射到合法阶段', () => {
  for (const t of EVENT_TYPES) if (EVENT_STAGE[t]) assert.ok(STAGE_KEYS.includes(EVENT_STAGE[t]), t);
  for (const t of INTERVIEW_EVENT_TYPES) assert.ok(EVENT_TYPES.includes(t), t);
});

test('每个集合都有 id 前缀；默认设置含时区', () => {
  for (const c of COLLECTIONS) assert.ok(ID_PREFIX[c], c);
  assert.equal(DEFAULT_SETTINGS.targetTz, 'Asia/Shanghai');
  assert.equal(DEFAULT_SETTINGS.staleDays, 14);
});
