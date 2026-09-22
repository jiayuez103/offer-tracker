import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScripts } from './load.js';

const JT = loadContentScripts(['content/lib/fields.js', 'content/lib/match.js', 'content/lib/fill.js']);
const groups = (key) => JT.FIELDS.find((f) => f.key === key).groups;

test('日期格式跟着输入框走', () => {
  assert.equal(JT.formatDate('2025-09', { type: 'month' }), '2025-09');
  assert.equal(JT.formatDate('2025-09', { type: 'date' }), '2025-09-01');
  assert.equal(JT.formatDate('2025-09', { placeholder: 'YYYY/MM' }), '2025/09');
  assert.equal(JT.formatDate('2025-09', { placeholder: 'MM/YYYY' }), '09/2025');
  assert.equal(JT.formatDate('2025-09', { placeholder: '例：2020.09' }), '2025.09');
  assert.equal(JT.formatDate('2025-09', { placeholder: 'yyyy年mm月' }), '2025年09月');
  assert.equal(JT.formatDate('2025-09', { placeholder: '请选择年月' }), '2025-09');
  assert.equal(JT.formatDate('2001-05-20', { type: 'date' }), '2001-05-20');
  assert.equal(JT.formatDate('2001-05-20', { placeholder: 'MM/DD/YYYY' }), '05/20/2001');
  assert.equal(JT.formatDate('至今', {}), '至今');
});

test('选项分组：性别不会把 Female 认成 Male', () => {
  assert.equal(JT.chooseOption(['请选择', '男', '女'], { groups: groups('gender'), values: ['女'] }), 2);
  assert.equal(JT.chooseOption(['Male', 'Female'], { groups: groups('gender'), values: ['女'] }), 1);
  assert.equal(JT.chooseOption(['Female', 'Male'], { groups: groups('gender'), values: ['男'] }), 1);
});

test('选项分组：学历、政治面貌', () => {
  assert.equal(JT.chooseOption(['本科', '硕士研究生', '博士研究生'], { groups: groups('edu.degree'), values: ['硕士', "Master's"] }), 1);
  assert.equal(JT.chooseOption(['Bachelor of Arts', 'Master of Science', 'PhD'], { groups: groups('edu.degree'), values: ['本科（双学位）'] }), 0);
  assert.equal(JT.chooseOption(['中共党员', '中共预备党员', '共青团员', '群众'], { groups: groups('political'), values: ['中共党员'] }), 0);
  assert.equal(JT.chooseOption(['中共预备党员', '中共党员'], { groups: groups('political'), values: ['中共党员'] }), 1);
});

test('没有分组时按文字模糊匹配', () => {
  assert.equal(JT.chooseOption(['Select One', 'United States (+1)', 'China (+86)'], { values: ['+86'] }), 2);
  assert.equal(JT.chooseOption(['中国大陆', '中国香港'], { values: ['中国'] }), 0);
  assert.equal(JT.chooseOption(['一般', '良好', '精通'], { values: ['精通', 'Fluent'] }), 2);
  assert.equal(JT.chooseOption(['A', 'B'], { values: ['C'] }), -1);
});
