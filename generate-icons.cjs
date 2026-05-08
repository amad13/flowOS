'use strict'
// FlowOS icon generator v2 — exact spec coordinates
const { createCanvas } = require('canvas')
const fs   = require('fs')
const path = require('path')

const PUBLIC = path.resolve(__dirname, 'public')

// ─── Bolt — exact 7 vertices at 1024×1024 ────────────────────────────────────
// SVG path: M 430 195 L 355 435 L 415 435 L 285 820 L 580 470 L 510 470 L 645 195 Z
const BOLT = [
  [430, 195],  // 0 top-left of upper arm
  [355, 435],  // 1 bottom-left of upper arm (left diagonal)
  [415, 435],  // 2 left notch (cuts right — the "bolt indent")
  [285, 820],  // 3 bottom tip (lower arm, far left)
  [580, 470],  // 4 right side of lower arm (going back up)
  [510, 470],  // 5 right notch (cuts left — mirrors left notch)
  [645, 195],  // 6 top-right of upper arm
]
// Closing edge Z: (645,195) → (430,195) = top horizontal edge

// ─── Tiles — exact pixel coordinates at 1024×1024 ────────────────────────────
const TILES = [
  { x: 180, y: 180, w: 310, h: 310, rx: 48, c0: '#C4B5FD', c1: '#7C3AED' },  // TL
  { x: 534, y: 180, w: 310, h: 310, rx: 48, c0: '#A78BFA', c1: '#5B21B6' },  // TR
  { x: 180, y: 534, w: 310, h: 310, rx: 48, c0: '#8B5CF6', c1: '#4C1D95' },  // BL
  { x: 534, y: 534, w: 310, h: 310, rx: 48, c0: '#6D28D9', c1: '#2E1065' },  // BR
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y,     x + w, y + r,     r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x,     y + h, x,     y + h - r, r)
  ctx.lineTo(x,     y + r)
  ctx.arcTo(x,     y,     x + r, y,         r)
  ctx.closePath()
}

function polyPath(ctx, pts, sc, dx, dy) {
  dx = dx || 0; dy = dy || 0
  ctx.beginPath()
  ctx.moveTo(pts[0][0] * sc + dx, pts[0][1] * sc + dy)
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i][0] * sc + dx, pts[i][1] * sc + dy)
  }
  ctx.closePath()
}

// ─── PNG renderer ─────────────────────────────────────────────────────────────
function drawPNG(size) {
  const canvas = createCanvas(size, size)
  const ctx    = canvas.getContext('2d')
  const sc     = size / 1024

  // 1. Background
  const bgR = 230 * sc
  rrPath(ctx, 0, 0, size, size, bgR)
  const bgG = ctx.createLinearGradient(0, 0, size, size)
  bgG.addColorStop(0,   '#2C2C2E')
  bgG.addColorStop(1,   '#1C1C1E')
  ctx.fillStyle = bgG
  ctx.fill()

  // 2. Tiles at 70% opacity
  ctx.save()
  ctx.globalAlpha = 0.70
  for (const t of TILES) {
    const x  = t.x  * sc, y  = t.y  * sc
    const w  = t.w  * sc, h  = t.h  * sc
    const rx = t.rx * sc
    rrPath(ctx, x, y, w, h, rx)
    const g = ctx.createLinearGradient(x, y, x, y + h)
    g.addColorStop(0, t.c0)
    g.addColorStop(1, t.c1)
    ctx.fillStyle = g
    ctx.fill()
  }
  ctx.restore()

  // 3. Bolt drop shadow (+6px, +8px at 1024, scaled)
  ctx.save()
  ctx.globalAlpha = 0.25
  polyPath(ctx, BOLT, sc, 6 * sc, 8 * sc)
  ctx.fillStyle = '#1E0A4E'
  ctx.fill()
  ctx.restore()

  // 4. Bolt main body — gradient: BOLT[0](top-left) → BOLT[3](bottom tip)
  polyPath(ctx, BOLT, sc)
  const bodyG = ctx.createLinearGradient(
    BOLT[0][0] * sc, BOLT[0][1] * sc,
    BOLT[3][0] * sc, BOLT[3][1] * sc
  )
  bodyG.addColorStop(0, '#DDD6FE')
  bodyG.addColorStop(1, '#5B21B6')
  ctx.fillStyle = bodyG
  ctx.fill()

  // 5. Left bright face — triangle: BOLT[0], BOLT[1], BOLT[2]
  ctx.save()
  ctx.globalAlpha = 0.80
  ctx.beginPath()
  ctx.moveTo(BOLT[0][0] * sc, BOLT[0][1] * sc)
  ctx.lineTo(BOLT[1][0] * sc, BOLT[1][1] * sc)
  ctx.lineTo(BOLT[2][0] * sc, BOLT[2][1] * sc)
  ctx.closePath()
  ctx.fillStyle = '#EDE9FE'
  ctx.fill()
  ctx.restore()

  // 6. Right shadow face — strip along upper-arm right edge: BOLT[6] → BOLT[5]
  const f3w = 30 * sc
  ctx.save()
  ctx.globalAlpha = 0.85
  ctx.beginPath()
  ctx.moveTo(BOLT[6][0] * sc - f3w, BOLT[6][1] * sc)
  ctx.lineTo(BOLT[6][0] * sc,       BOLT[6][1] * sc)
  ctx.lineTo(BOLT[5][0] * sc,       BOLT[5][1] * sc)
  ctx.lineTo(BOLT[5][0] * sc - f3w, BOLT[5][1] * sc)
  ctx.closePath()
  ctx.fillStyle = '#2E1065'
  ctx.fill()
  ctx.restore()

  // 7. Highlight line — top edge + left diagonal of bolt
  ctx.save()
  ctx.globalAlpha = 0.45
  ctx.beginPath()
  ctx.moveTo(BOLT[6][0] * sc, BOLT[6][1] * sc)   // top-right
  ctx.lineTo(BOLT[0][0] * sc, BOLT[0][1] * sc)   // top-left
  ctx.lineTo(BOLT[1][0] * sc, BOLT[1][1] * sc)   // down the left diagonal
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth   = 4 * sc
  ctx.lineCap     = 'round'
  ctx.lineJoin    = 'round'
  ctx.stroke()
  ctx.restore()

  return canvas
}

