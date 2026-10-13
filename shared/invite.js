// 把测评 / AI 面试的邀请邮件拆成结构化信息。纯函数，网页和服务端共用。
// 原则：认不出来就留空，不猜 —— 猜错一个截止日期比空着更坑。
import { DEFAULT_SETTINGS } from './constants.js';
import { zonedToISO, isoToLocalInput } from './time.js';

const DAY = 86400000;
const ZH_DIGIT = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const EN_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** '五' → 5、'十五' → 15、'3' → 3 */
export function zhNumber(s) {
  const t = String(s || '').trim();
  if (/^\d+$/.test(t)) return Number(t);
  if (EN_NUM[t.toLowerCase()]) return EN_NUM[t.toLowerCase()];
  if (!t.includes('十')) return t.split('').reduce((n, ch) => (ZH_DIGIT[ch] === undefined ? n : n * 10 + ZH_DIGIT[ch]), 0);
  const [tens, ones] = t.split('十');
  return (tens ? ZH_DIGIT[tens] ?? 1 : 1) * 10 + (ones ? ZH_DIGIT[ones] ?? 0 : 0);
}

export function guessType(text) {
  const t = String(text || '');
  if (/AI\s*面试|AI\s*interview/i.test(t)) return 'AI面';
  if (/笔试|online\s+test|written\s+test/i.test(t)) return '笔试';
  return '测评'; // 测评 / 测试 / assessment / pymetrics / games 都归这类，也是兜底
}

/** 返回分钟数；认不出来返回 0。范围写法取上限 */
export function guessDuration(text) {
  const t = String(text || '');
  const range = /(\d+)\s*[-–~至到]\s*(\d+)\s*(?:分钟|mins?|minutes?)/i.exec(t);
  if (range) return Number(range[2]);
  const hours = /(\d+(?:\.\d+)?)\s*(?:个)?\s*(?:小时|hours?|hrs?)/i.exec(t);
  const mins = /(\d+)\s*(?:分钟|mins?|minutes?)/i.exec(t);
  if (mins && (!hours || mins.index < hours.index)) return Number(mins[1]);
  if (hours) return Math.round(Number(hours[1]) * 60);
  return 0;
}

