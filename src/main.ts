import "./styles.css";
import {
  type Card,
  LETTERS_PER_DECK,
  cardAccessibleLabel,
  createStandardDeck,
  deckSignature,
  decryptText,
  decryptWithDecks,
  encryptText,
  encryptWithDecks,
  groupedFive,
  keystreamFromDeck,
  lettersToNumbers,
  normalizeAZ,
  numbersToLetters,
  requiredDeckCount,
  secureRandomInt,
  secureShuffle
} from "./cipher";
import {
  ENGLISH_FREQUENCY_PERCENT,
  differenceMod26,
  dragCrib,
  letterFrequencies,
  rankCribOffsets
} from "./analysis";
import { renderCardFaceSvg } from "./cardface";
import { buildShareUrl, parseShareFragment } from "./share";
import { hydrateQrImages } from "./qr";
import { bindVisualizerEvents, renderVisualizerPanel } from "./visualizer";
import {
  bindChallengeEvents,
  renderChallengePanel,
  selectPuzzle,
  setChallengeHooks
} from "./challenge";

/* ============================================================================
 * DeckBook — educational cipher demo
 * ----------------------------------------------------------------------------
 * main.ts is the UI/state layer. The pure cipher math lives in cipher.ts so
 * it can be unit-tested in isolation. Read cipher.ts first if you want the
 * cryptographic core; read this file for the app glue.
 *
 * Sections in this file:
 *
 *   1. UI types and constants     - DeckBookEntry, AppState, walkthrough
 *   2. App state and bootstrap    - the single state object the UI reads
 *   3. Identifiers                - human-friendly index codes and a
 *                                   SHA-256-derived fingerprint
 *   4. Persistence                - localStorage save/load (demo only)
 *   5. Helpers used by the view
 *   6. Render + event binding     - rebuild innerHTML on every state
 *                                   change, then wire up listeners
 *
 * Both sender and receiver must already hold the same private DeckBook.
 * Only the index code (a label) and the ciphertext are sent over the
 * public channel. The deck order itself is the secret.
 *
 * This is an educational toy. Do not protect real secrets with it.
 * ========================================================================= */

// ---------------------------------------------------------------------------
// 1. UI types and constants
// ---------------------------------------------------------------------------

type DeckBookEntry = {
  indexCode: string;
  fingerprint: string;
  deckOrder: Card[];
  status: "UNUSED" | "USED";
  createdAt: string;
};

type DeckMode = "10" | "100" | "1000";

type EncryptOutput = {
  indexCodes: string[];
  ciphertext: string;
  normalizedPlaintext: string;
};

type WalkthroughStep = {
  title: string;
  body: string;
  targetId: string;
};

type SetupViewMode = "visual" | "realistic" | "checklist";

// State for the Two-Party Simulator panel. Kept separate from the main
// encrypt/decrypt panels so the simulator can be played with freely
// without disturbing the user's working draft.
type SimulatorState = {
  plaintext: string;
  selectedKey: string;
  transmission: { indexCode: string; ciphertext: string } | null;
  decrypted: string | null;
};

// State for the Key Reuse Attack Lab. `crib*` drives the interactive
// crib-dragging explorer: the user guesses a word in one message and slides
// it along the ciphertext difference to leak the other message.
type AttackLabState = {
  plaintextA: string;
  plaintextB: string;
  reusedKey: string;
  crib: string;
  cribSide: "A" | "B";
  cribOffset: number;
  result: {
    cipherA: string;
    cipherB: string;
    cipherARaw: string;
    cipherBRaw: string;
    cipherDiff: string;
    plainDiff: string;
  } | null;
};

type AppState = {
  mode: DeckMode;
  deckBook: DeckBookEntry[];
  isGenerating: boolean;
  activeViewCode: string | null;
  selectedEncryptCode: string;
  selectedEncryptCodes: string[];
  advancedMode: boolean;
  encryptInput: string;
  encryptOutput: EncryptOutput | null;
  decryptIndexCode: string;
  decryptCiphertext: string;
  decryptOutput: {
    plaintext: string;
    warning: string | null;
  } | null;
  message: string | null;
  mistakeKey: string;
  checklist: Record<string, boolean[]>;
  keyListPage: number;
  keyListPageSize: number;
  hideUsedKeys: boolean;
  showEncryptSteps: boolean;
  showFingerprints: boolean;
  setupViewMode: SetupViewMode;
  walkthroughStep: number;
  walkthroughActive: boolean;
  walkthroughDismissed: boolean;
  simulator: SimulatorState;
  attackLab: AttackLabState;
  // True when index code + ciphertext arrived via a share link / QR scan.
  incomingShare: boolean;
  // Full-screen, one-panel-at-a-time presentation mode (projector / kiosk).
  presenterMode: boolean;
  presenterIndex: number;
  // Ids of expository panels currently collapsed (see COLLAPSIBLE_PANELS).
  collapsed: Set<string>;
  // Native app only: whether the hamburger section menu is open.
  navMenuOpen: boolean;
  // Native app only: which menu destination (APP_VIEWS key) is showing.
  activeView: string;
};

// Reference/expository panels that collapse into a one-line disclosure so the
// page stays short. They hold reading, not controls, so they start collapsed;
// the interactive step panels are never in this list. Order is display order.
const COLLAPSIBLE_PANELS: { id: string; title: string }[] = [
  { id: "how-it-works", title: "How the Cipher Works" },
  { id: "security-model", title: "Security Model and Warning" },
  { id: "mistakes", title: "What Goes Wrong?" },
  { id: "absurd-scale", title: "Absurd Scale" },
  { id: "modern-crypto", title: "Why Modern Key Exchange Exists" },
  { id: "advanced-mode", title: "Advanced: Multi-Deck Messages" },
  { id: "about-copy", title: "What is DeckBook?" },
  { id: "glossary", title: "Glossary" },
  { id: "educators", title: "For Educators" }
];

// Curated panel sequence for presenter mode — a guided arc from "what is
// this" through a live encrypt/decrypt to the modern-crypto payoff. Each id
// must match a section id rendered in the main template.
const PRESENTER_PANELS: { id: string; title: string }[] = [
  { id: "how-it-works", title: "How the Cipher Works" },
  { id: "visualizer", title: "Watch It Work" },
  { id: "generate", title: "Generate a DeckBook" },
  { id: "encrypt-panel", title: "Encrypt a Message" },
  { id: "decrypt-panel", title: "Decrypt a Message" },
  { id: "simulator", title: "Two-Party Simulator" },
  { id: "attack-lab", title: "Key Reuse Attack Lab" },
  { id: "challenge", title: "Challenge: Eve's Intercept" },
  { id: "modern-crypto", title: "Why Modern Key Exchange Exists" }
];

// The native app is a menu-driven, one-screen-at-a-time layout: each entry is
// a destination that shows only its section(s). Every section id must match a
// <section> rendered in the main template. Web keeps its full single-page
// layout and shows none of this.
const APP_VIEWS: { key: string; label: string; sections: string[] }[] = [
  { key: "learn", label: "How it Works", sections: ["how-it-works"] },
  { key: "visualizer", label: "Watch It Work", sections: ["visualizer"] },
  { key: "keys", label: "Generate DeckBook", sections: ["generate", "key-list", "receiver-setup"] },
  { key: "encrypt", label: "Encrypt", sections: ["encrypt-panel"] },
  { key: "decrypt", label: "Decrypt", sections: ["decrypt-panel"] },
  { key: "simulator", label: "Two-Party Simulator", sections: ["simulator"] },
  { key: "attack", label: "Key Reuse Attack Lab", sections: ["attack-lab"] },
  { key: "challenge", label: "Challenge: Eve's Intercept", sections: ["challenge"] },
  {
    key: "reference",
    label: "Reference & Glossary",
    sections: [
      "security-model",
      "mistakes",
      "absurd-scale",
      "modern-crypto",
      "advanced-mode",
      "about-copy",
      "glossary",
      "educators"
    ]
  }
];
const DEFAULT_VIEW = "learn";

function renderAppNav(): string {
  const open = state.navMenuOpen;
  // Number the sequential learning path so the intended order is obvious.
  // "Reference & Glossary" is supplementary, not a step, so it stays un-numbered.
  let step = 0;
  const items = APP_VIEWS.map((v) => {
    const isStep = v.key !== "reference";
    if (isStep) step += 1;
    const badge = isStep
      ? `<span class="app-nav-step" aria-hidden="true">${step}</span>`
      : `<span class="app-nav-step app-nav-step--ref" aria-hidden="true">★</span>`;
    const label = isStep
      ? `<span class="app-nav-kicker">Step ${step}</span><span class="app-nav-label">${v.label}</span>`
      : `<span class="app-nav-kicker">Reference</span><span class="app-nav-label">${v.label}</span>`;
    return `<button type="button" class="app-nav-item${v.key === state.activeView ? " is-active" : ""}" data-view="${v.key}">${badge}<span class="app-nav-text">${label}</span></button>`;
  }).join("");
  return `
    <div class="app-nav">
      <button type="button" class="app-nav-toggle" aria-expanded="${open}" aria-controls="app-nav-menu" aria-label="${open ? "Close section menu" : "Open section menu"}">
        <span class="app-nav-burger" aria-hidden="true"></span>
        Menu
      </button>
      <span class="app-nav-title">DeckBook</span>
    </div>
    ${
      open
        ? `<div class="app-nav-scrim" data-nav-close></div>
           <nav id="app-nav-menu" class="app-nav-menu" aria-label="Jump to section">${items}</nav>`
        : ""
    }`;
}

// ---------------------------------------------------------------------------
// 2. App state and bootstrap
// ---------------------------------------------------------------------------

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

const appRoot: HTMLDivElement = app;

// localStorage namespaces. These are demo conveniences only — browser
// storage is not a secure key vault.
const STORAGE_KEY = "deckbook.v1";
const GUIDE_KEY = "deckbook.guide.dismissed.v1";
const SETUP_VIEW_KEY = "deckbook.setup.view.v1";

const INDEX_WORDS = [
  "RIVER",
  "LANTERN",
  "CROWN",
  "SPARROW",
  "ANCHOR",
  "ORCHARD",
  "MOUNTAIN",
  "COMPASS",
  "HARBOR",
  "CANDLE",
  "MOON",
  "CEDAR",
  "BRIDGE",
  "EMBER",
  "PILGRIM"
] as const;

const FINGERPRINT_WORDS = [
  "MANGO",
  "RIVER",
  "LAMP",
  "CROWN",
  "CEDAR",
  "EMBER",
  "HARBOR",
  "PILOT",
  "GOLD",
  "ATLAS",
  "MARBLE",
  "ORBIT",
  "SPARROW",
  "ANCHOR",
  "LANTERN",
  "CINDER"
] as const;

const MISTAKES: Record<string, string> = {
  reuse: "If the same deck key encrypts two messages, an attacker may compare ciphertexts and learn patterns. (cipherA - cipherB) mod 26 equals (plainA - plainB) mod 26 — the key cancels out. See the Key Reuse Attack Lab below.",
  sendDeck: "The index code may travel publicly. The deck order may not. If the deck order is exposed, the key is exposed.",
  loseBook: "If either side loses the private DeckBook, future messages cannot be decrypted. If an attacker finds it, old and future messages become readable.",
  oneCardWrong: "Manual systems are fragile. One card out of order shifts the keystream and decryption fails.",
  tooLong: "A single 52-card deck key creates 52 keystream letters. Longer messages require additional one-time key material, not key reuse.",
  weakRandom: "Math.random() is not designed for cryptographic security. DeckBook uses crypto.getRandomValues() with rejection sampling for unbiased secure random integers.",
  forgotUsed: "If teams forget to mark keys as used, accidental reuse becomes likely. Operational discipline is part of cryptographic security.",
  patternedCode: "If index codes leak structure (for example, day-based naming), an attacker may infer operational habits. Index codes should only identify keys, not reveal meaning."
};

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    title: "See the Cipher Math",
    body: "If you want the math first: open How the Cipher Works. It walks letters -> numbers -> +keystream mod 26 with a concrete example. Skip ahead if you'd rather just try it.",
    targetId: "how-it-works"
  },
  {
    title: "Watch It Work",
    body: "Press Play in Watch It Work to see the cipher run one card at a time: card flips off the deck, becomes a keystream number, shifts one letter.",
    targetId: "visualizer"
  },
  {
    title: "Generate Key Material",
    body: "Generate your private DeckBook. Both sender and receiver must have the same secret deck orders before communication.",
    targetId: "generate"
  },
  {
    title: "Pick an Unused Key",
    body: "In Deck Key List, choose one UNUSED key. Index codes can be sent publicly, but the deck order itself must stay private.",
    targetId: "key-list"
  },
  {
    title: "Arrange the Physical Deck",
    body: "Use Receiver Setup View to arrange cards top-to-bottom and verify the fingerprint. One card out of order breaks decryption.",
    targetId: "receiver-setup"
  },
  {
    title: "Encrypt a Message",
    body: "Encrypt plaintext with one deck key (52 letters max) or enable Advanced Multi-Deck mode for longer messages.",
    targetId: "encrypt-panel"
  },
  {
    title: "Decrypt Using the Index Code",
    body: "The receiver enters index code(s) and ciphertext to regenerate the same keystream and recover plaintext.",
    targetId: "decrypt-panel"
  },
  {
    title: "Break Key Reuse Yourself",
    body: "In the Attack Lab, encrypt two messages with the same key, then drag a crib along the ciphertext difference and watch the other message leak out. This is why 'one-time' means one time.",
    targetId: "attack-lab"
  },
  {
    title: "Learn Failure Modes",
    body: "Use What Goes Wrong? to test operational mistakes like key reuse, weak randomness, and leaking deck order.",
    targetId: "mistakes"
  },
  {
    title: "Connect to Modern Crypto",
    body: "Finish with why modern key exchange and post-quantum KEMs exist: secure key establishment at scale.",
    targetId: "modern-crypto"
  }
];

const initialGuideDismissed = loadGuideDismissed();
const initialSetupViewMode = loadSetupViewMode();

const state: AppState = {
  mode: "10",
  deckBook: loadDeckBook(),
  isGenerating: false,
  activeViewCode: null,
  selectedEncryptCode: "",
  selectedEncryptCodes: [],
  advancedMode: false,
  encryptInput: "",
  encryptOutput: null,
  decryptIndexCode: "",
  decryptCiphertext: "",
  decryptOutput: null,
  message: null,
  mistakeKey: "reuse",
  checklist: {},
  keyListPage: 1,
  keyListPageSize: 24,
  hideUsedKeys: false,
  showEncryptSteps: false,
  showFingerprints: false,
  setupViewMode: initialSetupViewMode,
  walkthroughStep: 0,
  walkthroughActive: !initialGuideDismissed,
  walkthroughDismissed: initialGuideDismissed,
  simulator: {
    plaintext: "",
    selectedKey: "",
    transmission: null,
    decrypted: null
  },
  attackLab: {
    plaintextA: "",
    plaintextB: "",
    reusedKey: "",
    crib: "",
    cribSide: "A",
    cribOffset: 0,
    result: null
  },
  incomingShare: false,
  presenterMode: false,
  presenterIndex: 0,
  // Start every reference panel collapsed so the first view is short.
  collapsed: new Set(COLLAPSIBLE_PANELS.map((panel) => panel.id)),
  navMenuOpen: false,
  activeView: DEFAULT_VIEW
};

