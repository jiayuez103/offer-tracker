// 所有网络请求都走这里，用相对路径。以后部署上线：改 API_BASE、在 request 里加登录凭证即可。
const API_BASE = globalThis.JT_API_BASE || '';
let writeVersionListener = null;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** store 用它记下自己写入后的数据版本，避免把自己的保存当成外部改动 */
export function onWriteVersion(fn) {
  writeVersionListener = fn;
}

async function request(method, path, { body, raw = false, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    if (raw) {
      init.body = body;
    } else {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = 'application/json';
    }
  }
  let res;
  try {
    res = await fetch(API_BASE + path, init);
  } catch {
    throw new ApiError(0, '连不上 Tracker 服务，请先双击「启动Tracker.command」');
  }
  const version = res.headers.get('X-Data-Version');
  if (method !== 'GET' && version && writeVersionListener) writeVersionListener(Number(version));
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || `请求失败（${res.status}）`);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, body) => request('POST', p, { body }),
  patch: (p, body) => request('PATCH', p, { body }),
  put: (p, body) => request('PUT', p, { body }),
  del: (p) => request('DELETE', p),
  upload: (p, file) => request('POST', p, {
    body: file,
    raw: true,
    headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
  }),
};

export const fileUrl = (stored) => `${API_BASE}/files/${stored.split('/').map(encodeURIComponent).join('/')}`;
export const calendarUrl = () => `${API_BASE}/calendar.ics`;
