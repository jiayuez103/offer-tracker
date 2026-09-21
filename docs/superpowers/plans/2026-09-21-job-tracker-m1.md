# 秋招 Tracker M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出在本机可用的秋招 Tracker：Node 本地服务 + 网页（概览、投递看板、日程、档案、简历、素材库、设置），并导入现有的 4 份简历。

**Architecture:** `server.js` 只用 Node 内置模块，提供 REST API 和静态文件；数据存在 `data/*.json`（原子写 + 节流备份）。业务规则放在 `shared/`（纯 ES modules），服务端和网页共用。网页不需要构建，用原生 JS 写，所有请求都走 `web/js/api.js`。

**Tech Stack:** Node.js ≥ 20（本机 v26），零 npm 依赖；测试用 `node --test`；原生 JS ES modules + CSS；macOS `.command` 启动脚本。

**Spec:** `docs/superpowers/specs/2026-09-20-job-tracker-design.md`

**约定**

- info string 带 `file=路径` 的代码块 = 该文件的完整内容（路径相对 `job-tracker/`）
- 所有命令都在 `job-tracker/` 目录下运行
- 每个文件只在一个任务里创建，之后的任务不再整体改写（修 bug 除外）
- 代码和提交信息里不出现任何个人信息；个人数据只进 `data/`（已被 .gitignore 忽略）

---

## 文件结构

```
job-tracker/
├── package.json                      # T1  npm scripts：start / test
├── server.js                         # T8  入口：监听 127.0.0.1:7317
├── server/
│   ├── store.js                      # T7  数据读写：原子写、备份、JD 快照、简历文件
│   └── app.js                        # T8  HTTP 路由、安全检查、API、静态文件
├── shared/
│   ├── constants.js                  # T2  阶段、状态、类型、默认设置
│   ├── time.js                       # T3  时区换算、日期工具
│   ├── domain.js                     # T4  id、档案骨架、投递规则、没动静、漏斗、待处理清单
│   ├── ics.js                        # T5  日历导出
│   ├── companies.js                  # T6  域名 → 公司
│   └── jdparse.js                    # T6  从 JD 文本拆出字段
├── tests/
│   ├── constants.test.js             # T2
│   ├── time.test.js                  # T3
│   ├── domain.test.js                # T4
│   ├── ics.test.js                   # T5
│   ├── jdparse.test.js               # T6
│   ├── store.test.js                 # T7
│   └── server.test.js                # T8
├── 启动Tracker.command                # T9
├── 停止Tracker.command                # T9
├── web/
│   ├── index.html                    # T10 外壳：侧边栏、顶栏、视图容器
│   ├── css/base.css                  # T10 设计变量、布局、通用控件、弹窗、抽屉、提示
│   ├── css/applications.css          # T12
│   ├── css/components.css            # T13 投递详情、日程表单、新建投递
│   ├── css/dashboard.css             # T15
│   ├── css/calendar.css              # T16
│   ├── css/profile.css               # T17
│   ├── css/library.css               # T18 简历 + 素材库
│   ├── js/api.js                     # T11 请求封装
│   ├── js/store.js                   # T11 前端状态、增删改、外部改动同步
│   ├── js/ui.js                      # T11 h()、图标、弹窗、抽屉、提示、表单控件
│   ├── js/main.js                    # T11 路由、导航、全局快捷键
│   ├── js/components/appDrawer.js    # T13 投递详情抽屉
│   ├── js/components/eventForm.js    # T13 日程表单
│   ├── js/components/newApp.js       # T14 新建投递
│   ├── js/views/applications.js      # T12
│   ├── js/views/dashboard.js         # T15
│   ├── js/views/calendar.js          # T16
│   ├── js/views/profile.js           # T17
│   ├── js/views/resumes.js           # T18
│   ├── js/views/answers.js           # T19
│   └── js/views/settings.js          # T20
├── README.md                         # T22
└── CLAUDE.md                         # T22
```

T21 导入档案和简历（只写 `data/`），T23 端到端验证。

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: 创建 package.json**

```json file=package.json
{
  "name": "job-tracker",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "秋招投递 tracker：本地服务 + 网页 + Chrome 插件",
  "scripts": {
    "start": "node server.js",
    "test": "node --test \"tests/*.test.js\""
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: 更新 .gitignore**

```text file=.gitignore
data/
node_modules/
.DS_Store
*.tmp
```

- [ ] **Step 3: 确认 Node 版本**

Run: `node --version`
Expected: `v20` 或更高（本机是 `v26.0.0`）

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: scaffold node project"
```

---

### Task 2: 共用常量

**Files:**
- Create: `shared/constants.js`
- Test: `tests/constants.test.js`

- [ ] **Step 1: 写失败的测试**

```js file=tests/constants.test.js
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL，`Cannot find module .../shared/constants.js`

- [ ] **Step 3: 实现**

```js file=shared/constants.js
// 全局常量：网页、服务端、以后的线上后端共用

export const STAGES = [
  { key: 'wishlist', label: '待投递' },
  { key: 'applied', label: '已投递' },
  { key: 'assessment', label: '测评/笔试' },
  { key: 'interview', label: '面试' },
  { key: 'final', label: '终面' },
  { key: 'offer', label: 'Offer' },
];
export const STAGE_KEYS = STAGES.map((s) => s.key);
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

export const STATUSES = [
  { key: 'active', label: '进行中' },
  { key: 'rejected', label: '挂了' },
  { key: 'withdrawn', label: '放弃' },
  { key: 'accepted', label: '已接受' },
  { key: 'declined', label: '已拒绝' },
];
export const STATUS_KEYS = STATUSES.map((s) => s.key);
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.key, s.label]));
// 进「已结束」列的状态；accepted / declined 留在 Offer 列
export const CLOSED_STATUSES = ['rejected', 'withdrawn'];

export const EVENT_TYPES = ['测评', '笔试', 'AI面', '群面', '面试', '终面', 'HR面', 'Offer', '其他'];
// 结束后需要写复盘的日程类型
export const INTERVIEW_EVENT_TYPES = ['AI面', '群面', '面试', '终面', 'HR面'];
// 添加这类日程时，建议把投递推进到的阶段
export const EVENT_STAGE = {
  测评: 'assessment', 笔试: 'assessment', AI面: 'assessment',
  群面: 'interview', 面试: 'interview',
  终面: 'final', HR面: 'final',
  Offer: 'offer',
};

export const COMPANY_TYPES = ['外企', '大厂', '国企', '民企', '其他'];
export const TRACKS = ['产品', '市场', '其他'];
export const BATCHES = ['提前批', '秋招正式批', '补录', '其他'];
export const CHANNELS = ['官网', '内推', '宣讲会', '招聘平台', '邮件', 'LinkedIn', '其他'];
export const INDUSTRY_SUGGESTIONS = ['快消', '互联网', '汽车', '咨询', '奢侈品', '美妆', '食品饮料', '零售', '金融', '医药', '科技'];

export const ANSWER_CATEGORIES = ['自我介绍', 'Why 公司', 'Why 岗位', '领导力', '团队合作', '挑战/失败', '创新', '职业规划', '优缺点', '其他'];

export const DEFAULT_SETTINGS = {
  staleDays: 14,
  weeklyGoal: 10,
  homeTz: 'America/Los_Angeles',
  homeTzLabel: '洛杉矶',
  targetTz: 'Asia/Shanghai',
  targetTzLabel: '北京',
  eventInputTz: 'Asia/Shanghai',
};

export const COLLECTIONS = ['applications', 'answers', 'resumes'];
export const ID_PREFIX = { applications: 'app', answers: 'ans', resumes: 'res' };
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，4 个测试全部通过

- [ ] **Step 5: Commit**

```bash
git add shared/constants.js tests/constants.test.js
git commit -m "feat: shared constants for stages, statuses and settings"
```

---

### Task 3: 时区与日期工具

人在洛杉矶、面试按北京时间，2026-11-01 美国夏令时结束。全部换算都用 `Intl`，不手写偏移。

**Files:**
- Create: `shared/time.js`
- Test: `tests/time.test.js`

- [ ] **Step 1: 写失败的测试**

```js file=tests/time.test.js
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL，`Cannot find module .../shared/time.js`

- [ ] **Step 3: 实现**

```js file=shared/time.js
// 时区与日期工具。全部基于 Intl.DateTimeFormat，夏令时自动处理。
// 约定：日期 'YYYY-MM-DD'；墙上时间 'YYYY-MM-DDTHH:mm'；时刻用带偏移的 ISO。

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WD_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map();

const pad = (n) => String(n).padStart(2, '0');

function formatterFor(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** 某一时刻在指定时区的日历字段 */
export function zonedParts(date, timeZone) {
  const parts = {};
  for (const p of formatterFor(timeZone).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
    weekday: WD_INDEX[parts.weekday],
  };
}

/** 该时区在这一时刻相对 UTC 的偏移（分钟），北京 = 480 */
export function tzOffsetMinutes(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUTC - truncated) / 60000);
}