if (state.deckBook.length > 0) {
  state.selectedEncryptCode = state.deckBook.find((entry) => entry.status === "UNUSED")?.indexCode ?? "";
  state.selectedEncryptCodes = state.selectedEncryptCode ? [state.selectedEncryptCode] : [];
  state.activeViewCode = state.deckBook[0].indexCode;
}

// A challenge deep link (#play=<puzzleId>) opens Challenge mode on that
// puzzle. Handled before the first render so the correct puzzle is shown.
const playMatch = window.location.hash.replace(/^#/, "").match(/^play(?:=([a-z-]+))?$/);
let incomingPlay = false;
if (playMatch) {
  incomingPlay = true;
  if (playMatch[1]) {
    selectPuzzle(playMatch[1]);
  }
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

// If the page was opened from a share link / QR scan, the fragment carries
// the PUBLIC half of a transmission: index code(s) + ciphertext. Prefill
// the Decrypt panel with it. Whether decryption works depends entirely on
// whether this device already holds the right DeckBook — that's the lesson.
const incomingShare = parseShareFragment(window.location.hash);
if (incomingShare) {
  state.decryptIndexCode = incomingShare.codes.join(", ");
  state.decryptCiphertext = incomingShare.ct;
  state.incomingShare = true;
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

setChallengeHooks({ confetti: confettiBurst, flash });

// In the native app shell (Capacitor injects window.Capacitor) the app is a
// menu-driven, one-screen-at-a-time layout (see APP_VIEWS / applyNativeView):
// the marketing hero and the single-page scroll are hidden, and it opens on
// "How the Cipher Works". The website keeps its full single-page layout.
const capacitor = (window as unknown as {
  Capacitor?: { isNativePlatform?: () => boolean };
}).Capacitor;
const isNativeApp = capacitor?.isNativePlatform?.() === true;
if (isNativeApp) {
  document.body.classList.add("native-app");
  // Open on the relevant screen when launched from a share or challenge link.
  if (incomingShare) {
    state.activeView = "decrypt";
  } else if (incomingPlay) {
    state.activeView = "challenge";
  }
}

// Service worker policy differs by platform:
//  - Web: register the generated SW so the site is an installable, offline PWA.
//  - Native app: Capacitor already serves the bundled assets offline, so a SW
//    adds nothing and only serves a stale build for one launch after each app
//    update. Unregister any SW and clear its caches; if a stale SW is currently
//    controlling the page, reload once (after cleanup) to load fresh assets.
if (isNativeApp) {
  if ("serviceWorker" in navigator) {
    const cleanup = Promise.all([
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister()))),
      "caches" in window
        ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        : Promise.resolve(),
    ]);
    if (navigator.serviceWorker.controller) {
      void cleanup.then(() => window.location.reload());
    }
  }
} else {
  void import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}

// Android hardware back button. Close the presenter overlay if it's open;
// otherwise require a second back press within 2s to leave the app, so a stray
// tap doesn't kick the user out mid-lesson.
if (isNativeApp) {
  void import("@capacitor/app").then(({ App }) => {
    let backArmed = false;
    let backTimer = 0;
    void App.addListener("backButton", () => {
      if (state.navMenuOpen) {
        state.navMenuOpen = false;
        render();
        return;
      }
      if (state.presenterMode) {
        exitPresenter();
        return;
      }
      // From any other screen, Back returns to the home destination first.
      if (state.activeView !== DEFAULT_VIEW) {
        selectView(DEFAULT_VIEW);
        return;
      }
      if (backArmed) {
        void App.exitApp();
        return;
      }
      backArmed = true;
      flash("Press back again to exit.");
      render(); // flash() only repaints on clear; show the toast now.
      window.clearTimeout(backTimer);
      backTimer = window.setTimeout(() => {
        backArmed = false;
      }, 2000);
    });
  });
}

render();

if (incomingShare) {
  document.querySelector("#decrypt-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  flash("Encrypted message received over the public channel. Decrypt it — if you hold the right DeckBook.");
  render();
}

if (incomingPlay) {
  document.querySelector("#challenge")?.scrollIntoView({ behavior: "smooth", block: "start" });
  flash("Challenge loaded. You captured two ciphertexts — recover both messages.");
}

// The printable receiver sheet is toggled with a body class; clean it up
// once the print dialog closes.
window.addEventListener("afterprint", () => {
  document.body.classList.remove("print-setup");
});

// Global keyboard navigation for presenter mode. Bound once (not in the
// per-render bindEvents) so listeners never stack. Ignores key presses while
// typing in a field so arrow keys still move the text cursor.
window.addEventListener("keydown", (event) => {
  if (!state.presenterMode) {
    return;
  }
  const target = event.target as HTMLElement | null;
  const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
  if (event.key === "Escape") {
    exitPresenter();
  } else if (!typing && (event.key === "ArrowRight" || event.key === "PageDown")) {
    event.preventDefault();
    presenterGo(1);
  } else if (!typing && (event.key === "ArrowLeft" || event.key === "PageUp")) {
    event.preventDefault();
    presenterGo(-1);
  }
});

// ---------------------------------------------------------------------------
// 3. Identifiers (index codes + fingerprint)
//
// Each key in the DeckBook gets two human-readable identifiers:
//   - indexCode    a short label like LANTERN-42 that can be sent publicly.
//                  This is just a name; it reveals nothing about the deck.
//   - fingerprint  three tokens derived from SHA-256 of the deck order.
//                  Sender and receiver compare fingerprints to confirm they
//                  have the same physical arrangement before encrypting.
// ---------------------------------------------------------------------------

// Compute a short, human-friendly fingerprint by hashing the deck signature
// and bucketing a few bytes into word lists. This is a checksum, not a
// secret — two parties compare it out loud to confirm matching decks.
async function createFingerprint(deckOrder: Card[]): Promise<string> {
  const bytes = new TextEncoder().encode(deckSignature(deckOrder));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const values = new Uint8Array(hash);

  const wordA = FINGERPRINT_WORDS[values[0] % FINGERPRINT_WORDS.length];
  const wordB = FINGERPRINT_WORDS[values[5] % FINGERPRINT_WORDS.length];
  const number = ((values[10] << 8) + values[11]) % 9000 + 1000;

  return `${wordA}-${wordB}-${number}`;
}

// Pick a fresh index code that does not collide with anything in `used`.
// Format is WORD-NUMBER or WORD-WORD-NUMBER (chosen 50/50). With 15 words and
// numbers 1..999 the namespace is large enough for thousands of keys.
function generateIndexCode(used: Set<string>): string {
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const oneWord = secureRandomInt(2) === 0;
    const number = secureRandomInt(999) + 1;
    const wordA = INDEX_WORDS[secureRandomInt(INDEX_WORDS.length)];
    let candidate = `${wordA}-${number}`;

    if (!oneWord) {
      let wordB = INDEX_WORDS[secureRandomInt(INDEX_WORDS.length)];
      if (wordA === wordB) {
        wordB = INDEX_WORDS[(INDEX_WORDS.indexOf(wordB) + 1) % INDEX_WORDS.length];
      }
      candidate = `${wordA}-${wordB}-${number}`;
    }

    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }

  throw new Error("Unable to generate a unique index code");
}

// Build `total` independent key entries. Each entry holds a freshly shuffled
// 52-card deck (the secret), plus an index code and fingerprint (public-ish
// labels). The deck order is what makes the key — everything else is
// metadata for identification and operational discipline.
async function generateDeckBook(total: number): Promise<DeckBookEntry[]> {
  const entries: DeckBookEntry[] = [];
  const usedIndexCodes = new Set<string>();

  for (let i = 0; i < total; i += 1) {
    const deckOrder = secureShuffle(createStandardDeck());
    const fingerprint = await createFingerprint(deckOrder);
    entries.push({
      indexCode: generateIndexCode(usedIndexCodes),
      fingerprint,
      deckOrder,
      status: "UNUSED",
      createdAt: new Date().toISOString()
    });
  }

  return entries;
}

// Parse a comma-separated list of index codes typed in the Decrypt panel.
// "lantern-42, crown-88" -> ["LANTERN-42", "CROWN-88"]. Order matters: it
// must match the order the keys were used to encrypt.
function parseIndexCodes(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part.length > 0);
}

// A brief card-riffle animation shown while a DeckBook is generated. Purely
// atmospheric — it dramatizes "the order is the key". Skipped entirely under
// prefers-reduced-motion. Resolves when the animation has played out.
function playShuffleAnimation(): Promise<void> {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return Promise.resolve();
  }
  const overlay = document.createElement("div");
  overlay.className = "shuffle-overlay";
  overlay.setAttribute("aria-hidden", "true");
  const cards = Array.from({ length: 16 }, (_, i) => `<span class="shuffle-card" style="--i:${i}"></span>`).join("");
  overlay.innerHTML = `<div class="shuffle-stage">${cards}</div><p class="shuffle-caption">Shuffling with crypto.getRandomValues()…</p>`;
  document.body.appendChild(overlay);
  return new Promise((resolve) => {
    window.setTimeout(() => {
      overlay.remove();
      resolve();
    }, 1250);
  });
}

// Base URL for share links: strip any existing hash/query so we don't stack
// fragments. In dev and on GitHub Pages this is the page's own address.
function shareBaseUrl(): string {
  return window.location.origin + window.location.pathname;
}

