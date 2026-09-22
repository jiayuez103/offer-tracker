// 生成插件图标：靛蓝圆角方块 + 白色对勾，4×4 超采样抗锯齿。运行：node extension/scripts/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../icons');
const ACCENT = [0x4f, 0x5b, 0xd5];
const WHITE = [255, 255, 255];
const CHECK = [[0.28, 0.53], [0.44, 0.68], [0.73, 0.36]];

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixel) {
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4); // 每行开头 1 字节滤波类型（0 = 不滤波）
    for (let x = 0; x < size; x += 1) row.set(pixel(x, y), 1 + x * 4);
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 位深
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inRoundedSquare(u, v, r) {
  const cx = Math.min(Math.max(u, r), 1 - r);
  const cy = Math.min(Math.max(v, r), 1 - r);
  return Math.hypot(u - cx, v - cy) <= r;
}

function colorAt(u, v) {
  if (!inRoundedSquare(u, v, 0.24)) return null;
  const d = Math.min(segmentDistance(u, v, CHECK[0], CHECK[1]), segmentDistance(u, v, CHECK[1], CHECK[2]));
  return d <= 0.065 ? WHITE : ACCENT;
}

function render(size) {
  const n = 4;
  return encodePng(size, (x, y) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let hits = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const c = colorAt((x + (i + 0.5) / n) / size, (y + (j + 0.5) / n) / size);
        if (c) {
          r += c[0];
          g += c[1];
          b += c[2];
          hits += 1;
        }
      }
    }
    if (!hits) return [0, 0, 0, 0];
    return [Math.round(r / hits), Math.round(g / hits), Math.round(b / hits), Math.round((hits / (n * n)) * 255)];
  });
}

fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), render(size));
  console.log(`icons/icon${size}.png`);
}
