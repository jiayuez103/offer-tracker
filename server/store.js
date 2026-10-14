// 数据读写：只有这个模块直接碰 data/ 目录。
// 每次都从磁盘读（Claude 可能直接改了文件）；写入是原子的；写之前按需备份。
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS } from '../shared/constants.js';
import { emptyProfile, normalizeProfile } from '../shared/domain.js';

export class StoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // NOT_FOUND | BAD_REQUEST | CORRUPT
  }
}

const DOCS = {
  profile: { file: 'profile.json', empty: () => emptyProfile() },
  settings: { file: 'settings.json', empty: () => ({}) },
  applications: { file: 'applications.json', empty: () => [] },
  answers: { file: 'answers.json', empty: () => [] },
  resumes: { file: 'resumes.json', empty: () => [] },
};
const LIST_DOCS = new Set(['applications', 'answers', 'resumes']);
const BACKUP_INTERVAL_MS = 30 * 60 * 1000;
const BACKUP_KEEP = 30;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

function parseStamp(s) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0;
}

/** JD 快照 = 标题块 + '---' + 正文，读出时只要正文；手写的无标题文件原样返回 */
export function stripJdHeader(content) {
  if (content.startsWith('# ')) {
    const i = content.indexOf('\n---\n');
    if (i >= 0) return content.slice(i + 5).replace(/^\n+/, '').replace(/\n+$/, '');
  }
  return content.replace(/\n+$/, '');
}

