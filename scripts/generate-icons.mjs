/* Generate PWA/social PNG icons from an inline SVG using the Chromium that
 * Playwright already installs. Run: node scripts/generate-icons.mjs
 * Outputs into public/. Re-run only when the icon design changes. */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

// The DeckBook mark: a dark card with a golden border, a spade, and "DB".
// `pad` controls the safe area — maskable icons need generous padding so the
// mark survives the platform's circular/rounded crop.
function iconSvg({ size, pad, background }) {
  const cardX = pad;
  const cardY = pad;
  const cardW = size - pad * 2;
  const cardH = size - pad * 2;
  const r = cardW * 0.14;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${background}"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${r}" fill="#1b1710" stroke="#e4ba58" stroke-width="${size * 0.02}"/>
  <text x="50%" y="46%" text-anchor="middle" dominant-baseline="central" font-size="${cardW * 0.5}" fill="#e4ba58" font-family="Georgia, serif">♠</text>
  <text x="50%" y="76%" text-anchor="middle" dominant-baseline="central" font-size="${cardW * 0.26}" font-weight="700" fill="#f7f0dd" font-family="Georgia, serif">DB</text>
</svg>`;
}

const targets = [
  { name: "pwa-192.png", size: 192, pad: 10, background: "#11100c" },
  { name: "pwa-512.png", size: 512, pad: 26, background: "#11100c" },
  { name: "maskable-512.png", size: 512, pad: 80, background: "#11100c" },
  { name: "apple-touch-icon.png", size: 180, pad: 0, background: "#11100c" },
  { name: "og-image.png", size: 1200, pad: 0, background: "#11100c", wide: true }
];

const browser = await chromium.launch();
await mkdir(publicDir, { recursive: true });

for (const target of targets) {
  const page = await browser.newPage();
  if (target.wide) {
    // Social card: 1200x630 with the mark and a title.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <rect width="1200" height="630" fill="#11100c"/>
      <rect x="70" y="150" width="240" height="330" rx="30" fill="#1b1710" stroke="#e4ba58" stroke-width="8"/>
      <text x="190" y="290" text-anchor="middle" dominant-baseline="central" font-size="150" fill="#e4ba58" font-family="Georgia, serif">♠</text>
      <text x="190" y="410" text-anchor="middle" dominant-baseline="central" font-size="80" font-weight="700" fill="#f7f0dd" font-family="Georgia, serif">DB</text>
      <text x="380" y="270" font-size="86" font-weight="700" fill="#f3d58e" font-family="Georgia, serif">DeckBook</text>
      <text x="384" y="340" font-size="38" fill="#ebdcb5" font-family="Georgia, serif">The deck order is the key.</text>
      <text x="384" y="392" font-size="30" fill="#c7b68f" font-family="Georgia, serif">A card-based cipher museum: one-time keys, reuse attacks,</text>
      <text x="384" y="432" font-size="30" fill="#c7b68f" font-family="Georgia, serif">and why key distribution is hard.</text>
    </svg>`;
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.setContent(`<style>*{margin:0}</style>${svg}`);
  } else {
    const svg = iconSvg(target);
    await page.setViewportSize({ width: target.size, height: target.size });
    await page.setContent(`<style>*{margin:0}</style>${svg}`);
  }
  await page.locator("svg").screenshot({ path: join(publicDir, target.name), omitBackground: false });
  await page.close();
  console.log(`wrote public/${target.name}`);
}

await browser.close();
