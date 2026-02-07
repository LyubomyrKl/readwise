#!/usr/bin/env node

/**
 * Generate PWA icons from SVG
 *
 * Run: node scripts/generate-icons.js
 *
 * Requires: npm install sharp
 */

const fs = require('fs');
const path = require('path');

async function generateIcons() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.log('sharp not installed. Install it with: npm install sharp -D');
    console.log('\nAlternatively, manually create these PNG files:');
    console.log('  - public/icons/icon-192.png (192x192)');
    console.log('  - public/icons/icon-512.png (512x512)');
    console.log('  - public/icons/apple-touch-icon.png (180x180)');
    console.log('\nYou can use https://realfavicongenerator.net/ or convert the SVG at:');
    console.log('  public/icons/icon.svg');
    process.exit(1);
  }

  const svgPath = path.join(__dirname, '../public/icons/icon.svg');
  const iconsDir = path.join(__dirname, '../public/icons');

  const sizes = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];

  for (const { name, size } of sizes) {
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsDir, name));
    console.log(`Generated ${name}`);
  }

  // Also generate favicon.ico
  await sharp(svgPath)
    .resize(32, 32)
    .png()
    .toFile(path.join(__dirname, '../public/favicon.png'));
  console.log('Generated favicon.png');

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
