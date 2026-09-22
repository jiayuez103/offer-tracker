# 秋招 Tracker M2（Chrome 插件）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出配合本地 Tracker 的 Chrome 插件「秋招助手」：网申页一键填写、点选填充、把简历放进上传框、从招聘页一键记录投递。

**Architecture:** MV3 插件，点图标或按快捷键时，后台用 `chrome.scripting.executeScript` 把内容脚本按需注入当前页的所有 frame。每个 frame 里的 `agent.js` 负责识别和填写自己的表单；顶层 frame 显示侧边栏（closed shadow root）。侧边栏只和后台通信，后台再去请求本地 Tracker 的 API。字段识别和填写规则都放在 `content/lib/`，写成普通脚本，Node 测试时用 `vm` 加载。

**Tech Stack:** Chrome Extension Manifest V3，原生 JS，零依赖；`node --test`；测试页由一个只绑定 127.0.0.1 的小静态服务提供，在内置浏览器里运行。

**Spec:** `docs/superpowers/specs/2026-09-20-job-tracker-design.md` §7

**约定**（和 M1 相同）

- info string 带 `file=路径` 的代码块 = 该文件的完整内容；修改已有文件时给出「原文 / 改为」两段，原文必须在文件里唯一
- 命令在 `job-tracker/` 下运行；代码和测试数据里不出现任何真实个人信息

**相对 spec §7 的实现调整**

1. 点选填充不再实时上报焦点：侧边栏按钮在 `mousedown` 时阻止默认行为，网页输入框就不会失焦；点击时后台把文字交给「当前拥有焦点的 frame」
2. 后台在每次操作前重新注入（可重复注入），覆盖页面后来加载的 iframe，并用 `executeScript` 的返回值直接收集各 frame 的结果
3. JD 字段拆解复用服务端的 `shared/jdparse.js`：新增 `POST /api/parse-jd`，插件里不复制共享代码
4. 不做单独的设置页：Tracker 地址在侧边栏底部修改
5. 后台消息处理写成 `bg/handlers.js`，`chrome` 和 `fetch` 通过参数传入，便于用假对象测试

---

## 文件结构

```
job-tracker/
├── server/app.js                     # T1 改：新增 POST /api/parse-jd
├── tests/server.test.js              # T1 改：parse-jd 测试
├── package.json                      # T2 改：测试范围加上 extension/test
├── web/js/views/settings.js          # T11 改：插件安装说明
└── extension/
    ├── manifest.json                 # T9
    ├── background.js                 # T9  事件接线：图标、快捷键、消息
    ├── bg/logic.js                   # T6  纯函数：汇总结果、挑简历文件、查重、base64
    ├── bg/handlers.js                # T7  消息处理（chrome、fetch 由参数传入）
    ├── content/lib/fields.js         # T2  字段字典、分节字典、选项分组
    ├── content/lib/match.js          # T2  标签清洗、语言判断、字段匹配；从 DOM 取标签和分节
    ├── content/lib/clip.js           # T3  收藏岗位：拆标题、猜公司；取页面信息和正文
    ├── content/lib/fill.js           # T4  日期格式、选项匹配；找控件、写值、自定义下拉、高亮
    ├── content/agent.js              # T5  每个 frame 的执行者
    ├── content/panel.js              # T8  侧边栏
    ├── icons/icon{16,32,48,128}.png  # T9  由脚本生成
    ├── scripts/make-icons.mjs        # T9
    └── test/
        ├── load.js                   # T2  用 vm 加载内容脚本
        ├── match.test.js             # T2
        ├── clip.test.js              # T3
        ├── fill.test.js              # T4
        ├── logic.test.js             # T6
        ├── handlers.test.js          # T7
        ├── serve.mjs                 # T10 测试页静态服务（只提供 extension/ 和 shared/）
        ├── fixture-data.js           # T10 测试用的假档案
        ├── harness.js                # T10 在普通网页里模拟后台和 chrome.runtime
        └── pages/                    # T10 index / plain / antd / element / workday / iframe / job
```

---

### Task 1: 服务端新增 JD 拆解接口

**Files:**
- Modify: `server/app.js`
- Modify: `tests/server.test.js`

- [ ] **Step 1: 写失败的测试（追加到 `tests/server.test.js` 末尾）**

```js
test('解析 JD：复用 shared/jdparse.js', async () => {
  const res = await fetch(`${base}/api/parse-jd`, json('POST', { text: '岗位：品牌管培生\n工作地点：上海', url: 'https://www.pgcareers.com/job/1' }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { company: '宝洁', companyType: '外企', position: '品牌管培生', cities: '上海', deadline: '' });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL，新测试返回 404「接口不存在」

- [ ] **Step 3: 实现（`server/app.js` 两处修改）**

原文：
```js
import { buildCalendar } from '../shared/ics.js';
```
改为：
```js
import { buildCalendar } from '../shared/ics.js';
import { parseJD } from '../shared/jdparse.js';
```

原文：
```js
    if (a === 'version' && m === 'GET' && !b) return send(200, { version: store.version() });
```
改为：
```js
    if (a === 'version' && m === 'GET' && !b) return send(200, { version: store.version() });
    if (a === 'parse-jd' && m === 'POST' && !b) {
      const { text = '', url = '' } = await readJson(req);
      return send(200, parseJD(String(text), String(url), now()));
    }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，61 个测试全部通过

- [ ] **Step 5: Commit**

```bash
git add server/app.js tests/server.test.js
git commit -m "feat: POST /api/parse-jd for the extension"
```

---

### Task 2: 字段字典与匹配规则

识别规则：先取控件的标签文字和所在分节（教育 / 实习…），再在字典里打分。完全相同 100 分以上，包含 50 分以上，关键词越长分越高（所以「英文名」会压过「名」）；在对应分节里另加 20 分；只在分节里才成立的通用词（「开始时间」「描述」）没有分节时不匹配，留给点选。

**Files:**
- Create: `extension/content/lib/fields.js`
- Create: `extension/content/lib/match.js`
- Create: `extension/test/load.js`
- Test: `extension/test/match.test.js`
- Modify: `package.json`

- [ ] **Step 1: 测试工具**

```js file=extension/test/load.js
// 在干净的 vm 上下文里依次运行内容脚本（它们是普通脚本，把东西挂在 globalThis.JT 上）
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadContentScripts(files) {
  const context = vm.createContext({ console });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
  return context.JT;
}

/** vm 里创建的对象来自另一个 realm，比较前先转成普通 JSON */
export const plain = (x) => JSON.parse(JSON.stringify(x));
```

- [ ] **Step 2: 写失败的测试**

```js file=extension/test/match.test.js
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
```

- [ ] **Step 3: 运行测试，确认失败**

先把 `package.json` 的测试范围扩大：

原文：
```json
    "test": "node --test \"tests/*.test.js\""
```
改为：
```json
    "test": "node --test \"tests/*.test.js\" \"extension/test/*.test.js\""
```

Run: `npm test`
Expected: FAIL，找不到 `content/lib/fields.js`

- [ ] **Step 4: 字段字典**

```js file=extension/content/lib/fields.js
// 网申表单字段字典：表单上的标签文字 → 档案里的哪个值。
// labels：单独出现就能确定；contextLabels：只在 scope 对应的分节里才算数。
// groups：选择类字段的选项分组，越具体的排越前（「预备党员」要在「党员」前面）。
(() => {
  const JT = (globalThis.JT = globalThis.JT || {});

  const GENDER = [
    { key: 'female', words: ['女', '女性', 'female', 'woman', 'f'] },
    { key: 'male', words: ['男', '男性', 'male', 'man', 'm'] },
  ];
  const DEGREE = [
    { key: 'phd', words: ['博士', 'phd', 'doctor', 'doctorate', 'doctoral'] },
    { key: 'master', words: ['硕士', '研究生', 'master', 'masters', "master's", 'ms', 'msc', 'ma', 'mba', 'mphil', 'meng', 'postgraduate', 'graduate'] },
    { key: 'bachelor', words: ['本科', '学士', 'bachelor', 'bachelors', "bachelor's", 'bs', 'bsc', 'ba', 'undergraduate'] },
    { key: 'associate', words: ['大专', '专科', '高职', 'associate', 'diploma'] },
  ];
  const POLITICAL = [
    { key: 'probationary', words: ['预备党员'] },
    { key: 'party', words: ['中共党员', '党员'] },
    { key: 'league', words: ['共青团员', '团员'] },
    { key: 'democratic', words: ['民主党派'] },
    { key: 'masses', words: ['群众', '无党派'] },
  ];
  const YES_NO = [
    { key: 'no', words: ['否', '不接受', '不服从', '不愿意', 'no'] },
    { key: 'yes', words: ['是', '接受', '服从', '愿意', 'yes'] },
  ];
  const WORK_TYPE = [
    { key: 'intern', words: ['实习', 'internship', 'intern'] },
    { key: 'full', words: ['全职', 'full time'] },
    { key: 'part', words: ['兼职', 'part time'] },
  ];

  const START = ['开始时间', '开始日期', '起始时间', '起始日期', '开始年月', 'start date', 'start', 'from'];
  const END = ['结束时间', '结束日期', '结束年月', 'end date', 'end', 'to'];
  const RANGE = ['起止时间', '起止日期', '时间段', '时间', '日期', 'dates', 'duration', 'period', 'time period'];
  const DESC = ['描述', '内容', '说明', '介绍', '经历描述', '详细描述', 'description', 'details', 'responsibilities'];
  const NAME = ['名称', 'name', 'title'];
  const ROLE = ['角色', '职务', '职位', '担任', 'role', 'position', 'title'];

  const f = (key, source, labels, extra = {}) => ({
    key,
    source,
    labels,
    kind: 'text',
    contextLabels: [],
    scope: typeof source === 'object' ? source.list : null,
    ...extra,
  });
  const L = (list, field) => ({ list, field });

  JT.FIELDS = [
    // 基本信息
    f('name', 'basic.name', ['姓名', '名字', '真实姓名', '中文姓名', '中文名', '你的姓名', '您的姓名', 'name', 'full name', 'legal name', 'your name']),
    f('familyName', 'basic.familyName', ['姓', '姓氏', 'last name', 'family name', 'surname']),
    f('givenName', 'basic.givenName', ['名', 'first name', 'given name']),
    f('englishName', 'basic.preferredName', ['英文名', '英文名字', '英文姓名', 'english name', 'preferred name', 'nickname']),
    f('gender', 'basic.gender', ['性别', 'gender', 'sex'], { kind: 'choice', groups: GENDER }),
    f('birthDate', 'basic.birthDate', ['出生日期', '出生年月', '生日', 'date of birth', 'birth date', 'birthday'], { kind: 'date' }),
    f('phoneCode', 'basic.phoneCountryCode', ['区号', '国家区号', '国际区号', '手机区号', 'country code', 'phone code', 'country phone code', 'dialing code'], { kind: 'choice' }),
    f('phone', 'basic.phone', ['手机', '手机号', '手机号码', '联系电话', '电话', '电话号码', '移动电话', 'mobile', 'phone', 'phone number', 'mobile number', 'mobile phone', 'cell phone', 'telephone']),
    f('email', 'basic.email', ['邮箱', '电子邮箱', '邮箱地址', '邮件', '电子邮件', 'email', 'e-mail', 'email address']),
    f('wechat', 'basic.wechat', ['微信', '微信号', 'wechat', 'wechat id']),
    f('currentCity', 'basic.currentCity', ['现居住地', '现居住城市', '现居城市', '现居地', '居住地', '居住城市', '所在城市', '当前城市', '当前所在地', 'current city', 'current location', 'city of residence'], { scope: 'basic', contextLabels: ['城市', '所在地', 'city', 'location'] }),
    f('hometown', 'basic.hometown', ['籍贯', 'native place', 'hometown']),
    f('residence', 'basic.residence', ['户口所在地', '户籍所在地', '户籍', '户口', '生源地', 'hukou', 'household registration']),
    f('nationality', 'basic.nationality', ['国籍', 'nationality', 'citizenship'], { kind: 'choice' }),
    f('political', 'basic.politicalStatus', ['政治面貌', 'political status'], { kind: 'choice', groups: POLITICAL }),
    f('ethnicity', 'basic.ethnicity', ['民族', 'ethnicity'], { kind: 'choice' }),
    f('linkedin', 'basic.linkedin', ['linkedin', 'linkedin profile', '领英']),
    f('website', 'basic.website', ['个人网站', '个人主页', '作品集链接', 'website', 'personal website', 'portfolio']),
    // 求职意向
    f('intentPosition', 'intent.positions', ['意向岗位', '意向职位', '期望职位', '期望岗位', '求职意向', 'desired position']),
    f('intentCity', 'intent.cities', ['意向城市', '期望城市', '期望工作地点', '意向工作地点', '意向工作城市', 'preferred location', 'preferred city', 'preferred work location']),
    f('salary', 'intent.salary', ['期望薪资', '期望月薪', '期望薪酬', '期望年薪', 'expected salary', 'salary expectation']),
    f('available', 'intent.availableFrom', ['到岗时间', '最早到岗时间', '可到岗时间', '可入职时间', '最早入职时间', 'available start date', 'availability', 'earliest start date']),
    f('adjust', 'intent.acceptAdjustment', ['是否接受调剂', '是否服从调剂', '接受调剂', '服从调剂'], { kind: 'choice', groups: YES_NO }),
    // 教育经历
    f('edu.school', L('education', 'school'), ['学校', '学校名称', '毕业院校', '毕业学校', '院校', '院校名称', '就读院校', '就读学校', 'school', 'school name', 'university', 'school or university', 'college or university', 'institution']),
    f('edu.degree', L('education', 'degree'), ['学历', '学位', '学历层次', '最高学历', '学历学位', 'degree', 'degree type', 'education level', 'level of education'], { kind: 'choice', groups: DEGREE }),
    f('edu.major', L('education', 'major'), ['专业', '专业名称', '所学专业', '主修专业', 'major', 'field of study', 'discipline', 'area of study']),
    f('edu.college', L('education', 'college'), ['学院', '所在学院', '院系', '所在院系'], { contextLabels: ['department', 'faculty', '系'] }),
    f('edu.gpa', L('education', 'gpa'), ['gpa', '绩点', '平均绩点', '平均学分绩点', 'grade point average', 'cumulative gpa'], { contextLabels: ['成绩'] }),
    f('edu.gpaScale', L('education', 'gpaScale'), ['满分', 'gpa满分', '绩点满分', 'gpa scale', 'out of']),
    f('edu.rank', L('education', 'rank'), ['专业排名', '成绩排名', '年级排名', 'class rank'], { contextLabels: ['排名', 'rank', 'ranking'] }),
    f('edu.courses', L('education', 'courses'), ['主修课程', '主要课程', '相关课程', 'relevant coursework', 'coursework', 'courses']),
    f('edu.honors', L('education', 'honors'), ['在校荣誉', '在校获奖'], { contextLabels: ['荣誉', '获奖', 'honors'] }),
    f('edu.city', L('education', 'city'), ['学校所在地', '学校所在城市'], { contextLabels: ['城市', '所在城市', '所在地', 'city', 'location'] }),
    f('edu.start', L('education', 'start'), ['入学时间', '入学日期', '入学年月'], { kind: 'month', contextLabels: START }),
    f('edu.end', L('education', 'end'), ['毕业时间', '毕业日期', '毕业年月', '预计毕业时间', 'graduation date', 'expected graduation'], { kind: 'month', contextLabels: END }),
    f('edu.range', L('education', 'range'), ['在校时间', '就读时间', '在读时间'], { kind: 'range', contextLabels: RANGE }),
    // 实习 / 工作
    f('work.company', L('work', 'company'), ['公司', '公司名称', '实习单位', '实习公司', '工作单位', '单位名称', '企业名称', 'company', 'company name', 'employer', 'organization name']),
    f('work.title', L('work', 'title'), ['职位名称', '实习岗位', '实习职位', '担任职位', '岗位名称', 'job title'], { contextLabels: [...ROLE, '岗位'] }),
    f('work.department', L('work', 'department'), ['所在部门', '部门名称'], { contextLabels: ['部门', 'department', 'team'] }),
    f('work.type', L('work', 'type'), ['工作类型', '经历类型', '工作性质'], { kind: 'choice', groups: WORK_TYPE }),
    f('work.city', L('work', 'city'), ['工作城市', '工作地点', '实习城市', '实习地点'], { contextLabels: ['城市', '所在城市', '地点', '所在地', 'city', 'location'] }),
    f('work.start', L('work', 'start'), ['入职时间', '入职日期', '实习开始时间'], { kind: 'month', contextLabels: START }),
    f('work.end', L('work', 'end'), ['离职时间', '离职日期', '实习结束时间'], { kind: 'month', contextLabels: END }),
    f('work.range', L('work', 'range'), ['实习时间', '工作时间', '任职时间'], { kind: 'range', contextLabels: RANGE }),
    f('work.description', L('work', 'description'), ['工作内容', '工作描述', '实习内容', '实习描述', '工作职责', '主要职责', '职责描述', 'job description', 'work description'], { contextLabels: DESC }),
    // 项目
    f('proj.name', L('projects', 'name'), ['项目名称', '项目名', 'project name', 'project title'], { contextLabels: NAME }),
    f('proj.role', L('projects', 'role'), ['项目角色', '担任角色', '项目职务', 'project role'], { contextLabels: ROLE }),
    f('proj.start', L('projects', 'start'), [], { kind: 'month', contextLabels: START }),
    f('proj.end', L('projects', 'end'), [], { kind: 'month', contextLabels: END }),
    f('proj.range', L('projects', 'range'), ['项目时间', '项目周期'], { kind: 'range', contextLabels: RANGE }),
    f('proj.description', L('projects', 'description'), ['项目描述', '项目内容', '项目介绍', 'project description'], { contextLabels: DESC }),
    // 校园 / 社团
    f('act.org', L('activities', 'org'), ['组织名称', '社团名称', '学生组织', 'organization', 'club'], { contextLabels: [...NAME, '组织', '社团'] }),
    f('act.role', L('activities', 'role'), ['担任职务', '社团职务'], { contextLabels: ROLE }),
    f('act.start', L('activities', 'start'), [], { kind: 'month', contextLabels: START }),
    f('act.end', L('activities', 'end'), [], { kind: 'month', contextLabels: END }),
    f('act.range', L('activities', 'range'), ['活动时间'], { kind: 'range', contextLabels: RANGE }),
    f('act.description', L('activities', 'description'), ['经历描述', '活动描述', '活动内容'], { contextLabels: DESC }),
    // 获奖
    f('award.name', L('awards', 'name'), ['奖项名称', '获奖名称', '荣誉名称', '奖项', 'award name', 'award', 'honor'], { contextLabels: NAME }),
    f('award.date', L('awards', 'date'), ['获奖时间', '获奖日期', '获得时间'], { kind: 'month', contextLabels: ['时间', '日期', 'date'] }),
    f('award.description', L('awards', 'description'), ['获奖描述', '奖项描述', '获奖说明'], { contextLabels: DESC }),
    // 语言
    f('lang.language', L('languages', 'language'), ['语种', '语言种类', '外语语种', 'language'], { kind: 'choice' }),
    f('lang.level', L('languages', 'level'), ['熟练程度', '掌握程度', '语言水平', '外语水平', 'proficiency', 'language proficiency'], { kind: 'choice', contextLabels: ['水平', '程度', 'level'] }),
    f('lang.certificate', L('languages', 'certificate'), ['语言证书', '外语证书', '考试类型', '证书类型'], { contextLabels: ['证书', 'certificate'] }),
    f('lang.score', L('languages', 'score'), ['考试成绩', '语言成绩'], { contextLabels: ['成绩', '分数', 'score'] }),
    // 证书
    f('cert.name', L('certificates', 'name'), ['证书名称', '资格证书名称', 'certificate name', 'certification'], { contextLabels: NAME }),
    f('cert.date', L('certificates', 'date'), ['获证时间', '发证日期', '获得证书时间'], { kind: 'month', contextLabels: ['时间', '日期', 'date'] }),
    f('cert.score', L('certificates', 'score'), [], { contextLabels: ['成绩', '等级', '分数', 'score', 'level'] }),
    // 其他
    f('skills', 'skills', ['专业技能', '技能特长', '掌握技能', '个人技能', '技能', 'skills', 'technical skills']),
    f('selfIntro', 'selfIntro', ['自我评价', '自我介绍', '个人简介', '个人优势', '个人评价', '自我描述', 'self evaluation', 'self introduction', 'about me', 'personal statement', 'summary']),
    f('hobbies', 'hobbies', ['兴趣爱好', '爱好', '兴趣', '特长', 'hobbies', 'interests']),
  ];

  JT.SECTIONS = [
    { key: 'education', words: ['教育经历', '教育背景', '学历信息', '教育信息', '学习经历', '教育', 'education', 'academic background'] },
    { key: 'work', words: ['实习经历', '工作经历', '实习经验', '工作经验', '实践经历', '职业经历', '实习', 'work experience', 'employment', 'internship', 'internships', 'experience', 'professional experience'] },
    { key: 'projects', words: ['项目经历', '项目经验', '科研经历', '项目', 'project', 'projects', 'research'] },
    { key: 'activities', words: ['校园经历', '社团经历', '学生工作', '在校经历', '社会实践', '课外活动', '社团', 'activities', 'extracurricular', 'leadership', 'campus'] },
    { key: 'awards', words: ['获奖经历', '获奖情况', '荣誉奖励', '奖项', '获奖', '荣誉', 'award', 'awards', 'honors'] },
    { key: 'languages', words: ['语言能力', '外语能力', '语言', 'language', 'languages'] },
    { key: 'certificates', words: ['证书', '资格证书', '技能证书', 'certificate', 'certificates', 'certifications', 'licenses'] },
    { key: 'basic', words: ['基本信息', '个人信息', '联系方式', 'personal information', 'basic information', 'contact information', 'personal details', 'my information'] },
    { key: 'intent', words: ['求职意向', '应聘意向', '意向信息', 'job preference', 'preferences'] },
  ];
})();
```

