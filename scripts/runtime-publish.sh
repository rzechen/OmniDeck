#!/bin/bash
# OmniBuddy 运行时组件发布脚本：私有组件 zip → OmniBuddy-Plugins 仓库 Release
#
# 用法：
#   ./scripts/runtime-publish.sh [runtime-v1.0.0]   # tag 缺省 runtime-v1.0.0
#
# 流程：
#   1. 扫描 lib/<plat>/ 私有组件（python-env / node-tools），计算 sha256/size
#   2. 生成 runtime-manifest.json（私有组件双仓库 Release URL + 公共组件官方镜像 URL）
#   3. clone（空仓库则初始化）OmniBuddy-Plugins → 写 README + manifest → push 双远端
#   4. GitCode Release：创建 + 预签名 PUT 上传私有 zip
#   5. GitHub Release：草稿创建 + 上传 + 发布
#
# 依赖：git 凭证存储中有 gitcode.com / github.com 的 token（git credential fill）
#   私有组件（app 内下载解压装配）：
#     python-env-*.zip（解释器 + 预装数据栈）  node-tools-*.zip（sharp/docx 等）
#   公共组件不入仓库，manifest 直接给官方/镜像 URL（npmmirror / playwright cdn）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIB_ROOT="$ROOT/lib"
TAG="${1:-runtime-v1.0.0}"

# ---- 目标仓库 ----
GC_OWNER="m0_59492087"; GC_REPO="OmniBuddy-Plugins"
GH_OWNER="rzechen";     GH_REPO="OmniBuddy-Plugins"

# ---- 公共组件版本锚点（与 provision-runtime.sh 对齐；升级时联动）----
NODE_VERSION=22.23.1
PW_CFT_BUILD=154.0.8037.0
PW_FFMPEG_REV=1011
PW_WINLDD_REV=1007
PANDOC_VERSION=3.6.3

# ---- 凭证 ----
GC_TOKEN=$(printf 'protocol=https\nhost=gitcode.com\n\n' | git credential fill 2>/dev/null | grep '^password=' | cut -d= -f2-)
GC_USER=$(printf 'protocol=https\nhost=gitcode.com\n\n' | git credential fill 2>/dev/null | grep '^username=' | cut -d= -f2-)
GH_TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | grep '^password=' | cut -d= -f2-)
[ -n "$GC_TOKEN" ] || { echo "✗ 无法从 git 凭证获取 GitCode token"; exit 1; }
[ -n "$GH_TOKEN" ] || { echo "✗ 无法从 git 凭证获取 GitHub token"; exit 1; }

# ---- 私有组件清单（file → component）----
PRIVATE_FILES=(
  "darwin-arm64/python-env-osx-arm64.zip:python-env"
  "darwin-arm64/node-tools-darwin-arm64.zip:node-tools"
  "windows-x86_64/python-env-win-64.zip:python-env"
  "windows-x86_64/node-tools-win-x64.zip:node-tools"
)
private_paths=()
for e in "${PRIVATE_FILES[@]}"; do
  p="$LIB_ROOT/${e%%:*}"
  [ -f "$p" ] || { echo "✗ 私有组件缺失：$p（先跑 bash scripts/provision-runtime.sh archive）"; exit 1; }
  private_paths+=("$p")
done

echo "==> 生成 runtime-manifest.json（tag=${TAG}）"
WORK=$(mktemp -d /tmp/omnibuddy-plugins.XXXXXX)
export LIB_ROOT RT_TAG="$TAG" RT_WORK="$WORK"
python3 <<'PYEOF'
import hashlib, json, os
from datetime import date

lib, tag, work = os.environ['LIB_ROOT'], os.environ['RT_TAG'], os.environ['RT_WORK']
gc_base = f'https://gitcode.com/m0_59492087/OmniBuddy-Plugins/releases/download/{tag}'
gh_base = f'https://github.com/rzechen/OmniBuddy-Plugins/releases/download/{tag}'

NV, CFT, FFR, WLR, PV = '22.23.1', '154.0.8037.0', '1011', '1007', '3.6.3'
NPM = 'https://registry.npmmirror.com/-/binary/node'
NODEJS = 'https://nodejs.org/dist'
PWCDN = 'https://cdn.playwright.dev'
PWPRSS = 'https://playwright.download.prss.microsoft.com/dbazure/download/playwright'

