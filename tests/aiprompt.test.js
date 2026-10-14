import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumeForAI, systemPrompt, diagnosePrompt, chatMessages } from '../shared/aiprompt.js';

const profile = {
  basic: {
    name: { zh: '张三', en: 'San Zhang' }, phone: '13800000000', email: 'san@example.com', wechat: 'san_wx',
    birthDate: '2001-05-20', ethnicity: '汉族', politicalStatus: '共青团员', hometown: { zh: '江苏南京', en: 'Nanjing' },
    currentCity: { zh: '杭州', en: 'Hangzhou' },
  },
  intent: { positions: { zh: '市场管培生', en: 'Marketing MT' }, cities: { zh: '上海', en: 'Shanghai' }, salary: '面议' },
  education: [{ id: 'edu_1', school: { zh: '示例大学', en: 'Example University' }, major: { zh: '市场营销', en: 'Marketing' }, degree: { zh: '硕士', en: 'M.S.' }, start: '2025-09', end: '2027-06', gpa: '3.9' }],
  work: [{ id: 'work_1', company: { zh: '示例咨询', en: 'Example Consulting' }, title: { zh: '战略实习生', en: 'Strategy Intern' }, start: '2026-05', end: '2026-08', description: { zh: '• 完成 20 场用户访谈', en: '• Ran 20 interviews' } }],
  projects: [], activities: [], languages: [], skills: { zh: 'Python、SQL', en: 'Python, SQL' },
  selfIntro: { zh: '市场方向', en: 'Marketing' },
};

test('发给模型的档案不含任何联系方式和证件信息', () => {
  const s = JSON.stringify(resumeForAI(profile));
  for (const leak of ['13800000000', 'san@example.com', 'san_wx', '2001-05-20', '汉族', '共青团员', '江苏南京']) {
    assert.equal(s.includes(leak), false, `不该发出去：${leak}`);
  }
  for (const keep of ['示例大学', '示例咨询', '战略实习生', '完成 20 场用户访谈', 'Python']) {
    assert.ok(s.includes(keep), `应该带上：${keep}`);
  }
});

test('系统提示带上防编造约束和禁止清单', () => {
  const p = systemPrompt({ forbidden: ['不许写 ROI 提升 8%'] });
  assert.match(p, /不得新增/);
  assert.match(p, /数字/);
  assert.match(p, /不许写 ROI 提升 8%/);
});

test('JD 过长会截断', () => {
  const jd = 'A'.repeat(9000);
  const p = diagnosePrompt({ jd, profile, position: '市场管培生' });
  assert.equal(p.includes('A'.repeat(8001)), false, 'JD 超过 8000 字的部分应该被切掉');
  assert.match(p, /已截断/);
  assert.match(p, /市场管培生/);
});

test('对话只带最近若干轮', () => {
  const history = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `第${i}条` }));
  const msgs = chatMessages({ history, diagnosisSummary: '总体匹配', jd: 'JD 正文', profile, message: '再短一点' });
  assert.ok(msgs.length <= 16, `带的消息太多：${msgs.length}`);
  assert.ok(msgs.length < history.length, '不该把整段历史都发出去');
  assert.equal(msgs[msgs.length - 1].content, '再短一点');
  assert.match(msgs[0].content, /JD 正文/);
});
