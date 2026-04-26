import "./styles.css";

type Suit = "SPADES" | "HEARTS" | "DIAMONDS" | "CLUBS";
type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

type Card = {
  rank: Rank;
  suit: Suit;
  label: string;
  value: number;
};

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

type SetupViewMode = "visual" | "checklist";

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
  setupViewMode: SetupViewMode;
  walkthroughStep: number;
  walkthroughActive: boolean;
  walkthroughDismissed: boolean;
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

const appRoot: HTMLDivElement = app;

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

const SUITS: { suit: Suit; symbol: string; name: string }[] = [
  { suit: "SPADES", symbol: "♠", name: "Spades" },
  { suit: "HEARTS", symbol: "♥", name: "Hearts" },
  { suit: "DIAMONDS", symbol: "♦", name: "Diamonds" },
  { suit: "CLUBS", symbol: "♣", name: "Clubs" }
];

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const MISTAKES: Record<string, string> = {
  reuse: "If the same deck key encrypts two messages, an attacker may compare ciphertexts and learn patterns. This mirrors one-time pad reuse and stream cipher nonce/key reuse failures.",
  sendDeck: "The index code may travel publicly. The deck order may not. If the deck order is exposed, the key is exposed.",
  loseBook: "If either side loses the private DeckBook, future messages cannot be decrypted. If an attacker finds it, old and future messages become readable.",
  oneCardWrong: "Manual systems are fragile. One card out of order shifts the keystream and decryption fails.",
  tooLong: "A single 52-card deck key creates 26 keystream letters. Longer messages require additional one-time key material, not key reuse.",
  weakRandom: "Math.random() is not designed for cryptographic security. DeckBook uses crypto.getRandomValues() with rejection sampling for unbiased secure random integers.",
  forgotUsed: "If teams forget to mark keys as used, accidental reuse becomes likely. Operational discipline is part of cryptographic security.",
  patternedCode: "If index codes leak structure (for example, day-based naming), an attacker may infer operational habits. Index codes should only identify keys, not reveal meaning."
};

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    title: "Step 1: Generate Key Material",
    body: "Start by generating your private DeckBook. Both sender and receiver must have the same secret deck orders before communication.",
    targetId: "generate"
  },
  {
    title: "Step 2: Pick an Unused Key",
    body: "In Deck Key List, choose one UNUSED key. Index codes can be sent publicly, but the deck order itself must stay private.",
    targetId: "key-list"
  },
  {
    title: "Step 3: Arrange Physical Deck",
    body: "Use Receiver Setup View to arrange cards top-to-bottom and verify fingerprint. One card out of order breaks decryption.",
    targetId: "receiver-setup"
  },
  {
    title: "Step 4: Encrypt Message",
    body: "Encrypt plaintext with one deck key (26 letters max) or enable Advanced Multi-Deck mode for longer messages.",
    targetId: "encrypt-panel"
  },
  {
    title: "Step 5: Decrypt Using Index Code",
    body: "Receiver enters index code(s) and ciphertext to regenerate the same keystream and recover plaintext.",
    targetId: "decrypt-panel"
  },
  {
    title: "Step 6: Learn Failure Modes",
    body: "Use What Goes Wrong? to test operational mistakes like key reuse, weak randomness, and leaking deck order.",
    targetId: "mistakes"
  },
  {
    title: "Step 7: Connect to Modern Crypto",
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
  setupViewMode: initialSetupViewMode,
  walkthroughStep: 0,
  walkthroughActive: !initialGuideDismissed,
  walkthroughDismissed: initialGuideDismissed
};

if (state.deckBook.length > 0) {
  state.selectedEncryptCode = state.deckBook.find((entry) => entry.status === "UNUSED")?.indexCode ?? "";
  state.selectedEncryptCodes = state.selectedEncryptCode ? [state.selectedEncryptCode] : [];
  state.activeViewCode = state.deckBook[0].indexCode;
}

render();

function createStandardDeck(): Card[] {
  const deck: Card[] = [];
  SUITS.forEach((suitEntry, suitIndex) => {
    RANKS.forEach((rank, rankIndex) => {
      deck.push({
        rank,
        suit: suitEntry.suit,
        label: `${rank}${suitEntry.symbol}`,
        value: suitIndex * 13 + rankIndex
      });
    });
  });
  return deck;
}

function suitName(suit: Suit): string {
  const found = SUITS.find((item) => item.suit === suit);
  return found?.name ?? suit;
}

