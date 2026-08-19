import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgPath = 'public/assets/logo.svg';
const outputDir = 'public/icons';

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const sizes = [16, 32, 48, 128];

async function generate() {
  const svgBuffer = fs.readFileSync(svgPath);
  
  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon-${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Generated ${outputPath} (${size}x${size})`);
  }
  console.log('All icons generated successfully!');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
