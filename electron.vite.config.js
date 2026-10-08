import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { builtinModules } from 'module'
import fs from 'fs'
import path from 'path'

// 主进程构建开关：本仓完整开发仓，electron/ 缺省在位；
// 检测失败时（目录被误删等）改用占位入口，仅保证渲染层可构建，避免构建报错中断。
// 公开仓镜像不含 electron/（见 scripts/mirror-public.sh），克隆公开仓即处于该降级形态。
const hasCore = fs.existsSync(path.resolve(__dirname, 'electron/main.js'))

// agent 模块清单：CJS require 互相引用，产物镜像源码目录（dist-electron/agent/），
// 相对 require 不内联，运行时解析。目录按领域划分：
//   index      IPC 门面（组合根）
//   pi/        pi Agent 运行时（index.js 门面 + 子模块；require('./pi') 目录解析）
//   core/      对话核心（chat-state / pi-events / direct-llm / llm）
//   ipc/       IPC 注册层（chat / sessions / settings / workspace / automation）
//   sessions/  会话数据（sessions / checkpoints / file-changes / branchView / export）
//   knowledge/ 知识资产（skills / rules / profile / memory / market）
//   integrations/ 外部接入（mcp / connectors / credentials / web-search / site-auth /
//                 login-wizard / notify / workflows / pkg-registry）
//   workspace/ 空间与文件（workspaces / files / attachments）
//   platform/  平台与安全（permissions / capabilities / runtime / sandbox / scheduler / usage）
//   tools/     pi 工具扩展（builtin-tools / doc-export / image-gen）
const agentNames = [
  'index',
  'pi/index', 'pi/state', 'pi/provider', 'pi/extensions', 'pi/prompt', 'pi/ui-context',
  'pi/session', 'pi/session-events', 'pi/session-branch', 'pi/native-export',
  'pi/packages', 'pi/setup',
  'core/chat-state', 'core/pi-events', 'core/direct-llm', 'core/llm',
  'ipc/chat', 'ipc/sessions', 'ipc/settings', 'ipc/workspace', 'ipc/automation',
  'sessions/sessions', 'sessions/checkpoints', 'sessions/file-changes', 'sessions/branchView', 'sessions/export',
  'knowledge/skills', 'knowledge/rules', 'knowledge/profile', 'knowledge/memory', 'knowledge/market',
  'integrations/mcp', 'integrations/connectors', 'integrations/credentials', 'integrations/web-search',
  'integrations/site-auth', 'integrations/login-wizard', 'integrations/notify', 'integrations/workflows',
  'integrations/pkg-registry',
  'workspace/workspaces', 'workspace/files', 'workspace/attachments',
  'platform/permissions', 'platform/capabilities', 'platform/runtime', 'platform/sandbox',
  'platform/scheduler', 'platform/usage',
  'tools/builtin-tools', 'tools/doc-export', 'tools/image-gen'
]

// 运行时 require / 定位的裸包并集（均在 dependencies，electron-builder 默认收集）：
// pi-coding-agent / sandbox-runtime 为纯 ESM 包：external 保留原生 dynamic import()；
// pi-mcp-adapter 随应用打包，agent/integrations/mcp.js 以 require.resolve 定位其运行时路径，须保留原生调用；
// pi-subagents 随应用打包，agent/tools/builtin-tools.js 以 require.resolve 定位其运行时路径，须保留原生调用；
// pi-web-access 随应用打包，agent/integrations/pkg-registry.js 以 require.resolve 定位其运行时路径，须保留原生调用；
// adm-zip 由 agent/knowledge/skills.js / core/deps.js 运行时 require（node_modules 内），保留原生调用；
// pdf-parse 由 agent/workspace/attachments.js 运行时 require，保留原生调用；
// markdown-it 由 agent/sessions/export.js 运行时 require，保留原生调用；
// electron-updater 由 core/updater.js 运行时 require，保留原生调用
const runtimeDeps = [
  '@earendil-works/pi-coding-agent',
  '@anthropic-ai/sandbox-runtime',
  'pi-mcp-adapter',
  'pi-subagents',
  'pi-web-access',
  'adm-zip',
  'pdf-parse',
  'markdown-it',
  'electron-updater'
]

const nodeBuiltins = builtinModules.flatMap(m => [m, `node:${m}`])

// external 判定：相对引用 / electron / node 内置 / 运行时定位包一律不内联，
// 复刻逐文件构建行为——各入口产物只含自身源码，require 结构原样保留。
// 注意：源码内 electron 均为裸 require('electron')，无 electron/xxx 子路径引用，
// 故不做前缀匹配——避免子路径形式的模块 id 被误判
const isMainExternal = id =>
  id.startsWith('.') ||
  id === 'electron' ||
  nodeBuiltins.includes(id) ||
  runtimeDeps.some(d => id === d || id.startsWith(`${d}/`))

