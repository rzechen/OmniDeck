// 国密 SM4（GB/T 32907-2016）纯 JS 实现 + Java SHA1PRNG 兼容密钥派生
//
// 用途：SM4/ECB/PKCS7Padding 加解密工具，与 Java 侧等价实现互认：
//   Cipher.getInstance("SM4/ECB/PKCS7Padding", "BC")
//   KeyGenerator.getInstance("SM4") + SecureRandom.getInstance("SHA1PRNG").setSeed(seed)
// 密钥派生兼容 sun.security.provider.SecureRandom（SHA1PRNG）：
//   首次 setSeed 时 state = SHA1(seed)，输出块 = SHA1(state)，
//   state 按逐字节带进位加法更新（详见下方 sha1Prng）

// ---------------- SM4 基础常量 ----------------

const SBOX = [
  0xd6, 0x90, 0xe9, 0xfe, 0xcc, 0xe1, 0x3d, 0xb7, 0x16, 0xb6, 0x14, 0xc2, 0x28, 0xfb, 0x2c, 0x05,
  0x2b, 0x67, 0x9a, 0x76, 0x2a, 0xbe, 0x04, 0xc3, 0xaa, 0x44, 0x13, 0x26, 0x49, 0x86, 0x06, 0x99,
  0x9c, 0x42, 0x50, 0xf4, 0x91, 0xef, 0x98, 0x7a, 0x33, 0x54, 0x0b, 0x43, 0xed, 0xcf, 0xac, 0x62,
  0xe4, 0xb3, 0x1c, 0xa9, 0xc9, 0x08, 0xe8, 0x95, 0x80, 0xdf, 0x94, 0xfa, 0x75, 0x8f, 0x3f, 0xa6,
  0x47, 0x07, 0xa7, 0xfc, 0xf3, 0x73, 0x17, 0xba, 0x83, 0x59, 0x3c, 0x19, 0xe6, 0x85, 0x4f, 0xa8,
  0x68, 0x6b, 0x81, 0xb2, 0x71, 0x64, 0xda, 0x8b, 0xf8, 0xeb, 0x0f, 0x4b, 0x70, 0x56, 0x9d, 0x35,
  0x1e, 0x24, 0x0e, 0x5e, 0x63, 0x58, 0xd1, 0xa2, 0x25, 0x22, 0x7c, 0x3b, 0x01, 0x21, 0x78, 0x87,
  0xd4, 0x00, 0x46, 0x57, 0x9f, 0xd3, 0x27, 0x52, 0x4c, 0x36, 0x02, 0xe7, 0xa0, 0xc4, 0xc8, 0x9e,
  0xea, 0xbf, 0x8a, 0xd2, 0x40, 0xc7, 0x38, 0xb5, 0xa3, 0xf7, 0xf2, 0xce, 0xf9, 0x61, 0x15, 0xa1,
  0xe0, 0xae, 0x5d, 0xa4, 0x9b, 0x34, 0x1a, 0x55, 0xad, 0x93, 0x32, 0x30, 0xf5, 0x8c, 0xb1, 0xe3,
  0x1d, 0xf6, 0xe2, 0x2e, 0x82, 0x66, 0xca, 0x60, 0xc0, 0x29, 0x23, 0xab, 0x0d, 0x53, 0x4e, 0x6f,
  0xd5, 0xdb, 0x37, 0x45, 0xde, 0xfd, 0x8e, 0x2f, 0x03, 0xff, 0x6a, 0x72, 0x6d, 0x6c, 0x5b, 0x51,
  0x8d, 0x1b, 0xaf, 0x92, 0xbb, 0xdd, 0xbc, 0x7f, 0x11, 0xd9, 0x5c, 0x41, 0x1f, 0x10, 0x5a, 0xd8,
  0x0a, 0xc1, 0x31, 0x88, 0xa5, 0xcd, 0x7b, 0xbd, 0x2d, 0x74, 0xd0, 0x12, 0xb8, 0xe5, 0xb4, 0xb0,
  0x89, 0x69, 0x97, 0x4a, 0x0c, 0x96, 0x77, 0x7e, 0x65, 0xb9, 0xf1, 0x09, 0xc5, 0x6e, 0xc6, 0x84,
  0x18, 0xf0, 0x7d, 0xec, 0x3a, 0xdc, 0x4d, 0x20, 0x79, 0xee, 0x5f, 0x3e, 0xd7, 0xcb, 0x39, 0x48
]

