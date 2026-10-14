// HTTP 层：安全检查 → 路由 → 调用 store 和 shared/ 里的业务规则。
import fs from 'node:fs';
import path from 'node:path';
import { createStore, StoreError } from './store.js';
import { COLLECTIONS, ID_PREFIX } from '../shared/constants.js';
import { prepareNewApplication, applyApplicationUpdate, validateApplication, newId } from '../shared/domain.js';
import { buildCalendar } from '../shared/ics.js';
import { parseJD } from '../shared/jdparse.js';
import { todayInZone } from '../shared/time.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 出口一律抹掉 apiKey：网页只需要知道配没配 */
export function publicSettings(s) {
  const { apiKey, ...ai } = s.ai || {};
  return { ...s, ai: { ...ai, hasKey: Boolean(apiKey) } };
}

/** ai 要深合并；apiKey 空串 = 不修改（网页回传时不带原值），null = 显式清空 */
export function mergeSettings(current, patch) {
  const next = { ...current, ...patch };
  if (patch && patch.ai) {
    const cur = current.ai || {};
    const { apiKey, ...rest } = patch.ai;
    next.ai = { ...cur, ...rest };
    if (apiKey === null) next.ai.apiKey = '';
    else if (typeof apiKey === 'string' && apiKey !== '') next.ai.apiKey = apiKey;
    else next.ai.apiKey = cur.apiKey || '';
  }
  return next;
}

