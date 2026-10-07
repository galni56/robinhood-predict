#!/usr/bin/env node
// Builds every site icon (favicon.ico, PNGs, favicon.svg) from the logo coin
// sprite in src/retro/spriteData.ts, pixel-exact with nearest-neighbour
// scaling. Usage: node scripts/make-favicons.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const source = readFileSync('src/retro/spriteData.ts', 'utf8')
const line = source.split('\n').find((l) => l.startsWith('export const logoCoin'))
const [vw, vh] = line.match(/viewBox: '0 0 (\d+) (\d+)'/).slice(1).map(Number)
const rects = [...line.matchAll(/\[(\d+), (\d+), (\d+), (\d+), '(#[0-9A-Fa-f]{6})'\]/g)].map((m) => [+m[1], +m[2], +m[3], +m[4], m[5]])

// The sprite on a square grid, centred (16x17 -> 17x17).
const side = Math.max(vw, vh)
const ox = Math.floor((side - vw) / 2), oy = Math.floor((side - vh) / 2)
const grid = Array.from({ length: side }, () => Array(side).fill(null))
for (const [x, y, w, h, fill] of rects) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) grid[oy + y + j][ox + x + i] = fill

const CREAM = '#FFF6DF'
const rgba = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255]

/** RGBA image of the sprite at `size` px, with a `padding` share of empty border and an optional background. */
function render(size, { padding = 0.06, background = null } = {}) {
  const inner = size * (1 - 2 * padding)
  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = Math.floor(((x - size * padding) / inner) * side)
    const gy = Math.floor(((y - size * padding) / inner) * side)
    const fill = gx >= 0 && gy >= 0 && gx < side && gy < side ? grid[gy][gx] : null
    const color = fill ? rgba(fill) : background ? rgba(background) : [0, 0, 0, 0]
    color.forEach((v, k) => { pixels[(y * size + x) * 4 + k] = v })
  }
  return pixels
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function png(size, options) {
  const pixels = render(size, options)
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
function ico(sizes) {
  const images = sizes.map((s) => png(s, { padding: 0 }))
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4)
  let offset = 6 + 16 * sizes.length
  const entries = sizes.map((s, i) => {
    const e = Buffer.alloc(16)
    e[0] = s >= 256 ? 0 : s; e[1] = s >= 256 ? 0 : s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
    e.writeUInt32LE(images[i].length, 8); e.writeUInt32LE(offset, 12); offset += images[i].length
    return e
  })
  return Buffer.concat([header, ...entries, ...images])
}

writeFileSync('public/favicon-16x16.png', png(16, { padding: 0 }))
writeFileSync('public/favicon-32x32.png', png(32, { padding: 0 }))
writeFileSync('public/favicon.ico', ico([16, 32, 48]))
// Home-screen icons get the cream background: iOS and Android show transparency as black.
writeFileSync('public/apple-touch-icon.png', png(180, { padding: 0.12, background: CREAM }))
writeFileSync('public/android-chrome-192x192.png', png(192, { padding: 0.12, background: CREAM }))
writeFileSync('public/android-chrome-512x512.png', png(512, { padding: 0.12, background: CREAM }))
const svgRects = rects.map(([x, y, w, h, fill]) => `<rect x="${ox + x}" y="${oy + y}" width="${w}" height="${h}" fill="${fill}"/>`).join('')
writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges">${svgRects}</svg>\n`)
console.log(`icons written from logoCoin (${vw}x${vh}, ${rects.length} rects)`)