const FK = [0xa3b1bac6, 0x56aa3350, 0x677d9197, 0xb27022dc]

// CK[i] 第 j 字节 = (4i + j) * 7 mod 256
const CK = []
for (let i = 0; i < 32; i++) {
  CK[i] = (((4 * i) * 7 % 256) << 24 | ((4 * i + 1) * 7 % 256) << 16 | ((4 * i + 2) * 7 % 256) << 8 | ((4 * i + 3) * 7 % 256)) >>> 0
}

function rotl(x, n) {
  return ((x << n) | (x >>> (32 - n))) >>> 0
}

// S 盒非线性变换 τ
function tau(a) {
  return ((SBOX[(a >>> 24) & 0xff] << 24) | (SBOX[(a >>> 16) & 0xff] << 16) |
    (SBOX[(a >>> 8) & 0xff] << 8) | SBOX[a & 0xff]) >>> 0
}

// 轮函数合成变换 T = L ∘ τ
function sm4T(x) {
  const b = tau(x)
  return (b ^ rotl(b, 2) ^ rotl(b, 10) ^ rotl(b, 18) ^ rotl(b, 24)) >>> 0
}

// 密钥扩展合成变换 T' = L' ∘ τ
function sm4TPrime(x) {
  const b = tau(x)
  return (b ^ rotl(b, 13) ^ rotl(b, 23)) >>> 0
}

function readU32(bytes, off) {
  return ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]) >>> 0
}

// 密钥扩展：16 字节密钥 → 32 个轮密钥
function expandKey(keyBytes) {
  const k = new Array(36)
  for (let i = 0; i < 4; i++) k[i] = (readU32(keyBytes, i * 4) ^ FK[i]) >>> 0
  const rk = new Array(32)
  for (let i = 0; i < 32; i++) {
    k[i + 4] = (k[i] ^ sm4TPrime((k[i + 1] ^ k[i + 2] ^ k[i + 3] ^ CK[i]) >>> 0)) >>> 0
    rk[i] = k[i + 4]
  }
  return rk
}

// 单块 16 字节加解密（解密时轮密钥逆序）
function cryptBlock(rk, input, inOff, output, outOff) {
  const x = new Array(36)
  for (let i = 0; i < 4; i++) x[i] = readU32(input, inOff + i * 4)
  for (let i = 0; i < 32; i++) {
    x[i + 4] = (x[i] ^ sm4T((x[i + 1] ^ x[i + 2] ^ x[i + 3] ^ rk[i]) >>> 0)) >>> 0
  }
  for (let i = 0; i < 4; i++) {
    const w = x[35 - i]
    output[outOff + i * 4] = (w >>> 24) & 0xff
    output[outOff + i * 4 + 1] = (w >>> 16) & 0xff
    output[outOff + i * 4 + 2] = (w >>> 8) & 0xff
    output[outOff + i * 4 + 3] = w & 0xff
  }
}

// ---------------- PKCS7 填充 ----------------

function pkcs7Pad(bytes) {
  const padLen = 16 - (bytes.length % 16)
  const out = new Uint8Array(bytes.length + padLen)
  out.set(bytes)
  out.fill(padLen, bytes.length)
  return out
}

function pkcs7Unpad(bytes) {
  const padLen = bytes[bytes.length - 1]
  if (padLen < 1 || padLen > 16) throw new Error('填充校验失败：密钥错误或密文无效')
  for (let i = 0; i < padLen; i++) {
    if (bytes[bytes.length - 1 - i] !== padLen) throw new Error('填充校验失败：密钥错误或密文无效')
  }
  return bytes.subarray(0, bytes.length - padLen)
}

