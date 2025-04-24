const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const sizes = [192, 512]
const svgPath = path.join(__dirname, '../public/icons/icon.svg')
const svgBuffer = fs.readFileSync(svgPath)

async function generateIcons() {
  console.log('Generating icons...')

  for (const size of sizes) {
    const outputPath = path.join(__dirname, `../public/icons/icon-${size}x${size}.png`)

    await sharp(svgBuffer).resize(size, size).png().toFile(outputPath)

    console.log(`Generated ${outputPath}`)
  }

  console.log('All icons generated successfully!')
}

generateIcons().catch((err) => {
  console.error('Error generating icons:', err)
  process.exit(1)
})
