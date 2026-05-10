'use strict'
// FlowOS icon generator v3 — compass rose design
const { createCanvas } = require('canvas')
const fs   = require('fs')
const path = require('path')

const PUBLIC = path.resolve(__dirname, 'public')

// ── colour palette ────────────────────────────────────────────────────────────
const C = {
  bgOuter:      '#222226',
  bgInner:      '#141416',
  bezelOuter:   '#3A3A4A',
  bezelInner:   '#28282E',
  bezelHighlight:'#5B4FA8',
  ringOuter:    '#2E2E3A',
  ringInner:    '#1E1E26',
  tickMajor:    '#7C6FD4',
  tickMinor:    '#4A4466',
  // cardinal bright (N/S/E/W)
  cardBrightL:  '#C4B5FD',   // left face (lit)
  cardBrightR:  '#7C3AED',   // right face (mid)
  cardDark:     '#3B0F8C',   // shadow face
  cardEdge:     '#EDE9FE',   // bright spine
  // intercardinal
  interBrightL: '#A78BFA',
  interBrightR: '#5B21B6',
  interDark:    '#2E1065',
  // inner mini-points
  innerPt:      '#6D28D9',
  innerPtEdge:  '#8B5CF6',
  // pivot
  pivotOuter:   '#2A2A38',
  pivotMid:     '#5B4FA8',
  pivotInner:   '#9B8FD4',
  pivotGlint:   '#FFFFFF',
  // letters
  letN:         '#DDD6FE',
  letE:         '#A78BFA',
  letS:         '#7C3AED',
  letW:         '#C4B5FD',
  // face sheen
  sheen:        'rgba(255,255,255,0.04)',
}

