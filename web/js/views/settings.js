// 设置：没动静天数、周目标、时区、导出数据、日历和插件说明、版本信息。
import { store } from '../store.js';
import { api } from '../api.js';
import { h, icon, field, input, select, segmented, attempt, toast, repaintWhenIdle, copyText } from '../ui.js';
import { todayInZone, formatZoned } from '../../shared/time.js';

const TIMEZONES = [
  ['Asia/Shanghai', '北京'], ['Asia/Hong_Kong', '香港'], ['Asia/Singapore', '新加坡'], ['Asia/Tokyo', '东京'],
  ['America/Los_Angeles', '洛杉矶'], ['America/New_York', '纽约'], ['America/Chicago', '芝加哥'],
  ['Europe/London', '伦敦'], ['Europe/Paris', '巴黎'], ['Australia/Sydney', '悉尼'],
];

export function render(root) {
  const draw = () => root.replaceChildren(build());
  draw();
  const repaint = repaintWhenIdle(root, draw);
  return store.subscribe((topic) => {
    if (topic === 'load' || topic === 'settings') repaint();
  });
}

function card(title, ...body) {
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, title)),
    h('div', { class: 'card-body' }, body));
}

function tzOptions(current) {
  const options = TIMEZONES.map(([value, label]) => ({ value, label: `${label}（${value}）` }));
  if (current && !TIMEZONES.some(([z]) => z === current)) options.push({ value: current, label: current });
  return options;
}

async function exportAll() {
  const { version, ...data } = await api.get('/api/state');
  const json = JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = h('a', { href: url, download: `job-tracker-${todayInZone(store.state.settings.homeTz)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function build() {
  const s = store.state.settings;
  const save = (patch) => attempt(() => store.patchSettings(patch));
  const num = (key, min, max) => input({
    type: 'number',
    value: String(s[key] ?? ''),
    onChange: (v) => {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < min || n > max) {
        toast(`请填 ${min}–${max} 之间的整数`, { type: 'error' });
        return;
      }
      save({ [key]: n });
    },
  });
  const tzSelect = (key, labelKey) => select(tzOptions(s[key]), s[key], (v) => {
    const known = TIMEZONES.find(([z]) => z === v);
    const patch = { [key]: v, ...(known ? { [labelKey]: known[1] } : {}) };
    if (s.eventInputTz === s[key]) patch.eventInputTz = v; // 默认录入时区跟着一起改
    save(patch);
  });
  const nowIso = new Date().toISOString();
  const about = h('p', { class: 'muted small', style: { margin: 0 } }, '秋招 Tracker');
  api.get('/api/ping').then((p) => { about.textContent = `秋招 Tracker v${p.version} · 本地服务运行中`; }).catch(() => {});

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '760px' } },
    card('提醒',
      h('div', { class: 'form-grid' },
        field('多少天没进展算「没动静」', num('staleDays', 1, 90), { hint: '默认 14 天。已经约好下一步日程的投递不算。' }),
        field('每周投递目标', num('weeklyGoal', 0, 100), { hint: '概览页会显示本周进度；填 0 表示不设目标。' }))),
    card('时区',
      h('div', { class: 'form-grid' },
        field('我所在的时区', tzSelect('homeTz', 'homeTzLabel')),
        field('显示名', input({ value: s.homeTzLabel, onChange: (v) => save({ homeTzLabel: v.trim() || s.homeTzLabel }) })),
        field('招聘方的时区', tzSelect('targetTz', 'targetTzLabel')),
        field('显示名', input({ value: s.targetTzLabel, onChange: (v) => save({ targetTzLabel: v.trim() || s.targetTzLabel }) })),
        field('录入日程时默认按', segmented(
          [{ value: s.targetTz, label: s.targetTzLabel }, { value: s.homeTz, label: s.homeTzLabel }],
          s.eventInputTz,
          (v) => save({ eventInputTz: v }),
        ), { tag: 'div', full: true }),
        h('div', { class: 'field full muted small' },
          `现在：${s.homeTzLabel} ${formatZoned(nowIso, s.homeTz)} · ${s.targetTzLabel} ${formatZoned(nowIso, s.targetTz)}`))),
    card('数据',
      h('p', { style: { marginTop: 0 } }, '所有数据都在 job-tracker/data/ 文件夹里，只存在这台电脑上。同一个文件 30 分钟内最多自动备份一次，放在 data/backups/，每个文件保留最近 30 份。'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', type: 'button', onClick: () => attempt(exportAll, '已导出') }, icon('download'), '导出全部数据（JSON）')),
      h('p', { class: 'muted small', style: { marginBottom: 0 } },
        '导出文件里没有简历原件和 JD 快照（它们在 data/resumes/ 和 data/jd/）。要找回旧数据，把 data/backups/ 里对应的文件复制回 data/，或者直接让 Claude 帮你恢复。')),
    card('日历',
      h('p', { style: { margin: 0 } }, '在「日程」页可以把所有面试、测评和网申截止订阅到苹果日历。 ',
        h('a', { href: '#/calendar' }, '去日程页'))),
    card('Chrome 插件（秋招助手）',
      h('ol', { style: { margin: 0, paddingLeft: '20px', lineHeight: 1.9 } },
        h('li', null, 'Chrome 地址栏打开 chrome://extensions ',
          h('button', { class: 'btn sm ghost', type: 'button', onClick: () => copyText('chrome://extensions', '地址已复制') }, icon('copy'), '复制')),
        h('li', null, '打开右上角的「开发者模式」'),
        h('li', null, '点「加载已解压的扩展程序」，选 job-tracker 里的 extension 文件夹'),
        h('li', null, '点工具栏的拼图图标，把「秋招助手」固定出来')),
      h('p', { class: 'muted small', style: { marginBottom: 0 } },
        '在网申页点插件图标或按 ⌥⇧J 打开侧边栏：一键填写、点选填充、把简历放进上传框、记录投递。插件用的是这里「档案」「简历」「素材库」的内容；Tracker 没启动时也能用上次的缓存填写。')),
    card('关于', about));
}