# file → [组件名, urls(空=私有走双仓库 release)]
SPEC = {
  'darwin-arm64': {
    'python-env-osx-arm64.zip': ('python-env', []),
    'node-tools-darwin-arm64.zip': ('node-tools', []),
    f'node-v{NV}-darwin-arm64.tar.gz': ('node', [f'{NPM}/v{NV}/node-v{NV}-darwin-arm64.tar.gz', f'{NODEJS}/v{NV}/node-v{NV}-darwin-arm64.tar.gz']),
    'chrome-headless-shell-mac-arm64.zip': ('chrome-headless-shell', [f'{PWCDN}/builds/cft/{CFT}/mac-arm64/chrome-headless-shell-mac-arm64.zip']),
    'ffmpeg-mac-arm64.zip': ('ffmpeg', [f'{PWPRSS}/builds/ffmpeg/{FFR}/ffmpeg-mac-arm64.zip', f'{PWCDN}/builds/ffmpeg/{FFR}/ffmpeg-mac-arm64.zip']),
    f'pandoc-{PV}-arm64-macOS.zip': ('pandoc', [f'https://github.com/jgm/pandoc/releases/download/{PV}/pandoc-{PV}-arm64-macOS.zip']),
  },
  'windows-x86_64': {
    'python-env-win-64.zip': ('python-env', []),
    'node-tools-win-x64.zip': ('node-tools', []),
    f'node-v{NV}-win-x64.zip': ('node', [f'{NPM}/v{NV}/node-v{NV}-win-x64.zip', f'{NODEJS}/v{NV}/node-v{NV}-win-x64.zip']),
    'chrome-headless-shell-win64.zip': ('chrome-headless-shell', [f'{PWCDN}/builds/cft/{CFT}/win64/chrome-headless-shell-win64.zip']),
    'ffmpeg-win64.zip': ('ffmpeg', [f'{PWPRSS}/builds/ffmpeg/{FFR}/ffmpeg-win64.zip', f'{PWCDN}/builds/ffmpeg/{FFR}/ffmpeg-win64.zip']),
    f'pandoc-{PV}-windows-x86_64.zip': ('pandoc', [f'https://github.com/jgm/pandoc/releases/download/{PV}/pandoc-{PV}-windows-x86_64.zip']),
    'winldd-win64.zip': ('winldd', [f'{PWPRSS}/builds/winldd/{WLR}/winldd-win64.zip', f'{PWCDN}/builds/winldd/{WLR}/winldd-win64.zip']),
  },
}

def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

comps = {}
for plat, files in SPEC.items():
    for fname, (comp, urls) in files.items():
        p = os.path.join(lib, plat, fname)
        if not os.path.exists(p):
            continue  # 组件未备料则不进清单（下载端按需处理）
        if not urls:
            urls = [f'{gc_base}/{fname}', f'{gh_base}/{fname}']
        comps.setdefault(comp, {}).setdefault('targets', {})[plat] = {
            'file': fname, 'size': os.path.getsize(p), 'sha256': sha256(p), 'urls': urls,
        }

manifest = {
    'runtimeVersion': tag,
    'updatedAt': date.today().isoformat(),
    'components': comps,
}
out = os.path.join(work, 'runtime-manifest.json')
with open(out, 'w') as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
print('  组件数:', len(comps), '→', out)
for c, d in comps.items():
    for plat, t in d['targets'].items():
        print(f'  {c:22s} {plat:14s} {t["size"]/1048576:7.1f}M  {t["sha256"][:12]}…')
PYEOF

# ---- git 工作副本：clone（空仓库则初始化）→ 提交 manifest → push 双远端 ----
echo "==> 推送 manifest 到 OmniBuddy-Plugins（GitCode + GitHub）"
cd "$WORK"
git clone -q "https://x-access-token:${GH_TOKEN}@github.com/${GH_OWNER}/${GH_REPO}.git" repo 2>/dev/null || {
  echo "✗ clone github 仓库失败"; exit 1
}
cd repo
git checkout -q -B main 2>/dev/null || git checkout -q -b main

cat > README.md <<'MD'
# OmniBuddy-Plugins

OmniBuddy / OmniDeck 的**运行时组件分发仓库**（按需懒加载方案）。

- `runtime-manifest.json`：组件清单（版本 / sha256 / 多源下载 URL），应用首启或功能按需时读取
- Release 附件：私有组件包（`python-env-*` Python 解释器+预装数据栈、`node-tools-*` sharp/docx 等预装库）
- 公共组件（node / chrome-headless-shell / ffmpeg / pandoc）直接使用官方源与国内镜像，不入库

组件内软件版权归上游各自所有（node MIT、pandoc GPL-2.0+、Chromium/ffmpeg 见上游许可）。
MD
cp "$WORK/runtime-manifest.json" .
GIT_AUTHOR="$(git config user.name || echo 'OmniBuddy CI')"
GIT_MAIL="$(git config user.email || echo 'ci@omnibuddy.local')"
git add README.md runtime-manifest.json
git -c user.name="$GIT_AUTHOR" -c user.email="$GIT_MAIL" commit -qm "runtime manifest ${TAG}"
push_gh="https://x-access-token:${GH_TOKEN}@github.com/${GH_OWNER}/${GH_REPO}.git"
push_gc="https://${GC_USER}:${GC_TOKEN}@gitcode.com/${GC_OWNER}/${GC_REPO}.git"
# 资产清单仓库（机器生成线性历史）：普通 push 被拒（远端 init 过）时 force-with-lease 覆盖
git push -q "$push_gh" HEAD:main 2>/dev/null || { echo "  github 常规 push 被拒，force-with-lease 覆盖"; git push -q --force-with-lease "$push_gh" HEAD:main; }
git push -q "$push_gc" HEAD:main 2>/dev/null || { echo "  gitcode 常规 push 被拒，force-with-lease 覆盖"; git push -q --force-with-lease "$push_gc" HEAD:main; }
echo "✓ manifest 已推送（raw 地址）"
echo "  GitCode: https://raw.gitcode.com/${GC_OWNER}/${GC_REPO}/raw/main/runtime-manifest.json"
echo "  GitHub:  https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/main/runtime-manifest.json"

