import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const url = process.argv[2] ?? "http://localhost:4173";
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(url);
for (const toggle of await page.locator(".collapsible-toggle").all()) {
  await toggle.click();
}
await page.addStyleTag({
  content: "*,*::before,*::after{animation:none !important;transition:none !important;}"
});
await page.waitForTimeout(200);
const results = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
  .analyze();

for (const v of results.violations) {
  console.log(`\n[${v.id}] ${v.help}`);
  for (const node of v.nodes) {
    console.log("  target:", node.target.join(" "));
    const msg = (node.any[0] ?? node.all[0] ?? node.none[0])?.message ?? "";
    console.log("  " + msg.replace(/\s+/g, " ").trim());
  }
}
console.log(`\nTotal violations: ${results.violations.length}`);
await browser.close();
