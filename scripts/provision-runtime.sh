#!/usr/bin/env bash
# ============================================================
#  OmniDeck — 内置运行时装配脚本（参考 autonomous-agent bin/provision-runtime.sh 裁剪）
#
#  目标：装配 OmniDeck 自带运行时到 runtime/<plat>/（python/node/
#        playwright-browsers/pandoc/npx-cache + python/node 预装依赖库），
#        electron-builder afterPack 打进应用 Resources，安装后开箱
#        即用（无需宿主装任何环境）。
#
#  命令模型（与参考项目同构，三命令）：
#    fetch <plat>    备料——按清单下载装配包至 lib/<plat>/（幂等）
#    install <plat>  全量装配——python + node + node-tools + playwright
#                    + npx-cache 依次落位至 runtime/<plat>/（覆盖式幂等，
#                    须目标平台本机执行）
#    verify [plat]   核对——布局/可执行/版本/预装依赖冒烟
#
#  预装依赖（沙箱增强集，清单自 autonomous-agent 适配拷入 scripts/）：
#    - python：requirements-sandbox.txt（numpy/pandas/matplotlib/
#      openpyxl/python-docx/python-pptx/pdfplumber/pillow/requests/
#      beautifulsoup4/lxml/markitdown 等办公与数据栈）。lib 的
#      python-env zip 命中即离线解压；缺档在线 pip 装后打包回存 lib
#      （此后零网络复用）
#    - node：node-sandbox-tools.txt（sharp/docx/pptxgenjs/pdf-lib/
#      pdfjs-dist/marked）。lib 的 node-tools zip 命中即离线解压至
#      node/lib/node_modules（运行时经 NODE_PATH 注入）；缺档 npm -g
#      装后回存
#
#  plat: darwin-arm64 | darwin-x86_64 | linux-x86_64 | linux-aarch64 |
#        windows-x86_64（解压型组件支持跨平台备料落位：node/python-env/
#        node-tools/playwright/npx-cache 均为 zip 解压即用，可在 mac/linux
#        上为 Windows 落位；执行类冒烟在非 Windows 宿主自动跳过）
#        省略 = 当前平台
#
#  用法:
#    bash scripts/provision-runtime.sh install          # 当前平台全量装配
#    bash scripts/provision-runtime.sh install windows-x86_64   # 为 Windows 落位
#    bash scripts/provision-runtime.sh verify           # 核对
# ============================================================
set -euo pipefail

INSTALL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_ROOT="$INSTALL_ROOT/runtime"
LIB_ROOT="$INSTALL_ROOT/lib"

# ---- 预装依赖清单（与 autonomous-agent 同源拷贝，升级时联动）----
SANDBOX_REQ="$INSTALL_ROOT/scripts/requirements-sandbox.txt"
NODE_TOOLS_TXT="$INSTALL_ROOT/scripts/node-sandbox-tools.txt"

# ---- 版本锚点（与 autonomous-agent bin/provision-runtime.sh 对齐；升级时联动）----
NODE_VERSION=22.23.1
PYTHON_VERSION=3.12.4
PLAYWRIGHT_MCP_VERSION=0.0.81
# playwright CLI 与 @playwright/mcp 的依赖对齐（0.0.81 → 1.64.0-alpha），
# 浏览器版本/协议随 CLI 走，错版会导致 MCP 起不来
PW_CHROMIUM_REV=1244
PW_FFMPEG_REV=1011
# playwright Windows 落地依赖 winldd（浏览器进程树清理助手）
PW_WINLDD_REV=1007
PW_CFT_BUILD=154.0.8037.0
# pandoc 文档转换引擎（doc_export 工具 / pi-markdown-preview 依赖）
PANDOC_VERSION=3.6.3

# ---- 平台目录名 ----
current_platform() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) arch=x86_64 ;;
    aarch64|arm64) [ "$os" = darwin ] && arch=arm64 || arch=aarch64 ;;
  esac
  echo "${os}-${arch}"
}

PLATFORMS="darwin-arm64 darwin-x86_64 linux-x86_64 linux-aarch64 windows-x86_64"

check_platform() {
  local plat="$1"
  case " $PLATFORMS " in
    *" $plat "*) ;;
    *) echo "错误: 未知平台 '${plat}'（可选: ${PLATFORMS}）" >&2; exit 1 ;;
  esac
}

wipe_dir() {
  # 残留树可能含无 x 位目录（Windows zip 解出的树，POSIX 下无法遍历），
  # 先整体补 u+rwX 再删除，否则 rm 会报 Permission denied / Directory not empty
  chmod -R u+rwX "${1:?}" 2>/dev/null || true
  rm -rf "${1:?}"
  mkdir -p "$1"
}

# 解压后规范化权限：Windows 打包的 zip 不带 Unix 外部属性，unzip 落出的目录
# 常缺 x 位（POSIX 侧无法遍历/删除/拷贝），统一补 u+rwX（幂等；Windows 忽略）
fix_perms() {
  chmod -R u+rwX "$1" 2>/dev/null || true
}

# unzip 容忍警告级退出码 1（Windows 打包的 zip 常报 backslash 分隔符警告，
# 不致命；≥2 的真失败仍原样中止）——脚本 set -e 下裸 unzip 会被警告击穿
safe_unzip() {
  local rc=0
  unzip -q -o "$@" || rc=$?
  [ "$rc" -le 1 ]
}

