#!/bin/bash
# 公开仓自动镜像：将本仓（完整开发仓）剥离核心路径后，推送到公开仓双远端
#
# 原理：
#   1. git clone --bare 本仓 → /tmp 镜像副本
#   2. git filter-repo 剥离 electron/ 与 src/config/remote.cjs（全历史）
#   3. push 到公开仓（gitcode origin-public / github），tag 一并推送
#   filter-repo 对相同历史输入的剥离是确定性的——只要本仓不 rebase/filter，
#   每次镜像产出的 commit hash 稳定，公开仓增量更新，无需 force
#
# 用法：
#   ./scripts/mirror-public.sh          # 镜像当前 main + 全部 tag
#   ./scripts/mirror-public.sh v0.3.0   # 镜像并推送指定 tag（发版时用）
#
# 依赖：git-filter-repo（pip3 install --user git-filter-repo）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAG="${1:-}"
MIRROR=/tmp/omnideck-public-mirror

command -v git-filter-repo >/dev/null 2>&1 || export PATH="$PATH:$(python3 -c 'import site;print(site.USER_BASE+"/bin")')"
command -v git-filter-repo >/dev/null 2>&1 || { echo "✗ 缺少 git-filter-repo：pip3 install --user git-filter-repo"; exit 1; }

# 干净检查：未提交改动不镜像
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "✗ 工作区有未提交改动，请先 commit 再镜像"; exit 1
fi

echo "==> 生成本地 bare 镜像"
rm -rf "$MIRROR"
git clone --bare "$ROOT" "$MIRROR" >/dev/null 2>&1

echo "==> 剥离核心路径（electron/ 与 src/config/remote.cjs，全历史）"
( cd "$MIRROR" && git filter-repo --force --invert-paths --path electron --path src/config/remote.cjs ) >/dev/null 2>&1

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

echo "==> 镜像完成：公开仓不含 electron/ 与 src/config/remote.cjs"
[ -n "$TAG" ] && echo "（tag $TAG 已随 --tags 推送）"
