// 日程表单：类型、标题、时间 + 时区（默认北京时间）、时长、地点 / 会议链接。
// 下方实时显示换算到另一个时区的时间。
import { store } from '../store.js';
import { h, field, input, select, segmented, openModal, toast } from '../ui.js';
import { EVENT_TYPES } from '../../shared/constants.js';
import { newId } from '../../shared/domain.js';
import { zonedToISO, isoToLocalInput, dualTime } from '../../shared/time.js';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180].map((m) => ({ value: String(m), label: m < 60 ? `${m} 分钟` : `${m / 60} 小时` }));

/** onSave(event) 收到完整的日程对象（新建时带新 id） */
export function openEventForm({ app, event, onSave }) {
  const s = store.state.settings;
  const draft = event
    ? { ...event }
    : { id: newId('evt'), type: '面试', title: '', at: '', tz: s.eventInputTz || s.targetTz, durationMin: 60, location: '', done: false, review: null };
  let local = draft.at ? isoToLocalInput(draft.at, draft.tz) : '';

  const preview = h('div', { class: 'tz-preview muted small' });
  const updatePreview = () => {
    if (!local) {
      preview.textContent = '选好时间后，这里会显示换算到另一个时区的时间';
      return;
    }
    preview.textContent = `= ${dualTime(zonedToISO(local, draft.tz), draft.tz, s).secondary}`;
  };

  const when = input({ type: 'datetime-local', value: local, onInput: (v) => { local = v; updatePreview(); } });
  const tzOptions = [{ value: s.targetTz, label: s.targetTzLabel }, { value: s.homeTz, label: s.homeTzLabel }];
  const body = h('div', { class: 'form-grid' },
    field('类型', select(EVENT_TYPES, draft.type, (v) => { draft.type = v; })),
    field('标题（可选）', input({ value: draft.title, placeholder: '如：二面（业务）', onInput: (v) => { draft.title = v; } })),
    field('时间', when),
    // 换时区时墙上时间不变：用户的意思是「这个时间是北京时间」
    field('这个时间是', segmented(tzOptions, draft.tz, (v) => { draft.tz = v; updatePreview(); }), { tag: 'div' }),
    field('时长', select(DURATIONS, String(draft.durationMin || 60), (v) => { draft.durationMin = Number(v); })),
    field('地点 / 会议链接', input({ value: draft.location, placeholder: '会议链接或面试地址', onInput: (v) => { draft.location = v.trim(); } })),
    h('div', { class: 'field full' }, preview));
  updatePreview();

  return openModal({
    title: event ? '编辑日程' : `添加日程 · ${app.company || app.position || ''}`,
    body,
    actions: [
      { label: '取消', ghost: true, onClick: (close) => close() },
      {
        label: '保存',
        primary: true,
        onClick: (close) => {
          if (!local) {
            toast('请先选择时间', { type: 'error' });
            when.focus();
            return;
          }
          close();
          onSave({ ...draft, at: zonedToISO(local, draft.tz) });
        },
      },
    ],
  });
}
