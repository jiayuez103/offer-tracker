// 档案：基本信息、求职意向、各类经历（可增删、排序）、技能与自我评价、自定义字段。
// 中英字段并排；停止输入 0.8 秒后按分节自动保存（PATCH 只改这一节，不会覆盖别的分节）。
import { store } from '../store.js';
import { h, icon, ensureCss, field, input, textarea, select, confirmDialog } from '../ui.js';
import { asBi, PROFILE_ENTRY, textStats } from '../../shared/domain.js';

const f = {
  text: (key, label, extra = {}) => ({ key, label, kind: 'text', ...extra }),
  month: (key, label) => ({ key, label, kind: 'text', inputType: 'month' }),
  date: (key, label) => ({ key, label, kind: 'text', inputType: 'date' }),
  select: (key, label, options) => ({ key, label, kind: 'select', options }),
  bi: (key, label, extra = {}) => ({ key, label, kind: 'bi', ...extra }),
  long: (key, label) => ({ key, label, kind: 'long' }),
};

const POLITICAL = ['群众', '共青团员', '中共预备党员', '中共党员', '民主党派', '其他'];
const titleOf = (v, fallback) => asBi(v).zh || asBi(v).en || fallback;

const SECTIONS = [
  {
    key: 'basic', title: '基本信息',
    fields: [
      f.bi('name', '姓名'), f.text('preferredName', '英文名 / 常用名', { placeholder: '如：Jasmine' }),
      f.bi('familyName', '姓'), f.bi('givenName', '名'),
      f.select('gender', '性别', ['女', '男']), f.date('birthDate', '出生日期'),
      f.text('phoneCountryCode', '手机区号', { placeholder: '+86' }), f.text('phone', '手机号'),
      f.text('email', '邮箱', { inputType: 'email' }), f.text('wechat', '微信号'),
      f.bi('currentCity', '现居城市'), f.bi('nationality', '国籍'),
      f.bi('hometown', '籍贯'), f.bi('residence', '户口所在地 / 生源地'),
      f.select('politicalStatus', '政治面貌', POLITICAL), f.text('ethnicity', '民族', { placeholder: '如：汉族' }),
      f.text('linkedin', 'LinkedIn', { inputType: 'url' }), f.text('website', '个人网站 / 作品集', { inputType: 'url' }),
    ],
  },
  {
    key: 'intent', title: '求职意向',
    fields: [
      f.bi('positions', '意向岗位'), f.bi('cities', '意向城市'),
      f.text('salary', '期望薪资', { placeholder: '如：面议' }), f.text('availableFrom', '最早到岗时间', { placeholder: '如：2027-07' }),
      f.select('acceptAdjustment', '是否接受调剂', ['是', '否']),
    ],
  },
  {
    key: 'education', title: '教育经历', list: true, itemTitle: (e) => titleOf(e.school, '新的教育经历'),
    fields: [
      f.bi('school', '学校'), f.bi('degree', '学历 / 学位', { placeholder: ['硕士', "Master's"] }),
      f.bi('major', '专业'), f.bi('college', '学院'),
      f.month('start', '开始'), f.month('end', '结束（预计）'),
      f.text('gpa', 'GPA'), f.text('gpaScale', '满分', { placeholder: '4.0' }),
      f.text('rank', '排名', { placeholder: '如：前 10%' }), f.bi('city', '城市'),
      f.long('courses', '主修课程'), f.long('honors', '在校荣誉'),
    ],
  },
  {
    key: 'work', title: '实习 / 工作经历', list: true, itemTitle: (e) => titleOf(e.company, '新的经历'),
    fields: [
      f.bi('company', '公司'), f.bi('title', '职位'),
      f.bi('department', '部门'), f.select('type', '类型', ['实习', '全职', '兼职']),
      f.month('start', '开始'), f.month('end', '结束'),
      f.bi('city', '城市'),
      f.long('description', '工作内容'),
    ],
  },
  {
    key: 'projects', title: '项目经历', list: true, itemTitle: (e) => titleOf(e.name, '新的项目'),
    fields: [
      f.bi('name', '项目名称'), f.bi('role', '角色'),
      f.month('start', '开始'), f.month('end', '结束'),
      f.long('description', '项目描述'),
    ],
  },
  {
    key: 'activities', title: '校园 / 社团经历', list: true, itemTitle: (e) => titleOf(e.org, '新的经历'),
    fields: [
      f.bi('org', '组织'), f.bi('role', '角色'),
      f.month('start', '开始'), f.month('end', '结束'),
      f.long('description', '经历描述'),
    ],
  },
  {
    key: 'awards', title: '获奖荣誉', list: true, itemTitle: (e) => titleOf(e.name, '新的奖项'),
    fields: [f.bi('name', '奖项'), f.month('date', '获得时间'), f.long('description', '说明')],
  },
  {
    key: 'languages', title: '语言能力', list: true, itemTitle: (e) => titleOf(e.language, '新的语言'),
    fields: [
      f.bi('language', '语言'), f.bi('level', '水平', { placeholder: ['精通', 'Fluent'] }),
      f.text('certificate', '证书', { placeholder: '如：IELTS / TOEFL / CET-6' }), f.text('score', '成绩'),
    ],
  },
  {
    key: 'certificates', title: '证书', list: true, itemTitle: (e) => titleOf(e.name, '新的证书'),
    fields: [f.bi('name', '证书名称'), f.month('date', '获得时间'), f.text('score', '成绩 / 等级')],
  },
  {
    key: 'summary', title: '技能 · 自我评价 · 兴趣', root: true,
    fields: [f.long('skills', '技能'), f.long('selfIntro', '自我评价'), f.long('hobbies', '兴趣爱好')],
  },
  {
    key: 'extras', title: '自定义字段', list: true, itemTitle: (e) => e.label || '新字段',
    hint: '网申里遇到档案没有的字段（比如「是否有海外经历」），加在这里，以后插件侧边栏可以点选填入。',
    fields: [f.text('label', '字段名'), f.bi('value', '内容')],
  },
];

