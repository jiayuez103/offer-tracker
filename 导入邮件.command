#!/bin/bash
# 把剪贴板里的邮件正文送进 Tracker 的「待确认」队列，并弹一条通知。
# 用法：选中邮件正文 → ⌘C → 双击本文件，或在「快捷指令」里绑定快捷键调用它。
# 传参也行：导入邮件.command "邮件正文"（方便测试）
PORT=7317
URL="http://127.0.0.1:$PORT"

notify() { osascript -e "display notification \"$1\" with title \"秋招 Tracker\"" >/dev/null 2>&1; }

TEXT="${1:-$(pbpaste)}"
if [ -z "$(printf '%s' "$TEXT" | tr -d '[:space:]')" ]; then
  notify "剪贴板是空的：先选中邮件正文按 ⌘C"
  echo "剪贴板是空的"
  exit 1
fi

if ! curl -s --max-time 2 "$URL/api/ping" | grep -q '"job-tracker"'; then
  notify "Tracker 没在运行：双击「启动Tracker.command」"
  echo "Tracker 没在运行"
  exit 1
fi

# 用 node 组 JSON，避免正文里的引号和换行把请求搞坏
BODY="$(TEXT="$TEXT" node -e 'process.stdout.write(JSON.stringify({ text: process.env.TEXT }))')"
RESP="$(curl -s --max-time 10 -X POST -H 'Content-Type: application/json' -d "$BODY" "$URL/api/inbox")"
SUMMARY="$(RESP="$RESP" node -e '
  try {
    const r = JSON.parse(process.env.RESP);
    process.stdout.write(r.error ? `导入失败：${r.error}` : `已收到 ${r.summary}`);
  } catch {
    process.stdout.write("导入失败：Tracker 没有正常回应");
  }
')"

notify "$SUMMARY"
echo "$SUMMARY"
