// 前端状态：一次加载全部数据；改动走 api，成功后更新本地并通知订阅者。
// 页面可见时每 4 秒查一次数据版本，发现外部改动（比如 Claude 改了文件）就重新加载；
// 正在输入时先不刷新，等输入框失去焦点再说。
import { api, onWriteVersion } from './api.js';

const state = {
  loaded: false,
  online: true,
  version: 0,
  profile: null,
  settings: null,
  applications: [],
  answers: [],
  resumes: [],
};
const listeners = new Set();
let pendingReload = false;

onWriteVersion((v) => {
  state.version = v;
});

function emit(topic) {
  for (const fn of [...listeners]) {
    try {
      fn(topic);
    } catch (e) {
      console.error(e);
    }
  }
}

function setOnline(online) {
  if (state.online === online) return;
  state.online = online;
  emit('online');
}

function isEditing() {
  const el = document.activeElement;
  return !!el && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select, [contenteditable="true"]');
}

function upsert(coll, rec) {
  const list = state[coll];
  const i = list.findIndex((r) => r.id === rec.id);
  if (i >= 0) list[i] = rec;
  else list.push(rec);
}

function drop(coll, id) {
  state[coll] = state[coll].filter((r) => r.id !== id);
}

export const store = {
  state,

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async load() {
    const s = await api.get('/api/state');
    Object.assign(state, s, { loaded: true });
    setOnline(true);
    emit('load');
  },

  startSync() {
    const check = async () => {
      if (document.hidden) return;
      try {
        const { version } = await api.get('/api/version');
        setOnline(true);
        if (version === state.version) return;
        if (isEditing()) {
          pendingReload = true;
          return;
        }
        await store.load();
      } catch {
        setOnline(false);
      }
    };
    setInterval(check, 4000);
    window.addEventListener('focus', check);
    document.addEventListener('focusout', () => {
      if (!pendingReload) return;
      pendingReload = false;
      setTimeout(check, 300);
    });
  },

  // ---- 投递 ----
  app: (id) => state.applications.find((a) => a.id === id) || null,

  async createApplication(data) {
    const rec = await api.post('/api/applications', data);
    upsert('applications', rec);
    emit('applications');
    return rec;
  },

  /** 先改界面再请求；失败时回滚 */
  async updateApplication(id, patch) {
    const prev = store.app(id);
    if (prev) {
      upsert('applications', { ...prev, ...patch });
      emit('applications');
    }
    try {
      const rec = await api.patch(`/api/applications/${id}`, patch);
      upsert('applications', rec);
      emit('applications');
      return rec;
    } catch (e) {
      if (prev) {
        upsert('applications', prev);
        emit('applications');
      }
      throw e;
    }
  },

  async deleteApplication(id) {
    await api.del(`/api/applications/${id}`);
    drop('applications', id);
    emit('applications');
  },

  getJd: (id) => api.get(`/api/applications/${id}/jd`).then((r) => r.text),

  async saveJd(id, text) {
    const rec = await api.put(`/api/applications/${id}/jd`, { text });
    upsert('applications', rec);
    emit('applications');
    return rec;
  },

  // ---- 档案 / 设置 ----
  async patchProfile(patch) {
    state.profile = await api.patch('/api/profile', patch);
    emit('profile');
    return state.profile;
  },

  async patchSettings(patch) {
    state.settings = await api.patch('/api/settings', patch);
    emit('settings');
    return state.settings;
  },

  // ---- 素材库 / 简历 ----
  async create(coll, data) {
    const rec = await api.post(`/api/${coll}`, data);
    upsert(coll, rec);
    emit(coll);
    return rec;
  },

  async update(coll, id, patch) {
    const rec = await api.patch(`/api/${coll}/${id}`, patch);
    upsert(coll, rec);
    emit(coll);
    return rec;
  },

  async remove(coll, id) {
    await api.del(`/api/${coll}/${id}`);
    drop(coll, id);
    emit(coll);
  },

  async uploadResumeFile(id, file) {
    const rec = await api.upload(`/api/resumes/${id}/files`, file);
    upsert('resumes', rec);
    emit('resumes');
    return rec;
  },

  async deleteResumeFile(id, stored) {
    const rec = await api.del(`/api/resumes/${id}/files/${encodeURIComponent(stored)}`);
    upsert('resumes', rec);
    emit('resumes');
    return rec;
  },
};