export function render(root) {
  ensureCss('/css/profile.css');
  let profile = structuredClone(store.state.profile);
  let dirty = false; // 有外部改动但用户正在输入
  const timers = {};
  const pending = new Set();
  const painters = {};
  const status = h('span', { class: 'pf-status' }, '改动会自动保存');

  function setStatus(kind, message = '') {
    status.className = `pf-status ${kind}`;
    status.textContent = { pending: '有改动，马上自动保存…', saving: '保存中…', saved: '已保存', error: `保存失败：${message}` }[kind];
  }

  async function saveNow(key) {
    clearTimeout(timers[key]);
    pending.delete(key);
    setStatus('saving');
    try {
      await store.patchProfile({ [key]: profile[key] });
      setStatus(pending.size ? 'pending' : 'saved');
    } catch (e) {
      setStatus('error', e.message);
    }
  }

  function schedule(key) {
    pending.add(key);
    setStatus('pending');
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => saveNow(key), 800);
  }

  // ---------- 字段 ----------
  function renderField(def, obj, onChange) {
    if (def.kind === 'text') {
      return field(def.label, input({
        type: def.inputType || 'text',
        value: obj[def.key] || '',
        placeholder: def.placeholder || '',
        onInput: (v) => { obj[def.key] = v; onChange(); },
      }));
    }
    if (def.kind === 'select') {
      return field(def.label, select(def.options, obj[def.key] || '', (v) => { obj[def.key] = v; onChange(); }, { placeholder: '未选择' }));
    }
    const value = asBi(obj[def.key]);
    obj[def.key] = value; // 把写成字符串的旧数据统一成 {zh, en}
    if (def.kind === 'bi') {
      const [phZh, phEn] = def.placeholder || ['', ''];
      const cell = (lang, tag, ph) => h('span', { class: 'bi-cell' },
        h('span', { class: 'bi-tag' }, tag),
        input({ value: value[lang], placeholder: ph, onInput: (v) => { value[lang] = v; onChange(); } }));
      return field(def.label, h('div', { class: 'bi' }, cell('zh', '中', phZh), cell('en', 'EN', phEn)), { tag: 'div' });
    }
    const stats = h('span', null);
    const updateStats = () => { stats.textContent = `中文 ${textStats(value.zh).chars} 字 · English ${textStats(value.en).words} words`; };
    updateStats();
    const area = (lang, ph) => textarea({ value: value[lang], rows: 4, placeholder: ph, onInput: (v) => { value[lang] = v; updateStats(); onChange(); } });
    return field(def.label, h('div', { class: 'bi long' }, area('zh', '中文'), area('en', 'English')), { full: true, tag: 'div', hint: stats });
  }

  // ---------- 多段经历 ----------
  function addEntry(sec) {
    profile[sec.key].push(PROFILE_ENTRY[sec.key]());
    saveNow(sec.key);
    painters[sec.key]();
    const entries = document.querySelectorAll(`#pf-${sec.key} .pf-entry`);
    entries[entries.length - 1]?.querySelector('input')?.focus();
  }

  function move(sec, i, dir) {
    const list = profile[sec.key];
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    saveNow(sec.key);
    painters[sec.key]();
  }

  async function removeEntry(sec, i) {
    const ok = await confirmDialog(`删除「${sec.itemTitle(profile[sec.key][i])}」？`, { okLabel: '删除', danger: true });
    if (!ok) return;
    profile[sec.key].splice(i, 1);
    saveNow(sec.key);
    painters[sec.key]();
  }

  function entryCard(sec, entry, i, count) {
    const title = h('b', { class: 'pf-entry-title' }, sec.itemTitle(entry));
    const onChange = () => {
      title.textContent = sec.itemTitle(entry);
      schedule(sec.key);
    };
    return h('div', { class: 'pf-entry' },
      h('div', { class: 'pf-entry-head' },
        h('span', { class: 'pf-entry-index' }, String(i + 1)),
        title,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm ghost icon-only', type: 'button', title: '上移', disabled: i === 0, onClick: () => move(sec, i, -1) }, icon('up')),
        h('button', { class: 'btn sm ghost icon-only', type: 'button', title: '下移', disabled: i === count - 1, onClick: () => move(sec, i, 1) }, icon('down')),
        h('button', { class: 'btn sm ghost icon-only danger', type: 'button', title: '删除', onClick: () => removeEntry(sec, i) }, icon('trash'))),
      h('div', { class: 'form-grid' }, sec.fields.map((def) => renderField(def, entry, onChange))));
  }

  function renderSection(sec) {
    const el = h('section', { class: 'card pf-section', id: `pf-${sec.key}` });
    const paint = () => {
      const list = sec.list ? profile[sec.key] : null;
      let body;
      if (list) {
        body = list.length
          ? h('div', { class: 'pf-entries' }, list.map((entry, i) => entryCard(sec, entry, i, list.length)))
          : h('div', { class: 'empty small' }, '还没有内容');
      } else {
        body = h('div', { class: 'form-grid' }, sec.fields.map((def) => (sec.root
          ? renderField(def, profile, () => schedule(def.key))
          : renderField(def, profile[sec.key], () => schedule(sec.key)))));
      }
      el.replaceChildren(
        h('div', { class: 'pf-head' },
          h('h2', null, sec.title),
          list ? h('span', { class: 'muted small' }, `${list.length} 条`) : null,
          h('span', { class: 'spacer' }),
          list ? h('button', { class: 'btn sm', type: 'button', onClick: () => addEntry(sec) }, icon('plus'), '添加') : null),
        sec.hint ? h('p', { class: 'muted small pf-hint' }, sec.hint) : '',
        body);
    };
    painters[sec.key] = paint;
    paint();
    return el;
  }

  // ---------- 页面 ----------
  const nav = h('nav', { class: 'pf-nav' }, SECTIONS.map((s) => h('a', {
    href: '#/profile',
    onClick: (e) => {
      e.preventDefault();
      document.getElementById(`pf-${s.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  }, s.title)));
  const main = h('div', { class: 'pf-main' });
  const buildAll = () => {
    main.replaceChildren(
      h('div', { class: 'pf-bar' },
        status,
        h('span', { class: 'spacer' }),
        h('span', { class: 'muted small' }, '英文网申会用 EN 那一栏')),
      h('div', { class: 'pf-note' }, '以后的网申插件会用这里的内容填表。身份证号、护照号和密码不要存在这里。'),
      ...SECTIONS.map(renderSection));
  };
  buildAll();
  root.append(h('div', { class: 'pf' }, nav, main));

  const reloadFromStore = () => {
    profile = structuredClone(store.state.profile);
    buildAll();
  };
  main.addEventListener('focusout', () => {
    setTimeout(() => {
      if (dirty && !pending.size && !main.contains(document.activeElement)) {
        dirty = false;
        reloadFromStore();
      }
    }, 0);
  });
  const unsubscribe = store.subscribe((topic) => {
    if (topic !== 'load') return; // 自己保存触发的 'profile' 不需要重画
    if (pending.size || main.contains(document.activeElement)) dirty = true;
    else reloadFromStore();
  });
  const onBeforeUnload = (e) => {
    if (!pending.size) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  return () => {
    unsubscribe();
    window.removeEventListener('beforeunload', onBeforeUnload);
    for (const key of [...pending]) saveNow(key); // 切走页面前把还没保存的改动发出去
  };
}
