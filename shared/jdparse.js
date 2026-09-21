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
