// 在干净的 vm 上下文里依次运行内容脚本（它们是普通脚本，把东西挂在 globalThis.JT 上）
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadContentScripts(files) {
  const context = vm.createContext({ console });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
  return context.JT;
}

/** vm 里创建的对象来自另一个 realm，比较前先转成普通 JSON */
export const plain = (x) => JSON.parse(JSON.stringify(x));