// A short celebratory confetti burst for solving a challenge. Pure DOM, no
// dependency; skipped under prefers-reduced-motion.
function confettiBurst(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const colors = ["#e4ba58", "#7ecf92", "#e16b6b", "#a9ccee", "#f3d58e"];
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 80; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${(i / 80) * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${(i % 10) * 40}ms`;
    piece.style.transform = `translateY(0) rotate(${(i * 47) % 360}deg)`;
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 2600);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------------------------------------------------------------------------
// 4. Persistence (localStorage — demo convenience, not a key vault)
// ---------------------------------------------------------------------------

function saveDeckBook(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.deckBook));
}

function loadDeckBook(): DeckBookEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isDeckBookEntryLike).map((entry) => ({
      indexCode: entry.indexCode,
      fingerprint: entry.fingerprint,
      deckOrder: entry.deckOrder,
      status: entry.status,
      createdAt: entry.createdAt
    }));
  } catch {
    return [];
  }
}

function loadGuideDismissed(): boolean {
  return localStorage.getItem(GUIDE_KEY) === "1";
}

function saveGuideDismissed(value: boolean): void {
  localStorage.setItem(GUIDE_KEY, value ? "1" : "0");
}

function loadSetupViewMode(): SetupViewMode {
  const stored = localStorage.getItem(SETUP_VIEW_KEY);
  return stored === "checklist" || stored === "realistic" ? stored : "visual";
}

function saveSetupViewMode(mode: SetupViewMode): void {
  localStorage.setItem(SETUP_VIEW_KEY, mode);
}

// Defensive runtime check for imported/loaded JSON. Anything malformed is
// rejected so the rest of the app can rely on the DeckBookEntry shape.
function isDeckBookEntryLike(value: unknown): value is DeckBookEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const maybe = value as Record<string, unknown>;
  if (
    typeof maybe.indexCode !== "string" ||
    typeof maybe.fingerprint !== "string" ||
    (maybe.status !== "UNUSED" && maybe.status !== "USED") ||
    typeof maybe.createdAt !== "string" ||
    !Array.isArray(maybe.deckOrder) ||
    maybe.deckOrder.length !== 52
  ) {
    return false;
  }

  return maybe.deckOrder.every((card) => {
    if (typeof card !== "object" || card === null) {
      return false;
    }
    const c = card as Record<string, unknown>;
    return (
      typeof c.rank === "string" &&
      typeof c.suit === "string" &&
      typeof c.label === "string" &&
      typeof c.value === "number"
    );
  });
}

// ---------------------------------------------------------------------------
// 5. Small helpers used by the view layer
// ---------------------------------------------------------------------------

function deckSummary(): { total: number; used: number; unused: number } {
  const total = state.deckBook.length;
  const used = state.deckBook.filter((entry) => entry.status === "USED").length;
  return { total, used, unused: total - used };
}

function getActiveEntry(): DeckBookEntry | undefined {
  return state.deckBook.find((entry) => entry.indexCode === state.activeViewCode);
}

function getSetupText(entry: DeckBookEntry): string {
  const lines = entry.deckOrder.map((card, index) => `${index + 1}. ${card.label}`).join("\n");
  return [
    `Deck Key: ${entry.indexCode}`,
    `Fingerprint: ${entry.fingerprint}`,
    "",
    "Arrange your physical deck in this exact order.",
    "TOP OF DECK",
    lines,
    "BOTTOM OF DECK",
    "",
    "Both sender and receiver must arrange their decks in exactly this order before the message is sent."
  ].join("\n");
}

function markKeyStatus(indexCode: string, status: "UNUSED" | "USED"): void {
  state.deckBook = state.deckBook.map((entry) => {
    if (entry.indexCode !== indexCode) {
      return entry;
    }
    return { ...entry, status };
  });
  saveDeckBook();
}

function findUnusedEntriesByCodes(codes: string[]): DeckBookEntry[] {
  return codes
    .map((code) => state.deckBook.find((entry) => entry.indexCode === code))
    .filter((entry): entry is DeckBookEntry => Boolean(entry && entry.status === "UNUSED"));
}

function clampPage(totalItems: number): void {
  const maxPage = Math.max(1, Math.ceil(totalItems / state.keyListPageSize));
  state.keyListPage = Math.min(Math.max(1, state.keyListPage), maxPage);
}

function openGuideStep(step: number): void {
  state.walkthroughStep = Math.min(Math.max(0, step), WALKTHROUGH_STEPS.length - 1);
  state.walkthroughActive = true;
  state.walkthroughDismissed = false;
  saveGuideDismissed(false);
  // If the step points at a collapsed reference panel, expand it so the
  // walkthrough never scrolls to hidden content.
  const targetId = WALKTHROUGH_STEPS[state.walkthroughStep].targetId;
  state.collapsed.delete(targetId);
  render();
  document.querySelector(`#${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function finishGuide(): void {
  state.walkthroughActive = false;
  state.walkthroughDismissed = true;
  saveGuideDismissed(true);
  flash("Guided walkthrough completed.");
  render();
}

// Switch the native app to a menu destination: close the menu, show that view's
// section(s) only, and scroll back to the top.
function selectView(key: string): void {
  state.activeView = key;
  state.navMenuOpen = false;
  render();
  document.querySelector("#main-content")?.scrollIntoView({ block: "start" });
  window.scrollTo({ top: 0 });
}

// Native app only: show just the active destination's section(s); hide the rest
// (including the marketing hero, walkthrough, and other views). Runs after every
// render because the DOM is rebuilt each time.
function applyNativeView(): void {
  if (!isNativeApp) {
    return;
  }
  const view = APP_VIEWS.find((v) => v.key === state.activeView) ?? APP_VIEWS[0];
  const active = new Set(view.sections);
  document.querySelectorAll<HTMLElement>("#main-content > section").forEach((section) => {
    section.style.display = section.id && active.has(section.id) ? "" : "none";
  });
}

// Resolve which decks will encrypt the current plaintext, in order. Returns
// the same decks the Encrypt button would consume, so the step-through
// visualization matches what an actual encryption would produce.
function activeEncryptDecks(): DeckBookEntry[] {
  if (state.advancedMode) {
    return findUnusedEntriesByCodes(state.selectedEncryptCodes);
  }
  const single = state.deckBook.find(
    (entry) => entry.indexCode === state.selectedEncryptCode && entry.status === "UNUSED"
  );
  return single ? [single] : [];
}

// Build the live step-through HTML: one row per plaintext letter, showing
// how it combines with the keystream letter to produce the ciphertext.
// This is the "obvious how the cipher works" view people asked for —
// each row is a literal addition mod 26.
function renderEncryptStepsHtml(): string {
  const normalized = normalizeAZ(state.encryptInput);
  const decks = activeEncryptDecks();

  if (normalized.length === 0) {
    return `<p class="steps-hint">Start typing a message and pick a key. Each letter's math will appear here as you type.</p>`;
  }
  if (decks.length === 0) {
    return `<p class="steps-hint">Pick an UNUSED deck key to see the per-letter math.</p>`;
  }

  const capacity = decks.length * LETTERS_PER_DECK;
  const shown = Math.min(normalized.length, capacity);
  const overflowed = normalized.length > capacity;

  // Pre-compute keystreams for each available deck.
  const streams = decks.map((entry) => keystreamFromDeck(entry.deckOrder));

  let rows = "";
  for (let i = 0; i < shown; i += 1) {
    const deckIndex = Math.floor(i / LETTERS_PER_DECK);
    const inDeckIndex = i % LETTERS_PER_DECK;
    const card = decks[deckIndex].deckOrder[inDeckIndex];
    const plainNum = normalized.charCodeAt(i) - 65;
    const keyNum = streams[deckIndex][inDeckIndex];
    const cipherNum = (plainNum + keyNum) % 26;
    const cipherLetter = String.fromCharCode(cipherNum + 65);

    rows += `
      <tr>
        <td class="step-pos">${i + 1}</td>
        <td><span class="mono">${normalized[i]}</span> (${plainNum})</td>
        <td>+</td>
        <td><span class="mono">${escapeHtml(card.label)}</span> &rarr; ${card.value} mod 26 = ${keyNum}</td>
        <td>= ${plainNum + keyNum} mod 26 = ${cipherNum}</td>
        <td class="step-out"><span class="mono">${cipherLetter}</span></td>
        <td class="step-deck">${escapeHtml(decks[deckIndex].indexCode)}</td>
      </tr>`;
  }

  const overflowMsg = overflowed
    ? `<p class="mini-warning">${normalized.length - capacity} letter(s) beyond capacity. Add another key in Advanced multi-deck mode.</p>`
    : "";

  return `
    <table class="steps-table" aria-label="Per-letter encryption math">
      <thead>
        <tr>
          <th>#</th>
          <th>Plaintext</th>
          <th></th>
          <th>Keystream (card mod 26)</th>
          <th>Sum mod 26</th>
          <th>Cipher</th>
          <th>From key</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${overflowMsg}`;
}

// Compute the live plaintext/ciphertext pair for the current Encrypt draft,
// capped to the capacity of the selected keys. Powers the frequency charts.
function computeLiveCipher(): { plain: string; cipher: string } {
  const normalized = normalizeAZ(state.encryptInput);
  const decks = activeEncryptDecks();
  if (normalized.length === 0 || decks.length === 0) {
    return { plain: "", cipher: "" };
  }
  const shown = Math.min(normalized.length, decks.length * LETTERS_PER_DECK);
  const streams = decks.map((entry) => keystreamFromDeck(entry.deckOrder));
  let cipher = "";
  for (let i = 0; i < shown; i += 1) {
    const keyNum = streams[Math.floor(i / LETTERS_PER_DECK)][i % LETTERS_PER_DECK];
    cipher += String.fromCharCode((normalized.charCodeAt(i) - 65 + keyNum) % 26 + 65);
  }
  return { plain: normalized.slice(0, shown), cipher };
}

// One 26-column bar chart. Bars are scaled to the tallest count in this
// chart; the optional ghost series (typical English) is scaled to its own
// max so only the SHAPE is compared, not absolute counts.
function renderFrequencyChart(title: string, counts: number[], ghostPercent?: number[]): string {
  const max = Math.max(...counts, 1);
  const ghostMax = ghostPercent ? Math.max(...ghostPercent) : 1;
  const cols = counts
    .map((count, i) => {
      const letter = String.fromCharCode(65 + i);
      const barHeight = Math.round((count / max) * 100);
      const ghost = ghostPercent
        ? `<span class="freq-ghost" style="height:${Math.round((ghostPercent[i] / ghostMax) * 100)}%"></span>`
        : "";
      return `<div class="freq-col" title="${letter}: ${count}">${ghost}<span class="freq-bar" style="height:${barHeight}%"></span><span class="freq-letter">${letter}</span></div>`;
    })
    .join("");
  return `
    <figure class="freq-chart">
      <figcaption>${title}</figcaption>
      <div class="freq-cols" role="img" aria-label="${title}">${cols}</div>
    </figure>`;
}

// The "English is spiky, ciphertext is flat" lesson, live as you type.
function renderFrequencyHtml(): string {
  const { plain, cipher } = computeLiveCipher();
  if (cipher.length === 0) {
    return `<p class="steps-hint">Type a message and pick a key to see the letter-frequency shapes.</p>`;
  }
  const note =
    plain.length < 20
      ? `<p class="freq-note">Short samples are noisy — type a longer message (20+ letters) to see the shapes clearly.</p>`
      : "";
  return `
    <div class="freq-wrap">
      <p class="freq-intro">English has a spiky letter pattern (ghost bars = typical English). A good keystream flattens it: the ciphertext should show no favorite letters — nothing for a codebreaker to grab.</p>
      <div class="freq-charts">
        ${renderFrequencyChart("Your plaintext", letterFrequencies(plain), ENGLISH_FREQUENCY_PERCENT)}
        ${renderFrequencyChart("Your ciphertext", letterFrequencies(cipher))}
      </div>
      ${note}
    </div>`;
}

// Everything inside the live #encrypt-steps container: per-letter math plus
// the frequency charts. Re-rendered on every keystroke without touching the
// textarea (see the encrypt-input listener).
function renderEncryptLiveHtml(): string {
  // Both live previews are collapsible so they don't clutter the screen. Their
  // open/closed state lives in `state` (see the toggle listener in bindEvents)
  // so it survives the per-keystroke repaint of this container.
  return `
    <details class="collapsible" data-collapse="steps" ${state.showEncryptSteps ? "open" : ""}>
      <summary>Show the math: how each letter becomes cipher</summary>
      <div class="collapsible-body">${renderEncryptStepsHtml()}</div>
    </details>
    <details class="collapsible" data-collapse="fingerprints" ${state.showFingerprints ? "open" : ""}>
      <summary>Show letter fingerprints (frequency shapes)</summary>
      <div class="collapsible-body">${renderFrequencyHtml()}</div>
    </details>`;
}

// Repaint only the live encrypt preview in place, leaving the textarea and
// key selects untouched (no caret jump, no lost selection).
function repaintEncryptSteps(): void {
  const steps = document.querySelector<HTMLDivElement>("#encrypt-steps");
  if (steps) {
    steps.innerHTML = renderEncryptLiveHtml();
  }
}

// Render the Two-Party Simulator panel. It splits the screen into Sender,
// Public Channel, and Receiver columns so the data flow is visible at a
// glance: the DeckBook is shared off-channel beforehand, then only the
// index code and ciphertext cross the public wire.
function renderSimulatorPanel(unusedEntries: DeckBookEntry[]): string {
  const sim = state.simulator;
  const keyOptions = unusedEntries
    .map(
      (entry) =>
        `<option value="${escapeHtml(entry.indexCode)}" ${sim.selectedKey === entry.indexCode ? "selected" : ""}>${escapeHtml(
          entry.indexCode
        )}</option>`
    )
    .join("");

  const ready = state.deckBook.length > 0 ? "Both parties hold the same private DeckBook." : "Generate a DeckBook first — Alice and Bob need to share it off-channel before they can talk.";

  const wire = sim.transmission
    ? `<p><strong>Index code:</strong> <span class="mono">${escapeHtml(sim.transmission.indexCode)}</span></p>
       <p><strong>Ciphertext:</strong> <span class="mono">${escapeHtml(sim.transmission.ciphertext)}</span></p>
       <p class="mini-warning">This is all an eavesdropper sees. The deck order itself never travels here.</p>`
    : `<p class="empty">Nothing on the wire yet. Compose a message and Send.</p>`;

  const received = sim.decrypted !== null
    ? `<p><strong>Recovered plaintext:</strong> <span class="mono">${escapeHtml(sim.decrypted)}</span></p>
       <p>Bob rebuilt the same keystream from his copy of the deck and subtracted it from the ciphertext.</p>`
    : `<p class="empty">Bob has not received a message yet.</p>`;

  return `
    <section class="panel simulator-panel" id="simulator">
      <h2>Two-Party Simulator</h2>
      <p>${escapeHtml(ready)}</p>
      <div class="simulator-grid">
        <div class="party">
          <h3>Sender (Alice)</h3>
          <p class="party-hint">Holds the private DeckBook.</p>
          <label for="sim-plaintext">Plaintext</label>
          <textarea id="sim-plaintext" rows="3" placeholder="Meet me at noon">${escapeHtml(sim.plaintext)}</textarea>
          <label for="sim-key">Deck key</label>
          <select id="sim-key" ${keyOptions ? "" : "disabled"}>
            <option value="">Select unused key</option>
            ${keyOptions}
          </select>
          <div class="button-row">
            <button type="button" id="sim-send" ${unusedEntries.length === 0 ? "disabled" : ""}>Encrypt and send</button>
            <button type="button" id="sim-reset">Reset</button>
          </div>
        </div>

        <div class="channel" aria-label="Public channel">
          <h3>Public Channel <span class="eve-tag">👁 Eve is listening</span></h3>
          <p class="party-hint">Eve the eavesdropper sees everything that crosses here — but never the deck order.</p>
          ${wire}
        </div>

        <div class="party">
          <h3>Receiver (Bob)</h3>
          <p class="party-hint">Holds the same private DeckBook.</p>
          ${received}
        </div>
      </div>
      <p class="mini-warning">If Bob did not already have the DeckBook, the wire contents would be useless to him. That pre-shared secret is the whole game — and the part real cryptography has to solve some other way (Diffie-Hellman, KEMs, etc).</p>
    </section>`;
}

// Render the Key Reuse Attack Lab. The user encrypts two messages with the
// same key on purpose. The lab then displays both ciphertexts, their
// difference mod 26, and the plaintext difference mod 26 — which are
// equal, demonstrating that key reuse cancels the key out of the equation.
function renderAttackLabPanel(): string {
  const lab = state.attackLab;
  const keyOptions = state.deckBook
    .map(
      (entry) =>
        `<option value="${escapeHtml(entry.indexCode)}" ${lab.reusedKey === entry.indexCode ? "selected" : ""}>${escapeHtml(
          entry.indexCode
        )} (${entry.status})</option>`
    )
    .join("");

  const resultBlock = lab.result
    ? `<div class="output">
        <p><strong>Ciphertext A:</strong> <span class="mono">${escapeHtml(lab.result.cipherA)}</span></p>
        <p><strong>Ciphertext B:</strong> <span class="mono">${escapeHtml(lab.result.cipherB)}</span></p>
        <p><strong>(Cipher A &minus; Cipher B) mod 26:</strong> <span class="mono">${escapeHtml(lab.result.cipherDiff)}</span></p>
        <p><strong>(Plain A &minus; Plain B) mod 26:</strong> <span class="mono">${escapeHtml(lab.result.plainDiff)}</span></p>
        <p class="mini-warning">Those last two lines are identical. The shared key cancelled out — an attacker who saw both ciphertexts learned the difference of the plaintexts without touching the key. Now try to pull the actual messages out below.</p>
       </div>
       ${renderCribDragger(lab)}`
    : `<p class="empty">Encrypt two messages with the same key to see the attack.</p>`;

  return `
    <section class="panel attack-lab" id="attack-lab">
      <h2>Key Reuse Attack Lab</h2>
      <p>One-time keys must be used <strong>once</strong>. To see why, encrypt two different messages with the <em>same</em> key, then crack them by hand — no key required.</p>
      <div class="control-row">
        <label for="lab-key">Reused key</label>
        <select id="lab-key" ${state.deckBook.length === 0 ? "disabled" : ""}>
          <option value="">Select key</option>
          ${keyOptions}
        </select>
      </div>
      <label for="lab-a">Plaintext A</label>
      <textarea id="lab-a" rows="2" placeholder="ATTACKATDAWNBRINGSHOVELS">${escapeHtml(lab.plaintextA)}</textarea>
      <label for="lab-b">Plaintext B</label>
      <textarea id="lab-b" rows="2" placeholder="DEFENDTHEEASTGATETONIGHT">${escapeHtml(lab.plaintextB)}</textarea>
      <div class="button-row">
        <button type="button" id="lab-run" ${state.deckBook.length === 0 ? "disabled" : ""}>Run the attack</button>
        <button type="button" id="lab-reset">Reset</button>
      </div>
      ${resultBlock}
      <p>The math: for any position <span class="mono">i</span>, <span class="mono">cipher<sub>A</sub>[i] - cipher<sub>B</sub>[i] = (plain<sub>A</sub>[i] + k[i]) - (plain<sub>B</sub>[i] + k[i]) = plain<sub>A</sub>[i] - plain<sub>B</sub>[i]</span> (all mod 26). The keystream <span class="mono">k</span> vanishes.</p>
    </section>`;
}

// The interactive crib-dragging explorer. The user types a word they suspect
// appears in one message and slides it along the ciphertext difference. At
// each offset the tool reveals what the OTHER message would say there — the
// classic two-time-pad break, done by hand. Wrong guesses read as gibberish;
// the right word and position spell out readable English.
// The persistent controls (text input + side select + slider) live OUTSIDE
// the #crib-live subtree so that dragging the slider or editing the crib does
// not recreate those elements — the interaction stays smooth. Only #crib-live
// (the alignment strip, readout and hints) is regenerated on each change, via
// updateCribLive().
function renderCribDragger(lab: AttackLabState): string {
  if (!lab.result) {
    return "";
  }
  const diff = differenceMod26(lab.result.cipherARaw, lab.result.cipherBRaw);
  const crib = normalizeAZ(lab.crib);

  return `
    <div class="crib-lab">
      <h3>Crack it: crib dragging</h3>
      <p>Guess a word that might appear in one message — a "crib" like <span class="mono">THE</span>, <span class="mono">ATTACK</span>, or <span class="mono">GATE</span>. Slide it along the difference and watch the other message appear where you guess right.</p>
      ${cribControls(lab, crib, diff.length)}
      <div id="crib-live">${renderCribLive(lab, diff, crib)}</div>
    </div>`;
}

// The live-updating body of the crib dragger. Pure function of state + diff.
function renderCribLive(lab: AttackLabState, diff: number[], crib: string): string {
  const otherSide = lab.cribSide === "A" ? "B" : "A";
  if (crib.length === 0) {
    return `<p class="empty">Type a crib above to begin dragging.</p>`;
  }

  const maxOffset = Math.max(0, diff.length - crib.length);
  const offset = Math.min(lab.cribOffset, maxOffset);
  const revealed = dragCrib(diff, crib, offset, lab.cribSide);

  // Alignment strip: show the crib sitting under the difference at `offset`.
  const cells = Array.from({ length: diff.length }, (_, i) => {
    const within = i >= offset && i < offset + crib.length;
    const revealChar = within ? revealed[i - offset] : "";
    const cribChar = within ? crib[i - offset] : "";
    return `<div class="crib-col ${within ? "active" : ""}">
        <span class="crib-diff">${String.fromCharCode(65 + diff[i])}</span>
        <span class="crib-guess">${cribChar || "&middot;"}</span>
        <span class="crib-reveal">${revealChar || "&middot;"}</span>
      </div>`;
  }).join("");

  const ranked = rankCribOffsets(diff, crib, lab.cribSide)
    .slice(0, 3)
    .map(
      (hit) =>
        `<button type="button" class="crib-hint" data-crib-offset="${hit.offset}">pos ${hit.offset + 1}: <span class="mono">${escapeHtml(
          hit.revealed
        )}</span></button>`
    )
    .join("");

  return `
    <p>Your crib <span class="mono">${escapeHtml(crib)}</span> is guessed to be in <strong>message ${lab.cribSide}</strong> at position ${offset + 1}. Where it lands, the tool subtracts it from the difference to reveal <strong>message ${otherSide}</strong>:</p>
    <div class="crib-strip-wrap">
      <div class="crib-legend"><span>diff</span><span>crib (msg ${lab.cribSide})</span><span>reveal (msg ${otherSide})</span></div>
      <div class="crib-strip">${cells}</div>
    </div>
    <p class="crib-readout">Revealed in message ${otherSide}: <span class="mono">${escapeHtml(revealed)}</span></p>
    ${ranked ? `<p class="crib-hints-label">Most English-looking positions (click to jump):</p><div class="crib-hints">${ranked}</div>` : ""}
    <p class="mini-warning">Only ciphertext went into this. No key, no deck order — reuse alone leaked the plaintext.</p>`;
}

function cribControls(lab: AttackLabState, crib: string, diffLength: number): string {
  const maxOffset = Math.max(0, diffLength - Math.max(crib.length, 1));
  const offset = Math.min(lab.cribOffset, maxOffset);
  return `
    <div class="crib-controls">
      <div class="crib-field">
        <label for="crib-word">Crib (your guessed word)</label>
        <input id="crib-word" value="${escapeHtml(lab.crib)}" placeholder="THE" autocomplete="off" />
      </div>
      <div class="crib-field">
        <label for="crib-side">Guess it is in message</label>
        <select id="crib-side">
          <option value="A" ${lab.cribSide === "A" ? "selected" : ""}>Message A</option>
          <option value="B" ${lab.cribSide === "B" ? "selected" : ""}>Message B</option>
        </select>
      </div>
      <div class="crib-field crib-slide">
        <label for="crib-offset" id="crib-offset-label">Position: ${offset + 1}</label>
        <input id="crib-offset" type="range" min="0" max="${maxOffset}" value="${offset}" ${crib.length === 0 ? "disabled" : ""} />
      </div>
    </div>
    <div class="button-row">
      <button type="button" id="crib-autosolve">▶ Auto-solve (watch it break)</button>
    </div>`;
}

// Refresh only the crib dragger's live subtree and sync the slider bounds,
// without recreating the text input or slider elements. This keeps slider
// dragging and crib typing smooth (no full re-render, no caret jump).
function updateCribLive(): void {
  const lab = state.attackLab;
  if (!lab.result) {
    return;
  }
  const diff = differenceMod26(lab.result.cipherARaw, lab.result.cipherBRaw);
  const crib = normalizeAZ(lab.crib);
  const maxOffset = Math.max(0, diff.length - Math.max(crib.length, 1));
  const offset = Math.min(lab.cribOffset, maxOffset);

  const live = document.querySelector<HTMLDivElement>("#crib-live");
  if (live) {
    live.innerHTML = renderCribLive(lab, diff, crib);
  }
  const label = document.querySelector<HTMLLabelElement>("#crib-offset-label");
  if (label) {
    label.textContent = `Position: ${offset + 1}`;
  }
  const slider = document.querySelector<HTMLInputElement>("#crib-offset");
  if (slider) {
    slider.max = String(maxOffset);
    slider.value = String(offset);
    slider.disabled = crib.length === 0;
  }
  bindCribHints();
}

// (Re)bind the "most English-looking positions" jump buttons. Called after
// each #crib-live refresh because innerHTML replacement discards the old
// buttons and their listeners.
function bindCribHints(): void {
  document.querySelectorAll<HTMLButtonElement>("button[data-crib-offset]").forEach((button) => {
    button.addEventListener("click", () => {
      state.attackLab.cribOffset = Number(button.dataset.cribOffset);
      updateCribLive();
    });
  });
}

// ---------------------------------------------------------------------------
// 6. Render + event binding
//
// The UI is built by replacing appRoot.innerHTML on every state change, then
// re-attaching event listeners with bindEvents(). It's a deliberately
// simple "redraw the world" pattern — no framework, no virtual DOM, easy
// for a learner to follow line by line.
// ---------------------------------------------------------------------------

function render(): void {
  const summary = deckSummary();
  const activeEntry = getActiveEntry();
  const normalizedEncrypt = normalizeAZ(state.encryptInput);
  const mistakesOptions = Object.entries(MISTAKES)
    .map(
      ([key]) =>
        `<option value="${key}" ${state.mistakeKey === key ? "selected" : ""}>${escapeHtml(mistakeLabel(key))}</option>`
    )
    .join("");

  // "Hide used decks" filters the list you page through, so a large book of
  // mostly-spent keys collapses to just the ones you can still use.
  const listedKeys = state.hideUsedKeys
    ? state.deckBook.filter((entry) => entry.status !== "USED")
    : state.deckBook;
  const hiddenUsedCount = state.deckBook.length - listedKeys.length;

  clampPage(listedKeys.length);

  const totalPages = Math.max(1, Math.ceil(listedKeys.length / state.keyListPageSize));
  const pageStart = (state.keyListPage - 1) * state.keyListPageSize;
  const pageEnd = pageStart + state.keyListPageSize;
  const visibleKeys = listedKeys.slice(pageStart, pageEnd);

  const keyCards =
    state.deckBook.length === 0
      ? `<p class="empty">Generate a DeckBook to list your one-time deck keys.</p>`
      : listedKeys.length === 0
        ? `<p class="empty">All ${summary.total} deck keys are used. Uncheck "Hide used decks" to see them.</p>`
        : visibleKeys
          .map((entry) => {
            const isUsed = entry.status === "USED";
            const isSelected = !isUsed && state.selectedEncryptCodes.includes(entry.indexCode);
            return `
              <article class="key-card ${isUsed ? "used" : "unused"}${
                isSelected ? " selected" : ""
              }" aria-label="Deck key ${escapeHtml(entry.indexCode)}">
                <header>
                  <h4>${escapeHtml(entry.indexCode)}</h4>
                  <span class="status-badge" aria-label="Status ${entry.status}">Status: ${entry.status}</span>
                </header>
                <p><strong>Fingerprint:</strong> ${escapeHtml(entry.fingerprint)}</p>
                ${
                  isSelected
                    ? '<div class="selected-stamp" aria-label="Selected for encryption">✓ SELECTED FOR ENCRYPTION</div>'
                    : ""
                }
                <div class="button-row">
                  <button type="button" data-action="view-key" data-code="${escapeHtml(entry.indexCode)}" aria-label="View deck order for ${escapeHtml(
                    entry.indexCode
                  )}">View Deck Order</button>
                  <button type="button" class="select-key-btn${isSelected ? " is-selected" : ""}" data-action="select-key" data-code="${escapeHtml(entry.indexCode)}" ${
                    isUsed ? "disabled" : ""
                  } aria-pressed="${isSelected}" aria-label="${
                    isSelected
                      ? `${escapeHtml(entry.indexCode)} selected for encryption. Tap to unselect.`
                      : `Use ${escapeHtml(entry.indexCode)} for encryption`
                  }">${
                    isSelected ? "✓ Selected — Tap to Unselect" : "Use for Encryption"
                  }</button>
                  <button type="button" data-action="mark-used" data-code="${escapeHtml(entry.indexCode)}" ${
                    isUsed ? "disabled" : ""
                  } aria-label="Mark ${escapeHtml(entry.indexCode)} as used">Mark Used</button>
                </div>
                ${isUsed ? '<div class="used-stamp" aria-label="Key already used">USED - NEVER REUSE</div>' : ""}
              </article>
            `;
          })
          .join("");

  const setupChecklist = activeEntry
    ? activeEntry.deckOrder
        .map((card, index) => {
          const checks = state.checklist[activeEntry.indexCode] ?? Array.from({ length: 52 }, () => false);
          return `
            <label class="check-item">
              <input
                type="checkbox"
                data-action="toggle-check"
                data-code="${escapeHtml(activeEntry.indexCode)}"
                data-index="${index}"
                ${checks[index] ? "checked" : ""}
              />
              <span>${index + 1}. ${escapeHtml(card.label)} <span class="sr-only">(${escapeHtml(
                cardAccessibleLabel(card)
              )})</span></span>
            </label>
          `;
        })
        .join("")
    : "<p class=\"empty\">Select a deck key and view it to prepare a physical deck.</p>";

  const unusedEntries = state.deckBook.filter((entry) => entry.status === "UNUSED");
  const encryptOptions = unusedEntries
    .map(
      (entry) =>
        `<option value="${escapeHtml(entry.indexCode)}" ${state.selectedEncryptCode === entry.indexCode ? "selected" : ""}>${
          escapeHtml(entry.indexCode)
        }</option>`
    )
    .join("");

  const multiEncryptOptions = unusedEntries
    .map(
      (entry) =>
        `<option value="${escapeHtml(entry.indexCode)}" ${
          state.selectedEncryptCodes.includes(entry.indexCode) ? "selected" : ""
        }>${escapeHtml(entry.indexCode)}</option>`
    )
    .join("");

  const requiredKeys = requiredDeckCount(normalizedEncrypt.length);
  const selectedValidMultiKeys = findUnusedEntriesByCodes(state.selectedEncryptCodes);

  // The full walkthrough panel is shown while the tour is active or until
  // the user dismisses it. After dismissal we render a small "Show
  // walkthrough" button instead, so the tour can always be reopened.
  const guideVisible = state.walkthroughActive || !state.walkthroughDismissed;
  const guideStep = WALKTHROUGH_STEPS[state.walkthroughStep];

  appRoot.innerHTML = `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <main id="main-content" class="museum-shell" tabindex="-1">
      <div class="sr-only" role="status" aria-live="polite">${state.message ? escapeHtml(state.message) : ""}</div>
      ${isNativeApp ? renderAppNav() : ""}
      <section class="hero panel">
        <p class="kicker"><a class="kicker-link" href="https://ciphermuseum.com/" target="_blank" rel="noopener">Cipher Museum Exhibit ↗</a></p>
        <h1>DeckBook</h1>
        <p class="subtitle">A card-based one-time keybook for teaching key distribution, one-time pads, stream ciphers, and the danger of key reuse.</p>
        <p class="prominent">The deck order is the key. The clue only tells you which key to use.</p>
        <p class="secondary">The index code can be public. The deck order cannot.</p>
        <p class="mission">Your mission: get a secret to <strong>Bob</strong> while <strong>Eve</strong> listens on the wire. Your only advantage is a deck of cards you and Bob shuffled together — the deck order is a secret Eve doesn't have.</p>
        <p class="hero-steps">Five steps: <strong>1</strong> Generate keys → <strong>2</strong> Pick a key → <strong>3</strong> Prepare the deck → <strong>4</strong> Encrypt → <strong>5</strong> Decrypt. New here? Start the guided walkthrough.</p>
        <div class="button-row">
          <button type="button" id="presenter-start" aria-label="Enter full-screen presenter mode">▶ Presenter mode</button>
        </div>
        <details class="hero-facts">
          <summary>At a glance</summary>
          <div class="badge-grid" role="list" aria-label="Reality labels">
            <span role="listitem">Historical inspiration: Solitaire / manual ciphers</span>
            <span role="listitem">Educational value: High</span>
            <span role="listitem">Modern production security: Not recommended</span>
            <span role="listitem">Core lesson: Key distribution and one-time key use</span>
            <span role="listitem">Keyspace: 52! possible deck orders</span>
            <span role="listitem">Approximate size: 8.06 × 10^67</span>
            <span role="listitem">One deck key encrypts: 52 A-Z letters</span>
            <span role="listitem">Reuse allowed: Never</span>
          </div>
        </details>
      </section>

      ${
        guideVisible
          ? `<section class="panel guide-panel" id="walkthrough">
              <h2>Guided Walkthrough</h2>
              <p><strong>${escapeHtml(guideStep.title)}</strong></p>
              <p>${escapeHtml(guideStep.body)}</p>
              <p class="counts">Step ${state.walkthroughStep + 1} of ${WALKTHROUGH_STEPS.length}</p>
              <div class="button-row">
                <button type="button" id="guide-start" ${state.walkthroughActive ? "disabled" : ""}>Start tour</button>
                <button type="button" id="guide-prev" ${state.walkthroughStep === 0 ? "disabled" : ""}>Previous</button>
                <button type="button" id="guide-next">${
                  state.walkthroughStep === WALKTHROUGH_STEPS.length - 1 ? "Finish" : "Next"
                }</button>
                <button type="button" id="guide-dismiss">Dismiss guide</button>
              </div>
            </section>`
          : `<section class="panel guide-reopen" id="walkthrough">
              <p>Guided walkthrough is hidden.
                <button type="button" id="guide-reopen">Show guided walkthrough</button>
              </p>
            </section>`
      }

      <section class="panel quick-start" id="quick-start">
        <h2>Quick Start: Encrypt in 3 Steps</h2>
        <ol>
          <li>Generate DeckBook keys, then pick an UNUSED key in Deck Key List.</li>
          <li>Open Receiver Setup View and arrange cards exactly in the shown top-to-bottom order.</li>
          <li>Enter plaintext in Encrypt, select the same key, and send: index code + ciphertext.</li>
        </ol>
        <p class="mini-warning">If your message is longer than 52 letters, enable Advanced multi-deck mode and use fresh keys in sequence.</p>
      </section>

      <section class="panel how-it-works" id="how-it-works">
        <h2>How the Cipher Works</h2>
        <p>DeckBook is a Vigenere-style cipher where the <strong>keystream comes from a shuffled deck of cards</strong>. The deck order is the secret. The index code is just a label that tells the receiver which deck order to use.</p>

        <h3>1. Turn each plaintext letter into a number</h3>
        <p class="mono">A = 0, B = 1, C = 2, ..., Z = 25</p>

        <h3>2. Turn each card into a keystream letter</h3>
        <p>Each card has a value 0..51 (Ace of Spades = 0, King of Clubs = 51). For card <em>i</em> in the deck:</p>
        <p class="mono">keystream<sub>i</sub> = card<sub>i</sub>.value mod 26</p>
        <p>One card per keystream letter, so 52 cards encrypt up to <strong>52 letters</strong>. Each of the 26 alphabet letters is hit by exactly two cards, so the keystream is uniformly distributed. Longer messages need more decks (Advanced multi-deck mode).</p>

        <h3>3. Add to encrypt, subtract to decrypt</h3>
        <p class="mono">cipher<sub>i</sub> = ( plain<sub>i</sub> + keystream<sub>i</sub> ) mod 26</p>
        <p class="mono">plain<sub>i</sub>  = ( cipher<sub>i</sub> - keystream<sub>i</sub> + 26 ) mod 26</p>

        <h3>Worked example</h3>
        <p>Plaintext <span class="mono">HI</span>. Suppose the first two cards of your deck are 4&hearts; (value 16, 16 mod 26 = 16) and 10&clubs; (value 48, 48 mod 26 = 22), giving keystream <span class="mono">[16, 22]</span>.</p>
        <ul class="example-list">
          <li><span class="mono">H</span> = 7, plus keystream 16 = 23 mod 26 = <span class="mono">X</span></li>
          <li><span class="mono">I</span> = 8, plus keystream 22 = 30 mod 26 = 4 = <span class="mono">E</span></li>
        </ul>
        <p>Ciphertext: <span class="mono">XE</span>. To decrypt, the receiver rebuilds the same keystream from their copy of the deck and subtracts: <span class="mono">X - 16 = H</span>, <span class="mono">E - 22 + 26 = I</span>.</p>

        <p class="mini-warning">The whole system rests on one thing: sender and receiver must already share the same private deck order. If they do not, no amount of math helps.</p>
      </section>

      ${renderVisualizerPanel(state.deckBook)}

      <section class="panel warning-panel" id="security-model">
        <h2>Security Model and Warning</h2>
        <p><strong>DeckBook is an educational physical-key model, not production cryptography.</strong> Its security comes from pre-shared secret deck orders, one-time use, and disciplined key handling.</p>
        <p><strong>Do not use DeckBook to protect real secrets. Use modern, audited cryptographic tools for real security.</strong></p>
        <ol>
          <li>Deck orders are generated with cryptographic randomness.</li>
          <li>Both parties already share the same private DeckBook.</li>
          <li>Each deck order is used once.</li>
          <li>Used deck keys are never reused.</li>
          <li>The actual deck order is never transmitted publicly.</li>
          <li>The index code does not reveal the deck order.</li>
          <li>Message length and human error remain real risks.</li>
        </ol>
      </section>

      <section class="panel controls" id="generate">
        <h2 class="step-heading"><span class="step-chip" aria-hidden="true">1</span>Generate DeckBook</h2>
        <div class="control-row">
          <label for="mode">DeckBook size</label>
          <select id="mode" aria-label="DeckBook size mode">
            <option value="10" ${state.mode === "10" ? "selected" : ""}>Demo Mode - 10 keys</option>
            <option value="100" ${state.mode === "100" ? "selected" : ""}>Education Mode - 100 keys</option>
            <option value="1000" ${state.mode === "1000" ? "selected" : ""}>Ridiculous Mode - 1,000 keys</option>
          </select>
        </div>
        <div class="button-row">
          <button type="button" id="generate-book" ${state.isGenerating ? "disabled" : ""} aria-label="Generate secure DeckBook entries">Generate Secure DeckBook</button>
          <button type="button" id="export-book" ${summary.total === 0 ? "disabled" : ""}>Export DeckBook as JSON</button>
          <button type="button" id="import-book">Import DeckBook from JSON</button>
          <button type="button" id="clear-book" ${summary.total === 0 ? "disabled" : ""}>Clear DeckBook</button>
          <input id="import-file" type="file" accept="application/json" hidden />
        </div>
        <p class="mini-warning">Keep this DeckBook secret. Anyone with the DeckBook can decrypt messages encrypted with it.</p>
        <p class="counts">Total deck keys: ${summary.total} | Unused: ${summary.unused} | Used: ${summary.used}</p>
        <p class="storage-note">Browser storage is not a secure vault. This local save is for demo convenience only.</p>
      </section>

      <section class="panel" id="key-list">
        <h2 class="step-heading"><span class="step-chip" aria-hidden="true">2</span>Deck Key List</h2>
        <div class="key-list-tools">
          <label class="hide-used-toggle">
            <input type="checkbox" id="hide-used" ${state.hideUsedKeys ? "checked" : ""} ${
              summary.used === 0 ? "disabled" : ""
            } />
            <span>Hide used decks${summary.used > 0 ? ` (${summary.used} used)` : ""}</span>
          </label>
        </div>
        <div class="pager">
          <p class="counts">Showing ${listedKeys.length === 0 ? 0 : pageStart + 1}-${Math.min(pageEnd, listedKeys.length)} of ${listedKeys.length}${
            hiddenUsedCount > 0 ? ` (${hiddenUsedCount} used hidden)` : ""
          }</p>
          ${
            totalPages > 1
              ? `<div class="pager-controls">
            <button type="button" id="page-first" ${state.keyListPage <= 1 ? "disabled" : ""}>First</button>
            <button type="button" id="page-prev" ${state.keyListPage <= 1 ? "disabled" : ""}>Prev</button>
            <span class="status-badge" aria-label="Current key page">Page ${state.keyListPage} / ${totalPages}</span>
            <button type="button" id="page-next" ${state.keyListPage >= totalPages ? "disabled" : ""}>Next</button>
            <button type="button" id="page-last" ${state.keyListPage >= totalPages ? "disabled" : ""}>Last</button>
          </div>
          <div class="pager-size">
            <label for="page-size">Keys per page</label>
            <select id="page-size" aria-label="Deck keys per page">
              <option value="24" ${state.keyListPageSize === 24 ? "selected" : ""}>24</option>
              <option value="60" ${state.keyListPageSize === 60 ? "selected" : ""}>60</option>
              <option value="120" ${state.keyListPageSize === 120 ? "selected" : ""}>120</option>
            </select>
          </div>`
              : ""
          }
        </div>
        <div class="key-grid">${keyCards}</div>
        ${
          selectedValidMultiKeys.length > 0
            ? `<div class="next-step-cta">
                 <p class="next-step-summary">✓ Selected: <strong>${escapeHtml(
                   selectedValidMultiKeys[0].indexCode
                 )}</strong></p>
                 <div class="cta-actions">
                   <button type="button" id="go-to-encrypt" class="cta-button">Next: Encrypt →</button>
                   <button type="button" id="cta-mark-used" data-code="${escapeHtml(
                     selectedValidMultiKeys[0].indexCode
                   )}" class="cta-secondary">Mark Used</button>
                 </div>
               </div>`
            : ""
        }
      </section>

      <section class="panel" id="receiver-setup">
        <h2 class="step-heading"><span class="step-chip" aria-hidden="true">3</span>Receiver Setup View</h2>
        ${
          activeEntry
            ? `<p><strong>Deck Key:</strong> ${escapeHtml(activeEntry.indexCode)} | <strong>Fingerprint:</strong> ${escapeHtml(
                activeEntry.fingerprint
              )}</p>`
            : ""
        }
        <p>The receiver must have the same DeckBook or the same physical deck order before decryption is possible.</p>
        <p class="mini-warning">Do not transmit deck order publicly. Share only the index code and ciphertext.</p>
        <div class="control-row setup-mode">
          <label for="setup-view-mode">Receiver setup display</label>
          <select id="setup-view-mode" aria-label="Receiver setup display mode">
            <option value="visual" ${state.setupViewMode === "visual" ? "selected" : ""}>Compact visual card order</option>
            <option value="realistic" ${state.setupViewMode === "realistic" ? "selected" : ""}>Realistic card images</option>
            <option value="checklist" ${state.setupViewMode === "checklist" ? "selected" : ""}>Checklist-only (full line list)</option>
          </select>
        </div>
        <div class="setup-labels"><span>TOP OF DECK</span><span>BOTTOM OF DECK</span></div>
        ${
          state.setupViewMode === "visual"
            ? `<div class="deck-visual" ${activeEntry ? 'role="list"' : ""} aria-label="Visual deck order from top to bottom">
                ${
                  activeEntry
                    ? activeEntry.deckOrder
                        .map(
                          (card, index) =>
                            `<div class="deck-card ${
                              card.suit === "HEARTS" || card.suit === "DIAMONDS" ? "red" : "black"
                            }" role="listitem" aria-label="Position ${index + 1}: ${escapeHtml(cardAccessibleLabel(card))}">
                              <span class="deck-pos">${index + 1}</span>
                              <span class="deck-face">${escapeHtml(card.label)}</span>
                            </div>`
                        )
                        .join("")
                    : '<p class="empty">Select a deck key and view it to see card order.</p>'
                }
              </div>`
            : ""
        }
        ${
          state.setupViewMode === "realistic"
            ? `<div class="deck-visual realistic" ${activeEntry ? 'role="list"' : ""} aria-label="Visual deck order from top to bottom">
                ${
                  activeEntry
                    ? activeEntry.deckOrder
                        .map(
                          (card, index) =>
                            `<div class="deck-card-real" role="listitem" aria-label="Position ${index + 1}: ${escapeHtml(cardAccessibleLabel(card))}">
                              <span class="deck-pos">${index + 1}</span>
                              ${renderCardFaceSvg(card, "realistic", 72, 100)}
                            </div>`
                        )
                        .join("")
                    : '<p class="empty">Select a deck key and view it to see card order.</p>'
                }
              </div>`
            : ""
        }
        <div class="setup-list ${state.setupViewMode === "checklist" ? "checklist-only" : ""}" role="group" aria-label="Deck arrangement checklist">${setupChecklist}</div>
        <div class="button-row">
          <button type="button" id="copy-setup" ${activeEntry ? "" : "disabled"}>Copy setup instructions</button>
          <button type="button" id="print-setup" ${activeEntry ? "" : "disabled"}>Print physical deck sheet</button>
        </div>
        ${
          activeEntry
            ? `<div class="print-sheet" aria-hidden="true">
                <h2>DeckBook — Physical Setup Sheet</h2>
                <p><strong>Deck Key:</strong> ${escapeHtml(activeEntry.indexCode)}</p>
                <p><strong>Fingerprint:</strong> ${escapeHtml(activeEntry.fingerprint)}</p>
                <p>Arrange a real deck of cards in this exact order, from the top of the deck down. Verify every card. One card out of place breaks decryption.</p>
                ${
                  state.setupViewMode === "realistic"
                    ? `<div class="print-cards-real">
                        ${activeEntry.deckOrder
                          .map(
                            (card, index) =>
                              `<div class="print-card-real ${card.suit === "HEARTS" || card.suit === "DIAMONDS" ? "red" : "black"}">
                                <span class="deck-pos">${index + 1}</span>
                                ${renderCardFaceSvg(card, "realistic", 72, 100)}
                                <span class="print-card-label">${escapeHtml(card.label)}</span>
                              </div>`
                          )
                          .join("")}
                      </div>`
                    : `<ol class="print-cards">
                        ${activeEntry.deckOrder
                          .map((card) => `<li class="${card.suit === "HEARTS" || card.suit === "DIAMONDS" ? "red" : "black"}">${escapeHtml(card.label)}</li>`)
                          .join("")}
                      </ol>`
                }
                <p class="print-warn">Keep this sheet secret. Anyone who photographs it holds the key. Destroy it after setup.</p>
              </div>`
            : ""
        }
      </section>

      <section class="panel" id="encrypt-panel">
        <h2 class="step-heading"><span class="step-chip" aria-hidden="true">4</span>Encrypt</h2>
        <p>Spaces and punctuation are removed for this educational A-Z cipher.</p>
        <label class="field-label" for="encrypt-input">Plaintext message</label>
        <textarea id="encrypt-input" rows="4" placeholder="Enter plaintext message">${escapeHtml(state.encryptInput)}</textarea>

        <div class="button-row">
          <button type="button" id="encrypt-button" ${unusedEntries.length > 0 ? "" : "disabled"}>Encrypt</button>
          <button type="button" id="mark-encrypt-used" ${state.encryptOutput ? "" : "disabled"}>Mark output key(s) as USED</button>
        </div>

        <div class="control-row">
          <label for="advanced-mode-toggle">Advanced multi-deck mode</label>
          <input id="advanced-mode-toggle" type="checkbox" ${state.advancedMode ? "checked" : ""} aria-label="Enable advanced multi-deck mode" />
        </div>

        ${
          state.advancedMode
            ? `<div class="control-row">
                <label for="encrypt-keys-multi">Select unused deck keys (multi-select)</label>
                <select id="encrypt-keys-multi" multiple size="6" ${multiEncryptOptions ? "" : "disabled"}>${multiEncryptOptions}</select>
              </div>
              <div class="button-row">
                <button type="button" id="auto-select-keys" ${unusedEntries.length === 0 ? "disabled" : ""}>Auto-select required keys</button>
              </div>
              <p>Message length: ${normalizedEncrypt.length} letters | Deck keys required: ${requiredKeys}</p>
              <p>Selected keys: ${selectedValidMultiKeys.length === 0 ? "None" : escapeHtml(selectedValidMultiKeys.map((item) => item.indexCode).join(", "))}</p>`
            : `<div class="control-row">
                <label for="encrypt-key">Select unused deck key</label>
                <select id="encrypt-key" ${encryptOptions ? "" : "disabled"}>
                  <option value="">Select key</option>
                  ${encryptOptions}
                </select>
              </div>
              <p>Plaintext length: ${normalizedEncrypt.length} letters | Available keystream: ${LETTERS_PER_DECK} letters</p>`
        }

        <div id="encrypt-steps" class="steps-container" aria-live="polite">${renderEncryptLiveHtml()}</div>
        ${
          state.encryptOutput
            ? `<div class="output">
                <p><strong>Index Code${state.encryptOutput.indexCodes.length > 1 ? "s" : ""}:</strong> ${escapeHtml(
                  state.encryptOutput.indexCodes.join(", ")
                )}</p>
                <p><strong>Normalized Plaintext:</strong> ${escapeHtml(state.encryptOutput.normalizedPlaintext)}</p>
                <p><strong>Ciphertext:</strong> ${escapeHtml(state.encryptOutput.ciphertext)}</p>
                <div class="share-block">
                  <div class="share-qr">
                    <img data-qr="${escapeHtml(
                      buildShareUrl(shareBaseUrl(), state.encryptOutput.indexCodes, state.encryptOutput.ciphertext)
                    )}" alt="QR code linking to this encrypted message" width="150" height="150" />
                  </div>
                  <div class="share-copy">
                    <p><strong>Send it over the public channel.</strong> Scan this QR on another device — or copy the link. It carries only the index code and ciphertext. The receiving device decrypts it <em>only</em> if it already holds this DeckBook.</p>
                    <div class="button-row">
                      <button type="button" id="copy-share-link">Copy share link</button>
                    </div>
                  </div>
                </div>
                ${
                  state.encryptOutput.indexCodes.every(
                    (code) => state.deckBook.find((entry) => entry.indexCode === code)?.status === "USED"
                  )
                    ? `<p class="marked-used-confirm">✓ ${escapeHtml(
                        state.encryptOutput.indexCodes.join(", ")
                      )} marked as USED — this key can never be reused.</p>`
                    : `<div class="mark-used-cta">
                        <p class="mini-warning">Once you've sent it, mark the key used so it can never be reused:</p>
                        <button type="button" id="mark-output-used" class="cta-button">Mark ${escapeHtml(
                          state.encryptOutput.indexCodes.join(", ")
                        )} as USED</button>
                      </div>`
                }
              </div>`
            : ""
        }
      </section>

      <section class="panel ${state.incomingShare ? "incoming" : ""}" id="decrypt-panel">
        <h2 class="step-heading"><span class="step-chip" aria-hidden="true">5</span>Decrypt</h2>
        ${
          state.incomingShare
            ? `<p class="incoming-banner">An encrypted message arrived via share link. The index code and ciphertext below came off the public channel — the deck order did not. Press Decrypt: it works only if this device already holds the matching DeckBook.</p>`
            : ""
        }
        <label for="decrypt-index">Index code (or comma-separated codes for multi-deck)</label>
        <input id="decrypt-index" value="${escapeHtml(
          state.decryptIndexCode
        )}" placeholder="LANTERN-42 or LANTERN-42, CROWN-88" autocomplete="off" />
        <label for="decrypt-cipher">Ciphertext</label>
        <textarea id="decrypt-cipher" rows="3" placeholder="DMTQZ RQHLA UEPVK">${escapeHtml(state.decryptCiphertext)}</textarea>
        <div class="button-row">
          <button type="button" id="decrypt-button" ${summary.total === 0 ? "disabled" : ""}>Decrypt</button>
        </div>
        ${
          state.decryptOutput
            ? `<div class="output">
                <p><strong>Plaintext:</strong> ${escapeHtml(state.decryptOutput.plaintext)}</p>
                ${state.decryptOutput.warning ? `<p class="mini-warning">${escapeHtml(state.decryptOutput.warning)}</p>` : ""}
              </div>`
            : ""
        }
      </section>

      ${renderSimulatorPanel(unusedEntries)}

      ${renderAttackLabPanel()}

      ${renderChallengePanel()}

      <section class="panel" id="mistakes">
        <h2>What Goes Wrong?</h2>
        <label for="mistake-choice">Choose a failure mode</label>
        <select id="mistake-choice">${mistakesOptions}</select>
        <p class="mistake-copy">${escapeHtml(MISTAKES[state.mistakeKey])}</p>
      </section>

      <section class="panel" id="absurd-scale">
        <h2>Absurd Scale</h2>
        <p>A single 52-card deck has 52! possible orders, approximately 8.06 × 10^67. That is far beyond billions.</p>
        <p class="mono">80,658,175,170,943,878,571,660,636,856,403,766,975,289,505,440,883,277,824,000,000,000,000</p>
        <p>This DeckBook samples a tiny number of possible deck orders from an unimaginably large keyspace.</p>
        <p>The limitation is not number of possible keys. The limitation is safe sharing, tracking, and never reusing keys.</p>
      </section>

      <section class="panel" id="modern-crypto">
        <h2>Why Modern Key Exchange Exists</h2>
        <p>DeckBook teaches the hardest part of cryptography: how do two people get the same secret key safely?</p>
        <p>DeckBook requires a pre-shared secret keybook. Modern public-key cryptography was created to solve shared secret establishment without meeting first.</p>
        <p>Connections: one-time pads, stream ciphers, session keys, key identifiers, Diffie-Hellman, public-key encryption, and key encapsulation mechanisms.</p>
        <p>Post-quantum cryptography asks the next question: how do we establish shared secrets safely even against future quantum computers? ML-KEM is one modern answer.</p>
      </section>

      <section class="panel" id="advanced-mode">
        <h2>Advanced: Multi-Deck Messages</h2>
        <p>Enable Advanced multi-deck mode in Encrypt to consume multiple unused keys in sequence for longer messages.</p>
        <p>Example: Message length 72 letters requires 3 deck keys. This app can auto-select required keys in order.</p>
        <p class="mini-warning">Each deck key is consumed once. Longer messages require more one-time key material.</p>
      </section>

      <section class="panel" id="about-copy">
        <h2>What is DeckBook?</h2>
        <p>DeckBook is a card-based one-time keybook. Each deck order is a secret key. The index code tells the receiver which secret deck order to use, but the deck order itself must already be shared privately.</p>
        <h3>Why cards?</h3>
        <p>A 52-card deck has 52! possible orders, approximately 8.06 × 10^67. The problem is not creating enough possible keys. The problem is sharing, protecting, tracking, and never reusing them.</p>
        <h3>Is this secure?</h3>
        <p>DeckBook is an educational model, not production cryptography. It demonstrates why one-time key material can be powerful and why key management is difficult.</p>
        <h3>What does the clue do?</h3>
        <p>The clue, or index code, identifies which deck key to use. It does not generate the key, protect the key, or replace the key.</p>
        <h3>What breaks it?</h3>
        <p>The system breaks if the deck order is exposed, reused, generated poorly, arranged incorrectly, or shared over an insecure channel.</p>
        <h3>Inspiration</h3>
        <p>This educational app is inspired by manual Solitaire-style encryption teaching material and adapts those ideas into a modern browser classroom demo.</p>
      </section>

      <section class="panel" id="glossary">
        <h2>Glossary</h2>
        <dl class="glossary">
          <dt>Deck order</dt><dd>The secret. The exact top-to-bottom arrangement of 52 cards. There are 52! (~8.06 × 10⁶⁷) possible orders.</dd>
          <dt>Index code</dt><dd>A public label (like <span class="mono">LANTERN-42</span>) that names which deck key to use. It reveals nothing about the order.</dd>
          <dt>Keystream</dt><dd>The sequence of shift values the cipher adds to your letters. Here, each card contributes one value: <span class="mono">card value mod 26</span>.</dd>
          <dt>Stream cipher</dt><dd>A cipher that encrypts one symbol at a time by combining it with a keystream.</dd>
          <dt>One-time pad</dt><dd>A cipher whose key is random, as long as the message, and used only once. Unbreakable in theory — if those rules hold.</dd>
          <dt>Key reuse / two-time pad</dt><dd>Using one key for two messages. It leaks the difference of the plaintexts and can be fully broken. Never do it.</dd>
          <dt>Crib</dt><dd>A guessed word an attacker slides along ciphertext to recover text. See the Attack Lab.</dd>
          <dt>Fingerprint</dt><dd>A short checksum of a deck order (from SHA-256). Two people compare it out loud to confirm identical decks.</dd>
          <dt>Key distribution</dt><dd>The hard problem: getting the same secret to both people safely, before any message is sent.</dd>
          <dt>KEM / ML-KEM</dt><dd>Key Encapsulation Mechanism — how modern (and post-quantum) systems establish a shared secret without meeting first.</dd>
        </dl>
      </section>

      <section class="panel" id="educators">
        <h2>For Educators</h2>
        <p>DeckBook is a ready-to-run classroom exhibit — no accounts, no installs, works offline once loaded. A full lesson (45–60 min) maps onto the numbered steps and the Attack Lab and Challenge.</p>
        <ul class="web-only">
          <li><a href="https://github.com/systemslibrarian/DeckBook/blob/main/docs/teaching-guide.md" target="_blank" rel="noopener">Teaching guide</a> — objectives, timed lesson flow, discussion questions, assessment, and standards tie-ins.</li>
          <li><a href="https://github.com/systemslibrarian/DeckBook/blob/main/docs/worksheet.md" target="_blank" rel="noopener">Student worksheet</a> — a printable, self-guided path through the exhibit.</li>
        </ul>
        <p>Use <strong>Presenter mode</strong> (button at the top) for a full-screen, arrow-key, one-panel-at-a-time view on a projector or kiosk. Use <strong>Print physical deck sheet</strong> in Receiver Setup to pair the app with a real deck of cards.</p>
      </section>

      <section class="panel framing">
        <p>DeckBook looks playful: cards, clues, and secret keybooks. But the lesson is serious. The hard part of cryptography is not only scrambling a message. The hard part is getting the right secret to the right person, using it once, and never letting it leak.</p>
      </section>

      <footer class="footer-note">
        DeckBook is an educational demonstration. Do not use it to protect real secrets. Use modern, audited cryptographic tools for real security.
      </footer>

      ${state.message ? `<div class="toast" role="status" aria-live="polite">${escapeHtml(state.message)}</div>` : ""}
    </main>
  `;

  bindEvents();
  // The native app shows one section per screen, so the reference-panel
  // disclosures aren't used there — panels render fully expanded.
  if (!isNativeApp) {
    applyCollapsibles();
  }
  applyPresenterMode();
  applyNativeView();
}

