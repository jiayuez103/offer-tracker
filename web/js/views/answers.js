// 素材库：网申开放题的答案。按题型分类，带字数统计，记下用在了哪些投递。
import { store } from '../store.js';
import {
  h, icon, ensureCss, field, input, textarea, select, segmented, openModal,
  attempt, confirmDialog, copyText, emptyState, toast,
} from '../ui.js';
import { ANSWER_CATEGORIES } from '../../shared/constants.js';
import { textStats } from '../../shared/domain.js';

const PREF_KEY = 'jt.answers.filter';

// 常见题目，写新素材时作为输入建议
const QUESTION_SUGGESTIONS = {
  自我介绍: ['请做一个简短的自我介绍', 'Tell us about yourself.'],
  'Why 公司': ['你为什么想加入我们公司？', 'Why do you want to join us?'],
  'Why 岗位': ['为什么选择这个岗位 / 职能？', 'Why are you interested in this function?'],
  领导力: ['描述一次你带领团队达成目标的经历', 'Describe a time you led a team to achieve a goal.'],
  团队合作: ['描述一次你和意见不同的队友合作的经历', 'Tell us about a time you worked with someone who disagreed with you.'],
  '挑战/失败': ['描述一次你遇到的挫折，以及你从中学到了什么', 'Describe a setback and what you learned from it.'],
  创新: ['描述一次你提出新想法并推动落地的经历', 'Tell us about a time you came up with a new idea and made it happen.'],
  职业规划: ['你未来 3–5 年的职业规划是什么？', 'Where do you see yourself in five years?'],
  优缺点: ['你最大的优点和缺点是什么？', 'What are your greatest strengths and weaknesses?'],
  其他: [],
};

function loadFilter() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return { category: saved.category || '', lang: saved.lang || '', q: '' };
  } catch {
    return { category: '', lang: '', q: '' };
  }
}

function saveFilter(filter) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ category: filter.category, lang: filter.lang }));
  } catch {
    // 忽略
  }
}

const statsText = (text, lang) => {
  const s = textStats(text);
  return lang === 'en' ? `${s.words} words` : `${s.chars} 字`;
};

