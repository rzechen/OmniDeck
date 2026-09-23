#!/bin/sh
# 编译 macOS 窗口枚举 NAPI 插件（截图 hover 拾取窗口用）
# - NAPI 模块 ABI 稳定：用本机 Node headers 编译即可在 Electron 中加载
# - dist-url 指向 npmmirror：node headers 下载在国内网络更稳（可直连时同样可用）
# - 依赖：Xcode Command Line Tools（xcode-select --install）
set -e
cd "$(dirname "$0")/../native"
export npm_config_disturl=https://npmmirror.com/dist
npx node-gyp rebuild
echo "native plugin -> native/build/Release/windows.node"