function cardAccessibleLabel(card: Card): string {
  return `${card.rank} of ${suitName(card.suit)}`;
}

function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x100000000) {
    throw new Error("maxExclusive must be an integer between 1 and 4294967296");
  }

  const maxUint32 = 0x100000000;
  const limit = maxUint32 - (maxUint32 % maxExclusive);
  const buffer = new Uint32Array(1);

  while (true) {
    crypto.getRandomValues(buffer);
    const value = buffer[0];
    if (value < limit) {
      return value % maxExclusive;
    }
  }
}

function secureShuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = secureRandomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function deckSignature(deckOrder: Card[]): string {
  return deckOrder.map((card) => card.value.toString().padStart(2, "0")).join("-");
}

async function createFingerprint(deckOrder: Card[]): Promise<string> {
  const bytes = new TextEncoder().encode(deckSignature(deckOrder));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const values = new Uint8Array(hash);

  const wordA = FINGERPRINT_WORDS[values[0] % FINGERPRINT_WORDS.length];
  const wordB = FINGERPRINT_WORDS[values[5] % FINGERPRINT_WORDS.length];
  const number = ((values[10] << 8) + values[11]) % 9000 + 1000;

  return `${wordA}-${wordB}-${number}`;
}

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

function normalizeAZ(text: string): string {
  return text.toUpperCase().replace(/[^A-Z]/g, "");
}

function lettersToNumbers(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0) - 65);
}

function numbersToLetters(values: number[]): string {
  return values.map((value) => String.fromCharCode(value + 65)).join("");
}

function groupedFive(text: string): string {
  return text.match(/.{1,5}/g)?.join(" ") ?? "";
}

function keystreamFromDeck(deckOrder: Card[]): number[] {
  const stream: number[] = [];
  for (let i = 0; i < deckOrder.length; i += 2) {
    const a = deckOrder[i].value;
    const b = deckOrder[i + 1].value;
    const n = 52 * a + b;
    stream.push(n % 26);
  }
  return stream;
}

function encryptText(normalizedPlaintext: string, deckOrder: Card[]): string {
  const plainNums = lettersToNumbers(normalizedPlaintext);
  const stream = keystreamFromDeck(deckOrder);
  const cipherNums = plainNums.map((value, index) => (value + stream[index]) % 26);
  return numbersToLetters(cipherNums);
}

function decryptText(normalizedCiphertext: string, deckOrder: Card[]): string {
  const cipherNums = lettersToNumbers(normalizedCiphertext);
  const stream = keystreamFromDeck(deckOrder);
  const plainNums = cipherNums.map((value, index) => (value - stream[index] + 26) % 26);
  return numbersToLetters(plainNums);
}

function encryptWithDecks(normalizedPlaintext: string, deckOrders: Card[][]): string {
  let result = "";
  for (let i = 0; i < normalizedPlaintext.length; i += 26) {
    const block = normalizedPlaintext.slice(i, i + 26);
    const deck = deckOrders[Math.floor(i / 26)];
    result += encryptText(block, deck);
  }
  return result;
}

function decryptWithDecks(normalizedCiphertext: string, deckOrders: Card[][]): string {
  let result = "";
  for (let i = 0; i < normalizedCiphertext.length; i += 26) {
    const block = normalizedCiphertext.slice(i, i + 26);
    const deck = deckOrders[Math.floor(i / 26)];
    result += decryptText(block, deck);
  }
  return result;
}

function parseIndexCodes(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part.length > 0);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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
  return stored === "checklist" ? "checklist" : "visual";
}

function saveSetupViewMode(mode: SetupViewMode): void {
  localStorage.setItem(SETUP_VIEW_KEY, mode);
}

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