# ---- 资产平台段（口径与参考项目一致）----
plat_asset_node() {
  case "$1" in
    linux-x86_64)  echo linux-x64 ;;
    linux-aarch64) echo linux-arm64 ;;
    darwin-arm64)  echo darwin-arm64 ;;
    darwin-x86_64) echo darwin-x64 ;;
    windows-x86_64) echo win-x64 ;;
  esac
}
plat_asset_mm() {
  case "$1" in
    linux-x86_64)  echo linux-64 ;;
    linux-aarch64) echo linux-aarch64 ;;
    darwin-arm64)  echo osx-arm64 ;;
    darwin-x86_64) echo osx-64 ;;
    windows-x86_64) echo win-64 ;;
  esac
}
plat_asset_pw() {
  case "$1" in
    linux-x86_64)  echo linux64 ;;
    linux-aarch64) echo linux-arm64 ;;
    darwin-arm64)  echo mac-arm64 ;;
    darwin-x86_64) echo mac ;;
    windows-x86_64) echo win64 ;;
  esac
}
plat_asset_ffmpeg() {
  case "$1" in
    linux-x86_64)  echo linux ;;
    linux-aarch64) echo linux-arm64 ;;
    darwin-arm64)  echo mac-arm64 ;;
    darwin-x86_64) echo mac ;;
    windows-x86_64) echo win64 ;;
  esac
}
# pandoc 官方 release 资产段（GitHub jgm/pandoc）：
# mac 为 zip、linux 为 tar.gz、windows 为 zip
plat_asset_pandoc() {
  case "$1" in
    linux-x86_64)  echo linux-amd64 ;;
    linux-aarch64) echo linux-arm64 ;;
    darwin-arm64)  echo arm64-macOS ;;
    darwin-x86_64) echo x86_64-macOS ;;
    windows-x86_64) echo windows-x86_64 ;;
  esac
}
# pandoc 装配包文件名（linux 为 tar.gz，其余 zip）
pandoc_pkg_file() {  # <plat>
  local asset
  asset="$(plat_asset_pandoc "$1")"
  case "$1" in
    linux-*) echo "pandoc-$PANDOC_VERSION-$asset.tar.gz" ;;
    *)       echo "pandoc-$PANDOC_VERSION-$asset.zip" ;;
  esac
}

# ---- 装配包清单（官方源优先、国内镜像回退）----
package_list() {  # <plat> → "file<TAB>url1 url2 ..." 行
  local plat="$1"
  local node_asset mm_subdir pw_asset ff_asset
  node_asset="$(plat_asset_node "$plat")"
  mm_subdir="$(plat_asset_mm "$plat")"
  pw_asset="$(plat_asset_pw "$plat")"
  ff_asset="$(plat_asset_ffmpeg "$plat")"
  # Windows：node 官方 zip + winldd（playwright Windows 落地依赖）
  if [ "$plat" = windows-x86_64 ]; then
    printf '%s\t%s %s\n' \
      "node-v$NODE_VERSION-$node_asset.zip" \
      "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-$node_asset.zip" \
      "https://registry.npmmirror.com/-/binary/node/v$NODE_VERSION/node-v$NODE_VERSION-$node_asset.zip"
    printf '%s\t%s %s\n' \
      "winldd-win64.zip" \
      "https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/winldd/$PW_WINLDD_REV/winldd-win64.zip" \
      "https://cdn.playwright.dev/dbazure/download/playwright/builds/winldd/$PW_WINLDD_REV/winldd-win64.zip"
  else
    printf '%s\t%s %s\n' \
      "node-v$NODE_VERSION-$node_asset.tar.gz" \
      "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-$node_asset.tar.gz" \
      "https://registry.npmmirror.com/-/binary/node/v$NODE_VERSION/node-v$NODE_VERSION-$node_asset.tar.gz"
  fi
  printf '%s\t%s\n' \
    "micromamba-$mm_subdir.tar.bz2" \
    "https://micro.mamba.pm/api/micromamba/$mm_subdir/latest"
  printf '%s\t%s\n' \
    "chrome-headless-shell-$pw_asset.zip" \
    "https://cdn.playwright.dev/builds/cft/$PW_CFT_BUILD/$pw_asset/chrome-headless-shell-$pw_asset.zip"
  printf '%s\t%s %s\n' \
    "ffmpeg-$ff_asset.zip" \
    "https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/ffmpeg/$PW_FFMPEG_REV/ffmpeg-$ff_asset.zip" \
    "https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/$PW_FFMPEG_REV/ffmpeg-$ff_asset.zip"
  printf '%s\t%s\n' \
    "$(pandoc_pkg_file "$plat")" \
    "https://github.com/jgm/pandoc/releases/download/$PANDOC_VERSION/$(pandoc_pkg_file "$plat")"
}

download_file() {  # <dest> <url...>
  local dest="$1"; shift
  local u
  for u in "$@"; do
    echo "    $u"
    if curl -fL --connect-timeout 20 --retry 2 "$u" -o "$dest"; then
      return 0
    fi
    echo "    下载失败，尝试下一源..." >&2
  done
  echo "错误: 全部下载源失败" >&2
  rm -f "$dest"
  return 1
}

require_lib_pkg() {  # <plat> <file>
  local cache="$LIB_ROOT/$1/$2"
  if [ ! -f "$cache" ]; then
    echo "错误: lib 缓存缺包 $cache" >&2
    echo "      先备料: $0 fetch $1（或从 autonomous-agent/lib/<plat> 整目录拷入）" >&2
    exit 1
  fi
  echo "$cache"
}