- [ ] **Step 5: 匹配规则**

```js file=extension/content/lib/match.js
// 标签清洗、语言判断、字段匹配（纯函数），以及从 DOM 里取标签、分节、提示词。
(() => {
  const JT = (globalThis.JT = globalThis.JT || {});
  const CJK = /[㐀-鿿]/;

  JT.FORM_ITEM_SELECTOR = [
    '.ant-form-item', '.el-form-item', '.ivu-form-item', '.arco-form-item', '.n-form-item',
    '.form-item', '.form-group', '[class*="form-item"]', '[class*="formItem"]', '[class*="FormItem"]',
    '[data-automation-id^="formField"]',
  ].join(', ');
  const LABEL_SELECTOR = [
    '.ant-form-item-label', '.el-form-item__label', '.ivu-form-item-label', '.arco-form-label-item', '.n-form-item-label',
    'label', 'legend', '[class*="label"]', '[class*="Label"]',
  ].join(', ');
  const HEADING_SELECTOR = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'legend', '[role="heading"]',
    '[class*="title"]', '[class*="Title"]', '[class*="header"]', '[class*="Header"]', '[data-automation-id*="Header"]',
  ].join(', ');

  JT.hasCJK = (s) => CJK.test(s || '');

  /** 标签清洗：去掉括号里的说明、星号、冒号，合并空白，英文转小写 */
  JT.normalize = (s) => String(s || '')
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/[*＊:：?？!！]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  /** 选项和值的比较：保留括号里的内容（「China (+86)」），去掉点号（M.S. → ms） */
  JT.normalizeChoice = (s) => String(s || '').replace(/[()（）[\]【】]/g, ' ').replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();

  JT.tokens = (s) => String(s || '').split(/[^a-z0-9'+㐀-鿿]+/).filter(Boolean);

  const phraseIn = (tokens, phrase) => phrase.length > 0
    && tokens.some((_, i) => phrase.every((p, j) => tokens[i + j] === p));
  JT.phraseIn = phraseIn;

  /** 关键词在（已清洗的）标签里的得分：完全相同 100+，包含 50+，否则 0；关键词越长分越高 */
  JT.keywordScore = (label, kw) => {
    const k = JT.normalize(kw);
    if (!label || !k) return 0;
    if (label === k) return 100 + k.length;
    if (JT.hasCJK(k)) {
      if (k.length < 2 || !label.includes(k)) return 0;
      return label.length <= k.length + 8 ? 50 + k.length : 0;
    }
    const lt = JT.tokens(label);
    const kt = JT.tokens(k);
    if (lt.length > kt.length + 5) return 0;
    return phraseIn(lt, kt) ? 50 + k.length : 0;
  };

  const best = (label, words) => words.reduce((m, w) => Math.max(m, JT.keywordScore(label, w)), 0);

  /** name / id / data-automation-id 的最后一段，驼峰拆词：legalNameSection_firstName → "first name" */
  JT.hintWords = (hints) => {
    const last = String(hints || '').split(/[\s_\-.[\]/]+/).filter(Boolean).pop() || '';
    return last.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  };

  /**
   * 找字段：返回 { field, score, confidence } 或 null
   * section：控件所在分节（education / work / … / basic），extras：档案里的自定义字段
   */
  JT.findField = (rawLabel, section, hints = '', extras = []) => {
    const label = JT.normalize(rawLabel);
    const all = [...JT.FIELDS, ...extras];
    let top = null;
    if (label) {
      for (const field of all) {
        let score = best(label, field.labels);
        if (field.scope && section === field.scope) {
          score = Math.max(score, best(label, field.contextLabels || []));
          if (score) score += 20;
        } else if (field.scope && section && section !== field.scope && typeof field.source === 'object') {
          score -= 30; // 在别的分节里：降权但不排除，防止分节认错
        }
        if (score >= 50 && score > (top?.score ?? 0)) top = { field, score, confidence: score >= 100 ? 'high' : 'medium' };
      }
    }
    if (top) return top;
    const hint = JT.hintWords(hints);
    if (!hint) return null;
    for (const field of all) {
      const score = best(hint, field.labels.filter((w) => !JT.hasCJK(w)));
      if (score >= 50 && score > (top?.score ?? 0)) top = { field, score, confidence: 'low' };
    }
    return top;
  };

  JT.matchSection = (text) => {
    const t = JT.normalize(text);
    if (!t || t.length > 40) return null;
    let hit = null;
    for (const s of JT.SECTIONS) {
      const score = best(t, s.words);
      if (score && (!hit || score > hit.score)) hit = { key: s.key, score };
    }
    return hit ? hit.key : null;
  };

  /** 标签有中文用中文值，纯英文用英文值，都没有就看页面语言 */
  JT.labelLang = (label, pageLang = 'zh') => {
    if (JT.hasCJK(label)) return 'zh';
    if (/[a-z]/i.test(label || '')) return 'en';
    return pageLang;
  };

  JT.asBi = (v) => (v && typeof v === 'object'
    ? { zh: v.zh || '', en: v.en || '' }
    : { zh: typeof v === 'string' ? v : '', en: '' });

  /** 取指定语言的值，缺了就退回另一种 */
  JT.pickLang = (v, lang) => {
    const bi = JT.asBi(v);
    return bi[lang] || bi[lang === 'zh' ? 'en' : 'zh'] || '';
  };

  // ---------- DOM ----------
  const textOf = (node) => (node ? (node.innerText ?? node.textContent ?? '') : '').replace(/\s+/g, ' ').trim();
  JT.textOf = textOf;

  /** 从近到远最多 3 层表单项容器（Ant 的 .ant-form-item-control 类名里也带 form-item，要继续往外找） */
  const formItems = (el) => {
    const out = [];
    let item = el.closest(JT.FORM_ITEM_SELECTOR);
    while (item && out.length < 3) {
      out.push(item);
      item = item.parentElement ? item.parentElement.closest(JT.FORM_ITEM_SELECTOR) : null;
    }
    return out;
  };

  /** label 自己的文字：去掉里面的输入框、下拉框（否则会把所有选项文字也算进来） */
  const ownText = (label) => {
    if (!label) return '';
    const copy = label.cloneNode(true);
    copy.querySelectorAll('input, select, textarea, button').forEach((n) => n.remove());
    return (copy.textContent || '').replace(/\s+/g, ' ').trim();
  };

  JT.pageLang = (doc = document) => {
    const sample = (doc.body?.innerText || '').slice(0, 4000);
    const cjk = (sample.match(/[㐀-鿿]/g) || []).length;
    if (cjk > 50) return 'zh';
    const lang = (doc.documentElement.getAttribute('lang') || '').toLowerCase();
    if (lang.startsWith('zh')) return 'zh';
    return cjk > 10 ? 'zh' : 'en';
  };

  /** 控件的标签文字：aria → label[for] → 外层 label → UI 库表单项标签 → aria-label → 前面的文字 → placeholder */
  JT.labelOf = (el) => {
    const doc = el.ownerDocument;
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map((id) => textOf(doc.getElementById(id))).join(' ').trim();
      if (t) return t;
    }
    if (el.id) {
      const l = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (ownText(l)) return ownText(l);
    }
    const wrap = el.closest('label');
    if (wrap && ownText(wrap)) return ownText(wrap);
    for (const item of formItems(el)) {
      const lab = [...item.querySelectorAll(LABEL_SELECTOR)].find((n) => !n.contains(el) && ownText(n));
      if (lab && ownText(lab).length <= 60) return ownText(lab);
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    // 前面的文字只在它本身不含输入控件时才算标签，避免拿到上一个字段整块的文字
    const pureText = (node) => (node && !node.querySelector('input, select, textarea') ? textOf(node) : '');
    let prev = el.previousElementSibling;
    for (let i = 0; prev && i < 3; i += 1, prev = prev.previousElementSibling) {
      const t = pureText(prev);
      if (t && t.length <= 40) return t;
    }
    const cell = el.closest('td');
    const cellLabel = cell ? pureText(cell.previousElementSibling) : '';
    if (cellLabel && cellLabel.length <= 40) return cellLabel;
    const parentPrev = pureText(el.parentElement && el.parentElement.previousElementSibling);
    if (parentPrev && parentPrev.length <= 40) return parentPrev;
    return el.getAttribute('placeholder') || el.getAttribute('title') || '';
  };

  /** 单选组的整体标签（不是某个选项的文字） */
  JT.groupContainer = (radio) => radio.closest('[role="radiogroup"], .ant-radio-group, .el-radio-group, .ivu-radio-group, fieldset')
    || radio.closest('label')?.parentElement
    || radio.parentElement;

  JT.groupLabelOf = (radio) => {
    for (const item of formItems(radio)) {
      const lab = [...item.querySelectorAll(LABEL_SELECTOR)].find((n) => !n.querySelector('input[type="radio"]') && !n.closest('.ant-radio-wrapper, .el-radio') && ownText(n));
      if (lab) return ownText(lab);
    }
    const box = JT.groupContainer(radio);
    const legend = box.querySelector?.('legend');
    if (legend) return textOf(legend);
    let text = textOf(box);
    for (const r of box.querySelectorAll('input[type="radio"]')) {
      const option = textOf(r.closest('label')) || textOf(r.nextElementSibling);
      if (option) text = text.replace(option, ' ');
    }
    text = text.replace(/\s+/g, ' ').trim();
    return text.length <= 30 ? text : textOf(box.previousElementSibling);
  };

  const headingOf = (node) => {
    if (node.matches?.(HEADING_SELECTOR)) {
      const t = textOf(node);
      return t.length <= 40 ? t : '';
    }
    if (textOf(node).length <= 40) {
      const h = node.querySelector?.(HEADING_SELECTOR);
      if (h) return textOf(h);
    }
    return '';
  };

  /** 往上找最近的分节标题（只看标题类元素，避免把字段标签当成分节） */
  JT.sectionOf = (el) => {
    let node = el;
    for (let depth = 0; node && node !== node.ownerDocument.body && depth < 15; depth += 1) {
      let sib = node.previousElementSibling;
      for (let hops = 0; sib && hops < 10; hops += 1, sib = sib.previousElementSibling) {
        const s = JT.matchSection(headingOf(sib));
        if (s) return s;
      }
      node = node.parentElement;
    }
    return null;
  };

  JT.hintsOf = (el) => [el.getAttribute('data-automation-id'), el.getAttribute('autocomplete'), el.name, el.id]
    .filter(Boolean)
    .join(' ');

  JT.isRequired = (el, label) => el.required
    || el.getAttribute('aria-required') === 'true'
    || /\*/.test(label || '')
    || !!el.closest('.is-required, .ant-form-item-required, .ivu-form-item-required')
    || formItems(el).some((item) => item.matches('.is-required') || !!item.querySelector('.ant-form-item-required, .is-required, .ivu-form-item-required'));
})();
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，match 的 10 个测试 + 之前 61 个全部通过

- [ ] **Step 7: Commit**

```bash
git add package.json extension/content/lib/fields.js extension/content/lib/match.js extension/test/load.js extension/test/match.test.js
git commit -m "feat(extension): field dictionary and label matching"
```

---
### Task 3: 收藏岗位的识别规则

**Files:**
- Create: `extension/content/lib/clip.js`
- Test: `extension/test/clip.test.js`

- [ ] **Step 1: 写失败的测试**

```js file=extension/test/clip.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScripts, plain } from './load.js';

const JT = loadContentScripts(['content/lib/fields.js', 'content/lib/match.js', 'content/lib/clip.js']);

test('拆标题：只在两边有空格的横线或竖线处拆，不拆 E-commerce', () => {
  assert.deepEqual(plain(JT.splitTitle('品牌管理培训生 - 示例公司校园招聘')), ['品牌管理培训生', '示例公司校园招聘']);
  assert.deepEqual(plain(JT.splitTitle('Brand Manager | Careers at Example')), ['Brand Manager', 'Careers at Example']);
  assert.deepEqual(plain(JT.splitTitle('E-commerce Manager')), ['E-commerce Manager']);
});

test('清理公司名里的招聘字样', () => {
  assert.equal(JT.cleanCompany('示例公司校园招聘'), '示例公司');
  assert.equal(JT.cleanCompany('Careers at Example'), 'Example');
  assert.equal(JT.cleanCompany('加入我们 | 示例公司'), '示例公司');
  assert.equal(JT.cleanCompany('Jobsity'), 'Jobsity');
});

test('从页面信息猜公司和岗位', () => {
  assert.deepEqual(plain(JT.guessFromPage({ title: '品牌管理培训生 - 示例公司校园招聘', h1: '品牌管理培训生', siteName: '' })), { position: '品牌管理培训生', company: '示例公司' });
  assert.deepEqual(plain(JT.guessFromPage({ title: 'Brand Manager | Example', h1: '', siteName: 'Example Inc' })), { position: 'Brand Manager', company: 'Example Inc' });
  assert.deepEqual(plain(JT.guessFromPage({ title: '示例公司', h1: '', siteName: '' })), { position: '', company: '示例公司' });
});