function requiredDeckCount(length: number): number {
  return Math.max(1, Math.ceil(length / 26));
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
  render();
  const target = document.querySelector(`#${WALKTHROUGH_STEPS[state.walkthroughStep].targetId}`);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function finishGuide(): void {
  state.walkthroughActive = false;
  state.walkthroughDismissed = true;
  saveGuideDismissed(true);
  flash("Guided walkthrough completed.");
  render();
}

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

  clampPage(state.deckBook.length);

  const totalPages = Math.max(1, Math.ceil(state.deckBook.length / state.keyListPageSize));
  const pageStart = (state.keyListPage - 1) * state.keyListPageSize;
  const pageEnd = pageStart + state.keyListPageSize;
  const visibleKeys = state.deckBook.slice(pageStart, pageEnd);

  const keyCards =
    state.deckBook.length === 0
      ? `<p class="empty">Generate a DeckBook to list your one-time deck keys.</p>`
      : visibleKeys
          .map((entry) => {
            const isUsed = entry.status === "USED";
            return `
              <article class="key-card ${isUsed ? "used" : "unused"}" aria-label="Deck key ${escapeHtml(entry.indexCode)}">
                <header>
                  <h4>${escapeHtml(entry.indexCode)}</h4>
                  <span class="status-badge" aria-label="Status ${entry.status}">Status: ${entry.status}</span>
                </header>
                <p><strong>Fingerprint:</strong> ${escapeHtml(entry.fingerprint)}</p>
                <div class="button-row">
                  <button type="button" data-action="view-key" data-code="${escapeHtml(entry.indexCode)}" aria-label="View deck order for ${escapeHtml(
                    entry.indexCode
                  )}">View Deck Order</button>
                  <button type="button" data-action="select-key" data-code="${escapeHtml(entry.indexCode)}" ${
                    isUsed ? "disabled" : ""
                  } aria-label="Use ${escapeHtml(entry.indexCode)} for encryption">Use for Encryption</button>
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

  const guideVisible = state.walkthroughActive || !state.walkthroughDismissed;
  const guideStep = WALKTHROUGH_STEPS[state.walkthroughStep];

  appRoot.innerHTML = `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <main id="main-content" class="museum-shell" tabindex="-1">
      <div class="sr-only" role="status" aria-live="polite">${state.message ? escapeHtml(state.message) : ""}</div>
      <section class="hero panel">
        <p class="kicker">Cipher Museum Exhibit</p>
        <h1>DeckBook</h1>
        <p class="subtitle">A card-based one-time keybook for teaching key distribution, one-time pads, stream ciphers, and the danger of key reuse.</p>
        <p class="prominent">The deck order is the key. The clue only tells you which key to use.</p>
        <p class="secondary">The index code can be public. The deck order cannot.</p>
        <div class="badge-grid" role="list" aria-label="Reality labels">
          <span role="listitem">Historical inspiration: Solitaire / manual ciphers</span>
          <span role="listitem">Educational value: High</span>
          <span role="listitem">Modern production security: Not recommended</span>
          <span role="listitem">Core lesson: Key distribution and one-time key use</span>
          <span role="listitem">Keyspace: 52! possible deck orders</span>
          <span role="listitem">Approximate size: 8.06 × 10^67</span>
          <span role="listitem">One deck key encrypts: 26 A-Z letters</span>
          <span role="listitem">Reuse allowed: Never</span>
        </div>
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
          : ""
      }

      <section class="panel quick-start" id="quick-start">
        <h2>Quick Start: Encrypt in 3 Steps</h2>
        <ol>
          <li>Generate DeckBook keys, then pick an UNUSED key in Deck Key List.</li>
          <li>Open Receiver Setup View and arrange cards exactly in the shown top-to-bottom order.</li>
          <li>Enter plaintext in Encrypt, select the same key, and send: index code + ciphertext.</li>
        </ol>
        <p class="mini-warning">If your message is longer than 26 letters, enable Advanced multi-deck mode and use fresh keys in sequence.</p>
      </section>

      <section class="panel warning-panel">
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
        <h2>Generate DeckBook</h2>
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
        <h2>Deck Key List</h2>
        <div class="pager">
          <p class="counts">Showing ${summary.total === 0 ? 0 : pageStart + 1}-${Math.min(pageEnd, summary.total)} of ${summary.total}</p>
          <div class="pager-controls">
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
          </div>
        </div>
        <div class="key-grid">${keyCards}</div>
      </section>

      <section class="panel" id="receiver-setup">
        <h2>Receiver Setup View</h2>
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
            <option value="checklist" ${state.setupViewMode === "checklist" ? "selected" : ""}>Checklist-only (full line list)</option>
          </select>
        </div>
        <div class="setup-labels"><span>TOP OF DECK</span><span>BOTTOM OF DECK</span></div>
        ${
          state.setupViewMode === "visual"
            ? `<div class="deck-visual" role="list" aria-label="Visual deck order from top to bottom">
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
        <div class="setup-list ${state.setupViewMode === "checklist" ? "checklist-only" : ""}" role="list">${setupChecklist}</div>
        <div class="button-row">
          <button type="button" id="copy-setup" ${activeEntry ? "" : "disabled"}>Copy setup instructions</button>
        </div>
      </section>

      <section class="panel" id="encrypt-panel">
        <h2>Encrypt</h2>
        <p>Spaces and punctuation are removed for this educational A-Z cipher.</p>
        <label for="encrypt-input">Plaintext message</label>
        <textarea id="encrypt-input" rows="4" placeholder="Enter plaintext message">${escapeHtml(state.encryptInput)}</textarea>

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
              <p>Plaintext length: ${normalizedEncrypt.length} letters | Available keystream: 26 letters</p>`
        }

        <div class="button-row">
          <button type="button" id="encrypt-button" ${unusedEntries.length > 0 ? "" : "disabled"}>Encrypt</button>
          <button type="button" id="mark-encrypt-used" ${state.encryptOutput ? "" : "disabled"}>Mark output key(s) as USED</button>
        </div>
        ${
          state.encryptOutput
            ? `<div class="output">
                <p><strong>Index Code${state.encryptOutput.indexCodes.length > 1 ? "s" : ""}:</strong> ${escapeHtml(
                  state.encryptOutput.indexCodes.join(", ")
                )}</p>
                <p><strong>Normalized Plaintext:</strong> ${escapeHtml(state.encryptOutput.normalizedPlaintext)}</p>
                <p><strong>Ciphertext:</strong> ${escapeHtml(state.encryptOutput.ciphertext)}</p>
                <p class="mini-warning">Mark used now: ${escapeHtml(state.encryptOutput.indexCodes.join(", "))}</p>
              </div>`
            : ""
        }
      </section>

      <section class="panel" id="decrypt-panel">
        <h2>Decrypt</h2>
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
}

function bindEvents(): void {
  const modeSelect = document.querySelector<HTMLSelectElement>("#mode");
  modeSelect?.addEventListener("change", (event) => {
    const next = (event.currentTarget as HTMLSelectElement).value as DeckMode;
    state.mode = next;
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

  const generateButton = document.querySelector<HTMLButtonElement>("#generate-book");
  generateButton?.addEventListener("click", async () => {
    state.isGenerating = true;
    state.message = "Generating secure DeckBook with crypto.getRandomValues()...";
    render();

    const count = Number(state.mode);
    const deckBook = await generateDeckBook(count);
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
    state.keyListPage = Math.max(1, Math.ceil(state.deckBook.length / state.keyListPageSize));
    render();
  });

  const pageSize = document.querySelector<HTMLSelectElement>("#page-size");
  pageSize?.addEventListener("change", (event) => {
    state.keyListPageSize = Number((event.currentTarget as HTMLSelectElement).value);
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
      state.selectedEncryptCode = code;
      if (!state.selectedEncryptCodes.includes(code)) {
        state.selectedEncryptCodes = [...state.selectedEncryptCodes, code];
      }
      render();
      document.querySelector("#encrypt-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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

  const setupViewMode = document.querySelector<HTMLSelectElement>("#setup-view-mode");
  setupViewMode?.addEventListener("change", (event) => {
    state.setupViewMode = (event.currentTarget as HTMLSelectElement).value as SetupViewMode;
    saveSetupViewMode(state.setupViewMode);
    render();
  });

  const encryptInput = document.querySelector<HTMLTextAreaElement>("#encrypt-input");
  encryptInput?.addEventListener("input", (event) => {
    state.encryptInput = (event.currentTarget as HTMLTextAreaElement).value;
    render();
  });

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
  });

  const encryptMultiSelect = document.querySelector<HTMLSelectElement>("#encrypt-keys-multi");
  encryptMultiSelect?.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    state.selectedEncryptCodes = [...select.selectedOptions].map((option) => option.value);
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
      if (normalized.length > 26) {
        flash(
          "This message is too long for one deck key. A 52-card deck key produces 26 letters of keystream. Use additional deck keys or shorten the message. Reusing the same deck key is not allowed."
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
      flash("Message encrypted. Share index code + ciphertext, never deck order.");
      render();
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
    flash("Advanced encryption complete. Share index code list + ciphertext, never deck orders.");
    render();
  });

  const markEncryptUsed = document.querySelector<HTMLButtonElement>("#mark-encrypt-used");
  markEncryptUsed?.addEventListener("click", () => {
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
  });

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

    const capacity = usableEntries.length * 26;
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
