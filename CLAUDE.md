# 秋招 Tracker（给 Claude）

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
- 保持零依赖、无构建；数据读写只放在 `server/store.js`；业务规则放 `shared/`，网页和服务端共用

## Chrome 插件（extension/）

- 结构：`content/lib/`（fields 字段字典、match 标签匹配、fill 写值、clip 收藏识别）→ `content/agent.js`（每个 frame 的执行者）→ `content/panel.js`（侧边栏）；`bg/handlers.js` 处理消息，`bg/logic.js` 是纯函数
- 加字段或同义词：改 `content/lib/fields.js`，在 `extension/test/match.test.js` 加用例
- 测试：`npm test` 包含插件单测；页面行为用 `node extension/test/serve.mjs` 打开 http://127.0.0.1:7320/ 的测试页，在浏览器里执行 `await jtTest.fill()`
- 用户是「加载已解压的扩展程序」装的：改完插件代码要提醒用户去 chrome://extensions 点重新加载
