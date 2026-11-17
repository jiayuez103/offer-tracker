// 像素图标 / 像素字的位图是手写的，一个字符写错图标就歪了：这里把格式和引用关系都查一遍。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONS, ICON_ALIAS, GLYPHS, iconSvg, pixelTextSvg, cellsToPath } from '../web/js/pixel.js';

test('每个图标都是 16×16，只用认识的字符', () => {
  for (const [name, rows] of Object.entries(ICONS)) {
    assert.equal(rows.length, 16, `${name} 的行数`);
    rows.forEach((row, i) => {
      assert.equal(row.length, 16, `${name} 第 ${i} 行的宽度`);
      assert.match(row, /^[.#wtypdg]+$/, `${name} 第 ${i} 行有不认识的字符`);
    });
  }
});

test('别名都指向存在的图标，名字不认识时返回空串', () => {
  for (const [alias, target] of Object.entries(ICON_ALIAS)) assert.ok(ICONS[target], `${alias} → ${target}`);
  assert.equal(iconSvg('no-such-icon'), '');
  assert.match(iconSvg('home'), /^<svg viewBox="0 0 16 16"/);
});

test('多色图标最后画描边，色块在前', () => {
  const svg = iconSvg('briefcase');
  const classes = [...svg.matchAll(/class="px-(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(classes, ['p', 'y', 'ink']);
});

test('像素字每个字形都是 7 行、行宽一致', () => {
  for (const [ch, rows] of Object.entries(GLYPHS)) {
    assert.equal(rows.length, 7, `字形 ${ch} 的行数`);
    assert.ok(rows.every((r) => r.length === rows[0].length && /^[.#]+$/.test(r)), `字形 ${ch} 的行宽`);
  }
  assert.equal(pixelTextSvg('12').width, 11); // 5 + 1 + 5
  assert.equal(pixelTextSvg('1 2').width, 14); // 不认识的字符留 3 格
});

test('同一行连续的格子合成一条，上下相邻的再垫一条', () => {
  const grid = ['##.', '#..'];
  const d = cellsToPath((y, x) => grid[y][x] === '#', 3, 2);
  assert.equal(d, 'M0 0h2v1h-2zM0 0.5h1v1h-1zM0 1h1v1h-1z');
});

test('网页里用到的图标名都画了', () => {
  const names = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(js|html)$/.test(entry.name)) {
        const text = readFileSync(path, 'utf8');
        for (const m of text.matchAll(/\bicon\('([a-z-]+)'/g)) names.add(m[1]);
        for (const m of text.matchAll(/data-icon="([a-z-]+)"/g)) names.add(m[1]);
      }
    }
  };
  walk(fileURLToPath(new URL('../web', import.meta.url))); // 路径里有空格，不能直接用 .pathname
  for (const name of names) assert.notEqual(iconSvg(name), '', `图标 ${name} 没有画`);
});