# ============================================================
#  fetch：装配包下载至 lib/<plat>/（幂等，已存在跳过）
# ============================================================
do_fetch() {
  local plat="$1"
  check_platform "$plat"
  local plat_lib="$LIB_ROOT/$plat"
  mkdir -p "$plat_lib"
  local line file urls
  while IFS=$'\t' read -r file urls; do
    if [ -f "$plat_lib/$file" ]; then
      echo "==> 已存档: $file"
      continue
    fi
    echo "==> 下载 $file"
    # shellcheck disable=SC2086
    download_file "$plat_lib/$file" $urls
  done < <(package_list "$plat")
  echo "==> fetch 完成: $plat_lib"
}

# magika 轻量 stub 写入（markitdown 依赖治理；<site-packages_dir>）
write_magika_stub() {
  local sp="$1"
  [ -f "$sp/magika/__init__.py" ] && return 0
  [ -d "$sp/markitdown" ] || return 0
  mkdir -p "$sp/magika"
  cat > "$sp/magika/__init__.py" <<'MAGIKA_STUB'
"""magika 轻量 stub（provision 瘦身：onnxruntime ~128MB 剔除）。

markitdown 顶部硬 import magika 且 identify_stream 调用无 except
兜底（仅 finally 复位流位置），故本 stub 保持接口形状：identify_*
一律返回 status="disabled"（!= "ok"），markitdown 据此走 mimetypes
base guess 降级路径；文件转换按扩展名选 converter 不受影响。
恢复完整嗅探：pip install magika onnxruntime 后删除本目录。
"""


class _Output:
    label = "unknown"
    mime_type = None
    is_text = False
    extensions: list = []


class _Prediction:
    output = _Output()


class _Result:
    status = "disabled"
    prediction = _Prediction()
    dt = None
    error = None


class Magika:
    def __init__(self, *args, **kwargs) -> None:
        pass

    def identify_stream(self, stream) -> _Result:
        return _Result()

    def identify_path(self, path) -> _Result:
        return _Result()

    def identify_bytes(self, data) -> _Result:
        return _Result()
MAGIKA_STUB
  echo "    写入 magika 轻量 stub"
}

# magika→onnxruntime 卸载（~128MB 深度学习文件嗅探栈；<python_bin> <site-packages_dir>）
uninstall_magika_stack() {
  local py_bin="$1" sp="$2"
  [ -d "$sp/onnxruntime" ] || return 0
  "$py_bin" -m pip uninstall -y -q magika onnxruntime >/dev/null 2>&1 || true
  echo "    卸载 magika + onnxruntime（~128MB，stub 降级文件嗅探）"
}

# ============================================================
#  瘦身（幂等；桌面制品体积治理，与参考项目同思路）
# ============================================================
_prune_python() {  # <python_dir>
  local dir="$1"
  local bin="$dir/bin" lib="$dir/lib"
  # Windows 布局（conda win env：根级 python.exe + Lib\ + Scripts\，
  # 无 POSIX 的 python3.1 双份别名树；tcl\ 为 tkinter 运行库）
  if [ -f "$dir/python.exe" ] && [ -d "$dir/Lib" ]; then
    local wsp="$dir/Lib/site-packages"
    rm -rf "$dir/Lib/test" "$dir/Lib/idlelib" "$dir/tcl" "$dir/pkgs" \
           "$dir/Lib/lib2to3" 2>/dev/null || true
    uninstall_magika_stack "$dir/python.exe" "$wsp"
    rm -f "$dir/Scripts/magika.exe" 2>/dev/null || true
    write_magika_stub "$wsp"
    find "$dir" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
    return
  fi
  [ -d "$lib" ] || return 0
  local std
  std="$(ls -d "$lib"/python3.* 2>/dev/null | head -1 || true)"
  [ -n "$std" ] || return 0
  # 1) conda 双份别名树残留（python3.1* 时代目录名）
  for d in "$lib"/python3.1; do
    [ -d "$d" ] && [ "$d" != "$std" ] && rm -rf "$d"
  done 2>/dev/null || true
  # 2) 解释器多实体副本 → 保留版本实体，其余转相对 symlink
  local ver entity
  ver="$(basename "$std")"
  for entity in python python3; do
    if [ -e "$bin/$entity" ] && [ ! -L "$bin/$entity" ] && [ -f "$bin/$ver" ]; then
      rm -f "$bin/$entity" && ln -s "$ver" "$bin/$entity"
    fi
  done
  # 3) stdlib 非运行件：test 套件 / IDLE / tkinter 等（matplotlib 沙箱场景仅 Agg 后端）
  rm -rf "$std/test" "$std/idlelib" "$std/lib2to3" "$std/tkinter" \
         "$std/turtledemo" "$std/turtle.py" "$dir/share/man" \
         "$dir/pkgs" 2>/dev/null || true
  rm -f "$std"/lib-dynload/_tkinter*.so 2>/dev/null || true
  # 4) markitdown→magika→onnxruntime 传递依赖治理：卸载深度学习文件嗅探栈
  #    （~128MB），替换为轻量 stub——markitdown 顶部硬 import magika 且
  #    identify_stream 无 except 兜底，stub 保持接口形状：identify_* 一律
  #    返回 status="disabled"（!= "ok"），markitdown 据此走 mimetypes 降级；
  #    转换按扩展名选 converter 不受影响
  uninstall_magika_stack "$bin/python3" "$std/site-packages"
  rm -f "$bin/magika" 2>/dev/null || true
  write_magika_stub "$std/site-packages"
  # 5) __pycache__ 全清（运行时自动重建）
  find "$dir" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
}

