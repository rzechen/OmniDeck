import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'
import electron from 'vite-plugin-electron'
import path from 'path'
import fs from 'fs'

// 主进程构建开关：本仓完整开发仓，electron/ 缺省在位；
// 检测失败时（目录被误删等）跳过主进程构建，仅构建渲染层，避免构建报错中断。
// 公开仓镜像不含 electron/（见 scripts/mirror-public.sh），克隆公开仓即处于该降级形态。
const hasCore = fs.existsSync(path.resolve(__dirname, 'electron/main.js'))

// electron 主进程构建入口
const electronEntries = [
  {
    entry: 'electron/main.js',
    vite: {
      build: {
        outDir: 'dist-electron',
        rollupOptions: {
          // pi-coding-agent / sandbox-runtime 为纯 ESM 包：external 保留原生 dynamic import()
          external: ['electron', '@earendil-works/pi-coding-agent', '@anthropic-ai/sandbox-runtime']
        }
      }
    }
  },
  // agent 模块为 CJS require 互相引用：逐文件构建，保留 require 结构
  ...['index', 'pi', 'sessions', 'llm', 'sandbox', 'permissions', 'capabilities', 'runtime', 'skills', 'workspaces', 'files', 'mcp', 'credentials', 'builtin-tools', 'pkg-registry', 'web-search', 'rules', 'profile', 'memory', 'file-changes', 'attachments', 'market', 'connectors', 'usage', 'export', 'doc-export', 'checkpoints', 'branchView', 'scheduler', 'workflows'].map(name => ({
    entry: `electron/agent/${name}.js`,
    vite: {
      build: {
        outDir: 'dist-electron/agent',
        rollupOptions: {
          output: {
            entryFileNames: `${name}.js`
          },
          // pi-coding-agent / sandbox-runtime 为纯 ESM 包：external 保留原生 dynamic import()；
          // pi-mcp-adapter 随应用打包，mcp.js 以 require.resolve 定位其运行时路径，须保留原生调用；
          // pi-subagents 随应用打包，builtin-tools.js 以 require.resolve 定位其运行时路径，须保留原生调用；
          // pi-web-access 随应用打包，pkg-registry.js 以 require.resolve 定位其运行时路径，须保留原生调用；
          // adm-zip 由 skills.js 运行时 require（node_modules 内），保留原生调用；
          // pdf-parse 由 attachments.js 运行时 require，保留原生调用；
          // markdown-it 由 export.js 运行时 require（node_modules 内，会话导出 HTML 渲染），保留原生调用
          external: ['electron', '@earendil-works/pi-coding-agent', '@anthropic-ai/sandbox-runtime', 'pi-mcp-adapter', 'pi-subagents', 'pi-web-access', 'adm-zip', 'pdf-parse', 'markdown-it']
        }
      }
    }
  })),
  // 快捷入口主进程模块（P0）：独立构建，产物镜像源码目录（dist-electron/windows/），
  // main.js 经 require('./windows/quick-panel') 引用（相对 require 不内联，运行时解析）
  {
    entry: 'electron/windows/quick-panel.js',
    vite: {
      build: {
        outDir: 'dist-electron',
        rollupOptions: {
          output: {
            entryFileNames: 'windows/quick-panel.js'
          },
          external: ['electron']
        }
      }
    }
  },
  // 屏幕截取模块（P0-M3）：同 quick-panel 构建模式，main.js 经相对 require 引用
  {
    entry: 'electron/windows/capture.js',
    vite: {
      build: {
        outDir: 'dist-electron',
        rollupOptions: {
          output: {
            entryFileNames: 'windows/capture.js'
          },
          external: ['electron']
        }
      }
    }
  },
  // 自动更新模块（N1 检测引导 / N5 electron-updater 全自动）：同 quick-panel 构建模式，main.js 经 require('./core/updater') 引用
  // electron-updater 由 updater.js 运行时 require（node_modules 内），保留原生调用
  {
    entry: 'electron/core/updater.js',
    vite: {
      build: {
        outDir: 'dist-electron',
        rollupOptions: {
          output: {
            entryFileNames: 'core/updater.js'
          },
          external: ['electron', 'electron-updater']
        }
      }
    }
  },
  // 壁纸市场拉取模块：同 quick-panel 构建模式，main.js 经相对 require 引用
  {
    entry: 'electron/services/wallpaper-fetch.js',
    vite: {
      build: {
        outDir: 'dist-electron',
        rollupOptions: {
          output: {
            entryFileNames: 'services/wallpaper-fetch.js'
          },
          external: ['electron']
        }
      }
    }
  },
  // 启动依赖预检（P1）：同 quick-panel 构建模式，main.js 经 require('./core/deps') 引用
  // adm-zip 由 deps.js 运行时 require（Windows 首启解压内置 MinGit），保留原生调用
  {
    entry: 'electron/core/deps.js',
    vite: {
      build: {
        outDir: 'dist-electron',
        rollupOptions: {
          output: {
            entryFileNames: 'core/deps.js'
          },
          external: ['electron', 'adm-zip']
        }
      }
    }
  },
  {
    entry: 'electron/preload.js',
    onstart(args) {
      args.reload()
    },
    vite: {
      build: {
        outDir: 'dist-electron'
      }
    }
  }
]

export default defineConfig({
  plugins: [
    vue(),
    ...(hasCore ? [electron(electronEntries)] : [])
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    // 固定端口：IndexedDB 按 origin 隔离，端口漂移（5173→5174…）会读到全新空库，
    // 表现为"配置刷新后丢失"；端口被占时直接报错，避免数据散落多个 origin
    strictPort: true
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/styles/variables.scss" as *;`,
        quietDeps: true,
        // 静默弃用警告：@import（页面共享样式仍用 @import，Dart Sass 3.0 前无影响）
        // 与 legacy-js-api（vite 4 走 sass 旧 API，属框架层面）
        silenceDeprecations: ['import', 'legacy-js-api']
      }
    }
  }
})