// ── drawing ───────────────────────────────────────────────────────────────────
function drawCompass(ctx, size) {
  const S  = size / 1024
  const cx = size / 2
  const cy = size / 2

  // map 1024-space coords to canvas coords
  const px = v => cx + (v - 512) * S
  const py = v => cy + (v - 512) * S
  const sc = v => v * S

  // ── 1. Background — radial gradient ────────────────────────────────────────
  const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, sc(600))
  bgGrad.addColorStop(0,   C.bgOuter)
  bgGrad.addColorStop(0.5, C.bgOuter)
  bgGrad.addColorStop(1,   C.bgInner)
  const bgR = sc(230)
  roundRect(ctx, 0, 0, size, size, bgR)
  ctx.fillStyle = bgGrad
  ctx.fill()

  // ── 2. Outer bezel ring ─────────────────────────────────────────────────────
  const bezelRo = sc(462), bezelRi = sc(440)
  const bezelGrad = ctx.createRadialGradient(px(420), py(420), sc(100), cx, cy, bezelRo)
  bezelGrad.addColorStop(0,   C.bezelHighlight)
  bezelGrad.addColorStop(0.5, C.bezelOuter)
  bezelGrad.addColorStop(1,   C.bezelInner)
  ctx.beginPath()
  ctx.arc(cx, cy, bezelRo, 0, Math.PI * 2)
  ctx.arc(cx, cy, bezelRi, 0, Math.PI * 2, true)
  ctx.closePath()
  ctx.fillStyle = bezelGrad
  ctx.fill()

  // ── 3. Main face ring ───────────────────────────────────────────────────────
  const faceRo = sc(440), faceRi = sc(340)
  const faceGrad = ctx.createRadialGradient(cx, cy, sc(100), cx, cy, faceRo)
  faceGrad.addColorStop(0,   C.ringOuter)
  faceGrad.addColorStop(1,   C.ringInner)
  ctx.beginPath()
  ctx.arc(cx, cy, faceRo, 0, Math.PI * 2)
  ctx.arc(cx, cy, faceRi, 0, Math.PI * 2, true)
  ctx.closePath()
  ctx.fillStyle = faceGrad
  ctx.fill()

  // ── 4. Highlight arc (top-left quarter of bezel) ────────────────────────────
  ctx.save()
  ctx.globalAlpha = 0.25
  ctx.beginPath()
  ctx.arc(cx, cy, sc(451), Math.PI * 1.25, Math.PI * 1.75)
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth   = sc(4)
  ctx.stroke()
  ctx.restore()

  // ── 5. Inner ring (inside face) ─────────────────────────────────────────────
  ctx.beginPath()
  ctx.arc(cx, cy, sc(342), 0, Math.PI * 2)
  ctx.arc(cx, cy, sc(338), 0, Math.PI * 2, true)
  ctx.closePath()
  ctx.fillStyle = '#5B4FA8'
  ctx.globalAlpha = 0.5
  ctx.fill()
  ctx.globalAlpha = 1

  ctx.beginPath()
  ctx.arc(cx, cy, sc(338), 0, Math.PI * 2)
  ctx.arc(cx, cy, sc(310), 0, Math.PI * 2, true)
  ctx.closePath()
  const innerRingGrad = ctx.createRadialGradient(cx, cy, sc(100), cx, cy, sc(338))
  innerRingGrad.addColorStop(0, '#2A2A38')
  innerRingGrad.addColorStop(1, '#1A1A22')
  ctx.fillStyle = innerRingGrad
  ctx.fill()

  // ── 6. Tick marks ───────────────────────────────────────────────────────────
  for (let i = 0; i < 72; i++) {
    const angle   = (i / 72) * Math.PI * 2 - Math.PI / 2
    const isMajor = i % 9 === 0
    const ro = sc(438), ri = isMajor ? sc(424) : sc(430)
    const lw = isMajor ? sc(3) : sc(1.5)
    ctx.save()
    ctx.globalAlpha = isMajor ? 1 : 0.5
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * ro, cy + Math.sin(angle) * ro)
    ctx.lineTo(cx + Math.cos(angle) * ri, cy + Math.sin(angle) * ri)
    ctx.strokeStyle = isMajor ? C.tickMajor : C.tickMinor
    ctx.lineWidth   = lw
    ctx.stroke()
    ctx.restore()
  }

  // ── 7. Face fill (dark centre) ──────────────────────────────────────────────
  const faceFill = ctx.createRadialGradient(px(440), py(440), 0, cx, cy, sc(310))
  faceFill.addColorStop(0,   '#2A2A36')
  faceFill.addColorStop(0.6, '#1E1E28')
  faceFill.addColorStop(1,   '#16161E')
  ctx.beginPath()
  ctx.arc(cx, cy, sc(310), 0, Math.PI * 2)
  ctx.fillStyle = faceFill
  ctx.fill()

  // ── 8. Face sheen (very subtle top-left glow) ───────────────────────────────
  const sheenGrad = ctx.createRadialGradient(px(380), py(380), 0, cx, cy, sc(310))
  sheenGrad.addColorStop(0,   C.sheen)
  sheenGrad.addColorStop(0.6, 'rgba(255,255,255,0)')
  ctx.beginPath()
  ctx.arc(cx, cy, sc(310), 0, Math.PI * 2)
  ctx.fillStyle = sheenGrad
  ctx.fill()

  // ── 9. Cardinal shadow blobs (subtle, under the needles) ────────────────────
  const cardDirs = [
    { angle: -Math.PI / 2, name: 'N' },
    { angle: 0,            name: 'E' },
    { angle: Math.PI / 2,  name: 'S' },
    { angle: Math.PI,      name: 'W' },
  ]
  ctx.save()
  ctx.globalAlpha = 0.15
  for (const d of cardDirs) {
    const sx = cx + Math.cos(d.angle) * sc(200)
    const sy = cy + Math.sin(d.angle) * sc(200)
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sc(120))
    sg.addColorStop(0,   '#000000')
    sg.addColorStop(1,   'transparent')
    ctx.beginPath()
    ctx.arc(sx, sy, sc(120), 0, Math.PI * 2)
    ctx.fillStyle = sg
    ctx.fill()
  }
  ctx.restore()

  // ── 10. Intercardinal points (NE / SE / SW / NW — shorter) ─────────────────
  const interAngles = [
    -Math.PI / 4,
     Math.PI / 4,
     Math.PI * 3 / 4,
    -Math.PI * 3 / 4,
  ]
  for (const angle of interAngles) {
    drawNeedle(ctx, cx, cy, angle, sc(240), sc(60), sc(16), {
      brightL: C.interBrightL,
      brightR: C.interBrightR,
      dark:    C.interDark,
      edge:    C.cardEdge,
      edgeAlpha: 0.5,
    })
  }

  // ── 11. Cardinal points (N/S/E/W — tall, dominant) ─────────────────────────
  for (const d of cardDirs) {
    drawNeedle(ctx, cx, cy, d.angle, sc(295), sc(70), sc(22), {
      brightL: C.cardBrightL,
      brightR: C.cardBrightR,
      dark:    C.cardDark,
      edge:    C.cardEdge,
      edgeAlpha: 0.9,
    })
  }

  // ── 12. Cardinal spine highlight lines ─────────────────────────────────────
  ctx.save()
  ctx.globalAlpha = 0.6
  for (const d of cardDirs) {
    const tipX = cx + Math.cos(d.angle) * sc(295)
    const tipY = cy + Math.sin(d.angle) * sc(295)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(tipX, tipY)
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth   = sc(1.5)
    ctx.stroke()
  }
  ctx.restore()

  // ── 13. Inner ring separator line ──────────────────────────────────────────
  ctx.save()
  ctx.globalAlpha = 0.35
  ctx.beginPath()
  ctx.arc(cx, cy, sc(72), 0, Math.PI * 2)
  ctx.strokeStyle = C.tickMajor
  ctx.lineWidth   = sc(1.5)
  ctx.stroke()
  ctx.restore()

  // ── 14. Inner mini-points (tiny, 8 of them at 45° steps) ───────────────────
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2
    drawNeedle(ctx, cx, cy, angle, sc(68), sc(20), sc(7), {
      brightL:   C.innerPtEdge,
      brightR:   C.innerPt,
      dark:      '#1A0A3C',
      edge:      '#EDE9FE',
      edgeAlpha: 0.7,
    })
  }

  // ── 15. Centre pivot ────────────────────────────────────────────────────────
  // outer circle
  const pivotRo = sc(28)
  const pivotGrad = ctx.createRadialGradient(px(490), py(490), 0, cx, cy, pivotRo)
  pivotGrad.addColorStop(0,   C.pivotInner)
  pivotGrad.addColorStop(0.5, C.pivotMid)
  pivotGrad.addColorStop(1,   C.pivotOuter)
  ctx.beginPath()
  ctx.arc(cx, cy, pivotRo, 0, Math.PI * 2)
  ctx.fillStyle = pivotGrad
  ctx.fill()

  // ring stroke
  ctx.beginPath()
  ctx.arc(cx, cy, pivotRo, 0, Math.PI * 2)
  ctx.strokeStyle = '#7C6FD4'
  ctx.lineWidth   = sc(2)
  ctx.globalAlpha = 0.8
  ctx.stroke()
  ctx.globalAlpha = 1

  // inner circle
  const pivotInnG = ctx.createRadialGradient(px(500), py(500), 0, cx, cy, sc(12))
  pivotInnG.addColorStop(0,   '#C4B5FD')
  pivotInnG.addColorStop(1,   '#5B21B6')
  ctx.beginPath()
  ctx.arc(cx, cy, sc(12), 0, Math.PI * 2)
  ctx.fillStyle = pivotInnG
  ctx.fill()

  // specular glint
  ctx.save()
  ctx.globalAlpha = 0.8
  ctx.beginPath()
  ctx.arc(px(504), py(504), sc(4), 0, Math.PI * 2)
  ctx.fillStyle = C.pivotGlint
  ctx.fill()
  ctx.restore()

  // ── 16. Letters D M C E (N / E / S / W positions) ──────────────────────────
  const LETTERS = [
    { letter: 'D', angle: -Math.PI / 2, color: C.letN },  // North
    { letter: 'M', angle:  0,           color: C.letE },  // East
    { letter: 'C', angle:  Math.PI / 2, color: C.letS },  // South
    { letter: 'E', angle:  Math.PI,     color: C.letW },  // West
  ]
  const letterR = sc(380)
  const fontSize = sc(52)
  ctx.save()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.font         = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`
  for (const l of LETTERS) {
    const lx = cx + Math.cos(l.angle) * letterR
    const ly = cy + Math.sin(l.angle) * letterR
    ctx.fillStyle   = l.color
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur  = sc(8)
    ctx.fillText(l.letter, lx, ly)
  }
  ctx.shadowBlur = 0
  ctx.restore()
}

// ── needle helper — draws one diamond-faceted compass point ──────────────────
// angle = direction the tip points (radians from centre)
// tipDist = distance from centre to tip
// baseDist = distance from centre to base (negative = behind centre)
// halfW = half-width at widest (the base)
function drawNeedle(ctx, cx, cy, angle, tipDist, baseDist, halfW, colors) {
  const perp = angle + Math.PI / 2
  // key points
  const tipX  = cx + Math.cos(angle) *  tipDist
  const tipY  = cy + Math.sin(angle) *  tipDist
  const baseX = cx - Math.cos(angle) *  baseDist
  const baseY = cy - Math.sin(angle) *  baseDist
  const leftX = baseX + Math.cos(perp) * halfW
  const leftY = baseY + Math.sin(perp) * halfW
  const rightX= baseX - Math.cos(perp) * halfW
  const rightY= baseY - Math.sin(perp) * halfW

  // light source: top-left (angle ≈ -135°)
  const lightAngle = -Math.PI * 3 / 4
  const lightX = Math.cos(lightAngle)
  const lightY = Math.sin(lightAngle)

  // left face normal (roughly perpendicular to tip→left edge)
  const lnx = -(leftY - tipY), lny = (leftX - tipX)
  const llen = Math.sqrt(lnx * lnx + lny * lny) || 1
  const leftDot = Math.max(0, (lnx / llen) * lightX + (lny / llen) * lightY)

  // right face normal
  const rnx = -(tipY - rightY), rny = (tipX - rightX)
  const rlen = Math.sqrt(rnx * rnx + rny * rny) || 1
  const rightDot = Math.max(0, (rnx / rlen) * lightX + (rny / rlen) * lightY)

  // left face (brighter when facing light)
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(leftX, leftY)
  ctx.lineTo(baseX, baseY)
  ctx.closePath()
  ctx.fillStyle = leftDot > 0.3 ? colors.brightL : colors.dark
  ctx.fill()

  // right face
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(rightX, rightY)
  ctx.lineTo(baseX, baseY)
  ctx.closePath()
  ctx.fillStyle = rightDot > 0.3 ? colors.brightR : colors.dark
  ctx.fill()

  // spine edge highlight
  ctx.save()
  ctx.globalAlpha = colors.edgeAlpha
  ctx.beginPath()
  ctx.moveTo(baseX, baseY)
  ctx.lineTo(tipX, tipY)
  ctx.strokeStyle = colors.edge
  ctx.lineWidth   = Math.max(0.5, halfW * 0.12)
  ctx.lineCap     = 'round'
  ctx.stroke()
  ctx.restore()
}

// ── rounded rect path helper ─────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
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

// ── PNG output ───────────────────────────────────────────────────────────────
function generatePNG(size, filename) {
  const canvas = createCanvas(size, size)
  const ctx    = canvas.getContext('2d')
  drawCompass(ctx, size)
  const buf = canvas.toBuffer('image/png')
  fs.writeFileSync(path.join(PUBLIC, filename), buf)
  console.log(`✓ ${filename}  (${size}×${size}px  ${(buf.length / 1024).toFixed(1)} KB)`)
}

// ── SVG output (inline, viewport 1024) ───────────────────────────────────────
function generateSVGFile(displayW, displayH, filename) {
  // render at 1024 on an off-screen canvas, emit as SVG embed via foreignObject fallback
  // Since canvas-based SVG serialisation is lossy, we emit a self-contained SVG that
  // uses the same gradients and paths reconstructed in SVG syntax for the favicon.
  const wAttr = displayW != null ? ` width="${displayW}"` : ''
  const hAttr = displayH != null ? ` height="${displayH}"` : ''

  // Simplified but faithful SVG compass rose at 1024 units
  // Cardinal directions at N/S/E/W with diamond shapes
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"${wAttr}${hAttr} viewBox="0 0 1024 1024">
  <defs>
    <!-- Background radial gradient -->
    <radialGradient id="bg" cx="50%" cy="50%" r="60%">
      <stop offset="0%"   stop-color="${C.bgOuter}"/>
      <stop offset="50%"  stop-color="${C.bgOuter}"/>
      <stop offset="100%" stop-color="${C.bgInner}"/>
    </radialGradient>
    <!-- Bezel gradient -->
    <radialGradient id="bezel" cx="40%" cy="40%" r="70%">
      <stop offset="0%"   stop-color="${C.bezelHighlight}"/>
      <stop offset="50%"  stop-color="${C.bezelOuter}"/>
      <stop offset="100%" stop-color="${C.bezelInner}"/>
    </radialGradient>
    <!-- Face ring gradient -->
    <radialGradient id="face" cx="50%" cy="50%" r="80%">
      <stop offset="0%"   stop-color="${C.ringOuter}"/>
      <stop offset="100%" stop-color="${C.ringInner}"/>
    </radialGradient>
    <!-- Face fill gradient -->
    <radialGradient id="facefill" cx="43%" cy="43%" r="60%">
      <stop offset="0%"   stop-color="#2A2A36"/>
      <stop offset="60%"  stop-color="#1E1E28"/>
      <stop offset="100%" stop-color="#16161E"/>
    </radialGradient>
    <!-- Pivot gradient -->
    <radialGradient id="pivot" cx="43%" cy="43%" r="80%">
      <stop offset="0%"   stop-color="${C.pivotInner}"/>
      <stop offset="50%"  stop-color="${C.pivotMid}"/>
      <stop offset="100%" stop-color="${C.pivotOuter}"/>
    </radialGradient>
    <radialGradient id="pivotInner" cx="40%" cy="40%" r="80%">
      <stop offset="0%"   stop-color="#C4B5FD"/>
      <stop offset="100%" stop-color="#5B21B6"/>
    </radialGradient>
  </defs>

  <!-- 1. Background -->
  <rect x="0" y="0" width="1024" height="1024" rx="230" ry="230" fill="url(#bg)"/>

  <!-- 2. Outer bezel ring -->
  <circle cx="512" cy="512" r="462" fill="url(#bezel)"/>
  <circle cx="512" cy="512" r="440" fill="url(#face)"/>

  <!-- 3. Face dark fill -->
  <circle cx="512" cy="512" r="310" fill="url(#facefill)"/>

  <!-- 4. Inner ring accent -->
  <circle cx="512" cy="512" r="341" fill="none" stroke="#5B4FA8" stroke-width="3" opacity="0.5"/>
  <circle cx="512" cy="512" r="338" fill="#1A1A22"/>

  <!-- 5. Intercardinal points (shorter, NE/SE/SW/NW) -->
  <!-- NE -->
  <polygon points="512,512 694,330 724,360" fill="${C.interBrightL}" opacity="0.9"/>
  <polygon points="512,512 724,360 754,390" fill="${C.interBrightR}"/>
  <!-- SE -->
  <polygon points="512,512 694,694 724,664" fill="${C.interBrightR}"/>
  <polygon points="512,512 724,664 694,694" fill="${C.interDark}"/>
  <polygon points="512,512 330,694 300,664" fill="${C.interBrightL}" opacity="0.9"/>
  <polygon points="512,512 300,664 330,694" fill="${C.interDark}"/>
  <!-- NW -->
  <polygon points="512,512 330,330 300,360" fill="${C.interBrightL}" opacity="0.9"/>
  <polygon points="512,512 300,360 330,330" fill="${C.interDark}"/>

  <!-- 6. Cardinal points — N/S/E/W (taller) -->
  <!-- North: tip at 512,217 base at 512,572 width ±22 at base -->
  <polygon points="512,217 490,582 512,572" fill="${C.cardBrightL}"/>
  <polygon points="512,217 534,582 512,572" fill="${C.cardBrightR}"/>
  <line x1="512" y1="572" x2="512" y2="217" stroke="${C.cardEdge}" stroke-width="2" opacity="0.9"/>

  <!-- South: tip at 512,807 -->
  <polygon points="512,807 490,452 512,462" fill="${C.cardBrightL}"/>
  <polygon points="512,807 534,452 512,462" fill="${C.cardBrightR}"/>
  <line x1="512" y1="462" x2="512" y2="807" stroke="${C.cardEdge}" stroke-width="2" opacity="0.9"/>

  <!-- East: tip at 807,512 -->
  <polygon points="807,512 452,490 462,512" fill="${C.cardBrightL}"/>
  <polygon points="807,512 452,534 462,512" fill="${C.cardDark}"/>
  <line x1="462" y1="512" x2="807" y2="512" stroke="${C.cardEdge}" stroke-width="2" opacity="0.9"/>

  <!-- West: tip at 217,512 -->
  <polygon points="217,512 572,490 562,512" fill="${C.cardBrightL}"/>
  <polygon points="217,512 572,534 562,512" fill="${C.cardBrightR}"/>
  <line x1="562" y1="512" x2="217" y2="512" stroke="${C.cardEdge}" stroke-width="2" opacity="0.9"/>

  <!-- 7. Letters D(N) M(E) C(S) E(W) -->
  <text x="512" y="175" text-anchor="middle" dominant-baseline="middle"
    font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
    font-size="52" font-weight="700" fill="${C.letN}">D</text>
  <text x="853" y="519" text-anchor="middle" dominant-baseline="middle"
    font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
    font-size="52" font-weight="700" fill="${C.letE}">M</text>
  <text x="512" y="856" text-anchor="middle" dominant-baseline="middle"
    font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
    font-size="52" font-weight="700" fill="${C.letS}">C</text>
  <text x="171" y="519" text-anchor="middle" dominant-baseline="middle"
    font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
    font-size="52" font-weight="700" fill="${C.letW}">E</text>

  <!-- 8. Centre pivot -->
  <circle cx="512" cy="512" r="28" fill="url(#pivot)" stroke="#7C6FD4" stroke-width="2" opacity="0.9"/>
  <circle cx="512" cy="512" r="12" fill="url(#pivotInner)"/>
  <circle cx="516" cy="508" r="4"  fill="white" opacity="0.8"/>
</svg>`

  fs.writeFileSync(path.join(PUBLIC, filename), svg)
  console.log(`✓ ${filename}  (SVG)`)
}

// ── Generate all files ────────────────────────────────────────────────────────
generatePNG(1024, 'icon-1024.png')
generatePNG(180,  'apple-touch-icon.png')
generateSVGFile(32, 32, 'favicon.svg')
generateSVGFile(null, null, 'icons.svg')

console.log('\n✅ All icons written to /public/')
