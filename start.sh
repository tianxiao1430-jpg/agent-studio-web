#!/bin/sh
set -eu
APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -x /opt/homebrew/opt/node@24/bin/node ]; then
  PATH="/opt/homebrew/opt/node@24/bin:$PATH"
  export PATH
fi
cd "$APP_DIR"
if [ ! -d node_modules ]; then
  printf '%s\n' '请先在此目录运行 npm ci 安装依赖。' >&2
  exit 1
fi
if [ ! -f dist/client/index.html ]; then
  npm run build
fi
printf '%s\n' 'Agent Studio Web: http://127.0.0.1:4173（Ctrl+C 停止）'
exec npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
