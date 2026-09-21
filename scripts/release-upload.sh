#!/bin/bash
# N5 发布脚本：将 release/ 构建产物上传为 GitCode Release 附件
# 用法：./scripts/release-upload.sh <tag>          # 上传 release/ 下所有 OmniDeck-*.{zip,exe,blockmap} + latest*.yml
#       ./scripts/release-upload.sh v0.3.0
# 依赖：git 凭证存储中有 GitCode token（git credential fill）
# 链路（已实测）：
#   1. GET /repos/:owner/:repo/releases/:tag/upload_url?file_name=xx → 预签名 PUT 地址 + 请求头
#   2. PUT 文件到预签名地址
#   3. 资产出现为 https://gitcode.com/:owner/:repo/releases/download/:tag/:file_name（匿名 GET 可达）
set -euo pipefail

TAG="${1:?用法: ./scripts/release-upload.sh <tag，如 v0.3.0>}"
OWNER="m0_59492087"
REPO="OmniDeck"
DIR="$(cd "$(dirname "$0")/.." && pwd)/release"

[ -d "$DIR" ] || { echo "未找到 release/ 目录，请先执行 npm run build:mac / build:win"; exit 1; }

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
files=("$DIR"/OmniDeck-*.zip "$DIR"/OmniDeck-*.exe "$DIR"/OmniDeck-*.blockmap "$DIR"/latest*.yml)
shopt -u nullglob

[ ${#files[@]} -gt 0 ] || { echo "release/ 下没有可上传的产物（OmniDeck-*.zip/exe/blockmap、latest*.yml）"; exit 1; }

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