// 入口统一解析为绝对路径：SSR 构建中不带 ./ 前缀的路径（electron/main.js）
// 会被当作裸包名解析，失败后走 SSR 默认外部化，导致 "Entry module cannot be external"
const abs = p => path.resolve(__dirname, p)

// 主进程多入口：key 即产物相对路径（dist-electron/ 下镜像 electron/ 目录结构）
const mainInput = hasCore
  ? {
      main: abs('electron/main.js'),
      // agent 子进程宿主、electron 仿真层与主进程桥：产物在 dist-electron 根级
      // （agent-host 内 require('./agent')、resolveFilename 重定向 './agent-shim.js' 均为同根相对引用；
      //   main.js require('./agent-bridge') 同理）
      'agent-bridge': abs('electron/agent-bridge.js'),
      'agent-host': abs('electron/agent-host.js'),
      'agent-shim': abs('electron/agent-shim.js'),
      ...Object.fromEntries(agentNames.map(name => [`agent/${name}`, abs(`electron/agent/${name}.js`)])),
      'windows/quick-panel': abs('electron/windows/quick-panel.js'),
      // capture 门面（windows/capture/index.js，require('./windows/capture') 目录解析）
      // + 子模块（同目录镜像产物，相对 require 运行时解析）
      'windows/capture/index': abs('electron/windows/capture/index.js'),
      'windows/capture/settings': abs('electron/windows/capture/settings.js'),
      'windows/capture/native': abs('electron/windows/capture/native.js'),
      'windows/capture/utils': abs('electron/windows/capture/utils.js'),
      'windows/capture/persist': abs('electron/windows/capture/persist.js'),
      'windows/capture/records': abs('electron/windows/capture/records.js'),
      'windows/capture/clips': abs('electron/windows/capture/clips.js'),
      'windows/capture/screen': abs('electron/windows/capture/screen.js'),
      'windows/capture/overlay': abs('electron/windows/capture/overlay.js'),
      'windows/capture/pin': abs('electron/windows/capture/pin.js'),
      'windows/capture/scroll': abs('electron/windows/capture/scroll.js'),
      'windows/capture/favs': abs('electron/windows/capture/favs.js'),
      'windows/capture/shortcuts': abs('electron/windows/capture/shortcuts.js'),
      'windows/capture/ipc': abs('electron/windows/capture/ipc.js'),
      'windows/browser': abs('electron/windows/browser.js'),
      // 翻译浏览器：控制器 / 引擎层 / 注入脚本（main.js 与 browser.js 相对引用，产物镜像源码结构）
      'translate/controller': abs('electron/translate/controller.js'),
      'translate/engines': abs('electron/translate/engines.js'),
      'translate/inject': abs('electron/translate/inject.js'),
      'core/updater': abs('electron/core/updater.js'),
      'core/deps': abs('electron/core/deps.js'),
      // 运行时组件在线装配（main.js require；产物镜像源码结构，运行时解析）
      'core/runtime-downloader': abs('electron/core/runtime-downloader.js'),
      // 首启引导装配检查（require runtime-downloader；引导页经 IPC 查询必需组件就绪态）
      'core/setup': abs('electron/core/setup.js'),
      'services/wallpaper-fetch': abs('electron/services/wallpaper-fetch.js')
    }
  : { main: abs('scripts/stub-main.js') }

export default defineConfig({
  main: {
    build: {
      outDir: 'dist-electron',
      rollupOptions: {
        input: mainInput,
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        },
        external: isMainExternal
      }
    }
  },
  preload: {
    build: {
      outDir: 'dist-electron',
      // 与 main 共用 dist-electron：不清空目录，否则会把先构建完成的主进程产物删掉
      emptyOutDir: false,
      rollupOptions: {
        // 双入口：主 preload + 浏览器容器 WebContentsView 通用 preload（browser/view-preload.js）
        input: {
          preload: hasCore ? abs('electron/preload.js') : abs('scripts/stub-main.js'),
          ...(hasCore ? { 'browser/view-preload': abs('electron/browser/view-preload.js') } : {})
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {
    root: '.',
    plugins: [
      vue({
        template: {
          compilerOptions: {
            // <webview> 是 Electron 自定义元素（翻译浏览器内嵌网页），
            // SFC 预编译模板在编译期放行；缺失会按“未注册组件”渲染并刷警告
            isCustomElement: tag => tag === 'webview'
          }
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    server: {
      port: 5173,
      // 固定端口：IndexedDB 按 origin 隔离，端口漂移（5173→5174…）会读到全新空库，
      // 表现为“配置刷新后丢失”；端口被占时直接报错，避免数据散落多个 origin
      strictPort: true
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use "@/styles/variables.scss" as *;`,
          quietDeps: true,
          // 静默弃用警告：@import（页面共享样式仍用 @import，Dart Sass 3.0 前无影响）
          // 与 legacy-js-api（vite 走 sass 旧 API 时触发，属框架层面）
          silenceDeprecations: ['import', 'legacy-js-api']
        }
      }
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html')
      }
    }
  }
})
