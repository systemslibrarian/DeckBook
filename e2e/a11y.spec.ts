import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Accessibility audit with axe-core (the engine behind most a11y tooling).
// We scan the initial page and a couple of interacted states, asserting zero
// WCAG 2.1 A/AA violations. This runs in CI, so regressions fail the build.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// Freeze CSS animations/transitions before auditing. Panels fade in on load
// (opacity 0 -> 1); auditing mid-fade makes axe blend text over the dark body
// and report false low-contrast. Users see the settled, full-opacity state,
// which is what we assert against.
async function settle(page: Page): Promise<void> {
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none !important;transition:none !important;}"
  });
  await page.waitForTimeout(150);
}

test("initial page has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test("expanded reference panels have no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/");
  // Expand every collapsible reference panel so their content is audited too.
  for (const toggle of await page.locator(".collapsible-toggle").all()) {
    await toggle.click();
  }
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test("challenge mode has no WCAG A/AA violations after interaction", async ({ page }) => {
  await page.goto("/");
  await page.locator("#chal-crib").fill("THE");
  await page.locator("#chal-guess-a").fill("MEET");
  await settle(page);
  const results = await new AxeBuilder({ page }).include("#challenge").withTags(TAGS).analyze();
  expect(results.violations).toEqual([]);
});
