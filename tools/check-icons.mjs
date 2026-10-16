// 图标自检。改完配色重跑 make-icons.mjs 之后跑这个确认没画坏：
//   node tools/make-icons.mjs && node tools/check-icons.mjs
//
// 为什么要有它：图标是二进制文件，出了问题「看起来不对」不好定位
// （是底色错了？勾没画上？圆角丢了？）。这里直接把像素解出来断言。

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 解出 PNG 的 IHDR 与解压后的扫描行。只处理本项目生成的格式（8 位 RGBA、无隔行、滤波 0）。 */
function decodePng(file) {
  const buf = readFileSync(file);
  let offset = 8;
  const idat = [];
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    }
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
    if (type === 'IEND') break;
  }

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`只支持 8 位 RGBA 不隔行的 PNG，实际 bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4 + 1;
  const pixel = (x, y) => {
    const base = y * stride + 1 + x * 4; // +1 越过每行的滤波字节
    return [raw[base], raw[base + 1], raw[base + 2], raw[base + 3]];
  };

  return { width, height, pixel };
}

/** 从 tokens.css 读出强调色，图标配色应当与它一致。 */
function accentColor() {
  const css = readFileSync(join(ROOT, 'css', 'tokens.css'), 'utf8');
  const match = css.match(/--color-accent:\s*(#[0-9A-Fa-f]{6})/);
  if (!match) throw new Error('在 css/tokens.css 里找不到 --color-accent');
  const hex = match[1];
  return { hex, rgb: [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) };
}

const checks = [];
const expect = (label, ok, detail) => checks.push({ label, ok, detail });

const accent = accentColor();

const targets = [
  ['icons/icon-192.png', 192],
  ['icons/icon-512.png', 512],
  ['icons/apple-touch-icon.png', 180],
];

for (const [relative, size] of targets) {
  const file = join(ROOT, relative);
  const png = decodePng(file);

  expect(`${relative} 尺寸是 ${size}×${size}`,
    png.width === size && png.height === size,
    `实际 ${png.width}×${png.height}`);

  // 按相对坐标取样：圆角外、内部底色、以及勾的两段中点
  const s = size / 100;
  const corner = png.pixel(Math.round(s * 1), Math.round(s * 1));
  const inside = png.pixel(Math.round(s * 12), Math.round(s * 50));
  const strokeUpper = png.pixel(Math.round(s * 58.6), Math.round(s * 51));
  const strokeLower = png.pixel(Math.round(s * 36), Math.round(s * 60));

  expect(`${relative} 底边色与 tokens.css 的 --color-accent 一致`,
    inside[0] === accent.rgb[0] && inside[1] === accent.rgb[1]
    && inside[2] === accent.rgb[2] && inside[3] === 255,
    `实际 rgb(${inside.slice(0, 3).join(',')})，期望 ${accent.hex}`);

  expect(`${relative} 勾的上段是白色`,
    strokeUpper[0] > 240 && strokeUpper[1] > 240 && strokeUpper[2] > 240 && strokeUpper[3] === 255,
    `实际 rgb(${strokeUpper.slice(0, 3).join(',')}) alpha=${strokeUpper[3]}`);

  expect(`${relative} 勾的下段是白色`,
    strokeLower[0] > 240 && strokeLower[1] > 240 && strokeLower[2] > 240 && strokeLower[3] === 255,
    `实际 rgb(${strokeLower.slice(0, 3).join(',')}) alpha=${strokeLower[3]}`);

  expect(`${relative} 圆角之外是透明的（不是方角）`,
    corner[3] === 0, `alpha=${corner[3]}`);
}

// 白像素总量应当像「一条勾」，而不像「一整块白」或「什么都没有」
{
  const png = decodePng(join(ROOT, 'icons/icon-512.png'));
  let white = 0;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const p = png.pixel(x, y);
      if (p[0] > 240 && p[1] > 240 && p[2] > 240 && p[3] > 240) white += 1;
    }
  }
  expect('icon-512.png 的白像素数量像一条勾（1 万到 2.5 万之间）',
    white > 10000 && white < 25000, `${white} 个白像素`);
}

let failed = 0;
for (const { label, ok, detail } of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? `  —— ${detail}` : ''}`);
}

console.log('');
console.log(failed === 0 ? `全部通过（${checks.length} 项）` : `有 ${failed} 项不通过`);
process.exit(failed === 0 ? 0 : 1);