_prune_node() {  # <node_dir>
  local dir="$1"
  [ -d "$dir" ] || return 0
  # Windows 布局（官方 zip：根级 node.exe + node_modules\）
  if [ -f "$dir/node.exe" ]; then
    rm -rf "$dir/include" "$dir/node_modules/corepack" \
           "$dir/node_modules/npm/docs" "$dir/node_modules/npm/man" \
           "$dir/node_modules/npm/html" 2>/dev/null || true
    rm -f "$dir/corepack.cmd" "$dir/corepack" 2>/dev/null || true
    return
  fi
  rm -rf "$dir/include" "$dir/lib/node_modules/corepack" \
         "$dir/lib/node_modules/npm/docs" "$dir/lib/node_modules/npm/man" \
         "$dir/lib/node_modules/npm/html" 2>/dev/null || true
  rm -f "$dir/bin/corepack"
}

_prune_npx_cache() {  # <cache_dir>
  local cache="$1"
  [ -d "$cache" ] || return 0
  rm -rf "$cache/_cacache" "$cache/_logs" 2>/dev/null || true
  local h kept=0
  for h in "$cache"/_npx/*/; do
    [ -d "$h" ] || continue
    if [ -d "$h/node_modules/@playwright/mcp" ]; then
      kept=$((kept+1))
    else
      rm -rf "$h"
    fi
  done
  echo "    npx-cache: 保留 ${kept} 个 @playwright/mcp 档"
}

# ============================================================
#  组件装配（install 依序调用；只消费 lib/<plat>/）
# ============================================================

# ---- python：lib 的 python-env zip 命中即离线解压（含预装依赖）；
#      缺档时 micromamba create 干净环境 + pip 装 requirements-sandbox.txt
#      后打包回存 lib（此后零网络复用）。
#      create 直建于最终路径，规避前缀重定位（与参考项目同构）----
do_python() {
  local plat="$1"
  check_platform "$plat"
  local dir="$RUNTIME_ROOT/$plat/python"
  local env_zip="$LIB_ROOT/$plat/python-env-$(plat_asset_mm "$plat").zip"
  # ---- Windows：仅离线档，解压型可跨宿主落位 ----
  # zip 根 = env 内容直出（python.exe 在 $dir 根，参考项目 ps1 打包约定）；
  # 可搬迁——CPython prefix 按 exe 位置运行时解析（参考项目真机实证：
  # conda/pip 编译期前缀仅残留 Scripts\*.exe shim，产品侧一律
  # python.exe / python -m 不触碰 shim）；VC 运行库随 env 携带免装
  if [ "$plat" = windows-x86_64 ]; then
    wipe_dir "$dir"
    if [ ! -f "$env_zip" ]; then
      echo "错误: lib 缺 $(basename "$env_zip")（Windows python 仅支持离线档；从 autonomous-agent/lib/windows-x86_64 拷入，或在 Windows 本机用其 provision-runtime.ps1 生成）" >&2
      exit 1
    fi
    echo "==> lib 缓存命中: $(basename "$env_zip")，解压至 ${dir}（离线档，可搬迁 env）"
    safe_unzip "$env_zip" -d "$dir"
    fix_perms "$dir"
    echo "==> python 瘦身（幂等；老档若为未剪胖档在此剪除）"
    _prune_python "$dir"
    [ -f "$dir/python.exe" ] || { echo "错误: 未找到 python.exe（zip 布局异常）" >&2; exit 1; }
    if [ "$(uname -s)" = Darwin ]; then
      xattr -rd com.apple.quarantine "$dir" 2>/dev/null || true
    fi
    echo "==> 完成: ${dir}（Windows 布局）"
    return
  fi
  local this_plat
  this_plat="$(current_platform)"
  [ "$plat" = "$this_plat" ] || {
    echo "错误: python 组件必须在目标平台本机执行（当前 ${this_plat}，目标 ${plat}）" >&2
    exit 1
  }
  wipe_dir "$dir"
  # ---- 离线档优先：整环境（含预装依赖）解压即用 ----
  # zip 打包自 runtime/<plat>/（根部含顶层 python/ 目录，见下方回存代码）
  # —— 解压目标为父目录，python/ 落位即 $dir
  if [ -f "$env_zip" ]; then
    echo "==> lib 缓存命中: $(basename "$env_zip")，解压至 ${dir}（离线档，含预装依赖）"
    safe_unzip "$env_zip" -d "$RUNTIME_ROOT/$plat"
    fix_perms "$dir"
    echo "==> python 瘦身（幂等；老档若为未剪胖档在此剪除）"
    _prune_python "$dir"
    "$dir/bin/python3" --version
    if [ "$(uname -s)" = Darwin ]; then
      xattr -rd com.apple.quarantine "$dir" 2>/dev/null || true
    fi
    echo "==> 完成: ${dir}（离线档）"
    return
  fi
  # ---- 在线路径：micromamba create + pip 沙箱增强集 → 回存 zip ----
  echo "==> lib 缺 python-env 存档，在线生成（micromamba + pip）"
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  local mm_subdir mm_tbz2 mm
  mm_subdir="$(plat_asset_mm "$plat")"
  mm_tbz2="$(require_lib_pkg "$plat" "micromamba-$mm_subdir.tar.bz2")"
  echo "==> micromamba ← lib 解压（单文件 conda，免安装）"
  mkdir -p "$tmp/mm"
  tar -xjf "$mm_tbz2" -C "$tmp/mm"
  mm="$tmp/mm/bin/micromamba"
  [ -x "$mm" ] || { echo "错误: 未找到 micromamba（解压布局异常）" >&2; exit 1; }
  # root/HOME 全重定向 tmp：不污染宿主用户目录
  export MAMBA_ROOT_PREFIX="$tmp/mamba-root"
  export HOME="$tmp/home"
  mkdir -p "$MAMBA_ROOT_PREFIX" "$HOME"
  # channel_alias 走 TUNA 镜像（named channel 使包缓存走短路径）
  printf 'channel_alias: https://mirrors.tuna.tsinghua.edu.cn/anaconda\n' > "$tmp/rc.yaml"
  export MAMBA_RC_FILE="$tmp/rc.yaml"
  echo "==> micromamba create -p $dir python=${PYTHON_VERSION}（TUNA 镜像）"
  "$mm" create -y -q -p "$dir" -c main --override-channels \
    "python=$PYTHON_VERSION" >/dev/null
  "$dir/bin/python3" --version
  # 沙箱增强依赖集（办公自动化/数据分析/文档处理）——存在才装，
  # 与后端无耦合（OmniDeck 无 Python 后端，仅用户代码预装栈）
  if [ -f "$SANDBOX_REQ" ]; then
    echo "==> pip 安装沙箱增强集（requirements-sandbox.txt，TUNA 镜像）"
    "$dir/bin/python3" -m pip install --no-cache-dir --quiet \
      -i https://pypi.tuna.tsinghua.edu.cn/simple \
      -r "$SANDBOX_REQ"
  fi
  echo "==> python 瘦身（含 magika→onnxruntime 依赖治理，回存前剪除）"
  _prune_python "$dir"
  # 装配产物打包存档回 lib（幂等复用：命中即免在线装配）
  echo "==> 打包存档至 lib: $(basename "$env_zip")"
  mkdir -p "$LIB_ROOT/$plat"
  ( cd "$RUNTIME_ROOT/$plat" && zip -qr "$env_zip" python )
  rm -rf "$tmp"
  trap - EXIT
  # 清除 quarantine（下载解压链路可能带隔离属性，防 Gatekeeper 弹窗）
  if [ "$(uname -s)" = Darwin ]; then
    xattr -rd com.apple.quarantine "$dir" 2>/dev/null || true
  fi
  echo "==> 完成: $dir"
}

# ---- node：lib 的官方包解压（POSIX tarball / Windows zip 根含
#      node-vX-win-x64/ 剥一层；解压型均可跨宿主落位）----
do_node() {
  local plat="$1"
  check_platform "$plat"
  local dir="$RUNTIME_ROOT/$plat/node"
  wipe_dir "$dir"
  local asset
  asset="$(plat_asset_node "$plat")"
  echo "==> Node.js v$NODE_VERSION ($asset) ← lib 解压"
  if [ "$plat" = windows-x86_64 ]; then
    local zip t
    zip="$(require_lib_pkg "$plat" "node-v$NODE_VERSION-$asset.zip")"
    t="$(mktemp -d)"
    safe_unzip "$zip" -d "$t"
    fix_perms "$t"
    mv "$t"/node-v*/* "$dir"
    rm -rf "$t"
    fix_perms "$dir"
    [ -f "$dir/node.exe" ] || { echo "错误: 未找到 node.exe（zip 布局异常）" >&2; exit 1; }
  else
    local tarball
    tarball="$(require_lib_pkg "$plat" "node-v$NODE_VERSION-$asset.tar.gz")"
    tar -xzf "$tarball" --strip-components=1 --no-same-owner -C "$dir"
    "$dir/bin/node" --version
  fi
  echo "==> node 瘦身"
  _prune_node "$dir"
  echo "==> 完成: $dir"
}

