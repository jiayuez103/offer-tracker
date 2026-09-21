// 投递详情抽屉：基本信息 / 日程与复盘 / JD / 时间线。输入框失焦即保存。
import { store } from '../store.js';
import {
  h, icon, openDrawer, field, input, textarea, select, stars, attempt, toast,
  confirmDialog, copyText, safeUrl, timeAgo, ensureCss, repaintWhenIdle,
} from '../ui.js';
import {
  STAGES, STAGE_LABEL, STATUS_LABEL, COMPANY_TYPES, TRACKS, BATCHES, CHANNELS,
  INDUSTRY_SUGGESTIONS, INTERVIEW_EVENT_TYPES, EVENT_STAGE,
} from '../../shared/constants.js';
import { newId, isClosed, stageIndex, textStats } from '../../shared/domain.js';
import { dualTime } from '../../shared/time.js';
import { openEventForm } from './eventForm.js';

const TABS = [['info', '基本信息'], ['events', '日程与复盘'], ['jd', 'JD'], ['timeline', '时间线']];

const TIMELINE_TEXT = {
  created: (e) => `创建（${STAGE_LABEL[e.to] || e.to || '—'}）`,
  stage: (e) => `${STAGE_LABEL[e.from] || e.from} → ${STAGE_LABEL[e.to] || e.to}`,
  status: (e) => `${STATUS_LABEL[e.from] || e.from} → ${STATUS_LABEL[e.to] || e.to}`,
  followup: (e) => e.text || '跟进了一次',
  note: (e) => e.text,
};

let current = null; // 同一时间只开一个抽屉