// Turn each reference panel into a native-feeling disclosure: its <h2>
// becomes a keyboard-operable toggle and everything below it is hidden while
// collapsed. Done post-render (the template stays plain sections) and is
// idempotent because render() rebuilds the DOM fresh each time.
function applyCollapsibles(): void {
  for (const { id } of COLLAPSIBLE_PANELS) {
    const section = document.querySelector<HTMLElement>(`#${id}`);
    const heading = section?.querySelector<HTMLHeadingElement>(":scope > h2");
    if (!section || !heading) {
      continue;
    }

    const isCollapsed = state.collapsed.has(id);
    section.classList.add("collapsible");
    section.classList.toggle("is-collapsed", isCollapsed);

    // Move everything after the heading into a body wrapper we can hide.
    const body = document.createElement("div");
    body.className = "collapsible-body";
    body.id = `${id}-body`;
    [...section.children].filter((child) => child !== heading).forEach((child) => body.appendChild(child));
    section.appendChild(body);

    // Put a real <button> inside the <h2> so the element keeps its heading
    // semantics (document outline) while the button provides the disclosure
    // control with proper aria-expanded/controls.
    const button = document.createElement("button");
    button.type = "button";
    button.className = "collapsible-toggle";
    button.setAttribute("aria-expanded", String(!isCollapsed));
    button.setAttribute("aria-controls", body.id);
    button.innerHTML = heading.innerHTML;
    heading.innerHTML = "";
    heading.classList.add("collapsible-heading");
    heading.appendChild(button);

    button.addEventListener("click", () => {
      if (state.collapsed.has(id)) {
        state.collapsed.delete(id);
      } else {
        state.collapsed.add(id);
      }
      render();
    });
  }
}

