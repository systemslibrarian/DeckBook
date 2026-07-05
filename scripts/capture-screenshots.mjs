/* Capture README screenshots by driving the built app in Chromium.
 * Usage: start `npm run preview -- --port 4173`, then
 *        node scripts/capture-screenshots.mjs http://localhost:4173
 * Writes PNGs into docs/screenshots/. */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const url = process.argv[2] ?? "http://localhost:4173";
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "screenshots");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1040, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: "reduce"
});
const page = await context.newPage();

async function shot(locator, name) {
  await page.locator(locator).screenshot({ path: join(outDir, name) });
  console.log(`wrote docs/screenshots/${name}`);
}

await page.goto(url, { waitUntil: "networkidle" });

// 1. Watch It Work — step a few letters so a card is face-up with the equation.
await page.locator("#viz-input").fill("THE DECK IS THE KEY");
for (let i = 0; i < 4; i += 1) {
  await page.locator("#viz-step").click();
}
await shot("#visualizer", "visualizer.png");

// 2. Challenge — type a crib and a partial guess to show the reveal + meters.
await page.locator("#chal-crib").fill("THE");
await page.locator("#chal-offset").evaluate((el) => {
  el.value = String(Math.min(6, Number(el.max)));
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.locator("#chal-guess-a").fill("MEETAT");
await shot("#challenge", "challenge.png");

// 3. Attack Lab — generate keys, encrypt two messages with one key, drag a crib.
await page.locator("#generate-book").click();
await page.locator(".key-card").first().waitFor();
await page.locator("#lab-a").fill("ATTACKATDAWNFROMTHEEAST");
await page.locator("#lab-b").fill("DEFENDTHEWESTGATEATNOON");
const key = await page.locator("#lab-key option").nth(1).getAttribute("value");
await page.selectOption("#lab-key", key);
await page.locator("#lab-run").click();
await page.locator("#crib-word").fill("THE");
await shot("#attack-lab", "attack-lab.png");

await browser.close();
