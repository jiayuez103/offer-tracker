// 秋招 Tracker 本地服务入口：只监听 127.0.0.1（同一 Wi-Fi 的其他设备也访问不到）
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './server/app.js';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 7317);
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');

const server = http.createServer(createApp({ dataDir, rootDir }));

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用。如果 Tracker 已经在运行，直接打开 http://127.0.0.1:${port}`);
  } else {
    console.error(e);
  }
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`秋招 Tracker 已启动：http://127.0.0.1:${port}（数据目录：${dataDir}）`);
});
