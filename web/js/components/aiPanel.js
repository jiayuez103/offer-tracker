// 投递详情里的「AI」页：按这条 JD 给匹配诊断和改写建议，下面是带上下文的对话。
// 所有改写都只是建议，不会自动写回档案。
import { store } from '../store.js';
import { api, apiUrl } from '../api.js';
import { h, icon, toast, copyText, ensureCss } from '../ui.js';
import { formatZoned } from '../../shared/time.js';

const MATCH = {
  strong: ['有硬证据', 'ok'],
  partial: ['沾边', 'warn'],
  missing: ['缺', 'bad'],
};

export function aiPane(app, { onNeedJd } = {}) {
  ensureCss('/css/ai.css');
  const root = h('div', { class: 'ai-pane' });
  const s = store.state.settings || {};
  const ai = s.ai || {};

  if (!ai.enabled || !ai.baseUrl || !ai.model) {
    root.append(h('div', { class: 'empty' },
      h('div', null, '还没配置 AI 服务'),
      h('p', { class: 'muted small' }, '去「设置」页填上服务地址和模型名（DeepSeek、本地 Ollama 都行），这里就能按 JD 给改写建议。'),
      h('a', { class: 'btn', href: '#/settings' }, '去设置')));
    return root;
  }

  const head = h('div', { class: 'ai-head' });
  const body = h('div', { class: 'ai-body' });
  const chatBox = h('div', { class: 'ai-chat' });
  const log = h('div', { class: 'ai-log' });
  root.append(head, body, chatBox);

  let state = null;

  function renderHead() {
    const when = state && state.at ? formatZoned(state.at, s.homeTz) : '';
    head.replaceChildren(
      h('span', { class: 'muted small grow' }, state
        ? `基于 ${when} 的 JD · ${state.model || ''}${state.tokens ? ` · ${state.tokens} tokens` : ''}`
        : '还没诊断过这条投递'),
      h('button', { class: 'btn sm', type: 'button', onClick: () => run(true) }, icon('refresh'), state ? '重新诊断' : '开始诊断'));
  }

  function card(r) {
    return h('div', { class: 'ai-rewrite' },
      h('div', { class: 'ai-rewrite-head' },
        h('b', null, '改写建议'),
        h('button', { class: 'btn sm ghost', type: 'button', onClick: () => copyText(r.rewrite, '改写内容已复制') }, icon('copy'), '复制')),
      h('div', { class: 'ai-before' }, r.original || ''),
      h('div', { class: 'ai-after' }, r.rewrite || ''),
      r.why ? h('p', { class: 'muted small' }, r.why) : null,
      (r.warnings || []).length
        ? h('ul', { class: 'ai-warn' }, r.warnings.map((w) => h('li', null, icon('alert'), w)))
        : null);
  }

  function renderBody() {
    if (!state) {
      body.replaceChildren(h('p', { class: 'muted small' }, '点右上角「开始诊断」，我会读这条投递的 JD 和你的档案，给出匹配情况和改写建议。'));
      return;
    }
    const d = state.diagnosis || {};
    if (d.raw) {
      body.replaceChildren(h('div', { class: 'ai-summary' }, d.summary || ''));
      return;
    }
    body.replaceChildren(
      d.summary ? h('div', { class: 'ai-summary' }, d.summary) : null,
      d.requirements?.length
        ? h('div', { class: 'ai-section' },
          h('h4', null, 'JD 要求逐条对照'),
          h('ul', { class: 'ai-reqs' }, d.requirements.map((r) => {
            const [label, cls] = MATCH[r.match] || ['不确定', 'warn'];
            return h('li', null,
              h('span', { class: `ai-flag ${cls}` }, label),
              h('span', { class: 'grow' }, h('b', null, r.text || ''), r.evidence ? h('span', { class: 'muted small' }, ` — ${r.evidence}`) : null));
          })))
        : null,
      d.keywords?.length
        ? h('div', { class: 'ai-section' },
          h('h4', null, '简历里缺的关键词'),
          h('div', { class: 'ai-keys' }, d.keywords.map((k) => h('span', { class: 'chip' }, k))))
        : null,
      d.rewrites?.length
        ? h('div', { class: 'ai-section' },
          h('h4', null, '改写建议'),
          h('p', { class: 'muted small' }, '这些只是建议，不会自动改你的档案。满意就复制到简历里。'),
          ...d.rewrites.map(card))
        : null);
  }

  async function run(force) {
    body.replaceChildren(h('p', { class: 'muted small' }, '正在读 JD 和档案，大概十几秒…'));
    try {
      state = await api.post('/api/ai/diagnose', { appId: app.id, force });
      renderHead();
      renderBody();
      renderLog();
    } catch (e) {
      body.replaceChildren(h('p', { class: 'result err' }, e.message));
      if (/JD/.test(e.message) && onNeedJd) body.append(h('button', { class: 'btn', type: 'button', onClick: onNeedJd }, '去存 JD'));
    }
  }

  function renderLog() {
    const items = (state && state.chat) || [];
    log.replaceChildren(...items.map((m) => h('div', { class: `ai-msg ${m.role}` }, m.content)));
    log.scrollTop = log.scrollHeight;
  }

  const box = h('textarea', { rows: 2, placeholder: '比如：把群玉山那段改得更偏渠道，两行以内' });
  const sendBtn = h('button', { class: 'btn primary', type: 'button' }, '发送');

  async function send() {
    const message = box.value.trim();
    if (!message) return;
    box.value = '';
    sendBtn.disabled = true;
    if (!state) state = { chat: [] };
    state.chat = [...(state.chat || []), { role: 'user', content: message }];
    renderLog();
    const bubble = h('div', { class: 'ai-msg assistant' }, '…');
    log.append(bubble);
    log.scrollTop = log.scrollHeight;
    let full = '';
    try {
      const res = await fetch(apiUrl('/api/ai/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: app.id, message }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let event = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: ')) event = line.slice(7).trim();
          else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (event === 'delta') {
              full += data;
              bubble.textContent = full;
              log.scrollTop = log.scrollHeight;
            } else if (event === 'error') {
              bubble.textContent = data;
              bubble.classList.add('err');
            }
          }
        }
      }
      if (full) state.chat = [...state.chat, { role: 'assistant', content: full }];
    } catch (e) {
      bubble.textContent = e.message;
      bubble.classList.add('err');
    } finally {
      sendBtn.disabled = false;
    }
  }

  sendBtn.onclick = send;
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  });
  chatBox.append(
    h('h4', null, '接着问'),
    log,
    h('div', { class: 'ai-input' }, box, sendBtn),
    h('p', { class: 'muted small' }, '⌘↵ 发送。对话带着这条 JD 和你的档案，但不会自动改档案。'));

  renderHead();
  renderBody();
  api.get(`/api/ai/${app.id}`)
    .then((r) => { if (r) { state = r; renderHead(); renderBody(); renderLog(); } })
    .catch(() => { /* 没缓存就保持引导状态，等用户点「开始诊断」 */ });
  return root;
}