# ---- node 预装库：lib 的 node-tools zip 命中即离线解压（POSIX 落位
#      node/lib/node_modules、Windows 落位 node\node_modules 根级，运行时
#      经 NODE_PATH 注入）；缺档 npm -g 在线装后回存（含 sharp 等平台
#      二进制，在线路径须目标平台本机；离线解压可跨宿主）----
do_node_tools() {
  local plat="$1"
  check_platform "$plat"
  local node_dir="$RUNTIME_ROOT/$plat/node"
  local win=0
  [ "$plat" = windows-x86_64 ] && win=1
  if [ "$win" = 1 ]; then
    [ -f "$node_dir/node.exe" ] || {
      echo "错误: 未找到内置 node（${node_dir}），先装配 node 组件" >&2; exit 1
    }
  else
    [ -x "$node_dir/bin/node" ] || {
      echo "错误: 未找到内置 node（${node_dir}），先装配 node 组件" >&2; exit 1
    }
  fi
  [ -f "$NODE_TOOLS_TXT" ] || {
    echo "错误: 未找到清单 $NODE_TOOLS_TXT" >&2; exit 1
  }
  local zip_path="$LIB_ROOT/$plat/node-tools-$(plat_asset_node "$plat").zip"
  if [ -f "$zip_path" ]; then
    echo "==> lib 缓存命中: $(basename "$zip_path")，离线解压至 $node_dir"
    safe_unzip "$zip_path" -d "$node_dir"
    fix_perms "$node_dir"
  else
    # npm -g 装 sharp 等平台二进制，必须目标平台本机执行
    local this_plat
    this_plat="$(current_platform)"
    [ "$plat" = "$this_plat" ] || {
      echo "错误: lib 缺 $(basename "$zip_path")，且在线安装须在目标平台本机执行（当前 ${this_plat}，目标 ${plat}）" >&2
      exit 1
    }
    local pkgs
    # npm -g 不接受 "name>=ver" 形态（EINVALIDTAGNAME），转 "name@^ver"
    # （caret 语义 = >=ver 且同主版本，与清单最低版本意图一致）
    pkgs="$(grep -vE '^\s*#|^\s*$' "$NODE_TOOLS_TXT" | sed -e 's/#.*//' \
            -e 's/>=/@^/' | xargs)"
    [ -n "$pkgs" ] || { echo "错误: 清单为空: $NODE_TOOLS_TXT" >&2; exit 1; }
    echo "==> npm -g 安装沙箱增强工具链: $pkgs"
    PATH="$node_dir/bin:$PATH" \
      npm_config_cache="$RUNTIME_ROOT/$plat/npx-cache" \
      "$node_dir/bin/npm" install -g --no-fund --no-audit \
        --registry=https://registry.npmmirror.com $pkgs
    # 装配产物存档回 lib（node_modules 子树 + bin 包入口；排除 node 自有
    # bin——npm/npx/corepack 由官方 tarball 落位、node 二进制徒增体积）
    echo "==> 打包存档至 lib: $(basename "$zip_path")"
    mkdir -p "$LIB_ROOT/$plat"
    ( cd "$node_dir" && zip -qr "$zip_path" lib/node_modules bin \
        -x "bin/node" "bin/npm" "bin/npx" "bin/corepack" )
  fi
  # POSIX：npm -g 安装时会把 node 自有的 bin/npm|npx 刷新为 npm 内部 stub
  # 的实体拷贝（stub 内 require('../lib/cli.js') 相对 node/bin/ 不可解析），
  # zip 回存如实带入坏形态——统一恢复官方 tarball 的规范符号链接（幂等）；
  # Windows zip 自带 cmd shim 无需处理
  if [ "$win" = 0 ]; then
    ln -sf ../lib/node_modules/npm/bin/npm-cli.js  "$node_dir/bin/npm"
    ln -sf ../lib/node_modules/npm/bin/npx-cli.js  "$node_dir/bin/npx"
    ln -sf ../lib/node_modules/corepack/dist/corepack.js "$node_dir/bin/corepack" 2>/dev/null || true
  fi
  # 关键库 require 冒烟（防"目录在而包坏"；npm -g 装于全局 node_modules，
  # require 不搜全局路径——须 NODE_PATH 注入，与产品侧工具执行链同构；
  # 跨平台备料时跳过执行，交由目标平台首次运行验证）
  local node_exe node_modules_dir
  if [ "$win" = 1 ]; then
    node_exe="$node_dir/node.exe"
    node_modules_dir="$node_dir/node_modules"
  else
    node_exe="$node_dir/bin/node"
    node_modules_dir="$node_dir/lib/node_modules"
  fi
  if [ "$(current_platform)" = "$plat" ]; then
    NODE_PATH="$node_modules_dir" PATH="$node_dir/bin:$PATH" \
      "$node_exe" \
      -e "require('sharp'); require('docx'); console.log('node-tools 冒烟通过')" \
      || { echo "错误: node-tools 冒烟失败（sharp/docx 不可 require）" >&2; exit 1; }
  else
    echo "    跳过 require 冒烟（跨平台备料，未本机执行）"
  fi
  echo "==> 完成: ${node_dir}（预装库经 NODE_PATH 注入）"
}