function offsetString(minutes) {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** 某时区的墙上时间 'YYYY-MM-DDTHH:mm' → 带偏移的 ISO，如 '2026-09-25T14:00:00+08:00' */
export function zonedToISO(local, timeZone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local || '');
  if (!m) throw new Error(`时间格式应为 YYYY-MM-DDTHH:mm：${local}`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let offset = tzOffsetMinutes(new Date(guess), timeZone);
  const second = tzOffsetMinutes(new Date(guess - offset * 60000), timeZone);
  if (second !== offset) offset = second;
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00${offsetString(offset)}`;
}

/** ISO → 某时区的墙上时间 'YYYY-MM-DDTHH:mm'（给 datetime-local 输入框用） */
export function isoToLocalInput(iso, timeZone) {
  const p = zonedParts(new Date(iso), timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** '9/25 周五 14:00'；time=false 时只到日期 */
export function formatZoned(iso, timeZone, { time = true } = {}) {
  const p = zonedParts(new Date(iso), timeZone);
  const day = `${p.month}/${p.day} ${WEEKDAYS[p.weekday]}`;
  return time ? `${day} ${pad(p.hour)}:${pad(p.minute)}` : day;
}

function tzLabel(timeZone, settings) {
  if (timeZone === settings.homeTz) return settings.homeTzLabel;
  if (timeZone === settings.targetTz) return settings.targetTzLabel;
  return timeZone;
}

/** 双时区显示：主时间用录入时的时区，副时间用另一个 */
export function dualTime(iso, eventTz, settings) {
  const primaryTz = eventTz || settings.targetTz;
  const otherTz = primaryTz === settings.homeTz ? settings.targetTz : settings.homeTz;
  return {
    primary: `${formatZoned(iso, primaryTz)} ${tzLabel(primaryTz, settings)}`,
    secondary: `${tzLabel(otherTz, settings)} ${formatZoned(iso, otherTz)}`,
  };
}

/** 某时区的"今天" */
export function todayInZone(timeZone, now = new Date()) {
  const p = zonedParts(now, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 两个日期相差的天数（b - a） */
export function diffDays(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 截止日还剩几天：按该时区的日历日算，0 = 今天截止，负数 = 已过 */
export function daysUntil(dateStr, timeZone, now = new Date()) {
  return diffDays(todayInZone(timeZone, now), dateStr);
}

/** 截止时刻 = 该时区当天 23:59 */
export function deadlineISO(dateStr, timeZone) {
  return zonedToISO(`${dateStr}T23:59`, timeZone);
}

/** 所在周的周一 */
export function weekStartOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = 周日
  return addDays(dateStr, weekday === 0 ? -6 : 1 - weekday);
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，constants 4 个 + time 6 个全部通过

- [ ] **Step 5: Commit**

```bash
git add shared/time.js tests/time.test.js
git commit -m "feat: timezone helpers with DST-safe conversion"
```

---
### Task 4: 业务规则（domain）

**Files:**
- Create: `shared/domain.js`
- Test: `tests/domain.test.js`

- [ ] **Step 1: 写失败的测试**

```js file=tests/domain.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newId, asBi, emptyProfile, normalizeProfile, PROFILE_ENTRY, PROFILE_LISTS,
  prepareNewApplication, applyApplicationUpdate, validateApplication,
  lastProgressAt, isStale, nextEvent, funnel, weeklyApplied, actionItems, textStats,
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL，`Cannot find module .../shared/domain.js`

- [ ] **Step 3: 实现**

```js file=shared/domain.js
// 业务规则：id、档案骨架、投递的新建与更新、没动静、漏斗、待处理清单、字数统计。
// 纯函数，不碰文件和 DOM，网页和服务端共用。
import {
  STAGE_KEYS, STATUS_KEYS, CLOSED_STATUSES, INTERVIEW_EVENT_TYPES, DEFAULT_SETTINGS,
} from './constants.js';
import { todayInZone, daysUntil, diffDays, weekStartOf, addDays } from './time.js';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const HOUR = 3600000;
const DAY = 24 * HOUR;

export function newId(prefix) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(10));
  let s = '';
  for (const b of bytes) s += ALPHABET[b % 36];
  return `${prefix}_${s}`;
}

// ---------- 档案 ----------

export const bi = (zh = '', en = '') => ({ zh, en });

/** 中英字段可能被写成字符串，统一成 {zh, en} */
export function asBi(v) {
  if (v && typeof v === 'object') return { zh: v.zh ?? '', en: v.en ?? '' };
  return { zh: typeof v === 'string' ? v : '', en: '' };
}

export function emptyProfile() {
  return {
    basic: {
      name: bi(), familyName: bi(), givenName: bi(), preferredName: '',
      gender: '', birthDate: '', phone: '', phoneCountryCode: '+86', email: '', wechat: '',
      currentCity: bi(), hometown: bi(), residence: bi(), nationality: bi(),
      politicalStatus: '', ethnicity: '', linkedin: '', website: '',
    },
    intent: { positions: bi(), cities: bi(), salary: '', availableFrom: '', acceptAdjustment: '' },
    education: [], work: [], projects: [], activities: [], awards: [], languages: [], certificates: [],
    skills: bi(), selfIntro: bi(), hobbies: bi(),
    extras: [],
  };
}

export const PROFILE_LISTS = ['education', 'work', 'projects', 'activities', 'awards', 'languages', 'certificates', 'extras'];

/** 档案里各类多段经历的空白模板 */
export const PROFILE_ENTRY = {
  education: () => ({ id: newId('edu'), school: bi(), degree: bi(), major: bi(), college: bi(), city: bi(), start: '', end: '', gpa: '', gpaScale: '', rank: '', courses: bi(), honors: bi() }),
  work: () => ({ id: newId('work'), company: bi(), title: bi(), department: bi(), type: '实习', city: bi(), start: '', end: '', description: bi() }),
  projects: () => ({ id: newId('proj'), name: bi(), role: bi(), start: '', end: '', description: bi() }),
  activities: () => ({ id: newId('act'), org: bi(), role: bi(), start: '', end: '', description: bi() }),
  awards: () => ({ id: newId('awd'), name: bi(), date: '', description: bi() }),
  languages: () => ({ id: newId('lang'), language: bi(), level: bi(), certificate: '', score: '' }),
  certificates: () => ({ id: newId('cert'), name: bi(), date: '', score: '' }),
  extras: () => ({ id: newId('ext'), label: '', value: bi() }),
};

/** 补齐缺失的结构，防止手改过的 profile.json 让页面出错 */
export function normalizeProfile(p) {
  const base = emptyProfile();
  const src = p && typeof p === 'object' ? p : {};
  const out = { ...base, ...src };
  out.basic = { ...base.basic, ...(src.basic || {}) };
  out.intent = { ...base.intent, ...(src.intent || {}) };
  for (const k of PROFILE_LISTS) if (!Array.isArray(out[k])) out[k] = [];
  for (const k of ['skills', 'selfIntro', 'hobbies']) out[k] = asBi(src[k]);
  return out;
}

// ---------- 投递 ----------

const APP_DEFAULTS = {
  company: '', companyEn: '', companyType: '', industry: '', position: '', track: '',
  cities: '', batch: '', channel: '', referrer: '', referralCode: '',
  jdUrl: '', applyUrl: '', account: '', resumeId: '', priority: 2,
  deadline: '', appliedAt: '', stage: 'wishlist', status: 'active',
  nextStep: '', notes: '', jdFile: null,
};

function coerce(app) {
  if (typeof app.priority === 'string') app.priority = Number(app.priority) || 2;
  return app;
}

/** 新建投递：补默认值、写 created 时间线。ctx = { nowISO, today } */
export function prepareNewApplication(input, ctx) {
  const app = coerce({ ...APP_DEFAULTS, ...input });
  app.id = input.id || newId('app');
  app.events = Array.isArray(input.events) ? input.events : [];
  app.timeline = [
    ...(Array.isArray(input.timeline) ? input.timeline : []),
    { id: newId('tl'), at: ctx.nowISO, type: 'created', from: '', to: app.stage, text: '' },
  ];
  if (app.stage !== 'wishlist' && !app.appliedAt) app.appliedAt = ctx.today;
  app.createdAt = ctx.nowISO;
  app.updatedAt = ctx.nowISO;
  return app;
}

/** 更新投递：浅合并；阶段 / 状态变化时自动写时间线 */
export function applyApplicationUpdate(current, patch, ctx) {
  const { id: _id, createdAt: _createdAt, ...changes } = patch;
  const next = coerce({ ...current, ...changes });
  const timeline = Array.isArray(next.timeline) ? [...next.timeline] : [];
  if ('stage' in changes && changes.stage !== current.stage) {
    timeline.push({ id: newId('tl'), at: ctx.nowISO, type: 'stage', from: current.stage, to: changes.stage, text: '' });
    if (changes.stage !== 'wishlist' && !next.appliedAt) next.appliedAt = ctx.today;
  }
  if ('status' in changes && changes.status !== current.status) {
    timeline.push({ id: newId('tl'), at: ctx.nowISO, type: 'status', from: current.status, to: changes.status, text: '' });
  }
  next.timeline = timeline;
  next.updatedAt = ctx.nowISO;
  return next;
}

/** 返回错误信息；合法时返回 null */
export function validateApplication(app) {
  if (!STAGE_KEYS.includes(app.stage)) return `未知阶段：${app.stage}`;
  if (!STATUS_KEYS.includes(app.status)) return `未知状态：${app.status}`;
  if (![1, 2, 3].includes(app.priority)) return '意向度应为 1、2 或 3';
  if (!Array.isArray(app.events) || !Array.isArray(app.timeline)) return 'events 和 timeline 应为数组';
  if (!String(app.company || '').trim() && !String(app.position || '').trim()) return '公司和岗位至少填一个';
  return null;
}

// ---------- 进度 ----------

export const stageIndex = (key) => STAGE_KEYS.indexOf(key);
export const isClosed = (app) => CLOSED_STATUSES.includes(app.status);

const PROGRESS_TYPES = new Set(['created', 'stage', 'status', 'followup']);
const STALE_STAGES = new Set(['applied', 'assessment', 'interview', 'final']);

/** 最后一次进展：时间线里的进展类条目，加上已经过去的日程 */
export function lastProgressAt(app, now = new Date()) {
  let t = 0;
  for (const e of app.timeline || []) if (PROGRESS_TYPES.has(e.type)) t = Math.max(t, Date.parse(e.at) || 0);
  for (const ev of app.events || []) {
    const at = Date.parse(ev.at);
    if (at && at <= now.getTime()) t = Math.max(t, at);
  }
  return new Date(t || Date.parse(app.createdAt) || now.getTime());
}

export function daysSinceProgress(app, now = new Date()) {
  return Math.floor((now.getTime() - lastProgressAt(app, now).getTime()) / DAY);
}

/** 下一个还没完成的未来日程 */
export function nextEvent(app, now = new Date()) {
  let best = null;
  for (const ev of app.events || []) {
    const at = Date.parse(ev.at);
    if (ev.done || !(at >= now.getTime())) continue;
    if (!best || at < Date.parse(best.at)) best = ev;
  }
  return best;
}

export function isStale(app, settings = DEFAULT_SETTINGS, now = new Date()) {
  if (app.status !== 'active' || !STALE_STAGES.has(app.stage)) return false;
  if (nextEvent(app, now)) return false; // 已经约好了下一步，不算没动静
  const limit = settings.staleDays ?? DEFAULT_SETTINGS.staleDays;
  return daysSinceProgress(app, now) >= limit;
}

/** 漏斗：每个阶段有多少条投递到达过（已结束的按结束时的阶段计） */
export function funnel(apps) {
  const submitted = apps.filter((a) => a.stage !== 'wishlist');
  return STAGE_KEYS.slice(1).map((key) => ({
    key,
    count: submitted.filter((a) => stageIndex(a.stage) >= stageIndex(key)).length,
  }));
}

/** 近 N 周每周投递数：按 appliedAt，周一开始；today = 'YYYY-MM-DD' */
export function weeklyApplied(apps, weeks, today) {
  const thisWeek = weekStartOf(today);
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) buckets.push({ weekStart: addDays(thisWeek, -7 * i), count: 0 });
  const byStart = new Map(buckets.map((b) => [b.weekStart, b]));
  for (const a of apps) {
    if (!a.appliedAt) continue;
    const bucket = byStart.get(weekStartOf(a.appliedAt));
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

const TEST_TYPES = new Set(['测评', '笔试', 'AI面']);
const MEETING_TYPES = new Set(['群面', '面试', '终面', 'HR面']);

/**
 * 概览页的「需要处理」清单，按紧急程度排序。
 * kind：test（48 小时内的测评/笔试）| meeting（今明两天的面试）| deadline（3 天内截止还没投）
 *      | review（面完没写复盘）| stale（没动静）| overdue（截止已过还没投）
 */
export function actionItems(apps, settings = DEFAULT_SETTINGS, now = new Date()) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const nowMs = now.getTime();
  const homeToday = todayInZone(s.homeTz, now);
  const items = [];
  for (const app of apps) {
    if (app.status !== 'active') continue;
    if (app.stage === 'wishlist' && app.deadline) {
      const d = daysUntil(app.deadline, s.targetTz, now);
      if (d < 0) items.push({ kind: 'overdue', rank: 5, app, text: `网申已截止 ${-d} 天，还没投` });
      else if (d <= 3) items.push({ kind: 'deadline', rank: 2, app, text: d === 0 ? '今天截止，还没投' : `还剩 ${d} 天截止，还没投` });
    }
    for (const ev of app.events || []) {
      const at = Date.parse(ev.at);
      if (!at) continue;
      if (!ev.done && at >= nowMs && TEST_TYPES.has(ev.type) && at - nowMs <= 48 * HOUR) {
        const hours = Math.max(1, Math.round((at - nowMs) / HOUR));
        items.push({ kind: 'test', rank: 0, app, event: ev, text: `${ev.type}还剩 ${hours} 小时` });
      }
      if (!ev.done && at >= nowMs && MEETING_TYPES.has(ev.type)) {
        const days = diffDays(homeToday, todayInZone(s.homeTz, new Date(at)));
        if (days <= 1) items.push({ kind: 'meeting', rank: 1, app, event: ev, text: `${days === 0 ? '今天' : '明天'}有${ev.type}` });
      }
      const reviewed = ev.review && (ev.review.questions || ev.review.reflection);
      if (INTERVIEW_EVENT_TYPES.includes(ev.type) && at < nowMs && nowMs - at <= 14 * DAY && !reviewed) {
        items.push({ kind: 'review', rank: 3, app, event: ev, text: `${ev.type}结束了，写个复盘` });
      }
    }
    if (isStale(app, s, now)) items.push({ kind: 'stale', rank: 4, app, text: `${daysSinceProgress(app, now)} 天没动静` });
  }
  const eventTime = (i) => (i.event ? Date.parse(i.event.at) : 0);
  return items.sort((a, b) => a.rank - b.rank || eventTime(a) - eventTime(b));
}

// ---------- 素材库 ----------

/** chars = 去掉空白后的字符数（中文网申常用）；words = 英文词数 */
export function textStats(text = '') {
  const t = String(text || '');
  return {
    chars: t.replace(/\s/g, '').length,
    words: (t.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length,
  };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，domain 的 20 个测试全部通过

- [ ] **Step 5: Commit**

```bash
git add shared/domain.js tests/domain.test.js
git commit -m "feat: domain rules for applications, staleness and action items"
```

---
### Task 5: 日历导出（ICS）

**Files:**
- Create: `shared/ics.js`
- Test: `tests/ics.test.js`

- [ ] **Step 1: 写失败的测试**

```js file=tests/ics.test.js
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL，`Cannot find module .../shared/ics.js`

- [ ] **Step 3: 实现**

```js file=shared/ics.js
// 生成 iCalendar（.ics），给苹果日历订阅或导入。时间一律用 UTC。
import { INTERVIEW_EVENT_TYPES, DEFAULT_SETTINGS } from './constants.js';
import { deadlineISO } from './time.js';

const pad = (n) => String(n).padStart(2, '0');
const encoder = new TextEncoder();
const isUrl = (s) => /^https?:\/\//i.test(s || '');

export function icsDate(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
    + `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

export function escapeText(s = '') {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** 按 75 字节折行（RFC 5545），不拆开多字节字符；续行以一个空格开头 */
export function foldLine(line) {
  if (encoder.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = encoder.encode(ch).length;
    if (bytes + b > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
      limit = 74;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function vevent({ uid, stamp, start, end, summary, description, location, url, alarmMinutes }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsDate(stamp)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${escapeText(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  if (url) lines.push(`URL:${url}`);
  lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(summary)}`, `TRIGGER:-PT${alarmMinutes}M`, 'END:VALARM');
  lines.push('END:VEVENT');
  return lines;
}

/** 全部日程 + 还没投的岗位的网申截止日 */
export function buildCalendar(apps, settings = DEFAULT_SETTINGS, now = new Date()) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//job-tracker//CN', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', 'X-WR-CALNAME:秋招日程',
  ];
  for (const app of apps) {
    const who = [app.company, app.position].filter(Boolean).join(' ');
    for (const ev of app.events || []) {
      const start = new Date(ev.at);
      if (Number.isNaN(start.getTime())) continue;
      const end = new Date(start.getTime() + (ev.durationMin || 60) * 60000);
      lines.push(...vevent({
        uid: `${ev.id}@job-tracker`,
        stamp: now,
        start,
        end,
        summary: `${ev.type}｜${who}${ev.title ? ` · ${ev.title}` : ''}`,
        description: [ev.location, app.nextStep && `下一步：${app.nextStep}`].filter(Boolean).join('\n'),
        location: isUrl(ev.location) ? '' : ev.location,
        url: isUrl(ev.location) ? ev.location : '',
        alarmMinutes: INTERVIEW_EVENT_TYPES.includes(ev.type) ? 60 : 24 * 60,
      }));
    }
    if (app.deadline && app.stage === 'wishlist' && app.status === 'active') {
      const start = new Date(deadlineISO(app.deadline, s.targetTz));
      const link = [app.applyUrl, app.jdUrl].find(isUrl) || '';
      lines.push(...vevent({
        uid: `deadline-${app.id}@job-tracker`,
        stamp: now,
        start,
        end: new Date(start.getTime() + 60000),
        summary: `网申截止｜${who}`,
        description: link,
        location: '',
        url: link,
        alarmMinutes: 24 * 60,
      }));
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，ics 的 3 个测试通过

- [ ] **Step 5: Commit**

```bash
git add shared/ics.js tests/ics.test.js
git commit -m "feat: ics calendar export with alarms"
```

---

### Task 6: 识别公司 + 拆 JD

新建投递时粘贴 JD 和链接，自动填公司、类型、岗位、城市、截止日。M2 插件收藏岗位时复用同一套规则。

**Files:**
- Create: `shared/companies.js`
- Create: `shared/jdparse.js`
- Test: `tests/jdparse.test.js`

- [ ] **Step 1: 写失败的测试**

```js file=tests/jdparse.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJD } from '../shared/jdparse.js';
import { guessCompanyFromUrl } from '../shared/companies.js';

const NOW = new Date('2026-09-21T18:00:00Z');

test('从常见官网域名识别公司', () => {
  assert.deepEqual(guessCompanyFromUrl('https://www.pgcareers.com/global/en/job/123'), { company: '宝洁', companyType: '外企' });
  assert.deepEqual(guessCompanyFromUrl('https://jobs.bytedance.com/campus/position/123/detail'), { company: '字节跳动', companyType: '大厂' });
  assert.deepEqual(guessCompanyFromUrl('https://join.qq.com/post_detail.html?postid=1'), { company: '腾讯', companyType: '大厂' });
});

test('从招聘系统域名取公司代号', () => {
  assert.deepEqual(guessCompanyFromUrl('https://loreal.wd3.myworkdayjobs.com/en-US/careers/job/123'), { company: 'loreal', companyType: '' });
  assert.deepEqual(guessCompanyFromUrl('https://app.mokahr.com/campus-recruitment/mihoyo/12345#/job/1'), { company: 'mihoyo', companyType: '' });
  assert.deepEqual(guessCompanyFromUrl('https://pepsico.zhiye.com/campus/detail?jobAdId=1'), { company: 'pepsico', companyType: '' });
  assert.equal(guessCompanyFromUrl('https://docs.google.com/document/d/1'), null);
  assert.equal(guessCompanyFromUrl('not a url'), null);
});

test('中文 JD：标签式字段', () => {
  const jd = [
    '市场部管理培训生',
    '公司名称：雀巢（中国）有限公司',
    '工作地点：上海、北京',
    '岗位职责：',
    '1. 参与品牌策略制定',
    '网申截止时间：2026年10月15日',
  ].join('\n');
  assert.deepEqual(parseJD(jd, '', NOW), {
    company: '雀巢（中国）有限公司', companyType: '', position: '市场部管理培训生', cities: '上海/北京', deadline: '2026-10-15',
  });
});

test('英文 JD + 官网链接：官网的公司名优先', () => {
  const jd = 'Job Title: Brand Management Trainee\nLocation: Hong Kong\nApplication deadline: 10/31';
  assert.deepEqual(parseJD(jd, 'https://www.pgcareers.com/job/1', NOW), {
    company: '宝洁', companyType: '外企', position: 'Brand Management Trainee', cities: 'Hong Kong', deadline: '2026-10-31',
  });
});

test('招聘系统代号会被 JD 里的公司名覆盖', () => {
  const jd = '公司：百事食品（中国）\n岗位：市场管培生';
  assert.equal(parseJD(jd, 'https://pepsico.zhiye.com/x', NOW).company, '百事食品（中国）');
});

test('没写年份且日期已过很久 → 算明年', () => {
  assert.equal(parseJD('截止日期：3月1日', '', NOW).deadline, '2027-03-01');
});

test('什么都拆不出来时全部留空', () => {
  assert.deepEqual(parseJD('随便一段话', '', NOW), { company: '', companyType: '', position: '', cities: '', deadline: '' });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL，`Cannot find module .../shared/jdparse.js`

- [ ] **Step 3: 实现公司识别**

```js file=shared/companies.js
// 招聘官网域名 → 公司名、公司类型。新建投递和插件收藏岗位时用来自动识别。
// 主机名等于该域名，或以 "." + 域名 结尾，都算命中。

export const COMPANY_DOMAINS = [
  // 快消 / 消费 / 外企
  ['pgcareers.com', '宝洁', '外企'], ['pg.com.cn', '宝洁', '外企'], ['pg.com', '宝洁', '外企'],
  ['unilever.com', '联合利华', '外企'], ['unilever.com.cn', '联合利华', '外企'],
  ['nestle.com', '雀巢', '外企'], ['nestle.com.cn', '雀巢', '外企'],
  ['loreal.com', '欧莱雅', '外企'], ['loreal.com.cn', '欧莱雅', '外企'], ['lorealchina.com', '欧莱雅', '外企'],
  ['mars.com', '玛氏', '外企'],
  ['pepsico.com', '百事', '外企'], ['pepsico.com.cn', '百事', '外企'], ['pepsicojobs.com', '百事', '外企'],
  ['coca-colacompany.com', '可口可乐', '外企'], ['coca-cola.com.cn', '可口可乐', '外企'], ['swirecocacola.com', '太古可口可乐', '外企'],
  ['danone.com', '达能', '外企'], ['danone.com.cn', '达能', '外企'],
  ['mondelezinternational.com', '亿滋', '外企'],
  ['jnj.com', '强生', '外企'],
  ['elcompanies.com', '雅诗兰黛', '外企'],
  ['shiseido.com.cn', '资生堂', '外企'],
  ['ab-inbev.com', '百威', '外企'], ['budweiserapac.com', '百威亚太', '外企'],
  ['heineken.com', '喜力', '外企'], ['diageo.com', '帝亚吉欧', '外企'], ['pernod-ricard.com', '保乐力加', '外企'],
  ['lvmh.com', 'LVMH', '外企'], ['kering.com', '开云', '外企'],
  ['kimberly-clark.com', '金佰利', '外企'], ['reckitt.com', '利洁时', '外企'], ['colgatepalmolive.com', '高露洁', '外企'],
  ['kraftheinz.com', '卡夫亨氏', '外企'], ['generalmills.com', '通用磨坊', '外企'], ['ferrero.com', '费列罗', '外企'],
  ['yumchina.com', '百胜中国', '外企'], ['mcdonalds.com.cn', '麦当劳', '外企'], ['starbucks.com.cn', '星巴克', '外企'],
  ['jlr.com', '捷豹路虎', '外企'], ['jaguarlandrover.com', '捷豹路虎', '外企'], ['bmw.com.cn', '宝马', '外企'],
  ['mercedes-benz.com.cn', '奔驰', '外企'], ['siemens.com', '西门子', '外企'], ['bosch.com.cn', '博世', '外企'],
  ['jobs.apple.com', 'Apple', '外企'], ['careers.microsoft.com', '微软', '外企'], ['careers.google.com', 'Google', '外企'],
  ['amazon.jobs', '亚马逊', '外企'],
  // 互联网大厂
  ['jobs.bytedance.com', '字节跳动', '大厂'], ['bytedance.com', '字节跳动', '大厂'],
  ['join.qq.com', '腾讯', '大厂'], ['careers.tencent.com', '腾讯', '大厂'],
  ['talent.alibaba.com', '阿里巴巴', '大厂'], ['campus-talent.alibaba.com', '阿里巴巴', '大厂'], ['talent-holding.alibaba.com', '阿里巴巴', '大厂'],
  ['talent.antgroup.com', '蚂蚁集团', '大厂'],
  ['zhaopin.meituan.com', '美团', '大厂'], ['campus.meituan.com', '美团', '大厂'],
  ['campus.jd.com', '京东', '大厂'], ['zhaopin.jd.com', '京东', '大厂'],
  ['talent.baidu.com', '百度', '大厂'],
  ['campus.163.com', '网易', '大厂'], ['hr.163.com', '网易', '大厂'],
  ['campus.kuaishou.cn', '快手', '大厂'], ['zhaopin.kuaishou.cn', '快手', '大厂'],
  ['careers.pddglobalhr.com', '拼多多', '大厂'],
  ['job.xiaohongshu.com', '小红书', '大厂'],
  ['jobs.bilibili.com', '哔哩哔哩', '大厂'],
  ['talent.didiglobal.com', '滴滴', '大厂'],
  ['career.huawei.com', '华为', '大厂'],
  ['hr.xiaomi.com', '小米', '大厂'],
  ['careers.trip.com', '携程', '大厂'], ['job.ctrip.com', '携程', '大厂'],
  ['jobs.mihoyo.com', '米哈游', '大厂'],
  ['careers.oppo.com', 'OPPO', '大厂'], ['hr-campus.vivo.com', 'vivo', '大厂'],
  // 新能源车
  ['nio.com', '蔚来', '民企'], ['lixiang.com', '理想汽车', '民企'], ['xiaopeng.com', '小鹏汽车', '民企'], ['job.byd.com', '比亚迪', '民企'],
];

// 招聘系统（ATS）：公司代号在子域名、路径或参数里
const ATS = [
  { host: 'mokahr.com', from: 'path' },          // app.mokahr.com/campus-recruitment/<代号>/…
  { host: 'myworkdayjobs.com', from: 'sub' },    // <代号>.wd3.myworkdayjobs.com
  { host: 'zhiye.com', from: 'sub' },            // <代号>.zhiye.com（北森）
  { host: 'jobs.feishu.cn', from: 'sub' },       // <代号>.jobs.feishu.cn
  { host: 'avature.net', from: 'sub' },
  { host: 'hotjob.cn', from: 'sub' },            // 大易
  { host: 'successfactors.com', from: 'query' }, // ?company=<代号>
  { host: 'successfactors.eu', from: 'query' },
];

const BY_LENGTH = [...COMPANY_DOMAINS].sort((a, b) => b[0].length - a[0].length);
const GENERIC_SLUGS = new Set(['www', 'app', 'careers', 'jobs', 'campus']);

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

/** 从链接猜公司：返回 { company, companyType } 或 null。ATS 只能拿到英文代号，companyType 为空 */
export function guessCompanyFromUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const hit = BY_LENGTH.find(([domain]) => hostMatches(host, domain));
  if (hit) return { company: hit[1], companyType: hit[2] };
  for (const ats of ATS) {
    if (!hostMatches(host, ats.host)) continue;
    let slug = '';
    if (ats.from === 'sub') slug = host.slice(0, -(ats.host.length + 1)).split('.')[0];
    if (ats.from === 'path') {
      const segs = u.pathname.split('/').filter(Boolean);
      const i = segs.findIndex((seg) => /recruitment|apply/.test(seg));
      slug = i >= 0 ? segs[i + 1] || '' : '';
    }
    if (ats.from === 'query') slug = u.searchParams.get('company') || '';
    if (slug && !GENERIC_SLUGS.has(slug)) return { company: slug, companyType: '' };
  }
  return null;
}
```

- [ ] **Step 4: 实现 JD 拆解**

```js file=shared/jdparse.js
// 从粘贴的 JD 文本里按规则拆出字段；拆不出来的留空，由用户自己补。
import { guessCompanyFromUrl } from './companies.js';

const labelValue = (labels) => new RegExp(`(?:^|\\n)[ \\t]*(?:${labels})[ \\t]*[:：][ \\t]*([^\\n]+)`, 'i');

const POSITION_RE = labelValue('岗位名称|职位名称|招聘岗位|岗位|职位|Job Title|Position|Role');
const COMPANY_RE = labelValue('公司名称|企业名称|公司|Company');
const CITY_RE = labelValue('工作地点|工作城市|办公地点|工作地址|地点|城市|Base|Work Location|Location');
const DEADLINE_RE = /(截止|截至|deadline|closing date|申请结束|网申结束)[^\n\d]{0,15}(?:(\d{4})\s*[年\-/.]\s*)?(\d{1,2})\s*[月\-/.]\s*(\d{1,2})/i;
const JOB_WORDS = /管培|培训生|\bMT\b|Trainee|经理|专员|助理|实习|分析师|工程师|策划|运营|产品|市场|品牌|Manager|Specialist|Analyst|Associate|Coordinator|Program|Intern/i;

const pad = (n) => String(n).padStart(2, '0');

function clean(s, max = 60) {
  return s.replace(/\s+/g, ' ').replace(/[；;。]+$/, '').trim().slice(0, max);
}

function parseDeadline(text, now) {
  const m = DEADLINE_RE.exec(text);
  if (!m) return '';
  let year = m[2] ? Number(m[2]) : now.getFullYear();
  const month = Number(m[3]);
  const day = Number(m[4]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  // 没写年份、且这个日期已经过去 60 天以上：认为是明年
  if (!m[2] && now.getTime() - new Date(year, month - 1, day).getTime() > 60 * 86400000) year += 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 返回 { company, companyType, position, cities, deadline }，全部是字符串 */
export function parseJD(text = '', url = '', now = new Date()) {
  const t = String(text || '').replace(/\r\n?/g, '\n');
  const out = { company: '', companyType: '', position: '', cities: '', deadline: '' };

  const byUrl = url ? guessCompanyFromUrl(url) : null;
  if (byUrl) Object.assign(out, byUrl);
  const company = COMPANY_RE.exec(t);
  // 官网域名表里的公司名最准；ATS 代号则让位给 JD 里写的公司名
  if (company && !out.companyType) out.company = clean(company[1], 40);

  const position = POSITION_RE.exec(t);
  if (position) {
    out.position = clean(position[1]);
  } else {
    const first = t.split('\n').map((l) => l.trim()).find((l) => l && l.length <= 40 && JOB_WORDS.test(l));
    if (first) out.position = clean(first);
  }

  const city = CITY_RE.exec(t);
  if (city) out.cities = clean(city[1], 40).split(/[、，,;；/|｜]+/).map((c) => c.trim()).filter(Boolean).join('/');

  out.deadline = parseDeadline(t, now);
  return out;
}
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，jdparse 的 7 个测试通过

- [ ] **Step 6: Commit**

```bash
git add shared/companies.js shared/jdparse.js tests/jdparse.test.js
git commit -m "feat: company detection and JD field extraction"
```

---
### Task 7: 数据存储层（store）

只有这个模块直接碰 `data/`。每次都从磁盘读（Claude 可能直接改了文件），写入是原子的，写之前按需备份。以后换数据库只需重写这一层。

**Files:**
- Create: `server/store.js`
- Test: `tests/store.test.js`

- [ ] **Step 1: 写失败的测试**

```js file=tests/store.test.js
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL，`Cannot find module .../server/store.js`

- [ ] **Step 3: 实现**

```js file=server/store.js
// 数据读写：只有这个模块直接碰 data/ 目录。
// 每次都从磁盘读（Claude 可能直接改了文件）；写入是原子的；写之前按需备份。
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS } from '../shared/constants.js';
import { emptyProfile, normalizeProfile } from '../shared/domain.js';

export class StoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // NOT_FOUND | BAD_REQUEST | CORRUPT
  }
}

const DOCS = {
  profile: { file: 'profile.json', empty: () => emptyProfile() },
  settings: { file: 'settings.json', empty: () => ({}) },
  applications: { file: 'applications.json', empty: () => [] },
  answers: { file: 'answers.json', empty: () => [] },
  resumes: { file: 'resumes.json', empty: () => [] },
};
const LIST_DOCS = new Set(['applications', 'answers', 'resumes']);
const BACKUP_INTERVAL_MS = 30 * 60 * 1000;
const BACKUP_KEEP = 30;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

function parseStamp(s) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0;
}

/** JD 快照 = 标题块 + '---' + 正文，读出时只要正文；手写的无标题文件原样返回 */
export function stripJdHeader(content) {
  if (content.startsWith('# ')) {
    const i = content.indexOf('\n---\n');
    if (i >= 0) return content.slice(i + 5).replace(/^\n+/, '').replace(/\n+$/, '');
  }
  return content.replace(/\n+$/, '');
}

export function createStore(dataDir, { now = () => new Date() } = {}) {
  const at = (...xs) => path.join(dataDir, ...xs);
  for (const d of ['jd', 'resumes', 'backups']) fs.mkdirSync(at(d), { recursive: true });

  function def(name) {
    const d = DOCS[name];
    if (!d) throw new StoreError('NOT_FOUND', `未知的数据：${name}`);
    return d;
  }

  function read(name) {
    const d = def(name);
    let raw;
    try {
      raw = fs.readFileSync(at(d.file), 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return d.empty();
      throw e;
    }
    if (!raw.trim()) return d.empty();
    let value;
    try {
      value = JSON.parse(raw);
    } catch (e) {
      throw new StoreError('CORRUPT', `${d.file} 不是有效的 JSON（${e.message}）。请修好这个文件，或从 data/backups/ 里恢复。`);
    }
    if (LIST_DOCS.has(name) && !Array.isArray(value)) throw new StoreError('CORRUPT', `${d.file} 应该是一个数组。`);
    return value;
  }

  function atomicWrite(file, content) {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, file);
  }

  function backupIfDue(name) {
    const file = at(def(name).file);
    if (!fs.existsSync(file)) return;
    const base = path.basename(file, '.json');
    const pattern = new RegExp(`^${base}\\.(\\d{8}-\\d{6})\\.json$`);
    const existing = fs.readdirSync(at('backups'))
      .map((f) => ({ f, m: pattern.exec(f) }))
      .filter((x) => x.m)
      .sort((a, b) => (a.m[1] < b.m[1] ? -1 : 1));
    const t = now();
    const last = existing.at(-1);
    if (last && t.getTime() - parseStamp(last.m[1]) < BACKUP_INTERVAL_MS) return;
    const target = `${base}.${stamp(t)}.json`;
    fs.copyFileSync(file, at('backups', target));
    const all = [...existing.map((x) => x.f), target];
    for (const f of all.slice(0, Math.max(0, all.length - BACKUP_KEEP))) fs.rmSync(at('backups', f), { force: true });
  }

  function write(name, value) {
    read(name); // 文件损坏时这里抛 CORRUPT，拒绝覆盖
    backupIfDue(name);
    atomicWrite(at(def(name).file), `${JSON.stringify(value, null, 2)}\n`);
  }

  // ---- 集合（applications / answers / resumes）----
  const list = (coll) => read(coll);
  const get = (coll, id) => list(coll).find((r) => r.id === id) || null;

  function indexOrThrow(all, id) {
    const i = all.findIndex((r) => r.id === id);
    if (i < 0) throw new StoreError('NOT_FOUND', '记录不存在');
    return i;
  }
  function insert(coll, record) {
    const all = list(coll);
    all.push(record);
    write(coll, all);
    return record;
  }
  function replace(coll, id, record) {
    const all = list(coll);
    all[indexOrThrow(all, id)] = record;
    write(coll, all);
    return record;
  }
  function remove(coll, id) {
    const all = list(coll);
    const [removed] = all.splice(indexOrThrow(all, id), 1);
    write(coll, all);
    return removed;
  }

  // ---- 档案与设置：按顶层 key 合并 ----
  const getProfile = () => normalizeProfile(read('profile'));
  function patchProfile(patch) {
    const next = { ...read('profile'), ...patch };
    write('profile', next);
    return normalizeProfile(next);
  }
  const getSettings = () => ({ ...DEFAULT_SETTINGS, ...read('settings') });
  function patchSettings(patch) {
    const next = { ...read('settings'), ...patch };
    write('settings', next);
    return { ...DEFAULT_SETTINGS, ...next };
  }

  // ---- JD 快照 ----
  function jdPath(id) {
    if (!SAFE_ID.test(id)) throw new StoreError('BAD_REQUEST', '非法 id');
    return at('jd', `${id}.md`);
  }
  function readJd(id) {
    try {
      return stripJdHeader(fs.readFileSync(jdPath(id), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return '';
      throw e;
    }
  }
  function writeJd(id, text, header) {
    atomicWrite(jdPath(id), `${header.replace(/\n+$/, '')}\n\n---\n\n${text.trim()}\n`);
    return `jd/${id}.md`;
  }
  const deleteJd = (id) => fs.rmSync(jdPath(id), { force: true });

  // ---- 简历文件 ----
  function saveResumeFile(resumeId, originalName, buf) {
    if (!SAFE_ID.test(resumeId)) throw new StoreError('BAD_REQUEST', '非法 id');
    const name = path.basename(String(originalName)).replace(/[/\\:*?"<>|\x00-\x1f]/g, '_').slice(-120) || 'file';
    const stored = `${resumeId}__${Date.now().toString(36)}__${name}`;
    fs.writeFileSync(at('resumes', stored), buf);
    return { name, stored: `resumes/${stored}`, size: buf.length, uploadedAt: now().toISOString() };
  }
  function resumeFilePath(stored) {
    const base = path.basename(String(stored));
    if (!stored || base !== stored || stored.startsWith('.')) throw new StoreError('BAD_REQUEST', '非法文件名');
    const full = at('resumes', base);
    if (!fs.existsSync(full)) throw new StoreError('NOT_FOUND', '文件不存在');
    return full;
  }
  const deleteResumeFile = (stored) => fs.rmSync(resumeFilePath(stored), { force: true });

  /** 数据文件的最新修改时间；网页靠它发现外部改动 */
  function version() {
    let v = 0;
    for (const d of Object.values(DOCS)) {
      try {
        v = Math.max(v, fs.statSync(at(d.file)).mtimeMs);
      } catch {
        // 文件还不存在
      }
    }
    return Math.floor(v);
  }

  return {
    dataDir, list, get, insert, replace, remove,
    getProfile, patchProfile, getSettings, patchSettings,
    readJd, writeJd, deleteJd,
    saveResumeFile, resumeFilePath, deleteResumeFile,
    version,
  };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，store 的 10 个测试通过

- [ ] **Step 5: Commit**

```bash
git add server/store.js tests/store.test.js
git commit -m "feat: file store with atomic writes, throttled backups, jd and resume files"
```

---
### Task 8: HTTP 服务（API + 静态文件 + 安全检查）

**Files:**
- Create: `server/app.js`
- Create: `server.js`
- Test: `tests/server.test.js`

- [ ] **Step 1: 写失败的测试**

```js file=tests/server.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clock = new Date('2026-09-21T18:00:00Z').getTime(); // 洛杉矶 9/21 11:00
let server;
let base;
let port;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-server-'));
  server = http.createServer(createApp({ dataDir, rootDir, now: () => new Date(clock) }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});

after(() => server.close());

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const post = async (p, body) => (await fetch(`${base}${p}`, json('POST', body))).json();

/** fetch 不允许改 Host，安全相关的测试用原始 http 请求 */
function rawRequest({ method = 'GET', pathname = '/api/ping', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: pathname, headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('ping 与 state', async () => {
  assert.deepEqual(await (await fetch(`${base}/api/ping`)).json(), { ok: true, app: 'job-tracker', version: '1.0.0' });
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual(state.applications, []);
  assert.equal(state.settings.targetTz, 'Asia/Shanghai');
  assert.ok(Array.isArray(state.profile.education));
  assert.equal(typeof state.version, 'number');
});

test('投递：新建、改阶段写时间线、非法值 400、删除', async () => {
  let res = await fetch(`${base}/api/applications`, json('POST', { company: '雀巢', position: 'MT', stage: 'applied' }));
  assert.equal(res.status, 201);
  assert.ok(res.headers.get('x-data-version'));
  const app = await res.json();
  assert.equal(app.appliedAt, '2026-09-21');
  res = await fetch(`${base}/api/applications/${app.id}`, json('PATCH', { stage: 'interview' }));
  assert.equal((await res.json()).timeline.at(-1).to, 'interview');
  res = await fetch(`${base}/api/applications/${app.id}`, json('PATCH', { stage: 'bogus' }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /阶段/);
  res = await fetch(`${base}/api/applications/${app.id}`, { method: 'DELETE' });
  assert.equal(res.status, 200);
  assert.equal((await fetch(`${base}/api/applications/${app.id}`)).status, 404);
});

test('JD 快照：写入、读取、随投递删除', async () => {
  const app = await post('/api/applications', { company: '宝洁', position: 'Brand MT' });
  const withJd = await (await fetch(`${base}/api/applications/${app.id}/jd`, json('PUT', { text: '职责：做品牌' }))).json();
  assert.equal(withJd.jdFile, `jd/${app.id}.md`);
  assert.match(fs.readFileSync(path.join(dataDir, 'jd', `${app.id}.md`), 'utf8'), /^# 宝洁 · Brand MT/);
  assert.deepEqual(await (await fetch(`${base}/api/applications/${app.id}/jd`)).json(), { text: '职责：做品牌' });
  await fetch(`${base}/api/applications/${app.id}`, { method: 'DELETE' });
  assert.ok(!fs.existsSync(path.join(dataDir, 'jd', `${app.id}.md`)));
});

test('清空 JD 文本等于删除快照', async () => {
  const app = await post('/api/applications', { company: 'A' });
  await fetch(`${base}/api/applications/${app.id}/jd`, json('PUT', { text: 'x' }));
  const cleared = await (await fetch(`${base}/api/applications/${app.id}/jd`, json('PUT', { text: '  ' }))).json();
  assert.equal(cleared.jdFile, null);
});

test('档案与设置 PATCH', async () => {
  const p = await (await fetch(`${base}/api/profile`, json('PATCH', { skills: { zh: 'SQL', en: 'SQL' } }))).json();
  assert.equal(p.skills.en, 'SQL');
  const s = await (await fetch(`${base}/api/settings`, json('PATCH', { weeklyGoal: 12 }))).json();
  assert.equal(s.weeklyGoal, 12);
  assert.equal(s.staleDays, 14);
});

test('素材库：通用集合的新建和修改，id 不可改', async () => {
  const a = await post('/api/answers', { category: '领导力', text: 'x' });
  assert.match(a.id, /^ans_/);
  const b = await (await fetch(`${base}/api/answers/${a.id}`, json('PATCH', { text: 'y', id: 'hack' }))).json();
  assert.equal(b.id, a.id);
  assert.equal(b.text, 'y');
});

test('简历：上传中文文件名、下载、删除文件、删除版本', async () => {
  const r = await post('/api/resumes', { name: '产品线-中文', track: '产品', lang: 'zh' });
  assert.deepEqual(r.files, []);
  let res = await fetch(`${base}/api/resumes/${r.id}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent('简历-产品.pdf') },
    body: Buffer.from('%PDF-test'),
  });
  assert.equal(res.status, 201);
  const withFile = await res.json();
  assert.equal(withFile.files[0].name, '简历-产品.pdf');
  const stored = withFile.files[0].stored.replace('resumes/', '');
  res = await fetch(`${base}/files/resumes/${encodeURIComponent(stored)}`);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition'), /^inline; filename\*=UTF-8''/);
  assert.equal(await res.text(), '%PDF-test');
  res = await fetch(`${base}/api/resumes/${r.id}/files/${encodeURIComponent(stored)}`, { method: 'DELETE' });
  assert.deepEqual((await res.json()).files, []);
  assert.equal((await fetch(`${base}/api/resumes/${r.id}`, { method: 'DELETE' })).status, 200);
});

test('日历导出', async () => {
  const app = await post('/api/applications', { company: '玛氏', deadline: '2026-10-20' });
  const res = await fetch(`${base}/calendar.ics`);
  assert.match(res.headers.get('content-type'), /text\/calendar/);
  assert.match(await res.text(), new RegExp(`deadline-${app.id}@job-tracker`));
});

test('静态文件：shared 可访问，路径穿越被拒，不存在返回 404', async () => {
  const res = await fetch(`${base}/shared/constants.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.equal((await rawRequest({ pathname: '/shared/..%2Fpackage.json' })).status, 403);
  assert.equal((await fetch(`${base}/nope.html`)).status, 404);
});

test('安全：Host、Origin、Content-Type、OPTIONS', async () => {
  assert.equal((await rawRequest({ headers: { Host: 'evil.com' } })).status, 403);
  assert.equal((await rawRequest({ headers: { Host: `localhost:${port}` } })).status, 200);
  assert.equal((await rawRequest({ headers: { Origin: 'https://evil.com' } })).status, 403);
  assert.equal((await rawRequest({ headers: { Origin: 'chrome-extension://abcdef' } })).status, 200);
  assert.equal((await rawRequest({ headers: { Origin: `http://127.0.0.1:${port}` } })).status, 200);
  assert.equal((await rawRequest({ method: 'OPTIONS' })).status, 403);
  const res = await fetch(`${base}/api/answers`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(res.status, 415);
});

test('数据文件损坏时返回清楚的错误', async () => {
  const file = path.join(dataDir, 'answers.json');
  const good = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, '{oops');
  const res = await fetch(`${base}/api/answers`);
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /answers\.json 不是有效的 JSON/);
  fs.writeFileSync(file, good);
});

test('写入后 version 变大', async () => {
  const v1 = (await (await fetch(`${base}/api/version`)).json()).version;
  await new Promise((r) => setTimeout(r, 10));
  const res = await fetch(`${base}/api/settings`, json('PATCH', { weeklyGoal: 9 }));
  assert.ok(Number(res.headers.get('x-data-version')) > v1);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL，`Cannot find module .../server/app.js`

- [ ] **Step 3: 实现 HTTP 层**

```js file=server/app.js
// HTTP 层：安全检查 → 路由 → 调用 store 和 shared/ 里的业务规则。
import fs from 'node:fs';
import path from 'node:path';
import { createStore, StoreError } from './store.js';
import { COLLECTIONS, ID_PREFIX } from '../shared/constants.js';
import { prepareNewApplication, applyApplicationUpdate, validateApplication, newId } from '../shared/domain.js';
import { buildCalendar } from '../shared/ics.js';
import { todayInZone } from '../shared/time.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 只接受本机网页和 Chrome 插件的请求（防其他网站读写、防 DNS rebinding） */
function checkSecurity(req) {
  const port = req.socket.localPort;
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(req.headers.host)) throw new HttpError(403, 'Host 不被允许');
  const origin = req.headers.origin;
  if (origin && !hosts.some((h) => origin === `http://${h}`) && !origin.startsWith('chrome-extension://')) {
    throw new HttpError(403, '不接受来自其他网站的请求');
  }
  if (req.method === 'OPTIONS') throw new HttpError(403, '不支持跨域请求');
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) tooBig = true;
      else chunks.push(c);
    });
    req.on('end', () => (tooBig ? reject(new HttpError(413, '内容太大')) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

async function readJson(req) {
  if (!String(req.headers['content-type'] || '').includes('application/json')) {
    throw new HttpError(415, '请求需要是 application/json');
  }
  const buf = await readBody(req, MAX_JSON_BYTES);
  let value;
  try {
    value = JSON.parse(buf.toString('utf8'));
  } catch {
    throw new HttpError(400, '请求体不是有效的 JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, '请求体应该是一个 JSON 对象');
  return value;
}

function sendJson(res, status, body, version) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (version != null) headers['X-Data-Version'] = String(version);
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function sendText(res, status, text, type) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}

function sendFile(res, full, { download = false, displayName } = {}) {
  const ext = path.extname(full).toLowerCase();
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
  if (download) {
    const disposition = ext === '.pdf' ? 'inline' : 'attachment';
    headers['Content-Disposition'] = `${disposition}; filename*=UTF-8''${encodeURIComponent(displayName || path.basename(full))}`;
  }
  res.writeHead(200, headers);
  fs.createReadStream(full).pipe(res);
}

function serveStatic(res, root, parts) {
  const full = path.resolve(root, ...parts);
  if (full !== root && !full.startsWith(root + path.sep)) throw new HttpError(403, '禁止访问');
  let st;
  try {
    st = fs.statSync(full);
  } catch {
    throw new HttpError(404, '找不到这个页面');
  }
  if (st.isDirectory()) return serveStatic(res, root, [...parts, 'index.html']);
  return sendFile(res, full);
}

function sendError(res, e) {
  let status = 500;
  let message = e.message || '服务器出错了';
  if (e instanceof HttpError) status = e.status;
  else if (e instanceof StoreError) status = { NOT_FOUND: 404, BAD_REQUEST: 400, CORRUPT: 500 }[e.code] || 500;
  else if (e instanceof URIError) {
    status = 400;
    message = '网址编码有误';
  } else console.error(e);
  if (res.headersSent) {
    res.end();
    return;
  }
  sendJson(res, status, { error: message });
}

function jdHeader(app, now) {
  return [
    `# ${app.company || '未命名公司'} · ${app.position || '未命名岗位'}`,
    '',
    `- 链接：${app.jdUrl || '（无）'}`,
    `- 保存时间：${now.toISOString()}`,
  ].join('\n');
}

export function createApp({ dataDir, rootDir, now = () => new Date() }) {
  const store = createStore(dataDir, { now });
  const webDir = path.join(rootDir, 'web');
  const sharedDir = path.join(rootDir, 'shared');
  const { version: appVersion } = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

  const ctx = () => {
    const t = now();
    return { nowISO: t.toISOString(), today: todayInZone(store.getSettings().homeTz, t) };
  };

  function mustGet(coll, id) {
    const rec = store.get(coll, id);
    if (!rec) throw new HttpError(404, '记录不存在');
    return rec;
  }

  function create(coll, input) {
    let rec;
    if (coll === 'applications') {
      rec = prepareNewApplication(input, ctx());
      const err = validateApplication(rec);
      if (err) throw new HttpError(400, err);
    } else {
      const nowISO = now().toISOString();
      rec = { ...input, id: input.id || newId(ID_PREFIX[coll]), createdAt: nowISO, updatedAt: nowISO };
      if (coll === 'resumes' && !Array.isArray(rec.files)) rec.files = [];
    }
    if (store.get(coll, rec.id)) throw new HttpError(409, '这个 id 已经存在');
    return store.insert(coll, rec);
  }

  function update(coll, id, patch) {
    const cur = mustGet(coll, id);
    let next;
    if (coll === 'applications') {
      next = applyApplicationUpdate(cur, patch, ctx());
      const err = validateApplication(next);
      if (err) throw new HttpError(400, err);
    } else {
      const { id: _id, createdAt: _createdAt, ...changes } = patch;
      next = { ...cur, ...changes, updatedAt: now().toISOString() };
    }
    return store.replace(coll, id, next);
  }

  function destroy(coll, id) {
    const rec = mustGet(coll, id);
    if (coll === 'applications') store.deleteJd(id);
    if (coll === 'resumes') {
      for (const f of rec.files || []) {
        try {
          store.deleteResumeFile(path.basename(f.stored));
        } catch {
          // 文件可能已经被手动删掉
        }
      }
    }
    store.remove(coll, id);
  }

  function saveJd(app, text) {
    const jdFile = text.trim() ? store.writeJd(app.id, text, jdHeader(app, now())) : null;
    if (!jdFile) store.deleteJd(app.id);
    return store.replace('applications', app.id, { ...app, jdFile, updatedAt: now().toISOString() });
  }

  async function uploadFile(req, resumeId) {
    const resume = mustGet('resumes', resumeId);
    const raw = req.headers['x-filename'];
    if (!raw) throw new HttpError(400, '缺少 X-Filename');
    const name = decodeURIComponent(raw);
    const buf = await readBody(req, MAX_FILE_BYTES);
    if (!buf.length) throw new HttpError(400, '文件是空的');
    const file = store.saveResumeFile(resumeId, name, buf);
    return store.replace('resumes', resumeId, { ...resume, files: [...(resume.files || []), file], updatedAt: now().toISOString() });
  }

  function deleteFile(resumeId, stored) {
    const resume = mustGet('resumes', resumeId);
    const files = (resume.files || []).filter((f) => path.basename(f.stored) !== stored);
    if (files.length === (resume.files || []).length) throw new HttpError(404, '文件不存在');
    try {
      store.deleteResumeFile(stored);
    } catch (e) {
      if (e.code !== 'NOT_FOUND') throw e;
    }
    return store.replace('resumes', resumeId, { ...resume, files, updatedAt: now().toISOString() });
  }

  async function api(req, res, parts) {
    const m = req.method;
    const [a, b, c, d] = parts;
    const send = (status, body) => sendJson(res, status, body, store.version());

    if (a === 'ping' && m === 'GET' && !b) return send(200, { ok: true, app: 'job-tracker', version: appVersion });
    if (a === 'version' && m === 'GET' && !b) return send(200, { version: store.version() });
    if (a === 'state' && m === 'GET' && !b) {
      return send(200, {
        profile: store.getProfile(),
        settings: store.getSettings(),
        applications: store.list('applications'),
        answers: store.list('answers'),
        resumes: store.list('resumes'),
        version: store.version(),
      });
    }
    if (a === 'profile' && !b) {
      if (m === 'GET') return send(200, store.getProfile());
      if (m === 'PATCH') return send(200, store.patchProfile(await readJson(req)));
    }
    if (a === 'settings' && !b) {
      if (m === 'GET') return send(200, store.getSettings());
      if (m === 'PATCH') return send(200, store.patchSettings(await readJson(req)));
    }
    if (COLLECTIONS.includes(a)) {
      if (!b) {
        if (m === 'GET') return send(200, store.list(a));
        if (m === 'POST') return send(201, create(a, await readJson(req)));
      } else if (!c) {
        if (m === 'GET') return send(200, mustGet(a, b));
        if (m === 'PATCH') return send(200, update(a, b, await readJson(req)));
        if (m === 'DELETE') {
          destroy(a, b);
          return send(200, { ok: true });
        }
      } else if (a === 'applications' && c === 'jd' && !d) {
        const app = mustGet(a, b);
        if (m === 'GET') return send(200, { text: store.readJd(b) });
        if (m === 'PUT') {
          const { text = '' } = await readJson(req);
          return send(200, saveJd(app, String(text)));
        }
      } else if (a === 'resumes' && c === 'files') {
        if (m === 'POST' && !d) return send(201, await uploadFile(req, b));
        if (m === 'DELETE' && d) return send(200, deleteFile(b, d));
      }
    }
    throw new HttpError(404, '接口不存在');
  }

  return async function handle(req, res) {
    try {
      checkSecurity(req);
      const url = new URL(req.url, 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (parts[0] === 'api') return await api(req, res, parts.slice(1));
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, '不支持这个请求方法');
      if (url.pathname === '/calendar.ics') {
        return sendText(res, 200, buildCalendar(store.list('applications'), store.getSettings(), now()), 'text/calendar; charset=utf-8');
      }
      if (parts[0] === 'files' && parts[1] === 'resumes' && parts.length === 3) {
        const displayName = parts[2].split('__').slice(2).join('__') || parts[2];
        return sendFile(res, store.resumeFilePath(parts[2]), { download: true, displayName });
      }
      if (parts[0] === 'shared') return serveStatic(res, sharedDir, parts.slice(1));
      return serveStatic(res, webDir, parts.length ? parts : ['index.html']);
    } catch (e) {
      return sendError(res, e);
    }
  };
}
```

- [ ] **Step 4: 实现入口**

```js file=server.js
// 秋招 Tracker 本地服务入口：只监听 127.0.0.1（同一 Wi-Fi 的其他设备也访问不到）
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './server/app.js';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 7317);
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');

const server = http.createServer(createApp({ dataDir, rootDir }));

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用。如果 Tracker 已经在运行，直接打开 http://127.0.0.1:${port}`);
  } else {
    console.error(e);
  }
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`秋招 Tracker 已启动：http://127.0.0.1:${port}（数据目录：${dataDir}）`);
});
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，server 的 12 个测试和之前所有测试全部通过

- [ ] **Step 6: 手动冒烟**

Run: `DATA_DIR=$(mktemp -d) PORT=7399 node server.js & sleep 1; curl -s http://127.0.0.1:7399/api/ping; kill %1`
Expected: 输出 `{"ok":true,"app":"job-tracker","version":"1.0.0"}`

- [ ] **Step 7: Commit**

```bash
git add server/app.js server.js tests/server.test.js
git commit -m "feat: local http server with rest api, security checks and static files"
```

---
### Task 9: 启动 / 停止脚本

双击 `启动Tracker.command`：服务没在跑就在后台启动，然后打开网页；Terminal 窗口可以直接关。

**Files:**
- Create: `启动Tracker.command`
- Create: `停止Tracker.command`

- [ ] **Step 1: 写启动脚本**

```bash file=启动Tracker.command
#!/bin/bash
# 双击启动秋招 Tracker。服务已经在运行时直接打开网页。
cd "$(dirname "$0")" || exit 1
PORT=7317
URL="http://127.0.0.1:$PORT"

is_running() {
  curl -s --max-time 1 "$URL/api/ping" | grep -q '"job-tracker"'
}

NODE="$(command -v node)"
for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
  [ -z "$NODE" ] && [ -x "$candidate" ] && NODE="$candidate"
done
if [ -z "$NODE" ]; then
  echo "没有找到 Node.js。请先安装：https://nodejs.org（或者 brew install node）"
  read -n 1 -s -r -p "按任意键关闭…"
  exit 1
fi

if is_running; then
  echo "Tracker 已经在运行。"
else
  mkdir -p data
  nohup "$NODE" server.js >> data/server.log 2>&1 &
  for _ in $(seq 1 50); do
    is_running && break
    sleep 0.2
  done
  if ! is_running; then
    echo "启动失败，下面是最近的日志："
    tail -n 20 data/server.log
    read -n 1 -s -r -p "按任意键关闭…"
    exit 1
  fi
  echo "Tracker 已启动。"
fi

open "$URL"
echo "可以关掉这个窗口，Tracker 会继续在后台运行。要停止就双击「停止Tracker.command」。"
```

- [ ] **Step 2: 写停止脚本**

```bash file=停止Tracker.command
#!/bin/bash
# 双击停止秋招 Tracker
PORT=7317
if ! curl -s --max-time 1 "http://127.0.0.1:$PORT/api/ping" | grep -q '"job-tracker"'; then
  echo "Tracker 没有在运行。"
  exit 0
fi
PIDS="$(lsof -ti "tcp:$PORT" -sTCP:LISTEN)"
if [ -n "$PIDS" ]; then
  kill $PIDS && echo "Tracker 已停止。"
fi
```

- [ ] **Step 3: 加执行权限并验证**

Run:
```bash
chmod +x 启动Tracker.command 停止Tracker.command
bash 启动Tracker.command < /dev/null; curl -s http://127.0.0.1:7317/api/ping; echo; bash 停止Tracker.command; curl -s --max-time 1 http://127.0.0.1:7317/api/ping || echo "stopped"
```
Expected: 先打印「Tracker 已启动。」并在浏览器打开网页（此时网页 404 是正常的，T10 才有页面），ping 返回 `{"ok":true,...}`；然后「Tracker 已停止。」和 `stopped`

- [ ] **Step 4: Commit**

```bash
git add 启动Tracker.command 停止Tracker.command
git commit -m "chore: double-click start and stop scripts"
```

---

### Task 10: 网页外壳与基础样式

视觉方向：安静、干净的工作台。暖白底 + 深墨色文字，一个靛蓝主色；阶段各有一个柔和的标识色。深色模式跟随系统。不依赖任何外部字体和 CDN。

**Files:**
- Create: `web/index.html`
- Create: `web/css/base.css`

- [ ] **Step 1: 写外壳 HTML**

```html file=web/index.html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>秋招 Tracker</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%234f5bd5'/%3E%3Cpath d='M9 17l5 5 9-11' stroke='white' stroke-width='3.2' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
  <link rel="stylesheet" href="/css/base.css">
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-name">秋招 Tracker</span>
      </div>
      <nav class="nav" id="nav">
        <a href="#/dashboard" data-route="dashboard"><span class="nav-icon" data-icon="home"></span>概览<span class="nav-badge" data-badge="dashboard"></span></a>
        <a href="#/applications" data-route="applications"><span class="nav-icon" data-icon="briefcase"></span>投递<span class="nav-badge" data-badge="applications"></span></a>
        <a href="#/calendar" data-route="calendar"><span class="nav-icon" data-icon="calendar"></span>日程</a>
        <a href="#/profile" data-route="profile"><span class="nav-icon" data-icon="user"></span>档案</a>
        <a href="#/resumes" data-route="resumes"><span class="nav-icon" data-icon="file"></span>简历</a>
        <a href="#/answers" data-route="answers"><span class="nav-icon" data-icon="book"></span>素材库</a>
        <a href="#/settings" data-route="settings"><span class="nav-icon" data-icon="settings"></span>设置</a>
      </nav>
      <div class="sidebar-foot" id="clock"></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <h1 id="page-title">概览</h1>
        <div class="topbar-actions">
          <label class="search">
            <span class="search-icon" data-icon="search"></span>
            <input id="global-search" type="search" placeholder="搜索公司、岗位、城市（按 / ）" autocomplete="off">
          </label>
          <button class="btn primary" id="new-app-btn" type="button"><span data-icon="plus"></span>新建投递</button>
        </div>
      </header>
      <div class="offline-banner" id="offline-banner" hidden>连不上 Tracker 服务：双击 <b>启动Tracker.command</b> 后刷新页面。</div>
      <main class="view" id="view"></main>
    </div>
  </div>
  <div id="toasts" class="toasts" aria-live="polite"></div>
  <script type="module" src="/js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: 写基础样式**

```css file=web/css/base.css
/* ---------- 设计变量 ---------- */
:root {
  --bg: #f6f5f2;
  --surface: #ffffff;
  --surface-2: #f1f0ec;
  --surface-3: #e8e6e0;
  --border: #e4e2dc;
  --border-strong: #d3d0c8;
  --text: #1d1c1a;
  --text-2: #5f5c56;
  --text-3: #8f8b83;
  --accent: #4f5bd5;
  --accent-hover: #4350c4;
  --accent-soft: #eceefd;
  --accent-text: #3b46b3;
  --danger: #c2413b;
  --danger-soft: #fbeceb;
  --warn: #b7791f;
  --warn-soft: #fcf3e3;
  --ok: #2f8a57;
  --ok-soft: #e7f4ec;

  /* 阶段标识色：已用 dataviz 校验脚本验证（相邻色盲 ΔE ≥ 9.4，对白底 ≥ 3:1），且总与文字标签同时出现 */
  --st-wishlist: #8a8f98;
  --st-applied: #3f7fd9;
  --st-assessment: #b7791f;
  --st-interview: #8250df;
  --st-final: #d0477f;
  --st-offer: #1b6e43;
  --st-closed: #a3a09a;

  --radius-sm: 6px;
  --radius: 10px;
  --radius-lg: 14px;
  --shadow-sm: 0 1px 2px rgba(29, 28, 26, 0.06);
  --shadow: 0 1px 3px rgba(29, 28, 26, 0.08), 0 4px 14px rgba(29, 28, 26, 0.06);
  --shadow-lg: 0 12px 40px rgba(29, 28, 26, 0.18);
  --font: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, monospace;
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161615;
    --surface: #1f1f1d;
    --surface-2: #262624;
    --surface-3: #30302d;
    --border: #33322f;
    --border-strong: #44433f;
    --text: #ecebe7;
    --text-2: #aeaba4;
    --text-3: #7d7a73;
    --accent: #7c86f0;
    --accent-hover: #8e97f3;
    --accent-soft: #272a4a;
    --accent-text: #aab1ff;
    --danger: #ec6a63;
    --danger-soft: #3a2220;
    --warn: #e0a444;
    --warn-soft: #362b17;
    --ok: #55b981;
    --ok-soft: #1c3226;
    /* 深色模式单独选的一组（L 0.48–0.67，相邻色盲 ΔE ≥ 13） */
    --st-wishlist: #9aa0a8;
    --st-applied: #3987e5;
    --st-assessment: #c98500;
    --st-interview: #9085e9;
    --st-final: #d55181;
    --st-offer: #008300;
    --st-closed: #7d7a73;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
    --shadow: 0 1px 3px rgba(0, 0, 0, 0.4), 0 4px 14px rgba(0, 0, 0, 0.3);
    --shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.55);
    color-scheme: dark;
  }
}

/* ---------- 基础 ---------- */
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 14px/1.55 var(--font);
  -webkit-font-smoothing: antialiased;
}
a { color: var(--accent-text); text-decoration: none; }
a:hover { text-decoration: underline; }
h1, h2, h3, h4 { margin: 0; font-weight: 600; letter-spacing: -0.01em; }
button, input, select, textarea { font: inherit; color: inherit; }
[hidden] { display: none !important; }
::selection { background: var(--accent-soft); }

.icon, [data-icon] { display: inline-flex; width: 16px; height: 16px; flex: none; }
.icon svg, [data-icon] svg { width: 100%; height: 100%; }

/* ---------- 布局 ---------- */
.app { display: flex; height: 100vh; overflow: hidden; }
.sidebar {
  width: 212px;
  flex: none;
  display: flex;
  flex-direction: column;
  padding: 18px 12px 14px;
  border-right: 1px solid var(--border);
  background: var(--surface-2);
}
.brand { display: flex; align-items: center; gap: 10px; padding: 2px 10px 18px; }
.brand-mark {
  width: 22px; height: 22px; border-radius: 7px;
  background: var(--accent);
  box-shadow: inset 0 -6px 0 rgba(0, 0, 0, 0.12);
}
.brand-name { font-weight: 650; font-size: 15px; }
.nav { display: flex; flex-direction: column; gap: 2px; }
.nav a {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  transition: background 0.12s, color 0.12s;
}
.nav a:hover { background: var(--surface-3); color: var(--text); text-decoration: none; }
.nav a.active { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); font-weight: 550; }
.nav-icon { color: var(--text-3); }
.nav a.active .nav-icon { color: var(--accent); }
.nav-badge {
  margin-left: auto;
  min-width: 18px; padding: 0 6px;
  border-radius: 9px;
  background: var(--accent-soft); color: var(--accent-text);
  font-size: 11px; line-height: 18px; text-align: center; font-weight: 600;
}
.nav-badge:empty { display: none; }
.sidebar-foot { margin-top: auto; padding: 10px; font-size: 12px; color: var(--text-3); line-height: 1.7; }

.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 14px 28px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.topbar h1 { font-size: 19px; }
.topbar-actions { display: flex; align-items: center; gap: 10px; }
.search {
  display: flex; align-items: center; gap: 8px;
  width: 300px; padding: 0 10px; height: 34px;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--surface);
}
.search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.search-icon { color: var(--text-3); }
.search input { flex: 1; border: 0; outline: 0; background: transparent; height: 100%; }
.view { flex: 1; overflow: auto; padding: 24px 28px 48px; }
.offline-banner { padding: 8px 28px; background: var(--warn-soft); color: var(--warn); font-size: 13px; }

/* ---------- 按钮 ---------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; padding: 0 12px;
  border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--text);
  cursor: pointer; white-space: nowrap;
  transition: background 0.12s, border-color 0.12s, transform 0.08s;
}
.btn:hover { background: var(--surface-2); }
.btn:active { transform: translateY(1px); }
.btn:disabled { opacity: 0.5; cursor: default; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.primary:hover { background: var(--accent-hover); }
.btn.danger { color: var(--danger); }
.btn.danger:hover { background: var(--danger-soft); border-color: var(--danger); }
.btn.ghost { border-color: transparent; background: transparent; color: var(--text-2); }
.btn.ghost:hover { background: var(--surface-2); color: var(--text); }
.btn.sm { height: 26px; padding: 0 8px; font-size: 12px; }
.btn.icon-only { width: 32px; padding: 0; }
.btn.sm.icon-only { width: 26px; }

/* ---------- 表单 ---------- */
.input, .select, .textarea {
  width: 100%;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--surface);
  padding: 6px 10px;
  outline: none;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.input, .select { height: 32px; }
.textarea { min-height: 72px; resize: vertical; line-height: 1.6; }
.input:focus, .select:focus, .textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.input::placeholder, .textarea::placeholder { color: var(--text-3); }
.field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.field > .label { font-size: 12px; color: var(--text-2); font-weight: 500; }
.field > .hint { font-size: 12px; color: var(--text-3); }
.field.full { grid-column: 1 / -1; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; }
.form-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.row { display: flex; align-items: center; gap: 8px; }
.row.wrap { flex-wrap: wrap; }
.spacer { flex: 1; }
.muted { color: var(--text-3); }
.small { font-size: 12px; }

.segmented { display: inline-flex; padding: 2px; border-radius: var(--radius-sm); background: var(--surface-3); gap: 2px; }
.segmented button {
  border: 0; background: transparent; height: 26px; padding: 0 10px;
  border-radius: 5px; color: var(--text-2); cursor: pointer;
}
.segmented button.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); font-weight: 550; }

.stars { display: inline-flex; gap: 1px; color: var(--border-strong); }
.stars button { border: 0; background: none; padding: 0 1px; cursor: pointer; color: inherit; font-size: 15px; line-height: 1; }
.stars .on { color: #e2a72e; }

/* ---------- 标签 ---------- */
.chip {
  display: inline-flex; align-items: center; gap: 4px;
  height: 20px; padding: 0 7px;
  border-radius: 10px;
  background: var(--surface-3); color: var(--text-2);
  font-size: 11.5px; white-space: nowrap;
}
.chip.accent { background: var(--accent-soft); color: var(--accent-text); }
.chip.warn { background: var(--warn-soft); color: var(--warn); }
.chip.danger { background: var(--danger-soft); color: var(--danger); }
.chip.ok { background: var(--ok-soft); color: var(--ok); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--st-wishlist); }
.dot.wishlist { background: var(--st-wishlist); }
.dot.applied { background: var(--st-applied); }
.dot.assessment { background: var(--st-assessment); }
.dot.interview { background: var(--st-interview); }
.dot.final { background: var(--st-final); }
.dot.offer { background: var(--st-offer); }
.dot.closed { background: var(--st-closed); }

/* ---------- 卡片 / 空状态 ---------- */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.card-head { display: flex; align-items: center; gap: 8px; padding: 14px 16px 0; }
.card-head h3 { font-size: 14px; }
.card-body { padding: 12px 16px 16px; }
.empty {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 36px 16px; color: var(--text-3); text-align: center;
}

/* ---------- 弹窗 ---------- */
.overlay {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(20, 19, 17, 0.36);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 8vh 16px 16px;
  animation: fade-in 0.15s var(--ease);
}
.modal {
  width: min(560px, 100%); max-height: 84vh;
  display: flex; flex-direction: column;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  animation: pop-in 0.18s var(--ease);
}
.modal.wide { width: min(880px, 100%); }
.modal-head { display: flex; align-items: center; gap: 8px; padding: 16px 18px 8px; }
.modal-head h2 { font-size: 16px; }
.modal-body { padding: 8px 18px 16px; overflow: auto; }
.modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--border); }

