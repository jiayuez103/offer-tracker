import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInvite, zhNumber, guessType, guessDuration, pickLink } from '../shared/invite.js';
import { DEFAULT_SETTINGS } from '../shared/constants.js';

// 洛杉矶 2026-10-12 02:42（周一），北京 10/12 17:42
const RECEIVED = '2026-10-12T02:42:00-07:00';
const parse = (text, received = RECEIVED, companies = []) => parseInvite(text, {
  receivedAt: new Date(received), settings: DEFAULT_SETTINGS, companies,
});
const iso = (s) => new Date(s).toISOString();

test('中文数字', () => {
  assert.equal(zhNumber('五'), 5);
  assert.equal(zhNumber('十'), 10);
  assert.equal(zhNumber('十五'), 15);
  assert.equal(zhNumber('3'), 3);
  assert.equal(zhNumber('零'), 0);
});

test('相对期限：收到后 N 天内', () => {
  const r = parse('您好！诚邀您参加管培生招聘 — AI 面试，请在收到本邮件后的5天内完成面试，逾期面试链接将自动失效。');
  assert.equal(r.deadline, iso('2026-10-17T02:42:00-07:00'));
  assert.equal(r.confident, true);
  assert.match(r.basis, /5天内/);
  assert.equal(r.windowStart, iso(RECEIVED));
});

test('相对期限：中文数字', () => {
  const r = parse('现需要您作答一份测评，请您抽出宝贵时间，在五天内完成测评。');
  assert.equal(r.deadline, iso('2026-10-17T02:42:00-07:00'));
});

test('工作日跳过周末', () => {
  // 周日收到 → 周一、周二、周三是第 1/2/3 个工作日
  const r = parse('We ask that you complete within 3 business days.', '2026-10-11T19:30:00-07:00');
  assert.equal(r.deadline, iso('2026-10-14T18:00:00-07:00'));
  assert.equal(r.confident, true);
});

test('绝对期限：中文日期按北京时间', () => {
  const r = parse('请于 2026年10月15日 24:00 前完成测评。');
  assert.equal(r.deadline, iso('2026-10-15T23:59:00+08:00'));
});

test('相对和绝对同时出现时取更早的', () => {
  const r = parse('请在收到邮件后的5天内完成，且不晚于 10月13日 23:59。');
  assert.equal(r.deadline, iso('2026-10-13T23:59:00+08:00'));
});

test('认不出期限就留空，不猜', () => {
  const r = parse('您好，请完成我们的在线测评，谢谢。');
  assert.equal(r.deadline, '');
  assert.equal(r.confident, false);
});

test('类型', () => {
  assert.equal(guessType('诚邀您参加 AI 面试'), 'AI面');
  assert.equal(guessType('请完成线上测评'), '测评');
  assert.equal(guessType('complete our online Pymetrics games'), '测评');
  assert.equal(guessType('请参加笔试'), '笔试');
  assert.equal(guessType('随便一封邮件'), '测评'); // 兜底
});

test('时长', () => {
  assert.equal(guessDuration('本次 AI 面试预计用时 30 分钟'), 30);
  assert.equal(guessDuration('There are 16 games in total, and should take you about 35-40 minutes'), 40);
  assert.equal(guessDuration('测试时长约为60分钟'), 60);
  assert.equal(guessDuration('大约需要 1.5 小时'), 90);
  assert.equal(guessDuration('没写时长'), 0);
});

test('链接优先取考试链接', () => {
  const text = '公司官网 https://www.example.com/about 。请点击 https://exam.example.com/ai-interview/room?paperId=1 完成。';
  assert.equal(pickLink(text), 'https://exam.example.com/ai-interview/room?paperId=1');
  assert.equal(pickLink('只有一个 https://www.example.com/x。'), 'https://www.example.com/x');
  assert.equal(pickLink('没有链接'), '');
});

test('公司名对上已有投递记录', () => {
  const companies = [{ company: '示例公司', companyEn: 'Example Foods' }, { company: '另一家' }];
  assert.equal(parse('感谢您参与示例公司2027届校园招聘项目。', RECEIVED, companies).company, '示例公司');
  assert.equal(parse('Great news from Example Foods — next step.', RECEIVED, companies).company, '示例公司');
  assert.equal(parse('一封无关的邮件', RECEIVED, companies).company, '');
});

test('完整解析一封测评邀请', () => {
  const r = parse([
    '尊敬的同学：',
    '感谢您参与示例公司2027届校园招聘项目，现进入我们的人才测评阶段。',
    '现需要您作答一份测评，测试时长约为60分钟，请您抽出宝贵时间，在五天内完成测评。',
    '请您点击下方链接后进入测评：https://exam.example.com/paper/123',
  ].join('\n'), RECEIVED, [{ company: '示例公司' }]);
  assert.equal(r.type, '测评');
  assert.equal(r.mode, 'deadline');
  assert.equal(r.durationMin, 60);
  assert.equal(r.company, '示例公司');
  assert.equal(r.link, 'https://exam.example.com/paper/123');
  assert.equal(r.deadline, iso('2026-10-17T02:42:00-07:00'));
  assert.ok(r.basis.length <= 60);
});

test('公司名带（中国）后缀时也能对上', () => {
  const companies = [{ company: '示例公司（中国）' }];
  assert.equal(parse('感谢您参与示例公司2027届校园招聘。', RECEIVED, companies).company, '示例公司（中国）');
});

test('依据片段从整句开始', () => {
  const r = parse('本次 AI 面试预计用时 30 分钟。请在收到本邮件后的5天内完成面试，逾期失效。');
  assert.ok(r.basis.startsWith('请在收到'), r.basis);
});

test('依据片段不拖着链接尾巴', () => {
  const r = parse('请在三个工作日内完成。\nhttps://assess.example.com/t/1');
  assert.equal(r.basis, '请在三个工作日内完成。');
});
