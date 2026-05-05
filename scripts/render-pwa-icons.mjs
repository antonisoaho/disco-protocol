/**
 * Rasterize public/favicon.svg → public/pwa-192.png and pwa-512.png.
 * Uses sharp (librsvg) for consistent output; run after editing the SVG.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svgPath = join(root, 'public', 'favicon.svg')
const svg = readFileSync(svgPath)

for (const size of [192, 512]) {
  await sharp(svg, { density: 512 })
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(join(root, 'public', `pwa-${size}.png`))
}

console.log('Wrote public/pwa-192.png and public/pwa-512.png from favicon.svg')
