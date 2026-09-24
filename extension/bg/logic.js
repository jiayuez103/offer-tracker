// 后台用的纯函数：汇总各 frame 的填写结果、挑简历文件、查重、base64。

export function aggregateFill(results) {
  const total = { filled: 0, uncertain: 0, manual: 0, skipped: 0, missing: {}, todo: [], frames: 0 };
  for (const r of results) {
    if (!r) continue;
    total.frames += 1;
    for (const k of ['filled', 'uncertain', 'manual', 'skipped']) total[k] += r[k] || 0;
    for (const [list, n] of Object.entries(r.missing || {})) total.missing[list] = Math.max(total.missing[list] || 0, n);
    for (const item of r.todo || []) if (total.todo.length < 12) total.todo.push(item);
  }
  return total;
}

/** 网申一般要 PDF：有 PDF 用 PDF，其次 Word */
export function pickResumeFile(files = []) {
  return files.find((f) => /\.pdf$/i.test(f.name)) || files.find((f) => /\.docx?$/i.test(f.name)) || files[0] || null;
}

export function mimeFor(name = '') {
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  if (/\.docx$/i.test(name)) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (/\.doc$/i.test(name)) return 'application/msword';
  return 'application/octet-stream';
}

export function base64FromBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** 用于查重的链接：主机 + 路径 + 查询参数（去掉 hash 和 utm 等追踪参数） */
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_.*|spm|from|source)$/i.test(k)) u.searchParams.delete(k);
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return '';
  }
}

const squash = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

export function findDuplicate(apps, { url, company, position }) {
  const target = normalizeUrl(url);
  if (target) {
    const hit = apps.find((a) => [a.jdUrl, a.applyUrl].some((u) => u && normalizeUrl(u) === target));
    if (hit) return hit;
  }
  if (company && position) {
    return apps.find((a) => squash(a.company) === squash(company) && squash(a.position) === squash(position)) || null;
  }
  return null;
}

/** frames: [{ frameId, candidates: [{ index, score, label }] }] → 得分最高的一个 */
export function bestFileTarget(frames) {
  let best = null;
  for (const { frameId, candidates } of frames) {
    for (const c of candidates || []) {
      if (!best || c.score > best.score) best = { frameId, index: c.index, score: c.score, label: c.label };
    }
  }
  return best;
}
