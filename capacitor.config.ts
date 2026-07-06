import type { CapacitorConfig } from "@capacitor/cli";

// DeckBook ships the same Vite web build (dist/) inside a native shell.
// The app is fully client-side and offline-capable, so no server config is
// needed — Capacitor just loads the bundled static assets.
const config: CapacitorConfig = {
  appId: "com.systemslibrarian.deckbook",
  appName: "DeckBook",
  webDir: "dist",
  backgroundColor: "#11100c",
};

export default config;
