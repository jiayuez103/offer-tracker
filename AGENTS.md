# 秋招 Tracker（给编码助手）

本地秋招投递管理工具：Node 零依赖服务 + 原生 JS 网页。设计见 `docs/superpowers/specs/2026-09-20-job-tracker-design.md`，字段定义以 spec §3 为准。

## 运行与测试

- 服务：`http://127.0.0.1:7317`（双击 `启动Tracker.command` 或 `npm start`）；`curl -s 127.0.0.1:7317/api/ping` 判断是否在运行
- **改了 `server/` 或 `shared/` 的代码必须重启服务**（`./停止Tracker.command && ./启动Tracker.command`），否则跑的还是旧代码：接口 404、ICS 少闹钟这类「明明改了却没生效」都是这个原因。网页和插件的代码不用重启，刷新页面即可
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
| `ai/<appId>.json` | AI 诊断、面试题和对话的缓存 |

## 修改数据

**服务在运行时一律走 API**（会自动写时间线、补投递日期、做校验、做备份）：

```bash
API=http://127.0.0.1:7317/api
# 新建投递
curl -s -X POST $API/applications -H 'Content-Type: application/json' \
  -d '{"company":"示例公司","position":"Marketing MT","track":"市场","companyType":"外企","stage":"applied"}'
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

测评 / 笔试 / AI 面这类「在某个时间之前自己找时间做完」的，再加三个字段（见 `shared/invite.js` 和 M3 设计文档）：

```json
{ "mode": "deadline", "windowStart": "<收到邀请的时刻 UTC ISO>", "basis": "请在收到本邮件后的5天内完成面试" }
```

`mode` 缺省按类型推断（`测评`/`笔试`/`AI面` 是 `deadline`，其余是 `meeting`）。截止型事件在概览里一直显示倒计时直到 `done`，日历会响两次闹钟。用户发来测评邀请邮件时，用 `parseInvite()` 算截止时间，别自己心算。

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
- 项目规则只写在 `AGENTS.md` 这一份；`CLAUDE.md` 只是用 `@AGENTS.md` 引用它，别在那里另写规则
- README 有中英两份：`README.md`（中文，GitHub 默认显示）和 `README.en.md`（英文），顶部互相链接；改一份要同步改另一份
- 保持零依赖、无构建；数据读写只放在 `server/store.js`；业务规则放 `shared/`，网页和服务端共用

## 界面风格（web/ 和插件侧边栏）

- **少写字，让布局来解释**（Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.）
  - 不加副标题、说明段落、标题栏里的提示小字、数字下面的注释行；位置、分组、标题栏、图标、色块、留白能说明的，就不再用文字说一遍
  - 计数写进窗口标题（「需要处理 · 5」），不另起一行「共 N 条」；同一个操作只出现一次（菜单栏已有「新建投递」「粘贴测评邀请」，页面里不再放）——空状态例外，见下一条
  - 空状态放下一步的按钮（空看板里的「记第一条投递」、空日程里的「粘贴测评邀请」），不写引导段落；没有数据的卡片直接不显示
  - 自动识别 / 自动填好的结果用底色表示，不写「识别到了：…」；颜色图例用色块，不写「绿框是…」
  - 生成时间、文件大小这类次要信息放进悬停提示（`title`），不常驻在页面上
  - 只留：字段名、按钮、窗口标题、数据本身、出错信息，以及页面上看不出来、做错了就会出问题的提示（比如订阅日历时要取消勾选「移除：提醒」）
- **第一次进来的人要答得出「下一步点哪里，点了会发生什么」**：每个页面（尤其是还没有数据时）只靠布局和按钮回答这两个问题。答不出来就先改布局和按钮文案，不加说明文字补救
  - 布局：下一步放在视线落点（空状态里的唯一按钮、编号排出先后、下一步用主按钮高亮、做完的打勾）；能点开的行在行尾放 ›，能拖的卡片用抓手光标
  - 按钮文案：动词 + 对象，读出来就是点了以后的结果，比如「记第一条投递」「按 JD 生成改写建议」「订阅到日历」「记一次跟进」；不用「我跟进了」这类陈述句，也不用「开始诊断」「识别」这类说不清结果的词
  - 能省掉的步骤就省掉：粘进邮件就自动识别，不另放「识别」按钮；新建之后马上出现，光标直接停在要填的地方
- 复古桌面风：奶油色纸面、2px 黑描边、不带模糊的硬阴影、像素图标。颜色和尺寸只在 `web/css/base.css` 的 `:root` 里定义，别处一律用变量；只有浅色一套，没有深色模式
- 每块内容是一个「窗口」：`.card` > `.card-head`（标题栏：左边两个圆点，标题居中，右侧可放一个小按钮或链接）+ `.card-body`；JS 里可用 `ui.js` 的 `windowCard()`。投递详情是浮在右侧的窗口（`openDrawer`），弹窗是激活状态的窗口（青色标题栏）
- 阶段色 `--st-*` 是同一个青绿由浅到深（阶段有先后），文字始终是黑的，色块旁边一定有文字；提醒 / 警告 / 出错用底色 + 图标 + 文字（`.flag`、`.toast.error`），不能只靠颜色
- 图标是 `web/js/pixel.js` 里 16×16 的位图，用 `icon('名字')` 取；加图标就在 `ICONS` 里加一份位图，`tests/pixel.test.js` 会检查格式，也会检查网页里用到的图标都画了。大数字用 `pixelText()` 画成像素字
- 插件侧边栏在 shadow root 里，样式是 `extension/content/panel.js` 里的 `STYLE`，颜色和网页保持一致

## AI（settings.ai + server/ai.js）

- 模型服务由用户自己配：`settings.ai = {format: 'openai'|'anthropic', baseUrl, model, apiKey, forbidden[], enabled}`
- **apiKey 只在服务端读**。`/api/settings`、`/api/state` 一律经 `publicSettings()` 抹掉，只返回 `hasKey`；PATCH 时空串表示不改、`null` 表示清空。改这块务必保留 `tests/server.test.js` 里那条「绝不出服务端」的测试
- 发给模型的内容走 `shared/aiprompt.js` 的 `resumeForAI()` 白名单：联系方式、证件、生日一律不发
- 接口：`POST /api/ai/{test,diagnose,interview,chat}`，`GET /api/ai/<appId>` 只读缓存不花钱
- 防编造：系统提示 + 用户的 `forbidden` 清单 + `rewriteWarnings()` 的机器检查 + 丢弃对不上档案 id 的建议

## Chrome 插件（extension/）

- 结构：`content/lib/`（fields 字段字典、match 标签匹配、fill 写值、clip 收藏识别）→ `content/agent.js`（每个 frame 的执行者）→ `content/panel.js`（侧边栏）；`bg/handlers.js` 处理消息，`bg/logic.js` 是纯函数
- 加字段或同义词：改 `content/lib/fields.js`，在 `extension/test/match.test.js` 加用例
- 测试：`npm test` 包含插件单测；页面行为用 `node extension/test/serve.mjs` 打开 http://127.0.0.1:7320/ 的测试页，在浏览器里执行 `await jtTest.fill()`
- 用户是「加载已解压的扩展程序」装的：改完插件代码要提醒用户去 chrome://extensions 点重新加载
