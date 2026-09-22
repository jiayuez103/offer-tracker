# 秋招 Tracker 设计文档

- 日期：2026-09-20
- 状态：设计已确认（形态 = 本地 App + Chrome 插件）
- 范围：V1 以本机使用为主，先让你用起来；架构上为以后部署成线上网页留好接口（见第 12 节）
- 使用者：国内秋招，主投外企管培、次投互联网大厂；产品策略 + 市场营销双线；中英双语；人在海外，面试多按北京时间

## 1. 目标与非目标

**目标**

1. 管理个人档案（中英对照）和多版本简历
2. 记录每一次投递，跟踪进度、日程（测评 / 面试）、面试复盘
3. 在网申页面一键填写 + 点选填充，并能从官网一键收藏岗位
4. 数据是纯文件，Claude 在以后的对话里能直接读写

**非目标（V1 不做）**

手机访问、内推人脉模块、Offer 对比、页面内 AI 解析 JD、自动提交网申、云同步、存储身份证号 / 护照号 / 密码。

## 2. 总体架构

```
job-tracker/
├── server.js                # Node.js 服务（零依赖，只用内置模块），只监听 127.0.0.1:7317
├── shared/                  # 网页和服务端共用的纯 JS：阶段 / 类型常量、时间线规则、没动静计算、时区工具、ICS 生成
├── 启动Tracker.command       # 后台启动服务（已在运行则跳过）+ 打开浏览器
├── 停止Tracker.command
├── web/                     # 网页：原生 JS ES modules，无构建步骤，无外部 CDN / 字体
├── extension/               # Chrome MV3 插件
├── tests/                   # node --test：服务端 + shared
├── data/                    # 个人数据（.gitignore）
│   ├── profile.json
│   ├── applications.json
│   ├── answers.json
│   ├── resumes.json
│   ├── settings.json
│   ├── jd/<appId>.md        # 每个岗位一份 JD 快照
│   ├── resumes/<文件>        # 简历原件
│   └── backups/
├── CLAUDE.md                # 给以后的 Claude：数据格式 + 修改规则
└── README.md                # 给用户：启动、装插件、订阅日历
```

服务端用 Node.js 而不用 Python：网页、服务端、插件都是 JavaScript，业务规则在 `shared/` 里只写一份，以后部署上线可以直接复用。

三个组件之间只通过 HTTP API 和 `data/` 文件交互：

- 网页 ⇄ 服务：`/api/*`
- 插件后台（service worker）⇄ 服务：`/api/*`（插件的 content script 不直接请求服务）
- Claude ⇄ `data/*.json`：直接读写文件。服务每次请求都从磁盘读，不在内存里缓存，所以 Claude 的改动立即生效

## 3. 数据模型

通用约定：

- `id`：前缀 + 随机 base36，如 `app_k3j9x2q`、`evt_…`、`ans_…`、`res_…`、`edu_…`
- `createdAt` / `updatedAt`：ISO 8601 UTC（`2026-09-20T18:30:00.000Z`）
- `Bi` 类型 = `{ "zh": "", "en": "" }`，用于所有需要中英两版的文本
- 日期 `YYYY-MM-DD`；年月 `YYYY-MM`
- 日程时间带时区偏移：`2026-09-25T14:00:00+08:00`，另存 `tz`（IANA 名）

### 3.1 profile.json（单个对象）

```jsonc
{
  "basic": {
    "name": Bi, "familyName": Bi, "givenName": Bi, "preferredName": "",
    "gender": "",               // 女 / 男；英文表单由字典映射成 Female / Male
    "birthDate": "",
    "phone": "", "phoneCountryCode": "+86",
    "email": "", "wechat": "",
    "currentCity": Bi,          // 现居地
    "hometown": Bi,             // 籍贯
    "residence": Bi,            // 户口所在地 / 生源地
    "nationality": Bi,
    "politicalStatus": "",      // 群众 / 共青团员 / 中共党员 …
    "ethnicity": "",
    "linkedin": "", "website": ""
  },
  "intent": { "positions": Bi, "cities": Bi, "salary": "", "availableFrom": "", "acceptAdjustment": "" },
  "education":  [{ "id", "school": Bi, "degree": Bi, "major": Bi, "college": Bi, "city": Bi,
                   "start": "YYYY-MM", "end": "YYYY-MM", "gpa": "", "gpaScale": "", "rank": "",
                   "courses": Bi, "honors": Bi }],
  "work":       [{ "id", "company": Bi, "title": Bi, "department": Bi, "type": "实习|全职|兼职",
                   "city": Bi, "start", "end", "description": Bi }],
  "projects":   [{ "id", "name": Bi, "role": Bi, "start", "end", "description": Bi }],
  "activities": [{ "id", "org": Bi, "role": Bi, "start", "end", "description": Bi }],
  "awards":     [{ "id", "name": Bi, "date": "", "description": Bi }],
  "languages":  [{ "id", "language": Bi, "level": Bi, "certificate": "", "score": "" }],
  "certificates": [{ "id", "name": Bi, "date": "", "score": "" }],
  "skills": Bi, "selfIntro": Bi, "hobbies": Bi,
  "extras": [{ "id", "label": "", "value": Bi }]   // 自定义字段，侧边栏可点选
}
```