export function render(root) {
  ensureCss('/css/library.css');
  const filter = loadFilter();
  const chips = h('div', { class: 'cat-chips' });
  const list = h('div', { class: 'answer-grid' });
  const search = input({ placeholder: '搜索题目、回答、标签', onInput: (v) => { filter.q = v.trim().toLowerCase(); drawList(); } });
  const lang = segmented(
    [{ value: '', label: '全部' }, { value: 'zh', label: '中文' }, { value: 'en', label: 'English' }],
    filter.lang,
    (v) => { filter.lang = v; saveFilter(filter); drawList(); },
  );
  root.append(
    h('div', { class: 'lib-head' },
      h('p', { class: 'muted' }, '网申开放题写过一次就存下来，下次遇到同类题改一改就能用。'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary', type: 'button', onClick: () => openEditor(null, filter) }, icon('plus'), '新建素材')),
    h('div', { class: 'lib-toolbar' }, h('div', { class: 'lib-search' }, search), lang),
    chips,
    list);

  function drawChips() {
    const all = store.state.answers;
    const chip = (value, label, n) => h('button', {
      type: 'button',
      class: ['cat-chip', filter.category === value && 'on'],
      onClick: () => { filter.category = value; saveFilter(filter); draw(); },
    }, label, h('span', { class: 'n' }, String(n)));
    chips.replaceChildren(
      chip('', '全部', all.length),
      ...ANSWER_CATEGORIES.map((c) => chip(c, c, all.filter((a) => a.category === c).length)));
  }

  function drawList() {
    const items = store.state.answers.filter((a) => (!filter.category || a.category === filter.category)
      && (!filter.lang || a.lang === filter.lang)
      && (!filter.q || `${a.question} ${a.text} ${(a.tags || []).join(' ')}`.toLowerCase().includes(filter.q)))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    list.replaceChildren(...(items.length
      ? items.map((a) => answerCard(a, filter))
      : [emptyState(store.state.answers.length ? '没有符合条件的素材' : '还没有素材。先把最常被问的「为什么选择我们」写下来吧。')]));
  }

  const draw = () => {
    drawChips();
    drawList();
  };
  draw();
  return store.subscribe((topic) => {
    if (['load', 'answers', 'applications'].includes(topic)) draw();
  });
}

function answerCard(a, filter) {
  return h('article', {
    class: 'card answer-card',
    tabindex: '0',
    onClick: () => openEditor(a, filter),
    onKeydown: (e) => { if (e.key === 'Enter') openEditor(a, filter); },
  },
  h('div', { class: 'row' },
    h('span', { class: 'chip accent' }, a.category || '其他'),
    h('span', { class: 'chip' }, a.lang === 'en' ? 'English' : '中文'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn sm ghost', type: 'button', onClick: (e) => { e.stopPropagation(); copyText(a.text || ''); } }, icon('copy'), '复制')),
  h('h3', { class: 'answer-q' }, a.question || '（没填题目）'),
  h('p', { class: 'answer-text' }, a.text || '还没写回答'),
  h('div', { class: 'muted small' },
    statsText(a.text, a.lang),
    a.usedIn?.length ? ` · 用在 ${a.usedIn.length} 处` : '',
    a.tags?.length ? ` · ${a.tags.join(' / ')}` : ''));
}

function openEditor(answer, filter) {
  const draft = answer
    ? { ...answer, tags: [...(answer.tags || [])], usedIn: [...(answer.usedIn || [])] }
    : { category: filter.category || '自我介绍', lang: filter.lang || 'zh', question: '', text: '', tags: [], usedIn: [] };

  const stats = h('span', null);
  const updateStats = () => { stats.textContent = statsText(draft.text, draft.lang); };
  const suggestions = h('datalist', { id: 'jt-question-suggestions' });
  const fillSuggestions = () => suggestions.replaceChildren(...(QUESTION_SUGGESTIONS[draft.category] || []).map((q) => h('option', { value: q })));
  fillSuggestions();

  const usedWrap = h('div', { class: 'row wrap' });
  const paintUsed = () => {
    const apps = store.state.applications;
    const label = (a) => [a.company, a.position].filter(Boolean).join(' · ') || '未命名投递';
    usedWrap.replaceChildren(
      ...draft.usedIn.map((id) => {
        const a = apps.find((x) => x.id === id);
        return h('span', { class: 'chip' }, a ? label(a) : '已删除的投递',
          h('button', { type: 'button', class: 'chip-x', 'aria-label': '移除', onClick: () => { draft.usedIn = draft.usedIn.filter((x) => x !== id); paintUsed(); } }, '×'));
      }),
      select(apps.filter((a) => !draft.usedIn.includes(a.id)).map((a) => ({ value: a.id, label: label(a) })), '', (v) => {
        if (!v) return;
        draft.usedIn = [...draft.usedIn, v];
        paintUsed();
      }, { placeholder: '+ 记下用在哪条投递', cls: 'used-select' }));
  };
  paintUsed();

  const body = h('div', { class: 'form-grid' },
    field('分类', select(ANSWER_CATEGORIES, draft.category, (v) => { draft.category = v; fillSuggestions(); })),
    field('语言', segmented([{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }], draft.lang, (v) => { draft.lang = v; updateStats(); }), { tag: 'div' }),
    field('题目', h('div', null,
      input({ value: draft.question, placeholder: '题目原文（输入框里有常见题目可选）', list: 'jt-question-suggestions', onInput: (v) => { draft.question = v; } }),
      suggestions), { full: true }),
    field('回答', textarea({ value: draft.text, rows: 12, placeholder: '你的回答', onInput: (v) => { draft.text = v; updateStats(); } }), { full: true, hint: stats }),
    field('标签', input({
      value: draft.tags.join('，'),
      placeholder: '用逗号分隔，比如：快消，领导力',
      onInput: (v) => { draft.tags = v.split(/[,，]/).map((t) => t.trim()).filter(Boolean); },
    }), { full: true }),
    field('用在了', usedWrap, { full: true, tag: 'div' }));
  updateStats();

  const actions = [
    answer ? {
      label: '删除',
      danger: true,
      onClick: async (close) => {
        if (!(await confirmDialog('删除这条素材？', { okLabel: '删除', danger: true }))) return;
        close();
        attempt(() => store.remove('answers', answer.id), '已删除');
      },
    } : null,
    { label: '复制回答', onClick: () => copyText(draft.text) },
    { label: '取消', ghost: true, onClick: (close) => close() },
    {
      label: '保存',
      primary: true,
      onClick: async (close) => {
        if (!draft.text.trim() && !draft.question.trim()) {
          toast('题目和回答至少填一个', { type: 'error' });
          return;
        }
        const { id, createdAt, updatedAt, ...data } = draft;
        const saved = answer
          ? await attempt(() => store.update('answers', answer.id, data))
          : await attempt(() => store.create('answers', data));
        if (saved) close();
      },
    },
  ].filter(Boolean);
  openModal({ title: answer ? '编辑素材' : '新建素材', wide: true, body, actions });
}
