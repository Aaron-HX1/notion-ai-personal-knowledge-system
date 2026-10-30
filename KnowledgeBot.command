#!/bin/zsh
set -eu
cd "$(dirname "$0")"
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
 NODE_BIN="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$NODE_BIN" ]]; then
 osascript -e 'display alert "缺少 Node.js 运行环境" message "请安装 Node.js 22 或更新版本。"'
 exit 1
fi
if ! "$NODE_BIN" scripts/start-local.mjs; then
 osascript -e 'display alert "KnowledgeBot 启动失败" message "请查看项目 work/server.log，确认配置和端口可用。"'
 exit 1
fi
