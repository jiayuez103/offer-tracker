#!/bin/bash
# 双击启动秋招 Tracker。服务已经在运行时直接打开网页。
cd "$(dirname "$0")" || exit 1
PORT=7317
URL="http://127.0.0.1:$PORT"

is_running() {
  curl -s --max-time 1 "$URL/api/ping" | grep -q '"job-tracker"'
}

NODE="$(command -v node)"
for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
  [ -z "$NODE" ] && [ -x "$candidate" ] && NODE="$candidate"
done
if [ -z "$NODE" ]; then
  echo "没有找到 Node.js。请先安装：https://nodejs.org（或者 brew install node）"
  read -n 1 -s -r -p "按任意键关闭…"
  exit 1
fi

if is_running; then
  echo "Tracker 已经在运行。"
else
  mkdir -p data
  nohup "$NODE" server.js >> data/server.log 2>&1 &
  for _ in $(seq 1 50); do
    is_running && break
    sleep 0.2
  done
  if ! is_running; then
    echo "启动失败，下面是最近的日志："
    tail -n 20 data/server.log
    read -n 1 -s -r -p "按任意键关闭…"
    exit 1
  fi
  echo "Tracker 已启动。"
fi

open "$URL"
echo "可以关掉这个窗口，Tracker 会继续在后台运行。要停止就双击「停止Tracker.command」。"
