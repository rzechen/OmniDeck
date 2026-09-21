import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'
import electron from 'vite-plugin-electron'
import path from 'path'

export default defineConfig({
  plugins: [
    vue(),
    electron([
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
      ...['index', 'pi', 'sessions', 'llm', 'sandbox', 'skills', 'workspace', 'workspaces', 'files', 'mcp', 'credentials', 'builtin-tools', 'rules', 'attachments', 'market', 'connectors', 'usage', 'export', 'checkpoints'].map(name => ({
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
              // adm-zip 由 skills.js 运行时 require（node_modules 内），保留原生调用；
              // pdf-parse 由 attachments.js 运行时 require，保留原生调用；
              // markdown-it 由 export.js 运行时 require（会话导出 HTML 渲染），保留原生调用
              external: ['electron', '@earendil-works/pi-coding-agent', '@anthropic-ai/sandbox-runtime', 'pi-mcp-adapter', 'pi-subagents', 'adm-zip', 'pdf-parse', 'markdown-it']
            }
          }
        }
      })),
      // 快捷入口主进程模块（P0）：与 main.js 同构——独立构建到 dist-electron，
      // main.js 经 require('./quick-panel') 引用（相对 require 不内联，运行时解析）
      {
        entry: 'electron/quick-panel.js',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                entryFileNames: 'quick-panel.js'
              },
              external: ['electron']
            }
          }
        }
      },
      // 屏幕截取模块（P0-M3）：同 quick-panel 构建模式，main.js / agent 均经相对 require 引用
      {
        entry: 'electron/capture.js',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                entryFileNames: 'capture.js'
              },
              external: ['electron']
            }
          }
        }
      },
      // 自动更新模块（N1 检测引导 / N5 electron-updater 全自动）：同 quick-panel 构建模式，main.js 经 require('./updater') 引用
      // electron-updater 由 updater.js 运行时 require（node_modules 内），保留原生调用
      {
        entry: 'electron/updater.js',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                entryFileNames: 'updater.js'
              },
              external: ['electron', 'electron-updater']
            }
          }
        }
      },
      // 启动依赖预检（P1）：同 quick-panel 构建模式，main.js 经 require('./deps') 引用
      {
        entry: 'electron/deps.js',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                entryFileNames: 'deps.js'
              },
              external: ['electron']
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
    ])
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173
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
