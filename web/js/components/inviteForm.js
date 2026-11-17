// 粘贴测评 / AI 面试的邀请邮件 → 自动算出截止时间 → 存成日程。
// 不保存邮件原文，只留解析出来的字段和一句依据。
import { api } from '../api.js';
import { store } from '../store.js';
import { h, field, input, textarea, select, segmented, openModal, toast, openApp, ensureCss, debounce } from '../ui.js';
import { EVENT_TYPES } from '../../shared/constants.js';
import { newId, stageIndex } from '../../shared/domain.js';
import { parseInvite, deadlineFrom } from '../../shared/invite.js';
import { zonedToISO, isoToLocalInput, dualTime, formatZoned } from '../../shared/time.js';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180].map((m) => ({ value: String(m), label: m < 60 ? `${m} 分钟` : `${m / 60} 小时` }));
const NEW_APP = '__new__';

/** 同一家公司的排最前，进行中的在前、已结束的在后（已结束的也列出来，否则「认出了公司却找不到它」很奇怪） */
function appOptions(apps, company) {
  const rank = (a) => (a.company === company ? 0 : 2) + (a.status === 'active' ? 0 : 1);
  return [...apps]
    .sort((x, y) => rank(x) - rank(y))
    .map((a) => ({
      value: a.id,
      label: `${a.company || '未命名'}${a.position ? ` · ${a.position}` : ''}${a.status === 'active' ? '' : '（已结束）'}`,
    }));
}

