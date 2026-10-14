// 组装发给模型的内容。两条铁律：
// 1) 白名单取字段 —— 手机号、邮箱、微信、生日、民族、政治面貌这些改简历用不着，一个字都不发
// 2) 系统提示里写死防编造约束，再带上用户自己维护的禁止清单
const JD_LIMIT = 8000;
const HISTORY_TURNS = 6; // 最近 6 轮（12 条）+ 开头的背景 + 这次的问题

const bi = (v) => (v && typeof v === 'object' ? { zh: v.zh || '', en: v.en || '' } : { zh: v || '', en: '' });
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj && obj[k] !== undefined ? obj[k] : '']));

/** 只取改简历用得着的字段 */
export function resumeForAI(profile = {}) {
  const p = profile || {};
  const list = (arr, keys) => (arr || []).map((x) => ({ id: x.id, ...pick(x, keys) }));
  return {
    name: bi((p.basic || {}).name),
    intent: {
      positions: bi((p.intent || {}).positions),
      cities: bi((p.intent || {}).cities),
    },
    education: list(p.education, ['school', 'degree', 'major', 'college', 'start', 'end', 'gpa', 'gpaScale', 'rank', 'honors']),
    work: list(p.work, ['company', 'title', 'type', 'start', 'end', 'description']),
    projects: list(p.projects, ['name', 'role', 'start', 'end', 'description']),
    activities: list(p.activities, ['org', 'role', 'start', 'end', 'description']),
    awards: list(p.awards, ['name', 'date', 'note']),
    languages: list(p.languages, ['language', 'level', 'certificate', 'score']),
    skills: bi(p.skills),
    selfIntro: bi(p.selfIntro),
  };
}

export function systemPrompt({ forbidden = [] } = {}) {
  const rules = [
    '你是一个帮中国应届生改简历的助手，面向秋招网申。',
    '',
    '硬性约束（违反即为错误回答）：',
    '- 只能改措辞、顺序和侧重点。不得新增没有发生过的事实、公司、职位、时间、项目。',
    '- 数字只能沿用候选人原文里已有的。不得新造数字，也不得把已有数字改大。',
    '- 每条改写建议都要对应到档案里某条经历的 id，对不上就不要给这条建议。',
    '- 中文经历用中文改，英文经历用英文改，不要混着写。',
    '- 不确定的地方直说「这里需要你自己确认」，不要圆场。',
  ];
  const list = (forbidden || []).map((s) => String(s).trim()).filter(Boolean);
  if (list.length) {
    rules.push('', '以下内容是候选人明确要求不得出现的，任何情况下都不许写进建议里：');
    for (const f of list) rules.push(`- ${f}`);
  }
  return rules.join('\n');
}

const clipJd = (jd) => {
  const s = String(jd || '').trim();
  return s.length > JD_LIMIT ? `${s.slice(0, JD_LIMIT)}\n……（JD 过长，已截断）` : s;
};

export function diagnosePrompt({ jd, profile, position = '' }) {
  return [
    `目标岗位：${position || '（JD 里自己判断）'}`,
    '',
    '=== JD 全文 ===',
    clipJd(jd),
    '',
    '=== 候选人档案（经历条目，带 id）===',
    JSON.stringify(resumeForAI(profile)),
    '',
    '请只输出一个 JSON 对象，不要任何解释文字，结构如下：',
    '{',
    '  "summary": "一句话总体判断，说清楚最大的优势和最大的缺口",',
    '  "requirements": [{"text": "JD 里的一条要求", "match": "strong|partial|missing", "evidence": "能对上的经历，missing 时留空"}],',
    '  "keywords": ["JD 反复出现但档案里没有的词"],',
    '  "rewrites": [{"target": "档案条目的 id", "original": "原文 bullet", "rewrite": "改写后", "why": "为什么这么改"}]',
    '}',
    '',
    'requirements 覆盖 JD 的主要要求，按重要性排序；rewrites 给 3-6 条最值得改的。',
  ].join('\n');
}

/** 对话上下文：背景一条 + 最近若干轮 + 这次的问题 */
export function chatMessages({ history = [], diagnosisSummary = '', jd = '', profile = {}, message = '' }) {
  const background = [
    '这是我正在投的岗位 JD 和我的档案，后面的问题都围绕它们。',
    '',
    '=== JD ===',
    clipJd(jd),
    '',
    '=== 我的档案 ===',
    JSON.stringify(resumeForAI(profile)),
    diagnosisSummary ? `\n=== 之前的诊断结论 ===\n${diagnosisSummary}` : '',
  ].join('\n');
  const recent = (history || []).slice(-HISTORY_TURNS * 2).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
  return [
    { role: 'user', content: background },
    { role: 'assistant', content: '收到，我会基于这些内容回答，不编造没写过的经历。' },
    ...recent,
    { role: 'user', content: String(message || '') },
  ];
}