/* ---------- 抽屉 ---------- */
.drawer-overlay {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(20, 19, 17, 0.2);
  animation: fade-in 0.15s var(--ease);
}
.drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 41;
  width: min(600px, 100vw);
  display: flex; flex-direction: column;
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  animation: slide-in 0.22s var(--ease);
}
.drawer-head { display: flex; align-items: flex-start; gap: 10px; padding: 18px 20px 12px; border-bottom: 1px solid var(--border); }
.drawer-body { flex: 1; overflow: auto; padding: 16px 20px 32px; }

/* ---------- 标签页 ---------- */
.tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin: 0 -20px 16px; padding: 0 20px; }
.tabs button {
  border: 0; background: none; cursor: pointer;
  padding: 9px 10px; margin-bottom: -1px;
  color: var(--text-2); border-bottom: 2px solid transparent;
}
.tabs button.on { color: var(--text); border-bottom-color: var(--accent); font-weight: 550; }

/* ---------- 提示 ---------- */
.toasts { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 60; display: flex; flex-direction: column; gap: 8px; align-items: center; }
.toast {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 14px;
  border-radius: var(--radius);
  background: #262523; color: #f4f3ef;
  box-shadow: var(--shadow-lg);
  font-size: 13px;
  animation: toast-in 0.2s var(--ease);
}
.toast.error { background: var(--danger); color: #fff; }
.toast button { border: 0; background: none; color: #aab1ff; cursor: pointer; font-weight: 600; padding: 0; }
.toast.error button { color: #fff; text-decoration: underline; }

@keyframes fade-in { from { opacity: 0; } }
@keyframes pop-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
@keyframes slide-in { from { transform: translateX(24px); opacity: 0; } }
@keyframes toast-in { from { opacity: 0; transform: translateY(8px); } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}

@media (max-width: 900px) {
  .sidebar { width: 64px; padding: 14px 8px; }
  .brand-name, .nav a > :not(.nav-icon), .sidebar-foot { display: none; }
  .nav a { justify-content: center; font-size: 0; }
  .search { width: 180px; }
  .view { padding: 16px; }
  .topbar { padding: 12px 16px; }
}
```

- [ ] **Step 3: 在浏览器里确认外壳能打开**

Run: `bash 启动Tracker.command < /dev/null`
Expected: 浏览器打开 `http://127.0.0.1:7317`，看到侧边栏和顶栏；控制台里 `/js/main.js` 404 是正常的（T11 才创建）。确认后 `bash 停止Tracker.command`

- [ ] **Step 4: Commit**

```bash
git add web/index.html web/css/base.css
git commit -m "feat: web shell layout and base styles"
```

---
### Task 11: 前端基础（请求、状态、UI 工具、路由）

**Files:**
- Create: `web/js/api.js`
- Create: `web/js/store.js`
- Create: `web/js/ui.js`
- Create: `web/js/main.js`

- [ ] **Step 1: 请求封装**

```js file=web/js/api.js
// 所有网络请求都走这里，用相对路径。以后部署上线：改 API_BASE、在 request 里加登录凭证即可。
const API_BASE = globalThis.JT_API_BASE || '';
let writeVersionListener = null;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** store 用它记下自己写入后的数据版本，避免把自己的保存当成外部改动 */
export function onWriteVersion(fn) {
  writeVersionListener = fn;
}

async function request(method, path, { body, raw = false, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    if (raw) {
      init.body = body;
    } else {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = 'application/json';
    }
  }
  let res;
  try {
    res = await fetch(API_BASE + path, init);
  } catch {
    throw new ApiError(0, '连不上 Tracker 服务，请先双击「启动Tracker.command」');
  }
  const version = res.headers.get('X-Data-Version');
  if (method !== 'GET' && version && writeVersionListener) writeVersionListener(Number(version));
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || `请求失败（${res.status}）`);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, body) => request('POST', p, { body }),
  patch: (p, body) => request('PATCH', p, { body }),
  put: (p, body) => request('PUT', p, { body }),
  del: (p) => request('DELETE', p),
  upload: (p, file) => request('POST', p, {
    body: file,
    raw: true,
    headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
  }),
};

export const fileUrl = (stored) => `${API_BASE}/files/${stored.split('/').map(encodeURIComponent).join('/')}`;
export const calendarUrl = () => `${API_BASE}/calendar.ics`;
```

- [ ] **Step 2: 前端状态**

```js file=web/js/store.js
// 前端状态：一次加载全部数据；改动走 api，成功后更新本地并通知订阅者。
// 页面可见时每 4 秒查一次数据版本，发现外部改动（比如 Claude 改了文件）就重新加载；
// 正在输入时先不刷新，等输入框失去焦点再说。
import { api, onWriteVersion } from './api.js';

const state = {
  loaded: false,
  online: true,
  version: 0,
  profile: null,
  settings: null,
  applications: [],
  answers: [],
  resumes: [],
};
const listeners = new Set();
let pendingReload = false;

onWriteVersion((v) => {
  state.version = v;
});

function emit(topic) {
  for (const fn of [...listeners]) {
    try {
      fn(topic);
    } catch (e) {
      console.error(e);
    }
  }
}

function setOnline(online) {
  if (state.online === online) return;
  state.online = online;
  emit('online');
}

function isEditing() {
  const el = document.activeElement;
  return !!el && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select, [contenteditable="true"]');
}

function upsert(coll, rec) {
  const list = state[coll];
  const i = list.findIndex((r) => r.id === rec.id);
  if (i >= 0) list[i] = rec;
  else list.push(rec);
}

function drop(coll, id) {
  state[coll] = state[coll].filter((r) => r.id !== id);
}

export const store = {
  state,

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async load() {
    const s = await api.get('/api/state');
    Object.assign(state, s, { loaded: true });
    setOnline(true);
    emit('load');
  },

  startSync() {
    const check = async () => {
      if (document.hidden) return;
      try {
        const { version } = await api.get('/api/version');
        setOnline(true);
        if (version === state.version) return;
        if (isEditing()) {
          pendingReload = true;
          return;
        }
        await store.load();
      } catch {
        setOnline(false);
      }
    };
    setInterval(check, 4000);
    window.addEventListener('focus', check);
    document.addEventListener('focusout', () => {
      if (!pendingReload) return;
      pendingReload = false;
      setTimeout(check, 300);
    });
  },

  // ---- 投递 ----
  app: (id) => state.applications.find((a) => a.id === id) || null,

  async createApplication(data) {
    const rec = await api.post('/api/applications', data);
    upsert('applications', rec);
    emit('applications');
    return rec;
  },

  /** 先改界面再请求；失败时回滚 */
  async updateApplication(id, patch) {
    const prev = store.app(id);
    if (prev) {
      upsert('applications', { ...prev, ...patch });
      emit('applications');
    }
    try {
      const rec = await api.patch(`/api/applications/${id}`, patch);
      upsert('applications', rec);
      emit('applications');
      return rec;
    } catch (e) {
      if (prev) {
        upsert('applications', prev);
        emit('applications');
      }
      throw e;
    }
  },

  async deleteApplication(id) {
    await api.del(`/api/applications/${id}`);
    drop('applications', id);
    emit('applications');
  },

  getJd: (id) => api.get(`/api/applications/${id}/jd`).then((r) => r.text),

  async saveJd(id, text) {
    const rec = await api.put(`/api/applications/${id}/jd`, { text });
    upsert('applications', rec);
    emit('applications');
    return rec;
  },

  // ---- 档案 / 设置 ----
  async patchProfile(patch) {
    state.profile = await api.patch('/api/profile', patch);
    emit('profile');
    return state.profile;
  },

  async patchSettings(patch) {
    state.settings = await api.patch('/api/settings', patch);
    emit('settings');
    return state.settings;
  },

  // ---- 素材库 / 简历 ----
  async create(coll, data) {
    const rec = await api.post(`/api/${coll}`, data);
    upsert(coll, rec);
    emit(coll);
    return rec;
  },

  async update(coll, id, patch) {
    const rec = await api.patch(`/api/${coll}/${id}`, patch);
    upsert(coll, rec);
    emit(coll);
    return rec;
  },

  async remove(coll, id) {
    await api.del(`/api/${coll}/${id}`);
    drop(coll, id);
    emit(coll);
  },

  async uploadResumeFile(id, file) {
    const rec = await api.upload(`/api/resumes/${id}/files`, file);
    upsert('resumes', rec);
    emit('resumes');
    return rec;
  },

  async deleteResumeFile(id, stored) {
    const rec = await api.del(`/api/resumes/${id}/files/${encodeURIComponent(stored)}`);
    upsert('resumes', rec);
    emit('resumes');
    return rec;
  },
};
```

- [ ] **Step 3: UI 工具**

```js file=web/js/ui.js
// 小型 UI 工具：h() 建 DOM、图标、提示、弹窗、抽屉、确认框、常用表单控件。
// 用户输入一律作为文本节点插入；innerHTML 只用于内置的 SVG 图标。
import { STAGE_LABEL, STATUS_LABEL, CLOSED_STATUSES } from '../shared/constants.js';

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'multiple', 'readOnly', 'indeterminate']);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  let selectValue;
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' && tag === 'select') selectValue = v;
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  appendChildren(el, children);
  if (selectValue !== undefined) el.value = selectValue; // select 要等 option 加进去才能设值
  return el;
}

function appendChildren(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) appendChildren(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

// ---------- 图标（线性风格，24×24） ----------
const ICON_PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  board: '<rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
};

export function svg(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

export function icon(name, cls = 'icon') {
  const span = document.createElement('span');
  span.className = cls;
  span.innerHTML = svg(name);
  return span;
}

/** 把页面里空的 [data-icon] 元素填成 SVG（index.html 里的静态图标） */
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) if (!el.firstChild) el.innerHTML = svg(el.dataset.icon);
}

// ---------- 提示 ----------
export function toast(message, { type = 'info', action, duration = 3200 } = {}) {
  const box = document.getElementById('toasts');
  const el = h('div', { class: ['toast', type === 'error' && 'error'], role: 'status' }, h('span', null, message));
  if (action) {
    el.append(h('button', { type: 'button', onClick: () => { el.remove(); action.onClick(); } }, action.label));
  }
  box.append(el);
  setTimeout(() => el.remove(), action ? duration + 4000 : duration);
  return el;
}

/** 执行异步操作；失败时弹出错误提示并返回 undefined */
export async function attempt(fn, okMessage) {
  try {
    const result = await fn();
    if (okMessage) toast(okMessage);
    return result;
  } catch (e) {
    console.error(e);
    toast(e.message || '操作失败', { type: 'error' });
    return undefined;
  }
}

// ---------- 弹层（弹窗、抽屉共用 Esc 关闭栈） ----------
const layers = [];
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && layers.length) {
    e.preventDefault();
    layers.at(-1)();
  }
});

function pushLayer(close) {
  layers.push(close);
  return () => {
    const i = layers.indexOf(close);
    if (i >= 0) layers.splice(i, 1);
  };
}

/** actions: [{ label, primary, danger, ghost, onClick(close) }] */
export function openModal({ title, body, actions = [], wide = false, onClose }) {
  let removeLayer = () => {};
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    removeLayer();
    onClose?.();
  };
  const foot = actions.length
    ? h('div', { class: 'modal-foot' }, actions.map((a) => h('button', {
      type: 'button',
      class: ['btn', a.primary && 'primary', a.danger && 'danger', a.ghost && 'ghost'],
      onClick: () => a.onClick?.(close),
    }, a.label)))
    : null;
  const modal = h('div', { class: ['modal', wide && 'wide'], role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal-head' },
      h('h2', null, title),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn ghost icon-only', 'aria-label': '关闭', onClick: close }, icon('x'))),
    h('div', { class: 'modal-body' }, body),
    foot);
  const overlay = h('div', { class: 'overlay', onMousedown: (e) => { if (e.target === overlay) close(); } }, modal);
  document.body.append(overlay);
  removeLayer = pushLayer(close);
  requestAnimationFrame(() => modal.querySelector('.modal-body input, .modal-body textarea, .modal-body select')?.focus());
  return { close, el: modal };
}

export function confirmDialog(message, { okLabel = '确定', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value, close) => {
      answered = true;
      close();
      resolve(value);
    };
    openModal({
      title: '确认',
      body: h('p', { style: { margin: 0 } }, message),
      actions: [
        { label: '取消', onClick: (close) => answer(false, close) },
        { label: okLabel, primary: !danger, danger, onClick: (close) => answer(true, close) },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

/** 右侧抽屉；返回 { close, head, body } 两个可替换内容的容器 */
export function openDrawer({ onClose } = {}) {
  let removeLayer = () => {};
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    panel.remove();
    removeLayer();
    onClose?.();
  };
  const head = h('div', { class: 'drawer-title' });
  const body = h('div', { class: 'drawer-body' });
  const overlay = h('div', { class: 'drawer-overlay', onMousedown: close });
  const panel = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'drawer-head' },
      head, // .drawer-title 自己是 flex: 1，不要再加 spacer，否则会和标题平分宽度
      h('button', { type: 'button', class: 'btn ghost icon-only', 'aria-label': '关闭', onClick: close }, icon('x'))),
    body);
  document.body.append(overlay, panel);
  removeLayer = pushLayer(close);
  return { close, head, body };
}

// ---------- 表单控件 ----------
/** 带标签的表单项；控件不是单个输入框时用 tag: 'div'，避免点标签误触第一个按钮 */
export function field(label, control, { hint, full = false, tag = 'label' } = {}) {
  return h(tag, { class: ['field', full && 'full'] },
    h('span', { class: 'label' }, label),
    control,
    hint ? h('span', { class: 'hint' }, hint) : null);
}

export function input({ value = '', type = 'text', placeholder = '', onChange, onInput, list, cls } = {}) {
  return h('input', {
    class: ['input', cls],
    type,
    value: value ?? '',
    placeholder,
    list,
    onChange: onChange && ((e) => onChange(e.target.value, e)),
    onInput: onInput && ((e) => onInput(e.target.value, e)),
  });
}

export function textarea({ value = '', placeholder = '', rows = 3, onChange, onInput, cls } = {}) {
  return h('textarea', {
    class: ['textarea', cls],
    rows,
    placeholder,
    value: value ?? '',
    onChange: onChange && ((e) => onChange(e.target.value, e)),
    onInput: onInput && ((e) => onInput(e.target.value, e)),
  });
}

const normOption = (o) => (typeof o === 'string' ? { value: o, label: o } : o);

export function select(options, value, onChange, { placeholder, cls } = {}) {
  return h('select', { class: ['select', cls], value: value ?? '', onChange: (e) => onChange?.(e.target.value, e) },
    placeholder != null ? h('option', { value: '' }, placeholder) : null,
    options.map(normOption).map((o) => h('option', { value: o.value }, o.label)));
}

export function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'segmented' });
  const render = (current) => {
    wrap.replaceChildren(...options.map(normOption).map((o) => h('button', {
      type: 'button',
      class: o.value === current ? 'on' : '',
      onClick: () => {
        render(o.value);
        onChange(o.value);
      },
    }, o.label)));
  };
  render(value);
  return wrap;
}

/** 星级（默认是 3 星意向度）；不传 onChange 时只读 */
export function stars(value, onChange, max = 3, label = '意向度') {
  const wrap = h('span', { class: 'stars', title: `${label} ${value}/${max}` });
  const render = (v) => {
    wrap.replaceChildren(...Array.from({ length: max }, (_, i) => (onChange
      ? h('button', {
        type: 'button',
        class: i < v ? 'on' : '',
        'aria-label': `${label} ${i + 1}`,
        onClick: (e) => {
          e.stopPropagation();
          render(i + 1);
          onChange(i + 1);
        },
      }, '★')
      : h('span', { class: i < v ? 'on' : '' }, '★'))));
  };
  render(value);
  return wrap;
}

// ---------- 其他 ----------
export function debounce(fn, ms = 600) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** 返回一个 repaint()：用户正在 root 里输入时先记下，等焦点离开 root 再调用 draw() */
export function repaintWhenIdle(root, draw) {
  let dirty = false;
  const flush = () => {
    if (dirty && !root.contains(document.activeElement)) {
      dirty = false;
      draw();
    }
  };
  root.addEventListener('focusout', () => setTimeout(flush, 0));
  // 通知可能是在 change 事件里同步发出的，那时焦点还没移到下一个输入框，所以等这一轮事件结束再判断
  return () => {
    dirty = true;
    setTimeout(flush, 0);
  };
}

export function ensureCss(href) {
  if (document.querySelector(`link[data-css="${href}"]`)) return;
  document.head.append(h('link', { rel: 'stylesheet', href, 'data-css': href }));
}

export const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

export async function copyText(text, message = '已复制') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: '0' } });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(message);
}

export function emptyState(text, action) {
  return h('div', { class: 'empty' }, h('div', null, text), action || null);
}

export function timeAgo(iso, now = new Date()) {
  const min = Math.round((now - new Date(iso)) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

export function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function stageChip(app) {
  if (CLOSED_STATUSES.includes(app.status)) {
    return h('span', { class: 'chip' }, h('span', { class: 'dot closed' }), `${STATUS_LABEL[app.status]} · ${STAGE_LABEL[app.stage]}`);
  }
  const extra = app.status === 'accepted' ? ' · 已接受' : app.status === 'declined' ? ' · 已拒绝' : '';
  return h('span', { class: 'chip' }, h('span', { class: `dot ${app.stage}` }), `${STAGE_LABEL[app.stage]}${extra}`);
}

/** 按需加载投递详情抽屉 / 新建投递弹窗（避免模块循环依赖） */
export function openApp(id, options) {
  return import('./components/appDrawer.js').then((m) => m.openAppDrawer(id, options)).catch((e) => {
    console.error(e);
    toast(`打不开投递详情：${e.message}`, { type: 'error' });
  });
}

export function openNewApp(preset) {
  return import('./components/newApp.js').then((m) => m.openNewApp(preset)).catch((e) => {
    console.error(e);
    toast(`打不开新建投递：${e.message}`, { type: 'error' });
  });
}
```

- [ ] **Step 4: 路由与全局行为**

```js file=web/js/main.js
// 入口：加载数据、路由（#/页面?参数）、侧边栏徽标和双时区时钟、全局搜索和快捷键。
import { store } from './store.js';
import { h, hydrateIcons, debounce, openNewApp } from './ui.js';
import { actionItems } from '../shared/domain.js';
import { formatZoned } from '../shared/time.js';

const ROUTES = {
  dashboard: '概览',
  applications: '投递',
  calendar: '日程',
  profile: '档案',
  resumes: '简历',
  answers: '素材库',
  settings: '设置',
};
const view = document.getElementById('view');
const search = document.getElementById('global-search');
let cleanup = null;
let routeToken = 0;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, query = ''] = raw.split('?');
  return { name: ROUTES[name] ? name : 'dashboard', params: new URLSearchParams(query) };
}

async function route() {
  const token = ++routeToken;
  const { name, params } = parseHash();
  for (const a of document.querySelectorAll('[data-route]')) a.classList.toggle('active', a.dataset.route === name);
  document.getElementById('page-title').textContent = ROUTES[name];
  document.title = `${ROUTES[name]} · 秋招 Tracker`;
  if (document.activeElement !== search) search.value = name === 'applications' ? params.get('q') || '' : '';
  let mod;
  try {
    mod = await import(`./views/${name}.js`);
  } catch (e) {
    mod = { render: (root) => { root.append(h('div', { class: 'empty' }, `这个页面还没做好（${e.message}）`)); } };
  }
  if (token !== routeToken) return; // 期间又切换了页面
  cleanup?.();
  view.replaceChildren();
  view.scrollTop = 0;
  cleanup = mod.render(view, { params }) || null;
}

function setBadge(name, n) {
  const el = document.querySelector(`[data-badge="${name}"]`);
  if (el) el.textContent = n ? String(n) : '';
}

function updateBadges() {
  const { applications, settings } = store.state;
  setBadge('dashboard', actionItems(applications, settings).length);
  setBadge('applications', applications.filter((a) => a.status === 'active' && a.stage !== 'wishlist').length);
}

function renderClock() {
  const s = store.state.settings;
  if (!s) return;
  const now = new Date().toISOString();
  document.getElementById('clock').replaceChildren(
    h('div', null, `${s.homeTzLabel} ${formatZoned(now, s.homeTz)}`),
    h('div', null, `${s.targetTzLabel} ${formatZoned(now, s.targetTz)}`),
  );
}

function bindGlobal() {
  document.getElementById('new-app-btn').addEventListener('click', () => openNewApp());
  search.addEventListener('input', debounce(() => {
    const q = search.value.trim();
    const target = `#/applications${q ? `?q=${encodeURIComponent(q)}` : ''}`;
    if (location.hash !== target) location.hash = target;
  }, 250));
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('.overlay, .drawer')) return;
    if (e.key === '/') {
      e.preventDefault();
      search.focus();
    } else if (e.key === 'n') {
      e.preventDefault();
      openNewApp();
    }
  });
}

