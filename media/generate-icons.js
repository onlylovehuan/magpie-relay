const sharp = require('sharp');
const path = require('path');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="60" fill="#4A90D9"/>
  <circle cx="64" cy="64" r="52" fill="#5BA0E9"/>
  <g fill="#FFFFFF">
    <path d="M75 50 L95 55 L75 60 Z"/>
    <ellipse cx="55" cy="65" rx="30" ry="25"/>
    <path d="M30 55 Q20 70 35 80 L55 70 Z"/>
    <path d="M35 60 Q25 72 40 82 L55 72 Z"/>
    <path d="M25 70 L10 95 L30 85 L25 70"/>
    <path d="M28 72 L15 97 L35 87 L28 72"/>
  </g>
  <circle cx="78" cy="54" r="4" fill="#1a1a1a"/>
  <circle cx="79" cy="53" r="1.5" fill="#FFFFFF"/>
  <g stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" fill="none">
    <path d="M50 88 L50 100"/>
    <path d="M60 88 L60 100"/>
  </g>
  <g stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" fill="none">
    <path d="M50 100 L45 105"/>
    <path d="M50 100 L50 106"/>
    <path d="M50 100 L55 105"/>
    <path d="M60 100 L55 105"/>
    <path d="M60 100 L60 106"/>
    <path d="M60 100 L65 105"/>
  </g>
  <g stroke="#FFD700" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.8">
    <path d="M85 40 L100 40 L100 25 L110 25"/>
    <path d="M85 88 L105 88 L105 100 L115 100"/>
    <circle cx="110" cy="25" r="4" fill="#FFD700"/>
    <circle cx="115" cy="100" r="4" fill="#FFD700"/>
  </g>
</svg>`;

const sizes = [16, 32, 48, 64, 128, 256];

async function generateIcons() {
  // 固定路径
  const mediaDir = path.join('C:', 'Users', 'xinxi-xb', 'Wrench', 'workspace', '2026-10-19-02-55-59', 'magpie-relay', 'media');

  for (const size of sizes) {
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(path.join(mediaDir, `${size}x${size}.png`));
    console.log(`Generated ${size}x${size}.png`);
  }

  await sharp(Buffer.from(svg))
    .resize(128, 128)
    .png()
    .toFile(path.join(mediaDir, 'icon.png'));
  console.log('Generated icon.png');
}

generateIcons().catch(console.error);
