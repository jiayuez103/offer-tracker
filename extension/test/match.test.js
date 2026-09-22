import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScripts } from './load.js';

const JT = loadContentScripts(['content/lib/fields.js', 'content/lib/match.js']);
const key = (label, section = null, hints = '') => JT.findField(label, section, hints)?.field.key ?? null;

test('清洗标签：去掉括号说明、星号、冒号', () => {
  assert.equal(JT.normalize('毕业院校（请填写全称）*：'), '毕业院校');
  assert.equal(JT.normalize('  First   Name * '), 'first name');
});

test('基本信息：长关键词优先，不会把「英文名」当成「名」', () => {
  assert.equal(key('姓名'), 'name');
  assert.equal(key('英文名'), 'englishName');
  assert.equal(key('姓'), 'familyName');
  assert.equal(key('名'), 'givenName');
  assert.equal(key('手机号码'), 'phone');
  assert.equal(key('请输入您的姓名'), 'name');
  assert.equal(key('电子邮箱'), 'email');
  assert.equal(key('政治面貌'), 'political');
});

test('英文表单', () => {
  assert.equal(key('First Name'), 'givenName');
  assert.equal(key('Last Name'), 'familyName');
  assert.equal(key('Email Address'), 'email');
  assert.equal(key('Phone Number'), 'phone');
  assert.equal(key('Country Phone Code'), 'phoneCode');
  assert.equal(key('School or University'), 'edu.school');
  assert.equal(key('Field of Study'), 'edu.major');
  assert.equal(key('Job Title'), 'work.title');
});

test('通用词只在对应分节里成立', () => {
  assert.equal(key('开始时间'), null);
  assert.equal(key('开始时间', 'work'), 'work.start');
  assert.equal(key('开始时间', 'education'), 'edu.start');
  assert.equal(key('描述', 'projects'), 'proj.description');
  assert.equal(key('Role Description', 'work'), 'work.description');
  assert.equal(key('To (Actual or Expected)', 'education'), 'edu.end');
  assert.equal(key('城市', 'basic'), 'currentCity');
  assert.equal(key('岗位', 'work'), 'work.title');
});

test('不需要分节也能确定的字段', () => {
  assert.equal(key('学校名称'), 'edu.school');
  assert.equal(key('入学时间'), 'edu.start');
  assert.equal(key('工作内容'), 'work.description');
  assert.equal(key('项目名称'), 'proj.name');
  assert.equal(key('自我评价'), 'selfIntro');
});

test('没有标签时用 name / id 提示，置信度低', () => {
  const m = JT.findField('', null, 'legalNameSection_firstName');
  assert.equal(m.field.key, 'givenName');
  assert.equal(m.confidence, 'low');
  assert.equal(JT.findField('学校名称', null, '').confidence, 'high');
});

test('自定义字段', () => {
  const extras = [{ key: 'extra.x', source: { extra: 'x' }, labels: ['是否有海外经历'] }];
  assert.equal(JT.findField('是否有海外经历', null, '', extras).field.key, 'extra.x');
});

test('分节识别', () => {
  assert.equal(JT.matchSection('教育经历（最高学历起）'), 'education');
  assert.equal(JT.matchSection('实习经历 1'), 'work');
  assert.equal(JT.matchSection('Work Experience'), 'work');
  assert.equal(JT.matchSection('My Information'), 'basic');
  assert.equal(JT.matchSection('这是一段很长的说明文字，不应该被当成分节标题，因为它实在太长了，超过了四十个字的限制'), null);
});

test('语言判断与取值', () => {
  assert.equal(JT.labelLang('学校', 'en'), 'zh');
  assert.equal(JT.labelLang('School', 'zh'), 'en');
  assert.equal(JT.labelLang('', 'en'), 'en');
  assert.equal(JT.pickLang({ zh: '上海', en: '' }, 'en'), '上海');
  assert.equal(JT.pickLang('上海', 'zh'), '上海');
  assert.equal(JT.pickLang({ zh: '上海', en: 'Shanghai' }, 'en'), 'Shanghai');
});
