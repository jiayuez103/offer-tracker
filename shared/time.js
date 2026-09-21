// 时区与日期工具。全部基于 Intl.DateTimeFormat，夏令时自动处理。
// 约定：日期 'YYYY-MM-DD'；墙上时间 'YYYY-MM-DDTHH:mm'；时刻用带偏移的 ISO。

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WD_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map();

const pad = (n) => String(n).padStart(2, '0');

function formatterFor(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** 某一时刻在指定时区的日历字段 */
export function zonedParts(date, timeZone) {
  const parts = {};
  for (const p of formatterFor(timeZone).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
    weekday: WD_INDEX[parts.weekday],
  };
}

/** 该时区在这一时刻相对 UTC 的偏移（分钟），北京 = 480 */
export function tzOffsetMinutes(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUTC - truncated) / 60000);
}

function offsetString(minutes) {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** 某时区的墙上时间 'YYYY-MM-DDTHH:mm' → 带偏移的 ISO，如 '2026-09-25T14:00:00+08:00' */
export function zonedToISO(local, timeZone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local || '');
  if (!m) throw new Error(`时间格式应为 YYYY-MM-DDTHH:mm：${local}`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let offset = tzOffsetMinutes(new Date(guess), timeZone);
  const second = tzOffsetMinutes(new Date(guess - offset * 60000), timeZone);
  if (second !== offset) offset = second;
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00${offsetString(offset)}`;
}

/** ISO → 某时区的墙上时间 'YYYY-MM-DDTHH:mm'（给 datetime-local 输入框用） */
export function isoToLocalInput(iso, timeZone) {
  const p = zonedParts(new Date(iso), timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** '9/25 周五 14:00'；time=false 时只到日期 */
export function formatZoned(iso, timeZone, { time = true } = {}) {
  const p = zonedParts(new Date(iso), timeZone);
  const day = `${p.month}/${p.day} ${WEEKDAYS[p.weekday]}`;
  return time ? `${day} ${pad(p.hour)}:${pad(p.minute)}` : day;
}

function tzLabel(timeZone, settings) {
  if (timeZone === settings.homeTz) return settings.homeTzLabel;
  if (timeZone === settings.targetTz) return settings.targetTzLabel;
  return timeZone;
}

/** 双时区显示：主时间用录入时的时区，副时间用另一个 */
export function dualTime(iso, eventTz, settings) {
  const primaryTz = eventTz || settings.targetTz;
  const otherTz = primaryTz === settings.homeTz ? settings.targetTz : settings.homeTz;
  return {
    primary: `${formatZoned(iso, primaryTz)} ${tzLabel(primaryTz, settings)}`,
    secondary: `${tzLabel(otherTz, settings)} ${formatZoned(iso, otherTz)}`,
  };
}

/** 某时区的"今天" */
export function todayInZone(timeZone, now = new Date()) {
  const p = zonedParts(now, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 两个日期相差的天数（b - a） */
export function diffDays(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 截止日还剩几天：按该时区的日历日算，0 = 今天截止，负数 = 已过 */
export function daysUntil(dateStr, timeZone, now = new Date()) {
  return diffDays(todayInZone(timeZone, now), dateStr);
}

/** 截止时刻 = 该时区当天 23:59 */
export function deadlineISO(dateStr, timeZone) {
  return zonedToISO(`${dateStr}T23:59`, timeZone);
}

/** 所在周的周一 */
export function weekStartOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = 周日
  return addDays(dateStr, weekday === 0 ? -6 : 1 - weekday);
}
