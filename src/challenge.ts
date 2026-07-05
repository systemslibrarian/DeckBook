/* ============================================================================
 * Challenge mode — "Eve's Intercept"
 * ----------------------------------------------------------------------------
 * A shareable, self-contained CTF-style puzzle. A careless operator reused one
 * deck key to encrypt two messages; the player is Eve, who captured both
 * ciphertexts and must recover the plaintexts using crib dragging — no key,
 * no deck order. Winning is detected when both messages are typed back
 * correctly.
 *
 * The module owns its own state and repaints its own subtree, mirroring the
 * visualizer. Because the two ciphertexts are produced with the SAME key, the
 * difference of the ciphertexts equals the difference of the plaintexts, so
 * the crib-drag mechanic works on the captured ciphertext alone.
 * ========================================================================= */

import {
  createStandardDeck,
  encryptText,
  groupedFive,
  normalizeAZ,
  secureShuffle
} from "./cipher";
import { differenceMod26, dragCrib, rankCribOffsets } from "./analysis";

export type Puzzle = {
  id: string;
  title: string;
  scenario: string;
  hint: string;
  plainA: string;
  plainB: string;
};

// Curated puzzles, easy -> hard. Plaintext pairs share at least one common
// word so a crib can catch. Kept short enough to solve in a couple of minutes.
export const PUZZLES: Puzzle[] = [
  {
    id: "dockside",
    title: "Dockside (easy)",
    scenario:
      "Two runners left the harbor office minutes apart. The clerk reused the same deck key for both notes. You copied the ciphertext off the wire.",
    hint: "Both notes are about the harbor at night. Try the crib THE, then HARBOR or LANTERN.",
    plainA: "MEETATTHEHARBOR",
    plainB: "BRINGTHELANTERN"
  },
  {
    id: "orders",
    title: "Field Orders (medium)",
    scenario:
      "Two field orders went out on the same reused key. Recover both and you know the whole plan — attackers and defenders alike.",
    hint: "These are battlefield orders. DAWN appears in both. ATTACK and DEFEND are good cribs.",
    plainA: "ATTACKATDAWNFROMEAST",
    plainB: "HOLDTHELINEUNTILDAWN"
  },
  {
    id: "rendezvous",
    title: "The Rendezvous (hard)",
    scenario:
      "A courier network slipped: one key, two dispatches. Crack them to expose the meeting.",
    hint: "Spycraft vocabulary. Try THE, then MIDNIGHT or BRIDGE.",
    plainA: "THEPACKAGEISATTHEOLDBRIDGE",
    plainB: "COMEALONEATMIDNIGHTNOLIGHTS"
  }
];

type ChallengeState = {
  puzzleId: string;
  cipherA: string;
  cipherB: string;
  crib: string;
  cribSide: "A" | "B";
  cribOffset: number;
  guessA: string;
  guessB: string;
  revealHint: boolean;
  solved: boolean;
};

function currentPuzzle(state: ChallengeState): Puzzle {
  return PUZZLES.find((puzzle) => puzzle.id === state.puzzleId) ?? PUZZLES[0];
}

// Encrypt both plaintexts with ONE shared key, so the shown ciphertexts carry
// the two-time-pad weakness the puzzle is about.
function encryptPair(puzzle: Puzzle): { cipherA: string; cipherB: string } {
  const key = secureShuffle(createStandardDeck());
  return {
    cipherA: encryptText(normalizeAZ(puzzle.plainA), key),
    cipherB: encryptText(normalizeAZ(puzzle.plainB), key)
  };
}

function freshState(puzzleId: string): ChallengeState {
  const puzzle = PUZZLES.find((item) => item.id === puzzleId) ?? PUZZLES[0];
  const { cipherA, cipherB } = encryptPair(puzzle);
  return {
    puzzleId: puzzle.id,
    cipherA,
    cipherB,
    crib: "",
    cribSide: "A",
    cribOffset: 0,
    guessA: "",
    guessB: "",
    revealHint: false,
    solved: false
  };
}

const challenge: ChallengeState = freshState(PUZZLES[0].id);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function diff(): number[] {
  return differenceMod26(challenge.cipherA, challenge.cipherB);
}

