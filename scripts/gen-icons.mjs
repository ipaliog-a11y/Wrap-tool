// Writes PWA PNG icons to public/. No extra deps — Node zlib only.
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [14, 15, 17, 255]
const RED = [232, 33, 39, 255]
const WHITE = [255, 255, 255, 255]

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0)
  }
  return ~c >>> 0
}

function chunk(tag, data) {
  const t = Buffer.from(tag)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crcBuf = Buffer.concat([t, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcBuf))
  return Buffer.concat([len, t, data, crc])
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4)
    raw[row] = 0
    rgba.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function fill(px, i, c) {
  px[i] = c[0]
  px[i + 1] = c[1]
  px[i + 2] = c[2]
  px[i + 3] = c[3]
}

function roundedRect(px, size, x0, y0, x1, y1, r, color) {
  const r2 = r * r
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x < x0 || x >= x1 || y < y0 || y >= y1) continue
      let inside = true
      if (x < x0 + r && y < y0 + r) {
        const dx = x0 + r - x
        const dy = y0 + r - y
        inside = dx * dx + dy * dy <= r2
      } else if (x >= x1 - r && y < y0 + r) {
        const dx = x - (x1 - r - 1)
        const dy = y0 + r - y
        inside = dx * dx + dy * dy <= r2
      } else if (x < x0 + r && y >= y1 - r) {
        const dx = x0 + r - x
        const dy = y - (y1 - r - 1)
        inside = dx * dx + dy * dy <= r2
      } else if (x >= x1 - r && y >= y1 - r) {
        const dx = x - (x1 - r - 1)
        const dy = y - (y1 - r - 1)
        inside = dx * dx + dy * dy <= r2
      }
      if (inside) fill(px, (y * size + x) * 4, color)
    }
  }
}

function drawT(px, size, cx, cy, glyph) {
  const barW = glyph * 0.62
  const barH = glyph * 0.16
  const stemW = glyph * 0.18
  const stemH = glyph * 0.58
  const barX0 = Math.round(cx - barW / 2)
  const barY0 = Math.round(cy - glyph * 0.38)
  const barX1 = Math.round(cx + barW / 2)
  const barY1 = barY0 + Math.round(barH)
  const stemX0 = Math.round(cx - stemW / 2)
  const stemY0 = barY0
  const stemX1 = Math.round(cx + stemW / 2)
  const stemY1 = Math.round(cy - glyph * 0.38 + stemH + barH * 0.4)
  for (let y = barY0; y < barY1; y++) {
    for (let x = barX0; x < barX1; x++) {
      if (x >= 0 && y >= 0 && x < size && y < size) fill(px, (y * size + x) * 4, WHITE)
    }
  }
  for (let y = stemY0; y < stemY1; y++) {
    for (let x = stemX0; x < stemX1; x++) {
      if (x >= 0 && y >= 0 && x < size && y < size) fill(px, (y * size + x) * 4, WHITE)
    }
  }
}

function makeIcon(size, { maskable }) {
  const px = Buffer.alloc(size * size * 4)
  for (let i = 0; i < px.length; i += 4) fill(px, i, BG)
  const pad = maskable ? 0.22 : 0.12
  const x0 = Math.round(size * pad)
  const y0 = x0
  const x1 = size - x0
  const y1 = size - y0
  const r = Math.round((x1 - x0) * 0.22)
  roundedRect(px, size, x0, y0, x1, y1, r, RED)
  drawT(px, size, size / 2, size / 2, (x1 - x0) * 0.72)
  return encodePng(size, px)
}

mkdirSync(OUT, { recursive: true })
const files = {
  'icon-192.png': makeIcon(192, { maskable: false }),
  'icon-512.png': makeIcon(512, { maskable: false }),
  'icon-192-maskable.png': makeIcon(192, { maskable: true }),
  'icon-512-maskable.png': makeIcon(512, { maskable: true }),
  'apple-touch-icon.png': makeIcon(180, { maskable: false }),
}
for (const [name, buf] of Object.entries(files)) {
  writeFileSync(join(OUT, name), buf)
  console.log('wrote', name, buf.length, 'bytes')
}