// Presenter mode post-processing. render() rebuilds the panels fresh each
// time (no leftover inline styles), so here we simply hide every top-level
// child except the current curated panel and mount a fixed control bar.
// The bar lives on <body>, outside appRoot, and is rebuilt every render.
function applyPresenterMode(): void {
  document.querySelector(".presenter-bar")?.remove();
  const main = document.querySelector<HTMLElement>("#main-content");

  if (!state.presenterMode || !main) {
    document.body.classList.remove("presenter");
    return;
  }

  document.body.classList.add("presenter");
  const panels = PRESENTER_PANELS;
  const idx = Math.min(Math.max(0, state.presenterIndex), panels.length - 1);

  const currentId = panels[idx].id;
  main.querySelectorAll<HTMLElement>(":scope > *").forEach((el) => {
    // Keep the toast and the screen-reader live region visible so status
    // announcements still reach users while presenting.
    if (el.id === currentId || el.classList.contains("toast") || el.classList.contains("sr-only")) {
      el.style.display = "";
      return;
    }
    el.style.display = "none";
  });
  // A presented panel is always shown expanded, even if it is collapsed in
  // the normal scrolling view.
  main.querySelector<HTMLElement>(`#${currentId}`)?.classList.remove("is-collapsed");

  const bar = document.createElement("div");
  bar.className = "presenter-bar";
  bar.innerHTML = `
    <button type="button" id="presenter-prev" ${idx === 0 ? "disabled" : ""} aria-label="Previous slide">◀ Prev</button>
    <span class="presenter-pos" role="status" aria-live="polite">${idx + 1} / ${panels.length} — ${escapeHtml(
      panels[idx].title
    )}</span>
    <button type="button" id="presenter-next" ${idx === panels.length - 1 ? "disabled" : ""} aria-label="Next slide">Next ▶</button>
    <button type="button" id="presenter-exit" aria-label="Exit presenter mode">Exit</button>`;
  document.body.appendChild(bar);

  document.querySelector<HTMLButtonElement>("#presenter-prev")?.addEventListener("click", () => presenterGo(-1));
  document.querySelector<HTMLButtonElement>("#presenter-next")?.addEventListener("click", () => presenterGo(1));
  document.querySelector<HTMLButtonElement>("#presenter-exit")?.addEventListener("click", exitPresenter);

  main.querySelector<HTMLElement>(`#${currentId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function presenterGo(delta: number): void {
  state.presenterIndex = Math.min(Math.max(0, state.presenterIndex + delta), PRESENTER_PANELS.length - 1);
  render();
}

function exitPresenter(): void {
  state.presenterMode = false;
  render();
}

function bindEvents(): void {
  // Native app hamburger section menu (absent on web).
  document.querySelector<HTMLButtonElement>(".app-nav-toggle")?.addEventListener("click", () => {
    state.navMenuOpen = !state.navMenuOpen;
    render();
  });
  document.querySelector<HTMLElement>(".app-nav-scrim")?.addEventListener("click", () => {
    state.navMenuOpen = false;
    render();
  });
  document.querySelectorAll<HTMLButtonElement>(".app-nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      const key = item.dataset.view;
      if (key) selectView(key);
    });
  });

  const modeSelect = document.querySelector<HTMLSelectElement>("#mode");
  modeSelect?.addEventListener("change", (event) => {
    const next = (event.currentTarget as HTMLSelectElement).value as DeckMode;
    state.mode = next;
  });

  const presenterStart = document.querySelector<HTMLButtonElement>("#presenter-start");
  presenterStart?.addEventListener("click", () => {
    state.presenterMode = true;
    state.presenterIndex = 0;
    render();
  });

  const guideStart = document.querySelector<HTMLButtonElement>("#guide-start");
  guideStart?.addEventListener("click", () => {
    openGuideStep(state.walkthroughStep);
  });

  const guidePrev = document.querySelector<HTMLButtonElement>("#guide-prev");
  guidePrev?.addEventListener("click", () => {
    openGuideStep(state.walkthroughStep - 1);
  });

  const guideNext = document.querySelector<HTMLButtonElement>("#guide-next");
  guideNext?.addEventListener("click", () => {
    if (state.walkthroughStep >= WALKTHROUGH_STEPS.length - 1) {
      finishGuide();
      return;
    }
    openGuideStep(state.walkthroughStep + 1);
  });

  const guideDismiss = document.querySelector<HTMLButtonElement>("#guide-dismiss");
  guideDismiss?.addEventListener("click", () => {
    state.walkthroughActive = false;
    state.walkthroughDismissed = true;
    saveGuideDismissed(true);
    render();
  });

  // Reopen the walkthrough after it has been dismissed. Without this the
  // guide would be permanently hidden until localStorage was cleared.
  const guideReopen = document.querySelector<HTMLButtonElement>("#guide-reopen");
  guideReopen?.addEventListener("click", () => {
    openGuideStep(0);
  });

  const generateButton = document.querySelector<HTMLButtonElement>("#generate-book");
  generateButton?.addEventListener("click", async () => {
    state.isGenerating = true;
    state.message = "Generating secure DeckBook with crypto.getRandomValues()...";
    render();

    const count = Number(state.mode);
    // Overlap the riffle animation with the actual key generation so the
    // total wait is the longer of the two, not their sum.
    const [deckBook] = await Promise.all([generateDeckBook(count), playShuffleAnimation()]);
    state.deckBook = deckBook;
    state.isGenerating = false;
    state.activeViewCode = deckBook[0]?.indexCode ?? null;
    state.selectedEncryptCode = deckBook.find((entry) => entry.status === "UNUSED")?.indexCode ?? "";
    state.selectedEncryptCodes = state.selectedEncryptCode ? [state.selectedEncryptCode] : [];
    state.encryptOutput = null;
    state.decryptOutput = null;
    state.checklist = {};
    state.keyListPage = 1;
    saveDeckBook();
    flash(`Generated ${count} secure deck keys.`);
    render();
  });

  const exportButton = document.querySelector<HTMLButtonElement>("#export-book");
  exportButton?.addEventListener("click", () => {
    const proceed = window.confirm(
      "Exported DeckBooks contain secret key material. Anyone with this file can decrypt related messages. Continue export?"
    );
    if (!proceed) {
      return;
    }
    const blob = new Blob([JSON.stringify(state.deckBook, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `deckbook-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    flash("DeckBook JSON exported.");
    render();
  });

  const importButton = document.querySelector<HTMLButtonElement>("#import-book");
  const fileInput = document.querySelector<HTMLInputElement>("#import-file");

  importButton?.addEventListener("click", () => {
    fileInput?.click();
  });

  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }

    const proceed = window.confirm(
      "In real use, sharing the DeckBook is the hard part. Sending it over an insecure channel defeats the system. Continue import for demo use?"
    );
    if (!proceed) {
      fileInput.value = "";
      return;
    }

    const text = await file.text();
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed) || !parsed.every(isDeckBookEntryLike)) {
        throw new Error("Invalid DeckBook format");
      }
      state.deckBook = parsed;
      state.activeViewCode = state.deckBook[0]?.indexCode ?? null;
      state.selectedEncryptCode = state.deckBook.find((entry) => entry.status === "UNUSED")?.indexCode ?? "";
      state.selectedEncryptCodes = state.selectedEncryptCode ? [state.selectedEncryptCode] : [];
      state.encryptOutput = null;
      state.decryptOutput = null;
      state.keyListPage = 1;
      saveDeckBook();
      flash(`Imported ${state.deckBook.length} deck keys.`);
      render();
    } catch {
      flash("Import failed: invalid DeckBook JSON.");
      render();
    } finally {
      fileInput.value = "";
    }
  });

  const clearButton = document.querySelector<HTMLButtonElement>("#clear-book");
  clearButton?.addEventListener("click", () => {
    const proceed = window.confirm("Clear the current DeckBook from this browser?");
    if (!proceed) {
      return;
    }
    state.deckBook = [];
    state.activeViewCode = null;
    state.selectedEncryptCode = "";
    state.selectedEncryptCodes = [];
    state.encryptOutput = null;
    state.decryptOutput = null;
    state.checklist = {};
    state.keyListPage = 1;
    saveDeckBook();
    flash("DeckBook cleared.");
    render();
  });

  const pageFirst = document.querySelector<HTMLButtonElement>("#page-first");
  pageFirst?.addEventListener("click", () => {
    state.keyListPage = 1;
    render();
  });

  const pagePrev = document.querySelector<HTMLButtonElement>("#page-prev");
  pagePrev?.addEventListener("click", () => {
    state.keyListPage = Math.max(1, state.keyListPage - 1);
    render();
  });

  const pageNext = document.querySelector<HTMLButtonElement>("#page-next");
  pageNext?.addEventListener("click", () => {
    state.keyListPage += 1;
    render();
  });

  const pageLast = document.querySelector<HTMLButtonElement>("#page-last");
  pageLast?.addEventListener("click", () => {
    const listedCount = state.hideUsedKeys
      ? state.deckBook.filter((entry) => entry.status !== "USED").length
      : state.deckBook.length;
    state.keyListPage = Math.max(1, Math.ceil(listedCount / state.keyListPageSize));
    render();
  });

  const pageSize = document.querySelector<HTMLSelectElement>("#page-size");
  pageSize?.addEventListener("change", (event) => {
    state.keyListPageSize = Number((event.currentTarget as HTMLSelectElement).value);
    state.keyListPage = 1;
    render();
  });

  const hideUsed = document.querySelector<HTMLInputElement>("#hide-used");
  hideUsed?.addEventListener("change", (event) => {
    state.hideUsedKeys = (event.currentTarget as HTMLInputElement).checked;
    state.keyListPage = 1;
    render();
  });

  document.querySelectorAll<HTMLButtonElement>("button[data-action='view-key']").forEach((button) => {
    button.addEventListener("click", () => {
      const code = button.dataset.code;
      if (!code) {
        return;
      }
      state.activeViewCode = code;
      if (!state.checklist[code]) {
        state.checklist[code] = Array.from({ length: 52 }, () => false);
      }
      render();
      document.querySelector("#receiver-setup")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.querySelectorAll<HTMLButtonElement>("button[data-action='select-key']").forEach((button) => {
    button.addEventListener("click", () => {
      const code = button.dataset.code;
      if (!code) {
        return;
      }
      // Single-select: only one deck can be armed for encryption at a time.
      // Tapping the already-selected deck unselects it; tapping a different
      // deck replaces the selection. Stay on the key list — the "Next:
      // Encrypt" link below the grid takes you to the next step.
      // No toast here — the sticky selection box (and the card's own state)
      // already show what's selected, so a popup would be redundant.
      if (state.selectedEncryptCode === code) {
        state.selectedEncryptCode = "";
        state.selectedEncryptCodes = [];
      } else {
        state.selectedEncryptCode = code;
        state.selectedEncryptCodes = [code];
      }
      render();
    });
  });

  // "Next: Encrypt" link under the key grid: go to the Encrypt step once a key
  // is selected. Native switches view; web scrolls to the encrypt panel.
  document.querySelector<HTMLButtonElement>("#go-to-encrypt")?.addEventListener("click", () => {
    if (isNativeApp) {
      selectView("encrypt");
    } else {
      document.querySelector("#encrypt-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // Mark-used shortcut in the selection CTA: spend the selected deck and clear
  // the selection so the CTA reflects that this key is now off the board.
  document.querySelector<HTMLButtonElement>("#cta-mark-used")?.addEventListener("click", (event) => {
    const code = (event.currentTarget as HTMLButtonElement).dataset.code;
    if (!code) {
      return;
    }
    markKeyStatus(code, "USED");
    state.selectedEncryptCode = "";
    state.selectedEncryptCodes = [];
    flash(`${code} marked as USED.`);
    render();
  });

  document.querySelectorAll<HTMLButtonElement>("button[data-action='mark-used']").forEach((button) => {
    button.addEventListener("click", () => {
      const code = button.dataset.code;
      if (!code) {
        return;
      }
      markKeyStatus(code, "USED");
      state.selectedEncryptCode = state.deckBook.find((entry) => entry.status === "UNUSED")?.indexCode ?? "";
      state.selectedEncryptCodes = state.selectedEncryptCodes.filter((entryCode) => entryCode !== code);
      if (state.selectedEncryptCode && state.selectedEncryptCodes.length === 0) {
        state.selectedEncryptCodes = [state.selectedEncryptCode];
      }
      flash(`${code} marked as USED.`);
      render();
    });
  });

  document.querySelectorAll<HTMLInputElement>("input[data-action='toggle-check']").forEach((input) => {
    input.addEventListener("change", () => {
      const code = input.dataset.code;
      const index = Number(input.dataset.index);
      if (!code || Number.isNaN(index)) {
        return;
      }
      if (!state.checklist[code]) {
        state.checklist[code] = Array.from({ length: 52 }, () => false);
      }
      state.checklist[code][index] = input.checked;
    });
  });

  const copySetup = document.querySelector<HTMLButtonElement>("#copy-setup");
  copySetup?.addEventListener("click", async () => {
    const active = getActiveEntry();
    if (!active) {
      return;
    }
    await navigator.clipboard.writeText(getSetupText(active));
    flash("Setup instructions copied.");
    render();
  });

  const printSetup = document.querySelector<HTMLButtonElement>("#print-setup");
  printSetup?.addEventListener("click", () => {
    if (!getActiveEntry()) {
      return;
    }
    // Reveal the print-only sheet, then invoke the browser print dialog. The
    // afterprint listener (set at bootstrap) removes the class again.
    document.body.classList.add("print-setup");
    window.print();
  });

  const copyShareLink = document.querySelector<HTMLButtonElement>("#copy-share-link");
  copyShareLink?.addEventListener("click", async () => {
    if (!state.encryptOutput) {
      return;
    }
    const url = buildShareUrl(shareBaseUrl(), state.encryptOutput.indexCodes, state.encryptOutput.ciphertext);
    await navigator.clipboard.writeText(url);
    flash("Share link copied. It carries only the index code + ciphertext.");
    render();
  });

  const setupViewMode = document.querySelector<HTMLSelectElement>("#setup-view-mode");
  setupViewMode?.addEventListener("change", (event) => {
    state.setupViewMode = (event.currentTarget as HTMLSelectElement).value as SetupViewMode;
    saveSetupViewMode(state.setupViewMode);
    render();
  });

  const encryptInput = document.querySelector<HTMLTextAreaElement>("#encrypt-input");
  encryptInput?.addEventListener("input", (event) => {
    state.encryptInput = (event.currentTarget as HTMLTextAreaElement).value;
    // Refresh only the steps container, NOT the whole panel — otherwise the
    // textarea would be recreated on every keystroke and the cursor would
    // jump to the end.
    repaintEncryptSteps();
  });

  // Remember whether each collapsible live-preview is open. The `toggle` event
  // doesn't bubble, so listen on the persistent container in the capture phase;
  // storing the state keeps it open across per-keystroke repaints.
  const encryptSteps = document.querySelector<HTMLDivElement>("#encrypt-steps");
  encryptSteps?.addEventListener(
    "toggle",
    (event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement)) {
        return;
      }
      if (details.dataset.collapse === "steps") {
        state.showEncryptSteps = details.open;
      } else if (details.dataset.collapse === "fingerprints") {
        state.showFingerprints = details.open;
      }
    },
    true
  );

  const advancedToggle = document.querySelector<HTMLInputElement>("#advanced-mode-toggle");
  advancedToggle?.addEventListener("change", (event) => {
    state.advancedMode = (event.currentTarget as HTMLInputElement).checked;
    if (!state.advancedMode) {
      state.selectedEncryptCodes = state.selectedEncryptCode ? [state.selectedEncryptCode] : [];
    }
    render();
  });

  const encryptSelect = document.querySelector<HTMLSelectElement>("#encrypt-key");
  encryptSelect?.addEventListener("change", (event) => {
    state.selectedEncryptCode = (event.currentTarget as HTMLSelectElement).value;
    state.selectedEncryptCodes = state.selectedEncryptCode ? [state.selectedEncryptCode] : [];
    // Refresh the per-letter math and frequency charts for the new key.
    repaintEncryptSteps();
  });

  const encryptMultiSelect = document.querySelector<HTMLSelectElement>("#encrypt-keys-multi");
  encryptMultiSelect?.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    state.selectedEncryptCodes = [...select.selectedOptions].map((option) => option.value);
    repaintEncryptSteps();
  });

  const autoSelectKeys = document.querySelector<HTMLButtonElement>("#auto-select-keys");
  autoSelectKeys?.addEventListener("click", () => {
    const length = normalizeAZ(state.encryptInput).length;
    if (length === 0) {
      flash("Enter plaintext first to calculate required deck keys.");
      render();
      return;
    }
    const required = requiredDeckCount(length);
    const candidates = state.deckBook.filter((entry) => entry.status === "UNUSED").slice(0, required);
    if (candidates.length < required) {
      flash(`Not enough UNUSED keys. Need ${required}, found ${candidates.length}.`);
      render();
      return;
    }
    state.selectedEncryptCodes = candidates.map((entry) => entry.indexCode);
    flash(`Auto-selected ${required} key(s) for this message length.`);
    render();
  });

  const encryptButton = document.querySelector<HTMLButtonElement>("#encrypt-button");
  encryptButton?.addEventListener("click", () => {
    const normalized = normalizeAZ(state.encryptInput);
    if (normalized.length === 0) {
      flash("Enter plaintext with at least one A-Z character.");
      render();
      return;
    }

    if (!state.advancedMode) {
      if (normalized.length > LETTERS_PER_DECK) {
        flash(
          `This message is too long for one deck key. A 52-card deck key produces ${LETTERS_PER_DECK} letters of keystream. Use additional deck keys or shorten the message. Reusing the same deck key is not allowed.`
        );
        render();
        return;
      }

      const key = state.deckBook.find((entry) => entry.indexCode === state.selectedEncryptCode);
      if (!key) {
        flash("Select an unused deck key for encryption.");
        render();
        return;
      }

      if (key.status === "USED") {
        flash("Selected key is already USED. Choose an UNUSED key.");
        render();
        return;
      }

      const ciphertext = encryptText(normalized, key.deckOrder);
      state.encryptOutput = {
        indexCodes: [key.indexCode],
        ciphertext: groupedFive(ciphertext),
        normalizedPlaintext: normalized
      };
      state.decryptIndexCode = key.indexCode;
      state.decryptCiphertext = groupedFive(ciphertext);
      // No success toast — the output (ciphertext + QR + share link) now
      // appears below; bring it into view instead of popping a message.
      render();
      document.querySelector(".output")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const needed = requiredDeckCount(normalized.length);
    const selectedEntries = findUnusedEntriesByCodes(state.selectedEncryptCodes);

    if (selectedEntries.length < needed) {
      flash(`Need ${needed} UNUSED deck keys for this message length. Select additional keys in Advanced mode.`);
      render();
      return;
    }

    const keysToUse = selectedEntries.slice(0, needed);
    const ciphertextRaw = encryptWithDecks(
      normalized,
      keysToUse.map((entry) => entry.deckOrder)
    );

    const usedCodes = keysToUse.map((entry) => entry.indexCode);
    state.encryptOutput = {
      indexCodes: usedCodes,
      ciphertext: groupedFive(ciphertextRaw),
      normalizedPlaintext: normalized
    };
    state.decryptIndexCode = usedCodes.join(", ");
    state.decryptCiphertext = groupedFive(ciphertextRaw);
    render();
    document.querySelector(".output")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const markOutputKeysUsed = (): void => {
    if (!state.encryptOutput) {
      return;
    }
    state.encryptOutput.indexCodes.forEach((code) => {
      markKeyStatus(code, "USED");
    });
    state.selectedEncryptCode = state.deckBook.find((entry) => entry.status === "UNUSED")?.indexCode ?? "";
    state.selectedEncryptCodes = state.selectedEncryptCode ? [state.selectedEncryptCode] : [];
    flash(`Marked USED: ${state.encryptOutput.indexCodes.join(", ")}.`);
    render();
  };
  // Two entry points to the same action: the button under the plaintext box
  // and the prominent one in the output next to the QR / share link.
  document.querySelector<HTMLButtonElement>("#mark-encrypt-used")?.addEventListener("click", markOutputKeysUsed);
  document.querySelector<HTMLButtonElement>("#mark-output-used")?.addEventListener("click", markOutputKeysUsed);

  const decryptIndex = document.querySelector<HTMLInputElement>("#decrypt-index");
  decryptIndex?.addEventListener("input", (event) => {
    state.decryptIndexCode = (event.currentTarget as HTMLInputElement).value;
  });

  const decryptCipher = document.querySelector<HTMLTextAreaElement>("#decrypt-cipher");
  decryptCipher?.addEventListener("input", (event) => {
    state.decryptCiphertext = (event.currentTarget as HTMLTextAreaElement).value;
  });

  const decryptButton = document.querySelector<HTMLButtonElement>("#decrypt-button");
  decryptButton?.addEventListener("click", () => {
    const codes = parseIndexCodes(state.decryptIndexCode);
    if (codes.length === 0) {
      flash("Enter at least one index code.");
      render();
      return;
    }

    const entries = codes.map((code) => state.deckBook.find((item) => item.indexCode === code));
    if (entries.some((entry) => !entry)) {
      flash(
        "This DeckBook does not contain that index code. The receiver must have the same private DeckBook as the sender."
      );
      render();
      return;
    }

    const usableEntries = entries as DeckBookEntry[];
    const normalizedCipher = normalizeAZ(state.decryptCiphertext);
    if (normalizedCipher.length === 0) {
      flash("Enter ciphertext with at least one A-Z character.");
      render();
      return;
    }

    const capacity = usableEntries.length * LETTERS_PER_DECK;
    if (normalizedCipher.length > capacity) {
      flash(
        `Ciphertext is ${normalizedCipher.length} letters, but selected key count supports ${capacity}. Provide more index codes.`
      );
      render();
      return;
    }

    const plaintext = decryptWithDecks(
      normalizedCipher,
      usableEntries.map((entry) => entry.deckOrder)
    );

    state.incomingShare = false; // acted on the received message
    const hasUsed = usableEntries.some((entry) => entry.status === "USED");
    state.decryptOutput = {
      plaintext,
      warning: hasUsed
        ? "One or more keys are already marked USED. Decryption is shown for demonstration, but these keys must not be reused for new messages."
        : null
    };
    flash("Message decrypted.");
    render();
  });

  const mistakeSelect = document.querySelector<HTMLSelectElement>("#mistake-choice");
  mistakeSelect?.addEventListener("change", (event) => {
    state.mistakeKey = (event.currentTarget as HTMLSelectElement).value;
    render();
  });

  bindSimulatorEvents();
  bindAttackLabEvents();
  bindVisualizerEvents(() => state.deckBook);
  bindChallengeEvents();

  // QR <img data-qr> placeholders resolve asynchronously after each paint.
  hydrateQrImages();
}

// -- Two-Party Simulator ----------------------------------------------------

function bindSimulatorEvents(): void {
  const plaintext = document.querySelector<HTMLTextAreaElement>("#sim-plaintext");
  plaintext?.addEventListener("input", (event) => {
    state.simulator.plaintext = (event.currentTarget as HTMLTextAreaElement).value;
  });

  const keySelect = document.querySelector<HTMLSelectElement>("#sim-key");
  keySelect?.addEventListener("change", (event) => {
    state.simulator.selectedKey = (event.currentTarget as HTMLSelectElement).value;
  });

  const send = document.querySelector<HTMLButtonElement>("#sim-send");
  send?.addEventListener("click", () => {
    const normalized = normalizeAZ(state.simulator.plaintext);
    if (normalized.length === 0) {
      flash("Alice has no plaintext to send.");
      render();
      return;
    }
    const entry = state.deckBook.find((item) => item.indexCode === state.simulator.selectedKey);
    if (!entry) {
      flash("Pick a deck key from Alice's DeckBook.");
      render();
      return;
    }
    if (normalized.length > LETTERS_PER_DECK) {
      flash(`Simulator uses a single deck (${LETTERS_PER_DECK} letters max). Shorten the message or use the main Encrypt panel for multi-deck mode.`);
      render();
      return;
    }
    const ciphertext = encryptText(normalized, entry.deckOrder);
    state.simulator.transmission = {
      indexCode: entry.indexCode,
      ciphertext: groupedFive(ciphertext)
    };
    // Bob holds the same DeckBook, so he can decrypt immediately. This is
    // the whole point of the panel — show that the pre-shared secret does
    // all the work, and the wire carries only the public bits.
    state.simulator.decrypted = decryptText(ciphertext, entry.deckOrder);
    flash("Alice sent the message. Bob received and decrypted it.");
    render();
  });

  const reset = document.querySelector<HTMLButtonElement>("#sim-reset");
  reset?.addEventListener("click", () => {
    state.simulator = { plaintext: "", selectedKey: "", transmission: null, decrypted: null };
    render();
  });
}

// -- Key Reuse Attack Lab ---------------------------------------------------

function bindAttackLabEvents(): void {
  const a = document.querySelector<HTMLTextAreaElement>("#lab-a");
  a?.addEventListener("input", (event) => {
    state.attackLab.plaintextA = (event.currentTarget as HTMLTextAreaElement).value;
  });

  const b = document.querySelector<HTMLTextAreaElement>("#lab-b");
  b?.addEventListener("input", (event) => {
    state.attackLab.plaintextB = (event.currentTarget as HTMLTextAreaElement).value;
  });

  const key = document.querySelector<HTMLSelectElement>("#lab-key");
  key?.addEventListener("change", (event) => {
    state.attackLab.reusedKey = (event.currentTarget as HTMLSelectElement).value;
  });

  const run = document.querySelector<HTMLButtonElement>("#lab-run");
  run?.addEventListener("click", () => {
    const lab = state.attackLab;
    const entry = state.deckBook.find((item) => item.indexCode === lab.reusedKey);
    if (!entry) {
      flash("Pick a key to reuse.");
      render();
      return;
    }
    const plainA = normalizeAZ(lab.plaintextA);
    const plainB = normalizeAZ(lab.plaintextB);
    if (plainA.length === 0 || plainB.length === 0) {
      flash("Enter two plaintexts to compare.");
      render();
      return;
    }
    const common = Math.min(plainA.length, plainB.length, LETTERS_PER_DECK);
    const cipherA = encryptText(plainA.slice(0, common), entry.deckOrder);
    const cipherB = encryptText(plainB.slice(0, common), entry.deckOrder);
    // Compute the two differences mod 26. They will be equal — that's the
    // point. The key cancels because the same shift was applied to both.
    const cipherDiff: number[] = [];
    const plainDiff: number[] = [];
    for (let i = 0; i < common; i += 1) {
      cipherDiff.push(((cipherA.charCodeAt(i) - cipherB.charCodeAt(i)) % 26 + 26) % 26);
      plainDiff.push(((plainA.charCodeAt(i) - plainB.charCodeAt(i)) % 26 + 26) % 26);
    }
    state.attackLab.result = {
      cipherA: groupedFive(cipherA),
      cipherB: groupedFive(cipherB),
      cipherARaw: cipherA,
      cipherBRaw: cipherB,
      cipherDiff: groupedFive(numbersToLetters(cipherDiff)),
      plainDiff: groupedFive(numbersToLetters(plainDiff))
    };
    state.attackLab.cribOffset = 0;
    flash("Attack ran. Now drag a crib below to pull the messages out.");
    render();
  });

  const reset = document.querySelector<HTMLButtonElement>("#lab-reset");
  reset?.addEventListener("click", () => {
    clearAutoSolve();
    state.attackLab = {
      plaintextA: "",
      plaintextB: "",
      reusedKey: "",
      crib: "",
      cribSide: "A",
      cribOffset: 0,
      result: null
    };
    render();
  });

  // Crib-dragging controls. Editing the crib or dragging the slider updates
  // only the #crib-live subtree (see updateCribLive) so the input caret and
  // the slider drag are never disrupted by a full re-render.
  const cribWord = document.querySelector<HTMLInputElement>("#crib-word");
  cribWord?.addEventListener("input", (event) => {
    state.attackLab.crib = (event.currentTarget as HTMLInputElement).value;
    state.attackLab.cribOffset = 0;
    updateCribLive();
  });

  const cribSide = document.querySelector<HTMLSelectElement>("#crib-side");
  cribSide?.addEventListener("change", (event) => {
    state.attackLab.cribSide = (event.currentTarget as HTMLSelectElement).value as "A" | "B";
    updateCribLive();
  });

  const cribOffset = document.querySelector<HTMLInputElement>("#crib-offset");
  cribOffset?.addEventListener("input", (event) => {
    state.attackLab.cribOffset = Number((event.currentTarget as HTMLInputElement).value);
    updateCribLive();
  });

  bindCribHints();

  const autoSolve = document.querySelector<HTMLButtonElement>("#crib-autosolve");
  autoSolve?.addEventListener("click", runAutoSolve);
}

// Single shared handle so a running auto-solve can never stack with a second
// click, a Reset, or leaving the panel.
let autoSolveTimer: number | null = null;

function clearAutoSolve(): void {
  if (autoSolveTimer !== null) {
    window.clearInterval(autoSolveTimer);
    autoSolveTimer = null;
  }
}

// Auto-solve: pick a real word from message A, drop it in as the crib, then
// animate the slider from position 0 to the word's true offset. As it lands,
// the matching slice of message B resolves into readable English — the whole
// key-reuse break, played out hands-free.
function runAutoSolve(): void {
  clearAutoSolve();
  const lab = state.attackLab;
  if (!lab.result) {
    return;
  }
  const plainA = normalizeAZ(lab.plaintextA);
  const diffLen = differenceMod26(lab.result.cipherARaw, lab.result.cipherBRaw).length;
  const cribLen = Math.min(5, plainA.length);
  if (diffLen < 2 || cribLen < 2) {
    flash("Need two longer messages to auto-solve.");
    return;
  }

  // Take the crib from roughly the middle so there is visible travel, and
  // never past where the crib would run off the end of the difference.
  const target = Math.min(diffLen - cribLen, Math.max(1, Math.floor((diffLen - cribLen) / 2)));
  lab.crib = plainA.slice(target, target + cribLen);
  lab.cribSide = "A";
  lab.cribOffset = 0;
  render();

  let current = 0;
  autoSolveTimer = window.setInterval(() => {
    // Bail if the attack was reset out from under the animation.
    if (!state.attackLab.result) {
      clearAutoSolve();
      return;
    }
    current += 1;
    state.attackLab.cribOffset = current;
    updateCribLive();
    if (current >= target) {
      clearAutoSolve();
      flash("Message B fell out — recovered from ciphertext alone, no key touched.");
    }
  }, 200);
}

function flash(message: string): void {
  state.message = message;
  window.setTimeout(() => {
    if (state.message === message) {
      state.message = null;
      render();
    }
  }, 4200);
}

function mistakeLabel(key: string): string {
  const labels: Record<string, string> = {
    reuse: "Reuse the same deck key twice",
    sendDeck: "Send the deck order instead of the index code",
    loseBook: "Lose the DeckBook",
    oneCardWrong: "Arrange one card wrong",
    tooLong: "Use a message longer than the deck key",
    weakRandom: "Use Math.random instead of cryptographic randomness",
    forgotUsed: "Forget to mark a key as used",
    patternedCode: "Let the index code reveal a pattern"
  };
  return labels[key] ?? key;
}