# ---- playwright 浏览器：lib 两 zip 解压（须目标平台本机执行）----
# 布局 = zip 内容原样解进 <版本目录>/；解压完成立即写 INSTALLATION_COMPLETE
# marker（缺 marker 会被 npx playwright install 判定损坏而清空重建）
do_playwright() {
  local plat="$1"
  check_platform "$plat"
  local pw_asset ff_asset dir
  pw_asset="$(plat_asset_pw "$plat")"
  ff_asset="$(plat_asset_ffmpeg "$plat")"
  dir="$RUNTIME_ROOT/$plat/playwright-browsers"
  # Windows：三 zip（chrome-headless-shell/ffmpeg/winldd），解压型可跨宿主
  if [ "$plat" = windows-x86_64 ]; then
    wipe_dir "$dir"
    echo "==> lib 三 zip 解压至 ${dir}（离线装配，含 winldd）"
    local pair zip dest
    for pair in "chromium_headless_shell-$PW_CHROMIUM_REV:chrome-headless-shell-$pw_asset.zip" \
                "ffmpeg-$PW_FFMPEG_REV:ffmpeg-$ff_asset.zip" \
                "winldd-$PW_WINLDD_REV:winldd-win64.zip"; do
      dest="$dir/${pair%%:*}"
      zip="$(require_lib_pkg "$plat" "${pair##*:}")"
      mkdir -p "$dest"
      safe_unzip "$zip" -d "$dest"
      fix_perms "$dest"
      touch "$dest/INSTALLATION_COMPLETE"
    done
    [ -f "$dir/chromium_headless_shell-$PW_CHROMIUM_REV/chrome-headless-shell-$pw_asset/chrome-headless-shell.exe" ] \
      || { echo "错误: chrome-headless-shell.exe 缺失（zip 布局异常）" >&2; exit 1; }
    echo "==> 完成: $dir"
    return
  fi
  local this_plat
  this_plat="$(current_platform)"
  [ "$plat" = "$this_plat" ] || {
    echo "错误: playwright 组件必须在目标平台本机执行（浏览器为平台二进制）" >&2; exit 1
  }
  wipe_dir "$dir"
  echo "==> lib 两 zip 解压至 ${dir}（离线装配）"
  local pair zip dest
  for pair in "chromium_headless_shell-$PW_CHROMIUM_REV:chrome-headless-shell-$pw_asset.zip" \
              "ffmpeg-$PW_FFMPEG_REV:ffmpeg-$ff_asset.zip"; do
    dest="$dir/${pair%%:*}"
    zip="$(require_lib_pkg "$plat" "${pair##*:}")"
    mkdir -p "$dest"
    safe_unzip "$zip" -d "$dest"
    touch "$dest/INSTALLATION_COMPLETE"
  done
  local shell_bin="$dir/chromium_headless_shell-$PW_CHROMIUM_REV/chrome-headless-shell-$pw_asset/chrome-headless-shell"
  [ -x "$shell_bin" ] || { echo "错误: 未找到 ${shell_bin}（zip 布局异常）" >&2; exit 1; }
  "$shell_bin" --version
  if [ "$(uname -s)" = Darwin ]; then
    xattr -rd com.apple.quarantine "$dir" 2>/dev/null || true
  fi
  echo "==> 完成: $dir"
}

# ---- pandoc：文档转换引擎（doc_export 工具 / pi-markdown-preview 依赖）----
# 官方包布局 pandoc-<ver>-<asset>/bin/pandoc(.exe)（pandoc 为静态单文件），
# 统一落位 runtime/<plat>/pandoc/bin/，运行时由 runtime.js 定位 + PATH 注入；
# 解压型资产可跨宿主备料，版本冒烟仅本机平台执行
do_pandoc() {
  local plat="$1"
  check_platform "$plat"
  local dir pkg tmp found dest_bin
  dir="$RUNTIME_ROOT/$plat/pandoc"
  pkg="$(require_lib_pkg "$plat" "$(pandoc_pkg_file "$plat")")"
  wipe_dir "$dir"
  echo "==> lib pandoc 解压至 ${dir}"
  tmp="$(mktemp -d)"
  case "$pkg" in
    *.tar.gz) tar -xzf "$pkg" -C "$tmp" ;;
    *)        safe_unzip "$pkg" -d "$tmp" ;;
  esac
  fix_perms "$tmp"
  found="$(find "$tmp" -type f \( -name pandoc -o -name pandoc.exe \) | head -1)"
  if [ -z "$found" ]; then
    echo "错误: 未找到 pandoc 二进制（包布局异常）" >&2
    rm -rf "$tmp"
    exit 1
  fi
  mkdir -p "$dir/bin"
  dest_bin="$dir/bin/$(basename "$found")"
  cp "$found" "$dest_bin"
  chmod +x "$dest_bin"
  rm -rf "$tmp"
  if [ "$(current_platform)" = "$plat" ]; then
    "$dest_bin" --version | head -1
  fi
  echo "==> 完成: $dir"
}

