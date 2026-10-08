// Renders the app icons (accent square, bg-coloured Lucide moon) into web/public/icons.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const out = 'web/public/icons';
mkdirSync(out, { recursive: true });
const moon = 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z';
const svg = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#ec3013"/>
  <g transform="translate(${size * pad} ${size * pad}) scale(${(size * (1 - 2 * pad)) / 24})">
    <path d="${moon}" fill="none" stroke="#f3f2f2" stroke-width="2" stroke-linejoin="miter"/>
  </g>
</svg>`;
const jobs = [
  ['icon-192.png', 192, 0.2], ['icon-512.png', 512, 0.2], ['maskable-512.png', 512, 0.28],
  ['apple-touch-icon.png', 180, 0.2], ['favicon-32.png', 32, 0.12],
];
for (const [name, size, pad] of jobs) await sharp(Buffer.from(svg(size, pad))).png().toFile(`${out}/${name}`);
console.log('icons written to', out);
