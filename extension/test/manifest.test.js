import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_FILES } from '../bg/handlers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('manifest 基本字段', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), ['scripting', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.action.default_popup, undefined, '点图标要触发 onClicked，不能设 popup');
  assert.ok(manifest.commands['toggle-panel']);
});

test('manifest 和后台引用的文件都存在', () => {
  const files = [
    manifest.background.service_worker,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...AGENT_FILES,
    'content/panel.js',
  ];
  for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), f);
});

test('图标都是 PNG', () => {
  for (const f of Object.values(manifest.icons)) {
    const head = [...fs.readFileSync(path.join(root, f)).subarray(0, 8)];
    assert.deepEqual(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], f);
  }
});
