'use strict';
/**
 * Generates build/icon.png (1024x1024) — the MauProject app icon — with no external tools.
 * electron-builder converts it to .icns / .ico when packaging.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 1024;
const SS = 3; // supersampling
const px = Buffer.alloc(S * S * 4);

function inRoundRect(x, y, rx, ry, w, h, r) {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + w - r);
  const cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// macOS icon grid: 824px body centered, ~185px corner radius
const M = 100, B = S - 2 * M, R = 185;
const bars = [
  { x: 250, y: 300, w: 330, h: 120, c: [255, 255, 255] },
  { x: 370, y: 452, w: 400, h: 120, c: [199, 210, 254] },
  { x: 490, y: 604, w: 290, h: 120, c: [255, 255, 255] },
];

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
        if (!inRoundRect(fx, fy, M, M, B, B, R)) continue;
        const t = ((fx - M) + (fy - M)) / (2 * B);
        let c = [99 + (67 - 99) * t, 102 + (56 - 102) * t, 241 + (202 - 241) * t]; // #6366f1 -> #4338ca
        for (const bar of bars) if (inRoundRect(fx, fy, bar.x, bar.y, bar.w, bar.h, bar.h / 2)) c = bar.c;
        r += c[0]; g += c[1]; b += c[2]; a += 1;
      }
    }
    const i = (y * S + x) * 4;
    if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; px[i + 3] = (a / (SS * SS)) * 255; }
  }
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4); }
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('MauProject icon written to', out);
