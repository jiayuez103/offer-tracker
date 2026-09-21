#!/bin/bash
# 双击停止秋招 Tracker
PORT=7317
if ! curl -s --max-time 1 "http://127.0.0.1:$PORT/api/ping" | grep -q '"job-tracker"'; then
  echo "Tracker 没有在运行。"
  exit 0
fi
PIDS="$(lsof -ti "tcp:$PORT" -sTCP:LISTEN)"
if [ -n "$PIDS" ]; then
  kill $PIDS && echo "Tracker 已停止。"
fi
