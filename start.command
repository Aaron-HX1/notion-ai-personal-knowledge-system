#!/bin/zsh
set -eu
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
 echo "请先安装 Node.js 22+ LTS，然后再次双击 start.command。已为你打开官方下载页。"
 open https://nodejs.org/en/download
 open DEPLOY_GUIDE.html
 osascript -e 'display alert "首次运行需要 Node.js" message "请在已打开的 Node.js 官方页面下载 macOS LTS 安装器。安装完成后重新双击 start.command。"'
 exit 0
fi
if ! node scripts/install-and-run.mjs; then
 echo "首次配置或安装尚未完成。请阅读上方提示与 DEPLOY_GUIDE.md，修正后再次双击。"
 osascript -e 'display alert "KnowledgeBot 尚未完成初始化" message "请检查终端中的提示；配置不会丢失。修正后重新双击 start.command。"'
 exit 1
fi
