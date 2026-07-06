# Google Play — Store Listing Copy

Paste these into **Play Console → Grow → Store presence → Main store listing**.
Character limits are noted; the values below are within them.

## App name (max 30)

```
DeckBook: Cipher Museum
```

## Short description (max 80)

```
Learn one-time pads, key reuse, and stream ciphers with a deck of cards.
```

## Full description (max 4000)

```
DeckBook is an interactive "cipher museum" that teaches how real encryption
keys work — using nothing but a deck of playing cards.

The big idea: the DECK ORDER is the key. A short clue only tells your partner
which key to use; it never reveals the key itself. From that one idea, DeckBook
builds up the concepts behind modern cryptography and lets you see — and break —
them for yourself.

WHAT YOU'LL EXPLORE

• Watch It Work — Step through the cipher one card at a time. See each letter
  turn into a number, add the card's value, and wrap around mod 26. The math is
  shown on every step, so nothing is a black box.

• Key distribution — Understand why the hard part of secrecy isn't scrambling a
  message, but getting the key to the right person without an eavesdropper.

• One-time keys & key identifiers — Learn why a key used once is unbreakable,
  and how a short "index code" can safely point to which key to use.

• Key Reuse Attack Lab — Encrypt two messages with the SAME key, then drag a
  crib to recover both plaintexts. This is the classic reason you must never
  reuse a one-time key — and here you get to run the attack yourself.

• Eve's Intercept challenge — A built-in puzzle: you're the codebreaker on the
  wire. Recover the hidden messages using only the ciphertext and your wits.

BUILT FOR LEARNING

• Clear, step-by-step visualizations with the real cipher math on screen.
• Works fully offline — no account, no sign-in, no internet required.
• Fast, lightweight, and private: nothing you type ever leaves your device.
• Designed for accessibility: full screen-reader labelling, keyboard-style
  operation, and reduced-motion support.

WHO IT'S FOR

Students, teachers, hobbyists, and anyone curious about how encryption really
works. Great for a classroom demo, a study aid, or a rainy afternoon of
code-breaking.

IMPORTANT — EDUCATIONAL DEMO ONLY

DeckBook is a teaching tool, not a security product. It deliberately uses a
simple, breakable classroom cipher so you can see how it works and how it
fails. Do NOT use DeckBook to protect real secrets. For real security, use
modern, audited cryptographic tools.
```

## Category & tags

- **App category:** Education
- **Tags:** Education, Cryptography / Puzzle
- **Content rating (expected):** Everyone

## Contact details

- **Email:** systemslibrarian@gmail.com
- **Website:** https://systemslibrarian.github.io/DeckBook/
- **Privacy policy:** https://systemslibrarian.github.io/DeckBook/privacy.html

## Graphics (in ./assets)

| Asset | File | Play requirement |
| --- | --- | --- |
| App icon | `assets/icon-512.png` | 512×512 PNG |
| Feature graphic | `assets/feature-graphic.png` | 1024×500 PNG/JPG |
| Phone screenshots | `assets/screenshot-1..4-*.png` | 1080×1920 (2–8 required) |

Regenerate all graphics with: `npm run store:assets` (see that script's header).
