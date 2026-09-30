#!/bin/bash
# OmniDeck 发版脚本：镜像公开仓 + 打包（mac/win）+ 上传 Release（GitCode / GitHub）
#
# 用法：
#   ./scripts/release-upload.sh local [mac|win|all]                        # 仅本地打包（不上传、不镜像）
#   ./scripts/release-upload.sh v0.3.0 [mac|win|all] [gitcode|github|all]  # 打包 + 上传 Release 附件
#     上传目标缺省 gitcode（现有 feed 链路）；github 发布到 github.com/rzechen/OmniDeck
#
# 流程：
#   1. tag 模式：先跑 scripts/mirror-public.sh 剥离核心路径推公开仓（剥离 electron/ 与
#      src/config/remote.cjs 后镜像，公开仓可下载使用制品但拿不到核心源码）
#   2. native 插件兜底编译（windows.node 缺失时才编译；截图 hover 拾取窗口用）
#   3. vite build + electron-builder 打包（afterPack 拷运行时 + mac ad-hoc 签名）
#   4. 上传 release/ 产物到 GitCode / GitHub Release（release 不存在时自动创建）
#
# GitCode 上传：GET upload_url 预签名 PUT；GitHub 上传：Releases API（草稿→传→发布）
# 依赖：git 凭证存储中有对应平台 token（git credential fill）；git-filter-repo（镜像用）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# electron / electron-builder 工具链走 npmmirror 镜像（默认源国内常 TLS 断连）
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"

usage() {
  grep '^#' "$0" | grep -v '^#!' | sed 's/^# \{0,2\}//' | head -25
  exit 1
}

MODE="${1:-}"
[ -n "$MODE" ] || usage
TARGET="${2:-mac}"
DEST="${3:-gitcode}"

case "$MODE" in
  local) UPLOAD=0 ;;
  v[0-9]*) UPLOAD=1; TAG="$MODE" ;;
  *) echo "错误: 第一个参数须为 local 或版本 tag（如 v0.3.0）" >&2; usage ;;
esac
case "$TARGET" in
  mac|win|all) ;;
  *) echo "错误: 平台须为 mac / win / all" >&2; exit 1 ;;
esac
case "$DEST" in
  gitcode|github|all) ;;
  *) echo "错误: 上传目标须为 gitcode / github / all" >&2; exit 1 ;;
esac

# 1) tag 模式：先镜像公开仓（剥离核心路径全历史，见 scripts/mirror-public.sh）
if [ "$UPLOAD" -eq 1 ]; then
  echo "==> 镜像公开仓（剥离 electron/ 与 src/config/remote.cjs）"
  bash "$ROOT/scripts/mirror-public.sh" "$TAG"
fi

# 2) native 插件兜底编译（产物已存在则跳过）
if [ ! -f native/build/Release/windows.node ]; then
  echo "==> 编译 native 插件（窗口枚举 NAPI，截图 hover 拾取窗口用）"
  ( cd native && npm_config_disturl=https://npmmirror.com/dist npx node-gyp rebuild )
fi

# 3) 前端 + electron 主进程构建
echo "==> vite build"
npm run build

# 4) electron-builder 打包
case "$TARGET" in
  mac) npx electron-builder --mac ;;
  win) npx electron-builder --win --x64 ;;
  all) npx electron-builder --mac && npx electron-builder --win --x64 ;;
esac
echo "==> 打包完成: release/"

# 4) tag 模式：上传 Release 附件（GitCode / GitHub）
if [ "$UPLOAD" -eq 0 ]; then
  echo "==> 本地模式（local），跳过上传"
  exit 0
fi

DIR="$ROOT/release"

# 收集产物（两个目标共用；只挂安装包 dmg/exe，更新文件 blockmap/latest*.yml 不上传）
fail=0
shopt -s nullglob
files=("$DIR"/OmniDeck-*.dmg "$DIR"/OmniDeck-*.exe)
shopt -u nullglob

