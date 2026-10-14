// 调用用户自己配置的模型服务。fetch 由参数注入，方便测试。
// 密钥只在这里读，不往上层返回，也不写日志。
import crypto from 'node:crypto';
import { buildRequest, readText, extractJson, parseStreamChunk } from '../shared/llm.js';
import { systemPrompt, diagnosePrompt, chatMessages } from '../shared/aiprompt.js';

const TIMEOUT_MS = 60000;
const MAX_CHAT = 40;

export class AiError extends Error {}

const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);

/** 把上游的失败翻译成用户能照着改的话 */
function explain(status, bodyText) {
  const hint = String(bodyText || '').slice(0, 200);
  if (status === 401 || status === 403) return 'API key 不对或没有权限，去设置页检查一下';
  if (status === 402) return '模型服务返回「余额不足」，去对应平台充值';
  if (status === 404) return '找不到这个模型或地址：检查「服务地址」和「模型名」是否写对';
  if (status === 429) return '请求太频繁或额度用尽，过一会儿再试';
  if (status >= 500) return `模型服务出错（${status}）：${hint}`;
  return `模型服务返回 ${status}：${hint}`;
}

function requireConfig(settings) {
  const ai = settings.ai || {};
  if (!ai.enabled) throw new AiError('还没启用 AI：去「设置」页填好服务地址和模型名');
  if (!ai.baseUrl || !ai.model) throw new AiError('AI 配置不全：服务地址和模型名都要填');
  return ai;
}

export function createAi({ store, fetchImpl = fetch }) {
  async function call({ system, messages, json = false }) {
    const ai = requireConfig(store.getSettings());
    const { url, headers, body } = buildRequest({
      format: ai.format, baseUrl: ai.baseUrl, model: ai.model, apiKey: ai.apiKey, system, messages, json,
    });
    let res;
    try {
      res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new AiError('模型服务 60 秒没有响应，可能是模型太慢或网络不通');
      throw new AiError('连不上模型服务：检查「服务地址」；本地模型要先把服务跑起来');
    }
    if (!res.ok) throw new AiError(explain(res.status, await res.text().catch(() => '')));
    const data = await res.json().catch(() => null);
    if (!data) throw new AiError('模型返回的不是 JSON，检查地址是不是指到了别的服务');
    return readText(data, ai.format);
  }

  /** 流式：逐段把文本交给 onDelta */
  async function stream({ system, messages, onDelta }) {
    const ai = requireConfig(store.getSettings());
    const { url, headers, body } = buildRequest({
      format: ai.format, baseUrl: ai.baseUrl, model: ai.model, apiKey: ai.apiKey, system, messages, stream: true,
    });
    let res;
    try {
      res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new AiError('模型服务 60 秒没有响应');
      throw new AiError('连不上模型服务：检查「服务地址」；本地模型要先把服务跑起来');
    }
    if (!res.ok) throw new AiError(explain(res.status, await res.text().catch(() => '')));
    let full = '';
    let buffer = '';
    for await (const chunk of res.body) {
      buffer += Buffer.from(chunk).toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const delta = parseStreamChunk(line, ai.format);
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      }
    }
    return full;
  }

  const forbidden = () => (store.getSettings().ai || {}).forbidden || [];

  async function diagnose(appId, { force = false } = {}) {
    const app = store.get('applications', appId);
    if (!app) throw new AiError('找不到这条投递');
    const jd = store.readJd(appId);
    if (!jd.trim()) throw new AiError('这条投递还没有 JD 快照：先在详情里存一份 JD，再来诊断');
    const cached = store.readAi(appId);
    const jdHash = hash(jd);
    if (!force && cached && cached.diagnosis && cached.jdHash === jdHash) return { ...cached, cached: true };

    const { text, tokens } = await call({
      system: systemPrompt({ forbidden: forbidden() }),
      messages: [{ role: 'user', content: diagnosePrompt({ jd, profile: store.getProfile(), position: app.position }) }],
      json: true,
    });
    const parsed = extractJson(text);
    const ids = new Set([...(store.getProfile().education || []), ...(store.getProfile().work || []), ...(store.getProfile().projects || []), ...(store.getProfile().activities || [])].map((x) => x.id));
    const diagnosis = parsed
      ? {
        summary: String(parsed.summary || ''),
        requirements: Array.isArray(parsed.requirements) ? parsed.requirements.slice(0, 20) : [],
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 20) : [],
        // 对不上档案条目的改写建议直接丢掉：多半是模型自己编的
        rewrites: (Array.isArray(parsed.rewrites) ? parsed.rewrites : []).filter((r) => r && ids.has(r.target)).slice(0, 10),
      }
      : { summary: text.slice(0, 2000), requirements: [], keywords: [], rewrites: [], raw: true };

    const record = {
      model: (store.getSettings().ai || {}).model || '',
      at: new Date().toISOString(),
      jdHash,
      tokens,
      diagnosis,
      chat: (cached && cached.chat) || [],
    };
    store.writeAi(appId, record);
    return { ...record, cached: false };
  }

  async function chat(appId, message, onDelta) {
    const app = store.get('applications', appId);
    if (!app) throw new AiError('找不到这条投递');
    const cached = store.readAi(appId) || { chat: [] };
    const history = cached.chat || [];
    const reply = await stream({
      system: systemPrompt({ forbidden: forbidden() }),
      messages: chatMessages({
        history,
        diagnosisSummary: (cached.diagnosis && cached.diagnosis.summary) || '',
        jd: store.readJd(appId),
        profile: store.getProfile(),
        message,
      }),
      onDelta,
    });
    const next = [...history, { role: 'user', content: message, at: new Date().toISOString() }, { role: 'assistant', content: reply, at: new Date().toISOString() }];
    store.writeAi(appId, { ...cached, chat: next.slice(-MAX_CHAT) });
    return reply;
  }

  /** 设置页的「测试连接」：发一句最短的话，确认地址、key、模型名都对 */
  async function test() {
    const { text } = await call({ system: '你是一个助手，只回复用户要求的内容。', messages: [{ role: 'user', content: '回复两个字：可以' }] });
    return { ok: true, reply: text.slice(0, 100), model: (store.getSettings().ai || {}).model };
  }

  return { diagnose, chat, test };
}