// How many leading letters of the guess match the answer — drives the live
// progress meter without revealing the answer outright.
function matchCount(guess: string, answer: string): number {
  const g = normalizeAZ(guess);
  let count = 0;
  for (let i = 0; i < g.length && i < answer.length; i += 1) {
    if (g[i] === answer[i]) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

function isSolved(state: ChallengeState): boolean {
  const puzzle = currentPuzzle(state);
  return (
    normalizeAZ(state.guessA) === normalizeAZ(puzzle.plainA) &&
    normalizeAZ(state.guessB) === normalizeAZ(puzzle.plainB)
  );
}

// --- rendering ------------------------------------------------------------

function renderRevealStrip(): string {
  const d = diff();
  const crib = normalizeAZ(challenge.crib);
  if (crib.length === 0) {
    return `<p class="empty">Type a crib above and drag it along the captured difference.</p>`;
  }
  const maxOffset = Math.max(0, d.length - crib.length);
  const offset = Math.min(challenge.cribOffset, maxOffset);
  const revealed = dragCrib(d, crib, offset, challenge.cribSide);
  const otherSide = challenge.cribSide === "A" ? "B" : "A";

  const cells = Array.from({ length: d.length }, (_, i) => {
    const within = i >= offset && i < offset + crib.length;
    const cribChar = within ? crib[i - offset] : "";
    const revealChar = within ? revealed[i - offset] : "";
    return `<div class="crib-col ${within ? "active" : ""}">
        <span class="crib-diff">${String.fromCharCode(65 + d[i])}</span>
        <span class="crib-guess">${cribChar || "&middot;"}</span>
        <span class="crib-reveal">${revealChar || "&middot;"}</span>
      </div>`;
  }).join("");

  const ranked = rankCribOffsets(d, crib, challenge.cribSide)
    .slice(0, 3)
    .map(
      (hit) =>
        `<button type="button" class="crib-hint" data-chal-offset="${hit.offset}">pos ${hit.offset + 1}: <span class="mono">${escapeHtml(
          hit.revealed
        )}</span></button>`
    )
    .join("");

  return `
    <div class="crib-strip-wrap">
      <div class="crib-legend"><span>diff</span><span>crib (msg ${challenge.cribSide})</span><span>reveal (msg ${otherSide})</span></div>
      <div class="crib-strip">${cells}</div>
    </div>
    <p class="crib-readout">Revealed in message ${otherSide}: <span class="mono">${escapeHtml(revealed)}</span></p>
    ${ranked ? `<p class="crib-hints-label">Most English-looking positions:</p><div class="crib-hints">${ranked}</div>` : ""}`;
}

function renderCheck(): string {
  const puzzle = currentPuzzle(challenge);
  const a = matchCount(challenge.guessA, normalizeAZ(puzzle.plainA));
  const b = matchCount(challenge.guessB, normalizeAZ(puzzle.plainB));
  const aFull = normalizeAZ(puzzle.plainA).length;
  const bFull = normalizeAZ(puzzle.plainB).length;
  const solved = isSolved(challenge);

  if (solved) {
    return `
      <div class="chal-win" role="status">
        <p class="chal-win-title">🎉 Cracked it.</p>
        <p>Message A: <span class="mono">${escapeHtml(normalizeAZ(puzzle.plainA))}</span></p>
        <p>Message B: <span class="mono">${escapeHtml(normalizeAZ(puzzle.plainB))}</span></p>
        <p>You recovered both messages from ciphertext alone — that is the entire cost of reusing a one-time key once.</p>
        <div class="button-row">
          <button type="button" id="chal-share">Share this challenge</button>
          <button type="button" id="chal-next">Try the next puzzle</button>
        </div>
      </div>`;
  }

  const meter = (label: string, n: number, total: number) => {
    const pct = Math.round((n / total) * 100);
    return `<div class="chal-meter">
        <span class="chal-meter-label">${label}: ${n}/${total}</span>
        <span class="chal-meter-track"><span class="chal-meter-fill" style="width:${pct}%"></span></span>
      </div>`;
  };

  return `${meter("Message A", a, aFull)}${meter("Message B", b, bFull)}`;
}

export function renderChallengeInner(): string {
  const puzzle = currentPuzzle(challenge);
  const d = diff();
  const crib = normalizeAZ(challenge.crib);
  const maxOffset = Math.max(0, d.length - Math.max(crib.length, 1));
  const offset = Math.min(challenge.cribOffset, maxOffset);

  const puzzleOptions = PUZZLES.map(
    (item) => `<option value="${item.id}" ${item.id === challenge.puzzleId ? "selected" : ""}>${escapeHtml(item.title)}</option>`
  ).join("");

  return `
    <div class="chal-head">
      <div class="control-row">
        <label for="chal-puzzle">Puzzle</label>
        <select id="chal-puzzle">${puzzleOptions}</select>
      </div>
      <p class="chal-scenario">${escapeHtml(puzzle.scenario)}</p>
    </div>

    <div class="chal-captures">
      <p><strong>Captured ciphertext A:</strong> <span class="mono">${escapeHtml(groupedFive(challenge.cipherA))}</span></p>
      <p><strong>Captured ciphertext B:</strong> <span class="mono">${escapeHtml(groupedFive(challenge.cipherB))}</span></p>
      <p class="mini-warning">Both were encrypted with the <em>same</em> reused key. That is the mistake you are about to exploit.</p>
    </div>

    <div class="chal-tool">
      <div class="crib-controls">
        <div class="crib-field">
          <label for="chal-crib">Crib (guessed word)</label>
          <input id="chal-crib" value="${escapeHtml(challenge.crib)}" placeholder="THE" autocomplete="off" />
        </div>
        <div class="crib-field">
          <label for="chal-side">Guess it is in message</label>
          <select id="chal-side">
            <option value="A" ${challenge.cribSide === "A" ? "selected" : ""}>Message A</option>
            <option value="B" ${challenge.cribSide === "B" ? "selected" : ""}>Message B</option>
          </select>
        </div>
        <div class="crib-field crib-slide">
          <label for="chal-offset" id="chal-offset-label">Position: ${offset + 1}</label>
          <input id="chal-offset" type="range" min="0" max="${maxOffset}" value="${offset}" ${crib.length === 0 ? "disabled" : ""} />
        </div>
      </div>
      <div id="chal-reveal">${renderRevealStrip()}</div>
      <div class="button-row">
        <button type="button" id="chal-hint">${challenge.revealHint ? "Hide hint" : "Need a hint?"}</button>
        <button type="button" id="chal-reset">Reset puzzle</button>
      </div>
      ${challenge.revealHint ? `<p class="chal-hint-text">${escapeHtml(puzzle.hint)}</p>` : ""}
    </div>

    <div class="chal-answers">
      <p>When you can read a message, type it back (letters only):</p>
      <label for="chal-guess-a">Your reconstruction of message A</label>
      <input id="chal-guess-a" value="${escapeHtml(challenge.guessA)}" placeholder="MEET..." autocomplete="off" />
      <label for="chal-guess-b">Your reconstruction of message B</label>
      <input id="chal-guess-b" value="${escapeHtml(challenge.guessB)}" placeholder="BRING..." autocomplete="off" />
      <div id="chal-check">${renderCheck()}</div>
    </div>`;
}

export function renderChallengePanel(): string {
  return `
    <section class="panel challenge-panel" id="challenge">
      <h2>Challenge: Eve's Intercept</h2>
      <p>You are the eavesdropper. An operator reused one deck key for two messages. Recover both — using only the ciphertext.</p>
      <div id="challenge-inner">${renderChallengeInner()}</div>
    </section>`;
}

// --- events ---------------------------------------------------------------

function repaint(): void {
  const inner = document.querySelector<HTMLDivElement>("#challenge-inner");
  if (inner) {
    inner.innerHTML = renderChallengeInner();
    bindChallengeEvents();
  }
}

function updateReveal(): void {
  const d = diff();
  const crib = normalizeAZ(challenge.crib);
  const maxOffset = Math.max(0, d.length - Math.max(crib.length, 1));
  const offset = Math.min(challenge.cribOffset, maxOffset);

  const reveal = document.querySelector<HTMLDivElement>("#chal-reveal");
  if (reveal) {
    reveal.innerHTML = renderRevealStrip();
  }
  const label = document.querySelector<HTMLLabelElement>("#chal-offset-label");
  if (label) {
    label.textContent = `Position: ${offset + 1}`;
  }
  const slider = document.querySelector<HTMLInputElement>("#chal-offset");
  if (slider) {
    slider.max = String(maxOffset);
    slider.value = String(offset);
    slider.disabled = crib.length === 0;
  }
  bindOffsetHints();
}

function updateCheck(): void {
  const check = document.querySelector<HTMLDivElement>("#chal-check");
  if (!check) {
    return;
  }
  const wasSolved = challenge.solved;
  challenge.solved = isSolved(challenge);
  check.innerHTML = renderCheck();
  // When the puzzle transitions to solved, the win block appears with its own
  // buttons that must be wired up.
  if (challenge.solved && !wasSolved) {
    bindWinButtons();
    if (typeof confettiBurst === "function") {
      confettiBurst();
    }
  } else if (challenge.solved) {
    bindWinButtons();
  }
}

function bindOffsetHints(): void {
  document.querySelectorAll<HTMLButtonElement>("button[data-chal-offset]").forEach((button) => {
    button.addEventListener("click", () => {
      challenge.cribOffset = Number(button.dataset.chalOffset);
      updateReveal();
    });
  });
}

function bindWinButtons(): void {
  document.querySelector<HTMLButtonElement>("#chal-next")?.addEventListener("click", () => {
    const index = PUZZLES.findIndex((puzzle) => puzzle.id === challenge.puzzleId);
    const next = PUZZLES[(index + 1) % PUZZLES.length];
    Object.assign(challenge, freshState(next.id));
    repaint();
    document.querySelector("#challenge")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector<HTMLButtonElement>("#chal-share")?.addEventListener("click", async () => {
    const url = `${window.location.origin}${window.location.pathname}#play=${challenge.puzzleId}`;
    try {
      await navigator.clipboard.writeText(url);
      flashChallenge("Challenge link copied — send it to someone and see who cracks it.");
    } catch {
      flashChallenge("Copy this link: " + url);
    }
  });
}

// Optional confetti hook — set by main.ts so the module stays DOM-light.
let confettiBurst: (() => void) | null = null;
let flashHook: (message: string) => void = () => {};

export function setChallengeHooks(hooks: { confetti: () => void; flash: (message: string) => void }): void {
  confettiBurst = hooks.confetti;
  flashHook = hooks.flash;
}

function flashChallenge(message: string): void {
  flashHook(message);
}

export function bindChallengeEvents(): void {
  const puzzleSelect = document.querySelector<HTMLSelectElement>("#chal-puzzle");
  puzzleSelect?.addEventListener("change", (event) => {
    const id = (event.currentTarget as HTMLSelectElement).value;
    Object.assign(challenge, freshState(id));
    repaint();
  });

  const cribInput = document.querySelector<HTMLInputElement>("#chal-crib");
  cribInput?.addEventListener("input", (event) => {
    challenge.crib = (event.currentTarget as HTMLInputElement).value;
    challenge.cribOffset = 0;
    updateReveal();
  });

  const sideSelect = document.querySelector<HTMLSelectElement>("#chal-side");
  sideSelect?.addEventListener("change", (event) => {
    challenge.cribSide = (event.currentTarget as HTMLSelectElement).value as "A" | "B";
    updateReveal();
  });

  const offset = document.querySelector<HTMLInputElement>("#chal-offset");
  offset?.addEventListener("input", (event) => {
    challenge.cribOffset = Number((event.currentTarget as HTMLInputElement).value);
    updateReveal();
  });

  bindOffsetHints();

  const guessA = document.querySelector<HTMLInputElement>("#chal-guess-a");
  guessA?.addEventListener("input", (event) => {
    challenge.guessA = (event.currentTarget as HTMLInputElement).value;
    updateCheck();
  });

  const guessB = document.querySelector<HTMLInputElement>("#chal-guess-b");
  guessB?.addEventListener("input", (event) => {
    challenge.guessB = (event.currentTarget as HTMLInputElement).value;
    updateCheck();
  });

  const hint = document.querySelector<HTMLButtonElement>("#chal-hint");
  hint?.addEventListener("click", () => {
    challenge.revealHint = !challenge.revealHint;
    repaint();
  });

  const reset = document.querySelector<HTMLButtonElement>("#chal-reset");
  reset?.addEventListener("click", () => {
    Object.assign(challenge, freshState(challenge.puzzleId));
    repaint();
  });

  if (isSolved(challenge)) {
    bindWinButtons();
  }
}

// Select a puzzle by id (used by the #play=<id> deep link). Returns true if
// the id matched a known puzzle.
export function selectPuzzle(id: string): boolean {
  if (!PUZZLES.some((puzzle) => puzzle.id === id)) {
    return false;
  }
  Object.assign(challenge, freshState(id));
  return true;
}