export function createStore(dataDir, { now = () => new Date() } = {}) {
  const at = (...xs) => path.join(dataDir, ...xs);
  for (const d of ['jd', 'resumes', 'backups', 'ai']) fs.mkdirSync(at(d), { recursive: true });

  function def(name) {
    const d = DOCS[name];
    if (!d) throw new StoreError('NOT_FOUND', `未知的数据：${name}`);
    return d;
  }

  function read(name) {
    const d = def(name);
    let raw;
    try {
      raw = fs.readFileSync(at(d.file), 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return d.empty();
      throw e;
    }
    if (!raw.trim()) return d.empty();
    let value;
    try {
      value = JSON.parse(raw);
    } catch (e) {
      throw new StoreError('CORRUPT', `${d.file} 不是有效的 JSON（${e.message}）。请修好这个文件，或从 data/backups/ 里恢复。`);
    }
    if (LIST_DOCS.has(name) && !Array.isArray(value)) throw new StoreError('CORRUPT', `${d.file} 应该是一个数组。`);
    return value;
  }

  function atomicWrite(file, content) {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, file);
  }

  function backupIfDue(name) {
    const file = at(def(name).file);
    if (!fs.existsSync(file)) return;
    const base = path.basename(file, '.json');
    const pattern = new RegExp(`^${base}\\.(\\d{8}-\\d{6})\\.json$`);
    const existing = fs.readdirSync(at('backups'))
      .map((f) => ({ f, m: pattern.exec(f) }))
      .filter((x) => x.m)
      .sort((a, b) => (a.m[1] < b.m[1] ? -1 : 1));
    const t = now();
    const last = existing.at(-1);
    if (last && t.getTime() - parseStamp(last.m[1]) < BACKUP_INTERVAL_MS) return;
    const target = `${base}.${stamp(t)}.json`;
    fs.copyFileSync(file, at('backups', target));
    const all = [...existing.map((x) => x.f), target];
    for (const f of all.slice(0, Math.max(0, all.length - BACKUP_KEEP))) fs.rmSync(at('backups', f), { force: true });
  }

  function write(name, value) {
    read(name); // 文件损坏时这里抛 CORRUPT，拒绝覆盖
    backupIfDue(name);
    atomicWrite(at(def(name).file), `${JSON.stringify(value, null, 2)}\n`);
  }

  // ---- 集合（applications / answers / resumes）----
  const list = (coll) => read(coll);
  const get = (coll, id) => list(coll).find((r) => r.id === id) || null;

  function indexOrThrow(all, id) {
    const i = all.findIndex((r) => r.id === id);
    if (i < 0) throw new StoreError('NOT_FOUND', '记录不存在');
    return i;
  }
  function insert(coll, record) {
    const all = list(coll);
    all.push(record);
    write(coll, all);
    return record;
  }
  function replace(coll, id, record) {
    const all = list(coll);
    all[indexOrThrow(all, id)] = record;
    write(coll, all);
    return record;
  }
  function remove(coll, id) {
    const all = list(coll);
    const [removed] = all.splice(indexOrThrow(all, id), 1);
    write(coll, all);
    return removed;
  }

  // ---- 档案与设置：按顶层 key 合并 ----
  const getProfile = () => normalizeProfile(read('profile'));
  function patchProfile(patch) {
    const next = { ...read('profile'), ...patch };
    write('profile', next);
    return normalizeProfile(next);
  }
  const getSettings = () => ({ ...DEFAULT_SETTINGS, ...read('settings') });
  function patchSettings(patch) {
    const next = { ...read('settings'), ...patch };
    write('settings', next);
    return { ...DEFAULT_SETTINGS, ...next };
  }

  // ---- JD 快照 ----
  function jdPath(id) {
    if (!SAFE_ID.test(id)) throw new StoreError('BAD_REQUEST', '非法 id');
    return at('jd', `${id}.md`);
  }
  function readJd(id) {
    try {
      return stripJdHeader(fs.readFileSync(jdPath(id), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return '';
      throw e;
    }
  }
  function writeJd(id, text, header) {
    atomicWrite(jdPath(id), `${header.replace(/\n+$/, '')}\n\n---\n\n${text.trim()}\n`);
    return `jd/${id}.md`;
  }
  const deleteJd = (id) => fs.rmSync(jdPath(id), { force: true });

  // ---- AI 诊断与对话的缓存 ----
  function aiPath(id) {
    if (!SAFE_ID.test(id)) throw new StoreError('BAD_REQUEST', '非法 id');
    return at('ai', `${id}.json`);
  }
  function readAi(id) {
    try {
      return JSON.parse(fs.readFileSync(aiPath(id), 'utf8'));
    } catch {
      return null; // 没有缓存，或者文件坏了：当没有处理，重新问一次就好
    }
  }
  function writeAi(id, data) {
    atomicWrite(aiPath(id), `${JSON.stringify(data, null, 2)}\n`);
    return data;
  }
  const deleteAi = (id) => fs.rmSync(aiPath(id), { force: true });

  // ---- 简历文件 ----
  function saveResumeFile(resumeId, originalName, buf) {
    if (!SAFE_ID.test(resumeId)) throw new StoreError('BAD_REQUEST', '非法 id');
    const name = path.basename(String(originalName)).replace(/[/\\:*?"<>|\x00-\x1f]/g, '_').slice(-120) || 'file';
    const stored = `${resumeId}__${Date.now().toString(36)}__${name}`;
    fs.writeFileSync(at('resumes', stored), buf);
    return { name, stored: `resumes/${stored}`, size: buf.length, uploadedAt: now().toISOString() };
  }
  function resumeFilePath(stored) {
    const base = path.basename(String(stored));
    if (!stored || base !== stored || stored.startsWith('.')) throw new StoreError('BAD_REQUEST', '非法文件名');
    const full = at('resumes', base);
    if (!fs.existsSync(full)) throw new StoreError('NOT_FOUND', '文件不存在');
    return full;
  }
  const deleteResumeFile = (stored) => fs.rmSync(resumeFilePath(stored), { force: true });

  /** 数据文件的最新修改时间；网页靠它发现外部改动 */
  function version() {
    let v = 0;
    for (const d of Object.values(DOCS)) {
      try {
        v = Math.max(v, fs.statSync(at(d.file)).mtimeMs);
      } catch {
        // 文件还不存在
      }
    }
    return Math.floor(v);
  }

  return {
    dataDir, list, get, insert, replace, remove,
    getProfile, patchProfile, getSettings, patchSettings,
    readJd, writeJd, deleteJd,
    readAi, writeAi, deleteAi,
    saveResumeFile, resumeFilePath, deleteResumeFile,
    version,
  };
}
