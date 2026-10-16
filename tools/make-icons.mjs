// 生成主屏幕图标。零依赖：用 Node 内置的 zlib 手写 PNG。
// 改配色后重跑：node tools/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

// 取自 css/tokens.css 的 --color-accent（亮色）与 --color-on-accent
const BACKGROUND = [0x23, 0x83, 0xE2];
const FOREGROUND = [0xFF, 0xFF, 0xFF];

// ---------- PNG 编码 ----------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xFFFFFFFF;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return out;
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // 每通道 8 位
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // 压缩方式
  ihdr[11] = 0; // 滤波方式
  ihdr[12] = 0; // 不隔行

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // 每行的滤波字节
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 绘制 ----------

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 圆角矩形的覆盖率，软边约 1px，用来抗锯齿。 */
function roundedSquareAlpha(px, py, size, radius) {
  const half = size / 2;
  const dx = Math.abs(px - half) - (half - radius);
  const dy = Math.abs(py - half) - (half - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inside = Math.min(Math.max(dx, dy), 0);
  return clamp01(0.5 - (outside + inside - radius));
}

/** 线段的覆盖率（带圆头）。 */
function segmentAlpha(px, py, a, b, halfWidth) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const len2 = abx * abx + aby * aby;
  const t = len2 === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - a[0]) * abx + (py - a[1]) * aby) / len2));
  const cx = a[0] + abx * t;
  const cy = a[1] + aby * t;
  return clamp01(0.5 - (Math.hypot(px - cx, py - cy) - halfWidth));
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const stroke = size * 0.085;

  // 一个勾：先向右下，再向右上
  const p1 = [size * 0.28, size * 0.52];
  const p2 = [size * 0.44, size * 0.68];
  const p3 = [size * 0.73, size * 0.34];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      const background = roundedSquareAlpha(px, py, size, radius);
      const tick = Math.max(
        segmentAlpha(px, py, p1, p2, stroke / 2),
        segmentAlpha(px, py, p2, p3, stroke / 2),
      );

      const i = (y * size + x) * 4;
      rgba[i] = Math.round(BACKGROUND[0] * (1 - tick) + FOREGROUND[0] * tick);
      rgba[i + 1] = Math.round(BACKGROUND[1] * (1 - tick) + FOREGROUND[1] * tick);
      rgba[i + 2] = Math.round(BACKGROUND[2] * (1 - tick) + FOREGROUND[2] * tick);
      rgba[i + 3] = Math.round(background * 255);
    }
  }

  return rgba;
}

// ---------- 输出 ----------

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];

for (const [name, size] of targets) {
  const file = join(OUT_DIR, name);
  writeFileSync(file, encodePng(size, drawIcon(size)));
  console.log(`写入 ${name}（${size}×${size}）`);
}
