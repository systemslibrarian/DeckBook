# DeckBook

A card-based one-time keybook demo for teaching key distribution, one-time pads, stream ciphers, and the danger of key reuse.

DeckBook is an educational exhibit-style web app (Cipher Museum theme) that models this core idea:

**The deck order is the key. The clue only tells you which key to use.**

## Inspiration

This project is inspired by Solitaire-style manual encryption teaching material, including:

- https://steemit.com/steemiteducation/@shai-hulud/solitaire-encryption-low-tech-high-security-a-how-to

## Disclaimer

DeckBook is an educational demonstration, not production cryptography.

- Do not use this app to protect real secrets.
- Use modern, audited cryptographic tools for real security.

## What It Teaches

- One-time key material and key identifiers
- Why key reuse fails
- Why key distribution is hard
- Manual/physical keybook operational risks
- Why modern key exchange exists (including post-quantum KEM context)

## How the Cipher Works

The cipher is a Vigenere-style add/subtract over the 26 letters A–Z. The
twist is that the keystream comes from a shuffled deck of cards.

1. **Letters become numbers.** `A = 0, B = 1, …, Z = 25`. Spaces, digits,
   and punctuation are stripped before encryption.
2. **Cards become a keystream.** Each card has a stable value `0..51`
   (Ace of Spades = 0, King of Clubs = 51). Each card contributes one
   keystream letter:

   ```
   keystream[i] = deck[i].value mod 26
   ```

   One card per letter, so a full deck produces 52 keystream letters and
   a single deck key can encrypt at most 52 letters. Each of the 26
   alphabet letters is hit by exactly two card values, so the keystream
   is uniformly distributed.
3. **Encrypt by adding mod 26, decrypt by subtracting.**

   ```
   cipher[i] = ( plain[i]  + keystream[i] ) mod 26
   plain[i]  = ( cipher[i] - keystream[i] + 26 ) mod 26
   ```

For messages longer than 52 letters, Advanced multi-deck mode consumes
additional fresh decks in sequence (letters 0–51 use the first deck,
52–103 the second, and so on). Each deck is used exactly once.

Both sides must already hold the same private DeckBook. Only the index
code (a public label like `LANTERN-42`) and the ciphertext travel over
the public channel. The deck order itself is the secret.

## Feature Highlights

### Interactive learning

- **Watch It Work** — an animated visualizer that runs the cipher one card at
  a time. A card flips off the deck, becomes a keystream number, and shifts one
  letter of your message, with play / pause / step / speed controls. It is a
  sandbox and never consumes real keys.
- **Live letter-frequency histograms** — as you type in the Encrypt panel, two
  bar charts update in real time: your plaintext (spiky, with typical-English
  ghost bars) vs. your ciphertext (flat). The "no favorite letters" lesson,
  visible instantly.
- **Key Reuse Attack Lab with crib dragging** — encrypt two messages with the
  same key, then crack them by hand. Type a guessed word ("crib"), slide it
  along the ciphertext difference, and watch the other message leak out where
  your guess is right. Ranked "most English-looking positions" hints included.
  No key or deck order ever enters the attack — reuse alone leaks the plaintext.
- **QR / share-link handoff** — every encrypted message produces a QR code and a
  deep link carrying only the index code and ciphertext (never the deck order).
  Scan it on another device; that device decrypts only if it already holds the
  matching DeckBook. A real message crossing a real public channel.
- **Printable physical deck sheet** — a print stylesheet outputs the deck order
  as a clean sheet so you can arrange a real deck and verify a letter by hand.

### Make it an experience

- **Challenge mode ("Eve's Intercept")** — a shareable, deep-linkable CTF-style
  puzzle. An operator reused one key for two messages; you play the
  eavesdropper and recover both using crib dragging alone, with a live progress
  meter and a confetti win state. Three puzzles from easy to hard; share a
  specific one with `#play=<id>`.
- **Story framing** — a running Alice → Bob mission with Eve on the wire ties
  the steps, the simulator, and the challenge into one narrative.
- **Installable, offline-capable PWA** — a web manifest and service worker make
  DeckBook installable on a phone or museum kiosk and fully usable with no
  network. Open Graph / Twitter cards give shared links a polished preview.

### For educators

- A ready-to-run [teaching guide](docs/teaching-guide.md) (objectives, a timed
  45–60 min lesson mapped to the app, discussion questions, assessment,
  standards tie-ins) and a printable [student worksheet](docs/worksheet.md).
- An in-app **For Educators** panel and a **Glossary** of every key term.

### Guided, uncluttered layout