/** 优先取考试链接；都不像就取第一个 */
export function pickLink(text) {
  const urls = (String(text || '').match(/https?:\/\/[^\s<>"'）)，。、]+/g) || []).map((u) => u.replace(/[.,;:]+$/, ''));
  // 前后不能再接字母，否则 example.com 里的 exam 会被当成考试链接
  const looksLikeExam = /(^|[^a-z])(exam|invite|assess|test|interview|pymetrics|game|survey)([^a-z]|$)/i;
  return urls.find((u) => looksLikeExam.test(u)) || urls[0] || '';
}

/** 正文里提到的公司，对上投递记录里的写法 */
export function matchCompany(text, companies = []) {
  const t = String(text || '').toLowerCase();
  let best = '';
  for (const c of companies) {
    for (const name of [c.company, c.companyEn]) {
      // 「卡夫亨氏（中国）」「Example (China)」这类后缀邮件里一般不写，去掉再对一次
      const forms = [String(name || '').trim(), String(name || '').replace(/[（(][^）)]*[）)]/g, '').trim()];
      for (const n of forms) {
        if (n.length >= 2 && t.includes(n.toLowerCase()) && n.length > best.length) best = c.company || n;
      }
    }
  }
  return best;
}

/** 依据片段：从上一个句读之后开始，别从半句话截起 */
const snippet = (text, index, length) => {
  const head = text.slice(Math.max(0, index - 40), index);
  const cut = Math.max(head.lastIndexOf('。'), head.lastIndexOf('\n'), head.lastIndexOf('，'), head.lastIndexOf('. '));
  const start = index - (head.length - (cut + 1));
  return text.slice(start, index + length + 8).replace(/\s+/g, ' ').trim().slice(0, 60);
};

/** 从收到的次日起数 n 个工作日，落在当天 18:00 */
function businessDeadline(receivedAt, n, tz) {
  let day = isoToLocalInput(receivedAt.toISOString(), tz).slice(0, 10);
  let left = n;
  while (left > 0) {
    const next = new Date(Date.parse(zonedToISO(`${day}T12:00`, tz)) + DAY);
    day = isoToLocalInput(next.toISOString(), tz).slice(0, 10);
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return zonedToISO(`${day}T18:00`, tz);
}

/** 「X 天内」「X 个工作日内」「within X business days」 */
function relativeDeadline(text, receivedAt, tz) {
  const zh = /([0-9]+|[零一二三四五六七八九十]+)\s*(?:个)?\s*(工作日|自然日|天|日)\s*(?:之)?内/.exec(text);
  const en = /within\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(business\s+|working\s+)?days?/i.exec(text);
  const hit = zh || en;
  if (!hit) return null;
  const n = zhNumber(hit[1]);
  if (!n) return null;
  const isBusiness = zh ? hit[2] === '工作日' : Boolean(hit[2]);
  return {
    at: isBusiness ? businessDeadline(receivedAt, n, tz) : new Date(receivedAt.getTime() + n * DAY).toISOString(),
    basis: snippet(text, hit.index, hit[0].length),
  };
}

/** 「2026年10月15日 24:00 前」「10月13日」「2026-10-15」「Oct 15」 */
function absoluteDeadline(text, receivedAt, tz) {
  const patterns = [
    /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    /()(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
    new RegExp(`\\b(?:(\\d{4})\\s+)?(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})\\b`, 'i'),
  ];
  for (const [i, re] of patterns.entries()) {
    const m = re.exec(text);
    if (!m) continue;
    const isEn = i === 3;
    const year = Number(m[1]) || new Date(isoToLocalInput(receivedAt.toISOString(), tz).slice(0, 4)).getUTCFullYear()
      || receivedAt.getUTCFullYear();
    const month = isEn ? MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1 : Number(m[2]);
    const day = Number(m[3]);
    if (!month || !day) continue;
    const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 20);
    const clock = /(\d{1,2})\s*[:：]\s*(\d{2})/.exec(rest) || /(\d{1,2})\s*点/.exec(rest);
    let hh = clock ? Number(clock[1]) : 23;
    let mm = clock && clock[2] !== undefined ? Number(clock[2]) : 59;
    if (hh >= 24) { hh = 23; mm = 59; }
    const pad = (n) => String(n).padStart(2, '0');
    return {
      at: zonedToISO(`${year}-${pad(month)}-${pad(day)}T${pad(hh)}:${pad(mm)}`, tz),
      basis: snippet(text, m.index, m[0].length),
    };
  }
  return null;
}

/**
 * 解析邀请邮件正文。
 * companies：现有投递记录（用来把公司名对上），形如 [{ company, companyEn }]
 */
export function parseInvite(text, { receivedAt = new Date(), settings = DEFAULT_SETTINGS, companies = [] } = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const body = String(text || '');
  // 没写时区的日期：中文邮件按北京，英文邮件按本地
  const tz = /[一-龥]/.test(body) ? s.eventInputTz || s.targetTz : s.homeTz;
  const candidates = [relativeDeadline(body, receivedAt, tz), absoluteDeadline(body, receivedAt, tz)]
    .filter(Boolean)
    .map((c) => ({ ...c, at: new Date(c.at).toISOString() })); // 统一成 UTC，调用方不用管是哪条规则算出来的
  candidates.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const hit = candidates[0];
  return {
    type: guessType(body),
    mode: 'deadline',
    deadline: hit ? hit.at : '',
    basis: hit ? hit.basis : '',
    windowStart: receivedAt.toISOString(),
    durationMin: guessDuration(body),
    link: pickLink(body),
    company: matchCompany(body, companies),
    tz,
    confident: Boolean(hit),
  };
}