test('整理正文：去掉多余空行', () => {
  assert.equal(JT.tidyText('a  \n\n\n\nb\r\n'), 'a\n\nb');
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL，找不到 `content/lib/clip.js`

- [ ] **Step 3: 实现**

```js file=extension/content/lib/clip.js
// 收藏岗位：从当前页面猜公司、岗位，取 JD 正文。纯函数在上，DOM 部分在下。
(() => {
  const JT = (globalThis.JT = globalThis.JT || {});
  const SEPARATORS = /\s+[-–—_·•]\s+|\s*[|｜]\s*/;
  const NOISE_ZH = /(校园招聘|校招|社会招聘|社招|招聘官网|招聘网站|招聘|官网|加入我们)/g;
  const NOISE_EN = /\b(careers?\s+at|careers?|jobs?\s+at|jobs?|recruiting|recruitment|hiring|join us)\b/gi; // 英文按整词，不误删 Jobsity
  const EDGE = /^[\s|｜\-–—_·•:：]+|[\s|｜\-–—_·•:：]+$/g;

  JT.splitTitle = (title) => String(title || '').split(SEPARATORS).map((s) => s.trim()).filter(Boolean);

  JT.cleanCompany = (s) => String(s || '').replace(NOISE_ZH, ' ').replace(NOISE_EN, ' ').replace(EDGE, '').replace(/\s{2,}/g, ' ').trim();

  /** 岗位优先用页面主标题，其次用标题第一段；公司优先用 og:site_name，其次用标题最后一段 */
  JT.guessFromPage = ({ title = '', h1 = '', siteName = '' } = {}) => {
    const parts = JT.splitTitle(title);
    const heading = h1 && h1.length <= 40 ? h1.trim() : '';
    const position = heading || (parts.length > 1 ? parts[0] : '');
    const company = JT.cleanCompany(siteName) || JT.cleanCompany(parts.length > 1 ? parts[parts.length - 1] : parts[0] || '');
    return { position: position.slice(0, 60), company: company.slice(0, 40) };
  };

  JT.tidyText = (s) => String(s || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 30000);

  // ---------- DOM ----------
  const JOB_SELECTORS = [
    '[class*="job-detail"]', '[class*="jobDetail"]', '[class*="position-detail"]', '[class*="positionDetail"]',
    '[class*="job-description"]', '[class*="jobDescription"]', '[class*="post-detail"]', '[class*="jd-"]',
    'article', 'main', '[role="main"]',
  ];

  /** JD 正文：按选择器优先级找，同一级里取文字最多的；都没有就用整页文字 */
  JT.mainText = (doc = document) => {
    for (const sel of JOB_SELECTORS) {
      let top = null;
      for (const el of doc.querySelectorAll(sel)) {
        if (el.closest('#jt-panel-host')) continue;
        const len = (el.innerText || '').length;
        if (len > 150 && (!top || len > top.len)) top = { el, len };
      }
      if (top) return JT.tidyText(top.el.innerText);
    }
    return JT.tidyText(doc.body ? doc.body.innerText : '');
  };

  /** 页面主标题：跳过页头、导航里的 logo 文字 */
  JT.headingText = (doc = document) => {
    const el = [...doc.querySelectorAll('h1, h2')].find((h) => {
      const t = JT.textOf(h);
      return !h.closest('header, nav, footer, #jt-panel-host') && t.length >= 2 && t.length <= 40;
    });
    return el ? JT.textOf(el) : '';
  };

  JT.pageInfo = (doc = document) => {
    const meta = (p) => doc.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.getAttribute('content') || '';
    const info = {
      url: doc.location ? doc.location.href : '',
      title: doc.title || '',
      siteName: meta('og:site_name'),
      h1: JT.headingText(doc),
      text: JT.mainText(doc),
    };
    return { ...info, ...JT.guessFromPage(info) };
  };
})();
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，clip 的 4 个测试通过

- [ ] **Step 5: Commit**

```bash
git add extension/content/lib/clip.js extension/test/clip.test.js
git commit -m "feat(extension): page title and company guessing for clipping"
```

---

### Task 4: 写值规则（日期格式、选项匹配、各类控件）

**Files:**
- Create: `extension/content/lib/fill.js`
- Test: `extension/test/fill.test.js`

- [ ] **Step 1: 写失败的测试**

```js file=extension/test/fill.test.js
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL，找不到 `content/lib/fill.js`

- [ ] **Step 3: 实现**

```js file=extension/content/lib/fill.js
// 把值写进表单控件：日期格式和选项匹配（纯函数）；找控件、写值、自定义下拉、高亮（DOM）。
(() => {
  const JT = (globalThis.JT = globalThis.JT || {});
  const PANEL = '#jt-panel-host';
  const CUSTOM_SELECT = '.ant-select, .el-select, .ivu-select, .arco-select, .n-select, [role="combobox"]:not(input):not(textarea)';
  const OPTION = '.ant-select-item-option, .el-select-dropdown__item, .ivu-select-item, .arco-select-option, .n-base-select-option, [role="option"]';
  const RANGE = '.ant-picker-range, .el-range-editor, .arco-picker-range';
  const PICKER = '.ant-picker, .el-date-editor, .ivu-date-picker, .arco-picker';
  const SKIP_TYPES = new Set(['hidden', 'password', 'file', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'range', 'color']);
  const CLICK = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
  const COLORS = { filled: '#2f8a57', uncertain: '#3f7fd9', manual: '#d4a017' };

  // ---------- 纯函数 ----------

  /** 'YYYY-MM' 或 'YYYY-MM-DD' → 输入框期望的格式（看 type 和 placeholder） */
  JT.formatDate = (value, { type = 'text', placeholder = '' } = {}) => {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(value || '').trim());
    if (!m) return value || '';
    const [, y, mo, d] = m;
    if (type === 'month') return `${y}-${mo}`;
    if (type === 'date') return `${y}-${mo}-${d || '01'}`;
    const p = String(placeholder || '');
    if (/mm\s*\/\s*dd\s*\/\s*yyyy/i.test(p)) return `${mo}/${d || '01'}/${y}`;
    if (/dd\s*\/\s*mm\s*\/\s*yyyy/i.test(p)) return `${d || '01'}/${mo}/${y}`;
    if (/mm\s*\/\s*yyyy/i.test(p)) return `${mo}/${y}`;
    if (/(?:y{4}|\d{4})\s*年/i.test(p)) return d ? `${y}年${mo}月${d}日` : `${y}年${mo}月`;
    const sep = /\d{4}\s*([./-])\s*\d{1,2}/.exec(p)?.[1] || /y{4}\s*([./-])/i.exec(p)?.[1] || '-';
    return d ? [y, mo, d].join(sep) : `${y}${sep}${mo}`;
  };

  /** 文字属于哪个选项分组（中文按包含，英文按整词） */
  JT.groupOf = (groups, text) => {
    const t = JT.normalizeChoice(text);
    if (!t) return null;
    const tokens = JT.tokens(t);
    for (const g of groups) {
      for (const w of g.words) {
        const k = JT.normalizeChoice(w);
        if (JT.hasCJK(k) ? t.includes(k) : JT.phraseIn(tokens, JT.tokens(k))) return g.key;
      }
    }
    return null;
  };

  /** 在选项文字里挑最合适的一个，返回下标；找不到返回 -1 */
  JT.chooseOption = (optionTexts, { groups, values }) => {
    const wanted = (values || []).filter(Boolean);
    if (groups) {
      const target = wanted.map((v) => JT.groupOf(groups, v)).find(Boolean);
      if (target) {
        const i = optionTexts.findIndex((o) => JT.groupOf(groups, o) === target);
        if (i >= 0) return i;
      }
    }
    const opts = optionTexts.map((o) => JT.normalizeChoice(o));
    for (const v of wanted.map((x) => JT.normalizeChoice(x))) {
      if (!v) continue;
      let i = opts.findIndex((o) => o === v);
      if (i < 0) i = opts.findIndex((o) => o.includes(v));
      if (i < 0) i = opts.findIndex((o) => o.length >= 2 && v.includes(o));
      if (i >= 0) return i;
    }
    return -1;
  };

  // ---------- DOM ----------
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const inPanel = (el) => !!(el.closest && el.closest(PANEL));

  const fire = (el, types) => {
    const view = el.ownerDocument.defaultView;
    for (const type of types) {
      const Ctor = type.startsWith('pointer') && view.PointerEvent ? view.PointerEvent : view.MouseEvent;
      el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, view, button: 0 }));
    }
  };

  const fireInput = (el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  /** 原型上的 value setter：绕过 React 在实例上装的值追踪，之后的 input 事件才会被当成用户输入 */
  const setterFor = (el) => {
    const Ctor = { INPUT: HTMLInputElement, TEXTAREA: HTMLTextAreaElement, SELECT: HTMLSelectElement }[el.tagName];
    return Ctor && Object.getOwnPropertyDescriptor(Ctor.prototype, 'value').set;
  };

  JT.isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = el.ownerDocument.defaultView.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };

  /** 当前 frame 里所有可填的控件，按页面顺序排好 */
  JT.collectControls = (doc = document) => {
    const out = [];
    for (const w of doc.querySelectorAll(CUSTOM_SELECT)) {
      if (inPanel(w) || (w.parentElement && w.parentElement.closest(CUSTOM_SELECT)) || !JT.isVisible(w)) continue;
      if (w.matches('.is-disabled, .ant-select-disabled, .ivu-select-disabled, [aria-disabled="true"]')) continue;
      out.push({ kind: 'custom', el: w });
    }
    for (const range of doc.querySelectorAll(RANGE)) {
      if (inPanel(range) || !JT.isVisible(range)) continue;
      const inputs = [...range.querySelectorAll('input')];
      if (inputs.length === 2) {
        out.push({ kind: 'text', el: inputs[0], role: 'start' });
        out.push({ kind: 'text', el: inputs[1], role: 'end' });
      }
    }
    for (const el of doc.querySelectorAll('input, textarea, select, [contenteditable="true"]')) {
      if (inPanel(el) || el.closest(CUSTOM_SELECT) || el.closest(RANGE) || el.disabled) continue;
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (el.tagName === 'INPUT' && SKIP_TYPES.has(type)) continue;
      if (!JT.isVisible(el)) continue;
      let kind = 'text';
      if (el.tagName === 'SELECT') kind = 'select';
      else if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') kind = 'editable';
      out.push({ kind, el });
    }
    const groups = new Map();
    for (const r of doc.querySelectorAll('input[type="radio"]')) {
      if (inPanel(r) || r.disabled) continue;
      if (!JT.isVisible(r) && !JT.isVisible(r.closest('label') || r.parentElement)) continue;
      const key = r.name || JT.groupContainer(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    for (const radios of groups.values()) out.push({ kind: 'radio', el: radios[0], radios });
    // eslint-disable-next-line no-bitwise
    return out.sort((a, b) => (a.el === b.el ? 0 : (a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1)));
  };

  /** 控件里是不是已经有内容（默认只填空的） */
  JT.hasValue = (control) => {
    const { kind, el } = control;
    if (kind === 'radio') return control.radios.some((r) => r.checked);
    if (kind === 'select') {
      const o = el.options[el.selectedIndex];
      return !!o && o.value !== '' && !/请选择|select|choose/i.test(o.text);
    }
    if (kind === 'custom') {
      const shown = el.querySelector('.ant-select-selection-item, .el-select__selected-item:not(.is-transparent), .ivu-select-selected-value, .arco-select-view-value');
      if (shown && JT.textOf(shown)) return true;
      const input = el.querySelector('input');
      return !!(input && input.value.trim());
    }
    if (kind === 'editable') return !!el.textContent.trim();
    return !!String(el.value || '').trim();
  };

  JT.setText = (el, text) => {
    const set = setterFor(el);
    if (set) set.call(el, text);
    else el.value = text;
    fireInput(el);
  };

  /** 在光标处插入（点选填充用）；输入框为空或不支持选区时直接写入 */
  JT.insertText = (el, text) => {
    if (el.isContentEditable && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
      if (!el.ownerDocument.execCommand('insertText', false, text)) {
        el.textContent += text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }
    let start = null;
    let end = null;
    try {
      start = el.selectionStart;
      end = el.selectionEnd;
    } catch {
      // email / number 输入框不支持选区
    }
    if (typeof start === 'number' && typeof end === 'number' && el.value) {
      JT.setText(el, el.value.slice(0, start) + text + el.value.slice(end));
      try {
        el.setSelectionRange(start + text.length, start + text.length);
      } catch {
        // 忽略
      }
    } else {
      JT.setText(el, text);
    }
  };

  JT.setSelect = (el, want) => {
    const i = JT.chooseOption([...el.options].map((o) => o.text), want);
    if (i < 0) return false;
    const set = setterFor(el);
    if (set) set.call(el, el.options[i].value);
    else el.selectedIndex = i;
    fireInput(el);
    return true;
  };

  JT.radioText = (r) => JT.textOf(r.closest('label')) || JT.textOf(r.labels && r.labels[0]) || JT.textOf(r.nextElementSibling) || r.value || '';

  JT.setRadio = (radios, want) => {
    const i = JT.chooseOption(radios.map(JT.radioText), want);
    if (i < 0) return false;
    const r = radios[i];
    if (!r.checked) (r.closest('label') || r).click();
    if (!r.checked) {
      r.checked = true;
      fireInput(r);
    }
    return true;
  };

  const visibleOptions = (doc) => [...doc.querySelectorAll(OPTION)].filter((o) => !inPanel(o)
    && JT.isVisible(o)
    && !o.matches('.is-disabled, .ant-select-item-option-disabled, [aria-disabled="true"]'));

  /** 等下拉选项出现：优先返回新出现的选项，超时就返回当前所有可见选项 */
  async function waitForOptions(doc, before, timeout) {
    const end = Date.now() + timeout;
    for (;;) {
      const all = visibleOptions(doc);
      const fresh = all.filter((o) => !before.has(o));
      if (fresh.length) return fresh;
      if (Date.now() > end) return all;
      await sleep(60);
    }
  }

  /** Ant / Element / iView 等自定义下拉：点开 → 找选项 → 找不到就输入关键字再找 → 点选项；失败时关掉下拉 */
  JT.setCustomSelect = async (wrapper, want) => {
    const doc = wrapper.ownerDocument;
    const trigger = wrapper.querySelector('.ant-select-selector, .el-select__wrapper, .el-input__inner, .ivu-select-selection, .arco-select-view, .n-base-selection') || wrapper;
    const before = new Set(visibleOptions(doc));
    fire(trigger, CLICK);
    let options = await waitForOptions(doc, before, 800);
    let i = JT.chooseOption(options.map((o) => JT.textOf(o)), want);
    const search = wrapper.querySelector('input:not([readonly])');
    if (i < 0 && search && want.values[0]) {
      const seen = new Set(options);
      JT.setText(search, want.values[0]);
      await sleep(300);
      options = await waitForOptions(doc, seen, 1500);
      i = JT.chooseOption(options.map((o) => JT.textOf(o)), want);
    }
    if (i >= 0) {
      fire(options[i], CLICK);
      await sleep(120);
      return true;
    }
    (search || trigger).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    fire(doc.body, ['mousedown', 'mouseup', 'click']);
    await sleep(80);
    return false;
  };

  /** 按控件类型写入；返回 true / false，或 'truncated'（超过 maxlength 被截断，需要核对） */
  JT.applyValue = async (control, value, field) => {
    const { kind, el } = control;
    const want = { groups: field.groups, values: [value.text, value.alt].filter(Boolean) };
    if (kind === 'select') return JT.setSelect(el, want);
    if (kind === 'radio') return JT.setRadio(control.radios, want);
    if (kind === 'custom') return JT.setCustomSelect(el, want);
    if (kind === 'editable') {
      el.textContent = value.text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (el.readOnly) return false; // 只读的日期框等：留给点选
    const isDate = ['date', 'month', 'range'].includes(field.kind);
    let text = isDate
      ? JT.formatDate(value.text, { type: (el.getAttribute('type') || 'text').toLowerCase(), placeholder: el.getAttribute('placeholder') || '' })
      : value.text;
    const max = Number(el.getAttribute('maxlength')) || 0;
    const truncated = max > 0 && text.length > max;
    if (truncated) text = text.slice(0, max);
    JT.setText(el, text);
    // 日期组件要按回车才确认；普通输入框不发，免得触发页面自己的提交逻辑
    if (el.closest(PICKER)) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    return truncated ? 'truncated' : true;
  };

  // 高亮记录放在 JT 上：重复注入脚本时不会丢，清除时能还原
  const marked = (JT.marked = JT.marked || new Map());

  JT.mark = (el, kind) => {
    if (!el || !el.style) return;
    if (!marked.has(el)) marked.set(el, [el.style.outline, el.style.outlineOffset]);
    el.style.outline = `2px solid ${COLORS[kind] || COLORS.manual}`;
    el.style.outlineOffset = '1px';
  };

  JT.clearMarks = () => {
    for (const [el, [outline, offset]] of marked) {
      el.style.outline = outline;
      el.style.outlineOffset = offset;
    }
    marked.clear();
  };
})();
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，fill 的 4 个测试通过

- [ ] **Step 5: Commit**

```bash
git add extension/content/lib/fill.js extension/test/fill.test.js
git commit -m "feat(extension): value writers for inputs, selects, radios and custom dropdowns"
```

---
### Task 5: frame 里的执行者（agent）

没有单元测试（全是 DOM 操作），在 T10 的测试页里逐项验证。

**Files:**
- Create: `extension/content/agent.js`

- [ ] **Step 1: 实现**

```js file=extension/content/agent.js
// 每个 frame 里的执行者：一键填写、在焦点处插入、找上传框、放入文件、读页面信息。
// 由后台注入（可以重复注入：库函数会更新，这个对象只建一次），通过 window.__jtAgent 调用。
(() => {
  const JT = globalThis.JT;
  if (!JT || window.__jtAgent) return;

  const LISTS = ['education', 'work', 'projects', 'activities', 'awards', 'languages', 'certificates'];
  const CAPTCHA = /验证码|校验码|captcha|verification code/i;
  const NOT_TEXT = new Set(['password', 'checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image', 'hidden', 'range', 'color']); // 密码框永远不碰
  const FILE_GOOD = /简历|履历|resume|\bcv\b|附件|attachment|上传/i;
  const FILE_STRONG = /简历|履历|resume|\bcv\b/i;
  const FILE_BAD = /照片|头像|证件照|photo|avatar|图片|作品集|portfolio|成绩单|transcript|证书/i;

  /** 档案里某字段的值：{ text, alt }（alt 是另一种语言）；多段经历缺第 index 段时返回 { missing: true } */
  function valueFor(field, profile, index, lang, role) {
    const src = field.source;
    let raw;
    if (typeof src === 'string') {
      raw = src.split('.').reduce((o, k) => (o == null ? o : o[k]), profile);
    } else if (src.extra) {
      raw = ((profile.extras || []).find((e) => e.id === src.extra) || {}).value;
    } else {
      const entry = (profile[src.list] || [])[index];
      if (!entry) return { missing: true };
      raw = src.field === 'range' ? entry[role === 'end' ? 'end' : 'start'] : entry[src.field];
    }
    const bi = JT.asBi(raw);
    const other = lang === 'zh' ? 'en' : 'zh';
    const text = bi[lang] || bi[other] || '';
    return { text, alt: bi[other] && bi[other] !== text ? bi[other] : '' };
  }

  /** 一键填写本 frame 的表单；返回 { filled, uncertain, manual, skipped, missing } */
  async function fillAll({ profile, options = {} }) {
    const opts = { lang: 'auto', overwrite: false, reverse: false, ...options };
    const prof = { ...profile };
    if (opts.reverse) for (const k of LISTS) prof[k] = [...(profile[k] || [])].reverse();
    const extras = (profile.extras || [])
      .filter((e) => e.label)
      .map((e) => ({ key: `extra.${e.id}`, source: { extra: e.id }, labels: [e.label], contextLabels: [], kind: 'text', scope: null }));
    const pageLang = JT.pageLang(document);
    const counters = {};
    const used = {};
    const summary = { filled: 0, uncertain: 0, manual: 0, skipped: 0, missing: {} };
    JT.clearMarks();

    for (const control of JT.collectControls(document)) {
      const label = control.kind === 'radio' ? JT.groupLabelOf(control.el) : JT.labelOf(control.el);
      if (CAPTCHA.test(label)) continue;
      const box = control.kind === 'radio' ? JT.groupContainer(control.el) : control.el;
      const match = JT.findField(label, JT.sectionOf(control.el), JT.hintsOf(control.el), extras);
      if (!match || (match.field.kind === 'range' && !control.role)) {
        if (!JT.hasValue(control) && JT.isRequired(control.el, label)) {
          JT.mark(box, 'manual');
          summary.manual += 1;
        }
        continue;
      }
      const { field } = match;
      const list = typeof field.source === 'object' ? field.source.list : null;
      let index = 0;
      if (list) {
        // 同一分节里同一字段第 k 次出现 → 第 k 段经历；日期范围的「结束」和「开始」算同一段
        if (control.role === 'end') index = counters[field.key] ?? 0;
        else index = counters[field.key] = (counters[field.key] ?? -1) + 1;
        used[list] = Math.max(used[list] ?? -1, index);
      }
      const lang = opts.lang === 'auto' ? JT.labelLang(label, pageLang) : opts.lang;
      const value = valueFor(field, prof, index, lang, control.role);
      if (value.missing || !value.text) continue;
      if (!opts.overwrite && JT.hasValue(control)) {
        summary.skipped += 1;
        continue;
      }
      let result = false;
      try {
        result = await JT.applyValue(control, value, field);
      } catch {
        result = false;
      }
      let status = 'filled';
      if (!result) status = 'manual';
      else if (result === 'truncated' || match.confidence === 'low') status = 'uncertain';
      JT.mark(box, status);
      summary[status] += 1;
    }

    for (const k of LISTS) {
      if (used[k] == null) continue;
      const extra = (prof[k] || []).length - (used[k] + 1);
      if (extra > 0) summary.missing[k] = extra;
    }
    return summary;
  }

  function deepActive(doc) {
    let el = doc.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  /** 点选填充：只有拥有焦点、且焦点在可输入的框里的 frame 才会插入 */
  function insertFocused(text) {
    if (!document.hasFocus()) return false;
    const el = deepActive(document);
    if (!el || el === document.body || el.id === 'jt-panel-host') return false;
    const root = el.getRootNode ? el.getRootNode() : null;
    if (root && root.host && root.host.id === 'jt-panel-host') return false;
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    const editable = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !NOT_TEXT.has(type)) || el.isContentEditable;
    if (!editable || el.disabled || el.readOnly) return false;
    JT.insertText(el, text);
    JT.mark(el, 'filled');
    return true;
  }

  function fileContext(input) {
    const item = input.closest(JT.FORM_ITEM_SELECTOR) || input.parentElement;
    return [JT.labelOf(input), input.getAttribute('accept') || '', input.name || '', input.id || '', JT.textOf(item).slice(0, 80)].join(' ');
  }

  /** 找上传简历的地方：按文字打分，排除只收图片的、照片 / 头像 / 作品集 */
  function findFileInputs() {
    return [...document.querySelectorAll('input[type="file"]')]
      .map((input, index) => {
        if (input.disabled || input.closest('#jt-panel-host')) return null;
        const accept = (input.getAttribute('accept') || '').toLowerCase();
        if (accept && /image\//.test(accept) && !/pdf|doc|\*/.test(accept)) return null;
        const text = fileContext(input);
        let score = 1;
        if (FILE_GOOD.test(text)) score += 4;
        if (FILE_STRONG.test(text)) score += 6;
        if (FILE_BAD.test(text)) score -= 10;
        if (/pdf|doc/.test(accept)) score += 2;
        return score > 0 ? { index, score, label: (JT.labelOf(input) || '上传').slice(0, 30) } : null;
      })
      .filter(Boolean);
  }

  /** 把后台传来的文件（base64）放进第 index 个文件框 */
  function attachFile(index, { name, type, b64 }) {
    const input = document.querySelectorAll('input[type="file"]')[index];
    if (!input) return false;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name, { type }));
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    JT.mark(input.closest(JT.FORM_ITEM_SELECTOR) || input.parentElement, 'filled');
    return true;
  }

  window.__jtAgent = {
    fillAll,
    insertFocused,
    findFileInputs,
    attachFile,
    clearMarks: () => JT.clearMarks(),
    pageInfo: () => JT.pageInfo(document),
    pageLang: () => JT.pageLang(document),
  };
})();
```

- [ ] **Step 2: 语法检查**

Run: `node --check extension/content/agent.js && echo ok`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add extension/content/agent.js
git commit -m "feat(extension): per-frame agent for fill, insert and resume upload"
```

---

### Task 6: 后台纯函数

**Files:**
- Create: `extension/bg/logic.js`
- Test: `extension/test/logic.test.js`

- [ ] **Step 1: 写失败的测试**

```js file=extension/test/logic.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateFill, pickResumeFile, mimeFor, base64FromBuffer, normalizeUrl, findDuplicate, bestFileTarget,
} from '../bg/logic.js';

test('汇总各 frame 的填写结果', () => {
  const sum = aggregateFill([
    { filled: 3, uncertain: 1, manual: 0, skipped: 2, missing: { work: 1 } },
    null,
    { filled: 2, uncertain: 0, manual: 1, skipped: 0, missing: { work: 2, education: 1 } },
  ]);
  assert.deepEqual(sum, { filled: 5, uncertain: 1, manual: 1, skipped: 2, missing: { work: 2, education: 1 }, frames: 2 });
});

test('简历文件优先用 PDF', () => {
  assert.equal(pickResumeFile([{ name: 'a.docx' }, { name: 'a.pdf' }]).name, 'a.pdf');
  assert.equal(pickResumeFile([{ name: 'a.docx' }]).name, 'a.docx');
  assert.equal(pickResumeFile([]), null);
  assert.equal(mimeFor('x.PDF'), 'application/pdf');
  assert.equal(mimeFor('x.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(mimeFor('x.bin'), 'application/octet-stream');
});

test('base64 与 atob 互逆（含二进制和中文）', () => {
  const bytes = new Uint8Array([0, 255, 37, 80, 68, 70, ...new TextEncoder().encode('简历')]);
  const b64 = base64FromBuffer(bytes.buffer);
  assert.deepEqual([...Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], [...bytes]);
});

test('链接规范化：去掉 hash 和追踪参数，保留岗位 id', () => {
  assert.equal(normalizeUrl('https://Join.QQ.com/post.html?postid=12&utm_source=x#top'), 'join.qq.com/post.html?postid=12');
  assert.equal(normalizeUrl('https://a.com/job/1/'), 'a.com/job/1');
  assert.equal(normalizeUrl('not a url'), '');
});

test('查重：先比链接，再比公司 + 岗位', () => {
  const apps = [
    { id: '1', company: '雀巢', position: 'Marketing MT', jdUrl: 'https://a.com/job/1?utm_medium=x' },
    { id: '2', company: '宝洁', position: '品牌 MT', jdUrl: '' },
  ];
  assert.equal(findDuplicate(apps, { url: 'https://a.com/job/1' }).id, '1');
  assert.equal(findDuplicate(apps, { url: 'https://b.com', company: '宝洁', position: '品牌MT' }).id, '2');
  assert.equal(findDuplicate(apps, { url: 'https://b.com', company: '宝洁', position: '市场' }), null);
});

test('挑得分最高的上传框', () => {
  const frames = [
    { frameId: 0, candidates: [{ index: 0, score: 3, label: '附件' }] },
    { frameId: 5, candidates: [{ index: 1, score: 13, label: '上传简历' }] },
  ];
  assert.deepEqual(bestFileTarget(frames), { frameId: 5, index: 1, score: 13, label: '上传简历' });
  assert.equal(bestFileTarget([{ frameId: 0, candidates: [] }]), null);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL，找不到 `extension/bg/logic.js`

- [ ] **Step 3: 实现**

```js file=extension/bg/logic.js
// 后台用的纯函数：汇总各 frame 的填写结果、挑简历文件、查重、base64。

export function aggregateFill(results) {
  const total = { filled: 0, uncertain: 0, manual: 0, skipped: 0, missing: {}, frames: 0 };
  for (const r of results) {
    if (!r) continue;
    total.frames += 1;
    for (const k of ['filled', 'uncertain', 'manual', 'skipped']) total[k] += r[k] || 0;
    for (const [list, n] of Object.entries(r.missing || {})) total.missing[list] = Math.max(total.missing[list] || 0, n);
  }
  return total;
}

/** 网申一般要 PDF：有 PDF 用 PDF，其次 Word */
export function pickResumeFile(files = []) {
  return files.find((f) => /\.pdf$/i.test(f.name)) || files.find((f) => /\.docx?$/i.test(f.name)) || files[0] || null;
}

export function mimeFor(name = '') {
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  if (/\.docx$/i.test(name)) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (/\.doc$/i.test(name)) return 'application/msword';
  return 'application/octet-stream';
}

export function base64FromBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** 用于查重的链接：主机 + 路径 + 查询参数（去掉 hash 和 utm 等追踪参数） */
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_.*|spm|from|source)$/i.test(k)) u.searchParams.delete(k);
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return '';
  }
}

