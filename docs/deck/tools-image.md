# 工具中心 · 图像 Image

> [← Deck 文档](README.md) · [工具中心设计](../overview.md#四工具中心配置驱动的工厂模式)

- **入口路由**：`/tools/image`（分类页），各工具见下表
- **源码位置**：[src/views/deck/tools/image/](../../src/views/deck/tools/image/)
- **注册表**：[tools.js](../../src/config/tools.js) `Image` 分类（主色 #EB2F96）

## 分类定位

支持图片转 Base64、批量格式转换、角度旋转、质量压缩、GIF 合成、文字水印添加、文字渲染出图及二维码生成等常用图像处理操作。全部基于 Canvas / 本地库离线处理。

## 工具清单（8）

| 工具 | 说明 | 路由 | 源文件 |
| --- | --- | --- | --- |
| 图片转 Base64 | 图片转 Base64 Data URL 编码 | `/tools/image/to-base64` | `to-base64.vue` |
| 图片格式转换 | 批量转换，支持 JPEG / WEBP / PNG | `/tools/image/format-convert` | `format-convert.vue` |
| 图片翻转 | 精确角度旋转，支持批量与打包导出 | `/tools/image/flip` | `flip.vue` |
| 图片压缩 | 多图片高质量压缩，可调压缩率与输出格式 | `/tools/image/compress` | `compress.vue` |
| GIF 制作 | 多张静态图合成 GIF 动图 | `/tools/image/make-gif` | `make-gif.vue` |
| 图片水印 | 批量添加文字水印，支持位置与透明度 | `/tools/image/watermark` | `watermark.vue` |
| 文字转图片 | 文字渲染为图片，自定义画布与字体 | `/tools/image/text-to-img` | `text-to-img.vue` |
| 二维码生成 | 高度可定制，支持 Logo 嵌入 | `/tools/image/qrcode` | `qrcode.vue` |

## 实现

- **传图骨架**：批量类工具复用 `components/tool/ImageDrop.vue`（拖拽 / 点选上传的通用件）
- **依赖组件**：gif.js（GIF 合成，worker 位于 `public/gif.worker.js`）、qrcode（二维码）
- **历史入口**：旧路由 `tools/image/screenshot` 重定向至 `/clipboard`（截图能力已升级为全局常驻）
- **分类页**：`index.vue` 经 category-page 工厂渲染