- **Numbered step flow** — the core send/receive path is labelled 1–5
  (Generate → Pick a key → Prepare the deck → Encrypt → Decrypt) with a compact
  overview in the hero, so the sequence is obvious at a glance.
- **Collapsible reference sections** — the expository panels (How the Cipher
  Works, Security Model, What is DeckBook?, and the rest) start collapsed as
  keyboard-operable disclosures, keeping the page short; the guided walkthrough
  and presenter mode auto-expand whatever they navigate to.

### Core cipher and key management

- Secure deck generation using `crypto.getRandomValues()` (no `Math.random()`)
- Fisher-Yates shuffle with rejection sampling for unbiased integer selection
- 52-card deck model with consistent 0-51 mapping
- DeckBook modes: 10 / 100 / 1,000 keys
- Human-readable index codes and SHA-256-derived fingerprints
- Receiver setup view with top-to-bottom checklist
- A-Z modular encryption/decryption
- Multi-deck message mode for long plaintexts
- Two-Party Simulator (Alice / public channel / Bob)
- Used/unused key tracking and explicit reuse warnings
- Import/export DeckBook JSON (for educational simulation)
- Local persistence in browser storage
- Mistake simulator panel
- Mobile-responsive layout and accessibility improvements

## Tech Stack

- Vite
- TypeScript
- Vanilla CSS
- Fully client-side (no backend)

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Run development server

```bash
npm run dev
```

### 3. Build for production

```bash
npm run build
```

### 4. Preview production build locally

```bash
npm run preview
```

## Testing

- **Unit tests (Vitest)** cover the pure cipher, attack-analysis, share-link,
  and card-face modules:

  ```bash
  npm test
  ```

- **End-to-end tests (Playwright)** drive the real UI through the full
  protocol — generate a DeckBook, encrypt, follow the share link, and decrypt
  back to the original plaintext — plus the "a device without the DeckBook
  cannot read the message" case and the animated visualizer:

  ```bash
  npm run test:e2e
  ```

Both suites run automatically on every push and pull request via
[ci.yml](.github/workflows/ci.yml).

## GitHub Pages Deployment

This repo includes a Pages workflow at [deploy-pages.yml](.github/workflows/deploy-pages.yml).

### One-time repository settings

1. Open repository Settings.
2. Go to Pages.
3. Set Source to GitHub Actions.

### Publish flow

- Push to `main`.
- Workflow builds the app and deploys `dist/` to GitHub Pages.

## Accessibility and Mobile Notes

The UI is designed to be usable on small screens and with keyboard navigation.

- Semantic sections and clear labels
- Text-based USED/UNUSED state indicators (not color-only)
- High contrast dark theme with amber accents
- Responsive card/grid layouts
- Touch-friendly controls and compact mobile behavior
- Reduced-motion support via `prefers-reduced-motion`

## Security Model (Educational)

The model demonstrates security only when:

1. Deck orders are generated with cryptographic randomness.
2. Both parties share the same private DeckBook beforehand.
3. Each deck key is used once.
4. Used keys are never reused.
5. Deck order is never transmitted publicly.
6. Index code does not reveal deck order.
7. Human error and message-length constraints are handled carefully.

## Project Structure

- [index.html](index.html) app shell
- [src/cipher.ts](src/cipher.ts) pure cipher core (encrypt/decrypt, deck, shuffle)
- [src/analysis.ts](src/analysis.ts) pure attack/analysis math (crib dragging, frequencies)
- [src/share.ts](src/share.ts) pure share-link encode/decode (QR payload)
- [src/qr.ts](src/qr.ts) QR image hydration helper
- [src/visualizer.ts](src/visualizer.ts) animated "Watch It Work" panel
- [src/main.ts](src/main.ts) app logic and UI rendering
- [src/styles.css](src/styles.css) visual design and responsive styles
- [src/challenge.ts](src/challenge.ts) "Eve's Intercept" CTF puzzle module
- [docs/](docs/) teaching guide and student worksheet
- [scripts/generate-icons.mjs](scripts/generate-icons.mjs) PWA/social icon generator
- [tests/](tests/) Vitest unit tests for cipher, analysis, share, card-face, and challenge modules
- [e2e/](e2e/) Playwright end-to-end smoke tests
- [vite.config.ts](vite.config.ts) Vite + Vitest config for static deployment
- [playwright.config.ts](playwright.config.ts) Playwright config (starts the dev server)
- [ci.yml](.github/workflows/ci.yml) build + unit + e2e test workflow
- [deploy-pages.yml](.github/workflows/deploy-pages.yml) GitHub Pages deployment workflow

## License

MIT