# ---- GitCode Release：创建 + 上传私有 zip ----
echo "==> [gitcode] release $TAG"
rel=$(curl -s --max-time 20 -H "Authorization: Bearer $GC_TOKEN" \
  "https://api.gitcode.com/api/v5/repos/$GC_OWNER/$GC_REPO/releases/tags/$TAG")
if ! echo "$rel" | grep -q '"tag_name"'; then
  echo "→ 创建 release ..."
  rel=$(curl -s --max-time 20 -H "Authorization: Bearer $GC_TOKEN" \
    -X POST "https://api.gitcode.com/api/v5/repos/$GC_OWNER/$GC_REPO/releases" \
    -H "Content-Type: application/json" \
    -d "{\"tag_name\":\"$TAG\",\"name\":\"OmniBuddy Runtime $TAG\",\"prerelease\":false,
         \"body\":\"运行时组件包：python-env（Python 3.12 + 数据栈）、node-tools（sharp/docx/pptxgenjs 等）。清单见 runtime-manifest.json。\"}")
  echo "$rel" | grep -q '"tag_name"' || { echo "  ✗ 创建 release 失败：$rel"; exit 1; }
fi

fail=0
for f in "${private_paths[@]}"; do
  echo "→ [gitcode] 上传 $(basename "$f") ..."
  local_resp=$(curl -s --max-time 30 -H "Authorization: Bearer $GC_TOKEN" \
    "https://api.gitcode.com/api/v5/repos/$GC_OWNER/$GC_REPO/releases/$TAG/upload_url?file_name=$(basename "$f")")
  echo "$local_resp" | python3 -c "import json,sys; json.load(sys.stdin)['url']" 2>/dev/null || {
    echo "  ✗ 获取上传地址失败：$local_resp"; fail=$((fail + 1)); continue
  }
  if python3 - "$local_resp" "$f" <<'PYEOF'; then :; else fail=$((fail + 1)); fi
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
done
[ "$fail" -eq 0 ] && echo "✓ [gitcode] 私有组件上传完成" || echo "✗ [gitcode] $fail 个文件失败"
gc_fail=$fail

# ---- GitHub Release：草稿创建 + 上传 + 发布 ----
echo "==> [github] release $TAG"
API="https://api.github.com"
auth=(-H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")
rel=$(curl -s --max-time 20 "${auth[@]}" "$API/repos/$GH_OWNER/$GH_REPO/releases/tags/$TAG")
REL_ID=$(echo "$rel" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -z "$REL_ID" ]; then
  echo "→ 创建草稿 release ..."
  rel=$(curl -s --max-time 20 "${auth[@]}" -X POST "$API/repos/$GH_OWNER/$GH_REPO/releases" \
    -d "{\"tag_name\":\"$TAG\",\"target_commitish\":\"main\",\"name\":\"OmniBuddy Runtime $TAG\",\"draft\":true,
         \"body\":\"Runtime components: python-env (Python 3.12 + data stack), node-tools (sharp/docx etc). See runtime-manifest.json.\"}")
  REL_ID=$(echo "$rel" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  [ -n "$REL_ID" ] || { echo "  ✗ 创建 release 失败：$rel"; exit 1; }
fi

fail=0
for f in "${private_paths[@]}"; do
  name=$(basename "$f")
  echo "→ [github] 上传 $name ..."
  code=$(curl -sS -o /tmp/gh-rt-resp.$$.json -w '%{http_code}' \
    --connect-timeout 30 --speed-time 60 --speed-limit 10240 --retry 2 --retry-delay 5 \
    "${auth[@]}" -H "Content-Type: application/octet-stream" \
    --data-binary "@$f" \
    "https://uploads.github.com/repos/$GH_OWNER/$GH_REPO/releases/$REL_ID/assets?name=$name")
  if [ "$code" = "201" ]; then
    echo "  上传响应: $code"
  else
    echo "  ✗ 上传失败（$code）：$(head -c 200 /tmp/gh-rt-resp.$$.json 2>/dev/null)"
    fail=$((fail + 1))
  fi
done
if [ "$fail" -eq 0 ]; then
  curl -s --max-time 20 -o /dev/null "${auth[@]}" -X PATCH "$API/repos/$GH_OWNER/$GH_REPO/releases/$REL_ID" -d '{"draft":false}'
  echo "✓ [github] 私有组件上传完成并已发布"
else
  echo "✗ [github] $fail 个文件失败（release 保持草稿态，可重跑续传）"
fi

echo ""
echo "==> 汇总：gitcode 失败 $gc_fail 个 / github 失败 $fail 个"
[ $((gc_fail + fail)) -eq 0 ] && echo "✓ 运行时组件发布完成" || { echo "✗ 部分失败，可重跑脚本续传（已上传的 GitCode 资产会重复，需手动删或忽略）"; exit 1; }
