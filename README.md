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

## Feature Highlights

- Secure deck generation using `crypto.getRandomValues()` (no `Math.random()`)
- Fisher-Yates shuffle with rejection sampling for unbiased integer selection
- 52-card deck model with consistent 0-51 mapping
- DeckBook modes: 10 / 100 / 1,000 keys
- Human-readable index codes and SHA-256-derived fingerprints
- Receiver setup view with top-to-bottom checklist
- A-Z modular encryption/decryption
- Multi-deck message mode for long plaintexts
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
- [src/main.ts](src/main.ts) app logic and UI rendering
- [src/styles.css](src/styles.css) visual design and responsive styles
- [vite.config.ts](vite.config.ts) Vite config for static deployment
- [deploy-pages.yml](.github/workflows/deploy-pages.yml) GitHub Pages deployment workflow

## License

MIT