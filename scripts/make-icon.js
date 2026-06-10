// Converts the source JPG into a multi-resolution Windows .ico for the app icon.
// Pure JS (jimp + png-to-ico) so it needs no ImageMagick or native toolchain.
//
//   node scripts/make-icon.js
//
// Output: build/icon.ico  (referenced by electron-builder's "build.win.icon")

const fs = require('fs')
const path = require('path')
const Jimp = require('jimp')
const pngToIco = require('png-to-ico')

const SOURCE = path.join(__dirname, '..', 'Icon for fitcoach.jpg')
const OUT_DIR = path.join(__dirname, '..', 'build')
const OUT_ICO = path.join(OUT_DIR, 'icon.ico')

// Sizes Windows actually uses across the taskbar, Explorer, and Alt-Tab.
const SIZES = [256, 128, 64, 48, 32, 16]

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Source icon not found: ${SOURCE}`)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const image = await Jimp.read(SOURCE)

  // Crop to a centred square first so non-square sources are not distorted,
  // then render one PNG buffer per target size.
  const side = Math.min(image.bitmap.width, image.bitmap.height)
  image.cover(side, side)

  const pngBuffers = await Promise.all(
    SIZES.map((size) =>
      image
        .clone()
        .resize(size, size, Jimp.RESIZE_BICUBIC)
        .getBufferAsync(Jimp.MIME_PNG)
    )
  )

  const ico = await pngToIco(pngBuffers)
  fs.writeFileSync(OUT_ICO, ico)

  console.log(`Wrote ${OUT_ICO} (${SIZES.join(', ')} px, ${ico.length} bytes)`)
}

main().catch((err) => {
  console.error('Icon generation failed:', err)
  process.exit(1)
})
