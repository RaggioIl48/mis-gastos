// Genera los iconos PNG de la app sin dependencias: `node tools/make-icons.js`.
// Dibuja una billetera blanca sobre el color de acento, con suavizado por supermuestreo.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const ACCENT = [41, 125, 121];
const WHITE = [255, 255, 255];
const SAMPLES = 4;

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

/** Color de un punto en coordenadas 0..1. */
function shade(x, y) {
  const inWallet = insideRoundedRect(x, y, 0.2, 0.3, 0.8, 0.72, 0.07);
  if (!inWallet) return ACCENT;
  const inStripe = y >= 0.39 && y <= 0.45;
  const inClasp = insideRoundedRect(x, y, 0.58, 0.52, 0.8, 0.64, 0.05);
  const inDot = (x - 0.66) ** 2 + (y - 0.58) ** 2 <= 0.022 ** 2;
  if (inDot) return WHITE;
  if (inStripe || inClasp) return ACCENT;
  return WHITE;
}

function render(size) {
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 3); // byte de filtro 0 + RGB
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const color = shade((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size);
          for (let c = 0; c < 3; c++) sum[c] += color[c];
        }
      }
      for (let c = 0; c < 3; c++) row[1 + px * 3 + c] = Math.round(sum[c] / SAMPLES ** 2);
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits por canal
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(render(size), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of [180, 192, 512]) {
  writeFileSync(new URL(`icon-${size}.png`, outDir), png(size));
  console.log(`icons/icon-${size}.png`);
}