async function boot() {
  hydrateIcons();
  bindGlobal();
  try {
    await store.load();
  } catch (e) {
    document.getElementById('offline-banner').hidden = false;
    view.replaceChildren(h('div', { class: 'empty' },
      h('div', null, e.message),
      h('button', { class: 'btn', type: 'button', onClick: () => location.reload() }, '重试')));
    return;
  }
  store.subscribe((topic) => {
    if (topic === 'online') document.getElementById('offline-banner').hidden = store.state.online;
    if (topic === 'load' || topic === 'applications' || topic === 'settings') updateBadges();
    if (topic === 'load' || topic === 'settings') renderClock();
  });
  updateBadges();
  renderClock();
  setInterval(renderClock, 30000);
  store.startSync();
  window.addEventListener('hashchange', route);
  route();
}

boot();
```

- [ ] **Step 5: 在内置浏览器里验证**

Run: `bash 启动Tracker.command < /dev/null`，然后用内置浏览器打开 `http://127.0.0.1:7317`
Expected:
- 侧边栏图标都显示出来，左下角是洛杉矶 / 北京两个时间
- 点各个导航项，标题跟着变，内容区显示「这个页面还没做好」（视图在后面的任务里做）
- 按 `/` 聚焦搜索框；控制台没有报错

- [ ] **Step 6: Commit**

```bash
git add web/js/api.js web/js/store.js web/js/ui.js web/js/main.js
git commit -m "feat: web api client, store with external-change sync, ui kit and router"
```

---
### Task 12: 投递页（看板 + 列表）

**Files:**
- Create: `web/js/views/applications.js`
- Create: `web/css/applications.css`

- [ ] **Step 1: 投递页视图**

```js file=web/js/views/applications.js
// 投递页：看板 / 列表两种视图，可按赛道、公司类型筛选，顶栏搜索；看板拖拽改阶段。
import { store } from '../store.js';
import {
  h, icon, ensureCss, segmented, select, stars, stageChip, emptyState,
  openApp, openNewApp, attempt, toast, openModal,
} from '../ui.js';
import { STAGES, STAGE_LABEL, STATUS_LABEL, TRACKS, COMPANY_TYPES } from '../../shared/constants.js';
import { nextEvent, isStale, daysSinceProgress, stageIndex, isClosed } from '../../shared/domain.js';
import { daysUntil, dualTime } from '../../shared/time.js';

const PREF_KEY = 'jt.applications.prefs';
const DEFAULT_PREFS = { mode: 'board', track: '', type: '', status: 'active', sort: 'next', dir: 'asc', closedOpen: false };
const BOARD_COLUMNS = [...STAGES, { key: 'closed', label: '已结束' }];

function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    // 隐私模式等情况下不能存，忽略
  }
}

const columnOf = (app) => (isClosed(app) ? 'closed' : app.stage);
const statusMatch = (app, status) => status === 'all' || (status === 'closed' ? isClosed(app) : !isClosed(app));
const trackClass = (track) => (track === '产品' ? 'accent' : track === '市场' ? 'market' : '');

function matches(app, q) {
  if (!q) return true;
  return [app.company, app.companyEn, app.position, app.cities, app.industry, app.notes, app.referrer]
    .some((v) => String(v || '').toLowerCase().includes(q));
}

export function render(root, { params }) {
  ensureCss('/css/applications.css');
  const prefs = loadPrefs();
  const q = (params.get('q') || '').trim().toLowerCase();
  const toolbar = h('div', { class: 'apps-toolbar' });
  const content = h('div', { class: 'apps-content' });
  root.append(toolbar, content);

  const draw = () => {
    const apps = store.state.applications.filter((a) => (!prefs.track || a.track === prefs.track)
      && (!prefs.type || a.companyType === prefs.type)
      && matches(a, q));
    const visible = prefs.mode === 'list' ? apps.filter((a) => statusMatch(a, prefs.status)) : apps;
    toolbar.replaceChildren(...renderToolbar(prefs, draw, q, visible.length).filter(Boolean));
    content.replaceChildren(
      store.state.applications.length ? '' : renderWelcome(),
      prefs.mode === 'board' ? renderBoard(apps, prefs, draw) : renderList(apps, prefs, draw),
    );
  };

  draw();
  const unsubscribe = store.subscribe((topic) => {
    if (['load', 'applications', 'settings'].includes(topic)) draw();
  });
  const openId = params.get('open');
  if (openId) openApp(openId);
  return unsubscribe;
}

function renderToolbar(prefs, redraw, q, count) {
  const set = (key) => (value) => {
    prefs[key] = value;
    savePrefs(prefs);
    redraw();
  };
  return [
    segmented([{ value: 'board', label: '看板' }, { value: 'list', label: '列表' }], prefs.mode, set('mode')),
    select(TRACKS, prefs.track, set('track'), { placeholder: '全部赛道' }),
    select(COMPANY_TYPES, prefs.type, set('type'), { placeholder: '全部类型' }),
    prefs.mode === 'list'
      ? select([{ value: 'active', label: '进行中' }, { value: 'closed', label: '已结束' }, { value: 'all', label: '全部' }], prefs.status, set('status'))
      : null,
    q ? h('span', { class: 'chip accent search-chip' }, `搜索：${q}`,
      h('button', { type: 'button', 'aria-label': '清除搜索', onClick: () => { location.hash = '#/applications'; } }, '×')) : null,
    h('span', { class: 'spacer' }),
    h('span', { class: 'apps-count' }, `共 ${count} 条`),
  ];
}

function renderWelcome() {
  return h('div', { class: 'card apps-welcome' },
    h('div', null,
      h('h3', null, '还没有投递记录'),
      h('p', { class: 'muted' }, '点「新建投递」或按 N，粘贴 JD 就能自动拆出公司、岗位、城市和截止日。')),
    h('button', { class: 'btn primary', type: 'button', onClick: () => openNewApp() }, icon('plus'), '新建投递'));
}

// ---------- 看板 ----------

function sortKey(app, now) {
  const ev = nextEvent(app, now);
  if (ev) return Date.parse(ev.at);
  if (app.stage === 'wishlist' && app.deadline) return Date.parse(`${app.deadline}T23:59:00+08:00`);
  return Infinity;
}

function cardCompare(now) {
  return (a, b) => sortKey(a, now) - sortKey(b, now)
    || (b.priority || 0) - (a.priority || 0)
    || String(b.updatedAt).localeCompare(String(a.updatedAt));
}

function renderBoard(apps, prefs, redraw) {
  const now = new Date();
  // 「已结束」默认收成一条窄边，让进行中的 6 列在笔记本屏幕上一屏放下
  const setClosedOpen = (open) => {
    prefs.closedOpen = open;
    savePrefs(prefs);
    redraw();
  };
  const board = h('div', { class: ['board', !prefs.closedOpen && 'closed-collapsed'] });
  for (const col of BOARD_COLUMNS) {
    const items = apps.filter((a) => columnOf(a) === col.key).sort(cardCompare(now));
    if (col.key === 'closed' && !prefs.closedOpen) {
      const strip = h('section', {
        class: 'col col-closed collapsed',
        dataset: { col: 'closed' },
        title: '展开「已结束」',
        role: 'button',
        tabindex: '0',
        onClick: () => setClosedOpen(true),
        onKeydown: (e) => { if (e.key === 'Enter') setClosedOpen(true); },
      }, h('span', { class: 'dot closed' }), h('span', { class: 'col-vlabel' }, col.label), h('span', { class: 'col-count' }, String(items.length)));
      bindDrop(strip, 'closed');
      board.append(strip);
      continue;
    }
    const column = h('section', { class: ['col', `col-${col.key}`], dataset: { col: col.key } },
      h('header', { class: 'col-head' },
        h('span', { class: `dot ${col.key}` }),
        h('span', null, col.label),
        h('span', { class: 'col-count' }, String(items.length)),
        col.key === 'closed'
          ? h('button', { type: 'button', class: 'btn sm ghost icon-only', title: '收起', onClick: () => setClosedOpen(false) }, icon('x'))
          : null),
      h('div', { class: 'col-list' },
        items.map((a) => renderCard(a, now)),
        items.length ? null : h('div', { class: 'col-empty' }, col.key === 'wishlist' ? '把想投的岗位先收在这里' : '拖到这里')));
    bindDrop(column, col.key);
    board.append(column);
  }
  return board;
}

function cardFoot(app, now) {
  const settings = store.state.settings;
  if (isClosed(app)) return h('span', { class: 'card-meta' }, `${STATUS_LABEL[app.status]}在：${STAGE_LABEL[app.stage]}`);
  const ev = nextEvent(app, now);
  if (ev) {
    return h('span', { class: 'card-meta upcoming' }, icon('clock'), `${ev.type} · ${dualTime(ev.at, ev.tz, settings).primary}`);
  }
  if (app.stage === 'wishlist' && app.deadline) {
    const d = daysUntil(app.deadline, settings.targetTz, now);
    const text = d < 0 ? `已截止 ${-d} 天` : d === 0 ? '今天截止' : `还剩 ${d} 天截止`;
    return h('span', { class: ['card-meta', d <= 3 && 'urgent'] }, icon('flag'), text);
  }
  if (isStale(app, settings, now)) return h('span', { class: 'card-meta stale' }, icon('alert'), `${daysSinceProgress(app, now)} 天没动静`);
  if (app.appliedAt) return h('span', { class: 'card-meta' }, `投递于 ${app.appliedAt.slice(5).replace('-', '/')}`);
  return null;
}

function renderCard(app, now) {
  const card = h('article', {
    class: ['card', 'app-card', isClosed(app) && 'closed'],
    draggable: 'true',
    tabindex: '0',
    dataset: { id: app.id },
    onClick: () => openApp(app.id),
    onKeydown: (e) => { if (e.key === 'Enter') openApp(app.id); },
    onDragstart: (e) => {
      e.dataTransfer.setData('text/plain', app.id);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    },
    onDragend: () => card.classList.remove('dragging'),
  },
  h('div', { class: 'card-top' },
    h('span', { class: 'card-company' }, app.company || app.companyEn || '未命名公司'),
    stars(app.priority || 2)),
  h('div', { class: 'card-position' }, app.position || '—'),
  h('div', { class: 'card-tags' },
    app.track ? h('span', { class: ['chip', trackClass(app.track)] }, app.track) : null,
    app.cities ? h('span', { class: 'chip' }, app.cities) : null,
    app.companyType ? h('span', { class: 'chip' }, app.companyType) : null),
  cardFoot(app, now));
  return card;
}

function bindDrop(column, key) {
  column.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    column.classList.add('drop');
  });
  column.addEventListener('dragleave', (e) => {
    if (!column.contains(e.relatedTarget)) column.classList.remove('drop');
  });
  column.addEventListener('drop', (e) => {
    e.preventDefault();
    column.classList.remove('drop');
    const app = store.app(e.dataTransfer.getData('text/plain'));
    if (!app || columnOf(app) === key) return;
    if (key === 'closed') {
      chooseCloseReason(app);
      return;
    }
    const patch = { stage: key };
    if (app.status !== 'active') patch.status = 'active';
    attempt(() => store.updateApplication(app.id, patch)).then((rec) => {
      if (rec) toast(`${app.company || app.position} → ${STAGE_LABEL[key]}`);
    });
  });
}

function chooseCloseReason(app) {
  openModal({
    title: `结束「${app.company || app.position}」`,
    body: h('p', { class: 'muted', style: { margin: 0 } }, `会记下它停在「${STAGE_LABEL[app.stage]}」这一轮。`),
    actions: [
      { label: '取消', ghost: true, onClick: (close) => close() },
      { label: '我放弃了', onClick: (close) => { close(); attempt(() => store.updateApplication(app.id, { status: 'withdrawn' })); } },
      { label: '挂了', danger: true, onClick: (close) => { close(); attempt(() => store.updateApplication(app.id, { status: 'rejected' })); } },
    ],
  });
}

// ---------- 列表 ----------

const LIST_COLUMNS = [
  { key: 'company', label: '公司', get: (a) => a.company || a.companyEn || '' },
  { key: 'position', label: '岗位', get: (a) => a.position || '' },
  { key: 'track', label: '赛道', get: (a) => a.track || '' },
  { key: 'stage', label: '进度', get: (a) => stageIndex(a.stage) + (isClosed(a) ? 10 : 0) },
  { key: 'appliedAt', label: '投递日期', get: (a) => a.appliedAt || '' },
  { key: 'deadline', label: '网申截止', get: (a) => a.deadline || '' },
  { key: 'next', label: '下一个日程', get: (a, now) => nextEvent(a, now)?.at || '' },
  { key: 'progress', label: '最近进展', get: (a, now) => daysSinceProgress(a, now) },
];

function compare(x, y, dir) {
  if (x === y) return 0;
  if (x === '') return 1; // 空值总是排在最后
  if (y === '') return -1;
  const c = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y, 'zh-Hans-CN') : (x > y ? 1 : -1); // 中文按拼音
  return c * dir;
}

function renderList(apps, prefs, redraw) {
  const now = new Date();
  const settings = store.state.settings;
  const rows = apps.filter((a) => statusMatch(a, prefs.status));
  if (!rows.length) return emptyState(apps.length ? '没有符合条件的投递' : '还没有投递记录');
  const col = LIST_COLUMNS.find((c) => c.key === prefs.sort) || LIST_COLUMNS[6];
  const dir = prefs.dir === 'desc' ? -1 : 1;
  const sortValue = (a) => (col.key === 'next' ? (nextEvent(a, now) ? Date.parse(nextEvent(a, now).at) : '') : col.get(a, now));
  rows.sort((a, b) => compare(sortValue(a), sortValue(b), dir));

  const head = h('tr', null, LIST_COLUMNS.map((c) => h('th', {
    class: ['sortable', c.key === col.key && 'sorted'],
    onClick: () => {
      if (prefs.sort === c.key) prefs.dir = prefs.dir === 'desc' ? 'asc' : 'desc';
      else Object.assign(prefs, { sort: c.key, dir: 'asc' });
      savePrefs(prefs);
      redraw();
    },
  }, c.label, c.key === col.key ? (dir === 1 ? ' ↑' : ' ↓') : '')));

  const body = rows.map((a) => {
    const ev = nextEvent(a, now);
    const days = daysSinceProgress(a, now);
    const deadlineLeft = a.deadline && a.stage === 'wishlist' ? daysUntil(a.deadline, settings.targetTz, now) : null;
    return h('tr', { onClick: () => openApp(a.id) },
      h('td', { class: 'cell-company' }, h('b', null, a.company || a.companyEn || '未命名公司'), a.company && a.companyEn ? h('span', { class: 'cell-sub' }, a.companyEn) : null),
      h('td', null, a.position || '—'),
      h('td', null, a.track ? h('span', { class: ['chip', trackClass(a.track)] }, a.track) : ''),
      h('td', null, stageChip(a)),
      h('td', null, a.appliedAt || '—'),
      h('td', { class: deadlineLeft != null && deadlineLeft <= 3 ? 'urgent-text' : '' },
        a.deadline || '—', deadlineLeft != null && deadlineLeft >= 0 ? h('span', { class: 'cell-sub' }, ` 剩 ${deadlineLeft} 天`) : null),
      h('td', null, ev ? `${ev.type} · ${dualTime(ev.at, ev.tz, settings).primary}` : '—'),
      h('td', { class: isStale(a, settings, now) ? 'stale-text' : '' }, days === 0 ? '今天' : `${days} 天前`));
  });

  return h('div', { class: 'card table-wrap' },
    h('table', { class: 'apps-table' }, h('thead', null, head), h('tbody', null, body)));
}
```

- [ ] **Step 2: 投递页样式**