数组顺序 = 用户在档案里排的顺序 = 插件填写多段经历时的顺序（插件里可一键反转）。

**不存**：身份证号、护照号、任何密码。

### 3.2 applications.json（数组）

```jsonc
{
  "id": "app_…",
  "company": "雀巢", "companyEn": "Nestlé",
  "companyType": "外企",        // 外企 | 大厂 | 国企 | 民企 | 其他
  "industry": "快消",           // 自由文本，带常用建议
  "position": "Marketing MT",
  "track": "市场",              // 产品 | 市场 | 其他
  "cities": "上海",             // 自由文本，多个用 / 分隔
  "batch": "秋招正式批",         // 提前批 | 秋招正式批 | 补录 | 其他
  "channel": "官网",            // 官网 | 内推 | 宣讲会 | 招聘平台 | 邮件 | LinkedIn | 其他
  "referrer": "", "referralCode": "",
  "jdUrl": "", "applyUrl": "", "account": "",   // account = 官网注册用的邮箱 / 手机，不存密码
  "resumeId": "res_…",          // 投的哪版简历
  "priority": 2,                // 意向度 1–3，3 = 最想去
  "deadline": "2026-10-15",     // 网申截止日，按北京时间当天 23:59 计
  "appliedAt": "2026-09-20",
  "stage": "applied",           // wishlist | applied | assessment | interview | final | offer
  "status": "active",           // active | rejected | withdrawn | accepted | declined
  "nextStep": "", "notes": "",
  "jdFile": "jd/app_….md",      // 没有快照时为 null
  "events": [{
    "id": "evt_…",
    "type": "面试",             // 测评 | 笔试 | AI面 | 群面 | 面试 | 终面 | HR面 | Offer | 其他（网申截止只用上面的 deadline 字段）
    "title": "二面（业务）",
    "at": "2026-09-25T14:00:00+08:00", "tz": "Asia/Shanghai",
    "durationMin": 60, "location": "", "done": false,
    "review": { "questions": "", "reflection": "", "rating": 0 }   // 可为 null
  }],
  "timeline": [{ "id", "at": "ISO", "type": "created|stage|status|note|followup", "from": "", "to": "", "text": "" }],
  "createdAt": "…", "updatedAt": "…"
}
```

**进度规则**

- 看板列：`待投递 | 已投递 | 测评/笔试 | 面试 | 终面 | Offer | 已结束`
- `status` 为 rejected / withdrawn 的卡片进「已结束」列，`stage` 保留在结束时的那一轮（卡片显示「挂在：面试」）
- `accepted` / `declined` 的卡片留在 Offer 列，用标签区分
- 漏斗统计按「到达过的最高 stage」算，已结束的也计入
- 服务端在 POST / PATCH 时自动写时间线：新建 → `created`；`stage` 变化 → `stage`（from/to）；`status` 变化 → `status`；从 wishlist 进入后续阶段且 `appliedAt` 为空时自动填当天日期

**「没动静」规则**：`status=active` 且 `stage ∈ {applied, assessment, interview, final}`，最后一次进展距今 ≥ `staleDays`（默认 14）。最后一次进展 = 时间线里 created / stage / status / followup 的最晚时间，与已过去的日程时间取较晚者。点「我跟进了」写一条 `followup`，计时重置。

### 3.3 answers.json（素材库）

```jsonc
{ "id": "ans_…", "category": "Why 公司", "question": "", "lang": "zh", "text": "",
  "tags": [], "usedIn": ["app_…"], "createdAt", "updatedAt" }
```

分类：自我介绍 | Why 公司 | Why 岗位 | 领导力 | 团队合作 | 挑战/失败 | 创新 | 职业规划 | 优缺点 | 其他。编辑时显示中文字数和英文词数。

### 3.4 resumes.json

