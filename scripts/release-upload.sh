#!/bin/bash
# OmniDeck 发版脚本：打包（mac/win）+ 上传 Release（GitCode / GitHub）
#
# 用法：
#   ./scripts/release-upload.sh local [mac|win|all]                        # 仅本地打包（不上传）
#   ./scripts/release-upload.sh v0.3.0 [mac|win|all] [gitcode|github|all]  # 打包 + 上传 Release 附件
#     上传目标缺省 gitcode（现有 feed 链路）；github 发布到 github.com/rzechen/OmniDeck
#
# 流程：
#   1. native 插件兜底编译（native/build/Release/windows.node 缺失时才编译；
#      macOS 窗口枚举 NAPI 插件，截图 hover 拾取窗口用，通常编译一次即可）
#   2. vite build（渲染包 + electron 主进程）
#   3. electron-builder 打包（afterPack 拷入内置运行时 + mac ad-hoc 签名）
#   4. tag 模式：上传 release/ 产物到 GitCode / GitHub Release
#
# GitCode 上传链路（已实测）：
#   1. GET /repos/:owner/:repo/releases/:tag/upload_url?file_name=xx → 预签名 PUT 地址 + 请求头
#   2. PUT 文件到预签名地址
#   3. 资产出现为 https://gitcode.com/:owner/:repo/releases/download/:tag/:file_name（匿名 GET 可达）
#
# GitHub 上传链路（Releases API）：
#   1. GET /repos/:owner/:repo/releases/tags/:tag 查 release（无则 POST 创建）
#   2. POST /uploads.github.com/repos/:owner/:repo/releases/:id/assets?name=xx 上传资产
#   3. 资产出现为 https://github.com/:owner/:repo/releases/download/:tag/:file_name
#   4. 资产已存在（422）时先删除同名资产再重传（支持中断后续传）
# 依赖：git 凭证存储中有对应平台 token（git credential fill）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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

# 1) native 插件兜底编译（产物已存在则跳过）
if [ ! -f native/build/Release/windows.node ]; then
  echo "==> 编译 native 插件（窗口枚举 NAPI，截图 hover 拾取窗口用）"
  ( cd native && npm_config_disturl=https://npmmirror.com/dist npx node-gyp rebuild )
fi

# 2) 前端 + electron 主进程构建
echo "==> vite build"
npm run build

# 3) electron-builder 打包
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

# 收集产物（两个目标共用）
fail=0
shopt -s nullglob
files=("$DIR"/OmniDeck-*.dmg "$DIR"/OmniDeck-*.zip "$DIR"/OmniDeck-*.exe "$DIR"/OmniDeck-*.blockmap "$DIR"/latest*.yml)
shopt -u nullglob

[ ${#files[@]} -gt 0 ] || { echo "release/ 下没有可上传的产物（OmniDeck-*.dmg/zip/exe/blockmap、latest*.yml）"; exit 1; }

# ===== GitCode =====
upload_gitcode() {
  local OWNER="m0_59492087"
  local REPO="OmniDeck"
  local TOKEN
  TOKEN=$(printf 'protocol=https\nhost=gitcode.com\n\n' | git credential fill 2>/dev/null | grep '^password=' | cut -d= -f2-)
  [ -n "$TOKEN" ] || { echo "✗ 无法从 git 凭证获取 GitCode token，跳过 GitCode"; return 1; }

  local fail=0
  for f in "${files[@]}"; do
    echo "→ [gitcode] 上传 $(basename "$f") ..."

    # 1. 取预签名上传地址
    local resp url
    resp=$(curl -s --max-time 20 -H "Authorization: Bearer $TOKEN" \
      "https://api.gitcode.com/api/v5/repos/$OWNER/$REPO/releases/$TAG/upload_url?file_name=$(basename "$f")")
    url=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin)['url'])" 2>/dev/null) || {
      echo "  ✗ 获取上传地址失败：$resp"; fail=$((fail + 1)); continue
    }

    # 2. PUT 上传到预签名地址
    python3 - "$resp" "$f" <<'PYEOF' || fail=$((fail + 1))
import json, subprocess, sys
resp, file = sys.argv[1], sys.argv[2]
d = json.loads(resp)
cmd = ['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'PUT', '--data-binary', '@' + file, d['url']]
for k, v in d['headers'].items():
    cmd += ['-H', f'{k}: {v}']
p = subprocess.run(cmd, capture_output=True)
code = p.stdout.decode()
print('  上传响应:', code)
sys.exit(0 if code == '200' else 1)
PYEOF
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

    local code
    code=$(curl -s -o /tmp/gh-upload-resp.json -w '%{http_code}' --max-time 600 \
      "${auth_header[@]}" -H "Content-Type: application/octet-stream" \
      --data-binary "@$f" \
      "$UPLOAD_URL/repos/$OWNER/$REPO/releases/$REL_ID/assets?name=$name")
    if [ "$code" = "201" ]; then
      echo "  上传响应: $code"
    else
      echo "  ✗ 上传失败（$code）：$(head -c 200 /tmp/gh-upload-resp.json)"
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
