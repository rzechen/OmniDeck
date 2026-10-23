// 手机远程任务页独立构建：remote.html 单入口 → dist/remote.html 单文件内联产物。
// 与主渲染构建（electron.vite.config.js renderer）隔离，避免共享 chunk 破坏内联；
// agent 子进程 HTTP 服务只吐这一个文件，无静态资源 / asar 路径问题。
// 内联原理：generateBundle 阶段把 html 引用的 js/css bundle 内容直接写回标签，
// 并从产物中删除资源文件（自写 ~40 行，等价 vite-plugin-singlefile，零新依赖）。
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

function inlineSingleFile() {
  return {
    name: 'inline-remote-single-file',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['remote.html']
      if (!html || typeof html.source !== 'string') return
      let src = html.source
      const take = (url) => {
        const key = url.replace(/^\//, '')
        const asset = bundle[key]
        if (asset) delete bundle[key]
        return asset
      }
      // <script src="/assets/xxx.js"> → 内联
      src = src.replace(/<script[^>]*src="(\/?assets\/[^"]+\.js)"[^>]*>\s*<\/script>/g, (m, p) => {
        const chunk = take(p)
        return chunk ? '<script type="module">' + chunk.code + '</script>' : ''
      })
      // <link rel="stylesheet" href="/assets/xxx.css"> → 内联
      src = src.replace(/<link[^>]*href="(\/?assets\/[^"]+\.css)"[^>]*>/g, (m, p) => {
        const asset = take(p)
        return asset ? '<style>' + asset.source + '</style>' : ''
      })
      // modulepreload 残链清除（单文件无需预载）
      src = src.replace(/<link[^>]*rel="modulepreload"[^>]*>/g, '')
      html.source = src
    }
  }
}

export default defineConfig({
  plugins: [vue(), inlineSingleFile()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  build: {
    outDir: 'dist',
    // 关键：不清空 dist（主渲染产物同目录，清了会被整体删除）
    emptyOutDir: false,
    // 图片资产（logo-sm.png 等）内联为 data URL 进 JS，随单文件插件一起内联到 HTML
    assetsInlineLimit: 1024 * 1024,
    rollupOptions: {
      input: path.resolve(__dirname, 'remote.html'),
      output: {
        format: 'es',
        // 固定文件名（无 hash）：产物就 remote.html + assets/remote.js(+css)，内联后仅剩 html
        entryFileNames: 'assets/remote.js',
        chunkFileNames: 'assets/remote-chunk.js',
        assetFileNames: 'assets/remote[extname]'
      }
    }
  }
})