```jsonc
{ "id": "res_…", "name": "产品线-中文", "track": "产品", "lang": "zh",
  "files": [{ "name": "简历-产品线-中文.docx", "stored": "resumes/…", "size": 39973, "uploadedAt": "…" }],
  "notes": "", "createdAt", "updatedAt" }
```

一个版本可以有多个文件（docx + pdf）；插件上传简历时优先用 PDF。

### 3.5 settings.json

```jsonc
{ "staleDays": 14, "weeklyGoal": 10,
  "homeTz": "America/Los_Angeles", "homeTzLabel": "洛杉矶",
  "targetTz": "Asia/Shanghai",     "targetTzLabel": "北京",
  "eventInputTz": "Asia/Shanghai" }
```

## 4. 时区

人在海外（默认洛杉矶）、面试按北京时间，而且 2026-11-01 美国夏令时结束，时差会从 15 小时变成 16 小时。所以：

- 录入日程时选时区，默认北京时间（`eventInputTz`）
- 所有日程同时显示两个时间：`9/25 周五 14:00 北京 · 洛杉矶 9/24 周四 23:00`
- 换算全部用 `Intl.DateTimeFormat` 的 `timeZone`，夏令时自动处理
- 网申截止日按北京时间当天 23:59 计算剩余天数
- 日历导出用 UTC 时间，苹果日历会按本机时区显示

## 5. 服务端 API

