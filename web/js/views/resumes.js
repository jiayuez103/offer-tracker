// 简历：按版本管理（比如 产品线-中文 / 市场线-英文），每个版本可以放多个文件（docx + pdf），
// 显示被多少条投递用过。
import { store } from '../store.js';
import {
  h, icon, ensureCss, input, select, textarea, attempt, confirmDialog,
  emptyState, fileSize, timeAgo, toast, repaintWhenIdle,
} from '../ui.js';
import { fileUrl } from '../api.js';
import { TRACKS } from '../../shared/constants.js';

const ACCEPT = '.pdf,.doc,.docx,.pages,.txt,.png,.jpg';
const MAX_BYTES = 20 * 1024 * 1024;

export function render(root) {
  ensureCss('/css/library.css');
  const draw = () => root.replaceChildren(build());
  draw();
  const repaint = repaintWhenIdle(root, draw);
  return store.subscribe((topic) => {
    if (['load', 'resumes', 'applications'].includes(topic)) repaint();
  });
}

function build() {
  const { resumes, applications } = store.state;
  const head = h('div', { class: 'lib-head' },
    h('p', { class: 'muted' }, '每个版本可以放多个文件，比如 Word 原稿和导出的 PDF。网申上传一般用 PDF。'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn primary', type: 'button', onClick: addVersion }, icon('plus'), '新建版本'));
  if (!resumes.length) return h('div', null, head, emptyState('还没有简历版本'));
  const used = (id) => applications.filter((a) => a.resumeId === id).length;
  return h('div', null, head, h('div', { class: 'resume-grid' }, resumes.map((r) => resumeCard(r, used(r.id)))));
}

function addVersion() {
  attempt(() => store.create('resumes', { name: '新版本', track: '', lang: 'zh', notes: '', files: [] }));
}

async function removeVersion(r, used) {
  const msg = used
    ? `「${r.name}」被 ${used} 条投递用过。删除后这些投递会显示为未选择简历，文件也会一起删除。确定吗？`
    : `删除「${r.name}」和它的所有文件？`;
  if (await confirmDialog(msg, { okLabel: '删除', danger: true })) attempt(() => store.remove('resumes', r.id), '已删除');
}

function resumeCard(r, used) {
  const save = (patch) => attempt(() => store.update('resumes', r.id, patch));

  async function upload(files) {
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        toast(`${file.name} 超过 20 MB，没有上传`, { type: 'error' });
        continue;
      }
      await attempt(() => store.uploadResumeFile(r.id, file), `已上传 ${file.name}`);
    }
  }

  const picker = h('input', { type: 'file', multiple: true, accept: ACCEPT, hidden: true, onChange: (e) => upload([...e.target.files]) });
  const drop = h('div', {
    class: 'dropzone',
    tabindex: '0',
    role: 'button',
    onClick: () => picker.click(),
    onKeydown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        picker.click();
      }
    },
    onDragover: (e) => {
      e.preventDefault();
      drop.classList.add('over');
    },
    onDragleave: () => drop.classList.remove('over'),
    onDrop: (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      upload([...e.dataTransfer.files]);
    },
  }, icon('upload'), h('span', null, '拖入文件，或点击选择'));

  const files = (r.files || []).map((file) => {
    const stored = file.stored.replace(/^resumes\//, '');
    const del = async () => {
      if (await confirmDialog(`删除文件「${file.name}」？`, { okLabel: '删除', danger: true })) {
        attempt(() => store.deleteResumeFile(r.id, stored));
      }
    };
    return h('li', { class: 'file-row' },
      icon('file'),
      h('a', { class: 'file-name', href: fileUrl(file.stored), target: '_blank', rel: 'noopener', title: file.name }, file.name),
      h('span', { class: 'muted small' }, `${fileSize(file.size)} · ${timeAgo(file.uploadedAt)}`),
      h('button', { class: 'btn sm ghost icon-only', type: 'button', title: '删除文件', onClick: del }, icon('trash')));
  });

  return h('section', { class: 'card resume-card' },
    h('div', { class: 'resume-top' },
      input({ value: r.name || '', cls: 'resume-name', placeholder: '版本名称', onChange: (v) => save({ name: v.trim() || '未命名版本' }) }),
      h('button', { class: 'btn sm ghost icon-only danger', type: 'button', title: '删除这个版本', onClick: () => removeVersion(r, used) }, icon('trash'))),
    h('div', { class: 'row' },
      select(TRACKS, r.track || '', (v) => save({ track: v }), { placeholder: '赛道' }),
      select([{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }], r.lang || 'zh', (v) => save({ lang: v })),
      h('span', { class: 'spacer' }),
      h('span', { class: 'chip' }, `用于 ${used} 条投递`)),
    files.length ? h('ul', { class: 'file-list' }, files) : null,
    drop,
    picker,
    textarea({ value: r.notes || '', rows: 2, placeholder: '备注：这一版的侧重点、改了什么…', onChange: (v) => save({ notes: v }) }));
}
