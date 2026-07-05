/* ============================================================================
 * Watch It Work — animated encryption visualizer
 * ----------------------------------------------------------------------------
 * A self-contained sandbox panel that runs the cipher one card at a time:
 * a card flips off the deck, its value becomes a keystream number, and the
 * current plaintext letter is shifted into a ciphertext letter — with
 * play / pause / step controls like a tape machine.
 *
 * It keeps its own module-level state and repaints only its own subtree
 * (#viz-stage) on each tick, so playback never fights the app's global
 * "rebuild innerHTML on state change" render loop. The panel is purely
 * educational: it never marks keys as used.
 * ========================================================================= */

import {
  type Card,
  LETTERS_PER_DECK,
  cardAccessibleLabel,
  createStandardDeck,
  groupedFive,
  normalizeAZ,
  secureShuffle
} from "./cipher";
import { type CardStyle, renderCardFaceSvg } from "./cardface";

export type VisualizerKey = {
  indexCode: string;
  deckOrder: Card[];
  status: "UNUSED" | "USED";
};

type VizState = {
  input: string;
  deckCode: string; // "" selects the built-in demo deck
  position: number; // letters encrypted so far (0..length)
  playing: boolean;
  speedMs: number;
  cardStyle: CardStyle;
  timer: number | null;
};

// A fresh shuffle per page load. The demo deck means the panel works
// instantly, before any DeckBook has been generated.
const DEMO_DECK: Card[] = secureShuffle(createStandardDeck());

const SPEEDS: { label: string; ms: number }[] = [
  { label: "Slow", ms: 1600 },
  { label: "Normal", ms: 900 },
  { label: "Fast", ms: 420 }
];

