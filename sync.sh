#!/bin/bash
# core 与公开仓工作区双向同步（一行命令，免去手动 cp）
#
# 用法（在 core 仓内执行）：
#   ./sync.sh push    # core → 公开仓工作区（打包/联调前合入，等价 release-upload.sh 的合入步骤）
#   ./sync.sh pull    # 公开仓工作区 → core（收集在公开工作区里直接改的核心文件改动）
#   ./sync.sh diff    # 只看两边的差异文件列表，不复制
#
# 工作区布局：OmniDeck/{deck=公开仓, core=本仓}
#
# 提交去向规则（唯一需要记住的事）：
#   electron/** 与 src/config/remote.cjs → 提交到 core（本仓）
#   其余一切（src/ docs/ scripts/ native/ package.json vite.config.js …）→ 提交到 deck（公开仓）
#   deck 的 .gitignore 已排除核心路径，方向搞错时 git 会直接忽略，不会污染历史
set -euo pipefail

CORE="$(cd "$(dirname "$0")" && pwd)"
PUB="${OMNIDECK_PUB_DIR:-$CORE/../deck}"

[ -d "$PUB/.git" ] || { echo "✗ 未找到公开仓工作区: $PUB（可用 OMNIDECK_PUB_DIR 指定）"; exit 1; }

MODE="${1:-diff}"

# 核心文件清单（.git 内文件、README 与 .DS_Store 不参与同步）
files() { ( cd "$CORE" && find . -path ./.git -prune -o -type f -print ) | sed 's|^\./||' | grep -vE '^(\.git/|\.gitignore|README\.md|sync\.sh$|\.DS_Store)'; }

case "$MODE" in
  push)
    echo "==> core → 公开仓工作区 ($PUB)"
    files | while IFS= read -r rel; do
      mkdir -p "$PUB/$(dirname "$rel")"
      cp "$CORE/$rel" "$PUB/$rel"
    done
    echo "完成。公开仓工作区已更新（核心路径已被其 .gitignore 排除，不会被提交）"
    ;;
  pull)
    echo "==> 公开仓工作区 → core（收集在公开工作区改动的核心文件）"
    n=0
    files | while IFS= read -r rel; do
      if [ -f "$PUB/$rel" ] && ! cmp -s "$CORE/$rel" "$PUB/$rel"; then
        echo "  收集: $rel"
        cp "$PUB/$rel" "$CORE/$rel"
      fi
    done
    echo "完成。请在 core 仓 git diff 确认后提交"
    ;;
  diff)
    echo "==> 差异文件（core vs 公开仓工作区）"
    d=0
    files | while IFS= read -r rel; do
      if [ ! -f "$PUB/$rel" ]; then
        echo "  [仅 core]  $rel"
      elif ! cmp -s "$CORE/$rel" "$PUB/$rel"; then
        echo "  [有差异]   $rel"
      fi
    done
    ;;
  *)
    echo "用法: ./sync.sh push|pull|diff"; exit 1 ;;
esac
