#!/bin/bash
# 公开仓自动镜像：将本仓（完整开发仓）全量推送到公开仓双远端
#
# 原理：
#   1. git clone --bare 本仓 → /tmp 镜像副本
#   2. push 到公开仓（gitcode origin-public / github），tag 一并推送
#   项目已彻底开源：镜像不再剥离任何路径，公开仓与本仓完全一致，
#   commit hash 直接对应，增量更新无需改写历史（--force 仅作兜底）
#
# 用法：
#   ./scripts/mirror-public.sh          # 镜像当前 main + 全部 tag
#   ./scripts/mirror-public.sh v0.4.0   # 镜像并推送指定 tag（发版时用）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAG="${1:-}"
MIRROR=/tmp/omnideck-public-mirror

# 干净检查：未提交改动不镜像
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "✗ 工作区有未提交改动，请先 commit 再镜像"; exit 1
fi

echo "==> 生成本地 bare 镜像"
rm -rf "$MIRROR"
git clone --bare "$ROOT" "$MIRROR" >/dev/null 2>&1

# 公开仓地址（与 release-upload.sh 保持一致）
GC_PUB="https://gitcode.com/m0_59492087/OmniDeck.git"
GH_PUB="https://github.com/rzechen/OmniDeck.git"

# 推送并在失败时暴露完整输出（含 remote: 开头的服务端钩子报错），任一失败即中止
push_all() {
  local name=$1 out ref
  for ref in "refs/heads/main:refs/heads/main" "--tags"; do
    if [ "$ref" = "--tags" ]; then
      if out=$(git push --force "$name" --tags 2>&1); then
        echo "$out" | grep -vE '^(remote:|To )' || true
      else
        echo "✗ $name 推送 tags 失败："; echo "$out"; exit 1
      fi
    else
      if out=$(git push --force "$name" "$ref" 2>&1); then
        echo "$out" | grep -vE '^(remote:|To )' || true
      else
        echo "✗ $name 推送 main 失败："; echo "$out"; exit 1
      fi
    fi
  done
}

( cd "$MIRROR"
  git remote add gc "$GC_PUB"
  git remote add gh "$GH_PUB"

  echo "==> 推送 gitcode 公开仓"
  push_all gc

  echo "==> 推送 github 公开仓"
  push_all gh
)

echo "==> 镜像完成：公开仓与本仓完全一致（全量源码）"
[ -n "$TAG" ] && echo "（tag $TAG 已随 --tags 推送）"