const viz: VizState = {
  input: "THE DECK IS THE KEY",
  deckCode: "",
  position: 0,
  playing: false,
  speedMs: 900,
  cardStyle: "realistic",
  timer: null
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizedInput(): string {
  return normalizeAZ(viz.input).slice(0, LETTERS_PER_DECK);
}

function resolveDeck(keys: VisualizerKey[]): Card[] {
  if (viz.deckCode === "") {
    return DEMO_DECK;
  }
  return keys.find((key) => key.indexCode === viz.deckCode)?.deckOrder ?? DEMO_DECK;
}

// A playing card with a 3D flip. The front is an authentic SVG face whose
// detail follows the selected card style.
function renderCardFace(card: Card, flipped: boolean): string {
  return `
    <div class="viz-card ${flipped ? "flipped" : ""}" aria-hidden="true">
      <div class="viz-card-inner">
        <div class="viz-card-back"></div>
        <div class="viz-card-front">${renderCardFaceSvg(card, viz.cardStyle)}</div>
      </div>
    </div>`;
}

function renderStage(keys: VisualizerKey[]): string {
  const text = normalizedInput();
  const deck = resolveDeck(keys);

  if (text.length === 0) {
    return `<p class="steps-hint">Type a message above, then press Play.</p>`;
  }

  const done = viz.position;
  const currentIndex = done - 1; // letter most recently encrypted
  const remaining = 52 - done;

  // Equation block for the letter that just finished.
  let equation: string;
  let cardArea: string;
  if (currentIndex < 0) {
    cardArea = `
      <div class="viz-deck-stack" aria-hidden="true">
        <div class="viz-card"><div class="viz-card-inner"><div class="viz-card-back"></div></div></div>
      </div>
      <p class="viz-deck-count">52 cards ready</p>`;
    equation = `<p class="viz-waiting">Press <strong>Play</strong> to draw the first card, or <strong>Step</strong> to go one letter at a time.</p>`;
  } else {
    const card = deck[currentIndex];
    const plainNum = text.charCodeAt(currentIndex) - 65;
    const keyNum = card.value % 26;
    const cipherNum = (plainNum + keyNum) % 26;
    const cipherLetter = String.fromCharCode(cipherNum + 65);

    cardArea = `
      ${renderCardFace(card, true)}
      <p class="viz-deck-count">${remaining} card${remaining === 1 ? "" : "s"} left in the deck</p>`;

    equation = `
      <div class="viz-equation" role="img" aria-label="Letter ${currentIndex + 1}: plaintext ${text[currentIndex]} (${plainNum}) plus ${escapeHtml(
        cardAccessibleLabel(card)
      )} keystream ${keyNum} equals ciphertext ${cipherLetter} (${cipherNum}), all modulo 26">
        <div class="viz-tile plain">
          <span class="viz-tile-letter">${text[currentIndex]}</span>
          <span class="viz-tile-num">${plainNum}</span>
          <span class="viz-tile-label">plaintext</span>
        </div>
        <span class="viz-op">+</span>
        <div class="viz-tile key">
          <span class="viz-tile-letter">${keyNum}</span>
          <span class="viz-tile-num">${escapeHtml(card.label)} = ${card.value}, mod 26</span>
          <span class="viz-tile-label">keystream</span>
        </div>
        <span class="viz-op">=</span>
        <div class="viz-tile cipher">
          <span class="viz-tile-letter">${cipherLetter}</span>
          <span class="viz-tile-num">${plainNum} + ${keyNum} = ${plainNum + keyNum} mod 26 = ${cipherNum}</span>
          <span class="viz-tile-label">ciphertext</span>
        </div>
      </div>`;
  }

  // Tapes: the plaintext being consumed and the ciphertext being produced.
  const stream = deck.map((card) => card.value % 26);
  const plainCells = [...text]
    .map((letter, i) => {
      const cls = i < done ? "done" : i === done ? "next" : "";
      return `<span class="viz-cell ${cls}">${letter}</span>`;
    })
    .join("");
  const cipherCells = [...text]
    .map((letter, i) => {
      if (i < done) {
        const c = String.fromCharCode((letter.charCodeAt(0) - 65 + stream[i]) % 26 + 65);
        return `<span class="viz-cell out ${i === currentIndex ? "pop" : ""}">${c}</span>`;
      }
      return `<span class="viz-cell pending">&middot;</span>`;
    })
    .join("");

  const finished = done >= text.length;
  const cipherFull = [...text]
    .map((letter, i) => String.fromCharCode((letter.charCodeAt(0) - 65 + stream[i]) % 26 + 65))
    .join("");

  return `
    <div class="viz-grid">
      <div class="viz-card-area">${cardArea}</div>
      <div class="viz-equation-area">${equation}</div>
    </div>
    <div class="viz-tapes">
      <div class="viz-tape-row"><span class="viz-tape-label">Plaintext</span><span class="viz-tape">${plainCells}</span></div>
      <div class="viz-tape-row"><span class="viz-tape-label">Ciphertext</span><span class="viz-tape">${cipherCells}</span></div>
    </div>
    ${
      finished
        ? `<div class="viz-done" role="status">
             <p><strong>Done.</strong> Ciphertext: <span class="mono">${groupedFive(cipherFull)}</span></p>
             <p class="viz-done-note">Every letter was shifted by a different card. Without this exact deck order, those shifts are unknowable — and there are 52! possible orders.</p>
           </div>`
        : ""
    }`;
}

function repaintStage(keys: VisualizerKey[]): void {
  const stage = document.querySelector<HTMLDivElement>("#viz-stage");
  if (stage) {
    stage.innerHTML = renderStage(keys);
  }
  const play = document.querySelector<HTMLButtonElement>("#viz-play");
  if (play) {
    play.textContent = viz.playing ? "Pause" : viz.position >= normalizedInput().length && normalizedInput().length > 0 ? "Replay" : "Play";
  }
}

function stopPlayback(): void {
  viz.playing = false;
  if (viz.timer !== null) {
    window.clearTimeout(viz.timer);
    viz.timer = null;
  }
}

function scheduleTick(getKeys: () => VisualizerKey[]): void {
  viz.timer = window.setTimeout(() => {
    if (!viz.playing) {
      return;
    }
    const length = normalizedInput().length;
    if (viz.position >= length) {
      stopPlayback();
      repaintStage(getKeys());
      return;
    }
    viz.position += 1;
    repaintStage(getKeys());
    if (viz.position >= length) {
      stopPlayback();
      repaintStage(getKeys());
      return;
    }
    scheduleTick(getKeys);
  }, viz.speedMs);
}

export function renderVisualizerPanel(keys: VisualizerKey[]): string {
  const options = keys
    .map(
      (key) =>
        `<option value="${escapeHtml(key.indexCode)}" ${viz.deckCode === key.indexCode ? "selected" : ""}>${escapeHtml(
          key.indexCode
        )}${key.status === "USED" ? " (USED)" : ""}</option>`
    )
    .join("");

  const speedOptions = SPEEDS.map(
    (speed) => `<option value="${speed.ms}" ${viz.speedMs === speed.ms ? "selected" : ""}>${speed.label}</option>`
  ).join("");

  const truncated = normalizeAZ(viz.input).length > LETTERS_PER_DECK;

  return `
    <section class="panel visualizer-panel" id="visualizer">
      <h2>Watch It Work</h2>
      <p>The cipher, one card at a time: each card flips off the deck, becomes a keystream number, and shifts one letter of your message. This panel is a sandbox — it never consumes your real keys.</p>
      <div class="viz-controls">
        <div class="viz-control">
          <label for="viz-input">Message</label>
          <input id="viz-input" value="${escapeHtml(viz.input)}" maxlength="120" autocomplete="off" />
        </div>
        <div class="viz-control">
          <label for="viz-deck">Deck</label>
          <select id="viz-deck">
            <option value="" ${viz.deckCode === "" ? "selected" : ""}>Demo deck (this session's shuffle)</option>
            ${options}
          </select>
        </div>
        <div class="viz-control">
          <label for="viz-speed">Speed</label>
          <select id="viz-speed">${speedOptions}</select>
        </div>
        <div class="viz-control">
          <label for="viz-style">Card style</label>
          <select id="viz-style">
            <option value="realistic" ${viz.cardStyle === "realistic" ? "selected" : ""}>Realistic</option>
            <option value="simple" ${viz.cardStyle === "simple" ? "selected" : ""}>Simple</option>
          </select>
        </div>
      </div>
      ${truncated ? `<p class="mini-warning">Only the first ${LETTERS_PER_DECK} letters are shown — one deck, one card per letter.</p>` : ""}
      <div class="button-row">
        <button type="button" id="viz-play">${viz.playing ? "Pause" : "Play"}</button>
        <button type="button" id="viz-step">Step</button>
        <button type="button" id="viz-reset">Reset</button>
      </div>
      <div id="viz-stage" class="viz-stage">${renderStage(keys)}</div>
    </section>`;
}

export function bindVisualizerEvents(getKeys: () => VisualizerKey[]): void {
  const input = document.querySelector<HTMLInputElement>("#viz-input");
  input?.addEventListener("input", (event) => {
    viz.input = (event.currentTarget as HTMLInputElement).value;
    stopPlayback();
    viz.position = 0;
    repaintStage(getKeys());
  });

  const deckSelect = document.querySelector<HTMLSelectElement>("#viz-deck");
  deckSelect?.addEventListener("change", (event) => {
    viz.deckCode = (event.currentTarget as HTMLSelectElement).value;
    stopPlayback();
    viz.position = 0;
    repaintStage(getKeys());
  });

  const speedSelect = document.querySelector<HTMLSelectElement>("#viz-speed");
  speedSelect?.addEventListener("change", (event) => {
    viz.speedMs = Number((event.currentTarget as HTMLSelectElement).value);
  });

  const styleSelect = document.querySelector<HTMLSelectElement>("#viz-style");
  styleSelect?.addEventListener("change", (event) => {
    viz.cardStyle = (event.currentTarget as HTMLSelectElement).value as CardStyle;
    repaintStage(getKeys());
  });

  const play = document.querySelector<HTMLButtonElement>("#viz-play");
  play?.addEventListener("click", () => {
    if (viz.playing) {
      stopPlayback();
      repaintStage(getKeys());
      return;
    }
    const length = normalizedInput().length;
    if (length === 0) {
      return;
    }
    if (viz.position >= length) {
      viz.position = 0; // replay from the top
    }
    viz.playing = true;
    repaintStage(getKeys());
    scheduleTick(getKeys);
  });

  const step = document.querySelector<HTMLButtonElement>("#viz-step");
  step?.addEventListener("click", () => {
    stopPlayback();
    if (viz.position < normalizedInput().length) {
      viz.position += 1;
    }
    repaintStage(getKeys());
  });

  const reset = document.querySelector<HTMLButtonElement>("#viz-reset");
  reset?.addEventListener("click", () => {
    stopPlayback();
    viz.position = 0;
    repaintStage(getKeys());
  });
}