const squash = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

export function findDuplicate(apps, { url, company, position }) {
  const target = normalizeUrl(url);
  if (target) {
    const hit = apps.find((a) => [a.jdUrl, a.applyUrl].some((u) => u && normalizeUrl(u) === target));
    if (hit) return hit;
  }
  if (company && position) {
    return apps.find((a) => squash(a.company) === squash(company) && squash(a.position) === squash(position)) || null;
  }
  return null;
}

/** frames: [{ frameId, candidates: [{ index, score, label }] }] → 得分最高的一个 */
export function bestFileTarget(frames) {
  let best = null;
  for (const { frameId, candidates } of frames) {
    for (const c of candidates || []) {
      if (!best || c.score > best.score) best = { frameId, index: c.index, score: c.score, label: c.label };
    }
  }
  return best;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，logic 的 6 个测试通过

- [ ] **Step 5: Commit**

```bash
git add extension/bg/logic.js extension/test/logic.test.js
git commit -m "feat(extension): background pure helpers"
```

---

### Task 7: 后台消息处理

**Files:**
- Create: `extension/bg/handlers.js`
- Test: `extension/test/handlers.test.js`

- [ ] **Step 1: 写失败的测试（用假的 chrome 和 fetch）**

```js file=extension/test/handlers.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandlers, AGENT_FILES } from '../bg/handlers.js';

const BASE = 'http://127.0.0.1:7317';

/** 假 chrome：executeScript 的 func 会在每个假 frame 上运行（把它设成全局 window） */
function setup({ frames = [], routes = {}, offline = false } = {}) {
  const store = {};
  const calls = { scripts: [], fetches: [], tabs: [] };
  const chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: store[key] }),
        set: async (obj) => { Object.assign(store, obj); },
      },
    },
    scripting: {
      executeScript: async ({ target, files, func, args = [] }) => {
        calls.scripts.push({ target, files: files || null });
        const ids = target.frameIds || (target.allFrames ? frames.map((_, i) => i) : [0]);
        if (files) return ids.map((frameId) => ({ frameId, result: undefined }));
        const results = [];
        for (const frameId of ids) {
          globalThis.window = frames[frameId];
          try {
            results.push({ frameId, result: await func(...args) });
          } finally {
            delete globalThis.window;
          }
        }
        return results;
      },
    },
    tabs: { create: async (opts) => { calls.tabs.push(opts); } },
  };
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.fetches.push({ url, method, body: init.body ? JSON.parse(init.body) : undefined });
    if (offline) throw new TypeError('fetch failed');
    const route = routes[`${method} ${url.replace(BASE, '')}`];
    if (!route) return { ok: false, status: 404, json: async () => ({ error: '接口不存在' }) };
    const body = typeof route === 'function' ? route(init) : route;
    return { ok: true, status: 200, json: async () => body, arrayBuffer: async () => body };
  };
  return { ...createHandlers({ chrome, fetch }), calls, store };
}

const STATE = {
  profile: { basic: {} },
  answers: [],
  applications: [],
  settings: {},
  resumes: [{ id: 'res_1', files: [{ name: 'a.docx', stored: 'resumes/res_1__x__a.docx' }, { name: 'a.pdf', stored: 'resumes/res_1__y__a.pdf' }] }],
};

test('读取状态并缓存；离线时用缓存', async () => {
  const online = setup({ routes: { 'GET /api/state': STATE } });
  const s = await online.handlers['state:get']({});
  assert.equal(s.online, true);
  assert.ok(online.store.cache.cachedAt);
  const offline = setup({ offline: true });
  offline.store.cache = online.store.cache;
  const s2 = await offline.handlers['state:get']({});
  assert.equal(s2.online, false);
  assert.equal(s2.resumes.length, 1);
  assert.equal(s2.cachedAt, online.store.cache.cachedAt);
});

test('一键填写：先注入脚本，再在所有 frame 执行并汇总', async () => {
  const frames = [
    { __jtAgent: { fillAll: async () => ({ filled: 2, uncertain: 0, manual: 1, skipped: 0, missing: {} }) } },
    { __jtAgent: { fillAll: async ({ options }) => ({ filled: options.overwrite ? 5 : 1, uncertain: 1, manual: 0, skipped: 0, missing: { work: 1 } }) } },
  ];
  const h = setup({ frames, routes: { 'GET /api/state': STATE } });
  const sum = await h.handlers['fill:all']({ options: { overwrite: true } }, 7);
  assert.deepEqual(sum, { filled: 7, uncertain: 1, manual: 1, skipped: 0, missing: { work: 1 }, frames: 2 });
  assert.deepEqual(h.calls.scripts[0].files, AGENT_FILES);
  assert.equal(h.calls.scripts[0].target.tabId, 7);
});

test('没有档案时一键填写给出提示', async () => {
  const h = setup({ offline: true });
  await assert.rejects(h.handlers['fill:all']({ options: {} }, 1), /档案/);
});

test('点选填充：交给有焦点的 frame', async () => {
  const got = [];
  const frames = [
    { __jtAgent: { insertFocused: () => false } },
    { __jtAgent: { insertFocused: (t) => { got.push(t); return true; } } },
  ];
  const h = setup({ frames });
  assert.deepEqual(await h.handlers['fill:insert']({ text: '你好' }, 1), { ok: true });
  assert.deepEqual(got, ['你好']);
});

test('上传简历：优先 PDF，放进得分最高的上传框', async () => {
  let attached = null;
  const frames = [
    { __jtAgent: { findFileInputs: () => [{ index: 0, score: 3, label: '附件' }], attachFile: () => { throw new Error('不该选这个'); } } },
    { __jtAgent: { findFileInputs: () => [{ index: 2, score: 13, label: '上传简历' }], attachFile: (i, f) => { attached = { i, ...f }; return true; } } },
  ];
  const pdf = new TextEncoder().encode('%PDF').buffer;
  const h = setup({ frames, routes: { 'GET /api/state': STATE, 'GET /files/resumes/res_1__y__a.pdf': pdf } });
  assert.deepEqual(await h.handlers['resume:attach']({ resumeId: 'res_1' }, 1), { ok: true, label: '上传简历', file: 'a.pdf' });
  assert.equal(attached.i, 2);
  assert.equal(attached.type, 'application/pdf');
  assert.equal(atob(attached.b64), '%PDF');
});

test('页面上没有上传框时说明原因', async () => {
  const frames = [{ __jtAgent: { findFileInputs: () => [] } }];
  const h = setup({ frames, routes: { 'GET /api/state': STATE, 'GET /files/resumes/res_1__y__a.pdf': new ArrayBuffer(1) } });
  const res = await h.handlers['resume:attach']({ resumeId: 'res_1' }, 1);
  assert.equal(res.ok, false);
  assert.match(res.reason, /没找到/);
});

test('记录投递：先建记录，再存 JD', async () => {
  const h = setup({
    routes: {
      'POST /api/applications': (init) => ({ id: 'app_1', ...JSON.parse(init.body) }),
      'PUT /api/applications/app_1/jd': { ok: true },
    },
  });
  const { app } = await h.handlers['clip:save']({ record: { company: '示例公司', position: 'MT' }, jdText: '职责……' });
  assert.equal(app.id, 'app_1');
  assert.deepEqual(h.calls.fetches.map((c) => `${c.method} ${c.url.replace(BASE, '')}`), ['POST /api/applications', 'PUT /api/applications/app_1/jd']);
  assert.deepEqual(h.calls.fetches[1].body, { text: '职责……' });
});

test('连不上服务时给出清楚的提示', async () => {
  const h = setup({ offline: true });
  await assert.rejects(h.handlers['clip:parse']({ text: 'x', url: '' }), /连不上 Tracker/);
});

test('服务地址可以改；打开 Tracker 时定位到这条投递', async () => {
  const h = setup();
  await h.handlers['server:set']({ url: 'http://127.0.0.1:9999/' });
  assert.equal(await h.serverUrl(), 'http://127.0.0.1:9999');
  const h2 = setup();
  await h2.handlers['tracker:open']({ id: 'app_1' });
  assert.deepEqual(h2.calls.tabs, [{ url: `${BASE}/#/applications?open=app_1` }]);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL，找不到 `extension/bg/handlers.js`

- [ ] **Step 3: 实现**

```js file=extension/bg/handlers.js
// 后台消息处理。chrome 和 fetch 由参数传入，方便在 Node 里用假对象测试。
// 传给 executeScript 的 func 会被序列化到页面里执行：只能用参数和 window，不能引用外面的变量。
import { aggregateFill, pickResumeFile, mimeFor, base64FromBuffer, findDuplicate, bestFileTarget } from './logic.js';

export const DEFAULT_SERVER = 'http://127.0.0.1:7317';
export const AGENT_FILES = [
  'content/lib/fields.js',
  'content/lib/match.js',
  'content/lib/fill.js',
  'content/lib/clip.js',
  'content/agent.js',
];

export function createHandlers({ chrome, fetch }) {
  async function serverUrl() {
    const { serverUrl: saved } = await chrome.storage.local.get('serverUrl');
    return String(saved || DEFAULT_SERVER).replace(/\/+$/, '');
  }

  async function api(method, path, body, timeout = 4000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(`${await serverUrl()}${path}`, {
        method,
        signal: ctrl.signal,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `请求失败（${res.status}）`);
      return data;
    } catch (e) {
      if (e.name === 'AbortError' || e instanceof TypeError) throw new Error('连不上 Tracker：先双击「启动Tracker.command」');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 在线时拉最新数据并缓存；离线时用缓存（没有缓存就是空的） */
  async function getState() {
    const server = await serverUrl();
    try {
      const data = await api('GET', '/api/state', undefined, 2000);
      const cachedAt = new Date().toISOString();
      await chrome.storage.local.set({ cache: { data, cachedAt } });
      return { online: true, server, cachedAt, ...data };
    } catch {
      const { cache } = await chrome.storage.local.get('cache');
      const empty = { profile: null, answers: [], resumes: [], applications: [], settings: null };
      return { online: false, server, cachedAt: cache ? cache.cachedAt : null, ...(cache ? cache.data : empty) };
    }
  }

  /** 每次操作前重新注入：覆盖页面后来才加载的 iframe（脚本可以重复注入） */
  async function inject(tabId) {
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: AGENT_FILES });
    } catch {
      // 个别 frame（比如浏览器内部页）不允许注入，忽略
    }
  }

  async function inFrames(tabId, func, args = []) {
    await inject(tabId);
    return chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func, args });
  }

  const handlers = {
    'state:get': () => getState(),

    async 'fill:all'({ options }, tabId) {
      const state = await getState();
      if (!state.profile) throw new Error('还没有档案数据：先启动一次 Tracker，再点插件图标');
      const res = await inFrames(tabId, (payload) => (window.__jtAgent ? window.__jtAgent.fillAll(payload) : null), [{ profile: state.profile, options }]);
      return aggregateFill(res.map((r) => r.result));
    },

    async 'fill:insert'({ text }, tabId) {
      const res = await inFrames(tabId, (t) => (window.__jtAgent ? window.__jtAgent.insertFocused(t) : false), [text]);
      return { ok: res.some((r) => r.result === true) };
    },

    async 'fill:clear'(_, tabId) {
      try {
        await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => window.__jtAgent && window.__jtAgent.clearMarks() });
      } catch {
        // 忽略
      }
      return { ok: true };
    },

    async 'resume:attach'({ resumeId }, tabId) {
      const state = await getState();
      const resume = (state.resumes || []).find((r) => r.id === resumeId);
      const file = resume ? pickResumeFile(resume.files || []) : null;
      if (!file) throw new Error('这个版本还没有文件');
      const res = await fetch(`${await serverUrl()}/files/${file.stored.split('/').map(encodeURIComponent).join('/')}`);
      if (!res.ok) throw new Error('读不到简历文件：Tracker 没有启动？');
      const b64 = base64FromBuffer(await res.arrayBuffer());
      const found = await inFrames(tabId, () => (window.__jtAgent ? window.__jtAgent.findFileInputs() : []));
      const target = bestFileTarget(found.map((r) => ({ frameId: r.frameId, candidates: r.result || [] })));
      if (!target) return { ok: false, reason: '这个页面上没找到上传简历的地方' };
      const [done] = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [target.frameId] },
        func: (index, f) => window.__jtAgent.attachFile(index, f),
        args: [target.index, { name: file.name, type: mimeFor(file.name), b64 }],
      });
      return { ok: !!(done && done.result), label: target.label, file: file.name };
    },

    async 'clip:selection'(_, tabId) {
      const res = await inFrames(tabId, () => (window.getSelection ? String(window.getSelection()).trim() : ''));
      return { text: res.map((r) => r.result || '').sort((a, b) => b.length - a.length)[0] || '' };
    },

    'clip:parse': ({ text, url }) => api('POST', '/api/parse-jd', { text, url }),

    async 'clip:find'({ url, company, position }) {
      return { app: findDuplicate(await api('GET', '/api/applications'), { url, company, position }) };
    },

    async 'clip:save'({ record, jdText }) {
      const app = await api('POST', '/api/applications', record);
      if (jdText && jdText.trim()) await api('PUT', `/api/applications/${app.id}/jd`, { text: jdText });
      return { app };
    },

    async 'clip:stage'({ id, stage }) {
      return { app: await api('PATCH', `/api/applications/${id}`, { stage }) };
    },

    async 'tracker:open'({ id }) {
      await chrome.tabs.create({ url: `${await serverUrl()}/#/applications${id ? `?open=${encodeURIComponent(id)}` : ''}` });
      return { ok: true };
    },

    async 'server:set'({ url }) {
      await chrome.storage.local.set({ serverUrl: String(url || '').trim() || DEFAULT_SERVER });
      return getState();
    },
  };

  /** 打开 / 关闭侧边栏：注入执行者和侧边栏脚本，再切换 */
  async function toggle(tabId) {
    await inject(tabId);
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/panel.js'] });
    await chrome.scripting.executeScript({ target: { tabId }, func: () => window.__jtPanel && window.__jtPanel.toggle() });
  }

  return { handlers, toggle, getState, api, serverUrl };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，handlers 的 9 个测试通过