export function openAppDrawer(id, { tab = 'info' } = {}) {
  ensureCss('/css/components.css');
  if (!store.app(id)) {
    toast('这条投递已经不存在了', { type: 'error' });
    return null;
  }
  current?.close();

  let currentTab = tab;
  let unsubscribe = () => {};
  const drawer = openDrawer({
    onClose: () => {
      unsubscribe();
      if (current === drawer) current = null;
    },
  });
  current = drawer;
  const tabs = h('div', { class: 'tabs' });
  const pane = h('div', { class: 'tab-pane' });
  drawer.body.append(tabs, pane);

  const get = () => store.app(id);
  const save = (patch) => attempt(() => store.updateApplication(id, patch));

  // ---------- 头部 ----------
  function followup() {
    const app = get();
    const entry = { id: newId('tl'), at: new Date().toISOString(), type: 'followup', from: '', to: '', text: '跟进了一次' };
    save({ timeline: [...(app.timeline || []), entry] }).then((rec) => {
      if (rec) toast('记下了，「没动静」重新计时');
    });
  }

  async function remove() {
    const app = get();
    const name = [app.company, app.position].filter(Boolean).join(' · ');
    const ok = await confirmDialog(`删除「${name}」？它的日程、复盘和 JD 快照会一起删除，不能撤销。`, { okLabel: '删除', danger: true });
    if (ok) attempt(() => store.deleteApplication(id), '已删除');
  }

  function statusActions(app) {
    const btn = (label, onClick, cls = '') => h('button', { class: `btn sm ${cls}`, type: 'button', onClick }, label);
    if (app.status === 'rejected' || app.status === 'withdrawn') {
      return [h('span', { class: 'chip' }, STATUS_LABEL[app.status]), btn('恢复为进行中', () => save({ status: 'active' }))];
    }
    if (app.status === 'accepted' || app.status === 'declined') {
      return [h('span', { class: ['chip', app.status === 'accepted' && 'ok'] }, STATUS_LABEL[app.status]), btn('撤销', () => save({ status: 'active' }))];
    }
    if (app.stage === 'offer') {
      return [btn('接受 Offer', () => save({ status: 'accepted' })), btn('拒绝 Offer', () => save({ status: 'declined' }))];
    }
    return [btn('我跟进了', followup), btn('放弃', () => save({ status: 'withdrawn' })), btn('挂了', () => save({ status: 'rejected' }), 'danger')];
  }

  function renderHead() {
    const app = get();
    if (!app) return;
    drawer.head.replaceChildren(
      h('div', { class: 'dh-title' },
        h('h2', null, app.company || app.companyEn || '未命名公司'),
        stars(app.priority || 2, (v) => save({ priority: v }))),
      h('div', { class: 'dh-sub' }, app.position || '—'),
      h('div', { class: 'dh-actions' },
        h('select', { class: 'select stage-select', value: app.stage, 'aria-label': '阶段', onChange: (e) => save({ stage: e.target.value }) },
          STAGES.map((st) => h('option', { value: st.key }, st.label))),
        statusActions(app),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm ghost danger icon-only', type: 'button', title: '删除这条投递', onClick: remove }, icon('trash'))),
    );
  }

  function renderTabs() {
    const app = get();
    if (!app) return;
    tabs.replaceChildren(...TABS.map(([key, label]) => h('button', {
      type: 'button',
      class: key === currentTab ? 'on' : '',
      onClick: () => {
        currentTab = key;
        renderTabs();
        renderPane();
      },
    }, label, key === 'events' && app.events?.length ? h('span', { class: 'tab-count' }, String(app.events.length)) : null)));
  }

  function renderPane() {
    const app = get();
    if (!app) return;
    const build = { info: infoPane, events: eventsPane, jd: jdPane, timeline: timelinePane }[currentTab];
    pane.replaceChildren(build(app));
  }

  // ---------- 基本信息 ----------
  function infoPane(app) {
    const text = (key, placeholder = '') => input({ value: app[key] || '', placeholder, onChange: (v) => save({ [key]: v.trim() }) });
    const pick = (key, options) => select(options, app[key] || '', (v) => save({ [key]: v }), { placeholder: '未选择' });
    const date = (key) => input({ type: 'date', value: app[key] || '', onChange: (v) => save({ [key]: v }) });
    const url = (key) => h('div', { class: 'url-field' },
      input({ type: 'url', value: app[key] || '', placeholder: 'https://…', onChange: (v) => save({ [key]: v.trim() }) }),
      h('button', {
        type: 'button',
        class: 'btn icon-only',
        title: '打开链接',
        onClick: () => {
          const u = safeUrl(get()[key]);
          if (u) window.open(u, '_blank', 'noopener');
          else toast('链接要以 http:// 或 https:// 开头');
        },
      }, icon('external')));
    const resumes = store.state.resumes.map((r) => ({ value: r.id, label: r.name || '未命名版本' }));

    return h('div', { class: 'form-grid' },
      field('公司', text('company', '如：雀巢')),
      field('公司英文名', text('companyEn', '如：Nestlé')),
      field('岗位', text('position', '如：Marketing MT')),
      field('赛道', pick('track', TRACKS)),
      field('公司类型', pick('companyType', COMPANY_TYPES)),
      field('行业', h('div', null,
        input({ value: app.industry || '', list: 'jt-industries', onChange: (v) => save({ industry: v.trim() }) }),
        h('datalist', { id: 'jt-industries' }, INDUSTRY_SUGGESTIONS.map((s) => h('option', { value: s }))))),
      field('城市', text('cities', '多个用 / 分隔')),
      field('批次', pick('batch', BATCHES)),
      field('渠道', pick('channel', CHANNELS)),
      field('投的简历', select(resumes, resumes.some((r) => r.value === app.resumeId) ? app.resumeId : '', (v) => save({ resumeId: v }), { placeholder: resumes.length ? '未选择' : '先到「简历」页添加版本' })),
      field('内推人', text('referrer')),
      field('内推码', text('referralCode')),
      field('网申截止（北京时间）', date('deadline')),
      field('投递日期', date('appliedAt')),
      field('JD 链接', url('jdUrl'), { full: true, tag: 'div' }),
      field('网申入口', url('applyUrl'), { full: true, tag: 'div' }),
      field('官网注册账号', text('account', '注册用的邮箱或手机号（不要填密码）'), { full: true }),
      field('下一步', text('nextStep', '如：周五前完成 SHL 测评'), { full: true }),
      field('备注', textarea({ value: app.notes || '', rows: 4, onChange: (v) => save({ notes: v }) }), { full: true }));
  }

  // ---------- 日程与复盘 ----------
  function updateEvent(eventId, patch) {
    const app = get();
    return save({ events: app.events.map((e) => (e.id === eventId ? { ...e, ...patch } : e)) });
  }

  function onEventSaved(event) {
    const app = get();
    const exists = app.events.some((e) => e.id === event.id);
    const events = exists ? app.events.map((e) => (e.id === event.id ? event : e)) : [...app.events, event];
    save({ events }).then((rec) => {
      if (!rec) return;
      const target = EVENT_STAGE[event.type];
      if (!exists && target && !isClosed(rec) && stageIndex(target) > stageIndex(rec.stage)) {
        toast(`要把进度推进到「${STAGE_LABEL[target]}」吗？`, { action: { label: '推进', onClick: () => save({ stage: target }) } });
      }
    });
  }

  function reviewBox(ev) {
    const r = ev.review || {};
    const saveReview = (patch) => {
      const latest = get().events.find((e) => e.id === ev.id);
      updateEvent(ev.id, { review: { questions: '', reflection: '', rating: 0, ...(latest?.review || {}), ...patch } });
    };
    return h('div', { class: 'review' },
      h('div', { class: 'review-head' },
        icon('message'), '复盘',
        h('span', { class: 'spacer' }),
        h('span', { class: 'muted' }, '自评'),
        stars(r.rating || 0, (v) => saveReview({ rating: v }), 5, '自评')),
      field('被问到的问题', textarea({ value: r.questions || '', rows: 3, placeholder: '一行一个，面同类岗位前拿出来复习', onChange: (v) => saveReview({ questions: v }) })),
      field('哪里答得好、哪里要改', textarea({ value: r.reflection || '', rows: 3, onChange: (v) => saveReview({ reflection: v }) })));
  }

  function eventItem(ev) {
    const t = dualTime(ev.at, ev.tz, store.state.settings);
    const past = Date.parse(ev.at) < Date.now();
    const link = safeUrl(ev.location);
    const del = async () => {
      if (!(await confirmDialog(`删除日程「${ev.type}${ev.title ? ` · ${ev.title}` : ''}」？`, { okLabel: '删除', danger: true }))) return;
      const app = get();
      save({ events: app.events.filter((e) => e.id !== ev.id) });
    };
    return h('div', { class: ['event', ev.done && 'done', past && !ev.done && 'overdue'] },
      h('div', { class: 'event-main' },
        h('input', { type: 'checkbox', checked: !!ev.done, title: '标记为已完成', onChange: (e) => updateEvent(ev.id, { done: e.target.checked }) }),
        h('div', { class: 'event-text' },
          h('div', { class: 'event-title' }, h('span', { class: 'chip accent' }, ev.type), ev.title || ''),
          h('div', { class: 'event-time' }, t.primary, h('span', { class: 'muted' }, ` · ${t.secondary}`)),
          ev.location
            ? h('div', { class: 'event-loc' }, link ? h('a', { href: link, target: '_blank', rel: 'noopener' }, icon('link'), '打开会议链接') : ev.location)
            : null),
        h('div', { class: 'event-actions' },
          h('button', { class: 'btn sm ghost icon-only', type: 'button', title: '编辑', onClick: () => openEventForm({ app: get(), event: ev, onSave: onEventSaved }) }, icon('edit')),
          h('button', { class: 'btn sm ghost icon-only', type: 'button', title: '删除', onClick: del }, icon('trash')))),
      INTERVIEW_EVENT_TYPES.includes(ev.type) && (past || ev.review) ? reviewBox(ev) : null);
  }

  function eventsPane(app) {
    const s = store.state.settings;
    const add = h('button', { class: 'btn primary sm', type: 'button', onClick: () => openEventForm({ app: get(), onSave: onEventSaved }) }, icon('plus'), '添加日程');
    const events = [...(app.events || [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    if (!events.length) {
      return h('div', { class: 'empty' }, h('div', null, `测评、笔试、面试都记在这里，时间会同时显示${s.targetTzLabel}和${s.homeTzLabel}。`), add);
    }
    return h('div', { class: 'events' },
      h('div', { class: 'row' }, h('span', { class: 'muted small' }, `共 ${events.length} 个日程`), h('span', { class: 'spacer' }), add),
      events.map((ev) => eventItem(ev)));
  }

  // ---------- JD ----------
  function jdPane(app) {
    const box = textarea({ rows: 18, cls: 'jd-text', placeholder: '加载中…' });
    box.disabled = true;
    const stats = h('span', { class: 'muted small' });
    const updateStats = () => { stats.textContent = `${textStats(box.value).chars} 字`; };
    box.addEventListener('input', updateStats);
    const link = safeUrl(app.jdUrl);
    store.getJd(id)
      .then((text) => { box.value = text; })
      .catch((e) => toast(e.message, { type: 'error' }))
      .finally(() => {
        box.disabled = false;
        box.placeholder = '把 JD 全文粘贴到这里保存。JD 截止后常被下架，面试前还能在这里复习。';
        updateStats();
      });
    return h('div', { class: 'jd-pane' },
      h('div', { class: 'row' },
        stats,
        h('span', { class: 'spacer' }),
        link ? h('a', { class: 'btn', href: link, target: '_blank', rel: 'noopener' }, icon('external'), '原链接') : null,
        h('button', { class: 'btn', type: 'button', onClick: () => copyText(box.value) }, icon('copy'), '复制'),
        h('button', { class: 'btn primary', type: 'button', onClick: () => attempt(() => store.saveJd(id, box.value), box.value.trim() ? 'JD 已保存' : 'JD 快照已删除') }, '保存')),
      box,
      h('div', { class: 'muted small' }, app.jdFile ? `保存在 data/${app.jdFile}` : '还没有保存 JD 快照'));
  }

  // ---------- 时间线 ----------
  function timelinePane(app) {
    const note = input({ placeholder: '记一笔，比如：HR 说两周内出结果' });
    const addNote = async () => {
      const text = note.value.trim();
      if (!text) return;
      const entry = { id: newId('tl'), at: new Date().toISOString(), type: 'note', from: '', to: '', text };
      const rec = await save({ timeline: [...(get().timeline || []), entry] });
      if (rec) {
        renderPane();
        pane.querySelector('input')?.focus();
      }
    };
    note.addEventListener('keydown', (e) => { if (e.key === 'Enter') addNote(); });
    const items = [...(app.timeline || [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return h('div', { class: 'timeline-pane' },
      h('div', { class: 'row' }, note, h('button', { class: 'btn', type: 'button', onClick: addNote }, '添加')),
      h('ol', { class: 'timeline' }, items.map((e) => h('li', { class: `tl-${e.type}` },
        h('span', { class: 'tl-dot' }),
        h('div', { class: 'tl-body' },
          h('div', null, (TIMELINE_TEXT[e.type] || ((x) => x.text || x.type))(e)),
          h('div', { class: 'muted small', title: new Date(e.at).toLocaleString('zh-CN') }, timeAgo(e.at)))))));
  }

  // ---------- 启动与同步 ----------
  renderHead();
  renderTabs();
  renderPane();

  const repaintPane = repaintWhenIdle(pane, renderPane);

  unsubscribe = store.subscribe((topic) => {
    if (!['applications', 'load', 'settings', 'resumes'].includes(topic)) return;
    if (!get()) {
      drawer.close();
      return;
    }
    renderHead();
    renderTabs();
    // 基本信息页的输入框自己就是最新值，只有外部改动（load）时才重画；JD 页永远不自动重画
    const shouldRepaint = currentTab === 'events' || currentTab === 'timeline' || (currentTab === 'info' && topic !== 'applications');
    if (shouldRepaint) repaintPane();
  });

  return drawer;
}
