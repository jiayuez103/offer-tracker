#!/bin/bash
# 把剪贴板里的邮件正文送进 Tracker 的「待确认」队列，并弹一条通知。
# 用法：选中邮件正文 → ⌘C → 按快捷键（或双击本文件）。快捷指令若把选中文本传给 stdin，则不用先复制。
# 传参也行：导入邮件.command "邮件正文"（方便测试）
PORT=7317
URL="http://127.0.0.1:$PORT"

# 快捷指令跑脚本时不带 locale，pbpaste 会按系统的中文旧编码（GB18030）输出，中文到了这边全是乱码。
# 强制 UTF-8，别用 ${LANG:-...}：LANG 要是已经被设成非 UTF-8 的值就盖不掉了。
export LANG="en_US.UTF-8"
export LC_ALL="en_US.UTF-8"

notify() { osascript -e "display notification \"$1\" with title \"秋招 Tracker\"" >/dev/null 2>&1; }

# 取正文的三条路，按优先级：命令行参数（测试用）→ stdin（快捷指令送进来的选中文本）→ 剪贴板
TEXT="$1"
# 不是终端才读 stdin，而且限时 1 秒：管道开着却没内容时不能一直等
if [ -z "$TEXT" ] && [ ! -t 0 ]; then
  while IFS= read -r -t 1 line; do TEXT="$TEXT$line
"; done
fi
if [ -z "$(printf '%s' "$TEXT" | tr -d '[:space:]')" ]; then TEXT="$(pbpaste)"; fi
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

# 用 node 组 JSON，避免正文里的引号和换行把请求搞坏；顺便拦住编码坏掉的内容
BODY="$(TEXT="$TEXT" node -e '
  const t = process.env.TEXT || "";
  const bad = (t.match(/�/g) || []).length;
  if (bad > 3 && bad > t.length * 0.02) {
    console.error("乱码");
    process.exit(2);
  }
  process.stdout.write(JSON.stringify({ text: t }));
')"
if [ $? -ne 0 ]; then
  notify "复制的内容是乱码，没有导入。试着重新复制一次纯文本"
  echo "内容编码不对，已中止"
  exit 1
fi
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