# ---- npx 缓存预热：@playwright/mcp 进 <plat>/npx-cache（平台无关，
#      按 plat 目录就近放置便于整目录打包）----
do_npx_cache() {
  local plat="$1"
  local cache="$RUNTIME_ROOT/$plat/npx-cache"
  # 预热产物为平台无关 JS 包；目标平台 node 无法在本机执行（如为
  # Windows 落位，node.exe 不可跑）时回退宿主 node
  local node_bin="$RUNTIME_ROOT/$plat/node/bin"
  if [ "$plat" = windows-x86_64 ] || [ ! -x "$node_bin/node" ]; then
    node_bin="$(dirname "$(command -v node)" 2>/dev/null || true)"
    [ -x "$node_bin/node" ] || {
      echo "错误: 未找到可执行 node（预热 npx-cache 需要）" >&2; exit 1
    }
  fi
  echo "==> 预热 @playwright/mcp@$PLAYWRIGHT_MCP_VERSION 至 $cache"
  PATH="$node_bin:$PATH" \
    npm_config_registry=https://registry.npmmirror.com \
    npm_config_cache="$cache" \
    npx --yes "@playwright/mcp@$PLAYWRIGHT_MCP_VERSION" --help >/dev/null
  _prune_npx_cache "$cache"
  echo "==> 完成"
}

# ============================================================
#  install：全量装配（覆盖式幂等可重跑；六组件依次落位）
# ============================================================
do_install() {
  local plat="$1"
  check_platform "$plat"
  local this_plat
  this_plat="$(current_platform)"
  # Windows 全组件解压型（python-env/node/node-tools/playwright/pandoc 均为
  # zip 离线档），可在任意宿主落位；POSIX 含在线生成路径须本机执行
  if [ "$plat" != windows-x86_64 ] && [ "$plat" != "$this_plat" ]; then
    echo "错误: install 须在目标平台本机执行（当前 ${this_plat}，目标 ${plat}）" >&2
    exit 1
  fi
  do_fetch "$plat"
  do_python "$plat"
  do_node "$plat"
  do_node_tools "$plat"
  do_playwright "$plat"
  do_pandoc "$plat"
  do_npx_cache "$plat"
  echo "==> $plat 装配完成，核对: $0 verify $plat"
}

