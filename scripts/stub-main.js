// 公开仓降级占位入口：electron/ 目录被镜像剥离时（见 scripts/mirror-public.sh），
// electron-vite 仍需可构建的主进程入口，产出空 main 保持 dist-electron 结构完整。
// 完整开发仓不会使用本文件（electron.vite.config.js 中 hasCore 分支优先真实入口）。
