// Generates apple-touch-icon.png (180x180) and icon-1024.png (1024x1024)
// Original bolt path preserved exactly. Only background and lighting changed.
// Run: node scripts/generate-icons.mjs

import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dir, '..', 'public')

// Master icon: viewBox matches original bolt (0 0 48 48, bolt is 48×46 centered with translate 0,1)
// We render at 1024×1024 — sharp scales SVG via viewBox.
const masterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="1024" height="1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="65%">
      <stop offset="0%" stop-color="#211F35"/>
      <stop offset="100%" stop-color="#161525"/>
    </radialGradient>

    <linearGradient id="boltFill" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#8B5CF6"/>
      <stop offset="38%"  stop-color="#5B21B6"/>
      <stop offset="100%" stop-color="#2D1B69"/>
    </linearGradient>

    <linearGradient id="hlStroke" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#A78BFA" stop-opacity="0.95"/>
      <stop offset="45%"  stop-color="#7C3AED" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#7C3AED" stop-opacity="0"/>
    </linearGradient>

    <filter id="innerGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur"/>
      <feColorMatrix in="blur" type="matrix"
        values="0.3 0 0.4 0 0.07   0 0 0.2 0 0   0.6 0 0.8 0 0.22   0 0 0 7 -2"
        result="glow"/>
      <feMerge>
        <feMergeNode in="glow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <filter id="dropShadow">
      <feDropShadow dx="0.5" dy="1.5" stdDeviation="1.5"
        flood-color="#09071A" flood-opacity="0.85"/>
    </filter>

    <clipPath id="tlHalf">
      <polygon points="0,0 48,0 0,48"/>
    </clipPath>
  </defs>

  <rect width="48" height="48" rx="10.5" ry="10.5" fill="url(#bg)"/>
  <rect x="0.6" y="0.6" width="46.8" height="46.8" rx="10" ry="10" fill="none"
    stroke="#FFFFFF" stroke-opacity="0.05" stroke-width="1"/>

  <g transform="translate(0,1)">
    <g filter="url(#dropShadow)">
      <path d="M25.842 44.938c-.664.844-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.183c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.498 0-3.579-1.842-3.579H1.133c-.92 0-1.456-1.04-.92-1.787L9.91.473c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.578 1.842 3.578h11.377c.943 0 1.473 1.088.89 1.832L25.843 44.94z" fill="#07051A" opacity="0.7"/>
    </g>

    <g filter="url(#innerGlow)">
      <path d="M25.842 44.938c-.664.844-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.183c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.498 0-3.579-1.842-3.579H1.133c-.92 0-1.456-1.04-.92-1.787L9.91.473c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.578 1.842 3.578h11.377c.943 0 1.473 1.088.89 1.832L25.843 44.94z" fill="url(#boltFill)"/>
    </g>

    <g clip-path="url(#tlHalf)">
      <path d="M25.842 44.938c-.664.844-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.183c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.498 0-3.579-1.842-3.579H1.133c-.92 0-1.456-1.04-.92-1.787L9.91.473c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.578 1.842 3.578h11.377c.943 0 1.473 1.088.89 1.832L25.843 44.94z" fill="none" stroke="url(#hlStroke)" stroke-width="1.1"/>
    </g>
  </g>
</svg>`

async function gen(svgStr, outPath, size) {
  const buf = Buffer.from(svgStr)
  await sharp(buf, { density: 300 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(outPath)
  console.log(`wrote ${outPath} (${size}x${size})`)
}

await gen(masterSvg, join(publicDir, 'icon-1024.png'), 1024)
await gen(masterSvg, join(publicDir, 'apple-touch-icon.png'), 180)

console.log('done')