```css file=web/css/applications.css
.apps-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.apps-toolbar .select { width: auto; min-width: 112px; }
.apps-count { color: var(--text-3); font-size: 13px; }
.search-chip { height: 26px; padding: 0 4px 0 10px; font-size: 12.5px; }
.search-chip button { border: 0; background: none; color: inherit; cursor: pointer; font-size: 15px; padding: 0 4px; }

.apps-welcome { display: flex; align-items: center; gap: 16px; justify-content: space-between; padding: 18px 20px; margin-bottom: 16px; }
.apps-welcome p { margin: 4px 0 0; }

/* 看板：6 列进行中 + 「已结束」；收起时「已结束」是一条 44px 的窄边 */
.board {
  display: grid;
  grid-template-columns: repeat(7, minmax(176px, 1fr));
  gap: 12px;
  align-items: start;
  overflow-x: auto;
  padding-bottom: 12px;
}
.board.closed-collapsed { grid-template-columns: repeat(6, minmax(176px, 1fr)) 44px; }
.col.collapsed { align-items: center; gap: 10px; min-height: 180px; padding: 12px 0; cursor: pointer; }
.col.collapsed:hover, .col.collapsed:focus-visible { background: var(--surface-3); outline: none; }
.col.collapsed .col-count { margin: 0; }
.col-vlabel { writing-mode: vertical-rl; letter-spacing: 0.2em; color: var(--text-2); font-size: 13px; font-weight: 600; }
.col-head .btn { margin: -4px -6px -4px 0; }
.col {
  display: flex; flex-direction: column;
  max-height: calc(100vh - 190px);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  transition: border-color 0.12s, background 0.12s;
}
.col.drop { border-color: var(--accent); background: var(--accent-soft); }
.col-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; font-size: 13px; font-weight: 600; }
.col-count { margin-left: auto; color: var(--text-3); font-weight: 500; font-variant-numeric: tabular-nums; }
.col-list { display: flex; flex-direction: column; gap: 8px; padding: 0 8px 10px; overflow-y: auto; min-height: 64px; }
.col-empty {
  padding: 14px 8px;
  border: 1px dashed var(--border-strong); border-radius: var(--radius);
  color: var(--text-3); font-size: 12px; text-align: center;
}

.app-card {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 12px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: box-shadow 0.12s, border-color 0.12s, opacity 0.12s;
}
.app-card:hover { box-shadow: var(--shadow); border-color: var(--border-strong); }
.app-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.app-card.dragging { opacity: 0.4; }
.app-card.closed { opacity: 0.75; }
.card-top { display: flex; align-items: center; gap: 6px; }
.card-company { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-position { color: var(--text-2); font-size: 13px; line-height: 1.4; }
.card-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.card-tags:empty { display: none; }
.card-meta { display: flex; align-items: center; gap: 5px; color: var(--text-3); font-size: 12px; }
.card-meta .icon { width: 13px; height: 13px; }
.card-meta.upcoming { color: var(--st-interview); }
.card-meta.urgent { color: var(--danger); }
.card-meta.stale { color: var(--warn); }

.chip.market { background: #e3f3ef; color: #1f7a6c; }
@media (prefers-color-scheme: dark) {
  .chip.market { background: #17302b; color: #5cc5b0; }
}

/* 列表 */
.table-wrap { overflow: auto; }
.apps-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.apps-table th {
  position: sticky; top: 0;
  padding: 10px 12px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  color: var(--text-3); font-weight: 500; text-align: left; white-space: nowrap;
}
.apps-table th.sortable { cursor: pointer; user-select: none; }
.apps-table th.sorted { color: var(--text); }
.apps-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.apps-table tbody tr { cursor: pointer; }
.apps-table tbody tr:hover { background: var(--surface-2); }
.apps-table tbody tr:last-child td { border-bottom: 0; }
.cell-company b { display: block; font-weight: 600; }
.cell-sub { color: var(--text-3); font-size: 12px; }
.stale-text { color: var(--warn); }
.urgent-text { color: var(--danger); }
```

- [ ] **Step 3: 用临时数据在内置浏览器里验证**

Run（服务在跑的前提下，用 API 造 3 条测试数据）：
```bash
for body in '{"company":"测试甲","position":"市场管培生","track":"市场","stage":"wishlist","deadline":"2026-09-23"}' \
            '{"company":"测试乙","position":"产品经理","track":"产品","stage":"applied"}' \
            '{"company":"测试丙","position":"品牌 MT","track":"市场","stage":"interview"}'; do
  curl -s -X POST http://127.0.0.1:7317/api/applications -H 'Content-Type: application/json' -d "$body" > /dev/null
done
```
Expected（打开 `#/applications`）：
- 看板 7 列，3 张卡片在对应列；「测试甲」显示「还剩 N 天截止」
- 把「测试乙」拖到「测评/笔试」，卡片移动并提示；刷新后仍在新列
- 拖到「已结束」弹出「我放弃了 / 挂了」
- 切到列表，点表头能排序；搜索框输入「产品」只剩「测试乙」
- 点卡片时提示「打不开投递详情」（T13 才做抽屉），控制台没有其他报错

验证完删掉测试数据：
```bash
curl -s http://127.0.0.1:7317/api/applications | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const a of JSON.parse(s))if(a.company.startsWith("测试"))console.log(a.id)})' | while read id; do curl -s -X DELETE "http://127.0.0.1:7317/api/applications/$id" > /dev/null; done
```

- [ ] **Step 4: Commit**

```bash
git add web/js/views/applications.js web/css/applications.css
git commit -m "feat: applications board and list views with drag to change stage"
```

---
### Task 13: 投递详情抽屉 + 日程表单

**Files:**
- Create: `web/js/components/eventForm.js`
- Create: `web/js/components/appDrawer.js`
- Create: `web/css/components.css`（也包含 T14 新建投递弹窗的样式）

- [ ] **Step 1: 日程表单**

```js file=web/js/components/eventForm.js
// 日程表单：类型、标题、时间 + 时区（默认北京时间）、时长、地点 / 会议链接。
// 下方实时显示换算到另一个时区的时间。
import { store } from '../store.js';
import { h, field, input, select, segmented, openModal, toast } from '../ui.js';
import { EVENT_TYPES } from '../../shared/constants.js';
import { newId } from '../../shared/domain.js';
import { zonedToISO, isoToLocalInput, dualTime } from '../../shared/time.js';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180].map((m) => ({ value: String(m), label: m < 60 ? `${m} 分钟` : `${m / 60} 小时` }));

/** onSave(event) 收到完整的日程对象（新建时带新 id） */
export function openEventForm({ app, event, onSave }) {
  const s = store.state.settings;
  const draft = event
    ? { ...event }
    : { id: newId('evt'), type: '面试', title: '', at: '', tz: s.eventInputTz || s.targetTz, durationMin: 60, location: '', done: false, review: null };
  let local = draft.at ? isoToLocalInput(draft.at, draft.tz) : '';

  const preview = h('div', { class: 'tz-preview muted small' });
  const updatePreview = () => {
    if (!local) {
      preview.textContent = '选好时间后，这里会显示换算到另一个时区的时间';
      return;
    }
    preview.textContent = `= ${dualTime(zonedToISO(local, draft.tz), draft.tz, s).secondary}`;
  };

  const when = input({ type: 'datetime-local', value: local, onInput: (v) => { local = v; updatePreview(); } });
  const tzOptions = [{ value: s.targetTz, label: s.targetTzLabel }, { value: s.homeTz, label: s.homeTzLabel }];
  const body = h('div', { class: 'form-grid' },
    field('类型', select(EVENT_TYPES, draft.type, (v) => { draft.type = v; })),
    field('标题（可选）', input({ value: draft.title, placeholder: '如：二面（业务）', onInput: (v) => { draft.title = v; } })),
    field('时间', when),
    // 换时区时墙上时间不变：用户的意思是「这个时间是北京时间」
    field('这个时间是', segmented(tzOptions, draft.tz, (v) => { draft.tz = v; updatePreview(); }), { tag: 'div' }),
    field('时长', select(DURATIONS, String(draft.durationMin || 60), (v) => { draft.durationMin = Number(v); })),
    field('地点 / 会议链接', input({ value: draft.location, placeholder: '会议链接或面试地址', onInput: (v) => { draft.location = v.trim(); } })),
    h('div', { class: 'field full' }, preview));
  updatePreview();

  return openModal({
    title: event ? '编辑日程' : `添加日程 · ${app.company || app.position || ''}`,
    body,
    actions: [
      { label: '取消', ghost: true, onClick: (close) => close() },
      {
        label: '保存',
        primary: true,
        onClick: (close) => {
          if (!local) {
            toast('请先选择时间', { type: 'error' });
            when.focus();
            return;
          }
          close();
          onSave({ ...draft, at: zonedToISO(local, draft.tz) });
        },
      },
    ],
  });
}
```

- [ ] **Step 2: 投递详情抽屉**

```js file=web/js/components/appDrawer.js
// 投递详情抽屉：基本信息 / 日程与复盘 / JD / 时间线。输入框失焦即保存。
import { store } from '../store.js';
import {
  h, icon, openDrawer, field, input, textarea, select, stars, attempt, toast,
  confirmDialog, copyText, safeUrl, timeAgo, ensureCss, repaintWhenIdle,
} from '../ui.js';
import {
  STAGES, STAGE_LABEL, STATUS_LABEL, COMPANY_TYPES, TRACKS, BATCHES, CHANNELS,
  INDUSTRY_SUGGESTIONS, INTERVIEW_EVENT_TYPES, EVENT_STAGE,
} from '../../shared/constants.js';
import { newId, isClosed, stageIndex, textStats } from '../../shared/domain.js';
import { dualTime } from '../../shared/time.js';
import { openEventForm } from './eventForm.js';

const TABS = [['info', '基本信息'], ['events', '日程与复盘'], ['jd', 'JD'], ['timeline', '时间线']];

const TIMELINE_TEXT = {
  created: (e) => `创建（${STAGE_LABEL[e.to] || e.to || '—'}）`,
  stage: (e) => `${STAGE_LABEL[e.from] || e.from} → ${STAGE_LABEL[e.to] || e.to}`,
  status: (e) => `${STATUS_LABEL[e.from] || e.from} → ${STATUS_LABEL[e.to] || e.to}`,
  followup: (e) => e.text || '跟进了一次',
  note: (e) => e.text,
};

let current = null; // 同一时间只开一个抽屉

export function openAppDrawer(id, { tab = 'info' } = {}) {
  ensureCss('/css/components.css');
  if (!store.app(id)) {
    toast('这条投递已经不存在了', { type: 'error' });
    return null;
  }
  current?.close();

  let currentTab = tab;
  let unsubscribe = () => {};
  const drawer = openDrawer({
    onClose: () => {
      unsubscribe();
      if (current === drawer) current = null;
    },
  });
  current = drawer;
  const tabs = h('div', { class: 'tabs' });
  const pane = h('div', { class: 'tab-pane' });
  drawer.body.append(tabs, pane);

  const get = () => store.app(id);
  const save = (patch) => attempt(() => store.updateApplication(id, patch));

  // ---------- 头部 ----------
  function followup() {
    const app = get();
    const entry = { id: newId('tl'), at: new Date().toISOString(), type: 'followup', from: '', to: '', text: '跟进了一次' };
    save({ timeline: [...(app.timeline || []), entry] }).then((rec) => {
      if (rec) toast('记下了，「没动静」重新计时');
    });
  }

  async function remove() {
    const app = get();
    const name = [app.company, app.position].filter(Boolean).join(' · ');
    const ok = await confirmDialog(`删除「${name}」？它的日程、复盘和 JD 快照会一起删除，不能撤销。`, { okLabel: '删除', danger: true });
    if (ok) attempt(() => store.deleteApplication(id), '已删除');
  }

  function statusActions(app) {
    const btn = (label, onClick, cls = '') => h('button', { class: `btn sm ${cls}`, type: 'button', onClick }, label);
    if (app.status === 'rejected' || app.status === 'withdrawn') {
      return [h('span', { class: 'chip' }, STATUS_LABEL[app.status]), btn('恢复为进行中', () => save({ status: 'active' }))];
    }
    if (app.status === 'accepted' || app.status === 'declined') {
      return [h('span', { class: ['chip', app.status === 'accepted' && 'ok'] }, STATUS_LABEL[app.status]), btn('撤销', () => save({ status: 'active' }))];
    }
    if (app.stage === 'offer') {
      return [btn('接受 Offer', () => save({ status: 'accepted' })), btn('拒绝 Offer', () => save({ status: 'declined' }))];
    }
    return [btn('我跟进了', followup), btn('放弃', () => save({ status: 'withdrawn' })), btn('挂了', () => save({ status: 'rejected' }), 'danger')];
  }

  function renderHead() {
    const app = get();
    if (!app) return;
    drawer.head.replaceChildren(
      h('div', { class: 'dh-title' },
        h('h2', null, app.company || app.companyEn || '未命名公司'),
        stars(app.priority || 2, (v) => save({ priority: v }))),
      h('div', { class: 'dh-sub' }, app.position || '—'),
      h('div', { class: 'dh-actions' },
        h('select', { class: 'select stage-select', value: app.stage, 'aria-label': '阶段', onChange: (e) => save({ stage: e.target.value }) },
          STAGES.map((st) => h('option', { value: st.key }, st.label))),
        statusActions(app),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm ghost danger icon-only', type: 'button', title: '删除这条投递', onClick: remove }, icon('trash'))),
    );
  }

  function renderTabs() {
    const app = get();
    if (!app) return;
    tabs.replaceChildren(...TABS.map(([key, label]) => h('button', {
      type: 'button',
      class: key === currentTab ? 'on' : '',
      onClick: () => {
        currentTab = key;
        renderTabs();
        renderPane();
      },
    }, label, key === 'events' && app.events?.length ? h('span', { class: 'tab-count' }, String(app.events.length)) : null)));
  }

  function renderPane() {
    const app = get();
    if (!app) return;
    const build = { info: infoPane, events: eventsPane, jd: jdPane, timeline: timelinePane }[currentTab];
    pane.replaceChildren(build(app));
  }

  // ---------- 基本信息 ----------
  function infoPane(app) {
    const text = (key, placeholder = '') => input({ value: app[key] || '', placeholder, onChange: (v) => save({ [key]: v.trim() }) });
    const pick = (key, options) => select(options, app[key] || '', (v) => save({ [key]: v }), { placeholder: '未选择' });
    const date = (key) => input({ type: 'date', value: app[key] || '', onChange: (v) => save({ [key]: v }) });
    const url = (key) => h('div', { class: 'url-field' },
      input({ type: 'url', value: app[key] || '', placeholder: 'https://…', onChange: (v) => save({ [key]: v.trim() }) }),
      h('button', {
        type: 'button',
        class: 'btn icon-only',
        title: '打开链接',
        onClick: () => {
          const u = safeUrl(get()[key]);
          if (u) window.open(u, '_blank', 'noopener');
          else toast('链接要以 http:// 或 https:// 开头');
        },
      }, icon('external')));
    const resumes = store.state.resumes.map((r) => ({ value: r.id, label: r.name || '未命名版本' }));

    return h('div', { class: 'form-grid' },
      field('公司', text('company', '如：雀巢')),
      field('公司英文名', text('companyEn', '如：Nestlé')),
      field('岗位', text('position', '如：Marketing MT')),
      field('赛道', pick('track', TRACKS)),
      field('公司类型', pick('companyType', COMPANY_TYPES)),
      field('行业', h('div', null,
        input({ value: app.industry || '', list: 'jt-industries', onChange: (v) => save({ industry: v.trim() }) }),
        h('datalist', { id: 'jt-industries' }, INDUSTRY_SUGGESTIONS.map((s) => h('option', { value: s }))))),
      field('城市', text('cities', '多个用 / 分隔')),
      field('批次', pick('batch', BATCHES)),
      field('渠道', pick('channel', CHANNELS)),
      field('投的简历', select(resumes, app.resumeId || '', (v) => save({ resumeId: v }), { placeholder: resumes.length ? '未选择' : '先到「简历」页添加版本' })),
      field('内推人', text('referrer')),
      field('内推码', text('referralCode')),
      field('网申截止（北京时间）', date('deadline')),
      field('投递日期', date('appliedAt')),
      field('JD 链接', url('jdUrl'), { full: true, tag: 'div' }),
      field('网申入口', url('applyUrl'), { full: true, tag: 'div' }),
      field('官网注册账号', text('account', '注册用的邮箱或手机号（不要填密码）'), { full: true }),
      field('下一步', text('nextStep', '如：周五前完成 SHL 测评'), { full: true }),
      field('备注', textarea({ value: app.notes || '', rows: 4, onChange: (v) => save({ notes: v }) }), { full: true }));
  }

  // ---------- 日程与复盘 ----------
  function updateEvent(eventId, patch) {
    const app = get();
    return save({ events: app.events.map((e) => (e.id === eventId ? { ...e, ...patch } : e)) });
  }

  function onEventSaved(event) {
    const app = get();
    const exists = app.events.some((e) => e.id === event.id);
    const events = exists ? app.events.map((e) => (e.id === event.id ? event : e)) : [...app.events, event];
    save({ events }).then((rec) => {
      if (!rec) return;
      const target = EVENT_STAGE[event.type];
      if (!exists && target && !isClosed(rec) && stageIndex(target) > stageIndex(rec.stage)) {
        toast(`要把进度推进到「${STAGE_LABEL[target]}」吗？`, { action: { label: '推进', onClick: () => save({ stage: target }) } });
      }
    });
  }

  function reviewBox(ev) {
    const r = ev.review || {};
    const saveReview = (patch) => {
      const latest = get().events.find((e) => e.id === ev.id);
      updateEvent(ev.id, { review: { questions: '', reflection: '', rating: 0, ...(latest?.review || {}), ...patch } });
    };
    return h('div', { class: 'review' },
      h('div', { class: 'review-head' },
        icon('message'), '复盘',
        h('span', { class: 'spacer' }),
        h('span', { class: 'muted' }, '自评'),
        stars(r.rating || 0, (v) => saveReview({ rating: v }), 5, '自评')),
      field('被问到的问题', textarea({ value: r.questions || '', rows: 3, placeholder: '一行一个，面同类岗位前拿出来复习', onChange: (v) => saveReview({ questions: v }) })),
      field('哪里答得好、哪里要改', textarea({ value: r.reflection || '', rows: 3, onChange: (v) => saveReview({ reflection: v }) })));
  }

  function eventItem(ev) {
    const t = dualTime(ev.at, ev.tz, store.state.settings);
    const past = Date.parse(ev.at) < Date.now();
    const link = safeUrl(ev.location);
    const del = async () => {
      if (!(await confirmDialog(`删除日程「${ev.type}${ev.title ? ` · ${ev.title}` : ''}」？`, { okLabel: '删除', danger: true }))) return;
      const app = get();
      save({ events: app.events.filter((e) => e.id !== ev.id) });
    };
    return h('div', { class: ['event', ev.done && 'done', past && !ev.done && 'overdue'] },
      h('div', { class: 'event-main' },
        h('input', { type: 'checkbox', checked: !!ev.done, title: '标记为已完成', onChange: (e) => updateEvent(ev.id, { done: e.target.checked }) }),
        h('div', { class: 'event-text' },
          h('div', { class: 'event-title' }, h('span', { class: 'chip accent' }, ev.type), ev.title || ''),
          h('div', { class: 'event-time' }, t.primary, h('span', { class: 'muted' }, ` · ${t.secondary}`)),
          ev.location
            ? h('div', { class: 'event-loc' }, link ? h('a', { href: link, target: '_blank', rel: 'noopener' }, icon('link'), '打开会议链接') : ev.location)
            : null),
        h('div', { class: 'event-actions' },
          h('button', { class: 'btn sm ghost icon-only', type: 'button', title: '编辑', onClick: () => openEventForm({ app: get(), event: ev, onSave: onEventSaved }) }, icon('edit')),
          h('button', { class: 'btn sm ghost icon-only', type: 'button', title: '删除', onClick: del }, icon('trash')))),
      INTERVIEW_EVENT_TYPES.includes(ev.type) && (past || ev.review) ? reviewBox(ev) : null);
  }

  function eventsPane(app) {
    const s = store.state.settings;
    const add = h('button', { class: 'btn primary sm', type: 'button', onClick: () => openEventForm({ app: get(), onSave: onEventSaved }) }, icon('plus'), '添加日程');
    const events = [...(app.events || [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    if (!events.length) {
      return h('div', { class: 'empty' }, h('div', null, `测评、笔试、面试都记在这里，时间会同时显示${s.targetTzLabel}和${s.homeTzLabel}。`), add);
    }
    return h('div', { class: 'events' },
      h('div', { class: 'row' }, h('span', { class: 'muted small' }, `共 ${events.length} 个日程`), h('span', { class: 'spacer' }), add),
      events.map((ev) => eventItem(ev)));
  }

  // ---------- JD ----------
  function jdPane(app) {
    const box = textarea({ rows: 18, cls: 'jd-text', placeholder: '加载中…' });
    box.disabled = true;
    const stats = h('span', { class: 'muted small' });
    const updateStats = () => { stats.textContent = `${textStats(box.value).chars} 字`; };
    box.addEventListener('input', updateStats);
    const link = safeUrl(app.jdUrl);
    store.getJd(id)
      .then((text) => { box.value = text; })
      .catch((e) => toast(e.message, { type: 'error' }))
      .finally(() => {
        box.disabled = false;
        box.placeholder = '把 JD 全文粘贴到这里保存。JD 截止后常被下架，面试前还能在这里复习。';
        updateStats();
      });
    return h('div', { class: 'jd-pane' },
      h('div', { class: 'row' },
        stats,
        h('span', { class: 'spacer' }),
        link ? h('a', { class: 'btn', href: link, target: '_blank', rel: 'noopener' }, icon('external'), '原链接') : null,
        h('button', { class: 'btn', type: 'button', onClick: () => copyText(box.value) }, icon('copy'), '复制'),
        h('button', { class: 'btn primary', type: 'button', onClick: () => attempt(() => store.saveJd(id, box.value), box.value.trim() ? 'JD 已保存' : 'JD 快照已删除') }, '保存')),
      box,
      h('div', { class: 'muted small' }, app.jdFile ? `保存在 data/${app.jdFile}` : '还没有保存 JD 快照'));
  }

  // ---------- 时间线 ----------
  function timelinePane(app) {
    const note = input({ placeholder: '记一笔，比如：HR 说两周内出结果' });
    const addNote = async () => {
      const text = note.value.trim();
      if (!text) return;
      const entry = { id: newId('tl'), at: new Date().toISOString(), type: 'note', from: '', to: '', text };
      const rec = await save({ timeline: [...(get().timeline || []), entry] });
      if (rec) {
        renderPane();
        pane.querySelector('input')?.focus();
      }
    };
    note.addEventListener('keydown', (e) => { if (e.key === 'Enter') addNote(); });
    const items = [...(app.timeline || [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return h('div', { class: 'timeline-pane' },
      h('div', { class: 'row' }, note, h('button', { class: 'btn', type: 'button', onClick: addNote }, '添加')),
      h('ol', { class: 'timeline' }, items.map((e) => h('li', { class: `tl-${e.type}` },
        h('span', { class: 'tl-dot' }),
        h('div', { class: 'tl-body' },
          h('div', null, (TIMELINE_TEXT[e.type] || ((x) => x.text || x.type))(e)),
          h('div', { class: 'muted small', title: new Date(e.at).toLocaleString('zh-CN') }, timeAgo(e.at)))))));
  }

  // ---------- 启动与同步 ----------
  renderHead();
  renderTabs();
  renderPane();

  const repaintPane = repaintWhenIdle(pane, renderPane);

  unsubscribe = store.subscribe((topic) => {
    if (!['applications', 'load', 'settings', 'resumes'].includes(topic)) return;
    if (!get()) {
      drawer.close();
      return;
    }
    renderHead();
    renderTabs();
    // 基本信息页的输入框自己就是最新值，只有外部改动（load）时才重画；JD 页永远不自动重画
    const shouldRepaint = currentTab === 'events' || currentTab === 'timeline' || (currentTab === 'info' && topic !== 'applications');
    if (shouldRepaint) repaintPane();
  });

  return drawer;
}
```

- [ ] **Step 3: 组件样式**

```css file=web/css/components.css
/* ---------- 投递详情抽屉 ---------- */
.drawer-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.dh-title { display: flex; align-items: center; gap: 10px; }
.dh-title h2 { font-size: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dh-sub { color: var(--text-2); }
.dh-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.stage-select { width: auto; height: 26px; padding: 0 8px; font-size: 12px; }
.tab-count {
  margin-left: 5px; padding: 0 6px;
  border-radius: 8px;
  background: var(--surface-3); color: var(--text-2);
  font-size: 11px;
}
.url-field { display: flex; gap: 6px; }

/* ---------- 日程与复盘 ---------- */
.events { display: flex; flex-direction: column; gap: 10px; }
.event {
  padding: 10px 12px;
  border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--surface);
}
.event.overdue { border-left: 3px solid var(--warn); }
.event.done .event-title, .event.done .event-time { color: var(--text-3); }
.event-main { display: flex; align-items: flex-start; gap: 10px; }
.event-main input[type="checkbox"] { width: 16px; height: 16px; margin-top: 3px; accent-color: var(--accent); cursor: pointer; }
.event-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.event-title { display: flex; align-items: center; gap: 6px; font-weight: 550; }
.event-time { font-size: 13px; }
.event-loc { font-size: 13px; overflow-wrap: anywhere; }
.event-loc a { display: inline-flex; align-items: center; gap: 4px; }
.event-loc .icon { width: 13px; height: 13px; }
.event-actions { display: flex; gap: 2px; }
.review { display: grid; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border); }
.review-head { display: flex; align-items: center; gap: 6px; color: var(--text-2); font-size: 12px; font-weight: 600; }
.review-head .icon { width: 14px; height: 14px; }
.tz-preview { padding: 8px 10px; border-radius: var(--radius-sm); background: var(--surface-2); }

/* ---------- JD ---------- */
.jd-pane { display: flex; flex-direction: column; gap: 10px; }
.jd-text { min-height: 380px; font-size: 13px; }

/* ---------- 时间线 ---------- */
.timeline-pane { display: flex; flex-direction: column; gap: 16px; }
.timeline { list-style: none; margin: 0; padding: 0 0 0 4px; }
.timeline li { position: relative; display: flex; gap: 12px; padding-bottom: 16px; }
.timeline li::before { content: ""; position: absolute; left: 4px; top: 16px; bottom: 0; width: 1px; background: var(--border); }
.timeline li:last-child::before { display: none; }
.tl-dot { flex: none; width: 9px; height: 9px; margin-top: 6px; border-radius: 50%; background: var(--border-strong); }
.tl-stage .tl-dot { background: var(--accent); }
.tl-status .tl-dot { background: var(--danger); }
.tl-followup .tl-dot { background: var(--ok); }
.tl-note .tl-dot { background: var(--warn); }
.tl-body { display: flex; flex-direction: column; gap: 1px; }

/* ---------- 新建投递（T14） ---------- */
.newapp { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 20px; }
.newapp-jd { display: flex; flex-direction: column; gap: 10px; }
.newapp-jd .textarea { min-height: 330px; font-size: 13px; }
.parse-hint { min-height: 18px; color: var(--text-3); font-size: 12px; }
.parse-hint.ok { color: var(--ok); }
.filled { animation: filled-flash 1.4s var(--ease); }
@keyframes filled-flash { from { border-color: var(--ok); box-shadow: 0 0 0 3px var(--ok-soft); } }
@media (max-width: 760px) {
  .newapp { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: 在内置浏览器里验证**

先按 T12 Step 3 造一条测试数据，打开 `#/applications`，点卡片。
Expected:
- 右侧抽屉打开，头部有公司、岗位、星级、阶段下拉、「我跟进了 / 放弃 / 挂了」
- 基本信息里改「城市」后点别处，看板卡片随之更新；刷新后仍在
- 「日程与复盘」→ 添加日程：类型「群面」，时间 `2026-09-25 14:00`，时区「北京」，预览显示「= 洛杉矶 9/24 周四 23:00」；保存后弹出「要把进度推进到「面试」吗？」，点「推进」后阶段变成面试
- 把日程时间改到过去，出现复盘框；填写问题后失焦，刷新仍在
- JD 页粘贴文字点保存，`data/jd/<id>.md` 出现；时间线页能看到阶段变化和手记
- Esc 关闭抽屉；控制台没有报错

验证完按 T12 Step 3 的命令删掉测试数据。

- [ ] **Step 5: Commit**

```bash
git add web/js/components/eventForm.js web/js/components/appDrawer.js web/css/components.css
git commit -m "feat: application detail drawer with events, reviews, jd snapshot and timeline"
```

---
### Task 14: 新建投递（粘贴 JD 自动识别）

**Files:**
- Create: `web/js/components/newApp.js`

- [ ] **Step 1: 新建投递弹窗**

