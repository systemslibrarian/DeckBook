/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png", "og-image.png"],
      manifest: {
        name: "DeckBook — Cipher Museum",
        short_name: "DeckBook",
        description:
          "A card-based one-time keybook for teaching key distribution, one-time pads, stream ciphers, and the danger of key reuse.",
        // Relative start_url/scope so the installed app works both locally and
        // under the GitHub Pages project subpath (base is "./").
        start_url: "./",
        scope: "./",
        theme_color: "#11100c",
        background_color: "#11100c",
        display: "standalone",
        orientation: "any",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"]
      }
    })
  ],
  test: {
    // Unit tests live in tests/. The e2e/ Playwright specs are run separately
    // via `npm run test:e2e` and must not be collected by Vitest.
    include: ["tests/**/*.test.ts"]
  }
});
