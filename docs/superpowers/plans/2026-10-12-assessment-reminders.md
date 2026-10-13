# 测评 DDL 提醒（M3）实施计划

> 设计见 `docs/superpowers/specs/2026-10-12-assessment-reminders-design.md`。分支 `m3-assessment-reminders`。
> 每个任务：先写测试 → 跑到失败 → 实现 → 跑过 → 提交。提交信息结尾带 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`。

**目标**：粘贴邀请邮件 → 自动算出截止时间 → 进日历（两次闹钟）→ 在 Tracker 里一直可见直到做完。

**技术栈**：沿用现状 —— Node ≥20 零依赖、`node --test`、原生 JS 网页、业务规则放 `shared/` 供网页和服务端共用。

---

## 文件一览

| 文件 | 职责 |
|---|---|
| `shared/invite.js`（新） | 邮件正文 → `{type, deadline, basis, durationMin, link, company, confident}`，纯函数 |
| `shared/domain.js` | `eventMode()` 新增；`actionItems` 去掉 48 小时门槛，改成倒计时 / 过期 |
| `shared/ics.js` | 单个闹钟 → 多个闹钟；截止型事件给两次 |
| `web/js/components/inviteForm.js`（新） | 粘贴 → 预览 → 保存的弹窗 |
| `web/js/views/calendar.js` | 「粘贴邀请」入口；订阅卡片补手机说明 |
| `web/js/views/dashboard.js` | 顶部「今明两天」条 + 「粘贴邀请」入口 |
| `tests/invite.test.js`（新）、`tests/domain.test.js`、`tests/ics.test.js` | 单测 |

---

## Task 1：事件分「截止型 / 会议型」，概览一直提醒

**文件**：`shared/domain.js`、`tests/domain.test.js`

- [ ] **Step 1：写测试**

在 `tests/domain.test.js` 加：

1. `eventMode({type:'测评'})` → `'deadline'`；`eventMode({type:'AI面'})` → `'meeting'`；`eventMode({type:'AI面', mode:'deadline'})` → `'deadline'`（老数据按类型推断，新数据以 `mode` 为准）
2. 截止型事件剩 5 天：`actionItems` 有一条 `kind:'due'`、文案含「还剩 5 天」，且 `rank` 与网申截止同级（2）
3. 剩 9 小时：文案含「还剩 9 小时」，`rank` 0
4. 已过期 2 天且 `done:false`：文案含「已过期 2 天」，`rank` 0
5. `done:true` 的截止型事件：不出现
6. 带 `windowStart`（5 天前）：文案含「窗口共 5 天」
7. 会议型事件行为不变（今天 / 明天才提示）

- [ ] **Step 2：跑测试确认失败** `npm test`

- [ ] **Step 3：实现**

```js
export const eventMode = (ev) => ev.mode || (TEST_TYPES.has(ev.type) ? 'deadline' : 'meeting');
```

`actionItems` 里原来的 `TEST_TYPES.has(ev.type) && at - nowMs <= 48*HOUR` 分支换成：按 `eventMode(ev) === 'deadline' && !ev.done` 处理，剩余 > 48 小时报「还剩 N 天」（rank 2），≤ 48 小时报「还剩 N 小时」（rank 0），已过期报「已过期 N 天」（rank 0）。`kind` 统一用 `'due'`。有 `windowStart` 时追加「窗口共 N 天」。

- [ ] **Step 4：跑测试** `npm test` 全过

- [ ] **Step 5：提交** `fix(domain): keep showing assessment deadlines until done`

---

## Task 2：日历给截止型事件两次闹钟

**文件**：`shared/ics.js`、`tests/ics.test.js`

- [ ] **Step 1：写测试**

1. 会议型事件：仍然只有一个 `TRIGGER:-PT60M`
2. 截止型事件（截止 14:00）：两个 `VALARM`，一个 `-PT1440M`，一个等于「截止当天 09:00（homeTz）到截止时间」的分钟数（14:00 → 300 分钟）
3. 截止时间在凌晨（02:42）：第二个闹钟退化成 `-PT120M`
4. 网申截止事件不变（`-PT1440M`）

- [ ] **Step 2：跑测试确认失败**

- [ ] **Step 3：实现**

`vevent({..., alarms})` 接收数组，循环生成 `VALARM`。`buildCalendar` 里：

```js
const mode = eventMode(ev);
const alarms = mode === 'deadline' ? deadlineAlarms(start, s.homeTz) : [60];
```

`deadlineAlarms(start, tz)`：算出截止当天 09:00（该时区）的时刻，相差分钟数 > 0 就返回 `[1440, 差值]`，否则 `[1440, 120]`。去重并按从大到小排。

- [ ] **Step 4：跑测试** 全过

- [ ] **Step 5：提交** `feat(ics): two alarms for deadline-style events`

---

## Task 3：邮件解析

**文件**：`shared/invite.js`（新）、`tests/invite.test.js`（新）

- [ ] **Step 1：写测试**（用真实邮件的句式，公司名一律写「示例公司」）

| 输入要点 | 期望 |
|---|---|
| 「请在收到本邮件后的5天内完成，逾期面试链接将自动失效」，收到 2026-10-12T02:42-07:00 | deadline = 2026-10-17T02:42-07:00，`confident: true`，`basis` 含「5天内」 |
| 「请您抽出宝贵时间，在**五天内**完成测评」（中文数字） | 收到时间 + 5×24h |
| 「complete within 3 business days」，收到周日 2026-10-11 | 2026-10-14 18:00（homeTz），跳过周末 |
| 「请于 2026年10月15日 24:00 前完成」 | 2026-10-15 23:59（eventInputTz） |
| 同时写「5 天内」和「10月13日截止」 | 取更早的 10-13 |
| 「本次 AI 面试预计用时 30 分钟」 | `durationMin: 30`、`type: 'AI面'` |
| 「16 games … about 35-40 minutes」 | `durationMin: 40`、`type: '测评'`（pymetrics / assessment 命中） |
| 「测试时长约为60分钟」 | `durationMin: 60`、`type: '测评'` |
| 正文含考试链接和公司官网链接 | `link` 取含 exam/invite/assess 的那个 |
| 正文出现「达能」且投递记录里有「达能」 | `company: '达能'` |
| 正文没有任何期限 | `deadline: ''`、`confident: false` |

- [ ] **Step 2：跑测试确认失败**

- [ ] **Step 3：实现 `parseInvite(text, {receivedAt, settings, companies})`**

拆成小函数，便于单测：`zhNumber()`、`relativeDeadline()`、`businessDeadline()`、`absoluteDeadline()`、`guessDuration()`、`guessType()`、`pickLink()`、`matchCompany()`。按 spec §4 的规则实现，认不出就留空、不猜。

- [ ] **Step 4：跑测试** 全过

- [ ] **Step 5：提交** `feat(invite): parse assessment invitation emails`

---

## Task 4：粘贴邀请的界面

**文件**：`web/js/components/inviteForm.js`（新）、`web/js/views/calendar.js`、`web/js/views/dashboard.js`

- [ ] **Step 1：弹窗**

用现有 `openModal`（见 `components/eventForm.js` 的写法）。两步：

1. 粘贴框（textarea，autofocus）+「识别」按钮；也支持粘贴后自动识别
2. 预览表单：类型、截止时间（`datetime-local` + 时区 segmented，和 eventForm 一致）、时长、链接、挂到哪条投递（select，匹配到的排最前，末项「＋ 新建一条投递」）、勾选「把阶段推进到测评」（匹配到且当前阶段更早时默认勾上）
   - 下方显示依据：`依据：「请在收到本邮件后的5天内完成」`，以及换算到另一个时区的时间
   - 没认出期限时，时间一栏标红提示「没认出期限，请手填」

保存：

- 挂现有记录：`PATCH /api/applications/:id`，`events` 追加 `{id: newId('evt'), type, mode:'deadline', at, tz, durationMin, location: link, windowStart, basis, done:false, review:null}`；勾了推进阶段就一起 `PATCH {stage:'assessment'}`
- 新建：先 `POST /api/applications`（`stage:'assessment'`、`channel:'官网'`），再 `PATCH` 加日程
- 保存后 toast「已加入日程 · 10/14 12:07（北京）」，并刷新 store

- [ ] **Step 2：入口**

- `web/js/views/calendar.js` 的页头加按钮「粘贴邀请」
- `web/js/views/dashboard.js` 的「今明两天」条右侧也放一个

- [ ] **Step 3：验证**（内置浏览器）

用达能那封邮件的脱敏文本走一遍「挂到现有记录」，用一封编造的新公司邮件走一遍「新建记录」，确认 Tracker 里出现日程、阶段推进正确。

- [ ] **Step 4：提交** `feat(web): paste an invitation email to create a deadline`

---

## Task 5：概览「今明两天」

**文件**：`web/js/views/dashboard.js`、`web/css/dashboard.css`

- [ ] **Step 1：实现**

`build()` 里在 `kpiRow` 之前插一条 `digestBar(apps, settings, now)`：取 `actionItems` 结果里 `kind` 属于 `due`/`meeting`/`deadline`/`overdue` 且发生在今明两天的，按时间排序，渲染成一行横向列表（点击打开对应投递），右侧放「粘贴邀请」按钮。没有内容时整条不渲染。

- [ ] **Step 2：验证** 内置浏览器里确认娇韵诗那条出现在顶部，样式在深浅色下都正常

- [ ] **Step 3：提交** `feat(web): today and tomorrow bar on the dashboard`

---

## Task 6：文档

**文件**：`web/js/views/calendar.js`（订阅卡片）、`README.md`、`CLAUDE.md`、spec

- [ ] **Step 1：订阅卡片补手机说明**

现有提示「面试前 1 小时提醒，测评和网申截止前 1 天提醒」改成「面试前 1 小时；测评和网申截止前 1 天，外加截止当天早上再响一次」。再加一条：

> 手机上收不到：订阅地址是本机地址，iPhone 连不上。要在手机上提醒，点「下载 .ics」，用邮件发给自己，在 iPhone 上打开并加入 iCloud 日历。

- [ ] **Step 2：README 和 CLAUDE.md**

README 的「订阅到苹果日历」一节补上手机说明和两次闹钟；CLAUDE.md 的日程格式补 `mode` / `windowStart` / `basis` 三个字段。

- [ ] **Step 3：提交** `docs: explain phone reminders and the new event fields`

---

## Task 7：收尾

- [ ] **Step 1**：`npm test` 全过
- [ ] **Step 2**：把三条已有测评日程补上 `mode: 'deadline'` 和 `windowStart`（走 API）
- [ ] **Step 3**：带用户订阅日历（Mac 一次、手机一次），确认娇韵诗那条在日历里、闹钟在
- [ ] **Step 4**：更新记忆 `job-tracker.md`；用 finishing-a-development-branch 合并回 main