- [ ] **Step 5: Commit**

```bash
git add extension/bg/handlers.js extension/test/handlers.test.js
git commit -m "feat(extension): background message handlers with injectable chrome"
```

---
### Task 8: 侧边栏

两个标签页：「填写」（一键填写、上传简历、点选填充、素材库）和「记录投递」（识别当前招聘页 → 确认 → 存进 Tracker，已经记过的会提示并可直接改阶段）。底部显示 Tracker 在线状态，可改地址。T10 在测试页里验证。

**Files:**
- Create: `extension/content/panel.js`

- [ ] **Step 1: 实现**

```js file=extension/content/panel.js
// 秋招助手侧边栏：只在顶层 frame 显示，放在 closed shadow root 里，和网页样式互不影响。
// 数据都通过后台拿；点选填充的按钮在 mousedown 时阻止默认行为，这样网页输入框不会失去焦点。
(() => {
  if (window.__jtPanel) return;

  const STAGES = [['wishlist', '待投递'], ['applied', '已投递'], ['assessment', '测评/笔试'], ['interview', '面试'], ['final', '终面'], ['offer', 'Offer']];
  const STAGE_LABEL = Object.fromEntries(STAGES);
  const CLOSED = { rejected: '挂了', withdrawn: '放弃', accepted: '已接受', declined: '已拒绝' };
  const LIST_NAMES = { education: '教育', work: '实习 / 工作', projects: '项目', activities: '校园经历', awards: '获奖', languages: '语言', certificates: '证书' };

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .root { position: relative; height: 100%; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; color: var(--text); }
    .root { --bg: #fff; --bg2: #f4f3ef; --bg3: #e8e6e0; --line: #e4e2dc; --line2: #d3d0c8; --text: #1d1c1a; --text2: #5f5c56; --text3: #8f8b83;
            --accent: #4f5bd5; --accent2: #4350c4; --accent-soft: #eceefd; --accent-text: #3b46b3;
            --ok: #2f8a57; --ok-soft: #e7f4ec; --warn: #b7791f; --warn-soft: #fcf3e3; --err: #c2413b; }
    @media (prefers-color-scheme: dark) {
      .root { --bg: #1f1f1d; --bg2: #262624; --bg3: #30302d; --line: #33322f; --line2: #44433f; --text: #ecebe7; --text2: #aeaba4; --text3: #7d7a73;
              --accent: #7c86f0; --accent2: #8e97f3; --accent-soft: #272a4a; --accent-text: #aab1ff;
              --ok: #55b981; --ok-soft: #1c3226; --warn: #e0a444; --warn-soft: #362b17; --err: #ec6a63; }
    }
    .panel { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 12px 40px rgba(20, 19, 17, 0.24); }
    .head { display: flex; align-items: center; gap: 8px; padding: 12px 12px 8px 14px; }
    .logo { width: 18px; height: 18px; flex: none; border-radius: 6px; background: var(--accent); box-shadow: inset 0 -5px 0 rgba(0,0,0,.12); }
    .title { flex: 1; font-size: 14px; font-weight: 650; }
    .lang { height: 26px; padding: 0 4px; font-size: 12px; }
    .icon { width: 26px; height: 26px; border: 0; border-radius: 6px; background: none; color: var(--text2); cursor: pointer; font-size: 16px; line-height: 1; }
    .icon:hover { background: var(--bg2); color: var(--text); }
    .tabs { display: flex; gap: 2px; padding: 0 14px; border-bottom: 1px solid var(--line); }
    .tabs button { margin-bottom: -1px; padding: 7px 8px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--text2); cursor: pointer; font: inherit; }
    .tabs button.on { border-bottom-color: var(--accent); color: var(--text); font-weight: 600; }
    .body { flex: 1; overflow: auto; padding: 12px 14px 16px; }
    .foot { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-top: 1px solid var(--line); color: var(--text3); font-size: 11.5px; }
    .dot { width: 7px; height: 7px; flex: none; border-radius: 50%; background: var(--ok); }
    .dot.off { background: var(--warn); }
    .grow { flex: 1; min-width: 0; }
    .row { display: flex; align-items: center; gap: 8px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .section { margin-top: 18px; }
    .section.first { margin-top: 0; }
    .section > h3 { margin: 0 0 6px; color: var(--text3); font-size: 12px; font-weight: 600; letter-spacing: .02em; }
    .hint { margin: 6px 0 0; color: var(--text3); font-size: 12px; }
    .pad { padding: 6px; }
    .empty { padding: 28px 8px; color: var(--text3); text-align: center; }
    button { font: inherit; color: inherit; }
    .primary { height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; }
    .primary:hover { background: var(--accent2); }
    .primary:disabled { opacity: .6; cursor: default; }
    .big { width: 100%; height: 38px; font-size: 14px; }
    .btn { height: 30px; padding: 0 10px; border: 1px solid var(--line2); border-radius: 8px; background: var(--bg); cursor: pointer; white-space: nowrap; }
    .btn:hover { background: var(--bg2); }
    .link { padding: 0; border: 0; background: none; color: var(--accent-text); cursor: pointer; white-space: nowrap; }
    input, select, textarea { font: inherit; color: inherit; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); padding: 4px 8px; outline: none; }
    input:focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    input, select { height: 30px; }
    textarea { width: 100%; min-height: 160px; resize: vertical; line-height: 1.5; }
    .opts { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; color: var(--text2); font-size: 12px; }
    .opts label { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
    .opts input { height: auto; accent-color: var(--accent); }
    .result { margin-top: 10px; }
    .sum { padding: 8px 10px; border-radius: 8px; background: var(--ok-soft); color: var(--ok); }
    .sum.muted { background: var(--bg2); color: var(--text2); }
    .result .row { justify-content: space-between; margin-top: 6px; }
    .err { color: var(--err); }
    details { margin-top: 8px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
    summary { display: flex; align-items: center; gap: 6px; padding: 8px 10px; cursor: pointer; font-weight: 600; list-style: none; }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: "›"; display: inline-block; color: var(--text3); transition: transform .15s; }
    details[open] > summary::before { transform: rotate(90deg); }
    .items { display: flex; flex-direction: column; padding: 0 4px 6px; }
    .item-row { display: flex; align-items: flex-start; gap: 4px; }
    .item { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 8px; padding: 6px; border: 0; border-radius: 6px; background: none; text-align: left; cursor: pointer; }
    .item:hover { background: var(--bg2); }
    .item .k { flex: none; width: 60px; padding-top: 1px; color: var(--text3); font-size: 12px; }
    .item .v { flex: 1; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
    .item.answer .v { -webkit-line-clamp: 3; }
    .alt { flex: none; margin-top: 5px; padding: 0 5px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: var(--text2); font-size: 10.5px; cursor: pointer; }
    .alt:hover { border-color: var(--accent); color: var(--accent-text); }
    .search { width: calc(100% - 16px); margin: 0 8px 6px; }
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
    .field > span { color: var(--text2); font-size: 12px; }
    .field input, .field select { width: 100%; }
    .seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 7px; background: var(--bg3); align-self: flex-start; }
    .seg button { padding: 3px 10px; border: 0; border-radius: 5px; background: none; color: var(--text2); cursor: pointer; }
    .seg button.on { background: var(--bg); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
    .jd { margin: 4px 0 12px; }
    .jd textarea { display: block; width: calc(100% - 16px); margin: 0 8px 8px; }
    .actions { margin-top: 4px; }
    .dup, .saved { margin-bottom: 12px; padding: 10px 12px; border-radius: 10px; }
    .dup { border: 1px solid var(--warn); background: var(--warn-soft); }
    .saved { border: 1px solid var(--ok); background: var(--ok-soft); }
    .dup .row, .saved .row { margin-top: 8px; flex-wrap: wrap; }
    .toast { position: absolute; left: 14px; right: 14px; bottom: 46px; padding: 8px 10px; border-radius: 8px; background: #262523; color: #f4f3ef; font-size: 12.5px; box-shadow: 0 6px 20px rgba(0,0,0,.25); }
    .toast.ok { background: #1f6b43; }
    .toast.err { background: #c2413b; }
    .pill { display: flex; align-items: center; gap: 6px; padding: 8px 10px 8px 8px; border: 1px solid var(--line); border-right: 0; border-radius: 10px 0 0 10px; background: var(--bg); color: var(--text); box-shadow: 0 6px 20px rgba(20,19,17,.2); cursor: pointer; font-weight: 600; }
  `;

  let host = null;
  let app = null;
  let toastEl = null;
  let state = null;
  let tab = 'fill';
  let minimized = false;
  let clip = null;
  const ui = { lang: 'auto', overwrite: false, reverse: false, resumeId: '', query: '', result: null, attach: '' };

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    let selectValue;
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' && tag === 'select') selectValue = v;
      else if (k === 'value' || k === 'checked' || k === 'disabled') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.append(c instanceof Node ? c : String(c));
    };
    children.forEach(add);
    if (selectValue !== undefined) el.value = selectValue;
    return el;
  }

  async function send(msg) {
    const res = await chrome.runtime.sendMessage(msg);
    if (res && res.error) throw new Error(res.error);
    return res;
  }

  const asBi = (v) => (v && typeof v === 'object' ? { zh: v.zh || '', en: v.en || '' } : { zh: typeof v === 'string' ? v : '', en: '' });
  const noDefault = (e) => e.preventDefault(); // 不抢网页输入框的焦点
  const effectiveLang = () => (ui.lang !== 'auto' ? ui.lang : window.__jtAgent ? window.__jtAgent.pageLang() : 'zh');

  function toast(text, kind = 'info') {
    if (!app) return;
    if (toastEl) toastEl.remove();
    const el = h('div', { class: ['toast', kind] }, text);
    toastEl = el;
    app.append(el);
    setTimeout(() => {
      if (toastEl === el) {
        el.remove();
        toastEl = null;
      }
    }, 3200);
  }

  // ---------- 打开 / 关闭 ----------
  function place() {
    host.style.cssText = minimized
      ? 'all: initial; position: fixed; top: 40%; right: 0; z-index: 2147483647;'
      : 'all: initial; position: fixed; top: 12px; right: 12px; bottom: 12px; width: 348px; z-index: 2147483647;';
  }

  function open() {
    host = document.createElement('div');
    host.id = 'jt-panel-host';
    const shadow = host.attachShadow({ mode: 'closed' });
    app = h('div', { class: 'root' });
    shadow.append(h('style', null, STYLE), app);
    minimized = false;
    place();
    document.documentElement.append(host);
    render();
    load();
  }

  function close() {
    send({ type: 'fill:clear' }).catch(() => {});
    if (host) host.remove();
    host = null;
    app = null;
    toastEl = null;
    clip = null;
  }

  function toggle() {
    if (host && minimized) {
      minimized = false;
      place();
      render();
    } else if (host) {
      close();
    } else {
      open();
    }
  }

  async function load() {
    try {
      state = await send({ type: 'state:get' });
    } catch (e) {
      state = { online: false, error: e.message, profile: null, answers: [], resumes: [] };
    }
    render();
  }

  // ---------- 整体 ----------
  function render() {
    if (!app) return;
    if (minimized) {
      app.replaceChildren(h('button', { class: 'pill', title: '展开秋招助手', onClick: () => { minimized = false; place(); render(); } }, h('span', { class: 'logo' }), '秋招'));
      return;
    }
    let body;
    if (!state) body = h('div', { class: 'empty' }, '加载中…');
    else body = tab === 'fill' ? fillView() : clipView();
    const panel = h('div', { class: 'panel' },
      header(),
      h('div', { class: 'tabs' },
        h('button', { class: tab === 'fill' ? 'on' : '', onClick: () => { tab = 'fill'; render(); } }, '填写'),
        h('button', {
          class: tab === 'clip' ? 'on' : '',
          onClick: () => {
            tab = 'clip';
            if (!clip && state && state.online) detect();
            render();
          },
        }, '记录投递')),
      h('div', { class: 'body' }, body),
      footer());
    app.replaceChildren(panel, ...(toastEl ? [toastEl] : []));
  }

  function header() {
    return h('div', { class: 'head' },
      h('span', { class: 'logo' }),
      h('span', { class: 'title' }, '秋招助手'),
      h('select', { class: 'lang', title: '填写用的语言', value: ui.lang, onChange: (e) => { ui.lang = e.target.value; render(); } },
        h('option', { value: 'auto' }, '自动'),
        h('option', { value: 'zh' }, '中文'),
        h('option', { value: 'en' }, 'English')),
      h('button', { class: 'icon', title: '收起', onClick: () => { minimized = true; place(); render(); } }, '–'),
      h('button', { class: 'icon', title: '关闭（⌥⇧J）', onClick: close }, '×'));
  }

  function footer() {
    const s = state || {};
    const when = s.cachedAt ? new Date(s.cachedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    let status = 'Tracker 未启动';
    if (s.online) status = 'Tracker 在线';
    else if (s.profile) status = `Tracker 未启动 · 用 ${when} 的缓存`;
    return h('div', { class: 'foot' },
      h('span', { class: ['dot', !s.online && 'off'] }),
      h('span', { class: 'grow' }, status),
      h('button', { class: 'link', title: s.server || '', onClick: editServer }, '地址'),
      h('button', { class: 'link', onClick: load }, '刷新'));
  }

  async function editServer() {
    const next = window.prompt('Tracker 地址', (state && state.server) || 'http://127.0.0.1:7317');
    if (!next) return;
    try {
      state = await send({ type: 'server:set', url: next });
      render();
      toast(state.online ? '已连接' : '地址保存了，但暂时连不上', state.online ? 'ok' : 'info');
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  // ---------- 填写 ----------
  async function insert(text) {
    if (!text) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // 有的页面不允许写剪贴板
    }
    try {
      const { ok } = await send({ type: 'fill:insert', text });
      if (ok) toast(copied ? '已填入（也复制到了剪贴板）' : '已填入', 'ok');
      else toast(copied ? '已复制。先点一下网页上要填的输入框，再点这里就能直接填入' : '先点一下网页上要填的输入框，再点这里', 'info');
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  function fillView() {
    const p = state.profile;
    if (!p) {
      return h('div', { class: 'empty' }, state.online
        ? '档案还是空的：先在 Tracker 的「档案」页填好。'
        : '连不上 Tracker，也没有缓存的档案。先双击「启动Tracker.command」，再点底部的「刷新」。');
    }
    const lang = effectiveLang();
    return [
      fillAllSection(),
      resumeSection(),
      h('div', { class: 'section' },
        h('h3', null, '点选填充'),
        h('p', { class: 'hint' }, '先点网页上的输入框，再点下面的内容就会填进去，同时复制到剪贴板。'),
        profileGroups(p, lang).map((g, i) => group(g, lang, i === 0)),
        answersGroup()),
    ];
  }

  function fillAllSection() {
    const btn = h('button', {
      class: 'primary big',
      onClick: async () => {
        btn.disabled = true;
        btn.textContent = '正在填写…';
        try {
          ui.result = await send({ type: 'fill:all', options: { lang: ui.lang, overwrite: ui.overwrite, reverse: ui.reverse } });
        } catch (e) {
          ui.result = { error: e.message };
        }
        render();
      },
    }, '一键填写本页');
    return h('div', { class: 'section first' },
      btn,
      h('div', { class: 'opts' },
        h('label', null, h('input', { type: 'checkbox', checked: ui.overwrite, onChange: (e) => { ui.overwrite = e.target.checked; } }), '覆盖已有内容'),
        h('label', null, h('input', { type: 'checkbox', checked: ui.reverse, onChange: (e) => { ui.reverse = e.target.checked; } }), '经历反过来填（早的在前）')),
      ui.result ? resultView(ui.result) : null);
  }

  function resultView(r) {
    if (r.error) return h('div', { class: 'result err' }, r.error);
    const parts = [h('b', null, `已填 ${r.filled} 项`)];
    if (r.uncertain) parts.push(` · 请核对 ${r.uncertain} 项（蓝框）`);
    if (r.manual) parts.push(` · 需要手动 ${r.manual} 项（黄框）`);
    const missing = Object.entries(r.missing || {}).map(([k, n]) => `${LIST_NAMES[k] || k}还差 ${n} 段`);
    let hint = '';
    if (missing.length) hint = `表单里的空位不够：${missing.join('，')}。先在网页上点「添加」，再点一次一键填写。`;
    else if (!r.filled && !r.uncertain && !r.manual) {
      hint = r.skipped
        ? `认出的 ${r.skipped} 项都已经有内容；要重填就勾上「覆盖已有内容」。`
        : '这个页面上没认出能填的字段，可以用下面的点选填充。';
    }
    return h('div', { class: 'result' },
      h('div', { class: ['sum', !r.filled && 'muted'] }, parts),
      hint ? h('p', { class: 'hint' }, hint) : null,
      h('div', { class: 'row' },
        h('span', { class: 'hint' }, '绿框已填 · 蓝框请核对 · 黄框要你来填'),
        h('button', {
          class: 'link',
          onClick: () => send({ type: 'fill:clear' }).then(() => { ui.result = null; render(); }).catch(() => {}),
        }, '清除标记')));
  }

  function resumeSection() {
    const resumes = (state.resumes || []).filter((r) => (r.files || []).length);
    if (!resumes.length) {
      return h('div', { class: 'section' }, h('h3', null, '上传简历'), h('p', { class: 'hint' }, '还没有简历文件：先在 Tracker 的「简历」页上传。'));
    }
    if (!resumes.some((r) => r.id === ui.resumeId)) ui.resumeId = resumes[0].id;
    const current = resumes.find((r) => r.id === ui.resumeId);
    const hasPdf = (current.files || []).some((f) => /\.pdf$/i.test(f.name));
    return h('div', { class: 'section' },
      h('h3', null, '上传简历'),
      h('div', { class: 'row' },
        h('select', { class: 'grow', value: ui.resumeId, onChange: (e) => { ui.resumeId = e.target.value; ui.attach = ''; render(); } },
          resumes.map((r) => h('option', { value: r.id }, r.name || '未命名版本'))),
        h('button', {
          class: 'btn',
          onClick: async () => {
            try {
              const res = await send({ type: 'resume:attach', resumeId: ui.resumeId });
              ui.attach = res.ok ? `已放进「${res.label}」：${res.file}` : res.reason;
            } catch (e) {
              ui.attach = e.message;
            }
            render();
          },
        }, '放进上传框')),
      hasPdf ? null : h('p', { class: 'hint' }, '这个版本只有 Word 文件。多数网申要 PDF，建议导出 PDF 后传到 Tracker。'),
      ui.attach ? h('p', { class: 'hint' }, ui.attach) : null);
  }

  function profileGroups(p, lang) {
    const b = p.basic || {};
    const it = p.intent || {};
    const pick = (v) => asBi(v)[lang] || asBi(v)[lang === 'zh' ? 'en' : 'zh'];
    const groups = [
      { title: '基本信息', items: [['姓名', b.name], ['英文名', b.preferredName], ['姓', b.familyName], ['名', b.givenName], ['手机', b.phone], ['区号', b.phoneCountryCode], ['邮箱', b.email], ['微信', b.wechat], ['性别', b.gender], ['出生日期', b.birthDate], ['现居城市', b.currentCity], ['籍贯', b.hometown], ['户口 / 生源地', b.residence], ['国籍', b.nationality], ['政治面貌', b.politicalStatus], ['民族', b.ethnicity], ['LinkedIn', b.linkedin], ['个人网站', b.website]] },
      { title: '求职意向', items: [['意向岗位', it.positions], ['意向城市', it.cities], ['期望薪资', it.salary], ['到岗时间', it.availableFrom], ['接受调剂', it.acceptAdjustment]] },
    ];
    (p.education || []).forEach((e, n) => groups.push({ title: `教育 ${n + 1} · ${pick(e.school)}`, items: [['学校', e.school], ['学历', e.degree], ['专业', e.major], ['学院', e.college], ['城市', e.city], ['开始', e.start], ['结束', e.end], ['GPA', e.gpa], ['满分', e.gpaScale], ['排名', e.rank], ['课程', e.courses], ['荣誉', e.honors]] }));
    (p.work || []).forEach((w, n) => groups.push({ title: `实习 ${n + 1} · ${pick(w.company)}`, items: [['公司', w.company], ['职位', w.title], ['部门', w.department], ['城市', w.city], ['开始', w.start], ['结束', w.end], ['工作内容', w.description]] }));
    (p.projects || []).forEach((x, n) => groups.push({ title: `项目 ${n + 1} · ${pick(x.name)}`, items: [['名称', x.name], ['角色', x.role], ['开始', x.start], ['结束', x.end], ['描述', x.description]] }));
    (p.activities || []).forEach((x, n) => groups.push({ title: `校园 ${n + 1} · ${pick(x.org)}`, items: [['组织', x.org], ['角色', x.role], ['开始', x.start], ['结束', x.end], ['描述', x.description]] }));
    (p.awards || []).forEach((x, n) => groups.push({ title: `获奖 ${n + 1}`, items: [['奖项', x.name], ['时间', x.date], ['说明', x.description]] }));
    (p.languages || []).forEach((x, n) => groups.push({ title: `语言 ${n + 1} · ${pick(x.language)}`, items: [['语言', x.language], ['水平', x.level], ['证书', x.certificate], ['成绩', x.score]] }));
    (p.certificates || []).forEach((x, n) => groups.push({ title: `证书 ${n + 1}`, items: [['名称', x.name], ['时间', x.date], ['成绩', x.score]] }));
    groups.push({ title: '技能与自我评价', items: [['技能', p.skills], ['自我评价', p.selfIntro], ['兴趣爱好', p.hobbies]] });
    if ((p.extras || []).length) groups.push({ title: '自定义字段', items: p.extras.map((x) => [x.label || '未命名', x.value]) });
    return groups
      .map((g) => ({ ...g, items: g.items.filter(([, v]) => asBi(v).zh || asBi(v).en) }))
      .filter((g) => g.items.length);
  }

  function group(g, lang, openByDefault) {
    const other = lang === 'zh' ? 'en' : 'zh';
    return h('details', { open: openByDefault },
      h('summary', null, g.title),
      h('div', { class: 'items' }, g.items.map(([label, value]) => {
        const bi = asBi(value);
        const main = bi[lang] || bi[other];
        const alt = bi[lang] && bi[other] && bi[other] !== bi[lang] ? bi[other] : '';
        return h('div', { class: 'item-row' },
          h('button', { class: 'item', title: main, onMousedown: noDefault, onClick: () => insert(main) },
            h('span', { class: 'k' }, label),
            h('span', { class: 'v' }, main)),
          alt ? h('button', { class: 'alt', title: alt, onMousedown: noDefault, onClick: () => insert(alt) }, other === 'en' ? 'EN' : '中') : null);
      })));
  }

  const answerItem = (a) => h('button', { class: 'item answer', title: a.text || '', onMousedown: noDefault, onClick: () => insert(a.text || '') },
    h('span', { class: 'k' }, a.category || '素材'),
    h('span', { class: 'v' }, h('b', null, a.question || '（没填题目）'), ' ', a.text || ''));

  function answersGroup() {
    const answers = state.answers || [];
    if (!answers.length) return null;
    const box = h('div', { class: 'items' });
    const refresh = () => {
      const q = ui.query.trim().toLowerCase();
      const list = answers.filter((a) => !q || [a.question, a.text, a.category, ...(a.tags || [])].join(' ').toLowerCase().includes(q));
      box.replaceChildren(...(list.length ? list.slice(0, 50).map(answerItem) : [h('div', { class: 'hint pad' }, '没有匹配的素材')]));
    };
    refresh();
    return h('details', { open: !!ui.query },
      h('summary', null, `素材库（${answers.length}）`),
      h('input', { class: 'search', placeholder: '搜索题目、回答、标签', value: ui.query, onInput: (e) => { ui.query = e.target.value; refresh(); } }),
      box);
  }

  // ---------- 记录投递 ----------
  async function detect() {
    const info = window.__jtAgent ? window.__jtAgent.pageInfo() : { url: location.href, text: '', company: '', position: '' };
    let text = info.text || '';
    try {
      const sel = await send({ type: 'clip:selection' });
      if (sel.text && sel.text.length >= 30) text = sel.text; // 选中了一段就只存选中的
    } catch {
      // 忽略
    }
    let parsed = {};
    try {
      parsed = await send({ type: 'clip:parse', text, url: info.url });
    } catch {
      // 出错时只用页面信息
    }
    // 官网域名表里认出的公司名最准；否则用页面标题里的，最后才用 ATS 代号
    const company = parsed.companyType ? parsed.company : info.company || parsed.company || '';
    const record = {
      company,
      companyType: parsed.companyType || '',
      position: info.position || parsed.position || '',
      cities: parsed.cities || '',
      deadline: parsed.deadline || '',
      jdUrl: info.url,
      stage: 'wishlist',
      track: '',
      resumeId: '',
      channel: '官网',
    };
    let dup = null;
    try {
      dup = (await send({ type: 'clip:find', url: info.url, company: record.company, position: record.position })).app;
    } catch {
      // 忽略
    }
    clip = { record, text, dup, saved: null };
    render();
  }

  async function saveClip() {
    const r = clip.record;
    if (!String(r.company).trim() && !String(r.position).trim()) {
      toast('公司和岗位至少填一个', 'err');
      return;
    }
    try {
      const record = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
      const { app: saved } = await send({ type: 'clip:save', record, jdText: clip.text });
      clip.saved = saved;
      render();
      toast('已保存到 Tracker', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  const field = (label, control, tag = 'label') => h(tag, { class: 'field' }, h('span', null, label), control);

  function seg(options, value, onChange) {
    const box = h('div', { class: 'seg' });
    const draw = (v) => box.replaceChildren(...options.map(([k, label]) => h('button', { class: k === v ? 'on' : '', onClick: () => { draw(k); onChange(k); } }, label)));
    draw(value);
    return box;
  }

  const openInTracker = (id) => send({ type: 'tracker:open', id }).catch((e) => toast(e.message, 'err'));

  function dupView(a) {
    const closed = CLOSED[a.status];
    return h('div', { class: 'dup' },
      h('div', null, '这个岗位已经记过：', h('b', null, `${a.company || ''} · ${a.position || ''}`)),
      h('div', { class: 'row' },
        h('span', { class: 'hint' }, closed ? `状态：${closed}` : '阶段'),
        closed ? null : h('select', {
          value: a.stage,
          onChange: async (e) => {
            try {
              const { app: next } = await send({ type: 'clip:stage', id: a.id, stage: e.target.value });
              clip.dup = next;
              toast(`已改成「${STAGE_LABEL[next.stage]}」`, 'ok');
              render();
            } catch (err) {
              toast(err.message, 'err');
            }
          },
        }, STAGES.map(([k, label]) => h('option', { value: k }, label))),
        h('button', { class: 'link', onClick: () => openInTracker(a.id) }, '在 Tracker 里打开')));
  }

  function savedView() {
    const a = clip.saved;
    return h('div', { class: 'saved' },
      h('div', null, '已保存：', h('b', null, `${a.company || ''} · ${a.position || ''}`)),
      h('p', { class: 'hint' }, a.stage === 'applied' ? '状态：已投递，投递日期记为今天。' : '状态：待投递。投完后在 Tracker 里把卡片拖到「已投递」。'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onClick: () => openInTracker(a.id) }, '在 Tracker 里打开'),
        h('button', { class: 'link', onClick: () => { clip = null; detect(); render(); } }, '再记一条')));
  }

  function clipView() {
    if (!state.online) return h('div', { class: 'empty' }, '记录投递需要 Tracker 在运行：先双击「启动Tracker.command」，再点底部的「刷新」。');
    if (!clip) return h('div', { class: 'empty' }, '正在识别这个页面…');
    if (clip.saved) return savedView();
    const r = clip.record;
    const text = (key, placeholder = '') => h('input', { value: r[key] || '', placeholder, onInput: (e) => { r[key] = e.target.value; } });
    const resumes = state.resumes || [];
    return [
      clip.dup ? dupView(clip.dup) : null,
      field('公司', text('company', '如：雀巢')),
      field('岗位', text('position', '如：Marketing MT')),
      h('div', { class: 'two' },
        field('城市', text('cities', '多个用 / 分隔')),
        field('网申截止', h('input', { type: 'date', value: r.deadline || '', onInput: (e) => { r.deadline = e.target.value; } }))),
      field('链接', text('jdUrl')),
      h('div', { class: 'two' },
        field('赛道', h('select', { value: r.track, onChange: (e) => { r.track = e.target.value; } },
          h('option', { value: '' }, '未选择'),
          ['产品', '市场', '其他'].map((t) => h('option', { value: t }, t)))),
        field('投的简历', h('select', { value: r.resumeId, onChange: (e) => { r.resumeId = e.target.value; } },
          h('option', { value: '' }, '未选择'),
          resumes.map((x) => h('option', { value: x.id }, x.name || '未命名版本'))))),
      field('状态', seg([['wishlist', '还没投'], ['applied', '已投递']], r.stage, (v) => { r.stage = v; }), 'div'),
      h('details', { class: 'jd' },
        h('summary', null, `JD 全文（${clip.text.length} 字，保存时一起存成快照）`),
        h('textarea', { value: clip.text, onInput: (e) => { clip.text = e.target.value; } })),
      h('div', { class: 'row actions' },
        h('button', { class: 'primary grow', onClick: saveClip }, clip.dup ? '仍然另存一条' : '保存到 Tracker'),
        h('button', { class: 'btn', onClick: () => { clip = null; detect(); render(); } }, '重新识别')),
    ];
  }

  window.__jtPanel = { toggle, open, close, isOpen: () => !!host };
})();
```

- [ ] **Step 2: 语法检查**

Run: `node --check extension/content/panel.js && echo ok`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add extension/content/panel.js
git commit -m "feat(extension): sidebar panel for fill, resume upload and clipping"
```

---
### Task 9: manifest、后台入口、图标

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/background.js`
- Create: `extension/scripts/make-icons.mjs`
- Create: `extension/icons/icon{16,32,48,128}.png`（脚本生成）
- Test: `extension/test/manifest.test.js`

- [ ] **Step 1: 写失败的测试**

```js file=extension/test/manifest.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_FILES } from '../bg/handlers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('manifest 基本字段', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), ['scripting', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.action.default_popup, undefined, '点图标要触发 onClicked，不能设 popup');
  assert.ok(manifest.commands['toggle-panel']);
});

