#!/bin/bash
# OmniDeck 发版脚本：打包（mac/win）+ 上传 GitCode Release
#
# 用法：
#   ./scripts/release-upload.sh local [mac|win|all]   # 仅本地打包（不上传）
#   ./scripts/release-upload.sh v0.3.0 [mac|win|all]  # 打包 + 上传 Release 附件
#
# 流程：
#   1. native 插件兜底编译（native/build/Release/windows.node 缺失时才编译；
#      macOS 窗口枚举 NAPI 插件，截图 hover 拾取窗口用，通常编译一次即可）
#   2. vite build（渲染包 + electron 主进程）
#   3. electron-builder 打包（afterPack 拷入内置运行时 + mac ad-hoc 签名）
#   4. tag 模式：上传 release/ 产物到 GitCode Release
#
# 上传链路（已实测）：
#   1. GET /repos/:owner/:repo/releases/:tag/upload_url?file_name=xx → 预签名 PUT 地址 + 请求头
#   2. PUT 文件到预签名地址
#   3. 资产出现为 https://gitcode.com/:owner/:repo/releases/download/:tag/:file_name（匿名 GET 可达）
# 依赖：git 凭证存储中有 GitCode token（git credential fill）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

usage() {
  grep '^#' "$0" | grep -v '^#!' | sed 's/^# \{0,2\}//' | head -14
  exit 1
}

MODE="${1:-}"
[ -n "$MODE" ] || usage
TARGET="${2:-mac}"

case "$MODE" in
  local) UPLOAD=0 ;;
  v[0-9]*) UPLOAD=1; TAG="$MODE" ;;
  *) echo "错误: 第一个参数须为 local 或版本 tag（如 v0.3.0）" >&2; usage ;;
esac
case "$TARGET" in
  mac|win|all) ;;
  *) echo "错误: 平台须为 mac / win / all" >&2; exit 1 ;;
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

# 4) tag 模式：上传 GitCode Release 附件
if [ "$UPLOAD" -eq 0 ]; then
  echo "==> 本地模式（local），跳过上传"
  exit 0
fi

OWNER="m0_59492087"
REPO="OmniDeck"
DIR="$ROOT/release"

# git 凭证取 token
TOKEN=$(printf 'protocol=https\nhost=gitcode.com\n\n' | git credential fill 2>/dev/null | grep '^password=' | cut -d= -f2-)
[ -n "$TOKEN" ] || { echo "无法从 git 凭证获取 GitCode token"; exit 1; }

upload_one() {
  local file="$1"
  local name
  name=$(basename "$file")
  echo "→ 上传 $name ..."

  # 1. 取预签名上传地址
  local resp url
  resp=$(curl -s --max-time 20 -H "Authorization: Bearer $TOKEN" \
    "https://api.gitcode.com/api/v5/repos/$OWNER/$REPO/releases/$TAG/upload_url?file_name=$name")
  url=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin)['url'])" 2>/dev/null) || {
    echo "  ✗ 获取上传地址失败：$resp"; return 1
  }

  # 2. PUT 上传到预签名地址
  python3 - "$resp" "$file" <<'PYEOF'
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
}

fail=0
shopt -s nullglob
files=("$DIR"/OmniDeck-*.dmg "$DIR"/OmniDeck-*.zip "$DIR"/OmniDeck-*.exe "$DIR"/OmniDeck-*.blockmap "$DIR"/latest*.yml)
shopt -u nullglob

[ ${#files[@]} -gt 0 ] || { echo "release/ 下没有可上传的产物（OmniDeck-*.dmg/zip/exe/blockmap、latest*.yml）"; exit 1; }

for f in "${files[@]}"; do
  upload_one "$f" || fail=$((fail + 1))
done

echo ""
if [ "$fail" -eq 0 ]; then
  echo "✓ 全部上传完成：https://gitcode.com/$OWNER/$REPO/releases"
  echo "  客户端 feed 将自动指向 https://gitcode.com/$OWNER/$REPO/releases/download/$TAG/"
else
  echo "✗ $fail 个文件上传失败"
  exit 1
fi