```js file=web/js/components/newApp.js
// 新建投递：左边粘贴 JD 和链接（可选），右边是表单。
// 粘贴后自动识别公司、类型、岗位、城市、截止日；只填空着的或上次自动填的字段，不覆盖手改的。
import { store } from '../store.js';
import {
  h, field, input, textarea, select, segmented, openModal, confirmDialog,
  attempt, toast, ensureCss, openApp, debounce,
} from '../ui.js';
import { TRACKS, COMPANY_TYPES, CHANNELS } from '../../shared/constants.js';
import { parseJD } from '../../shared/jdparse.js';

const PARSED_FIELDS = [['company', '公司'], ['companyType', '类型'], ['position', '岗位'], ['cities', '城市'], ['deadline', '截止日']];
const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

export function openNewApp(preset = {}) {
  ensureCss('/css/components.css');
  const data = {
    company: '', companyEn: '', position: '', track: '', companyType: '', cities: '', deadline: '',
    stage: 'wishlist', channel: '官网', resumeId: '', jdUrl: '',
    ...preset,
  };
  let jdText = '';
  let busy = false;
  const edited = new Set(); // 用户亲手改过的字段
  const autoFilled = new Set(); // 自动识别填进去的字段
  const controls = {};

  const bind = (key, el, event = 'input') => {
    el.addEventListener(event, () => {
      data[key] = el.value;
      edited.add(key);
      autoFilled.delete(key);
    });
    controls[key] = el;
    return el;
  };
  const text = (key, placeholder = '') => bind(key, input({ value: data[key], placeholder }));
  const pick = (key, options, placeholder = '未选择') => bind(key, select(options, data[key], null, { placeholder }), 'change');

  const hint = h('div', { class: 'parse-hint' }, '粘贴 JD 后会自动识别公司、岗位、城市和截止日');
  const url = bind('jdUrl', input({ type: 'url', value: data.jdUrl, placeholder: 'https://…（可选）' }));
  const jd = textarea({ rows: 14, placeholder: '把 JD 全文粘贴到这里（可选）。会一起存成 JD 快照，官网下架了也能复习。' });

  function runParse() {
    const found = parseJD(jdText, data.jdUrl);
    for (const [key] of PARSED_FIELDS) {
      const value = found[key];
      if (!value || edited.has(key) || data[key] === value) continue;
      if (data[key] && !autoFilled.has(key)) continue;
      data[key] = value;
      autoFilled.add(key);
      const el = controls[key];
      el.value = value;
      el.classList.remove('filled');
      void el.offsetWidth; // 只给这次真正改了的字段重新触发高亮
      el.classList.add('filled');
    }
    const labels = PARSED_FIELDS.filter(([key]) => autoFilled.has(key)).map(([, label]) => label);
    if (labels.length) {
      hint.textContent = `识别到：${labels.join('、')}（可以直接改）`;
      hint.className = 'parse-hint ok';
    } else if (jdText.trim() || data.jdUrl) {
      hint.textContent = '没识别出字段，手动填一下就好';
      hint.className = 'parse-hint';
    }
  }
  const parseSoon = debounce(runParse, 350);
  jd.addEventListener('input', () => {
    jdText = jd.value;
    parseSoon();
  });
  url.addEventListener('change', runParse);

  const resumes = store.state.resumes.map((r) => ({ value: r.id, label: r.name || '未命名版本' }));
  const body = h('div', { class: 'newapp' },
    h('div', { class: 'newapp-jd' },
      field('JD 链接', url),
      field('JD 全文', jd),
      hint),
    h('div', { class: 'form-grid' },
      field('公司', text('company', '如：雀巢')),
      field('公司英文名', text('companyEn', '如：Nestlé')),
      field('岗位', text('position', '如：Marketing MT'), { full: true }),
      field('赛道', pick('track', TRACKS)),
      field('公司类型', pick('companyType', COMPANY_TYPES)),
      field('城市', text('cities', '多个用 / 分隔')),
      field('网申截止（北京时间）', bind('deadline', input({ type: 'date', value: data.deadline }), 'change')),
      field('渠道', pick('channel', CHANNELS)),
      field('投的简历', pick('resumeId', resumes, resumes.length ? '未选择' : '还没有简历版本')),
      field('状态', segmented([{ value: 'wishlist', label: '还没投' }, { value: 'applied', label: '已投递' }], data.stage, (v) => { data.stage = v; }), { full: true, tag: 'div' })));

  async function submit(close) {
    if (busy) return;
    if (!data.company.trim() && !data.position.trim()) {
      toast('公司和岗位至少填一个', { type: 'error' });
      controls.company.focus();
      return;
    }
    const dup = store.state.applications.find((a) => norm(a.company) === norm(data.company) && norm(a.position) === norm(data.position));
    if (dup && !(await confirmDialog(`已经有「${dup.company} · ${dup.position}」这条记录了，还要再建一条吗？`, { okLabel: '仍然新建' }))) return;
    busy = true;
    const payload = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    const rec = await attempt(() => store.createApplication(payload));
    busy = false;
    if (!rec) return;
    close();
    if (jdText.trim()) await attempt(() => store.saveJd(rec.id, jdText));
    toast(`已添加「${rec.company || rec.position}」`, { action: { label: '查看', onClick: () => openApp(rec.id) } });
  }

  const modal = openModal({
    title: '新建投递',
    wide: true,
    body,
    actions: [
      { label: '取消', ghost: true, onClick: (close) => close() },
      { label: '保存（⌘↩）', primary: true, onClick: (close) => submit(close) },
    ],
  });
  modal.el.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(modal.close);
  });
  requestAnimationFrame(() => jd.focus());
  return modal;
}
```

- [ ] **Step 2: 在内置浏览器里验证**

Expected:
- 点顶栏「新建投递」（或在页面空白处按 `n`）弹出宽弹窗，光标在 JD 框
- 粘贴下面这段，右侧自动填上：公司「雀巢（中国）有限公司」、岗位「市场部管理培训生」、城市「上海/北京」、截止「2026-10-15」，并提示「识别到：公司、岗位、城市、截止日」

  ```text
  市场部管理培训生
  公司名称：雀巢（中国）有限公司
  工作地点：上海、北京
  网申截止时间：2026年10月15日
  ```
- 手动把公司改成「雀巢」，再往 JD 里加一个字，公司不会被改回去
- JD 链接填 `https://www.pgcareers.com/job/1` 后公司类型自动变成「外企」（公司名已手改，不覆盖）
- ⌘↩ 保存：弹窗关闭，看板「待投递」列出现新卡片，提示里点「查看」打开抽屉，JD 页有刚才的全文
- 再建一条同公司同岗位的，会先问「已经有…还要再建一条吗？」

验证完删掉测试数据（T12 Step 3 的命令，把 `测试` 换成 `雀巢`）。

- [ ] **Step 3: Commit**

```bash
git add web/js/components/newApp.js
git commit -m "feat: new application modal with JD paste auto-fill and duplicate check"
```

---
### Task 15: 概览页

图表按 dataviz skill 的规则做：数字用卡片（大数字不用等宽数字）；漏斗和每周投递都只有一个系列，用单色、不要图例；柱子 ≤ 24px、数据端 4px 圆角、贴着基线；数值直接标在柱子末端，所以提示框只是补充；本周用主色强调，其余周用灰色；目标线是实线细线；每根柱子的整列都是悬停 / 键盘聚焦区域。赛道对比只有两三行数字，直接用表格。

**Files:**
- Create: `web/js/views/dashboard.js`
- Create: `web/css/dashboard.css`

- [ ] **Step 1: 概览视图**

```js file=web/js/views/dashboard.js
// 概览：数字卡片、需要处理、未来 7 天、投递漏斗、每周投递、赛道对比。
import { store } from '../store.js';
import { h, icon, ensureCss, openApp, openNewApp } from '../ui.js';
import { STAGE_LABEL, TRACKS } from '../../shared/constants.js';
import { actionItems, funnel, weeklyApplied, stageIndex, isClosed } from '../../shared/domain.js';
import { todayInZone, formatZoned, isoToLocalInput, zonedToISO, deadlineISO, addDays, diffDays } from '../../shared/time.js';

const KIND_ICON = { test: 'clock', meeting: 'calendar', deadline: 'flag', review: 'message', stale: 'alert', overdue: 'alert' };
const PLOT_HEIGHT = 120;
const LABEL_BAND = 24;

const fmtMD = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const hm = (iso, tz) => isoToLocalInput(iso, tz).slice(11);

// ---------- 共用提示框（数值在前，说明在后） ----------
let tipEl = null;

function showTip({ value, label }, x, y) {
  if (!tipEl) {
    tipEl = h('div', { class: 'viz-tip', role: 'tooltip' });
    document.body.append(tipEl);
  }
  tipEl.replaceChildren(h('b', null, value), label);
  tipEl.classList.add('on');
  const left = Math.min(x + 14, window.innerWidth - tipEl.offsetWidth - 8);
  tipEl.style.left = `${Math.max(8, left)}px`;
  tipEl.style.top = `${y + 14}px`;
}

function hideTip() {
  tipEl?.classList.remove('on');
}

function tipHandlers(content) {
  return {
    onPointermove: (e) => showTip(content, e.clientX, e.clientY),
    onPointerleave: hideTip,
    onFocus: (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      showTip(content, r.left + r.width / 2, r.bottom);
    },
    onBlur: hideTip,
  };
}

// ---------- 入口 ----------
export function render(root) {
  ensureCss('/css/dashboard.css');
  const draw = () => {
    hideTip();
    root.replaceChildren(build());
  };
  draw();
  const timer = setInterval(draw, 60000); // 倒计时每分钟刷新
  const unsubscribe = store.subscribe((topic) => {
    if (['load', 'applications', 'settings'].includes(topic)) draw();
  });
  return () => {
    clearInterval(timer);
    unsubscribe();
    hideTip();
  };
}

function build() {
  const { applications: apps, settings } = store.state;
  if (!apps.length) return welcome();
  const now = new Date();
  const today = todayInZone(settings.homeTz, now);
  return h('div', { class: 'dash' },
    kpiRow(apps, settings, today),
    h('div', { class: 'dash-grid' },
      h('div', { class: 'dash-col' }, actionCard(apps, settings, now), agendaCard(apps, settings, now)),
      h('div', { class: 'dash-col' }, funnelCard(apps), weeklyCard(apps, settings, today), trackCard(apps))));
}

function welcome() {
  return h('div', { class: 'card dash-welcome' },
    h('h2', null, '开始记录秋招'),
    h('ol', { class: 'muted' },
      h('li', null, '在「档案」里核对从简历导入的信息，补上网申常问的字段'),
      h('li', null, '在「简历」里放好各个版本的 PDF'),
      h('li', null, '每投一家就「新建投递」，粘贴 JD 会自动识别公司、岗位和截止日')),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onClick: () => openNewApp() }, icon('plus'), '新建投递'),
      h('a', { class: 'btn', href: '#/profile' }, '去看档案')));
}

// ---------- 数字卡片 ----------
function tile(label, value, sub) {
  return h('div', { class: 'card kpi' },
    h('div', { class: 'kpi-label' }, label),
    h('div', { class: 'kpi-value' }, String(value)),
    h('div', { class: 'kpi-sub' }, sub));
}

function weekTile(count, goal) {
  const pct = goal ? Math.min(100, Math.round((count / goal) * 100)) : 0;
  return h('div', { class: 'card kpi' },
    h('div', { class: 'kpi-label' }, '本周投递'),
    h('div', { class: 'kpi-value' }, String(count), goal ? h('span', { class: 'kpi-goal' }, ` / ${goal}`) : null),
    goal
      ? h('div', { class: 'meter', role: 'meter', 'aria-label': '本周投递进度', 'aria-valuenow': String(count), 'aria-valuemin': '0', 'aria-valuemax': String(goal) },
        h('span', { style: { width: `${pct}%` } }))
      : h('div', { class: 'kpi-sub' }, '可以在「设置」里定个周目标'));
}

function kpiRow(apps, settings, today) {
  const submitted = apps.filter((a) => a.stage !== 'wishlist');
  const active = submitted.filter((a) => a.status === 'active');
  const interviewing = active.filter((a) => a.stage === 'interview' || a.stage === 'final');
  const offers = apps.filter((a) => a.stage === 'offer' && !isClosed(a));
  const accepted = offers.filter((a) => a.status === 'accepted').length;
  return h('div', { class: 'kpis' },
    tile('已投递', submitted.length, `还有 ${apps.length - submitted.length} 个待投递`),
    tile('进行中', active.length, `已结束 ${submitted.filter(isClosed).length} 个`),
    tile('面试中', interviewing.length, `其中终面 ${interviewing.filter((a) => a.stage === 'final').length} 个`),
    tile('Offer', offers.length, accepted ? `已接受 ${accepted} 个` : '—'),
    weekTile(weeklyApplied(apps, 1, today)[0].count, settings.weeklyGoal || 0));
}

// ---------- 需要处理 ----------
function actionCard(apps, settings, now) {
  const items = actionItems(apps, settings, now);
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, '需要处理'), items.length ? h('span', { class: 'chip accent' }, String(items.length)) : null),
    h('div', { class: 'card-body' }, items.length
      ? h('ul', { class: 'todo' }, items.map((it) => h('li', null,
        h('button', {
          type: 'button',
          class: `todo-item kind-${it.kind}`,
          onClick: () => openApp(it.app.id, { tab: it.event ? 'events' : 'info' }),
        },
        icon(KIND_ICON[it.kind]),
        h('span', { class: 'todo-main' },
          h('b', null, it.app.company || it.app.position || '未命名'),
          it.app.company && it.app.position ? h('span', { class: 'muted' }, ` · ${it.app.position}`) : null),
        h('span', { class: 'todo-text' }, it.text)))))
      : h('div', { class: 'empty small' }, '暂时没有要处理的事')));
}

// ---------- 未来 7 天 ----------
function agendaCard(apps, settings, now) {
  const start = now.getTime();
  const end = start + 7 * 86400000;
  const rows = [];
  for (const app of apps) {
    if (isClosed(app)) continue;
    for (const ev of app.events || []) {
      const at = Date.parse(ev.at);
      if (!ev.done && at >= start && at <= end) rows.push({ at, app, ev });
    }
    if (app.stage === 'wishlist' && app.deadline && app.status === 'active') {
      const at = Date.parse(deadlineISO(app.deadline, settings.targetTz));
      if (at >= start && at <= end) rows.push({ at, app, deadline: true });
    }
  }
  rows.sort((a, b) => a.at - b.at);

  const today = todayInZone(settings.homeTz, now);
  const groups = new Map();
  for (const r of rows) {
    const day = todayInZone(settings.homeTz, new Date(r.at));
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(r);
  }
  const dayLabel = (day) => {
    const d = diffDays(today, day);
    const base = formatZoned(zonedToISO(`${day}T12:00`, settings.homeTz), settings.homeTz, { time: false });
    return d === 0 ? `今天 ${base}` : d === 1 ? `明天 ${base}` : base;
  };

  return h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', null, '未来 7 天'),
      h('span', { class: 'muted small' }, `按${settings.homeTzLabel}时间分组`),
      h('span', { class: 'spacer' }),
      h('a', { class: 'small', href: '#/calendar' }, '全部日程')),
    h('div', { class: 'card-body' }, rows.length
      ? [...groups].map(([day, list]) => h('div', { class: 'agenda-day' },
        h('div', { class: 'agenda-date' }, dayLabel(day)),
        list.map((r) => agendaRow(r, settings))))
      : h('div', { class: 'empty small' }, '未来 7 天没有安排')));
}

function agendaRow(r, settings) {
  const iso = new Date(r.at).toISOString();
  const what = r.deadline
    ? `${r.app.company || ''}${r.app.position ? ` · ${r.app.position}` : ''}`
    : `${r.app.company || r.app.position || ''}${r.ev.title ? ` · ${r.ev.title}` : ''}`;
  return h('button', { type: 'button', class: 'agenda-row', onClick: () => openApp(r.app.id, { tab: r.deadline ? 'info' : 'events' }) },
    h('span', { class: 'agenda-time' }, hm(iso, settings.homeTz)),
    h('span', { class: ['chip', r.deadline ? 'warn' : 'accent'] }, r.deadline ? '网申截止' : r.ev.type),
    h('span', { class: 'agenda-what' }, what),
    h('span', { class: 'agenda-other muted' }, `${settings.targetTzLabel} ${formatZoned(iso, settings.targetTz)}`));
}

// ---------- 漏斗 ----------
function funnelCard(apps) {
  const rows = funnel(apps);
  const base = rows[0].count;
  const body = base
    ? h('div', { class: 'funnel' }, rows.map((r, i) => {
      const share = r.count / base;
      const prev = i ? rows[i - 1].count : 0;
      const conv = i && prev ? Math.round((r.count / prev) * 100) : null;
      const label = i ? `${STAGE_LABEL[r.key]} · 上一步转化 ${conv ?? 0}% · 占已投递 ${Math.round(share * 100)}%` : '已投递';
      return h('div', { class: 'funnel-row', tabindex: '0', 'aria-label': `${r.count} 家 ${label}`, ...tipHandlers({ value: `${r.count} 家`, label }) },
        h('span', { class: 'funnel-label' }, STAGE_LABEL[r.key]),
        h('span', { class: 'funnel-track' },
          h('span', { class: 'funnel-bar', style: { width: `${(share * 82).toFixed(1)}%` } }),
          h('span', { class: 'funnel-value' }, String(r.count), conv != null ? h('span', { class: 'muted' }, ` ${conv}%`) : null)));
    }))
    : h('div', { class: 'empty small' }, '投出第一份之后，这里会显示每一轮的通过情况');
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, '投递漏斗'), h('span', { class: 'muted small' }, '按到达过的最高阶段 · 百分比是上一步转化率')),
    h('div', { class: 'card-body' }, body));
}

// ---------- 每周投递 ----------
function weeklyCard(apps, settings, today) {
  const weeks = weeklyApplied(apps, 8, today);
  const goal = settings.weeklyGoal || 0;
  const max = Math.max(goal, ...weeks.map((w) => w.count), 1);
  const y = (v) => (v / max) * PLOT_HEIGHT;
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, '每周投递'), h('span', { class: 'muted small' }, '近 8 周 · 周一开始')),
    h('div', { class: 'card-body' },
      h('div', { class: 'weekly', style: { height: `${PLOT_HEIGHT + LABEL_BAND + 26}px` } },
        goal ? h('div', { class: 'goal-line', style: { bottom: `${LABEL_BAND + y(goal)}px` } }, h('span', null, `目标 ${goal}`)) : null,
        weeks.map((w, i) => {
          const current = i === weeks.length - 1;
          const range = `${fmtMD(w.weekStart)}–${fmtMD(addDays(w.weekStart, 6))}${current ? '（本周）' : ''}`;
          return h('div', {
            class: ['wk', current && 'current'],
            tabindex: '0',
            'aria-label': `${range} 投了 ${w.count} 家`,
            ...tipHandlers({ value: `${w.count} 家`, label: range }),
          },
          h('span', { class: 'wk-value' }, String(w.count)),
          h('span', { class: 'wk-bar', style: { height: `${y(w.count)}px` } }),
          h('span', { class: 'wk-label' }, current ? '本周' : fmtMD(w.weekStart)));
        }))));
}

// ---------- 赛道对比 ----------
function trackCard(apps) {
  const rows = TRACKS.map((track) => {
    const list = apps.filter((a) => a.track === track && a.stage !== 'wishlist');
    const interview = list.filter((a) => stageIndex(a.stage) >= stageIndex('interview')).length;
    return { track, total: list.length, interview, offer: list.filter((a) => a.stage === 'offer').length };
  }).filter((r) => r.total);
  const untagged = apps.filter((a) => !a.track && a.stage !== 'wishlist').length;
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, '赛道对比')),
    h('div', { class: 'card-body' }, rows.length
      ? h('table', { class: 'track-table' },
        h('thead', null, h('tr', null, ['赛道', '已投递', '进入面试', '面试率', 'Offer'].map((t) => h('th', null, t)))),
        h('tbody', null, rows.map((r) => h('tr', null,
          h('td', null, r.track),
          h('td', null, String(r.total)),
          h('td', null, String(r.interview)),
          h('td', null, `${Math.round((r.interview / r.total) * 100)}%`),
          h('td', null, String(r.offer))))))
      : h('div', { class: 'empty small' }, '给投递选上「赛道」后，这里会比较产品线和市场线'),
    untagged ? h('div', { class: 'muted small', style: { marginTop: '8px' } }, `还有 ${untagged} 条投递没选赛道`) : null));
}
```

- [ ] **Step 2: 概览样式**

```css file=web/css/dashboard.css
.dash { display: flex; flex-direction: column; gap: 16px; max-width: 1280px; }

/* 数字卡片：大数字用比例数字，不用 tabular-nums */
.kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.kpi { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; }
.kpi-label { color: var(--text-2); font-size: 12.5px; }
.kpi-value { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.25; }
.kpi-goal { color: var(--text-3); font-size: 15px; font-weight: 500; }
.kpi-sub { color: var(--text-3); font-size: 12px; }
.meter { height: 6px; margin-top: 9px; border-radius: 3px; background: var(--accent-soft); overflow: hidden; }
.meter span { display: block; height: 100%; border-radius: 3px; background: var(--accent); }

.dash-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.dash-col { display: flex; flex-direction: column; gap: 16px; }
.dash-welcome { display: flex; flex-direction: column; gap: 12px; max-width: 680px; padding: 28px; }
.dash-welcome ol { margin: 0; padding-left: 20px; line-height: 1.9; }

/* 需要处理 */
.todo { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.todo-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 9px 8px;
  border: 0; border-radius: var(--radius-sm);
  background: none; text-align: left; cursor: pointer;
}
.todo-item:hover { background: var(--surface-2); }
.todo-item .icon { color: var(--text-3); }
.kind-test .icon, .kind-meeting .icon { color: var(--accent); }
.kind-deadline .icon, .kind-overdue .icon { color: var(--danger); }
.kind-stale .icon { color: var(--warn); }
.kind-review .icon { color: var(--st-interview); }
.todo-main { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-text { color: var(--text-2); font-size: 12.5px; white-space: nowrap; }

/* 未来 7 天 */
.agenda-day + .agenda-day { margin-top: 10px; }
.agenda-date { padding: 4px 8px; color: var(--text-2); font-size: 12px; font-weight: 600; }
.agenda-row {
  display: grid; grid-template-columns: 46px auto minmax(0, 1fr) auto; align-items: center; gap: 10px;
  width: 100%; padding: 7px 8px;
  border: 0; border-radius: var(--radius-sm);
  background: none; text-align: left; cursor: pointer;
}
.agenda-row:hover { background: var(--surface-2); }
.agenda-time { font-weight: 600; font-variant-numeric: tabular-nums; }
.agenda-what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agenda-other { font-size: 12px; white-space: nowrap; }

/* 漏斗：单系列单色；柱子 18px，数据端 4px 圆角，贴着左侧基线；数值在柱子末端 */
.funnel { display: flex; flex-direction: column; gap: 4px; }
.funnel-row {
  display: grid; grid-template-columns: 70px minmax(0, 1fr); align-items: center; gap: 10px;
  padding: 4px;
  border-radius: var(--radius-sm);
  outline: none;
}
.funnel-row:hover, .funnel-row:focus-visible { background: var(--surface-2); }
.funnel-label { color: var(--text-2); font-size: 12.5px; }
.funnel-track { display: flex; align-items: center; gap: 8px; min-width: 0; border-left: 1px solid var(--border); }
.funnel-bar { flex: none; height: 18px; border-radius: 0 4px 4px 0; background: var(--accent); }
.funnel-value { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.funnel-value .muted { font-size: 12px; font-weight: 400; }

/* 每周投递：柱子 22px，顶部 4px 圆角，贴着基线；本周强调色，其余灰色 */
.weekly { position: relative; display: flex; justify-content: space-between; gap: 4px; }
.wk {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
  border-radius: var(--radius-sm);
  outline: none;
}
.wk:focus-visible { background: var(--surface-2); }
.wk-value { margin-bottom: 4px; color: var(--text-3); font-size: 12px; font-variant-numeric: tabular-nums; }
.wk.current .wk-value { color: var(--text); font-weight: 600; }
.wk-bar { width: 22px; border-radius: 4px 4px 0 0; background: var(--border-strong); transition: background 0.12s; }
.wk:hover .wk-bar { background: var(--text-3); }
.wk.current .wk-bar { background: var(--accent); }
.wk.current:hover .wk-bar { background: var(--accent-hover); }
.wk-label {
  align-self: stretch;
  height: 24px; line-height: 24px;
  border-top: 1px solid var(--border);
  color: var(--text-3); font-size: 11.5px; text-align: center; font-variant-numeric: tabular-nums;
}
.goal-line { position: absolute; left: 0; right: 0; height: 0; border-top: 1px solid var(--text-3); pointer-events: none; }
.goal-line span { position: absolute; right: 0; top: -19px; padding: 0 4px; background: var(--surface); color: var(--text-3); font-size: 11px; }

/* 赛道对比 */
.track-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.track-table th { padding: 6px 8px; border-bottom: 1px solid var(--border); color: var(--text-3); font-weight: 500; text-align: right; }
.track-table td { padding: 8px; border-bottom: 1px solid var(--border); text-align: right; font-variant-numeric: tabular-nums; }
.track-table th:first-child, .track-table td:first-child { text-align: left; }
.track-table tr:last-child td { border-bottom: 0; }

/* 图表提示框：数值在前加粗，说明在后 */
.viz-tip {
  position: fixed; z-index: 70;
  padding: 6px 10px;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--surface); box-shadow: var(--shadow);
  color: var(--text-2); font-size: 12px; white-space: nowrap;
  pointer-events: none; opacity: 0; transition: opacity 0.1s;
}
.viz-tip.on { opacity: 1; }
.viz-tip b { margin-right: 6px; color: var(--text); font-size: 13px; }

@media (max-width: 1100px) {
  .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .dash-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: 在内置浏览器里验证**

用 API 造 4 条数据（1 条待投递 3 天后截止；1 条已投递；1 条面试中，带一个明天的面试日程；1 条挂在测评）：
```bash
API=http://127.0.0.1:7317/api/applications
J='Content-Type: application/json'
TOMORROW=$(node -e 'const d=new Date(Date.now()+86400000);console.log(d.toISOString().slice(0,10))')
IN3=$(node -e 'const d=new Date(Date.now()+3*86400000);console.log(d.toISOString().slice(0,10))')
curl -s -X POST $API -H "$J" -d "{\"company\":\"测试甲\",\"position\":\"市场 MT\",\"track\":\"市场\",\"deadline\":\"$IN3\"}" > /dev/null
curl -s -X POST $API -H "$J" -d '{"company":"测试乙","position":"产品经理","track":"产品","stage":"applied"}' > /dev/null
curl -s -X POST $API -H "$J" -d "{\"company\":\"测试丙\",\"position\":\"品牌 MT\",\"track\":\"市场\",\"stage\":\"interview\",\"events\":[{\"id\":\"evt_test1\",\"type\":\"面试\",\"title\":\"二面\",\"at\":\"${TOMORROW}T10:00:00+08:00\",\"tz\":\"Asia/Shanghai\",\"durationMin\":60,\"location\":\"\",\"done\":false,\"review\":null}]}" > /dev/null
curl -s -X POST $API -H "$J" -d '{"company":"测试丁","position":"管培生","track":"市场","stage":"assessment","status":"rejected"}' > /dev/null
```
Expected（打开 `#/dashboard`）：
- 5 张数字卡：已投递 3、进行中 2、面试中 1、Offer 0、本周投递 3/10 带进度条
- 「需要处理」里有「测试甲 · 还剩 N 天截止」；「未来 7 天」有测试丙的面试（洛杉矶时间 + 北京时间）
- 漏斗 5 行：3 / 2 / 1 / 0 / 0，悬停和 Tab 聚焦都出现提示框
- 每周投递：本周柱子是主色，其余灰色，目标线在 10 的位置
- 赛道对比表：产品 1 条、市场 2 条
- 系统切换到深色模式后颜色正常；控制台没有报错

验证完删掉测试数据（T12 Step 3 的命令）。

- [ ] **Step 4: Commit**

```bash
git add web/js/views/dashboard.js web/css/dashboard.css
git commit -m "feat: dashboard with action items, agenda, funnel and weekly chart"
```

---
### Task 16: 日程页 + 苹果日历订阅

**Files:**
- Create: `web/js/views/calendar.js`
- Create: `web/css/calendar.css`

- [ ] **Step 1: 日程视图**