test('manifest 和后台引用的文件都存在', () => {
  const files = [
    manifest.background.service_worker,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...AGENT_FILES,
    'content/panel.js',
  ];
  for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), f);
});

test('图标都是 PNG', () => {
  for (const f of Object.values(manifest.icons)) {
    const head = [...fs.readFileSync(path.join(root, f)).subarray(0, 8)];
    assert.deepEqual(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], f);
  }
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL，找不到 `extension/manifest.json`

- [ ] **Step 3: manifest**

```json file=extension/manifest.json
{
  "manifest_version": 3,
  "name": "秋招助手",
  "version": "1.0.0",
  "description": "配合本地秋招 Tracker：网申一键填写、点选填充、上传简历、收藏岗位。",
  "permissions": ["storage", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_title": "秋招助手（⌥⇧J）",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "commands": {
    "toggle-panel": {
      "suggested_key": {
        "default": "Alt+Shift+J",
        "mac": "Alt+Shift+J"
      },
      "description": "打开或关闭秋招助手侧边栏"
    }
  }
}
```

- [ ] **Step 4: 后台入口**

```js file=extension/background.js
// 秋招助手后台：点图标或按快捷键打开侧边栏；处理侧边栏发来的消息。
import { createHandlers } from './bg/handlers.js';

const { handlers, toggle } = createHandlers({ chrome, fetch: (...args) => fetch(...args) });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg && msg.type];
  if (!handler) return false;
  Promise.resolve()
    .then(() => handler(msg, sender.tab ? sender.tab.id : undefined))
    .then(sendResponse, (e) => sendResponse({ error: (e && e.message) || String(e) }));
  return true; // 异步回复
});

async function openPanel(tab) {
  if (!tab || tab.id == null) return;
  try {
    await toggle(tab.id);
  } catch (e) {
    // chrome:// 页面、应用商店等不允许注入：在图标上提示一下
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setTitle({ tabId: tab.id, title: `秋招助手不能在这个页面使用：${e.message}` });
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: '' }).catch(() => {}), 3000);
  }
}

chrome.action.onClicked.addListener(openPanel);
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-panel') openPanel(tab);
});
```

- [ ] **Step 5: 图标脚本并生成图标**

```js file=extension/scripts/make-icons.mjs
// 生成插件图标：靛蓝圆角方块 + 白色对勾，4×4 超采样抗锯齿。运行：node extension/scripts/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../icons');
const ACCENT = [0x4f, 0x5b, 0xd5];
const WHITE = [255, 255, 255];
const CHECK = [[0.28, 0.53], [0.44, 0.68], [0.73, 0.36]];

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixel) {
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4); // 每行开头 1 字节滤波类型（0 = 不滤波）
    for (let x = 0; x < size; x += 1) row.set(pixel(x, y), 1 + x * 4);
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 位深
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inRoundedSquare(u, v, r) {
  const cx = Math.min(Math.max(u, r), 1 - r);
  const cy = Math.min(Math.max(v, r), 1 - r);
  return Math.hypot(u - cx, v - cy) <= r;
}

function colorAt(u, v) {
  if (!inRoundedSquare(u, v, 0.24)) return null;
  const d = Math.min(segmentDistance(u, v, CHECK[0], CHECK[1]), segmentDistance(u, v, CHECK[1], CHECK[2]));
  return d <= 0.065 ? WHITE : ACCENT;
}

function render(size) {
  const n = 4;
  return encodePng(size, (x, y) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let hits = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const c = colorAt((x + (i + 0.5) / n) / size, (y + (j + 0.5) / n) / size);
        if (c) {
          r += c[0];
          g += c[1];
          b += c[2];
          hits += 1;
        }
      }
    }
    if (!hits) return [0, 0, 0, 0];
    return [Math.round(r / hits), Math.round(g / hits), Math.round(b / hits), Math.round((hits / (n * n)) * 255)];
  });
}

fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), render(size));
  console.log(`icons/icon${size}.png`);
}
```

Run: `node extension/scripts/make-icons.mjs`
Expected: 输出 4 行 `icons/iconN.png`；用内置浏览器打开 `extension/icons/icon128.png` 能看到靛蓝圆角方块和白色对勾

- [ ] **Step 6: 运行测试，确认通过**

Run: `npm test && node --check extension/background.js && echo ok`
Expected: PASS（manifest 的 3 个测试通过），最后输出 `ok`

- [ ] **Step 7: Commit**

```bash
git add extension/manifest.json extension/background.js extension/scripts/make-icons.mjs extension/icons extension/test/manifest.test.js
git commit -m "feat(extension): manifest, background wiring and icons"
```

---

### Task 10: 测试页与模拟后台，在内置浏览器里验证

测试页模仿常见网申表单的结构：普通 HTML、Ant Design（含 React 式受控输入、自定义下拉、远程搜索下拉、日期范围）、Element UI、Workday（英文）、iframe 嵌套，外加一个招聘详情页用来测「记录投递」。`harness.js` 在普通网页里模拟 `chrome.runtime.sendMessage`，把请求交给各 frame 的 `__jtAgent`，所以侧边栏也能在这里完整操作。测试数据全是假的。

**Files:**
- Create: `extension/test/serve.mjs`
- Create: `extension/test/fixture-data.js`
- Create: `extension/test/harness.js`
- Create: `extension/test/pages/index.html`、`plain.html`、`antd.html`、`element.html`、`workday.html`、`iframe.html`、`job.html`

- [ ] **Step 1: 测试页静态服务**

```js file=extension/test/serve.mjs
// 测试页用的静态服务：只提供 extension/ 和 shared/（不会暴露 data/），只绑定 127.0.0.1。
// 运行：node extension/test/serve.mjs，然后打开 http://127.0.0.1:7320/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.PORT || 7320);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (rel === '/') rel = '/extension/test/pages/index.html';
  const full = path.resolve(root, `.${rel}`);
  const allowed = [path.join(root, 'extension') + path.sep, path.join(root, 'shared') + path.sep];
  if (!allowed.some((dir) => full.startsWith(dir))) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(port, '127.0.0.1', () => console.log(`测试页：http://127.0.0.1:${port}/`));
```

- [ ] **Step 2: 假档案**

```js file=extension/test/fixture-data.js
// 测试用的假档案：不含任何真实信息
window.JT_FIXTURE = {
  profile: {
    basic: {
      name: { zh: '张三', en: 'San Zhang' },
      familyName: { zh: '张', en: 'Zhang' },
      givenName: { zh: '三', en: 'San' },
      preferredName: 'Sam',
      gender: '女',
      birthDate: '2001-05-20',
      phone: '13800000000',
      phoneCountryCode: '+86',
      email: 'sam@example.com',
      wechat: 'sam_wx',
      currentCity: { zh: '杭州', en: 'Hangzhou' },
      hometown: { zh: '江苏南京', en: 'Nanjing' },
      residence: { zh: '', en: '' },
      nationality: { zh: '中国', en: 'China' },
      politicalStatus: '共青团员',
      ethnicity: '汉族',
      linkedin: '',
      website: '',
    },
    intent: { positions: { zh: '市场管培生', en: 'Marketing MT' }, cities: { zh: '杭州', en: 'Hangzhou' }, salary: '', availableFrom: '2027-07', acceptAdjustment: '是' },
    education: [
      { id: 'edu_1', school: { zh: '示例大学', en: 'Example University' }, degree: { zh: '硕士', en: "Master's" }, major: { zh: '数据科学', en: 'Data Science' }, college: { zh: '', en: '' }, city: { zh: '北京', en: 'Beijing' }, start: '2025-09', end: '2027-05', gpa: '3.9', gpaScale: '4.0', rank: '', courses: { zh: '', en: '' }, honors: { zh: '', en: '' } },
      { id: 'edu_2', school: { zh: '测试学院', en: 'Test College' }, degree: { zh: '本科', en: "Bachelor's" }, major: { zh: '心理学', en: 'Psychology' }, college: { zh: '', en: '' }, city: { zh: '杭州', en: 'Hangzhou' }, start: '2020-09', end: '2024-06', gpa: '3.8', gpaScale: '4.0', rank: '', courses: { zh: '', en: '' }, honors: { zh: '', en: '' } },
    ],
    work: [
      { id: 'work_1', company: { zh: '示例咨询', en: 'Example Consulting' }, title: { zh: '战略实习生', en: 'Strategy Intern' }, department: { zh: '', en: '' }, type: '实习', city: { zh: '北京', en: 'Beijing' }, start: '2025-05', end: '2025-08', description: { zh: '• 完成 20 场用户访谈\n• 整理竞品资料', en: '• Ran 20 user interviews\n• Compiled competitor research' } },
      { id: 'work_2', company: { zh: '测试科技', en: 'Test Tech' }, title: { zh: '产品实习生', en: 'Product Intern' }, department: { zh: '', en: '' }, type: '实习', city: { zh: '杭州', en: 'Hangzhou' }, start: '2024-08', end: '2025-01', description: { zh: '• 写需求文档', en: '• Wrote product specs' } },
    ],
    projects: [{ id: 'proj_1', name: { zh: '校园咖啡调研', en: 'Campus Coffee Survey' }, role: { zh: '负责人', en: 'Lead' }, start: '2026-01', end: '2026-05', description: { zh: '• 回收 200 份问卷', en: '• Collected 200 surveys' } }],
    activities: [],
    awards: [],
    languages: [{ id: 'lang_1', language: { zh: '英语', en: 'English' }, level: { zh: '精通', en: 'Fluent' }, certificate: '', score: '' }],
    certificates: [],
    skills: { zh: 'Python、SQL', en: 'Python, SQL' },
    selfIntro: { zh: '认真负责，善于沟通。', en: 'Diligent and a clear communicator.' },
    hobbies: { zh: '跑步', en: 'Running' },
    extras: [{ id: 'ext_1', label: '是否有海外经历', value: { zh: '是', en: 'Yes' } }],
  },
  answers: [{ id: 'ans_1', category: 'Why 公司', lang: 'zh', question: '为什么选择我们？', text: '因为贵司的品牌理念和我的经历很契合。', tags: ['快消'] }],
  resumes: [{ id: 'res_1', name: '市场线-中文', files: [{ name: '测试简历.pdf', stored: 'resumes/res_1__x__测试简历.pdf', size: 13 }] }],
  applications: [],
  settings: {},
};
```

- [ ] **Step 3: 模拟后台**

```js file=extension/test/harness.js
// 测试页的「假后台」：模拟 chrome.runtime.sendMessage，把请求直接交给当前页和同源 iframe 里的 __jtAgent。
// 页面先用普通 <script> 加载内容脚本和 fixture-data.js，再用 <script type="module"> 加载本文件。
import { aggregateFill, bestFileTarget } from '../bg/logic.js';
import { parseJD } from '/shared/jdparse.js';

const DATA = window.JT_FIXTURE;

// 测试时把侧边栏的 closed shadow root 改成 open，方便用脚本检查里面的内容
const attach = Element.prototype.attachShadow;
Element.prototype.attachShadow = function attachOpen(init) {
  return attach.call(this, { ...init, mode: 'open' });
};

function agents() {
  const out = [];
  const walk = (w) => {
    try {
      if (w.__jtAgent) out.push(w);
    } catch {
      return; // 跨域 frame
    }
    for (let i = 0; i < w.frames.length; i += 1) walk(w.frames[i]);
  };
  walk(window);
  return out;
}

const handlers = {
  'state:get': async () => ({ online: true, server: 'http://127.0.0.1:7317', cachedAt: new Date().toISOString(), ...DATA }),
  'fill:all': async ({ options }) => {
    const results = [];
    for (const w of agents()) results.push(await w.__jtAgent.fillAll({ profile: DATA.profile, options }));
    return aggregateFill(results);
  },
  'fill:insert': async ({ text }) => ({ ok: agents().some((w) => w.__jtAgent.insertFocused(text)) }),
  'fill:clear': async () => {
    agents().forEach((w) => w.__jtAgent.clearMarks());
    return { ok: true };
  },
  'resume:attach': async () => {
    const list = agents();
    const target = bestFileTarget(list.map((w, frameId) => ({ frameId, candidates: w.__jtAgent.findFileInputs() })));
    if (!target) return { ok: false, reason: '这个页面上没找到上传简历的地方' };
    const file = { name: '测试简历.pdf', type: 'application/pdf', b64: btoa('%PDF-1.4 test') };
    return { ok: list[target.frameId].__jtAgent.attachFile(target.index, file), label: target.label, file: file.name };
  },
  'clip:selection': async () => ({ text: agents().map((w) => String(w.getSelection())).sort((a, b) => b.length - a.length)[0] || '' }),
  'clip:parse': async ({ text, url }) => parseJD(text, url),
  'clip:find': async () => ({ app: window.jtTest.dup }),
  'clip:save': async ({ record, jdText }) => {
    window.jtTest.saved = { record, jdText };
    return { app: { id: 'app_test', ...record } };
  },
  'clip:stage': async ({ id, stage }) => ({ app: { ...(window.jtTest.dup || {}), id, stage } }),
  'tracker:open': async () => ({ ok: true }),
  'server:set': async () => handlers['state:get'](),
};

window.chrome = window.chrome || {};
window.chrome.runtime = {
  sendMessage: async (msg) => {
    try {
      return await handlers[msg.type](msg);
    } catch (e) {
      return { error: e.message };
    }
  },
};

window.jtTest = {
  dup: null,
  saved: null,
  fill: (options = {}) => handlers['fill:all']({ options: { lang: 'auto', overwrite: false, reverse: false, ...options } }),
  insert: (text) => handlers['fill:insert']({ text }),
  attach: () => handlers['resume:attach']({}),
  panelRoot: () => document.getElementById('jt-panel-host')?.shadowRoot || null,
  async openPanel() {
    if (!window.__jtPanel) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/extension/content/panel.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.append(s);
      });
    }
    if (!window.__jtPanel.isOpen()) window.__jtPanel.open();
  },
};
document.documentElement.dataset.harness = 'ready';
```

- [ ] **Step 4: 测试页**

```html file=extension/test/pages/index.html
<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>秋招助手 · 测试页</title>
<style>body{font:15px/1.8 -apple-system,"PingFang SC",sans-serif;max-width:640px;margin:40px auto;padding:0 16px}</style></head>
<body>
<h1>秋招助手 · 测试页</h1>
<ul>
  <li><a href="/extension/test/pages/plain.html">普通 HTML 表单（中文）</a></li>
  <li><a href="/extension/test/pages/antd.html">Ant Design 风格（受控输入、自定义下拉、远程搜索、日期范围）</a></li>
  <li><a href="/extension/test/pages/element.html">Element UI 风格</a></li>
  <li><a href="/extension/test/pages/workday.html">Workday 风格（英文）</a></li>
  <li><a href="/extension/test/pages/iframe.html">表单在 iframe 里</a></li>
  <li><a href="/extension/test/pages/job.html">招聘详情页（测记录投递）</a></li>