# ---- 布局核对 ----
do_verify() {
  local plat="${1:-$(current_platform)}"
  check_platform "$plat"
  local fail=0
  local cur
  cur="$(current_platform)"
  check_bin() { # desc path
    local desc="$1" path="$2"
    if [ ! -e "$path" ]; then
      echo "  ❌ $desc: $path 不存在"; fail=1; return
    fi
    if [ "$cur" = "$plat" ]; then
      if [ -x "$path" ]; then
        echo "  ✅ $desc: $("$path" --version 2>&1 | head -1)"
      else
        echo "  ❌ $desc: $path 不可执行"; fail=1
      fi
    else
      echo "  ✅ $desc: 存在（跨平台备料，未本机执行）"
    fi
  }
  echo "==> runtime/$plat 核对"
  # Windows 布局：python.exe / node.exe / node_modules 根级
  local py_bin="$RUNTIME_ROOT/$plat/python/bin/python3"
  local node_bin="$RUNTIME_ROOT/$plat/node/bin/node"
  local node_modules_dir="$RUNTIME_ROOT/$plat/node/lib/node_modules"
  if [ "$plat" = windows-x86_64 ]; then
    py_bin="$RUNTIME_ROOT/$plat/python/python.exe"
    node_bin="$RUNTIME_ROOT/$plat/node/node.exe"
    node_modules_dir="$RUNTIME_ROOT/$plat/node/node_modules"
  fi
  check_bin "python" "$py_bin"
  check_bin "node"   "$node_bin"
  local pb="$RUNTIME_ROOT/$plat/playwright-browsers"
  if [ -d "$pb" ]; then
    local shell_bin="$pb/chromium_headless_shell-$PW_CHROMIUM_REV/chrome-headless-shell-$(plat_asset_pw "$plat")/chrome-headless-shell"
    [ "$plat" = windows-x86_64 ] && shell_bin="${shell_bin}.exe"
    if [ "$cur" = "$plat" ]; then
      if [ -x "$shell_bin" ]; then
        echo "  ✅ chrome-headless-shell: $("$shell_bin" --version 2>&1 | head -1)"
      else
        echo "  ❌ chrome-headless-shell 缺失（目录存在但内容无效）"; fail=1
      fi
    elif [ -f "$shell_bin" ]; then
      echo "  ✅ chrome-headless-shell: 存在（跨平台备料，未本机执行）"
    else
      echo "  ❌ chrome-headless-shell 缺失（目录存在但内容无效）"; fail=1
    fi
  else
    echo "  ❌ playwright-browsers 缺失"; fail=1
  fi
  [ -d "$RUNTIME_ROOT/$plat/npx-cache/_npx" ] \
    && echo "  ✅ npx-cache: $(ls "$RUNTIME_ROOT/$plat/npx-cache/_npx" | wc -l | tr -d ' ') 个条目" \
    || { echo "  ❌ npx-cache 缺失"; fail=1; }
  local pd_bin="$RUNTIME_ROOT/$plat/pandoc/bin/pandoc"
  [ "$plat" = windows-x86_64 ] && pd_bin="${pd_bin}.exe"
  check_bin "pandoc" "$pd_bin"
  if [ "$cur" = "$plat" ] && [ -e "$py_bin" ]; then
    # python 移动路径冒烟（装配目录与运行目录不同也应可用——conda 前缀推导检查）
    local probe probe_py
    probe="$(mktemp -d)/omnideck-probe"
    probe_py="$probe/bin/python3"
    [ "$plat" = windows-x86_64 ] && probe_py="$probe/python.exe"
    mkdir -p "$(dirname "$probe")"
    if cp -R "$RUNTIME_ROOT/$plat/python" "$probe" 2>/dev/null \
        && "$probe_py" -c 'import sys; print("copy-ok", sys.version_info[:2])' >/dev/null 2>&1; then
      echo "  ✅ python 重定位冒烟: 拷贝后可执行"
    else
      echo "  ⚠️  python 重定位冒烟: 拷贝后不可用（conda 前缀绑定，需关注）"
    fi
    rm -rf "$(dirname "$probe")"
    # python 预装依赖冒烟（缺失不算失败——纯净环境亦合法，提示重装即可）
    if "$py_bin" -c 'import numpy, pandas, matplotlib' >/dev/null 2>&1; then
      echo "  ✅ python 预装依赖: numpy/pandas/matplotlib 可 import"
    else
      echo "  ⚠️  python 预装依赖缺失（旧档纯净环境），重新 install 可预装沙箱增强集"
    fi
  fi
  # node 预装库冒烟（NODE_PATH 注入，与工具执行链同构）
  if [ "$cur" = "$plat" ] && [ -e "$node_bin" ]; then
    if NODE_PATH="$node_modules_dir" \
        "$node_bin" -e "require('sharp')" >/dev/null 2>&1; then
      echo "  ✅ node 预装库: sharp 可 require（NODE_PATH 注入）"
    else
      echo "  ⚠️  node 预装库缺失，重新 install 可装配 node-sandbox-tools 清单"
    fi
  fi
  [ "$fail" = 0 ] && echo "==> 核对通过" || { echo "==> 存在缺失项"; exit 1; }
}

main() {
  local comp="${1:-}"
  [ -n "$comp" ] || { grep '^#' "$0" | grep -v '^#!' | sed 's/^# \{0,2\}//' | head -34; exit 1; }
  shift || true
  case "$comp" in
    fetch)   do_fetch "${1:-$(current_platform)}" ;;
    install) do_install "${1:-$(current_platform)}" ;;
    verify)  do_verify "${1:-}" ;;
    *) echo "错误: 未知命令 '$comp'（可选: fetch / install / verify）" >&2; exit 1 ;;
  esac
}

main "$@"
