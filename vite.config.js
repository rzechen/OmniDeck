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
      ...['index', 'pi', 'sessions', 'llm', 'sandbox', 'skills', 'workspace', 'workspaces', 'files', 'mcp', 'credentials'].map(name => ({
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
              // adm-zip 由 skills.js 运行时 require（node_modules 内），保留原生调用
              external: ['electron', '@earendil-works/pi-coding-agent', '@anthropic-ai/sandbox-runtime', 'pi-mcp-adapter', 'adm-zip']
            }
          }
        }
      })),
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
        quietDeps: true
      }
    }
  }
})
