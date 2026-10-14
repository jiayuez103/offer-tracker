// 两种 API 格式的适配：openai（OpenAI 兼容，覆盖 DeepSeek / 智谱 / Ollama 等）和 anthropic。
// 纯函数，不碰网络，方便单测；真正发请求在 server/ai.js。
const MAX_TOKENS = 4000;

const trimSlash = (s) => String(s || '').replace(/\/+$/, '');

/** baseUrl 可能已经带 /v1，不要拼第二次 */
function endpoint(baseUrl, format) {
  const base = trimSlash(baseUrl);
  if (format === 'anthropic') return /\/v1$/.test(base) ? `${base}/messages` : `${base}/v1/messages`;
  return /\/v1$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

export function buildRequest({ format = 'openai', baseUrl, model, apiKey, system, messages, stream = false, json = false }) {
  const headers = { 'Content-Type': 'application/json' };
  if (format === 'anthropic') {
    if (apiKey) headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    return {
      url: endpoint(baseUrl, format),
      headers,
      body: { model, max_tokens: MAX_TOKENS, system, messages, ...(stream ? { stream: true } : {}) },
    };
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return {
    url: endpoint(baseUrl, format),
    headers,
    body: {
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      ...(stream ? { stream: true } : {}),
      // 支持的服务会严格返回 JSON；不支持的会忽略这个字段，所以解析仍要容错
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    },
  };
}

export function readText(data, format) {
  if (format === 'anthropic') {
    const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    const u = data.usage || {};
    return { text, tokens: (u.input_tokens || 0) + (u.output_tokens || 0) };
  }
  const choice = (data.choices || [])[0] || {};
  return { text: (choice.message && choice.message.content) || '', tokens: (data.usage && data.usage.total_tokens) || 0 };
}

/** 一行 SSE → 增量文本；不是文本增量就返回空串 */
export function parseStreamChunk(line, format) {
  const raw = String(line || '').trim();
  if (!raw.startsWith('data:')) return '';
  const payload = raw.slice(5).trim();
  if (!payload || payload === '[DONE]') return '';
  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    return '';
  }
  if (format === 'anthropic') {
    return data.type === 'content_block_delta' && data.delta && data.delta.type === 'text_delta' ? data.delta.text || '' : '';
  }
  const delta = ((data.choices || [])[0] || {}).delta || {};
  return delta.content || '';
}

/** 模型不一定老实返回 JSON：依次试整体、去围栏、取第一个平衡的大括号 */
export function extractJson(text) {
  const s = String(text || '').trim();
  const tries = [s, s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')];
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === 'object') return v;
    } catch {
      // 继续试下一种
    }
  }
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