/** pending：邮件一键导入已经解析好的一条，有就跳过粘贴这一步 */
export function openInviteForm({ pending = null } = {}) {
  ensureCss('/css/components.css'); // 截止时间预览那块的样式在这里；从概览页直接打开时还没加载过
  const s = store.state.settings;
  const apps = store.state.applications;
  let parsed = null;
  let local = '';                 // 算出来或手填的截止时间（本地输入格式）
  let receivedLocal = '';         // 邮件收到时间
  let win = { n: 5, unit: 'day' };// 窗口规则
  let useWindow = true;           // true = 按「收到后 N 天」算，false = 直接填截止时间
  let tz = s.eventInputTz || s.targetTz;
  const draft = { type: '测评', durationMin: 60, link: '', appId: NEW_APP, company: '', position: '', advance: true };

  let raw = '';
  // 粘进去（或改完）停一下就自动识别，下面的表单随之出现
  const recognizeSoon = debounce(() => { if (raw.trim()) run(); }, 400);
  const paste = textarea({ rows: 7, placeholder: '粘贴邀请邮件正文', onInput: (v) => { raw = v; recognizeSoon(); } });
  const preview = h('div', { class: 'form-grid' });
  const basis = h('p', { class: 'muted small full' });

  const tzOptions = [{ value: s.targetTz, label: s.targetTzLabel }, { value: s.homeTz, label: s.homeTzLabel }];

  /**
   * 邮件正文里一般没有收到日期（它在信头，复制不到），所以让用户填「收到时间」，
   * 截止时间由「收到时间 + 窗口」算出来 —— 用户不用自己心算 5 天后是哪天。
   * 邮件写的是绝对日期（「请于 11 月 5 日前」）时，切到「直接填截止时间」。
   */
  function timeRow() {
    const box = h('div', { class: 'tz-preview muted small' });
    const rows = h('div', { class: 'form-grid full', style: { padding: 0 } });

    const draw = () => {
      if (useWindow) local = recompute();
      // 有截止时间才显示这块，直接给结果
      box.hidden = !local;
      if (local) {
        const iso = zonedToISO(local, tz);
        box.textContent = `截止：${dualTime(iso, tz, s).primary} · ${dualTime(iso, tz, s).secondary}`;
      }
    };

    const recompute = () => {
      if (!receivedLocal || !win.n) return '';
      const at = deadlineFrom({ receivedAt: zonedToISO(receivedLocal, tz), window: win, tz });
      return at ? isoToLocalInput(at, tz) : '';
    };

    const redraw = () => {
      rows.replaceChildren(...(useWindow
        ? [
          field('邮件收到时间', input({
            type: 'datetime-local',
            value: receivedLocal,
            onInput: (v) => { receivedLocal = v; draw(); },
          })),
          field('要求多久内完成', h('div', { class: 'row' },
            input({
              type: 'number',
              value: String(win.n || ''),
              cls: 'narrow',
              onInput: (v) => { win = { ...win, n: Number(v) || 0 }; draw(); },
            }),
            segmented([{ value: 'day', label: '天' }, { value: 'business', label: '工作日' }], win.unit, (v) => {
              win = { ...win, unit: v };
              draw();
            })), { tag: 'div' }),
        ]
        : [
          field('截止时间', input({
            type: 'datetime-local',
            value: local,
            onInput: (v) => { local = v; draw(); },
          })),
        ]),
      field('这个时间是', segmented(tzOptions, tz, (v) => { tz = v; draw(); }), { tag: 'div' }),
      h('div', { class: 'field full' },
        box,
        h('button', {
          class: 'link',
          type: 'button',
          onClick: () => { useWindow = !useWindow; redraw(); draw(); },
        }, useWindow ? '直接填截止时间' : '按收到时间算')));
      draw();
    };

    redraw();
    return [rows];
  }

  function drawPreview() {
    const options = appOptions(apps, draft.company);
    const newFields = draft.appId === NEW_APP
      ? [
        field('公司', input({ value: draft.company, onInput: (v) => { draft.company = v; } })),
        field('岗位', input({ value: draft.position, onInput: (v) => { draft.position = v; } })),
      ]
      : [h('div', { class: 'field' }, h('span', null, '阶段'), h('label', { class: 'row small' },
        h('input', {
          type: 'checkbox',
          checked: draft.advance,
          onChange: (e) => { draft.advance = e.target.checked; },
        }), '把这条推进到「测评」'))];

    preview.replaceChildren(
      field('类型', select(EVENT_TYPES, draft.type, (v) => { draft.type = v; })),
      field('时长', select(DURATIONS, String(draft.durationMin), (v) => { draft.durationMin = Number(v); })),
      ...timeRow(),
      field('链接', input({ value: draft.link, onInput: (v) => { draft.link = v.trim(); } })),
      field('记到哪条投递', select([...options, { value: NEW_APP, label: '＋ 新建一条投递' }], draft.appId, (v) => {
        draft.appId = v;
        drawPreview();
      }), { full: true }),
      ...newFields,
      basis);
  }

  function run() {
    if (!raw.trim()) {
      toast('先把邮件正文粘进来', { type: 'error' });
      return;
    }
    const companies = apps.map((a) => ({ company: a.company, companyEn: a.companyEn }));
    apply(parseInvite(raw, { receivedAt: new Date(), settings: s, companies }));
  }

  function apply(result) {
    parsed = result;
    draft.type = parsed.type;
    draft.durationMin = parsed.durationMin || 60;
    draft.link = parsed.link;
    draft.company = parsed.company;
    tz = parsed.tz || tz;
    // 窗口规则认出来了就走「收到时间 + 窗口」；邮件写的是绝对日期就直接填截止
    useWindow = Boolean(parsed.window);
    if (parsed.window) win = parsed.window;
    receivedLocal = isoToLocalInput(parsed.windowStart || new Date().toISOString(), tz);
    local = parsed.deadline ? isoToLocalInput(parsed.deadline, tz) : '';
    const match = apps.find((a) => a.company === parsed.company && a.status === 'active');
    draft.appId = match ? match.id : NEW_APP;
    draft.advance = Boolean(match && stageIndex(match.stage) < stageIndex('assessment'));
    basis.textContent = parsed.basis ? `「${parsed.basis}」` : '没找到期限';
    drawPreview();
  }

  const body = h('div', { class: 'invite-form' },
    paste,
    preview);

  async function save(close) {
    if (!local) {
      toast('还缺截止时间', { type: 'error' });
      return;
    }
    const at = zonedToISO(local, tz);
    const event = {
      id: newId('evt'),
      type: draft.type,
      mode: 'deadline',
      title: '',
      at,
      tz,
      durationMin: draft.durationMin,
      location: draft.link,
      windowStart: receivedLocal ? zonedToISO(receivedLocal, tz) : (parsed ? parsed.windowStart : new Date().toISOString()),
      basis: parsed ? parsed.basis : '',
      done: false,
      review: null,
    };
    try {
      let app;
      if (draft.appId === NEW_APP) {
        if (!draft.company.trim() && !draft.position.trim()) {
          toast('新建投递至少要填公司或岗位', { type: 'error' });
          return;
        }
        app = await store.createApplication({
          company: draft.company.trim(),
          position: draft.position.trim(),
          stage: 'assessment',
          channel: '官网',
        });
        await store.updateApplication(app.id, { events: [event] });
      } else {
        app = store.app(draft.appId);
        const patch = { events: [...(app.events || []), event] };
        if (draft.advance && stageIndex(app.stage) < stageIndex('assessment')) patch.stage = 'assessment';
        await store.updateApplication(app.id, patch);
      }
      if (pending) api.del(`/api/inbox/${pending.id}`).catch(() => {});
      close();
      toast(`已加入日程 · ${formatZoned(at, s.targetTz)}（${s.targetTzLabel}）`, {
        action: { label: '查看', onClick: () => openApp(app.id, { tab: 'events' }) },
      });
    } catch (e) {
      toast(e.message, { type: 'error' });
    }
  }

  const modal = openModal({
    title: '粘贴测评邀请',
    body,
    wide: true,
    actions: [
      { label: '取消', ghost: true, onClick: (close) => close() },
      { label: '存成日程', primary: true, onClick: save },
    ],
  });
  if (pending) {
    apply(pending);
    if (pending.excerpt) {
      raw = pending.excerpt;
      paste.value = pending.excerpt;
    }
  }
  else setTimeout(() => paste.focus(), 0);
  return modal;
}