</ul>
</body>
</html>
```

```html file=extension/test/pages/plain.html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>网申 · 普通表单</title>
<style>
  body { font: 14px/1.6 -apple-system, "PingFang SC", sans-serif; max-width: 720px; margin: 24px auto; padding: 0 16px; }
  label { display: block; margin: 8px 0 2px; }
  input, select, textarea { display: block; width: 100%; padding: 6px; box-sizing: border-box; }
  input[type="radio"] { display: inline; width: auto; }
  fieldset { margin: 12px 0; }
</style>
</head>
<body>
<h1>网申表单（普通 HTML）</h1>
<form id="f" onsubmit="event.preventDefault(); document.body.dataset.submitted = '1';">
  <h2>基本信息</h2>
  <label for="name">姓名 *</label><input id="name" required>
  <label for="en">英文名</label><input id="en">
  <label>手机号码<input id="phone" type="tel"></label>
  <label for="email">电子邮箱</label><input id="email" type="email">
  <div id="gender">性别 <label><input type="radio" name="gender" value="m">男</label><label><input type="radio" name="gender" value="f">女</label></div>
  <label for="birth">出生日期</label><input id="birth" type="date">
  <label for="pol">政治面貌</label>
  <select id="pol"><option value="">请选择</option><option>中共党员</option><option>中共预备党员</option><option>共青团员</option><option>群众</option></select>
  <label for="city">现居城市</label><input id="city">
  <label for="captcha">验证码 *</label><input id="captcha" required>
  <label for="pwd">密码</label><input id="pwd" type="password">

  <h2>教育经历</h2>
  <fieldset><legend>第 1 段</legend>
    <label>学校名称<input class="school"></label>
    <label>学历<select class="degree"><option value="">请选择</option><option>本科</option><option>硕士研究生</option><option>博士研究生</option></select></label>
    <label>专业<input class="major"></label>
    <label>入学时间<input class="start" type="month"></label>
    <label>毕业时间<input class="end" type="month"></label>
    <label>GPA<input class="gpa"></label>
  </fieldset>
  <fieldset><legend>第 2 段</legend>
    <label>学校名称<input class="school"></label>
    <label>学历<select class="degree"><option value="">请选择</option><option>本科</option><option>硕士研究生</option><option>博士研究生</option></select></label>
    <label>专业<input class="major"></label>
    <label>入学时间<input class="start" type="month"></label>
    <label>毕业时间<input class="end" type="month"></label>
    <label>GPA<input class="gpa"></label>
  </fieldset>

  <h2>实习经历</h2>
  <fieldset><legend>第 1 段</legend>
    <label>公司名称<input class="company"></label>
    <label>职位<input class="title"></label>
    <label>开始时间<input class="wstart" placeholder="YYYY-MM"></label>
    <label>结束时间<input class="wend" placeholder="YYYY-MM"></label>
    <label>工作内容<textarea class="desc" maxlength="500"></textarea></label>
  </fieldset>

  <h2>其他</h2>
  <label>自我评价<textarea id="self"></textarea></label>
  <label>是否有海外经历<input id="overseas"></label>
  <label>微信号（已有内容，不该被覆盖）<input id="wechat" value="我自己填的"></label>
  <label>上传简历<input id="resume" type="file" accept=".pdf,.doc,.docx"></label>
  <label>上传证件照<input id="photo" type="file" accept="image/*"></label>
  <button type="submit">提交</button>
</form>
<script src="/extension/content/lib/fields.js"></script>
<script src="/extension/content/lib/match.js"></script>
<script src="/extension/content/lib/fill.js"></script>
<script src="/extension/content/lib/clip.js"></script>
<script src="/extension/content/agent.js"></script>
<script src="/extension/test/fixture-data.js"></script>
<script type="module" src="/extension/test/harness.js"></script>
</body>
</html>
```

```html file=extension/test/pages/antd.html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>网申 · Ant Design 风格</title>
<style>
  body { font: 14px/1.6 -apple-system, "PingFang SC", sans-serif; max-width: 720px; margin: 24px auto; padding: 0 16px; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 18px; font-weight: 600; margin: 16px 0 8px; }
  .ant-form-item { display: flex; gap: 12px; margin: 8px 0; align-items: center; }
  .ant-form-item-label { width: 110px; text-align: right; }
  .ant-form-item-required::before { content: "* "; color: #c00; }
  .ant-form-item-control { flex: 1; }
  .ant-input, .ant-picker-input input { width: 100%; padding: 6px; box-sizing: border-box; }
  .ant-select { position: relative; border: 1px solid #ccc; border-radius: 4px; min-height: 32px; }
  .ant-select-selector { display: flex; align-items: center; min-height: 32px; padding: 0 8px; cursor: pointer; }
  .ant-select-selection-search input { border: 0; outline: 0; width: 140px; }
  .ant-select-selection-placeholder { color: #999; }
  .ant-select-dropdown { background: #fff; border: 1px solid #ddd; box-shadow: 0 4px 12px rgba(0,0,0,.15); z-index: 10; }
  .ant-select-item-option { padding: 6px 10px; cursor: pointer; }
  .ant-select-item-option:hover { background: #eef; }
  .ant-picker-range { display: flex; gap: 8px; align-items: center; }
  #model { background: #f6f6f6; padding: 8px; white-space: pre-wrap; font: 12px monospace; }
</style>
</head>
<body>
<h1>网申表单（Ant Design 风格）</h1>
<div class="section">
  <div class="section-title">基本信息</div>
  <div class="ant-form-item"><div class="ant-form-item-label"><label class="ant-form-item-required" title="姓名">姓名</label></div><div class="ant-form-item-control"><input class="ant-input" data-model="name"></div></div>
  <div class="ant-form-item"><div class="ant-form-item-label"><label title="手机号">手机号</label></div><div class="ant-form-item-control"><input class="ant-input" data-model="phone"></div></div>
  <div class="ant-form-item"><div class="ant-form-item-label"><label class="ant-form-item-required" title="性别">性别</label></div><div class="ant-form-item-control">
    <div class="ant-select" data-model="gender" data-options="男,女"><div class="ant-select-selector"><span class="ant-select-selection-search"><input readonly></span><span class="ant-select-selection-placeholder">请选择</span></div></div>
  </div></div>
</div>
<div class="section">
  <div class="section-title">教育经历</div>
  <div class="ant-form-item"><div class="ant-form-item-label"><label class="ant-form-item-required" title="学校">学校</label></div><div class="ant-form-item-control">
    <div class="ant-select" data-model="school" data-remote data-options="示例大学,示例大学附属中学,测试学院,Example University"><div class="ant-select-selector"><span class="ant-select-selection-search"><input placeholder="输入学校名搜索"></span></div></div>
  </div></div>
  <div class="ant-form-item"><div class="ant-form-item-label"><label title="学历">学历</label></div><div class="ant-form-item-control">
    <div class="ant-select" data-model="degree" data-options="本科,硕士,博士"><div class="ant-select-selector"><span class="ant-select-selection-search"><input readonly></span><span class="ant-select-selection-placeholder">请选择</span></div></div>
  </div></div>
  <div class="ant-form-item"><div class="ant-form-item-label"><label title="专业">专业</label></div><div class="ant-form-item-control"><input class="ant-input" data-model="major"></div></div>
  <div class="ant-form-item"><div class="ant-form-item-label"><label title="在校时间">在校时间</label></div><div class="ant-form-item-control">
    <div class="ant-picker ant-picker-range"><div class="ant-picker-input"><input placeholder="开始月份" data-model="eduStart"></div><span>→</span><div class="ant-picker-input"><input placeholder="结束月份" data-model="eduEnd"></div></div>
  </div></div>
</div>
<h3>model</h3>
<pre id="model"></pre>
<script>
  window.model = {};
  const showModel = () => { document.getElementById('model').textContent = JSON.stringify(window.model, null, 2); };
  // React 风格受控输入：实例上装了 value 追踪，直接 input.value = x 不会被认为是用户输入
  document.querySelectorAll('input[data-model]').forEach((input) => {
    const key = input.dataset.model;
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    let tracked = input.value;
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) { tracked = String(v); desc.set.call(this, v); },
    });
    input.addEventListener('input', () => {
      const now = desc.get.call(input);
      if (now !== tracked) { tracked = now; window.model[key] = now; showModel(); }
    });
  });
  // 自定义下拉：mousedown 打开，点选项选中；data-remote 的要先输入关键字才有选项
  document.querySelectorAll('.ant-select').forEach((sel) => {
    const key = sel.dataset.model;
    const all = sel.dataset.options.split(',');
    const remote = sel.hasAttribute('data-remote');
    const selector = sel.querySelector('.ant-select-selector');
    const search = sel.querySelector('input');
    let dropdown = null;
    const close = () => { if (dropdown) dropdown.remove(); dropdown = null; };
    const show = (list) => {
      close();
      dropdown = document.createElement('div');
      dropdown.className = 'ant-select-dropdown';
      const r = sel.getBoundingClientRect();
      dropdown.style.cssText = `position:absolute;left:${r.left + scrollX}px;top:${r.bottom + scrollY}px;width:${r.width}px`;
      for (const text of list) {
        const item = document.createElement('div');
        item.className = 'ant-select-item ant-select-item-option';
        const content = document.createElement('div');
        content.className = 'ant-select-item-option-content';
        content.textContent = text;
        item.append(content);
        item.addEventListener('click', () => {
          window.model[key] = text;
          showModel();
          const ph = sel.querySelector('.ant-select-selection-placeholder');
          if (ph) ph.remove();
          let shown = sel.querySelector('.ant-select-selection-item');
          if (!shown) { shown = document.createElement('span'); shown.className = 'ant-select-selection-item'; selector.append(shown); }
          shown.textContent = text;
          search.value = '';
          close();
        });
        dropdown.append(item);
      }
      document.body.append(dropdown);
    };
    selector.addEventListener('mousedown', () => { if (!dropdown) show(remote ? [] : all); });
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      show(remote && !q ? [] : all.filter((t) => t.toLowerCase().includes(q)));
    });
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.addEventListener('mousedown', (e) => { if (dropdown && !sel.contains(e.target) && !dropdown.contains(e.target)) close(); });
  });