```js file=web/js/views/calendar.js
// 日程：按天列出测评、笔试、面试和网申截止（按本地时区分组，右侧显示目标时区时间）；
// 可以直接勾选完成；右侧是订阅到苹果日历的入口。
import { store } from '../store.js';
import { h, icon, ensureCss, openApp, attempt, safeUrl, copyText, emptyState } from '../ui.js';
import { calendarUrl } from '../api.js';
import { isClosed } from '../../shared/domain.js';
import { todayInZone, formatZoned, isoToLocalInput, zonedToISO, deadlineISO, diffDays } from '../../shared/time.js';

const PREF_KEY = 'jt.calendar.showPast';
const DAY = 86400000;

export function render(root) {
  ensureCss('/css/calendar.css');
  let showPast = false;
  try {
    showPast = localStorage.getItem(PREF_KEY) === '1';
  } catch {
    // 不能存偏好时用默认值
  }
  const setShowPast = (value) => {
    showPast = value;
    try {
      localStorage.setItem(PREF_KEY, value ? '1' : '0');
    } catch {
      // 忽略
    }
    draw();
  };
  const draw = () => root.replaceChildren(build(showPast, setShowPast));
  draw();
  return store.subscribe((topic) => {
    if (['load', 'applications', 'settings'].includes(topic)) draw();
  });
}

function collect(apps, settings, now, showPast) {
  const from = showPast ? now.getTime() - 30 * DAY : now.getTime() - 2 * 3600000; // 刚开始 2 小时内的仍算「现在」
  const rows = [];
  for (const app of apps) {
    if (isClosed(app)) continue;
    for (const ev of app.events || []) {
      const at = Date.parse(ev.at);
      if (at >= from) rows.push({ at, app, ev });
    }
    if (app.stage === 'wishlist' && app.status === 'active' && app.deadline) {
      const at = Date.parse(deadlineISO(app.deadline, settings.targetTz));
      if (at >= from) rows.push({ at, app, deadline: true });
    }
  }
  return rows.sort((a, b) => a.at - b.at);
}

function build(showPast, setShowPast) {
  const { applications: apps, settings } = store.state;
  const now = new Date();
  const rows = collect(apps, settings, now, showPast);
  const today = todayInZone(settings.homeTz, now);
  const groups = new Map();
  for (const r of rows) {
    const day = todayInZone(settings.homeTz, new Date(r.at));
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(r);
  }
  const toolbar = h('div', { class: 'cal-toolbar' },
    h('label', { class: 'row small' },
      h('input', { type: 'checkbox', checked: showPast, onChange: (e) => setShowPast(e.target.checked) }),
      '显示过去 30 天'),
    h('span', { class: 'spacer' }),
    h('span', { class: 'muted small' }, `按${settings.homeTzLabel}时间分组 · 右侧是${settings.targetTzLabel}时间`));
  const list = rows.length
    ? h('div', { class: 'cal-list' }, [...groups].map(([day, items]) => dayBlock(day, items, today, settings, now)))
    : emptyState(showPast ? '最近 30 天和之后都没有日程' : '还没有之后的日程。在投递详情的「日程与复盘」里添加。');
  return h('div', { class: 'cal' }, h('div', { class: 'cal-main' }, toolbar, list), subscribeCard(settings));
}

function dayBlock(day, items, today, settings, now) {
  const d = diffDays(today, day);
  const base = formatZoned(zonedToISO(`${day}T12:00`, settings.homeTz), settings.homeTz, { time: false });
  const prefix = { '-1': '昨天 · ', 0: '今天 · ', 1: '明天 · ' }[d] || '';
  return h('section', { class: ['cal-day', d < 0 && 'past', d === 0 && 'today'] },
    h('h3', { class: 'cal-date' }, `${prefix}${base}`),
    h('div', { class: 'card cal-items' }, items.map((r) => row(r, settings, now))));
}

function toggleDone(appId, eventId, done) {
  const app = store.app(appId);
  if (!app) return;
  attempt(() => store.updateApplication(appId, { events: app.events.map((e) => (e.id === eventId ? { ...e, done } : e)) }));
}

function row(r, settings, now) {
  const iso = new Date(r.at).toISOString();
  const time = isoToLocalInput(iso, settings.homeTz).slice(11);
  const other = `${settings.targetTzLabel} ${formatZoned(iso, settings.targetTz)}`;
  const past = r.at < now.getTime();
  const who = r.app.company || r.app.position || '';

  if (r.deadline) {
    return h('div', { class: ['cal-row', past && 'past'], onClick: () => openApp(r.app.id) },
      h('span', { class: 'cal-time' }, time),
      h('span', { class: 'chip warn' }, '网申截止'),
      h('div', { class: 'cal-what' }, h('b', null, who), r.app.position && r.app.company ? h('span', { class: 'muted' }, ` · ${r.app.position}`) : null),
      h('span', { class: 'cal-other muted' }, other),
      h('span', { class: 'cal-check' }));
  }

  const { ev } = r;
  const link = safeUrl(ev.location);
  const detail = ev.title || (r.app.company ? r.app.position : '');
  return h('div', { class: ['cal-row', ev.done && 'done', past && !ev.done && 'overdue'], onClick: () => openApp(r.app.id, { tab: 'events' }) },
    h('span', { class: 'cal-time' }, time),
    h('span', { class: 'chip accent' }, ev.type),
    h('div', { class: 'cal-what' },
      h('b', null, who),
      detail ? h('span', { class: 'muted' }, ` · ${detail}`) : null,
      link
        ? h('a', { class: 'cal-link', href: link, target: '_blank', rel: 'noopener', onClick: (e) => e.stopPropagation() }, icon('link'), '会议链接')
        : ev.location ? h('span', { class: 'muted small' }, ` · ${ev.location}`) : null),
    h('span', { class: 'cal-other muted' }, other),
    h('label', { class: 'cal-check', title: '标记为已完成', onClick: (e) => e.stopPropagation() },
      h('input', { type: 'checkbox', checked: !!ev.done, onChange: (e) => toggleDone(r.app.id, ev.id, e.target.checked) })));
}

function subscribeCard(settings) {
  const httpUrl = new URL(calendarUrl(), location.href).href;
  const webcal = httpUrl.replace(/^https?:/, 'webcal:');
  return h('aside', { class: 'card cal-side' },
    h('div', { class: 'card-head' }, h('h3', null, '同步到苹果日历')),
    h('div', { class: 'card-body' },
      h('p', { class: 'small' }, '订阅以后，新加的日程会自动出现在日历里：面试前 1 小时提醒，测评和网申截止前 1 天提醒。'),
      h('div', { class: 'row wrap' },
        h('a', { class: 'btn primary', href: webcal }, icon('calendar'), '订阅'),
        h('a', { class: 'btn', href: httpUrl, download: 'job-tracker.ics' }, icon('download'), '下载 .ics'),
        h('button', { class: 'btn ghost', type: 'button', onClick: () => copyText(httpUrl, '订阅地址已复制') }, icon('copy'), '复制地址')),
      h('ul', { class: 'small muted cal-tips' },
        h('li', null, '订阅时把「移除：提醒」取消勾选，不然日历不会提醒。'),
        h('li', null, '「自动刷新」选每 15 分钟或每小时。Tracker 没启动时日历只是暂停更新，不会丢数据。'),
        h('li', null, `日历按本机时区显示（现在是${settings.homeTzLabel}）。`))));
}
```

- [ ] **Step 2: 日程样式**

```css file=web/css/calendar.css
.cal { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; max-width: 1180px; }
.cal-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.cal-toolbar input { accent-color: var(--accent); }
.cal-list { display: flex; flex-direction: column; gap: 18px; }
.cal-date { margin: 0 0 8px 2px; color: var(--text-2); font-size: 13px; font-weight: 600; }
.cal-day.today .cal-date { color: var(--accent-text); }
.cal-day.past { opacity: 0.72; }
.cal-items { overflow: hidden; }
.cal-row {
  display: grid; grid-template-columns: 48px auto minmax(0, 1fr) auto 28px; align-items: center; gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.cal-row:last-child { border-bottom: 0; }
.cal-row:hover { background: var(--surface-2); }
.cal-row.done .cal-what, .cal-row.done .cal-time { color: var(--text-3); text-decoration: line-through; }
.cal-row.overdue .cal-time { color: var(--warn); }
.cal-time { font-weight: 600; font-variant-numeric: tabular-nums; }
.cal-what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cal-link { display: inline-flex; align-items: center; gap: 3px; margin-left: 8px; font-size: 12px; }
.cal-link .icon { width: 12px; height: 12px; }
.cal-other { font-size: 12px; white-space: nowrap; }
.cal-check { display: flex; justify-content: center; }
.cal-check input { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
.cal-side { position: sticky; top: 0; }
.cal-side p { margin: 0 0 12px; }
.cal-tips { margin: 14px 0 0; padding-left: 18px; line-height: 1.7; }
@media (max-width: 1000px) {
  .cal { grid-template-columns: 1fr; }
  .cal-side { position: static; }
}
```

- [ ] **Step 3: 在内置浏览器里验证**

按 T15 Step 3 造数据。
Expected（打开 `#/calendar`）：
- 「明天 · …」分组下有测试丙的面试，左边是洛杉矶时间，右边是「北京 …」
- 测试甲的网申截止出现在对应日期，标签是「网申截止」
- 勾选面试的完成框：行变灰划线，点行本身才会打开抽屉
- 勾「显示过去 30 天」后刷新页面，勾选状态还在
- `curl -s http://127.0.0.1:7317/calendar.ics | head -20` 能看到 `BEGIN:VEVENT`；点「下载 .ics」能下载

验证完删掉测试数据。

- [ ] **Step 4: Commit**

```bash
git add web/js/views/calendar.js web/css/calendar.css
git commit -m "feat: agenda view with dual timezone and apple calendar subscription"
```

---
### Task 17: 档案页（中英对照 + 自动保存）

**Files:**
- Create: `web/js/views/profile.js`
- Create: `web/css/profile.css`

- [ ] **Step 1: 档案视图**

