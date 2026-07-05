import { expect, test } from "@playwright/test";

// End-to-end smoke coverage that drives the real UI (not the pure-function
// unit suite). The headline test walks the full protocol: generate a
// DeckBook, encrypt a message, follow the share link the app produces, and
// decrypt it back to the original plaintext.

const PLAINTEXT = "MEETMEATDAWN";

async function generateDeckBook(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.locator("#generate-book").click();
  // A shuffle overlay plays briefly, then keys render. Wait it out.
  await page.locator(".shuffle-overlay").waitFor({ state: "detached" }).catch(() => {});
  await expect(page.locator(".key-card").first()).toBeVisible();
}

test("generate -> encrypt -> share link -> decrypt round-trips", async ({ page }) => {
  await generateDeckBook(page);

  // Encrypt with the first available unused key.
  await page.locator("#encrypt-input").fill(PLAINTEXT);
  const keyValue = await page.locator("#encrypt-key option").nth(1).getAttribute("value");
  expect(keyValue).toBeTruthy();
  await page.selectOption("#encrypt-key", keyValue!);
  await page.locator("#encrypt-button").click();

  const output = page.locator("#encrypt-panel .output");
  await expect(output).toContainText("Ciphertext:");

  // The share link is embedded in the QR <img data-qr="..."> — it carries
  // only the index code + ciphertext, never the deck order.
  const shareUrl = await output.locator("img[data-qr]").getAttribute("data-qr");
  expect(shareUrl).toContain("#m=");

  // Follow the link in the SAME browser context, so the DeckBook is still in
  // localStorage and decryption can succeed. Hop through about:blank first so
  // the target is a full document load (a bare hash change would not re-run
  // the app's bootstrap that parses the share fragment).
  await page.goto("about:blank");
  await page.goto(shareUrl!);

  await expect(page.locator("#decrypt-panel .incoming-banner")).toBeVisible();
  await expect(page.locator("#decrypt-index")).toHaveValue(keyValue!);
  await expect(page.locator("#decrypt-cipher")).not.toHaveValue("");

  await page.locator("#decrypt-button").click();
  await expect(page.locator("#decrypt-panel .output")).toContainText(PLAINTEXT);
});

test("a device without the DeckBook cannot read a share link", async ({ browser }) => {
  // First context: generate and produce a share link.
  const sender = await browser.newContext();
  const senderPage = await sender.newPage();
  await generateDeckBook(senderPage);
  await senderPage.locator("#encrypt-input").fill(PLAINTEXT);
  const keyValue = await senderPage.locator("#encrypt-key option").nth(1).getAttribute("value");
  await senderPage.selectOption("#encrypt-key", keyValue!);
  await senderPage.locator("#encrypt-button").click();
  const shareUrl = await senderPage
    .locator("#encrypt-panel .output img[data-qr]")
    .getAttribute("data-qr");
  await sender.close();

  // Second, fresh context (a different device) has no DeckBook. The link
  // prefills the Decrypt panel and flags it, but with no DeckBook present the
  // Decrypt button is disabled — the deck order never travelled, so this
  // device simply cannot read the message.
  const receiver = await browser.newContext();
  const receiverPage = await receiver.newPage();
  await receiverPage.goto(shareUrl!);
  await expect(receiverPage.locator("#decrypt-panel .incoming-banner")).toBeVisible();
  await expect(receiverPage.locator("#decrypt-index")).not.toHaveValue("");
  await expect(receiverPage.locator("#decrypt-button")).toBeDisabled();
  await expect(receiverPage.locator("#decrypt-panel .output")).toHaveCount(0);
  await receiver.close();
});

test("reference panels start collapsed and expand on click", async ({ page }) => {
  await page.goto("/");

  const about = page.locator("#about-copy");
  const body = page.locator("#about-copy-body");
  const toggle = about.locator(".collapsible-toggle");

  // Collapsed by default: the body is hidden and the toggle reports it.
  await expect(about).toHaveClass(/is-collapsed/);
  await expect(body).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // Expands on click.
  await toggle.click();
  await expect(about).not.toHaveClass(/is-collapsed/);
  await expect(body).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  // The hero "at a glance" facts are collapsed by default too.
  await expect(page.locator(".hero-facts .badge-grid")).toBeHidden();
});

test("Challenge mode reaches a win state when both messages are recovered", async ({ page }) => {
  await page.goto("/");

  const challenge = page.locator("#challenge");
  await expect(challenge).toBeVisible();
  // Default puzzle is "dockside": MEETATTHEHARBOR / BRINGTHELANTERN.
  await page.selectOption("#chal-puzzle", "dockside");

  await page.locator("#chal-guess-a").fill("MEETATTHEHARBOR");
  await page.locator("#chal-guess-b").fill("BRINGTHELANTERN");

  await expect(challenge.locator(".chal-win")).toBeVisible();
  await expect(challenge.locator(".chal-win")).toContainText("Cracked it");
});

test("Watch It Work steps through the cipher one card at a time", async ({ page }) => {
  await page.goto("/");
  const viz = page.locator("#visualizer");
  await expect(viz).toBeVisible();

  await page.locator("#viz-input").fill("DECK");
  await page.locator("#viz-step").click();

  // After one step a card has flipped face-up and the equation tiles appear.
  await expect(viz.locator(".viz-card.flipped")).toBeVisible();
  await expect(viz.locator(".viz-tile.cipher .viz-tile-letter")).toBeVisible();
});
