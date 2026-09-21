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