```js file=web/js/views/profile.js
// 档案：基本信息、求职意向、各类经历（可增删、排序）、技能与自我评价、自定义字段。
// 中英字段并排；停止输入 0.8 秒后按分节自动保存（PATCH 只改这一节，不会覆盖别的分节）。
import { store } from '../store.js';
import { h, icon, ensureCss, field, input, textarea, select, confirmDialog } from '../ui.js';
import { asBi, PROFILE_ENTRY, textStats } from '../../shared/domain.js';

const f = {
  text: (key, label, extra = {}) => ({ key, label, kind: 'text', ...extra }),
  month: (key, label) => ({ key, label, kind: 'text', inputType: 'month' }),
  date: (key, label) => ({ key, label, kind: 'text', inputType: 'date' }),
  select: (key, label, options) => ({ key, label, kind: 'select', options }),
  bi: (key, label, extra = {}) => ({ key, label, kind: 'bi', ...extra }),
  long: (key, label) => ({ key, label, kind: 'long' }),
};

const POLITICAL = ['群众', '共青团员', '中共预备党员', '中共党员', '民主党派', '其他'];
const titleOf = (v, fallback) => asBi(v).zh || asBi(v).en || fallback;

const SECTIONS = [
  {
    key: 'basic', title: '基本信息',
    fields: [
      f.bi('name', '姓名'), f.text('preferredName', '英文名 / 常用名', { placeholder: '如：Jasmine' }),
      f.bi('familyName', '姓'), f.bi('givenName', '名'),
      f.select('gender', '性别', ['女', '男']), f.date('birthDate', '出生日期'),
      f.text('phoneCountryCode', '手机区号', { placeholder: '+86' }), f.text('phone', '手机号'),
      f.text('email', '邮箱', { inputType: 'email' }), f.text('wechat', '微信号'),
      f.bi('currentCity', '现居城市'), f.bi('nationality', '国籍'),
      f.bi('hometown', '籍贯'), f.bi('residence', '户口所在地 / 生源地'),
      f.select('politicalStatus', '政治面貌', POLITICAL), f.text('ethnicity', '民族', { placeholder: '如：汉族' }),
      f.text('linkedin', 'LinkedIn', { inputType: 'url' }), f.text('website', '个人网站 / 作品集', { inputType: 'url' }),
    ],
  },
  {
    key: 'intent', title: '求职意向',
    fields: [
      f.bi('positions', '意向岗位'), f.bi('cities', '意向城市'),
      f.text('salary', '期望薪资', { placeholder: '如：面议' }), f.text('availableFrom', '最早到岗时间', { placeholder: '如：2027-07' }),
      f.select('acceptAdjustment', '是否接受调剂', ['是', '否']),
    ],
  },
  {
    key: 'education', title: '教育经历', list: true, itemTitle: (e) => titleOf(e.school, '新的教育经历'),
    fields: [
      f.bi('school', '学校'), f.bi('degree', '学历 / 学位', { placeholder: ['硕士', "Master's"] }),
      f.bi('major', '专业'), f.bi('college', '学院'),
      f.month('start', '开始'), f.month('end', '结束（预计）'),
      f.text('gpa', 'GPA'), f.text('gpaScale', '满分', { placeholder: '4.0' }),
      f.text('rank', '排名', { placeholder: '如：前 10%' }), f.bi('city', '城市'),
      f.long('courses', '主修课程'), f.long('honors', '在校荣誉'),
    ],
  },
  {
    key: 'work', title: '实习 / 工作经历', list: true, itemTitle: (e) => titleOf(e.company, '新的经历'),
    fields: [
      f.bi('company', '公司'), f.bi('title', '职位'),
      f.bi('department', '部门'), f.select('type', '类型', ['实习', '全职', '兼职']),
      f.month('start', '开始'), f.month('end', '结束'),
      f.bi('city', '城市'),
      f.long('description', '工作内容'),
    ],
  },
  {
    key: 'projects', title: '项目经历', list: true, itemTitle: (e) => titleOf(e.name, '新的项目'),
    fields: [
      f.bi('name', '项目名称'), f.bi('role', '角色'),
      f.month('start', '开始'), f.month('end', '结束'),
      f.long('description', '项目描述'),
    ],
  },
  {
    key: 'activities', title: '校园 / 社团经历', list: true, itemTitle: (e) => titleOf(e.org, '新的经历'),
    fields: [
      f.bi('org', '组织'), f.bi('role', '角色'),
      f.month('start', '开始'), f.month('end', '结束'),
      f.long('description', '经历描述'),
    ],
  },
  {
    key: 'awards', title: '获奖荣誉', list: true, itemTitle: (e) => titleOf(e.name, '新的奖项'),
    fields: [f.bi('name', '奖项'), f.month('date', '获得时间'), f.long('description', '说明')],
  },
  {
    key: 'languages', title: '语言能力', list: true, itemTitle: (e) => titleOf(e.language, '新的语言'),
    fields: [
      f.bi('language', '语言'), f.bi('level', '水平', { placeholder: ['精通', 'Fluent'] }),
      f.text('certificate', '证书', { placeholder: '如：IELTS / TOEFL / CET-6' }), f.text('score', '成绩'),
    ],
  },
  {
    key: 'certificates', title: '证书', list: true, itemTitle: (e) => titleOf(e.name, '新的证书'),
    fields: [f.bi('name', '证书名称'), f.month('date', '获得时间'), f.text('score', '成绩 / 等级')],
  },
  {
    key: 'summary', title: '技能 · 自我评价 · 兴趣', root: true,
    fields: [f.long('skills', '技能'), f.long('selfIntro', '自我评价'), f.long('hobbies', '兴趣爱好')],
  },
  {
    key: 'extras', title: '自定义字段', list: true, itemTitle: (e) => e.label || '新字段',
    hint: '网申里遇到档案没有的字段（比如「是否有海外经历」），加在这里，以后插件侧边栏可以点选填入。',
    fields: [f.text('label', '字段名'), f.bi('value', '内容')],
  },
];

export function render(root) {
  ensureCss('/css/profile.css');
  let profile = structuredClone(store.state.profile);
  let dirty = false; // 有外部改动但用户正在输入
  const timers = {};
  const pending = new Set();
  const painters = {};
  const status = h('span', { class: 'pf-status' }, '改动会自动保存');

  function setStatus(kind, message = '') {
    status.className = `pf-status ${kind}`;
    status.textContent = { pending: '有改动，马上自动保存…', saving: '保存中…', saved: '已保存', error: `保存失败：${message}` }[kind];
  }

  async function saveNow(key) {
    clearTimeout(timers[key]);
    pending.delete(key);
    setStatus('saving');
    try {
      await store.patchProfile({ [key]: profile[key] });
      setStatus(pending.size ? 'pending' : 'saved');
    } catch (e) {
      setStatus('error', e.message);
    }
  }

  function schedule(key) {
    pending.add(key);
    setStatus('pending');
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => saveNow(key), 800);
  }

  // ---------- 字段 ----------
  function renderField(def, obj, onChange) {
    if (def.kind === 'text') {
      return field(def.label, input({
        type: def.inputType || 'text',
        value: obj[def.key] || '',
        placeholder: def.placeholder || '',
        onInput: (v) => { obj[def.key] = v; onChange(); },
      }));
    }
    if (def.kind === 'select') {
      return field(def.label, select(def.options, obj[def.key] || '', (v) => { obj[def.key] = v; onChange(); }, { placeholder: '未选择' }));
    }
    const value = asBi(obj[def.key]);
    obj[def.key] = value; // 把写成字符串的旧数据统一成 {zh, en}
    if (def.kind === 'bi') {
      const [phZh, phEn] = def.placeholder || ['', ''];
      const cell = (lang, tag, ph) => h('span', { class: 'bi-cell' },
        h('span', { class: 'bi-tag' }, tag),
        input({ value: value[lang], placeholder: ph, onInput: (v) => { value[lang] = v; onChange(); } }));
      return field(def.label, h('div', { class: 'bi' }, cell('zh', '中', phZh), cell('en', 'EN', phEn)), { tag: 'div' });
    }
    const stats = h('span', null);
    const updateStats = () => { stats.textContent = `中文 ${textStats(value.zh).chars} 字 · English ${textStats(value.en).words} words`; };
    updateStats();
    const area = (lang, ph) => textarea({ value: value[lang], rows: 4, placeholder: ph, onInput: (v) => { value[lang] = v; updateStats(); onChange(); } });
    return field(def.label, h('div', { class: 'bi long' }, area('zh', '中文'), area('en', 'English')), { full: true, tag: 'div', hint: stats });
  }

  // ---------- 多段经历 ----------
  function addEntry(sec) {
    profile[sec.key].push(PROFILE_ENTRY[sec.key]());
    saveNow(sec.key);
    painters[sec.key]();
    const entries = document.querySelectorAll(`#pf-${sec.key} .pf-entry`);
    entries[entries.length - 1]?.querySelector('input')?.focus();
  }

  function move(sec, i, dir) {
    const list = profile[sec.key];
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    saveNow(sec.key);
    painters[sec.key]();
  }

  async function removeEntry(sec, i) {
    const ok = await confirmDialog(`删除「${sec.itemTitle(profile[sec.key][i])}」？`, { okLabel: '删除', danger: true });
    if (!ok) return;
    profile[sec.key].splice(i, 1);
    saveNow(sec.key);
    painters[sec.key]();
  }

  function entryCard(sec, entry, i, count) {
    const title = h('b', { class: 'pf-entry-title' }, sec.itemTitle(entry));
    const onChange = () => {
      title.textContent = sec.itemTitle(entry);
      schedule(sec.key);
    };
    return h('div', { class: 'pf-entry' },
      h('div', { class: 'pf-entry-head' },
        h('span', { class: 'pf-entry-index' }, String(i + 1)),
        title,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm ghost icon-only', type: 'button', title: '上移', disabled: i === 0, onClick: () => move(sec, i, -1) }, icon('up')),
        h('button', { class: 'btn sm ghost icon-only', type: 'button', title: '下移', disabled: i === count - 1, onClick: () => move(sec, i, 1) }, icon('down')),
        h('button', { class: 'btn sm ghost icon-only danger', type: 'button', title: '删除', onClick: () => removeEntry(sec, i) }, icon('trash'))),
      h('div', { class: 'form-grid' }, sec.fields.map((def) => renderField(def, entry, onChange))));
  }

  function renderSection(sec) {
    const el = h('section', { class: 'card pf-section', id: `pf-${sec.key}` });
    const paint = () => {
      const list = sec.list ? profile[sec.key] : null;
      let body;
      if (list) {
        body = list.length
          ? h('div', { class: 'pf-entries' }, list.map((entry, i) => entryCard(sec, entry, i, list.length)))
          : h('div', { class: 'empty small' }, '还没有内容');
      } else {
        body = h('div', { class: 'form-grid' }, sec.fields.map((def) => (sec.root
          ? renderField(def, profile, () => schedule(def.key))
          : renderField(def, profile[sec.key], () => schedule(sec.key)))));
      }
      el.replaceChildren(
        h('div', { class: 'pf-head' },
          h('h2', null, sec.title),
          list ? h('span', { class: 'muted small' }, `${list.length} 条`) : null,
          h('span', { class: 'spacer' }),
          list ? h('button', { class: 'btn sm', type: 'button', onClick: () => addEntry(sec) }, icon('plus'), '添加') : null),
        sec.hint ? h('p', { class: 'muted small pf-hint' }, sec.hint) : '',
        body);
    };
    painters[sec.key] = paint;
    paint();
    return el;
  }

  // ---------- 页面 ----------
  const nav = h('nav', { class: 'pf-nav' }, SECTIONS.map((s) => h('a', {
    href: '#/profile',
    onClick: (e) => {
      e.preventDefault();
      document.getElementById(`pf-${s.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  }, s.title)));
  const main = h('div', { class: 'pf-main' });
  const buildAll = () => {
    main.replaceChildren(
      h('div', { class: 'pf-bar' },
        status,
        h('span', { class: 'spacer' }),
        h('span', { class: 'muted small' }, '英文网申会用 EN 那一栏')),
      h('div', { class: 'pf-note' }, '以后的网申插件会用这里的内容填表。身份证号、护照号和密码不要存在这里。'),
      ...SECTIONS.map(renderSection));
  };
  buildAll();
  root.append(h('div', { class: 'pf' }, nav, main));

  const reloadFromStore = () => {
    profile = structuredClone(store.state.profile);
    buildAll();
  };
  main.addEventListener('focusout', () => {
    setTimeout(() => {
      if (dirty && !pending.size && !main.contains(document.activeElement)) {
        dirty = false;
        reloadFromStore();
      }
    }, 0);
  });
  const unsubscribe = store.subscribe((topic) => {
    if (topic !== 'load') return; // 自己保存触发的 'profile' 不需要重画
    if (pending.size || main.contains(document.activeElement)) dirty = true;
    else reloadFromStore();
  });
  const onBeforeUnload = (e) => {
    if (!pending.size) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  return () => {
    unsubscribe();
    window.removeEventListener('beforeunload', onBeforeUnload);
    for (const key of [...pending]) saveNow(key); // 切走页面前把还没保存的改动发出去
  };
}
```

- [ ] **Step 2: 档案样式**

```css file=web/css/profile.css
.pf { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 24px; max-width: 1140px; }
.pf-nav { position: sticky; top: 0; align-self: start; display: flex; flex-direction: column; gap: 2px; padding-top: 52px; }
.pf-nav a { padding: 5px 10px; border-radius: var(--radius-sm); color: var(--text-2); font-size: 13px; }
.pf-nav a:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
.pf-main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.pf-bar {
  position: sticky; top: -24px; z-index: 5;
  display: flex; align-items: center; gap: 10px;
  margin: -24px 0 -4px; padding: 16px 0 10px;
  background: var(--bg);
}
.pf-status { color: var(--text-3); font-size: 12.5px; }
.pf-status.pending, .pf-status.saving { color: var(--accent-text); }
.pf-status.saved { color: var(--ok); }
.pf-status.error { color: var(--danger); }
.pf-note { padding: 10px 14px; border-radius: var(--radius); background: var(--accent-soft); color: var(--accent-text); font-size: 13px; }

.pf-section { padding: 16px 18px 18px; scroll-margin-top: 56px; }
.pf-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.pf-head h2 { font-size: 15px; }
.pf-hint { margin: -4px 0 12px; }
.pf-entries { display: flex; flex-direction: column; gap: 14px; }
.pf-entry { padding: 12px 14px 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
.pf-entry-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.pf-entry-index {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--surface-3); color: var(--text-2);
  font-size: 11px; font-weight: 600;
}
.pf-entry-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 中英并排 */
.bi { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.bi-cell { position: relative; display: block; }
.bi-cell .input { padding-left: 32px; }
.bi-tag {
  position: absolute; left: 9px; top: 50%; transform: translateY(-50%);
  color: var(--text-3); font-size: 10.5px; font-weight: 600;
  pointer-events: none;
}
.bi.long .textarea { min-height: 116px; }

@media (max-width: 1000px) {
  .pf { grid-template-columns: 1fr; }
  .pf-nav { display: none; }
}
@media (max-width: 720px) {
  .bi { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: 在内置浏览器里验证**

Expected（打开 `#/profile`，此时 `data/profile.json` 还是空的）：
- 左侧分节导航，点「教育经历」平滑滚到对应分节
- 在「姓名」中文栏输入，顶部显示「有改动，马上自动保存…」→「已保存」；`cat data/profile.json` 能看到 `"name": { "zh": ... }`
- 教育经历点「添加」两次，第二条点「上移」后顺序对调；删除时先确认
- 在「工作内容」里输入中英文，下方字数统计实时变化
- 输入后 0.5 秒内切到别的页面再回来，内容没丢
- 在终端里手动改 `data/profile.json` 的 `preferredName`，几秒后页面自动刷新（光标不在输入框里时）

验证完清空测试内容：`rm data/profile.json`

- [ ] **Step 4: Commit**

```bash
git add web/js/views/profile.js web/css/profile.css
git commit -m "feat: bilingual profile editor with per-section autosave"
```

---
### Task 18: 简历页（版本 + 文件）

**Files:**
- Create: `web/js/views/resumes.js`
- Create: `web/css/library.css`（简历页和素材库共用）

- [ ] **Step 1: 简历视图**

```js file=web/js/views/resumes.js
// 简历：按版本管理（比如 产品线-中文 / 市场线-英文），每个版本可以放多个文件（docx + pdf），
// 显示被多少条投递用过。
import { store } from '../store.js';
import {
  h, icon, ensureCss, input, select, textarea, attempt, confirmDialog,
  emptyState, fileSize, timeAgo, toast, repaintWhenIdle,
} from '../ui.js';
import { fileUrl } from '../api.js';
import { TRACKS } from '../../shared/constants.js';

const ACCEPT = '.pdf,.doc,.docx,.pages,.txt,.png,.jpg';
const MAX_BYTES = 20 * 1024 * 1024;

export function render(root) {
  ensureCss('/css/library.css');
  const draw = () => root.replaceChildren(build());
  draw();
  const repaint = repaintWhenIdle(root, draw);
  return store.subscribe((topic) => {
    if (['load', 'resumes', 'applications'].includes(topic)) repaint();
  });
}

function build() {
  const { resumes, applications } = store.state;
  const head = h('div', { class: 'lib-head' },
    h('p', { class: 'muted' }, '每个版本可以放多个文件，比如 Word 原稿和导出的 PDF。网申上传一般用 PDF。'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn primary', type: 'button', onClick: addVersion }, icon('plus'), '新建版本'));
  if (!resumes.length) return h('div', null, head, emptyState('还没有简历版本'));
  const used = (id) => applications.filter((a) => a.resumeId === id).length;
  return h('div', null, head, h('div', { class: 'resume-grid' }, resumes.map((r) => resumeCard(r, used(r.id)))));
}

function addVersion() {
  attempt(() => store.create('resumes', { name: '新版本', track: '', lang: 'zh', notes: '', files: [] }));
}

async function removeVersion(r, used) {
  const msg = used
    ? `「${r.name}」被 ${used} 条投递用过。删除后这些投递会显示为未选择简历，文件也会一起删除。确定吗？`
    : `删除「${r.name}」和它的所有文件？`;
  if (await confirmDialog(msg, { okLabel: '删除', danger: true })) attempt(() => store.remove('resumes', r.id), '已删除');
}

function resumeCard(r, used) {
  const save = (patch) => attempt(() => store.update('resumes', r.id, patch));

  async function upload(files) {
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        toast(`${file.name} 超过 20 MB，没有上传`, { type: 'error' });
        continue;
      }
      await attempt(() => store.uploadResumeFile(r.id, file), `已上传 ${file.name}`);
    }
  }

  const picker = h('input', { type: 'file', multiple: true, accept: ACCEPT, hidden: true, onChange: (e) => upload([...e.target.files]) });
  const drop = h('div', {
    class: 'dropzone',
    tabindex: '0',
    role: 'button',
    onClick: () => picker.click(),
    onKeydown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        picker.click();
      }
    },
    onDragover: (e) => {
      e.preventDefault();
      drop.classList.add('over');
    },
    onDragleave: () => drop.classList.remove('over'),
    onDrop: (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      upload([...e.dataTransfer.files]);
    },
  }, icon('upload'), h('span', null, '拖入文件，或点击选择'));

  const files = (r.files || []).map((file) => {
    const stored = file.stored.replace(/^resumes\//, '');
    const del = async () => {
      if (await confirmDialog(`删除文件「${file.name}」？`, { okLabel: '删除', danger: true })) {
        attempt(() => store.deleteResumeFile(r.id, stored));
      }
    };
    return h('li', { class: 'file-row' },
      icon('file'),
      h('a', { class: 'file-name', href: fileUrl(file.stored), target: '_blank', rel: 'noopener', title: file.name }, file.name),
      h('span', { class: 'muted small' }, `${fileSize(file.size)} · ${timeAgo(file.uploadedAt)}`),
      h('button', { class: 'btn sm ghost icon-only', type: 'button', title: '删除文件', onClick: del }, icon('trash')));
  });

  return h('section', { class: 'card resume-card' },
    h('div', { class: 'resume-top' },
      input({ value: r.name || '', cls: 'resume-name', placeholder: '版本名称', onChange: (v) => save({ name: v.trim() || '未命名版本' }) }),
      h('button', { class: 'btn sm ghost icon-only danger', type: 'button', title: '删除这个版本', onClick: () => removeVersion(r, used) }, icon('trash'))),
    h('div', { class: 'row' },
      select(TRACKS, r.track || '', (v) => save({ track: v }), { placeholder: '赛道' }),
      select([{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }], r.lang || 'zh', (v) => save({ lang: v })),
      h('span', { class: 'spacer' }),
      h('span', { class: 'chip' }, `用于 ${used} 条投递`)),
    files.length ? h('ul', { class: 'file-list' }, files) : null,
    drop,
    picker,
    textarea({ value: r.notes || '', rows: 2, placeholder: '备注：这一版的侧重点、改了什么…', onChange: (v) => save({ notes: v }) }));
}
```

- [ ] **Step 2: 简历页和素材库共用样式**

```css file=web/css/library.css
.lib-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.lib-head p { margin: 0; }

/* ---------- 简历 ---------- */
.resume-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.resume-card { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; }
.resume-top { display: flex; align-items: center; gap: 8px; }
.resume-name { margin-left: -6px; padding-left: 6px; border-color: transparent; background: transparent; font-size: 15px; font-weight: 600; }
.resume-name:hover { border-color: var(--border); }
.resume-card .row .select { width: auto; }
.file-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.file-row { display: flex; align-items: center; gap: 8px; padding: 5px 6px; border-radius: var(--radius-sm); }
.file-row:hover { background: var(--surface-2); }
.file-row .icon { color: var(--text-3); }
.file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dropzone {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 14px;
  border: 1.5px dashed var(--border-strong); border-radius: var(--radius);
  color: var(--text-3); font-size: 13px;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s, color 0.12s;
}
.dropzone:hover, .dropzone:focus-visible, .dropzone.over { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-text); outline: none; }

/* ---------- 素材库 ---------- */
.lib-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.lib-search { width: 300px; }
.cat-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.cat-chip {
  height: 28px; padding: 0 12px;
  border: 1px solid var(--border); border-radius: 14px;
  background: var(--surface); color: var(--text-2);
  font-size: 12.5px; cursor: pointer;
}
.cat-chip.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-text); font-weight: 550; }
.cat-chip .n { margin-left: 4px; color: var(--text-3); }
.answer-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.answer-card { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; cursor: pointer; transition: box-shadow 0.12s, border-color 0.12s; }
.answer-card:hover { box-shadow: var(--shadow); border-color: var(--border-strong); }
.answer-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.answer-q { font-size: 14px; line-height: 1.45; }
.answer-text {
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  margin: 0; color: var(--text-2); font-size: 13px; white-space: pre-line;
}
.chip-x { padding: 0 0 0 4px; border: 0; background: none; color: inherit; font-size: 13px; cursor: pointer; }
.used-select { width: auto; min-width: 180px; height: 26px; font-size: 12px; }
.modal-foot .btn.danger:first-child { margin-right: auto; }
```

- [ ] **Step 3: 在内置浏览器里验证**

Expected（打开 `#/resumes`）：
- 点「新建版本」出现卡片；改名字后点别处，刷新仍在
- 把任意 PDF 拖进虚线框，文件出现在列表里，`data/resumes/` 下多了文件；点文件名在新标签页打开 PDF
- 删除文件、删除版本都先确认；删除版本后 `data/resumes/` 里对应文件也没了
- 控制台没有报错

- [ ] **Step 4: Commit**

```bash
git add web/js/views/resumes.js web/css/library.css
git commit -m "feat: resume versions with multi-file upload"
```

---

### Task 19: 素材库

**Files:**
- Create: `web/js/views/answers.js`

- [ ] **Step 1: 素材库视图**

```js file=web/js/views/answers.js
// 素材库：网申开放题的答案。按题型分类，带字数统计，记下用在了哪些投递。
import { store } from '../store.js';
import {
  h, icon, ensureCss, field, input, textarea, select, segmented, openModal,
  attempt, confirmDialog, copyText, emptyState, toast,
} from '../ui.js';
import { ANSWER_CATEGORIES } from '../../shared/constants.js';
import { textStats } from '../../shared/domain.js';

const PREF_KEY = 'jt.answers.filter';

// 常见题目，写新素材时作为输入建议
const QUESTION_SUGGESTIONS = {
  自我介绍: ['请做一个简短的自我介绍', 'Tell us about yourself.'],
  'Why 公司': ['你为什么想加入我们公司？', 'Why do you want to join us?'],
  'Why 岗位': ['为什么选择这个岗位 / 职能？', 'Why are you interested in this function?'],
  领导力: ['描述一次你带领团队达成目标的经历', 'Describe a time you led a team to achieve a goal.'],
  团队合作: ['描述一次你和意见不同的队友合作的经历', 'Tell us about a time you worked with someone who disagreed with you.'],
  '挑战/失败': ['描述一次你遇到的挫折，以及你从中学到了什么', 'Describe a setback and what you learned from it.'],
  创新: ['描述一次你提出新想法并推动落地的经历', 'Tell us about a time you came up with a new idea and made it happen.'],
  职业规划: ['你未来 3–5 年的职业规划是什么？', 'Where do you see yourself in five years?'],
  优缺点: ['你最大的优点和缺点是什么？', 'What are your greatest strengths and weaknesses?'],
  其他: [],
};

function loadFilter() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return { category: saved.category || '', lang: saved.lang || '', q: '' };
  } catch {
    return { category: '', lang: '', q: '' };
  }
}

function saveFilter(filter) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ category: filter.category, lang: filter.lang }));
  } catch {
    // 忽略
  }
}

const statsText = (text, lang) => {
  const s = textStats(text);
  return lang === 'en' ? `${s.words} words` : `${s.chars} 字`;
};

export function render(root) {
  ensureCss('/css/library.css');
  const filter = loadFilter();
  const chips = h('div', { class: 'cat-chips' });
  const list = h('div', { class: 'answer-grid' });
  const search = input({ placeholder: '搜索题目、回答、标签', onInput: (v) => { filter.q = v.trim().toLowerCase(); drawList(); } });
  const lang = segmented(
    [{ value: '', label: '全部' }, { value: 'zh', label: '中文' }, { value: 'en', label: 'English' }],
    filter.lang,
    (v) => { filter.lang = v; saveFilter(filter); drawList(); },
  );
  root.append(
    h('div', { class: 'lib-head' },
      h('p', { class: 'muted' }, '网申开放题写过一次就存下来，下次遇到同类题改一改就能用。'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary', type: 'button', onClick: () => openEditor(null, filter) }, icon('plus'), '新建素材')),
    h('div', { class: 'lib-toolbar' }, h('div', { class: 'lib-search' }, search), lang),
    chips,
    list);

  function drawChips() {
    const all = store.state.answers;
    const chip = (value, label, n) => h('button', {
      type: 'button',
      class: ['cat-chip', filter.category === value && 'on'],
      onClick: () => { filter.category = value; saveFilter(filter); draw(); },
    }, label, h('span', { class: 'n' }, String(n)));
    chips.replaceChildren(
      chip('', '全部', all.length),
      ...ANSWER_CATEGORIES.map((c) => chip(c, c, all.filter((a) => a.category === c).length)));
  }

  function drawList() {
    const items = store.state.answers.filter((a) => (!filter.category || a.category === filter.category)
      && (!filter.lang || a.lang === filter.lang)
      && (!filter.q || `${a.question} ${a.text} ${(a.tags || []).join(' ')}`.toLowerCase().includes(filter.q)))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    list.replaceChildren(...(items.length
      ? items.map((a) => answerCard(a, filter))
      : [emptyState(store.state.answers.length ? '没有符合条件的素材' : '还没有素材。先把最常被问的「为什么选择我们」写下来吧。')]));
  }

  const draw = () => {
    drawChips();
    drawList();
  };
  draw();
  return store.subscribe((topic) => {
    if (['load', 'answers', 'applications'].includes(topic)) draw();
  });
}

function answerCard(a, filter) {
  return h('article', {
    class: 'card answer-card',
    tabindex: '0',
    onClick: () => openEditor(a, filter),
    onKeydown: (e) => { if (e.key === 'Enter') openEditor(a, filter); },
  },
  h('div', { class: 'row' },
    h('span', { class: 'chip accent' }, a.category || '其他'),
    h('span', { class: 'chip' }, a.lang === 'en' ? 'English' : '中文'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn sm ghost', type: 'button', onClick: (e) => { e.stopPropagation(); copyText(a.text || ''); } }, icon('copy'), '复制')),
  h('h3', { class: 'answer-q' }, a.question || '（没填题目）'),
  h('p', { class: 'answer-text' }, a.text || '还没写回答'),
  h('div', { class: 'muted small' },
    statsText(a.text, a.lang),
    a.usedIn?.length ? ` · 用在 ${a.usedIn.length} 处` : '',
    a.tags?.length ? ` · ${a.tags.join(' / ')}` : ''));
}

function openEditor(answer, filter) {
  const draft = answer
    ? { ...answer, tags: [...(answer.tags || [])], usedIn: [...(answer.usedIn || [])] }
    : { category: filter.category || '自我介绍', lang: filter.lang || 'zh', question: '', text: '', tags: [], usedIn: [] };

  const stats = h('span', null);
  const updateStats = () => { stats.textContent = statsText(draft.text, draft.lang); };
  const suggestions = h('datalist', { id: 'jt-question-suggestions' });
  const fillSuggestions = () => suggestions.replaceChildren(...(QUESTION_SUGGESTIONS[draft.category] || []).map((q) => h('option', { value: q })));
  fillSuggestions();

  const usedWrap = h('div', { class: 'row wrap' });
  const paintUsed = () => {
    const apps = store.state.applications;
    const label = (a) => [a.company, a.position].filter(Boolean).join(' · ') || '未命名投递';
    usedWrap.replaceChildren(
      ...draft.usedIn.map((id) => {
        const a = apps.find((x) => x.id === id);
        return h('span', { class: 'chip' }, a ? label(a) : '已删除的投递',
          h('button', { type: 'button', class: 'chip-x', 'aria-label': '移除', onClick: () => { draft.usedIn = draft.usedIn.filter((x) => x !== id); paintUsed(); } }, '×'));
      }),
      select(apps.filter((a) => !draft.usedIn.includes(a.id)).map((a) => ({ value: a.id, label: label(a) })), '', (v) => {
        if (!v) return;
        draft.usedIn = [...draft.usedIn, v];
        paintUsed();
      }, { placeholder: '+ 记下用在哪条投递', cls: 'used-select' }));
  };
  paintUsed();

  const body = h('div', { class: 'form-grid' },
    field('分类', select(ANSWER_CATEGORIES, draft.category, (v) => { draft.category = v; fillSuggestions(); })),
    field('语言', segmented([{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }], draft.lang, (v) => { draft.lang = v; updateStats(); }), { tag: 'div' }),
    field('题目', h('div', null,
      input({ value: draft.question, placeholder: '题目原文（输入框里有常见题目可选）', list: 'jt-question-suggestions', onInput: (v) => { draft.question = v; } }),
      suggestions), { full: true }),
    field('回答', textarea({ value: draft.text, rows: 12, placeholder: '你的回答', onInput: (v) => { draft.text = v; updateStats(); } }), { full: true, hint: stats }),
    field('标签', input({
      value: draft.tags.join('，'),
      placeholder: '用逗号分隔，比如：快消，领导力',
      onInput: (v) => { draft.tags = v.split(/[,，]/).map((t) => t.trim()).filter(Boolean); },
    }), { full: true }),
    field('用在了', usedWrap, { full: true, tag: 'div' }));
  updateStats();

  const actions = [
    answer ? {
      label: '删除',
      danger: true,
      onClick: async (close) => {
        if (!(await confirmDialog('删除这条素材？', { okLabel: '删除', danger: true }))) return;
        close();
        attempt(() => store.remove('answers', answer.id), '已删除');
      },
    } : null,
    { label: '复制回答', onClick: () => copyText(draft.text) },
    { label: '取消', ghost: true, onClick: (close) => close() },
    {
      label: '保存',
      primary: true,
      onClick: async (close) => {
        if (!draft.text.trim() && !draft.question.trim()) {
          toast('题目和回答至少填一个', { type: 'error' });
          return;
        }
        const { id, createdAt, updatedAt, ...data } = draft;
        const saved = answer
          ? await attempt(() => store.update('answers', answer.id, data))
          : await attempt(() => store.create('answers', data));
        if (saved) close();
      },
    },
  ].filter(Boolean);
  openModal({ title: answer ? '编辑素材' : '新建素材', wide: true, body, actions });
}
```

- [ ] **Step 2: 在内置浏览器里验证**

Expected（打开 `#/answers`）：
- 点「新建素材」：分类选「Why 公司」后，题目输入框能下拉出常见题目；输入回答时字数实时变化，切到 English 后变成词数
- 保存后卡片出现在列表，分类标签上的数字 +1；点「复制」提示已复制
- 「用在了」里选一条投递（先按 T12 Step 3 造一条），保存后卡片显示「用在 1 处」
- 按分类、语言筛选和搜索都生效；刷新后分类和语言筛选还在
- 编辑弹窗左下角的「删除」能删掉素材；控制台没有报错

验证完删掉测试素材和测试投递。

- [ ] **Step 3: Commit**

```bash
git add web/js/views/answers.js
git commit -m "feat: answer library with categories, stats and usage tracking"
```

---
### Task 20: 设置页

导入功能不做（YAGNI）：本地恢复直接从 `data/backups/` 复制文件即可；以后上线时再做线上导入。

**Files:**
- Create: `web/js/views/settings.js`

- [ ] **Step 1: 设置视图**

```js file=web/js/views/settings.js
// 设置：没动静天数、周目标、时区、导出数据、日历和插件说明、版本信息。
import { store } from '../store.js';
import { api } from '../api.js';
import { h, icon, field, input, select, segmented, attempt, toast, repaintWhenIdle } from '../ui.js';
import { todayInZone, formatZoned } from '../../shared/time.js';

const TIMEZONES = [
  ['Asia/Shanghai', '北京'], ['Asia/Hong_Kong', '香港'], ['Asia/Singapore', '新加坡'], ['Asia/Tokyo', '东京'],
  ['America/Los_Angeles', '洛杉矶'], ['America/New_York', '纽约'], ['America/Chicago', '芝加哥'],
  ['Europe/London', '伦敦'], ['Europe/Paris', '巴黎'], ['Australia/Sydney', '悉尼'],
];

export function render(root) {
  const draw = () => root.replaceChildren(build());
  draw();
  const repaint = repaintWhenIdle(root, draw);
  return store.subscribe((topic) => {
    if (topic === 'load' || topic === 'settings') repaint();
  });
}

function card(title, ...body) {
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, title)),
    h('div', { class: 'card-body' }, body));
}

function tzOptions(current) {
  const options = TIMEZONES.map(([value, label]) => ({ value, label: `${label}（${value}）` }));
  if (current && !TIMEZONES.some(([z]) => z === current)) options.push({ value: current, label: current });
  return options;
}

async function exportAll() {
  const { version, ...data } = await api.get('/api/state');
  const json = JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = h('a', { href: url, download: `job-tracker-${todayInZone(store.state.settings.homeTz)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function build() {
  const s = store.state.settings;
  const save = (patch) => attempt(() => store.patchSettings(patch));
  const num = (key, min, max) => input({
    type: 'number',
    value: String(s[key] ?? ''),
    onChange: (v) => {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < min || n > max) {
        toast(`请填 ${min}–${max} 之间的整数`, { type: 'error' });
        return;
      }
      save({ [key]: n });
    },
  });
  const tzSelect = (key, labelKey) => select(tzOptions(s[key]), s[key], (v) => {
    const known = TIMEZONES.find(([z]) => z === v);
    const patch = { [key]: v, ...(known ? { [labelKey]: known[1] } : {}) };
    if (s.eventInputTz === s[key]) patch.eventInputTz = v; // 默认录入时区跟着一起改
    save(patch);
  });
  const nowIso = new Date().toISOString();
  const about = h('p', { class: 'muted small', style: { margin: 0 } }, '秋招 Tracker');
  api.get('/api/ping').then((p) => { about.textContent = `秋招 Tracker v${p.version} · 本地服务运行中`; }).catch(() => {});

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '760px' } },
    card('提醒',
      h('div', { class: 'form-grid' },
        field('多少天没进展算「没动静」', num('staleDays', 1, 90), { hint: '默认 14 天。已经约好下一步日程的投递不算。' }),
        field('每周投递目标', num('weeklyGoal', 0, 100), { hint: '概览页会显示本周进度；填 0 表示不设目标。' }))),
    card('时区',
      h('div', { class: 'form-grid' },
        field('我所在的时区', tzSelect('homeTz', 'homeTzLabel')),
        field('显示名', input({ value: s.homeTzLabel, onChange: (v) => save({ homeTzLabel: v.trim() || s.homeTzLabel }) })),
        field('招聘方的时区', tzSelect('targetTz', 'targetTzLabel')),
        field('显示名', input({ value: s.targetTzLabel, onChange: (v) => save({ targetTzLabel: v.trim() || s.targetTzLabel }) })),
        field('录入日程时默认按', segmented(
          [{ value: s.targetTz, label: s.targetTzLabel }, { value: s.homeTz, label: s.homeTzLabel }],
          s.eventInputTz,
          (v) => save({ eventInputTz: v }),
        ), { tag: 'div', full: true }),
        h('div', { class: 'field full muted small' },
          `现在：${s.homeTzLabel} ${formatZoned(nowIso, s.homeTz)} · ${s.targetTzLabel} ${formatZoned(nowIso, s.targetTz)}`))),
    card('数据',
      h('p', { style: { marginTop: 0 } }, '所有数据都在 job-tracker/data/ 文件夹里，只存在这台电脑上。同一个文件 30 分钟内最多自动备份一次，放在 data/backups/，每个文件保留最近 30 份。'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', type: 'button', onClick: () => attempt(exportAll, '已导出') }, icon('download'), '导出全部数据（JSON）')),
      h('p', { class: 'muted small', style: { marginBottom: 0 } },
        '导出文件里没有简历原件和 JD 快照（它们在 data/resumes/ 和 data/jd/）。要找回旧数据，把 data/backups/ 里对应的文件复制回 data/，或者直接让 Claude 帮你恢复。')),
    card('日历',
      h('p', { style: { margin: 0 } }, '在「日程」页可以把所有面试、测评和网申截止订阅到苹果日历。 ',
        h('a', { href: '#/calendar' }, '去日程页'))),
    card('Chrome 插件',
      h('p', { class: 'muted', style: { margin: 0 } }, '网申自动填写和一键收藏岗位的插件在下一阶段提供，会直接用「档案」里的内容。')),
    card('关于', about));
}
```

- [ ] **Step 2: 在内置浏览器里验证**

Expected（打开 `#/settings`）：
- 周目标改成 12 后点别处，概览页本周卡片变成「/ 12」；填 500 提示范围错误且不保存
- 「我所在的时区」改成纽约，显示名自动变成「纽约」，侧边栏时钟随之变化；改回洛杉矶
- 「导出全部数据」下载一个 JSON，里面有 profile / applications / answers / resumes / settings
- 关于里显示 `v1.0.0 · 本地服务运行中`；控制台没有报错

- [ ] **Step 3: Commit**

```bash
git add web/js/views/settings.js
git commit -m "feat: settings for reminders, timezones and data export"
```

---
### Task 21: 从现有简历导入档案和简历版本（只写 `data/`，不提交）

这一步涉及个人信息，所以计划里只写做法，不写具体内容；所有中间文件放在会话的 scratchpad 里，不进仓库。

**Files:**
- 通过 API 写入：`data/profile.json`、`data/resumes.json`、`data/resumes/*`、`data/answers.json`

- [ ] **Step 1: 提取 4 份简历的文字**

```bash
DIR=~/.claude/skills/industry-resume-toolkit/outputs
OUT="$SCRATCH/resume-text"   # $SCRATCH = 本会话的 scratchpad 目录
mkdir -p "$OUT"
for f in "$DIR"/*.docx; do textutil -convert txt -stdout "$f" > "$OUT/$(basename "${f%.docx}").txt"; done
ls "$OUT"
```
Expected: 4 个 `.txt`（产品线中 / 英、市场线中 / 英）

- [ ] **Step 2: 按 spec §3.1 的结构整理出 `$SCRATCH/profile.json`**

规则：
- 只用简历里写了的事实，不补、不改写、不润色；简历里没有的字段留空（出生日期、籍贯、户口所在地、政治面貌、民族、微信、期望薪资等由用户自己补）
- 中文栏取自中文简历，English 栏取自英文简历；某一项英文简历里没有，就把 `en` 留空
- 日期统一成 `YYYY-MM`；数组顺序和简历一致（最高学历在前）
- 实习单位放 `work`；学生组织（学生运营的公关公司、社团）放 `activities`
- 两条线的经历描述写法不同：档案里统一用最近修改的市场线版本，产品线版本仍在简历文件里
- 每个条目的 `id` 用 `node -e "import('./shared/domain.js').then(m=>console.log(m.newId('edu')))"` 生成（前缀按 §3.1）
- 写完核对一遍：记忆里标记过「不可再写进简历」的两个数字不能出现在任何字段里

- [ ] **Step 3: 写入档案**

```bash
node -e "const b=require('fs').readFileSync(process.argv[1],'utf8');fetch('http://127.0.0.1:7317/api/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:b}).then(r=>r.json()).then(p=>console.log('education',p.education.length,'work',p.work.length,'projects',p.projects.length,'activities',p.activities.length))" "$SCRATCH/profile.json"
```
Expected: 打印出的各类条数和简历一致

- [ ] **Step 4: 建 4 个简历版本并上传原件**

```bash
API=http://127.0.0.1:7317/api
DIR=~/.claude/skills/industry-resume-toolkit/outputs
new_version() {
  curl -s -X POST "$API/resumes" -H 'Content-Type: application/json' \
    -d "{\"name\":\"$1\",\"track\":\"$2\",\"lang\":\"$3\",\"notes\":\"\",\"files\":[]}" |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id))'
}
upload() {
  local name; name=$(node -e 'console.log(encodeURIComponent(require("path").basename(process.argv[1])))' "$2")
  curl -s -o /dev/null -w "%{http_code} $2\n" -X POST "$API/resumes/$1/files" \
    -H 'Content-Type: application/octet-stream' -H "X-Filename: $name" --data-binary @"$2"
}
upload "$(new_version 产品线-中文 产品 zh)" "$(ls "$DIR"/*简历-改后.docx)"
upload "$(new_version 产品线-英文 产品 en)" "$(ls "$DIR"/*Resume-改后.docx)"
upload "$(new_version 市场线-中文 市场 zh)" "$(ls "$DIR"/*简历-市场岗.docx)"
upload "$(new_version 市场线-英文 市场 en)" "$(ls "$DIR"/*Resume-Marketing.docx)"
```
Expected: 4 行 `201 …docx`

- [ ] **Step 5: 把两条线的个人简介存进素材库**

中文、英文 × 产品线、市场线，共 4 条：分类「自我介绍」，语言对应，标签写「产品线」或「市场线」，题目写「个人简介（简历版）」，回答原样取自简历。用 `POST /api/answers` 写入。档案里的「自我评价」放市场线中英版本。

- [ ] **Step 6: 在内置浏览器里核对**

Expected:
- `#/profile`：姓名、联系方式、2 段教育、各段实习 / 经历、项目、技能、语言都在，中英两栏对得上
- `#/resumes`：4 个版本，每个有 1 个 docx，点开能下载
- `#/answers`：「自我介绍」下 4 条
- 抽查 3 个字段和原简历逐字一致

（`data/` 被 .gitignore 忽略，这一步不提交。）

---

### Task 22: README 与 CLAUDE.md

**Files:**
- Create: `README.md`
- Create: `CLAUDE.md`

- [ ] **Step 1: 用户说明**

````markdown file=README.md
# 秋招 Tracker

在自己电脑上运行的秋招投递管理工具：个人档案（中英对照）、简历版本、投递看板、日程与面试复盘、网申素材库。数据只存在本机的 `data/` 文件夹里。

## 启动和停止

- **启动**：双击 `启动Tracker.command`，浏览器会打开 <http://127.0.0.1:7317>。之后可以关掉 Terminal 窗口，Tracker 会继续在后台运行。
- **停止**：双击 `停止Tracker.command`。
- 需要 Node.js 20 或更高版本（`node --version` 查看）。

第一次双击 `.command` 文件时，如果 macOS 提示无法打开，在「系统设置 → 隐私与安全性」里点「仍要打开」，或者右键 → 打开。

## 页面

| 页面 | 用途 |
|---|---|
| 概览 | 需要处理的事、未来 7 天的日程、投递漏斗、每周投递量 |
| 投递 | 看板（拖动卡片改阶段）/ 列表；点卡片看详情：日程、复盘、JD 快照、时间线 |
| 日程 | 所有测评、面试、网申截止；同时显示两个时区；可订阅到苹果日历 |
| 档案 | 网申要填的个人信息，中英两栏，自动保存 |
| 简历 | 各个版本的简历文件 |
| 素材库 | 网申开放题的答案，带字数统计 |
| 设置 | 没动静提醒天数、周目标、时区、导出数据 |

快捷键：`n` 新建投递，`/` 搜索，`Esc` 关闭弹窗。

## 订阅到苹果日历

「日程」页点「订阅」。订阅对话框里记得把「移除：提醒」取消勾选，不然日历不会提醒。自动刷新选每 15 分钟或每小时。

## 数据和备份

- 所有数据在 `data/`：`applications.json`（投递）、`profile.json`（档案）、`answers.json`（素材库）、`resumes.json` + `resumes/`（简历）、`jd/`（JD 快照）
- 同一个文件 30 分钟内最多自动备份一次，放在 `data/backups/`，保留最近 30 份。要恢复就把备份文件复制回 `data/` 并改回原文件名
- 「设置」页可以导出全部数据（JSON）
- 不要在这里存身份证号、护照号和密码

## 和 Claude 一起用

在 Life Agent 里直接说就行，比如：

- 「今天投了雀巢 Marketing MT，用的市场线英文简历」
- 「宝洁约了周三下午两点群面」
- 「这是 XX 的 JD，帮我建一条记录，再对照简历看看匹配度」
- 「这周有哪些截止和面试？」「哪些投递很久没动静了？」

Claude 会按 `CLAUDE.md` 里的规则直接修改数据，网页开着的话几秒内会自动刷新。

## 常见问题

- **页面打不开**：Tracker 没在运行，双击 `启动Tracker.command`。
- **提示端口被占用**：已经有一个 Tracker 在运行，直接打开 <http://127.0.0.1:7317>；不是的话先双击 `停止Tracker.command`。
- **页面报「xxx.json 不是有效的 JSON」**：数据文件被改坏了。按提示修好，或者从 `data/backups/` 恢复。

## 开发

- `npm test` 运行测试；`npm start` 前台启动服务
- 零依赖、无构建：`server/`（Node 服务）、`shared/`（网页和服务端共用的业务规则）、`web/`（原生 JS 网页）
- 设计文档：`docs/superpowers/specs/2026-09-20-job-tracker-design.md`
````

- [ ] **Step 2: 给以后的 Claude 的说明**

````markdown file=CLAUDE.md
# 秋招 Tracker（给 Claude）

本地秋招投递管理工具：Node 零依赖服务 + 原生 JS 网页。设计见 `docs/superpowers/specs/2026-09-20-job-tracker-design.md`，字段定义以 spec §3 为准。

## 运行与测试

- 服务：`http://127.0.0.1:7317`（双击 `启动Tracker.command` 或 `npm start`）；`curl -s 127.0.0.1:7317/api/ping` 判断是否在运行
- 测试：`npm test`

## 数据（`data/`，含个人信息，已被 git 忽略）

| 文件 | 内容 |
|---|---|
| `profile.json` | 个人档案；中英字段是 `{ "zh", "en" }` |
| `applications.json` | 投递数组（含 events 日程、timeline 时间线） |
| `answers.json` | 素材库 |
| `resumes.json` + `resumes/` | 简历版本和原件 |
| `settings.json` | 设置，缺省值见 `shared/constants.js` 的 `DEFAULT_SETTINGS` |
| `jd/<appId>.md` | JD 快照 |
| `backups/` | 自动备份 |

## 修改数据

**服务在运行时一律走 API**（会自动写时间线、补投递日期、做校验、做备份）：

```bash
API=http://127.0.0.1:7317/api
# 新建投递
curl -s -X POST $API/applications -H 'Content-Type: application/json' \
  -d '{"company":"雀巢","position":"Marketing MT","track":"市场","companyType":"外企","stage":"applied"}'
# 改阶段 / 状态
curl -s -X PATCH $API/applications/<id> -H 'Content-Type: application/json' -d '{"stage":"interview"}'
# 保存 JD 快照
curl -s -X PUT $API/applications/<id>/jd -H 'Content-Type: application/json' -d '{"text":"..."}'
```

加日程：先 `GET $API/applications/<id>`，在 `events` 里追加一项后整体 `PATCH {"events":[...]}`。日程格式：

```json
{ "id": "evt_xxxxxxxxxx", "type": "面试", "title": "二面", "at": "2026-09-25T14:00:00+08:00",
  "tz": "Asia/Shanghai", "durationMin": 60, "location": "", "done": false, "review": null }
```

**服务没运行时**可以直接改 JSON，但必须自己做到服务会做的事：

- 新 id：`<前缀>_<10 位 [0-9a-z]>`，前缀 `app` / `evt` / `tl` / `ans` / `res` / `edu` / `work` …（`shared/domain.js` 的 `newId`）
- 改 `stage` 或 `status` 时，在 `timeline` 追加 `{ "id", "at": <UTC ISO>, "type": "stage" | "status", "from", "to", "text": "" }`
- 从 `wishlist` 进入之后的阶段、且 `appliedAt` 为空时，填当天日期（按 `settings.homeTz`）
- 更新 `updatedAt`；保持文件是合法 JSON（写坏了服务会拒绝写入，可从 `backups/` 恢复）

取值：`stage` ∈ wishlist / applied / assessment / interview / final / offer；`status` ∈ active / rejected / withdrawn / accepted / declined；`priority` ∈ 1 / 2 / 3；日程类型见 `EVENT_TYPES`。

## 规则

- 时间：用户说的面试时间没带时区时，按 `settings.eventInputTz` 理解，并在回复里把两个时区都说出来
- 绝不存身份证号、护照号、密码；`account` 只放注册用的邮箱或手机号
- 代码、提交信息、`docs/` 里不写任何个人信息（以后可能公开部署）
- 保持零依赖、无构建；数据读写只放在 `server/store.js`；业务规则放 `shared/`，网页和服务端共用
````

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: user readme and claude guide"
```

---

### Task 23: 端到端验证与收尾

- [ ] **Step 1: 全部测试**

Run: `npm test`
Expected: 全部通过，0 失败

- [ ] **Step 2: 用真实数据走一遍主要流程（内置浏览器）**

1. 重启服务：`bash 停止Tracker.command; bash 启动Tracker.command < /dev/null`
2. 新建投递：粘贴一段示例 JD（公司名用「示例公司」），确认自动识别，保存
3. 看板上把它拖到「已投递」→「测评/笔试」；详情里加一个明天北京时间 10:00 的「笔试」，确认显示对应的洛杉矶时间
4. 概览：「需要处理」出现「笔试还剩 N 小时」，漏斗和本周投递数更新
5. 日程页能看到它；`curl -s http://127.0.0.1:7317/calendar.ics | grep 示例公司` 有输出
6. 档案页改一个字段 → 已保存 → 在终端改 `data/settings.json` 的 `weeklyGoal`，几秒后概览自动更新
7. 深色模式（`resize_window` 的 `colorScheme: dark`）和 900px 窄屏各截一张图看一遍：没有重叠、裁切和看不清的文字
8. `read_console_messages` 只看 error：没有报错
9. 删除「示例公司」这条投递

- [ ] **Step 3: 最终提交**

```bash
git status --short   # 应该是干净的；data/ 不在里面
git log --oneline | head -30
```

- [ ] **Step 4: 更新 Claude 的记忆**

在记忆目录新增 `job-tracker.md`（type: project）：tracker 的位置、启动方式、数据文件、「优先走 API」的规则，并链接 `[[job-search-2027]]`；在 `MEMORY.md` 加一行索引。顺手修正 `job-search-2027.md` 里过时的 `profile.json` 位置（实际在 skill 根目录）。