[ ${#files[@]} -gt 0 ] || { echo "release/ 下没有可上传的产物（OmniDeck-*.dmg / OmniDeck-*.exe）"; exit 1; }

# ===== GitCode =====
upload_gitcode() {
  local OWNER="m0_59492087"
  local REPO="OmniDeck"
  local TOKEN
  TOKEN=$(printf 'protocol=https\nhost=gitcode.com\n\n' | git credential fill 2>/dev/null | grep '^password=' | cut -d= -f2-)
  [ -n "$TOKEN" ] || { echo "✗ 无法从 git 凭证获取 GitCode token，跳过 GitCode"; return 1; }

  # 0. release 不存在则创建（tag 已推送过；未推送时用 target_commitish 在默认分支建 tag）
  local rel
  rel=$(curl -s --max-time 20 -H "Authorization: Bearer $TOKEN" \
    "https://api.gitcode.com/api/v5/repos/$OWNER/$REPO/releases/tags/$TAG")
  if ! echo "$rel" | grep -q '"tag_name"'; then
    echo "→ [gitcode] release $TAG 不存在，创建中 ..."
    rel=$(curl -s --max-time 20 -H "Authorization: Bearer $TOKEN" \
      -X POST "https://api.gitcode.com/api/v5/repos/$OWNER/$REPO/releases" \
      -H "Content-Type: application/json" \
      -d "{\"tag_name\":\"$TAG\",\"name\":\"OmniDeck $TAG\",\"prerelease\":false,
           \"body\":\"OmniDeck $TAG 发布。安装包与更新文件见附件。使用与再分发条款见仓库 LICENSE。\"}")
    echo "$rel" | grep -q '"tag_name"' || { echo "  ✗ 创建 release 失败：$rel"; return 1; }
  fi

  local fail=0
  for f in "${files[@]}"; do
    echo "→ [gitcode] 上传 $(basename "$f") ..."

    # 1+2. 取预签名地址并 PUT 上传（失败自动换新预签名地址重试 1 次；响应体留存便于诊断）
    local resp attempt rc
    rc=1
    for attempt in 1 2; do
      [ "$attempt" -eq 2 ] && { echo "  → 重试上传（重新取预签名地址）..."; sleep 3; }
      resp=$(curl -s --max-time 20 -H "Authorization: Bearer $TOKEN" \
        "https://api.gitcode.com/api/v5/repos/$OWNER/$REPO/releases/$TAG/upload_url?file_name=$(basename "$f")")
      echo "$resp" | python3 -c "import json,sys; json.load(sys.stdin)['url']" 2>/dev/null || {
        echo "  ✗ 获取上传地址失败：$resp"; continue
      }
      if python3 - "$resp" "$f" <<'PYEOF'; then
import json, os, subprocess, sys
resp, file = sys.argv[1], sys.argv[2]
d = json.loads(resp)
tmp = '/tmp/gitcode-put-resp.' + str(os.getpid())
cmd = ['curl', '-sS', '-o', tmp, '-w', '%{http_code}',
       '--connect-timeout', '30', '--speed-time', '60', '--speed-limit', '10240',
       '-X', 'PUT', '--data-binary', '@' + file, d['url']]
for k, v in d['headers'].items():
    cmd += ['-H', f'{k}: {v}']
p = subprocess.run(cmd, capture_output=True)
code = p.stdout.decode().strip()
print('  上传响应:', code)
if code != '200':
    detail = ''
    try:
        detail = open(tmp, errors='replace').read(200)
    except OSError:
        pass
    print('  ✗ 失败详情:', detail or p.stderr.decode(errors='replace')[:200])
    sys.exit(1)
PYEOF
        rc=0
        break
      fi
    done
    [ "$rc" -eq 0 ] || fail=$((fail + 1))
  done

  if [ "$fail" -eq 0 ]; then
    echo "✓ [gitcode] 全部上传完成：https://gitcode.com/$OWNER/$REPO/releases"
    echo "  客户端 feed 将自动指向 https://gitcode.com/$OWNER/$REPO/releases/download/$TAG/"
  else
    echo "✗ [gitcode] $fail 个文件上传失败"
  fi
  return "$fail"
}

# ===== GitHub =====
upload_github() {
  local OWNER="rzechen"
  local REPO="OmniDeck"
  local TOKEN API UPLOAD_URL REL_ID
  TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | grep '^password=' | cut -d= -f2-)
  [ -n "$TOKEN" ] || { echo "✗ 无法从 git 凭证获取 GitHub token，跳过 GitHub"; return 1; }
  API="https://api.github.com"
  UPLOAD_URL="https://uploads.github.com"

  auth_header=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")

  # 1. 按 tag 查 release（404 时创建草稿，上传完再发布）
  local rel
  rel=$(curl -s --max-time 20 "${auth_header[@]}" "$API/repos/$OWNER/$REPO/releases/tags/$TAG")
  REL_ID=$(echo "$rel" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

  if [ -z "$REL_ID" ]; then
    echo "→ [github] release $TAG 不存在，创建中 ..."
    rel=$(curl -s --max-time 20 "${auth_header[@]}" \
      -X POST "$API/repos/$OWNER/$REPO/releases" \
      -d "{\"tag_name\":\"$TAG\",\"name\":\"OmniDeck $TAG\",\"draft\":true,\"prerelease\":false,
           \"body\":\"OmniDeck $TAG 发布。安装包与更新文件见附件。\"}")
    REL_ID=$(echo "$rel" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
    if [ -z "$REL_ID" ]; then
      echo "✗ [github] 创建 release 失败：$rel"
      return 1
    fi
  else
    # 已发布（非草稿）的 release 不能直接加资产：转草稿 → 传完转发布
    local is_draft
    is_draft=$(echo "$rel" | python3 -c "import json,sys; print('true' if json.load(sys.stdin).get('draft') else 'false')" 2>/dev/null)
    if [ "$is_draft" = "false" ]; then
      curl -s --max-time 20 -o /dev/null "${auth_header[@]}" \
        -X PATCH "$API/repos/$OWNER/$REPO/releases/$REL_ID" -d '{"draft":true}'
    fi
  fi

  local fail=0
  for f in "${files[@]}"; do
    local name
    name=$(basename "$f")
    echo "→ [github] 上传 $name ..."

    # 资产重名（422）：先删旧资产再传（支持中断后续传）
    local assets dup_id
    assets=$(curl -s --max-time 20 "${auth_header[@]}" "$API/repos/$OWNER/$REPO/releases/$REL_ID/assets")
    dup_id=$(echo "$assets" | python3 -c "import json,sys
assets = json.load(sys.stdin)
print(next((a['id'] for a in assets if a['name'] == '$name'), ''))" 2>/dev/null)
    if [ -n "$dup_id" ]; then
      echo "  同名资产已存在，删除后重传 ..."
      curl -s --max-time 20 -o /dev/null "${auth_header[@]}" -X DELETE "$API/repos/$OWNER/$REPO/releases/assets/$dup_id"
    fi

    local code resp_file="/tmp/gh-upload-resp.$$.json"
    # 不设总超时（661MB 国内直连 10 分钟内常传不完）；改用连接超时 + 断流检测 + 自动重试
    rm -f "$resp_file"
    code=$(curl -sS -o "$resp_file" -w '%{http_code}' \
      --connect-timeout 30 --speed-time 60 --speed-limit 10240 \
      --retry 2 --retry-delay 5 \
      "${auth_header[@]}" -H "Content-Type: application/octet-stream" \
      --data-binary "@$f" \
      "$UPLOAD_URL/repos/$OWNER/$REPO/releases/$REL_ID/assets?name=$name")
    if [ "$code" = "201" ]; then
      echo "  上传响应: $code"
    else
      echo "  ✗ 上传失败（${code}）：$(head -c 200 "$resp_file" 2>/dev/null || echo '（无响应体，原因见上方 curl 错误）')"
      fail=$((fail + 1))
    fi
  done

  if [ "$fail" -eq 0 ]; then
    # 全部成功：转正式发布（草稿外部不可见）
    curl -s --max-time 20 -o /dev/null "${auth_header[@]}" \
      -X PATCH "$API/repos/$OWNER/$REPO/releases/$REL_ID" -d '{"draft":false}'
    echo "✓ [github] 全部上传完成：https://github.com/$OWNER/$REPO/releases"
  else
    echo "✗ [github] $fail 个文件上传失败（release 保持草稿态，可重跑续传）"
  fi
  return "$fail"
}

case "$DEST" in
  gitcode) upload_gitcode || fail=1 ;;
  github)  upload_github || fail=1 ;;
  all)
    upload_gitcode || fail=1
    upload_github || fail=1
    ;;
esac

echo ""
if [ "$fail" -eq 0 ]; then
  echo "✓ 发版完成"
else
  echo "✗ 部分上传失败"
  exit 1
fi