地址 `http://127.0.0.1:7317`，全部 JSON。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ping` | `{ok, app:"job-tracker", version}` |
| GET | `/api/state` | 一次返回 profile、applications、answers、resumes、settings、version |
| GET | `/api/version` | 数据文件最新修改时间，网页用来发现外部改动 |
| GET / PATCH | `/api/profile` | PATCH 按顶层 key 替换（只改传入的部分） |
| GET / PATCH | `/api/settings` | 同上 |
| GET / POST | `/api/{applications\|answers\|resumes}` | 列表 / 新建（服务端分配 id 和时间戳） |
| PATCH / DELETE | `/api/{集合}/{id}` | 浅合并更新 / 删除 |
| GET / PUT | `/api/applications/{id}/jd` | 读写 JD 快照 `data/jd/{id}.md` |
| POST | `/api/resumes/{id}/files` | 上传文件：请求体是原始字节，文件名放在 `X-Filename`（URL 编码） |
| DELETE | `/api/resumes/{id}/files/{stored}` | 删除某个文件 |
| GET | `/files/resumes/{stored}` | 打开 / 下载简历文件 |
| GET | `/calendar.ics` | 全部日程 + 网申截止（订阅或下载） |
| POST | `/api/parse-jd` | 用 `shared/jdparse.js` 拆 JD：`{text, url}` → `{company, companyType, position, cities, deadline}`（插件收藏岗位用） |
| GET | `/`、`/web/*` | 网页静态文件 |

删除一条投递时，一并删掉它的 JD 快照。

**安全**

- 只绑定 127.0.0.1
- `Host` 必须是 `127.0.0.1:7317` 或 `localhost:7317`，防 DNS rebinding
- 带 `Origin` 头的请求，Origin 只能是这两个地址或 `chrome-extension://…`，否则 403
- 写请求必须是 `Content-Type: application/json`（文件上传除外，但同样校验 Origin）
- 静态文件和简历文件做路径穿越检查

**可靠性**

- 原子写：先写临时文件，再 `fs.renameSync` 替换；读写都用同步 API，在 Node 单线程里天然串行，不需要额外加锁
- 数据读写集中在 `store` 模块（按集合读、写、改），其他代码不直接碰文件
- 某个数据文件解析失败 → 返回 500 和清楚的错误（哪个文件、哪一行），并拒绝写这个文件，绝不自动重置
- 备份：写某个文件前，如果它最近一份备份早于 30 分钟，就复制一份到 `backups/`；每个文件保留最近 30 份
- 端口被占用时，启动脚本先请求 `/api/ping`：是自己就直接打开网页，不是就提示

## 6. 网页

布局：左侧导航 + 顶栏（搜索、「新建投递」按钮）。浅色 / 深色跟随系统。系统字体（PingFang SC）。

| 页面 | 内容 |
|---|---|
| 概览 | 「需要处理」清单（3 天内截止还没投、48 小时内的测评 / 笔试、今明两天的面试、面完未写复盘、没动静）；未来 7 天日程；数字卡片（投递数、进行中、面试中、Offer）；漏斗；本周投递 vs 周目标；近 8 周投递柱状图；产品线 vs 市场线 |
| 投递 | 看板 / 列表切换；筛选（赛道、公司类型、进行中 / 已结束 / 全部）、搜索；看板拖拽换列；卡片显示公司、岗位、赛道、意向度、下一个日程倒计时、截止倒计时、没动静标记 |
| 投递详情（抽屉） | 基本信息 / 日程与复盘 / JD 快照 / 时间线四个标签；阶段选择；快捷按钮：挂了、放弃、我跟进了 |
| 新建投递（弹窗） | 可粘贴 JD 全文和链接，按规则自动拆出公司、岗位、城市、截止日，同时存为 JD 快照 |
| 日程 | 按天分组的待办列表（可显示已过去的），双时区；导出 .ics / 订阅链接 |
| 档案 | 分节编辑，多段经历可增删、上下移动；`Bi` 字段左中右英并排；输入后 0.8 秒自动保存 |
| 简历 | 版本卡片，拖入或选择文件上传，打开 / 下载，显示被多少条投递用过 |
| 素材库 | 按分类 / 语言筛选；编辑器带字数统计；一键复制；显示用在了哪些投递 |
| 设置 | 没动静天数、周目标、时区、导出全部数据（导入等上线时再做，本地恢复用 `data/backups/`）、日历订阅入口、插件说明（M2） |

技术：所有请求都经过 `web/js/api.js`，用相对路径，不写死 localhost；一个很小的 `h()` DOM 辅助函数；集中的 store 负责加载和保存；页面可见时每 4 秒查一次 `/api/version`，切回窗口时也查，有变化就重新加载（有未保存的输入时先不刷新）；先改界面再请求，失败时弹提示并回滚。

## 7. Chrome 插件（M2）

> 实现时的调整（见 M2 计划）：点选填充改为侧边栏按钮在 mousedown 时阻止默认行为、把文字交给拥有焦点的 frame，不再实时上报焦点；每次操作前重新注入以覆盖后加载的 iframe；JD 拆解走 `POST /api/parse-jd`；不做单独设置页，Tracker 地址在侧边栏底部修改；内容脚本文件为 `content/agent.js` + `content/panel.js`。

**文件**：`manifest.json`、`background.js`（service worker）、`content/lib/fields.js`（字段同义词字典）、`content/lib/match.js`（找标签 + 匹配，纯函数）、`content/lib/fill.js`（写入值）、`content/lib/clip.js`（识别公司 / 岗位 / JD）、`content/content.js`（侧边栏 + 消息）、`content/panel.css`。

**服务地址**：可在插件设置里改，默认 `http://127.0.0.1:7317`。

**权限**：`storage`、`scripting`；`host_permissions: ["<all_urls>"]`（需要能注入任意页面和其中的 iframe，也用来请求本地服务）。脚本按需注入：点插件图标或按快捷键时才注入，不会在每个网页上常驻。

**流程**

- 点图标 → 后台把 content scripts 注入当前标签页的所有 frame（重复注入无副作用）→ 通知顶层 frame 打开侧边栏（shadow DOM，样式与页面隔离）
- 打开侧边栏时，后台拉 `/api/state` 并缓存到 `chrome.storage.local`；服务不可用时用缓存，并显示「Tracker 未启动，使用 9/20 14:00 的缓存」
- **一键填写**：后台把档案广播给所有 frame → 每个 frame 填自己的表单 → 汇总「已填 18 项 · 请检查 6 项」
- **点选填充**：侧边栏打开期间，各 frame 把输入框聚焦事件报给后台（带时间戳）；点侧边栏条目 → 后台发给最后聚焦的 frame → 填进那个输入框，同时复制到剪贴板
- **上传简历**：选版本 → 后台从服务取文件 → 发给各 frame → 找标签像「简历 / 附件 / Resume / CV」的文件框，用 `DataTransfer` 放入文件并触发 change；找不到就提示
- **记录投递**：顶层 frame 识别公司（常见官网和 Moka / 北森 / 飞书 / Workday 等域名规则、`og:site_name`、标题拆分）、岗位（h1 / 标题）、链接、JD 全文（优先用选中的文字，否则取正文区域，最多 3 万字）、城市、截止日 → 侧边栏表单预填 → 用户确认 → POST 投递 + PUT JD。按链接或「公司 + 岗位」查重，已存在就显示当前进度并可直接改阶段

**匹配规则**

- 标签来源依次为：`aria-labelledby`、`label[for]`、外层 `label`、常见 UI 库的表单项标签（`.ant-form-item-label`、`.el-form-item__label`、`.ivu-form-item-label`、`.arco-form-label-item` 等）、`aria-label`、`placeholder`、同一行前面的文字、`name`/`id` 拆词、Workday 的 `data-automation-id`
- 分节：找字段前面最近的类标题元素（h1–h6、legend、class 含 title / header），和分节字典匹配（教育 / Education、实习 / 工作 / Experience、项目 / Project、校园 / Activities、获奖 / Awards、语言 / Language、证书 / Certificates、基本信息 / Personal），用来区分「开始时间」「描述」这类通用字段
- 同一分节里同一个字段出现第 k 次，就填档案里第 k 段经历
- 语言：标签里有中文就用中文值，纯英文标签用英文值，再退到页面 `lang`；侧边栏可强制「自动 / 中文 / English」；缺某一种语言时退回另一种
- 写入：文本框和多行文本用原生 setter + `input`/`change` 事件（兼容 React / Vue）；原生下拉按选项文字模糊匹配；单选按标签文字点击；自定义下拉（Ant / Element / iView / `role=combobox`）点开后在弹层里找匹配项，0.8 秒内找不到就关掉并标黄；`type=date/month` 按格式写入；只读的日期控件标黄留给点选
- 默认只填空的框（可开「覆盖已有内容」）

**安全边界**：不点任何按钮（提交、投递、Apply、Next 都不点）；跳过密码框、隐藏 / 禁用框、验证码框（标签含 验证码 / captcha）；文件框只在「上传简历」时处理。

**高亮**：已填 = 绿框，拿不准 = 蓝框，可见的必填空框 = 黄框；关掉侧边栏时清除。

## 8. 与 Claude 的配合

- `job-tracker/CLAUDE.md`：数据文件和字段说明、修改规则（生成 id、更新 `updatedAt`、改阶段时写时间线、日程带时区、JD 快照放 `data/jd/`、不存密码和证件号）、常用操作示例
- 在 Claude 的记忆里记下 tracker 的位置和用法

## 9. 测试

- `tests/{constants,time,domain,ics,jdparse}.test.js`（`node --test`）：时间线规则、没动静计算、时区换算（含 2026-11-01 夏令时切换）、ICS 输出、JD 拆解
- `tests/{store,server}.test.js`（`node --test`）：增删改查、PATCH 合并和自动时间线、原子写、损坏文件拒绝写入、备份节流和保留份数、Host / Origin 校验、JD 读写、文件上传和路径穿越
- `extension/test/*.test.js`（`node --test`）：标签清洗、字段匹配（中英同义词 + 分节）、语言选择、从链接 / 标题识别公司、JD 字段提取
- `extension/test/pages/*.html`：仿普通表单、Ant Design、Element UI、Workday、iframe 嵌套的测试页，加一个模拟 `chrome.*` 的注入器，在内置浏览器里验证填写结果
- 网页：在内置浏览器里走一遍主要流程（新建 / 编辑 / 拖拽 / 删除投递、带时区的日程、档案自动保存、上传简历、素材库、导出 .ics），检查控制台无报错

## 10. 交付顺序

- **M1**：服务端 + 测试 → 网页 → 从 4 份简历导入档案和简历版本 → README / CLAUDE.md → 验证
- **M2**：插件纯函数库 + 测试 → 侧边栏、填写、上传简历、记录投递 → 测试页验证 → README 补安装说明

## 11. 已知限制

- 自定义下拉、日期、学校搜索框只能尽力填，失败时靠点选
- 登录、验证码、最后提交都由用户完成
- 插件只支持 Chrome；Safari 只能用网页部分
- 只能在这台 Mac 上用

## 12. 以后部署上线（不在 V1 范围）

V1 先保证本机好用。下面几条约束让以后上线只需要换后端，不用重写：

- 网页是纯静态文件，数据请求全部集中在 `web/js/api.js`、用相对路径；以后可以原样部署到 Vercel / Netlify / Cloudflare Pages 这类静态托管，只需改 API 地址、加上登录凭证
- 服务端的数据读写集中在 `store` 模块，以后换成数据库只需要重写这一层
- 业务规则（时间线、没动静、时区、ICS）在 `shared/`，线上后端直接复用
- 插件的服务地址可配置，以后指向线上 API 即可
- 代码里不写任何个人信息：个人数据只在 `data/`，时区等偏好在 settings 里，换一个人拿到代码也能用
- 数据是带 id 和时间戳的 JSON 记录，导出后能直接导入任何数据库

上线时需要新增：登录和按用户隔离数据、HTTPS、数据库（如 Supabase、Cloudflare D1）、隐私说明（个人信息会离开本机）。到时要先定一个问题：只给自己多设备用，还是做成别人也能用的产品——两者在登录、数据隔离和成本上差别很大。
