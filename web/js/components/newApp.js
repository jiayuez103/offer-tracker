// 新建投递：左边粘贴 JD 和链接（可选），右边是表单。
// 粘贴后自动识别公司、类型、岗位、城市、截止日；只填空着的或上次自动填的字段，不覆盖手改的。
import { store } from '../store.js';
import {
  h, field, input, textarea, select, segmented, openModal, confirmDialog,
  attempt, toast, ensureCss, openApp, debounce,
} from '../ui.js';
import { TRACKS, COMPANY_TYPES, CHANNELS } from '../../shared/constants.js';
import { parseJD } from '../../shared/jdparse.js';

const PARSED_FIELDS = [['company', '公司'], ['companyType', '类型'], ['position', '岗位'], ['cities', '城市'], ['deadline', '截止日']];
const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

export function openNewApp(preset = {}) {
  ensureCss('/css/components.css');
  const data = {
    company: '', companyEn: '', position: '', track: '', companyType: '', cities: '', deadline: '',
    stage: 'wishlist', channel: '官网', resumeId: '', jdUrl: '',
    ...preset,
  };
  let jdText = '';
  let busy = false;
  const edited = new Set(); // 用户亲手改过的字段
  const autoFilled = new Set(); // 自动识别填进去的字段
  const controls = {};

  const bind = (key, el, event = 'input') => {
    el.addEventListener(event, () => {
      data[key] = el.value;
      edited.add(key);
      autoFilled.delete(key);
    });
    controls[key] = el;
    return el;
  };
  const text = (key, placeholder = '') => bind(key, input({ value: data[key], placeholder }));
  const pick = (key, options, placeholder = '未选择') => bind(key, select(options, data[key], null, { placeholder }), 'change');

  const hint = h('div', { class: 'parse-hint' }, '粘贴 JD 后会自动识别公司、岗位、城市和截止日');
  const url = bind('jdUrl', input({ type: 'url', value: data.jdUrl, placeholder: 'https://…（可选）' }));
  const jd = textarea({ rows: 14, placeholder: '把 JD 全文粘贴到这里（可选）。会一起存成 JD 快照，官网下架了也能复习。' });

  function runParse() {
    const found = parseJD(jdText, data.jdUrl);
    for (const [key] of PARSED_FIELDS) {
      const value = found[key];
      if (!value || edited.has(key) || data[key] === value) continue;
      if (data[key] && !autoFilled.has(key)) continue;
      data[key] = value;
      autoFilled.add(key);
      const el = controls[key];
      el.value = value;
      el.classList.remove('filled');
      void el.offsetWidth; // 只给这次真正改了的字段重新触发高亮
      el.classList.add('filled');
    }
    const labels = PARSED_FIELDS.filter(([key]) => autoFilled.has(key)).map(([, label]) => label);
    if (labels.length) {
      hint.textContent = `识别到：${labels.join('、')}（可以直接改）`;
      hint.className = 'parse-hint ok';
    } else if (jdText.trim() || data.jdUrl) {
      hint.textContent = '没识别出字段，手动填一下就好';
      hint.className = 'parse-hint';
    }
  }
  const parseSoon = debounce(runParse, 350);
  jd.addEventListener('input', () => {
    jdText = jd.value;
    parseSoon();
  });
  url.addEventListener('change', runParse);

  const resumes = store.state.resumes.map((r) => ({ value: r.id, label: r.name || '未命名版本' }));
  const body = h('div', { class: 'newapp' },
    h('div', { class: 'newapp-jd' },
      field('JD 链接', url),
      field('JD 全文', jd),
      hint),
    h('div', { class: 'form-grid' },
      field('公司', text('company', '如：雀巢')),
      field('公司英文名', text('companyEn', '如：Nestlé')),
      field('岗位', text('position', '如：Marketing MT'), { full: true }),
      field('赛道', pick('track', TRACKS)),
      field('公司类型', pick('companyType', COMPANY_TYPES)),
      field('城市', text('cities', '多个用 / 分隔')),
      field('网申截止（北京时间）', bind('deadline', input({ type: 'date', value: data.deadline }), 'change')),
      field('渠道', pick('channel', CHANNELS)),
      field('投的简历', pick('resumeId', resumes, resumes.length ? '未选择' : '还没有简历版本')),
      field('状态', segmented([{ value: 'wishlist', label: '还没投' }, { value: 'applied', label: '已投递' }], data.stage, (v) => { data.stage = v; }), { full: true, tag: 'div' })));

  async function submit(close) {
    if (busy) return;
    if (!data.company.trim() && !data.position.trim()) {
      toast('公司和岗位至少填一个', { type: 'error' });
      controls.company.focus();
      return;
    }
    const dup = store.state.applications.find((a) => norm(a.company) === norm(data.company) && norm(a.position) === norm(data.position));
    if (dup && !(await confirmDialog(`已经有「${dup.company} · ${dup.position}」这条记录了，还要再建一条吗？`, { okLabel: '仍然新建' }))) return;
    busy = true;
    const payload = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    const rec = await attempt(() => store.createApplication(payload));
    busy = false;
    if (!rec) return;
    close();
    if (jdText.trim()) await attempt(() => store.saveJd(rec.id, jdText));
    toast(`已添加「${rec.company || rec.position}」`, { action: { label: '查看', onClick: () => openApp(rec.id) } });
  }

  const modal = openModal({
    title: '新建投递',
    wide: true,
    body,
    actions: [
      { label: '取消', ghost: true, onClick: (close) => close() },
      { label: '保存（⌘↩）', primary: true, onClick: (close) => submit(close) },
    ],
  });
  modal.el.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(modal.close);
  });
  requestAnimationFrame(() => jd.focus());
  return modal;
}
