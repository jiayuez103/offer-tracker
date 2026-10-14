import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, readText, parseStreamChunk, extractJson } from '../shared/llm.js';

const base = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: 'k1' };
const msgs = [{ role: 'user', content: '你好' }];

test('OpenAI 兼容：地址、鉴权头、system 放进 messages', () => {
  const r = buildRequest({ ...base, format: 'openai', system: 'S', messages: msgs });
  assert.equal(r.url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(r.headers.Authorization, 'Bearer k1');
  assert.equal(r.body.messages[0].role, 'system');
  assert.equal(r.body.messages[1].content, '你好');
  assert.equal(r.body.model, 'deepseek-chat');
});

test('baseUrl 已经带 /v1 时不重复拼', () => {
  const r = buildRequest({ ...base, baseUrl: 'http://localhost:11434/v1/', format: 'openai', system: 'S', messages: msgs });
  assert.equal(r.url, 'http://localhost:11434/v1/chat/completions');
});

test('本地服务没有 key 就不发鉴权头', () => {
  const r = buildRequest({ ...base, apiKey: '', format: 'openai', system: 'S', messages: msgs });
  assert.equal('Authorization' in r.headers, false);
});

test('Anthropic：换地址、换头、system 在顶层', () => {
  const r = buildRequest({ baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5', apiKey: 'k2', format: 'anthropic', system: 'S', messages: msgs });
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.headers['x-api-key'], 'k2');
  assert.ok(r.headers['anthropic-version']);
  assert.equal(r.body.system, 'S');
  assert.ok(r.body.max_tokens > 0);
});

test('读取回复文本和用量', () => {
  const o = readText({ choices: [{ message: { content: '结果' } }], usage: { total_tokens: 42 } }, 'openai');
  assert.deepEqual(o, { text: '结果', tokens: 42 });
  const a = readText({ content: [{ type: 'text', text: '结果' }], usage: { input_tokens: 10, output_tokens: 5 } }, 'anthropic');
  assert.deepEqual(a, { text: '结果', tokens: 15 });
});

test('解析流式分片', () => {
  assert.equal(parseStreamChunk('data: {"choices":[{"delta":{"content":"你"}}]}', 'openai'), '你');
  assert.equal(parseStreamChunk('data: [DONE]', 'openai'), '');
  assert.equal(parseStreamChunk('', 'openai'), '');
  assert.equal(parseStreamChunk('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"好"}}', 'anthropic'), '好');
  assert.equal(parseStreamChunk('data: {"type":"message_start"}', 'anthropic'), '');
  assert.equal(parseStreamChunk('data: 这不是 json', 'openai'), '');
});

test('从回复里抠 JSON', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('好的，结果如下：\n{"a":{"b":"}"}}\n希望有帮助'), { a: { b: '}' } });
  assert.equal(extractJson('完全不是 JSON'), null);
});