// ---------------- ECB 加解密 ----------------

export function sm4EcbEncrypt(keyBytes, plainBytes) {
  const rk = expandKey(keyBytes)
  const padded = pkcs7Pad(plainBytes)
  const out = new Uint8Array(padded.length)
  for (let off = 0; off < padded.length; off += 16) cryptBlock(rk, padded, off, out, off)
  return out
}

export function sm4EcbDecrypt(keyBytes, cipherBytes) {
  if (cipherBytes.length === 0 || cipherBytes.length % 16 !== 0) {
    throw new Error('密文长度必须是 16 字节的整数倍')
  }
  const rk = expandKey(keyBytes).reverse()
  const out = new Uint8Array(cipherBytes.length)
  for (let off = 0; off < cipherBytes.length; off += 16) cryptBlock(rk, cipherBytes, off, out, off)
  return pkcs7Unpad(out)
}

// ---------------- SHA-1（供 SHA1PRNG 派生使用） ----------------

function sha1(msgBytes) {
  const len = msgBytes.length
  const totalLen = (((len + 8) >> 6) + 1) * 64
  const data = new Uint8Array(totalLen)
  data.set(msgBytes)
  data[len] = 0x80
  const dv = new DataView(data.buffer)
  dv.setUint32(totalLen - 8, Math.floor(len / 536870912)) // len * 8 的高 32 位
  dv.setUint32(totalLen - 4, (len << 3) >>> 0)
  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0
  const w = new Uint32Array(80)
  for (let b = 0; b < totalLen; b += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(b + i * 4)
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    let a = h0
    let bb = h1
    let c = h2
    let d = h3
    let e = h4
    for (let i = 0; i < 80; i++) {
      let f
      let k
      if (i < 20) {
        f = (bb & c) | (~bb & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = bb ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (bb & c) | (bb & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = bb ^ c ^ d
        k = 0xca62c1d6
      }
      const t = (rotl(a, 5) + (f >>> 0) + e + k + w[i]) >>> 0
      e = d
      d = c
      c = rotl(bb, 30)
      bb = a
      a = t
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + bb) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }
  const out = new Uint8Array(20)
  const odv = new DataView(out.buffer)
  odv.setUint32(0, h0)
  odv.setUint32(4, h1)
  odv.setUint32(8, h2)
  odv.setUint32(12, h3)
  odv.setUint32(16, h4)
  return out
}

// ---------------- Java SHA1PRNG 兼容密钥派生 ----------------

// 精确复刻 sun.security.provider.SecureRandom（JDK8+）：
//   1) 首次 setSeed（state == null）时：state = SHA1(seed)
//   2) engineNextBytes：输出块 = SHA1(state)，随后
//      state = (state + output + 1) mod 2^160（逐字节带进位加法）
export function sha1Prng(seedBytes, length) {
  const out = new Uint8Array(length)
  let state = sha1(seedBytes)
  let filled = 0
  while (filled < length) {
    const output = sha1(state)
    updateState(state, output)
    const take = Math.min(20, length - filled)
    out.set(output.subarray(0, take), filled)
    filled += take
  }
  return out
}

// OpenJDK updateState：state(n+1) = state(n) + output(n) + 1（mod 2^160）
// 注意：Java 中 (int)(byte) 做符号扩展，v >> 8 为算术右移（负数进位为 -1）
function updateState(state, output) {
  let last = 1
  let zf = false
  for (let i = 0; i < state.length; i++) {
    const sv = state[i] < 128 ? state[i] : state[i] - 256
    const ov = output[i] < 128 ? output[i] : output[i] - 256
    const v = sv + ov + last
    const t = v & 0xff
    zf = zf || (sv & 0xff) !== t
    state[i] = t
    last = v >> 8
  }
  if (!zf) state[0] = (state[0] + 1) & 0xff
}

// 便捷入口：字符串种子 → 16 字节 SM4 密钥
export function deriveSm4KeyFromSeed(seed) {
  return sha1Prng(new TextEncoder().encode(seed), 16)
}