</script>
<script src="/extension/content/lib/fields.js"></script>
<script src="/extension/content/lib/match.js"></script>
<script src="/extension/content/lib/fill.js"></script>
<script src="/extension/content/lib/clip.js"></script>
<script src="/extension/content/agent.js"></script>
<script src="/extension/test/fixture-data.js"></script>
<script type="module" src="/extension/test/harness.js"></script>
</body>
</html>
```

```html file=extension/test/pages/element.html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>网申 · Element UI 风格</title>
<style>
  body { font: 14px/1.6 -apple-system, "PingFang SC", sans-serif; max-width: 720px; margin: 24px auto; padding: 0 16px; }
  .el-form-item { display: flex; gap: 12px; margin: 10px 0; align-items: center; }
  .el-form-item__label { width: 100px; text-align: right; }
  .is-required .el-form-item__label::before { content: "* "; color: #f56c6c; }
  .el-form-item__content { flex: 1; }
  .el-input__inner { width: 100%; padding: 6px; box-sizing: border-box; }
  .el-select .el-input__inner { cursor: pointer; }
  .el-select-dropdown__item { list-style: none; padding: 6px 10px; cursor: pointer; }
  .el-select-dropdown ul { margin: 0; padding: 4px 0; }
</style>
</head>
<body>
<h1>网申表单（Element UI 风格）</h1>
<div class="block">
  <h3 class="block-title">基本信息</h3>
  <form class="el-form" onsubmit="return false">
    <div class="el-form-item is-required"><label class="el-form-item__label">姓名</label><div class="el-form-item__content"><div class="el-input"><input class="el-input__inner" data-model="name"></div></div></div>
    <div class="el-form-item"><label class="el-form-item__label">邮箱</label><div class="el-form-item__content"><div class="el-input"><input class="el-input__inner" data-model="email"></div></div></div>
    <div class="el-form-item is-required"><label class="el-form-item__label">政治面貌</label><div class="el-form-item__content">
      <div class="el-select" data-model="political" data-options="中共党员,中共预备党员,共青团员,群众"><div class="el-input"><input class="el-input__inner" readonly placeholder="请选择"></div></div>
    </div></div>
    <div class="el-form-item is-required"><label class="el-form-item__label">籍贯</label><div class="el-form-item__content"><div class="el-input"><input class="el-input__inner" data-model="hometown"></div></div></div>
    <div class="el-form-item is-required"><label class="el-form-item__label">身份证号</label><div class="el-form-item__content"><div class="el-input"><input class="el-input__inner" data-model="idcard"></div></div></div>
  </form>
</div>
<div class="block">
  <h3 class="block-title">实习经历</h3>
  <form class="el-form" onsubmit="return false">
    <div class="el-form-item"><label class="el-form-item__label">实习单位</label><div class="el-form-item__content"><div class="el-input"><input class="el-input__inner" data-model="company"></div></div></div>
    <div class="el-form-item"><label class="el-form-item__label">岗位</label><div class="el-form-item__content"><div class="el-input"><input class="el-input__inner" data-model="title"></div></div></div>
    <div class="el-form-item"><label class="el-form-item__label">描述</label><div class="el-form-item__content"><textarea class="el-textarea__inner" data-model="desc" rows="3" style="width:100%"></textarea></div></div>
  </form>
</div>
<pre id="model"></pre>
<script>
  window.model = {};
  const showModel = () => { document.getElementById('model').textContent = JSON.stringify(window.model, null, 2); };
  // Vue 风格：input 事件更新 model
  document.querySelectorAll('[data-model]:not(.el-select)').forEach((el) => {
    el.addEventListener('input', () => { window.model[el.dataset.model] = el.value; showModel(); });
  });
  // el-select：点输入框打开下拉（下拉挂在 body 上，平时隐藏）
  document.querySelectorAll('.el-select').forEach((sel) => {
    const input = sel.querySelector('input');
    const dd = document.createElement('div');
    dd.className = 'el-select-dropdown el-popper';
    dd.style.cssText = 'display:none;position:absolute;background:#fff;border:1px solid #ddd;z-index:10';
    const ul = document.createElement('ul');
    for (const text of sel.dataset.options.split(',')) {
      const li = document.createElement('li');
      li.className = 'el-select-dropdown__item';
      const span = document.createElement('span');
      span.textContent = text;
      li.append(span);
      li.addEventListener('click', () => { input.value = text; window.model[sel.dataset.model] = text; showModel(); dd.style.display = 'none'; });
      ul.append(li);
    }
    dd.append(ul);
    document.body.append(dd);
    input.addEventListener('click', () => {
      const r = input.getBoundingClientRect();
      dd.style.left = `${r.left + scrollX}px`;
      dd.style.top = `${r.bottom + scrollY}px`;
      dd.style.minWidth = `${r.width}px`;
      dd.style.display = 'block';
    });
    document.addEventListener('mousedown', (e) => { if (!sel.contains(e.target) && !dd.contains(e.target)) dd.style.display = 'none'; });
  });
</script>
<script src="/extension/content/lib/fields.js"></script>
<script src="/extension/content/lib/match.js"></script>
<script src="/extension/content/lib/fill.js"></script>
<script src="/extension/content/lib/clip.js"></script>
<script src="/extension/content/agent.js"></script>
<script src="/extension/test/fixture-data.js"></script>
<script type="module" src="/extension/test/harness.js"></script>
</body>
</html>
```

```html file=extension/test/pages/workday.html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Apply · Workday style</title>
<style>
  body { font: 14px/1.6 -apple-system, sans-serif; max-width: 720px; margin: 24px auto; padding: 0 16px; }
  label { display: block; margin: 10px 0 2px; font-weight: 600; }
  input, select, textarea { display: block; width: 100%; padding: 6px; box-sizing: border-box; }
</style>
</head>
<body>
<h1>Apply for Brand Management Trainee</h1>
<h2 data-automation-id="sectionHeader">My Information</h2>
<div data-automation-id="formField-legalNameSection_firstName"><label for="fn">First Name*</label><input id="fn" data-automation-id="legalNameSection_firstName"></div>
<div data-automation-id="formField-legalNameSection_lastName"><label for="ln">Last Name*</label><input id="ln" data-automation-id="legalNameSection_lastName"></div>
<div><label for="em">Email Address*</label><input id="em" type="email"></div>
<div data-automation-id="formField-countryPhoneCode"><label for="cc">Country Phone Code</label><select id="cc"><option>Select One</option><option>United States (+1)</option><option>China (+86)</option></select></div>
<div><label for="ph">Phone Number*</label><input id="ph" type="tel"></div>
<div><input id="nolabel" data-automation-id="addressSection_city" placeholder=""></div>

<h2 data-automation-id="sectionHeader">Education</h2>
<div><label for="sc">School or University*</label><input id="sc"></div>
<div><label for="dg">Degree*</label><select id="dg"><option>Select One</option><option>Bachelor of Arts</option><option>Master of Science</option><option>PhD</option></select></div>
<div><label for="fs">Field of Study</label><input id="fs"></div>
<div><label for="efrom">From</label><input id="efrom" placeholder="MM/YYYY"></div>
<div><label for="eto">To (Actual or Expected)</label><input id="eto" placeholder="MM/YYYY"></div>

<h2 data-automation-id="sectionHeader">Work Experience</h2>
<div><label for="jt">Job Title*</label><input id="jt"></div>
<div><label for="co">Company*</label><input id="co"></div>
<div><label for="wfrom">From</label><input id="wfrom" placeholder="MM/YYYY"></div>
<div><label for="rd">Role Description</label><textarea id="rd"></textarea></div>

<h2 data-automation-id="sectionHeader">Resume</h2>
<div><label for="cv">Resume/CV</label><input id="cv" type="file"></div>
<script src="/extension/content/lib/fields.js"></script>
<script src="/extension/content/lib/match.js"></script>
<script src="/extension/content/lib/fill.js"></script>
<script src="/extension/content/lib/clip.js"></script>
<script src="/extension/content/agent.js"></script>
<script src="/extension/test/fixture-data.js"></script>
<script type="module" src="/extension/test/harness.js"></script>
</body>
</html>
```

```html file=extension/test/pages/iframe.html
<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>职位申请 · iframe</title>
<style>body{font:14px/1.6 -apple-system,"PingFang SC",sans-serif;margin:24px}</style></head>
<body>
<h1>职位申请（表单在 iframe 里）</h1>
<iframe id="frame" src="/extension/test/pages/plain.html" style="width:100%;height:1200px;border:1px solid #ccc"></iframe>
<script src="/extension/content/lib/fields.js"></script>
<script src="/extension/content/lib/match.js"></script>
<script src="/extension/content/lib/fill.js"></script>
<script src="/extension/content/lib/clip.js"></script>
<script src="/extension/content/agent.js"></script>
<script src="/extension/test/fixture-data.js"></script>
<script type="module" src="/extension/test/harness.js"></script>
</body>
</html>
```

```html file=extension/test/pages/job.html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>品牌管理培训生 - 示例公司校园招聘</title>
<meta property="og:site_name" content="示例公司">
<style>body{font:15px/1.8 -apple-system,"PingFang SC",sans-serif;max-width:760px;margin:0 auto;padding:0 16px} header{border-bottom:1px solid #eee}</style>
</head>
<body>
<header><h1>示例公司招聘</h1></header>
<nav>首页 · 校园招聘 · 社会招聘</nav>
<main>
  <div class="job-detail">
    <h2>品牌管理培训生</h2>
    <p>工作地点：上海、北京</p>
    <p>岗位职责：参与品牌年度策略制定，负责消费者洞察与市场调研，协同销售、供应链与创意代理推进新品上市，跟踪上市后的表现并提出优化建议。</p>
    <p>任职要求：2027 届硕士或本科毕业生，市场营销、心理学、统计等相关专业优先；具备扎实的数据分析能力，熟练使用 Excel，有快消或咨询实习经历者优先。</p>
    <p>网申截止日期：2026年10月30日</p>
  </div>
</main>
<footer>© 示例公司</footer>
<script src="/extension/content/lib/fields.js"></script>
<script src="/extension/content/lib/match.js"></script>
<script src="/extension/content/lib/fill.js"></script>
<script src="/extension/content/lib/clip.js"></script>
<script src="/extension/content/agent.js"></script>
<script src="/extension/test/fixture-data.js"></script>
<script type="module" src="/extension/test/harness.js"></script>
</body>
</html>
```

- [ ] **Step 5: 启动测试页服务，逐页验证**

在会话根目录的 `.claude/launch.json` 里加一个 `fixtures` 配置（`node job-tracker/extension/test/serve.mjs`，端口 7320），用 `preview_start` 启动，然后逐页在内置浏览器里执行 `await jtTest.fill()` 等脚本检查结果。

Expected（每页都要满足）：

**plain.html**（`await jtTest.fill()`）
- 姓名「张三」、英文名「Sam」、手机、邮箱已填；性别选中「女」；出生日期 `2001-05-20`；政治面貌「共青团员」；现居城市「杭州」
- 验证码、密码留空，也不加标记（插件完全不碰这两类框）
- 教育第 1 段：示例大学 / 硕士研究生 / 数据科学 / 2025-09 / 2027-05 / 3.9；第 2 段：测试学院 / 本科 / 心理学 / 2020-09 / 2024-06
- 实习第 1 段：示例咨询 / 战略实习生 / 2025-05 / 2025-08 / 描述两行；返回结果 `missing.work === 1`
- 自我评价已填；「是否有海外经历」填「是」（自定义字段）；微信号保持「我自己填的」，`skipped ≥ 1`
- 已填的框是绿色轮廓；`await jtTest.attach()` 把 `测试简历.pdf` 放进「上传简历」，证件照不动
- 点一下「英文名」输入框后执行 `jtTest.insert('X')`，光标处插入 X

**antd.html**：`model` 里 name、phone、gender=女、school=示例大学（先输入关键字再选）、degree=硕士、major、eduStart=2025-09、eduEnd=2027-05 都有值（证明 React 式受控输入被正确触发）

**element.html**：name、email、political=共青团员、hometown=江苏南京、company、title、desc 有值；「身份证号」没填并标黄

**workday.html**：First Name=San、Last Name=Zhang、Email、Country Phone Code 选「China (+86)」、Phone；School=Example University、Degree=Master of Science、Field of Study=Data Science、From=09/2025、To=05/2027；Job Title=Strategy Intern、Company=Example Consulting、From=05/2025、Role Description 是英文描述；没标签的输入框只靠 id 提示时标蓝或不填

**iframe.html**：在父页面执行 `await jtTest.fill()`，iframe 里的表单被填好，`frames === 2`；在 iframe 里聚焦一个输入框后，父页面 `jtTest.insert('Y')` 能插入

**侧边栏**（任选 plain.html）：`await jtTest.openPanel()` 后截图，能看到填写 / 记录投递两个标签；点「一键填写本页」显示「已填 N 项」；点选列表里的条目（先聚焦网页输入框）能填入；深色模式截图正常

**job.html**：打开侧边栏切到「记录投递」：公司「示例公司」、岗位「品牌管理培训生」、城市「上海/北京」、截止 `2026-10-30`；点保存后 `jtTest.saved.record` 有这些字段，`jdText` 是岗位详情正文；把 `jtTest.dup` 设成一条假记录后「重新识别」，显示「这个岗位已经记过」

- [ ] **Step 6: Commit**

```bash
git add extension/test/serve.mjs extension/test/fixture-data.js extension/test/harness.js extension/test/pages
git commit -m "test(extension): fixture pages and harness for browser verification"
```

---
### Task 11: 安装说明与文档

**Files:**
- Modify: `web/js/views/settings.js`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-20-job-tracker-design.md`

- [ ] **Step 1: 设置页的插件卡片改成安装说明**

原文：
```js
import { h, icon, field, input, select, segmented, attempt, toast, repaintWhenIdle } from '../ui.js';
```
改为：
```js
import { h, icon, field, input, select, segmented, attempt, toast, repaintWhenIdle, copyText } from '../ui.js';
```

原文：
```js
    card('Chrome 插件',
      h('p', { class: 'muted', style: { margin: 0 } }, '网申自动填写和一键收藏岗位的插件在下一阶段提供，会直接用「档案」里的内容。')),
```
改为：
```js
    card('Chrome 插件（秋招助手）',
      h('ol', { style: { margin: 0, paddingLeft: '20px', lineHeight: 1.9 } },
        h('li', null, 'Chrome 地址栏打开 chrome://extensions ',
          h('button', { class: 'btn sm ghost', type: 'button', onClick: () => copyText('chrome://extensions', '地址已复制') }, icon('copy'), '复制')),
        h('li', null, '打开右上角的「开发者模式」'),
        h('li', null, '点「加载已解压的扩展程序」，选 job-tracker 里的 extension 文件夹'),
        h('li', null, '点工具栏的拼图图标，把「秋招助手」固定出来')),
      h('p', { class: 'muted small', style: { marginBottom: 0 } },
        '在网申页点插件图标或按 ⌥⇧J 打开侧边栏：一键填写、点选填充、把简历放进上传框、记录投递。插件用的是这里「档案」「简历」「素材库」的内容；Tracker 没启动时也能用上次的缓存填写。')),
```

- [ ] **Step 2: README 加插件一节（插在「## 常见问题」前面）**

原文：
```markdown
## 常见问题
```
改为：
````markdown
## Chrome 插件（秋招助手）

**安装（只要做一次）**

1. Chrome 地址栏打开 `chrome://extensions`，打开右上角的「开发者模式」
2. 点「加载已解压的扩展程序」，选 `job-tracker/extension` 文件夹
3. 点工具栏的拼图图标，把「秋招助手」固定出来

**使用**：在网申页面点插件图标（或按 ⌥⇧J）打开侧边栏。

- **一键填写**：按字段名匹配档案来填，英文表单用英文栏；只填空着的框。绿框 = 已填，蓝框 = 请核对，黄框 = 需要你来填
- **点选填充**：先点网页上的输入框，再点侧边栏里的内容（包括素材库），就会填进去
- **上传简历**：选好版本，点「放进上传框」（有 PDF 时优先用 PDF）
- **记录投递**：在招聘详情页切到「记录投递」，确认公司、岗位后保存，JD 全文会一起存成快照；已经记过的会提示，还能直接改阶段

插件不会点提交按钮，也不碰密码框和验证码，登录和最后提交都由你来。插件代码更新后，在 `chrome://extensions` 里点它的「重新加载」。

**填得不对？** 各家的自定义下拉、日期控件、学校搜索框做法不同，可能填不上或选错；标黄的地方用点选填充补上。遇到总是认不出的网申系统，把页面地址告诉 Claude 加规则。

## 常见问题
````

- [ ] **Step 3: CLAUDE.md 加插件一节（追加到末尾）**

```markdown

## Chrome 插件（extension/）

- 结构：`content/lib/`（fields 字段字典、match 标签匹配、fill 写值、clip 收藏识别）→ `content/agent.js`（每个 frame 的执行者）→ `content/panel.js`（侧边栏）；`bg/handlers.js` 处理消息，`bg/logic.js` 是纯函数
- 加字段或同义词：改 `content/lib/fields.js`，在 `extension/test/match.test.js` 加用例
- 测试：`npm test` 包含插件单测；页面行为用 `node extension/test/serve.mjs` 打开 http://127.0.0.1:7320/ 的测试页，在浏览器里执行 `await jtTest.fill()`
- 用户是「加载已解压的扩展程序」装的：改完插件代码要提醒用户去 chrome://extensions 点重新加载
```

- [ ] **Step 4: spec 同步**

`§5` 的 API 表格里，原文：
```markdown
| GET | `/calendar.ics` | 全部日程 + 网申截止（订阅或下载） |
```
改为：
```markdown
| GET | `/calendar.ics` | 全部日程 + 网申截止（订阅或下载） |
| POST | `/api/parse-jd` | 用 `shared/jdparse.js` 拆 JD：`{text, url}` → `{company, companyType, position, cities, deadline}`（插件收藏岗位用） |
```

`§7` 标题下方，原文：
```markdown
## 7. Chrome 插件（M2）
```
改为：
```markdown
## 7. Chrome 插件（M2）

> 实现时的调整（见 M2 计划）：点选填充改为侧边栏按钮在 mousedown 时阻止默认行为、把文字交给拥有焦点的 frame，不再实时上报焦点；每次操作前重新注入以覆盖后加载的 iframe；JD 拆解走 `POST /api/parse-jd`；不做单独设置页，Tracker 地址在侧边栏底部修改；内容脚本文件为 `content/agent.js` + `content/panel.js`。
```

- [ ] **Step 5: 验证并提交**

Run: `npm test && node --check web/js/views/settings.js && echo ok`
Expected: 全部通过；在内置浏览器打开 Tracker 的设置页，插件卡片显示 4 步说明，「复制」按钮能用

```bash
git add web/js/views/settings.js README.md CLAUDE.md docs/superpowers/specs/2026-09-20-job-tracker-design.md
git commit -m "docs: extension install guide in settings, readme, claude guide and spec"
```

---

### Task 12: 在 Chrome 里安装并实际试用，收尾

- [ ] **Step 1: 全部测试**

Run: `npm test`
Expected: 全部通过，0 失败

- [ ] **Step 2: 请用户安装插件**（开发者模式是浏览器的安全相关设置，由用户自己打开）

按 README 的 3 步安装。装好后请用户在 Tracker 开着的情况下：

1. 打开测试页 `http://127.0.0.1:7320/extension/test/pages/plain.html`（需先运行 `node extension/test/serve.mjs`），按 ⌥⇧J，确认侧边栏出现、底部显示「Tracker 在线」，点「一键填写本页」能填（这时填的是真实档案，只在测试页里，不会提交）
2. 打开一个真实的网申页面（登录后停在填写页），点「一键填写本页」，看绿 / 蓝 / 黄框是否合理；不要点提交
3. 在一个招聘详情页切到「记录投递」，确认识别结果后保存，回 Tracker 看到新卡片和 JD 快照

Expected: 用户反馈的问题逐条修复（字段词典、选择器、时序），每修一个在 `extension/test/` 里补测试或测试页用例

- [ ] **Step 3: 收尾**

- 删掉会话根目录 `.claude/launch.json` 里为测试页临时加的配置
- 更新记忆 `job-tracker.md`：M2 已完成、插件位置、改完插件要提醒用户重新加载
- `git status` 干净后，用 finishing-a-development-branch 合并回 main
