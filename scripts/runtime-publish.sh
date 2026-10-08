#!/bin/bash
# OmniBuddy 运行时组件发布脚本：私有组件 zip → OmniBuddy-Plugins 仓库 Release
#
# 用法：
#   ./scripts/runtime-publish.sh [runtime-v1.1.0]   # tag 缺省 runtime-v1.1.0
#
# 流程（继承式 merge，适配 lib 已瘦身：本地无需备齐全部组件）：
#   1. clone OmniBuddy-Plugins（GitCode），读 repo 内旧 runtime-manifest.json 作继承基础
#   2. 逐组件比对：本地有且 sha256 变 → 更新条目 + 计入上传；本地有未变 / 本地无
#      → 继承旧条目（公共组件官方源 URL / 私有组件旧 tag Release 资产仍可下载）
#   3. 生成 runtime-manifest.json → 写 README + manifest → push GitCode
#   4. GitCode Release：创建 + 预签名 PUT 上传增量私有 zip
#
# 依赖：git 凭证存储中有 gitcode.com 的 token（git credential fill）
#   私有组件（app 内下载解压装配）：
#     python-env-*.zip（解释器 + 预装数据栈）  node-tools-*.zip（sharp/docx 等）
#     MinGit-*.zip（Windows git）  git-env-*.zip（mac/linux conda 便携 git）
#   公共组件不入仓库，manifest 直接给官方/镜像 URL（npmmirror / playwright cdn）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIB_ROOT="$ROOT/lib"
TAG="${1:-runtime-v1.1.0}"

# ---- 目标仓库（GitCode 单源）----
GC_OWNER="m0_59492087"; GC_REPO="OmniBuddy-Plugins"

# ---- 公共组件版本锚点（与 provision-runtime.sh 对齐；升级时联动）----
NODE_VERSION=22.23.1
PW_CFT_BUILD=154.0.8037.0
PW_FFMPEG_REV=1011
PW_WINLDD_REV=1007
PANDOC_VERSION=3.6.3
MINGIT_VERSION=2.55.0

# ---- 凭证 ----
GC_TOKEN=$(printf 'protocol=https\nhost=gitcode.com\n\n' | git credential fill 2>/dev/null | grep '^password=' | cut -d= -f2-)
GC_USER=$(printf 'protocol=https\nhost=gitcode.com\n\n' | git credential fill 2>/dev/null | grep '^username=' | cut -d= -f2-)
[ -n "$GC_TOKEN" ] || { echo "✗ 无法从 git 凭证获取 GitCode token"; exit 1; }

# ---- git 工作副本提前 clone（manifest 继承需要 repo 内旧清单）----
echo "==> clone OmniBuddy-Plugins（读取旧 manifest 作继承基础）"
WORK=$(mktemp -d /tmp/omnibuddy-plugins.XXXXXX)
cd "$WORK"
git clone -q "https://${GC_USER}:${GC_TOKEN}@gitcode.com/${GC_OWNER}/${GC_REPO}.git" repo 2>/dev/null || {
  echo "✗ clone GitCode 仓库失败"; exit 1
}
cd repo
git checkout -q -B main 2>/dev/null || git checkout -q -b main

echo "==> 生成 runtime-manifest.json（tag=${TAG}，继承式 merge）"
export LIB_ROOT RT_TAG="$TAG" RT_WORK="$WORK"
python3 <<'PYEOF'
import hashlib, json, os
from datetime import date

lib, tag, work = os.environ['LIB_ROOT'], os.environ['RT_TAG'], os.environ['RT_WORK']
gc_base = f'https://gitcode.com/m0_59492087/OmniBuddy-Plugins/releases/download/{tag}'

NV, CFT, FFR, WLR, PV, MGV = '22.23.1', '154.0.8037.0', '1011', '1007', '3.6.3', '2.55.0'
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
    # conda 便携 git（provision-runtime.sh do_git 生成存档；私有上传）
    'git-env-osx-arm64.zip': ('git', []),
  },
  'windows-x86_64': {
    'python-env-win-64.zip': ('python-env', []),
    'node-tools-win-x64.zip': ('node-tools', []),
    f'node-v{NV}-win-x64.zip': ('node', [f'{NPM}/v{NV}/node-v{NV}-win-x64.zip', f'{NODEJS}/v{NV}/node-v{NV}-win-x64.zip']),
    'chrome-headless-shell-win64.zip': ('chrome-headless-shell', [f'{PWCDN}/builds/cft/{CFT}/win64/chrome-headless-shell-win64.zip']),
    'ffmpeg-win64.zip': ('ffmpeg', [f'{PWPRSS}/builds/ffmpeg/{FFR}/ffmpeg-win64.zip', f'{PWCDN}/builds/ffmpeg/{FFR}/ffmpeg-win64.zip']),
    f'pandoc-{PV}-windows-x86_64.zip': ('pandoc', [f'https://github.com/jgm/pandoc/releases/download/{PV}/pandoc-{PV}-windows-x86_64.zip']),
    'winldd-win64.zip': ('winldd', [f'{PWPRSS}/builds/winldd/{WLR}/winldd-win64.zip', f'{PWCDN}/builds/winldd/{WLR}/winldd-win64.zip']),
    # git 组件（原 mingit 改名，Windows target 仍为 MinGit 官方包）
    f'MinGit-{MGV}-64-bit.zip': ('git', []),
  },
}

def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

