/* Generate Google Play store assets for DeckBook:
 *   - app icon (512x512)
 *   - feature graphic (1024x500)
 *   - phone screenshots (1080x1920, Play-compliant aspect ratio)
 *
 * Screenshots drive the real built app in a phone-sized Chromium viewport, so
 * they show the true mobile layout at exact store dimensions (unlike raw device
 * captures, whose 1080x2340 ratio exceeds Play's 2:1 max-side limit).
 *
 * Usage: start the built app, then pass its URL:
 *   npm run preview -- --port 4173 &
 *   node scripts/store-assets.mjs http://localhost:4173
 */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const url = process.argv[2] ?? "http://localhost:4173";
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "play-store", "assets");
await mkdir(outDir, { recursive: true });

const BG = "#11100c";
const browser = await chromium.launch();

// --- Static graphics (rendered from SVG) -----------------------------------
async function renderSvg(svg, width, height, name) {
  const page = await browser.newPage();
  await page.setViewportSize({ width, height });
  await page.setContent(`<style>*{margin:0}</style>${svg}`);
  await page.locator("svg").screenshot({ path: join(outDir, name) });
  await page.close();
  console.log(`wrote ${name} (${width}x${height})`);
}

// App icon: the DeckBook card mark, full-bleed square.
const s = 512;
const pad = 40;
const w = s - pad * 2;
await renderSvg(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <rect width="${s}" height="${s}" fill="${BG}"/>
    <rect x="${pad}" y="${pad}" width="${w}" height="${w}" rx="${w * 0.14}" fill="#1b1710" stroke="#e4ba58" stroke-width="${s * 0.02}"/>
    <text x="50%" y="46%" text-anchor="middle" dominant-baseline="central" font-size="${w * 0.5}" fill="#e4ba58" font-family="Georgia, serif">♠</text>
    <text x="50%" y="76%" text-anchor="middle" dominant-baseline="central" font-size="${w * 0.26}" font-weight="700" fill="#f7f0dd" font-family="Georgia, serif">DB</text>
  </svg>`,
  512, 512, "icon-512.png",
);

// Feature graphic: mark on the left, title + tagline on the right.
await renderSvg(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
    <rect width="1024" height="500" fill="${BG}"/>
    <rect width="1024" height="500" fill="url(#g)"/>
    <defs><radialGradient id="g" cx="18%" cy="30%" r="90%">
      <stop offset="0%" stop-color="#1c1810"/><stop offset="100%" stop-color="#0e0d09"/>
    </radialGradient></defs>
    <rect x="70" y="120" width="200" height="270" rx="26" fill="#1b1710" stroke="#e4ba58" stroke-width="7"/>
    <text x="170" y="245" text-anchor="middle" dominant-baseline="central" font-size="120" fill="#e4ba58" font-family="Georgia, serif">♠</text>
    <text x="170" y="345" text-anchor="middle" dominant-baseline="central" font-size="64" font-weight="700" fill="#f7f0dd" font-family="Georgia, serif">DB</text>
    <text x="330" y="205" font-size="82" font-weight="700" fill="#f3d58e" font-family="Georgia, serif">DeckBook</text>
    <text x="334" y="275" font-size="34" fill="#ebdcb5" font-family="Georgia, serif">The deck order is the key.</text>
    <text x="334" y="330" font-size="27" fill="#c7b68f" font-family="Georgia, serif">A card-based cipher museum: one-time keys,</text>
    <text x="334" y="368" font-size="27" fill="#c7b68f" font-family="Georgia, serif">key-reuse attacks, and why key distribution is hard.</text>
  </svg>`,
  1024, 500, "feature-graphic.png",
);

// --- Phone screenshots (drive the real app) --------------------------------
// 360x640 CSS px at deviceScaleFactor 3 -> exactly 1080x1920 output.
const context = await browser.newContext({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
const page = await context.newPage();

async function shot(name) {
  await page.screenshot({ path: join(outDir, name) });
  console.log(`wrote ${name} (1080x1920)`);
}

// Make the app boot as the native shell (Capacitor) so the screenshots match
// the installed app: the hamburger bar renders, and the marketing hero and
// Quick Start are hidden so it opens on the teaching content.
await page.addInitScript(() => {
  window.Capacitor = { isNativePlatform: () => true };
});
await page.goto(url, { waitUntil: "networkidle" });

// The native app is menu-driven (one screen per destination), so switch views
// through the hamburger menu the way a user would.
async function goView(key) {
  await page.locator(".app-nav-toggle").click();
  await page.locator(`.app-nav-item[data-view="${key}"]`).click();
  await page.waitForTimeout(250);
}

// 1. How the Cipher Works — the default screen.
await shot("screenshot-1-how-it-works.png");

// 2. Watch It Work — step a few letters so a card is face-up.
await goView("visualizer");
await page.locator("#viz-input").fill("THE DECK IS THE KEY");
for (let i = 0; i < 4; i += 1) await page.locator("#viz-step").click();
await shot("screenshot-2-visualizer.png");

// 3. Key Reuse Attack Lab — generate keys first (Generate screen), then run the
//    attack with two messages under one key.
await goView("keys");
await page.locator("#generate-book").click();
await page.locator(".key-card").first().waitFor();
await goView("attack");
await page.locator("#lab-a").fill("ATTACKATDAWNFROMTHEEAST");
await page.locator("#lab-b").fill("DEFENDTHEWESTGATEATNOON");
const key = await page.locator("#lab-key option").nth(1).getAttribute("value");
await page.selectOption("#lab-key", key);
await page.locator("#lab-run").click();
await page.locator("#crib-word").fill("THE");
await shot("screenshot-3-attack-lab.png");

// 4. Challenge — crib + partial guess showing the reveal.
await goView("challenge");
await page.locator("#chal-crib").fill("THE");
await page.locator("#chal-guess-a").fill("MEETAT");
await shot("screenshot-4-challenge.png");

await browser.close();
console.log("\nStore assets written to docs/play-store/assets/");
