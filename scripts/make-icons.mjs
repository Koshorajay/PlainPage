// Draws the PlainPage icon as PNG files with no dependencies (Node zlib only).
// Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const TEAL = [14, 111, 100];
const WHITE = [255, 255, 255];

// Signed distance to a rounded rectangle centred at (cx, cy).
function roundedRect(x, y, cx, cy, halfW, halfH, r) {
  const dx = Math.abs(x - cx) - (halfW - r);
  const dy = Math.abs(y - cy) - (halfH - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

// Shapes are defined on a 128x128 canvas, like public/icons/icon.svg.
const shapes = [
  { color: TEAL, alpha: 1, d: (x, y) => roundedRect(x, y, 64, 64, 52, 58, 26) },
  { color: WHITE, alpha: 1, d: (x, y) => roundedRect(x, y, 64, 42, 31, 5, 5) },
  { color: WHITE, alpha: 0.85, d: (x, y) => roundedRect(x, y, 57.5, 64, 24.5, 5, 5) },
  { color: WHITE, alpha: 0.7, d: (x, y) => roundedRect(x, y, 51, 86, 18, 5, 5) },
];

function render(size) {
  const ss = 4; // supersampling for smooth edges
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = ((px + (sx + 0.5) / ss) / size) * 128;
          const y = ((py + (sy + 0.5) / ss) / size) * 128;
          let cr = 0, cg = 0, cb = 0, ca = 0;
          for (const shape of shapes) {
            if (shape.d(x, y) <= 0) {
              const al = shape.alpha;
              cr = shape.color[0] * al + cr * (1 - al);
              cg = shape.color[1] * al + cg * (1 - al);
              cb = shape.color[2] * al + cb * (1 - al);
              ca = al + ca * (1 - al);
            }
          }
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const n = ss * ss;
      const i = (py * size + px) * 4;
      if (a > 0) {
        pixels[i] = Math.round(r / a);
        pixels[i + 1] = Math.round(g / a);
        pixels[i + 2] = Math.round(b / a);
      }
      pixels[i + 3] = Math.round((a / n) * 255);
    }
  }
  return pixels;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size) {
  const pixels = render(size);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  ['public/icons', [192, 512]],
  ['extension/public/icons', [16, 32, 48, 128]],
];
for (const [dir, sizes] of targets) {
  mkdirSync(dir, { recursive: true });
  for (const size of sizes) {
    writeFileSync(`${dir}/icon-${size}.png`, png(size));
    console.log(`${dir}/icon-${size}.png`);
  }
}
