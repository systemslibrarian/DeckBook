/* Generate branded native app icons for the Capacitor Android and iOS projects
 * from the same DeckBook mark used for the PWA icons. Uses the Chromium that
 * Playwright already installs (no native image libraries needed).
 *
 * Run after `npx cap add ...`: node scripts/generate-native-icons.mjs
 * Re-run only when the icon design changes.
 */

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BG = "#11100c";

// Full-bleed mark: a dark card with a golden border, a spade, and "DB".
// Used for the iOS icon and the Android legacy (pre-adaptive) launcher icons.
function cardSvg({ size, pad }) {
  const w = size - pad * 2;
  const r = w * 0.14;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <rect x="${pad}" y="${pad}" width="${w}" height="${w}" rx="${r}" fill="#1b1710" stroke="#e4ba58" stroke-width="${size * 0.02}"/>
  <text x="50%" y="46%" text-anchor="middle" dominant-baseline="central" font-size="${w * 0.5}" fill="#e4ba58" font-family="Georgia, serif">♠</text>
  <text x="50%" y="76%" text-anchor="middle" dominant-baseline="central" font-size="${w * 0.26}" font-weight="700" fill="#f7f0dd" font-family="Georgia, serif">DB</text>
</svg>`;
}

// Adaptive-icon foreground: just the spade + "DB" on a transparent canvas,
// kept within the centre ~55% safe zone so Android's circular/rounded crop
// never clips it. The #11100c background is supplied by the adaptive icon.
function foregroundSvg({ size }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <text x="50%" y="43%" text-anchor="middle" dominant-baseline="central" font-size="${size * 0.32}" fill="#e4ba58" font-family="Georgia, serif">♠</text>
  <text x="50%" y="63%" text-anchor="middle" dominant-baseline="central" font-size="${size * 0.17}" font-weight="700" fill="#f7f0dd" font-family="Georgia, serif">DB</text>
</svg>`;
}

// Android density buckets. Legacy icons are the full mark; foreground icons
// are the transparent adaptive layer (108dp density-scaled).
const android = [
  { dir: "mipmap-mdpi", launcher: 48, foreground: 108 },
  { dir: "mipmap-hdpi", launcher: 72, foreground: 162 },
  { dir: "mipmap-xhdpi", launcher: 96, foreground: 216 },
  { dir: "mipmap-xxhdpi", launcher: 144, foreground: 324 },
  { dir: "mipmap-xxxhdpi", launcher: 192, foreground: 432 },
];

const resDir = join(root, "android/app/src/main/res");
const iosIcon = join(
  root,
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
);

const browser = await chromium.launch();

async function render(svg, size, path, { transparent = false } = {}) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>*{margin:0}</style>${svg}`);
  await page.locator("svg").screenshot({ path, omitBackground: transparent });
  await page.close();
  console.log(`wrote ${path}`);
}

// Android
for (const d of android) {
  const dir = join(resDir, d.dir);
  await mkdir(dir, { recursive: true });
  const card = cardSvg({ size: d.launcher, pad: Math.round(d.launcher * 0.06) });
  await render(card, d.launcher, join(dir, "ic_launcher.png"));
  await render(card, d.launcher, join(dir, "ic_launcher_round.png"));
  await render(foregroundSvg({ size: d.foreground }), d.foreground, join(dir, "ic_launcher_foreground.png"), { transparent: true });
}

// Match the adaptive-icon background to the app's dark theme.
await writeFile(
  join(resDir, "values/ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`,
);
console.log("set adaptive background to " + BG);

// iOS: a single 1024x1024 marketing icon (modern single-size AppIcon).
await render(cardSvg({ size: 1024, pad: 90 }), 1024, iosIcon);

await browser.close();
