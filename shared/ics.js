// 生成 iCalendar（.ics），给苹果日历订阅或导入。时间一律用 UTC。
import { DEFAULT_SETTINGS } from './constants.js';
import { deadlineISO, isoToLocalInput, zonedToISO } from './time.js';
import { eventMode } from './domain.js';

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

/** 截止型的两次闹钟：提前 1 天，再加截止当天早上 9 点；截止本身就在 9 点前就改成提前 2 小时 */
export function deadlineAlarms(start, timeZone) {
  const day = isoToLocalInput(start.toISOString(), timeZone).slice(0, 10);
  const morning = Date.parse(zonedToISO(`${day}T09:00`, timeZone));
  const minutes = Math.round((start.getTime() - morning) / 60000);
  return [1440, minutes > 0 && minutes < 1440 ? minutes : 120];
}

function vevent({ uid, stamp, start, end, summary, description, location, url, alarms }) {
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
  for (const m of alarms) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(summary)}`, `TRIGGER:-PT${m}M`, 'END:VALARM');
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
        alarms: eventMode(ev) === 'deadline' ? deadlineAlarms(start, s.homeTz) : [60],
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
        alarms: [24 * 60],
      }));
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