// ─── SVG generator — 1024-unit coordinate space ───────────────────────────────
function generateSVG(displayW, displayH) {
  const B   = BOLT
  const bgR = 230
  const f3w = 30

  const boltPts   = B.map(([x, y]) => `${x},${y}`).join(' ')
  const shadowPts = B.map(([x, y]) => `${x + 6},${y + 8}`).join(' ')
  const f1pts     = `${B[0][0]},${B[0][1]} ${B[1][0]},${B[1][1]} ${B[2][0]},${B[2][1]}`
  const f3pts     = [
    `${B[6][0] - f3w},${B[6][1]}`,
    `${B[6][0]},${B[6][1]}`,
    `${B[5][0]},${B[5][1]}`,
    `${B[5][0] - f3w},${B[5][1]}`,
  ].join(' ')
  const hlPts = `${B[6][0]},${B[6][1]} ${B[0][0]},${B[0][1]} ${B[1][0]},${B[1][1]}`

  const wAttr = displayW != null ? ` width="${displayW}"` : ''
  const hAttr = displayH != null ? ` height="${displayH}"` : ''

  return `<svg xmlns="http://www.w3.org/2000/svg"${wAttr}${hAttr} viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="gbg" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#2C2C2E"/>
      <stop offset="100%" stop-color="#1C1C1E"/>
    </linearGradient>
    ${TILES.map((t, i) => `<linearGradient id="gt${i}" x1="${t.x}" y1="${t.y}" x2="${t.x}" y2="${t.y + t.h}" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="${t.c0}"/>
      <stop offset="100%" stop-color="${t.c1}"/>
    </linearGradient>`).join('\n    ')}
    <linearGradient id="gbolt" x1="${B[0][0]}" y1="${B[0][1]}" x2="${B[3][0]}" y2="${B[3][1]}" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#DDD6FE"/>
      <stop offset="100%" stop-color="#5B21B6"/>
    </linearGradient>
  </defs>

  <!-- 1. Background -->
  <rect x="0" y="0" width="1024" height="1024" rx="${bgR}" ry="${bgR}" fill="url(#gbg)"/>

  <!-- 2. Tiles 70% opacity -->
  ${TILES.map((t, i) => `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="${t.rx}" ry="${t.rx}" fill="url(#gt${i})" opacity="0.70"/>`).join('\n  ')}

  <!-- 3. Drop shadow -->
  <polygon points="${shadowPts}" fill="#1E0A4E" opacity="0.25"/>

  <!-- 4. Bolt body -->
  <polygon points="${boltPts}" fill="url(#gbolt)"/>

  <!-- 5. Left bright face -->
  <polygon points="${f1pts}" fill="#EDE9FE" opacity="0.80"/>

  <!-- 6. Right shadow face -->
  <polygon points="${f3pts}" fill="#2E1065" opacity="0.85"/>

  <!-- 7. Highlight line -->
  <polyline points="${hlPts}" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>
</svg>`
}

// ─── Generate all files ───────────────────────────────────────────────────────
for (const { size, file } of [
  { size: 1024, file: 'icon-1024.png'        },
  { size: 180,  file: 'apple-touch-icon.png' },
]) {
  const buf = drawPNG(size).toBuffer('image/png')
  fs.writeFileSync(path.join(PUBLIC, file), buf)
  console.log(`✓ ${file}  (${size}×${size}px  ${(buf.length / 1024).toFixed(1)} KB)`)
}

fs.writeFileSync(path.join(PUBLIC, 'favicon.svg'), generateSVG(32, 32))
console.log('✓ favicon.svg  (32×32 display, 1024-unit viewBox)')

fs.writeFileSync(path.join(PUBLIC, 'icons.svg'), generateSVG())
console.log('✓ icons.svg  (scalable, no fixed size)')

console.log('\n✅ All icons written to /public/')
