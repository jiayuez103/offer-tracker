# AI 按 JD 改简历（M4）实施计划

> 设计见 `docs/superpowers/specs/2026-10-14-ai-resume-tailoring-design.md`。分支 `m4-ai-resume`。
> 每个任务：先写测试 → 跑到失败 → 实现 → 跑过 → 提交。提交信息结尾带 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`。
> **改了 `server/` 或 `shared/` 一定要重启 Tracker 再验证。**

**目标**：打开一条投递的「AI」页，看到针对这条 JD 的匹配诊断和改写建议，并能继续对话要求改写。模型服务由用户自己配，密钥不出服务端。

---

## 文件一览

| 文件 | 职责 |
|---|---|
| `shared/llm.js`（新） | 两种 API 格式的请求体构造、流式增量解析、JSON 容错解析。纯函数 |
| `shared/aiprompt.js`（新） | 档案裁剪（白名单）、系统提示、诊断提示、对话上下文 |
| `server/ai.js`（新） | 调模型（注入 fetch）、超时、错误翻译、读写 `data/ai/<appId>.json` |
| `server/app.js` | 三个路由；`/api/settings`、`/api/state` 出口抹掉 apiKey |
| `server/store.js` | `data/ai/` 的读写 |
| `shared/constants.js` | `DEFAULT_SETTINGS.ai` |
| `web/js/views/settings.js` | 「AI 服务」卡片 + 测试连接 |
| `web/js/components/appDrawer.js` | 「AI」标签页 |
| `web/js/components/aiPanel.js`（新） | 诊断视图 + 对话框 |
| `tests/llm.test.js`、`tests/aiprompt.test.js`（新）、`tests/server.test.js` | 单测 |

---

## Task 1：设置里的 AI 配置，且密钥绝不出服务端

- [ ] **Step 1：写测试**（`tests/server.test.js`）

1. `GET /api/settings` 返回的 `ai` 里没有 `apiKey`，有 `hasKey: false`
2. `PATCH /api/settings` 传 `ai.apiKey = "sk-test"` 后，再 `GET` 仍然不返回原值，但 `hasKey: true`
3. 再 `PATCH` 传 `ai.apiKey = ""`（空串）不清空已存的 key；传 `null` 才清空
4. `GET /api/state` 同样不含 `apiKey`
5. 断言整个响应体字符串里不出现 `sk-test`

- [ ] **Step 2：跑测试确认失败** → `npm test`

- [ ] **Step 3：实现**

`shared/constants.js` 的 `DEFAULT_SETTINGS` 加：

```js
ai: { format: 'openai', baseUrl: '', model: '', apiKey: '', forbidden: [], enabled: false },
```

`server/app.js` 加 `publicSettings(s)`：深拷贝后把 `ai.apiKey` 删掉、补 `ai.hasKey`。所有出口（`/api/settings`、`/api/state`、PATCH 的返回）都过这个函数。PATCH 合并时：`apiKey === ''` → 保留原值；`apiKey === null` → 清空。

- [ ] **Step 4：跑测试** 全过
- [ ] **Step 5：提交** `feat(server): ai settings that never leak the api key`

---

## Task 2：两种 API 格式的适配器

- [ ] **Step 1：写测试**（`tests/llm.test.js`）

1. `buildRequest({format:'openai', baseUrl:'https://api.deepseek.com', model:'deepseek-chat', apiKey:'k', system, messages})` → url 是 `https://api.deepseek.com/v1/chat/completions`（baseUrl 已含 `/v1` 时不重复加）、header `Authorization: Bearer k`、body 里 system 在 messages[0]
2. 同上 `format:'anthropic'` → url `.../v1/messages`、header `x-api-key` + `anthropic-version`、body 有顶层 `system`、`max_tokens`
3. 本地服务（apiKey 为空）不带鉴权头
4. `readText(json, format)`：各自从 `choices[0].message.content` / `content[0].text` 取文本；取 usage
5. `parseStreamChunk(line, format)`：OpenAI 的 `data: {"choices":[{"delta":{"content":"你"}}]}` → `'你'`；Anthropic 的 `content_block_delta` → 文本；`[DONE]` / 其它事件 → `''`
6. `extractJson(text)`：纯 JSON ✓；带 ```json 围栏 ✓；前后有解释文字 ✓；完全不是 JSON → `null`

- [ ] **Step 2：跑测试确认失败**
- [ ] **Step 3：实现 `shared/llm.js`**（纯函数，不碰网络）
- [ ] **Step 4：跑测试** 全过
- [ ] **Step 5：提交** `feat(llm): openai and anthropic request adapters`

---

## Task 3：提示词组装 + 隐私裁剪

- [ ] **Step 1：写测试**（`tests/aiprompt.test.js`）

1. `resumeForAI(profile)` 的 JSON 字符串里**不含**手机号、邮箱、微信、生日、民族、政治面貌、籍贯；**含**学校、公司、职位、bullet 文本
2. `systemPrompt({forbidden:['不许写 ROI 提升']})` 含「不得新增」「数字只能沿用原文」和那条禁止项
3. `diagnosePrompt({jd, profile, position})`：JD 超过 8000 字会截断并加省略标记
4. `chatMessages({history, diagnosis})` 只保留最近 N 轮

- [ ] **Step 2：跑测试确认失败**
- [ ] **Step 3：实现 `shared/aiprompt.js`**（白名单取字段，不是黑名单删字段）
- [ ] **Step 4：跑测试** 全过
- [ ] **Step 5：提交** `feat(ai): prompt assembly that never sends contact details`

---

## Task 4：诊断接口 + 缓存

- [ ] **Step 1：写测试**（`tests/server.test.js`，注入假 fetch）

1. `POST /api/ai/diagnose` 未配置 AI → 400，提示去设置页
2. 投递没有 JD 快照 → 400，提示先存 JD
3. 假 fetch 返回一段带围栏的 JSON → 200，返回解析后的结构，并写入 `data/ai/<appId>.json`
4. 再请求一次（不带 force）→ 不再调用 fetch，直接返回缓存
5. `force: true` → 重新调用
6. 假 fetch 返回 401 → 400 且提示「API key 不对」，不写缓存
7. 响应体里不含 key

- [ ] **Step 2：跑测试确认失败**
- [ ] **Step 3：实现** `server/ai.js` + 路由；`store` 增加 `readAi(appId)` / `writeAi(appId, data)`；超时用 `AbortSignal.timeout(60000)`
- [ ] **Step 4：跑测试** 全过
- [ ] **Step 5：提交** `feat(server): JD match diagnosis with on-disk cache`

---

## Task 5：对话接口（流式）

- [ ] **Step 1：写测试**

1. `POST /api/ai/chat` 把假 fetch 的流式分片拼成 SSE 转发给客户端（`Content-Type: text/event-stream`）
2. 对话结束后，用户消息和回复都追加进了 `data/ai/<appId>.json`，超过 40 条会截断
3. 上游报错时，SSE 里发一条 `event: error` 而不是直接断开

- [ ] **Step 2：跑测试确认失败**
- [ ] **Step 3：实现**
- [ ] **Step 4：跑测试** 全过
- [ ] **Step 5：提交** `feat(server): streaming chat grounded in the JD and profile`

---

## Task 6：设置页的「AI 服务」卡片

- [ ] **Step 1：实现**（`web/js/views/settings.js`）

字段：格式（segmented：OpenAI 兼容 / Anthropic）、服务地址、模型名、API key（`type=password`，已保存时 placeholder 显示「已保存，留空则不修改」，旁边一个「清除」按钮）、禁止清单（每行一条的 textarea）、「测试连接」按钮（调 `/api/ai/test`，成功显示模型回了什么，失败显示翻译后的错误）。

常用服务的填写示例写在卡片下方（DeepSeek、本地 Ollama 各一行）。

- [ ] **Step 2：验证** 内置浏览器里打开设置页，确认字段渲染、密码框不回显、测试连接在没配置时给出清晰报错
- [ ] **Step 3：提交** `feat(web): ai service settings`

---

## Task 7：投递抽屉的「AI」标签页

- [ ] **Step 1：实现**（`web/js/components/aiPanel.js` + `appDrawer.js` 加标签）

- 没配置 → 引导去设置页；没 JD → 引导先存 JD
- 有缓存直接渲染，顶部标注「基于 X 月 X 日的 JD · 模型名」+「重新诊断」按钮
- 诊断视图：总体判断、要求对照表（strong / partial / missing 三色）、关键词缺口、改写卡片（原文 → 改后 + 为什么 + 复制按钮）
- 对话框：输入 + 流式显示回复，历史可滚动
- 明确标注：所有改写都是建议，不会自动改你的档案

- [ ] **Step 2：验证** 内置浏览器里用假 fetch 之外的真实服务跑通（见 Task 8）
- [ ] **Step 3：提交** `feat(web): per-application AI tab with diagnosis and chat`

---

## Task 8：端到端验证与收尾

- [ ] **Step 1**：`npm test` 全过
- [ ] **Step 2**：请用户在设置页填入自己的 DeepSeek key（`https://api.deepseek.com`、`deepseek-chat`），点「测试连接」
- [ ] **Step 3**：挑一条有 JD 快照的真实投递，跑诊断 + 一轮对话；检查：没有编造的数字、禁止清单生效、改写能对上档案条目
- [ ] **Step 4**：README 补一节「接入 AI」；CLAUDE.md 补 `data/ai/` 和密钥纪律
- [ ] **Step 5**：用 finishing-a-development-branch 合并回 main，推送到 GitHub
