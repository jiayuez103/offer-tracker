import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateFill, pickResumeFile, mimeFor, base64FromBuffer, normalizeUrl, findDuplicate, bestFileTarget,
} from '../bg/logic.js';

test('汇总各 frame 的填写结果', () => {
  const sum = aggregateFill([
    { filled: 3, uncertain: 1, manual: 0, skipped: 2, missing: { work: 1 } },
    null,
    { filled: 2, uncertain: 0, manual: 1, skipped: 0, missing: { work: 2, education: 1 }, todo: [{ label: '开始时间', text: '2025-09' }] },
  ]);
  assert.deepEqual(sum, {
    filled: 5, uncertain: 1, manual: 1, skipped: 2, missing: { work: 2, education: 1 },
    todo: [{ label: '开始时间', text: '2025-09' }], frames: 2,
  });
});

test('简历文件优先用 PDF', () => {
  assert.equal(pickResumeFile([{ name: 'a.docx' }, { name: 'a.pdf' }]).name, 'a.pdf');
  assert.equal(pickResumeFile([{ name: 'a.docx' }]).name, 'a.docx');
  assert.equal(pickResumeFile([]), null);
  assert.equal(mimeFor('x.PDF'), 'application/pdf');
  assert.equal(mimeFor('x.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(mimeFor('x.bin'), 'application/octet-stream');
});

test('base64 与 atob 互逆（含二进制和中文）', () => {
  const bytes = new Uint8Array([0, 255, 37, 80, 68, 70, ...new TextEncoder().encode('简历')]);
  const b64 = base64FromBuffer(bytes.buffer);
  assert.deepEqual([...Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], [...bytes]);
});

test('链接规范化：去掉 hash 和追踪参数，保留岗位 id', () => {
  assert.equal(normalizeUrl('https://Join.QQ.com/post.html?postid=12&utm_source=x#top'), 'join.qq.com/post.html?postid=12');
  assert.equal(normalizeUrl('https://a.com/job/1/'), 'a.com/job/1');
  assert.equal(normalizeUrl('not a url'), '');
});

test('查重：先比链接，再比公司 + 岗位', () => {
  const apps = [
    { id: '1', company: '雀巢', position: 'Marketing MT', jdUrl: 'https://a.com/job/1?utm_medium=x' },
    { id: '2', company: '宝洁', position: '品牌 MT', jdUrl: '' },
  ];
  assert.equal(findDuplicate(apps, { url: 'https://a.com/job/1' }).id, '1');
  assert.equal(findDuplicate(apps, { url: 'https://b.com', company: '宝洁', position: '品牌MT' }).id, '2');
  assert.equal(findDuplicate(apps, { url: 'https://b.com', company: '宝洁', position: '市场' }), null);
});

test('挑得分最高的上传框', () => {
  const frames = [
    { frameId: 0, candidates: [{ index: 0, score: 3, label: '附件' }] },
    { frameId: 5, candidates: [{ index: 1, score: 13, label: '上传简历' }] },
  ];
  assert.deepEqual(bestFileTarget(frames), { frameId: 5, index: 1, score: 13, label: '上传简历' });
  assert.equal(bestFileTarget([{ frameId: 0, candidates: [] }]), null);
});