# 继承基础：repo 内旧 manifest（lib 瘦身后本地无文件的组件靠它保留 sha256/size）
base = {}
try:
    with open(os.path.join(work, 'repo', 'runtime-manifest.json')) as f:
        base = (json.load(f) or {}).get('components', {})
except Exception:
    print('  （repo 无旧 manifest，全新生成）')

uploads = []  # 本次需上传的私有包（本地存在且 sha256 较旧清单有变化）
comps = {}
for plat, files in SPEC.items():
    for fname, (comp, urls) in files.items():
        p = os.path.join(lib, plat, fname)
        # 过渡期继承：git 组件在旧 manifest 中键名为 mingit（Windows MinGit 包
        # sha 一致则免重传，直接继承旧 Release 资产）
        old = base.get(comp, {}).get('targets', {}).get(plat)
        if not old and comp == 'git':
            old = base.get('mingit', {}).get('targets', {}).get(plat)
        if os.path.exists(p):
            digest = sha256(p)
            # 内容未变且旧条目 URL 不指向本次 tag → 继承（资产在旧 tag Release，可免传）；
            # URL 指向本次 tag 的（同 tag 重跑）无法确认资产已传，保守计入上传（幂等重传）
            if old and old.get('sha256') == digest and tag not in str(old.get('urls', [])):
                entry, state = old, 'unchanged'
            else:
                if not urls:
                    urls = [f'{gc_base}/{fname}']
                    uploads.append(p)
                entry = {'file': fname, 'size': os.path.getsize(p), 'sha256': digest, 'urls': urls}
                state = 'updated'
        elif old:
            entry, state = old, 'inherited'  # 本地无：继承（公共官方源 / 私有旧 tag 资产）
        else:
            continue  # 本地无且旧 manifest 无：未备料不进清单
        comps.setdefault(comp, {}).setdefault('targets', {})[plat] = entry
        print(f'  [{state:9s}] {comp:22s} {plat:14s} {entry["size"]/1048576:7.1f}M  {entry["sha256"][:12]}…')

manifest = {
    'runtimeVersion': tag,
    'updatedAt': date.today().isoformat(),
    'components': comps,
}
out = os.path.join(work, 'runtime-manifest.json')
with open(out, 'w') as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
with open(os.path.join(work, 'upload-list.txt'), 'w') as f:
    f.write('\n'.join(uploads))
print('  组件数:', len(comps), '/ 需上传增量:', len(uploads), '个私有包 →', out)
PYEOF

# 本次需上传的私有包（内容有变化的；全部继承则数组为空）
# 注：macOS 自带 bash 3.2 无 mapfile，用 while read；read 对无尾随换行的末行
# 返回非零，须以 || [ -n "$line" ] 兜底，否则唯一一行会被静默丢弃
private_paths=()
while IFS= read -r line || [ -n "$line" ]; do
  [ -n "$line" ] && private_paths+=("$line") || true
done < "$WORK/upload-list.txt"

cat > README.md <<'MD'
# OmniBuddy-Plugins

OmniBuddy / OmniDeck 的**运行时组件分发仓库**（按需懒加载方案，GitCode 单源）。

- `runtime-manifest.json`：组件清单（版本 / sha256 / 下载 URL），应用首启引导装配或功能按需时读取
- Release 附件：私有组件包（`python-env-*` Python 解释器+预装数据栈、`node-tools-*` sharp/docx 等预装库、`MinGit-*` Windows git、`git-env-*` mac/linux 便携 git）
- 公共组件（node / chrome-headless-shell / ffmpeg / pandoc / winldd）直接使用官方源与国内镜像，不入库

组件内软件版权归上游各自所有（node MIT、pandoc GPL-2.0+、Chromium/ffmpeg/Git 见上游许可）。
MD
cp "$WORK/runtime-manifest.json" .
GIT_AUTHOR="$(git config user.name || echo 'OmniBuddy CI')"
GIT_MAIL="$(git config user.email || echo 'ci@omnibuddy.local')"
git add README.md runtime-manifest.json
# 与远端内容一致（同日重跑）时 nothing to commit 是合法态，跳过提交继续上传
git -c user.name="$GIT_AUTHOR" -c user.email="$GIT_MAIL" commit -qm "runtime manifest ${TAG}" || echo "  （manifest 与远端一致，无新提交）"
push_gc="https://${GC_USER}:${GC_TOKEN}@gitcode.com/${GC_OWNER}/${GC_REPO}.git"
# 资产清单仓库（机器生成线性历史）：普通 push 被拒（远端 init 过）时 force-with-lease 覆盖
git push -q "$push_gc" HEAD:main 2>/dev/null || { echo "  gitcode 常规 push 被拒，force-with-lease 覆盖"; git push -q --force-with-lease "$push_gc" HEAD:main; }
echo "✓ manifest 已推送（raw 地址）"
echo "  GitCode: https://raw.gitcode.com/${GC_OWNER}/${GC_REPO}/raw/main/runtime-manifest.json"

# ---- GitCode Release：创建 + 上传增量私有 zip ----
if [ "${#private_paths[@]}" -eq 0 ]; then
  echo ""
  echo "==> 无私有包需上传（manifest 条目全部继承旧 Release 资产），发布完成"
  exit 0
fi
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

echo ""
[ "$fail" -eq 0 ] && echo "✓ 运行时组件发布完成" || { echo "✗ 部分失败，可重跑脚本续传（已上传的 GitCode 资产会重复，需手动删或忽略）"; exit 1; }
