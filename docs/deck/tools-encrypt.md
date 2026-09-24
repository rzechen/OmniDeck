# 工具中心 · 加密 Encrypt

> [← Deck 文档](README.md) · [工具中心设计](../overview.md#四工具中心配置驱动的工厂模式)

- **入口路由**：`/tools/encrypt`（分类页），各工具见下表
- **源码位置**：[src/views/deck/tools/encrypt/](../../src/views/deck/tools/encrypt/)
- **注册表**：[tools.js](../../src/config/tools.js) `Encrypt` 分类（主色 #FA8C16）

## 分类定位

提供随机密码生成、URL 编解码、多种哈希算法计算、Base 系列编码，以及 AES、DES、RSA 等对称与非对称加解密能力，保障数据安全。全部本地计算，数据不出本机。

## 工具清单（6）

| 工具 | 说明 | 路由 | 源文件 |
| --- | --- | --- | --- |
| 随机密码生成 | 自定义字符集与批量生成的强密码工具 | `/tools/encrypt/password` | `password.vue` |
| 编解码工具 | URL 编码与解码 | `/tools/encrypt/encode-decode` | `encode-decode.vue` |
| Hash 计算 | MD5、SHA1、SHA256、SHA3 等多种哈希算法 | `/tools/encrypt/hash` | `hash.vue` |
| Base 编码 | Base64 / Base32 编解码，兼容中文 Unicode | `/tools/encrypt/base` | `base.vue` |
| AES/DES 加解密 | 对称加解密，支持 ECB / CBC 模式 | `/tools/encrypt/aes-des` | `aes-des.vue` |
| RSA 加解密 | RSA 签名与加密，支持多位密钥对生成 | `/tools/encrypt/rsa` | `rsa.vue` |

## 实现

- **依赖组件**：crypto-js（AES/DES、Hash）、js-sha3（SHA3 系列）、hi-base32（Base32）、jsencrypt + node-forge（RSA 密钥对 / 签名）
- **分类页**：`index.vue` 经 category-page 工厂渲染
