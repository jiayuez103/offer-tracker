// 设置：没动静天数、周目标、时区、导出数据、日历和插件说明、版本信息。
import { store } from '../store.js';
import { api } from '../api.js';
import { h, icon, field, input, textarea, select, segmented, attempt, toast, repaintWhenIdle, copyText } from '../ui.js';
import { todayInZone } from '../../shared/time.js';

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
  const about = h('p', { class: 'muted small', style: { margin: 0 } }, '秋招 Tracker');
  api.get('/api/ping').then((p) => { about.textContent = `秋招 Tracker v${p.version} · 本地服务运行中`; }).catch(() => {});

  return h('div', { class: 'settings' },
    h('div', { class: 'settings-col' },
      card('提醒',
        h('div', { class: 'form-grid' },
          field('多少天没进展算「没动静」', num('staleDays', 1, 90)),
          field('每周投递目标', num('weeklyGoal', 0, 100)))),
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
          ), { tag: 'div', full: true }))),
      card('数据',
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn', type: 'button', onClick: () => attempt(exportAll, '已导出') }, icon('download'), '导出全部数据（JSON）'))),
      card('关于', about)),
    h('div', { class: 'settings-col' },
      aiCard(s, save),
      card('Chrome 插件',
        h('ol', { class: 'steps' },
          h('li', null, 'chrome://extensions ',
            h('button', { class: 'btn sm ghost', type: 'button', onClick: () => copyText('chrome://extensions', '地址已复制') }, icon('copy'), '复制')),
          h('li', null, '打开「开发者模式」'),
          h('li', null, '「加载已解压的扩展程序」→ 选 extension 文件夹'),
          h('li', null, '固定「秋招助手」，在网申页按 ⌥⇧J 打开')))));
}

const AI_FORMATS = [
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic' },
];

/** 模型服务由用户自己配；key 存在本机，页面只知道配没配 */
function aiCard(s, save) {
  const ai = s.ai || {};
  const result = h('p', { class: 'muted small', style: { margin: 0 } });
  const keyInput = input({
    type: 'password',
    placeholder: ai.hasKey ? '已保存，留空就不改' : '本地模型可以留空',
    onChange: (v) => { if (v.trim()) save({ ai: { apiKey: v.trim() } }); },
  });
  const testBtn = h('button', { class: 'btn', type: 'button' }, icon('refresh'), '测试连接');
  testBtn.onclick = async () => {
    testBtn.disabled = true;
    result.textContent = '正在连接…';
    result.classList.remove('err');
    try {
      const r = await api.post('/api/ai/test', {});
      result.textContent = `连上了：${r.model} 回复「${r.reply}」`;
    } catch (e) {
      result.textContent = e.message;
      result.classList.add('err');
    } finally {
      testBtn.disabled = false;
    }
  };
  return card('AI 服务',
    h('div', { class: 'form-grid' },
      field('启用', h('label', { class: 'row' },
        h('input', { type: 'checkbox', checked: !!ai.enabled, onChange: (e) => save({ ai: { enabled: e.target.checked } }) })), { tag: 'div' }),
      field('接口格式', segmented(AI_FORMATS, ai.format || 'openai', (v) => save({ ai: { format: v } })), { tag: 'div' }),
      field('服务地址', input({ value: ai.baseUrl || '', placeholder: 'https://api.deepseek.com', onChange: (v) => save({ ai: { baseUrl: v.trim() } }) })),
      field('模型名', input({ value: ai.model || '', placeholder: 'deepseek-chat', onChange: (v) => save({ ai: { model: v.trim() } }) })),
      field('API key', keyInput),
      field('禁止出现的内容', textarea({
        rows: 3,
        value: (ai.forbidden || []).join('\n'),
        placeholder: '一行一条',
        onChange: (v) => save({ ai: { forbidden: v.split('\n').map((x) => x.trim()).filter(Boolean) } }),
      }), { full: true })),
    h('div', { class: 'row' },
      testBtn,
      ai.hasKey ? h('button', { class: 'btn ghost', type: 'button', onClick: () => save({ ai: { apiKey: null } }) }, '清除 key') : null,
      result));
}