/** 只接受本机网页和 Chrome 插件的请求（防其他网站读写、防 DNS rebinding） */
function checkSecurity(req) {
  const port = req.socket.localPort;
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(req.headers.host)) throw new HttpError(403, 'Host 不被允许');
  const origin = req.headers.origin;
  if (origin && !hosts.some((h) => origin === `http://${h}`) && !origin.startsWith('chrome-extension://')) {
    throw new HttpError(403, '不接受来自其他网站的请求');
  }
  if (req.method === 'OPTIONS') throw new HttpError(403, '不支持跨域请求');
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) tooBig = true;
      else chunks.push(c);
    });
    req.on('end', () => (tooBig ? reject(new HttpError(413, '内容太大')) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

async function readJson(req) {
  if (!String(req.headers['content-type'] || '').includes('application/json')) {
    throw new HttpError(415, '请求需要是 application/json');
  }
  const buf = await readBody(req, MAX_JSON_BYTES);
  let value;
  try {
    value = JSON.parse(buf.toString('utf8'));
  } catch {
    throw new HttpError(400, '请求体不是有效的 JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, '请求体应该是一个 JSON 对象');
  return value;
}

function sendJson(res, status, body, version) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (version != null) headers['X-Data-Version'] = String(version);
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function sendText(res, status, text, type) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}

function sendFile(res, full, { download = false, displayName } = {}) {
  const ext = path.extname(full).toLowerCase();
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
  if (download) {
    const disposition = ext === '.pdf' ? 'inline' : 'attachment';
    headers['Content-Disposition'] = `${disposition}; filename*=UTF-8''${encodeURIComponent(displayName || path.basename(full))}`;
  }
  res.writeHead(200, headers);
  fs.createReadStream(full).pipe(res);
}

function serveStatic(res, root, parts) {
  const full = path.resolve(root, ...parts);
  if (full !== root && !full.startsWith(root + path.sep)) throw new HttpError(403, '禁止访问');
  let st;
  try {
    st = fs.statSync(full);
  } catch {
    throw new HttpError(404, '找不到这个页面');
  }
  if (st.isDirectory()) return serveStatic(res, root, [...parts, 'index.html']);
  return sendFile(res, full);
}

function sendError(res, e) {
  let status = 500;
  let message = e.message || '服务器出错了';
  if (e instanceof HttpError) status = e.status;
  else if (e instanceof StoreError) status = { NOT_FOUND: 404, BAD_REQUEST: 400, CORRUPT: 500 }[e.code] || 500;
  else if (e instanceof URIError) {
    status = 400;
    message = '网址编码有误';
  } else console.error(e);
  if (res.headersSent) {
    res.end();
    return;
  }
  sendJson(res, status, { error: message });
}

function jdHeader(app, now) {
  return [
    `# ${app.company || '未命名公司'} · ${app.position || '未命名岗位'}`,
    '',
    `- 链接：${app.jdUrl || '（无）'}`,
    `- 保存时间：${now.toISOString()}`,
  ].join('\n');
}

export function createApp({ dataDir, rootDir, now = () => new Date() }) {
  const store = createStore(dataDir, { now });
  const webDir = path.join(rootDir, 'web');
  const sharedDir = path.join(rootDir, 'shared');
  const { version: appVersion } = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

  const ctx = () => {
    const t = now();
    return { nowISO: t.toISOString(), today: todayInZone(store.getSettings().homeTz, t) };
  };

  function mustGet(coll, id) {
    const rec = store.get(coll, id);
    if (!rec) throw new HttpError(404, '记录不存在');
    return rec;
  }

  function create(coll, input) {
    let rec;
    if (coll === 'applications') {
      rec = prepareNewApplication(input, ctx());
      const err = validateApplication(rec);
      if (err) throw new HttpError(400, err);
    } else {
      const nowISO = now().toISOString();
      rec = { ...input, id: input.id || newId(ID_PREFIX[coll]), createdAt: nowISO, updatedAt: nowISO };
      if (coll === 'resumes' && !Array.isArray(rec.files)) rec.files = [];
    }
    if (store.get(coll, rec.id)) throw new HttpError(409, '这个 id 已经存在');
    return store.insert(coll, rec);
  }

  function update(coll, id, patch) {
    const cur = mustGet(coll, id);
    let next;
    if (coll === 'applications') {
      next = applyApplicationUpdate(cur, patch, ctx());
      const err = validateApplication(next);
      if (err) throw new HttpError(400, err);
    } else {
      const { id: _id, createdAt: _createdAt, ...changes } = patch;
      next = { ...cur, ...changes, updatedAt: now().toISOString() };
    }
    return store.replace(coll, id, next);
  }

  function destroy(coll, id) {
    const rec = mustGet(coll, id);
    if (coll === 'applications') store.deleteJd(id);
    if (coll === 'resumes') {
      for (const f of rec.files || []) {
        try {
          store.deleteResumeFile(path.basename(f.stored));
        } catch {
          // 文件可能已经被手动删掉
        }
      }
    }
    store.remove(coll, id);
  }

  function saveJd(app, text) {
    const jdFile = text.trim() ? store.writeJd(app.id, text, jdHeader(app, now())) : null;
    if (!jdFile) store.deleteJd(app.id);
    return store.replace('applications', app.id, { ...app, jdFile, updatedAt: now().toISOString() });
  }

  async function uploadFile(req, resumeId) {
    const resume = mustGet('resumes', resumeId);
    const raw = req.headers['x-filename'];
    if (!raw) throw new HttpError(400, '缺少 X-Filename');
    const name = decodeURIComponent(raw);
    const buf = await readBody(req, MAX_FILE_BYTES);
    if (!buf.length) throw new HttpError(400, '文件是空的');
    const file = store.saveResumeFile(resumeId, name, buf);
    return store.replace('resumes', resumeId, { ...resume, files: [...(resume.files || []), file], updatedAt: now().toISOString() });
  }

  function deleteFile(resumeId, stored) {
    const resume = mustGet('resumes', resumeId);
    const files = (resume.files || []).filter((f) => path.basename(f.stored) !== stored);
    if (files.length === (resume.files || []).length) throw new HttpError(404, '文件不存在');
    try {
      store.deleteResumeFile(stored);
    } catch (e) {
      if (e.code !== 'NOT_FOUND') throw e;
    }
    return store.replace('resumes', resumeId, { ...resume, files, updatedAt: now().toISOString() });
  }

  async function api(req, res, parts) {
    const m = req.method;
    const [a, b, c, d] = parts;
    const send = (status, body) => sendJson(res, status, body, store.version());

    if (a === 'ping' && m === 'GET' && !b) return send(200, { ok: true, app: 'job-tracker', version: appVersion });
    if (a === 'version' && m === 'GET' && !b) return send(200, { version: store.version() });
    if (a === 'parse-jd' && m === 'POST' && !b) {
      const { text = '', url = '' } = await readJson(req);
      return send(200, parseJD(String(text), String(url), now()));
    }
    if (a === 'state' && m === 'GET' && !b) {
      return send(200, {
        profile: store.getProfile(),
        settings: publicSettings(store.getSettings()),
        applications: store.list('applications'),
        answers: store.list('answers'),
        resumes: store.list('resumes'),
        version: store.version(),
      });
    }
    if (a === 'profile' && !b) {
      if (m === 'GET') return send(200, store.getProfile());
      if (m === 'PATCH') return send(200, store.patchProfile(await readJson(req)));
    }
    if (a === 'settings' && !b) {
      if (m === 'GET') return send(200, publicSettings(store.getSettings()));
      if (m === 'PATCH') {
        const merged = mergeSettings(store.getSettings(), await readJson(req));
        return send(200, publicSettings(store.patchSettings(merged)));
      }
    }
    if (COLLECTIONS.includes(a)) {
      if (!b) {
        if (m === 'GET') return send(200, store.list(a));
        if (m === 'POST') return send(201, create(a, await readJson(req)));
      } else if (!c) {
        if (m === 'GET') return send(200, mustGet(a, b));
        if (m === 'PATCH') return send(200, update(a, b, await readJson(req)));
        if (m === 'DELETE') {
          destroy(a, b);
          return send(200, { ok: true });
        }
      } else if (a === 'applications' && c === 'jd' && !d) {
        const app = mustGet(a, b);
        if (m === 'GET') return send(200, { text: store.readJd(b) });
        if (m === 'PUT') {
          const { text = '' } = await readJson(req);
          return send(200, saveJd(app, String(text)));
        }
      } else if (a === 'resumes' && c === 'files') {
        if (m === 'POST' && !d) return send(201, await uploadFile(req, b));
        if (m === 'DELETE' && d) return send(200, deleteFile(b, d));
      }
    }
    throw new HttpError(404, '接口不存在');
  }

  return async function handle(req, res) {
    try {
      checkSecurity(req);
      const url = new URL(req.url, 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (parts[0] === 'api') return await api(req, res, parts.slice(1));
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, '不支持这个请求方法');
      if (url.pathname === '/calendar.ics') {
        return sendText(res, 200, buildCalendar(store.list('applications'), store.getSettings(), now()), 'text/calendar; charset=utf-8');
      }
      if (parts[0] === 'files' && parts[1] === 'resumes' && parts.length === 3) {
        const displayName = parts[2].split('__').slice(2).join('__') || parts[2];
        return sendFile(res, store.resumeFilePath(parts[2]), { download: true, displayName });
      }
      if (parts[0] === 'shared') return serveStatic(res, sharedDir, parts.slice(1));
      return serveStatic(res, webDir, parts.length ? parts : ['index.html']);
    } catch (e) {
      return sendError(res, e);
    }
  };
}
