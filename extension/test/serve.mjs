// 测试页用的静态服务：只提供 extension/ 和 shared/（不会暴露 data/），只绑定 127.0.0.1。
// 运行：node extension/test/serve.mjs，然后打开 http://127.0.0.1:7320/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.argv[2] || process.env.PORT || 7320);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (rel === '/') rel = '/extension/test/pages/index.html';
  const full = path.resolve(root, `.${rel}`);
  const allowed = [path.join(root, 'extension') + path.sep, path.join(root, 'shared') + path.sep];
  if (!allowed.some((dir) => full.startsWith(dir))) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(port, '127.0.0.1', () => console.log(`测试页：http://127.0.0.1:${port}/`));
