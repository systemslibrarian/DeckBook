/* ============================================================================
 * DeckBook cipher core
 * ----------------------------------------------------------------------------
 * Pure functions only. No DOM, no localStorage, no CSS imports. Everything in
 * this file can be unit-tested in a plain Node test runner.
 *
 * Cipher protocol:
 *
 *   plaintext  -> uppercase A-Z only         (normalizeAZ)
 *              -> numbers 0..25              (lettersToNumbers)
 *              -> add keystream mod 26       (encryptText)
 *              -> ciphertext numbers 0..25
 *              -> letters A-Z                (numbersToLetters)
 *
 *   keystream[i] = deck[i].value mod 26
 *
 *   Each card contributes one keystream letter, so a 52-card deck yields
 *   exactly 52 keystream letters. One deck = up to 52 letters of message.
 *   Longer messages consume additional fresh decks in sequence.
 *
 *   Why per-card and not per-pair? A pair sum mod 26 is triangularly
 *   distributed (13 is far more likely than 0 or 25). A per-card mapping
 *   value % 26 is uniform: each of the 26 letters is hit by exactly two of
 *   the 52 cards. Uniformity matters for an educational cipher demo.
 * ========================================================================= */

export type Suit = "SPADES" | "HEARTS" | "DIAMONDS" | "CLUBS";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export type Card = {
  rank: Rank;
  suit: Suit;
  label: string;
  value: number;
};

// One deck of cards yields LETTERS_PER_DECK keystream letters. This is the
// hard cap on plaintext length per deck — anything longer needs more keys.
export const LETTERS_PER_DECK = 52;

export const SUITS: { suit: Suit; symbol: string; name: string }[] = [
  { suit: "SPADES", symbol: "♠", name: "Spades" },
  { suit: "HEARTS", symbol: "♥", name: "Hearts" },
  { suit: "DIAMONDS", symbol: "♦", name: "Diamonds" },
  { suit: "CLUBS", symbol: "♣", name: "Clubs" }
];

export const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// Build the canonical 52-card deck with a stable value 0..51 for each card.
// Suit order: SPADES, HEARTS, DIAMONDS, CLUBS. Rank order: A, 2..10, J, Q, K.
// value = suitIndex * 13 + rankIndex.
export function createStandardDeck(): Card[] {
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

export function suitName(suit: Suit): string {
  const found = SUITS.find((item) => item.suit === suit);
  return found?.name ?? suit;
}

export function cardAccessibleLabel(card: Card): string {
  return `${card.rank} of ${suitName(card.suit)}`;
}

// Strip everything that is not an A-Z letter and uppercase the rest.
export function normalizeAZ(text: string): string {
  return text.toUpperCase().replace(/[^A-Z]/g, "");
}

// 'A' (char code 65) -> 0, ..., 'Z' (char code 90) -> 25.
export function lettersToNumbers(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0) - 65);
}

// 0 -> 'A', ..., 25 -> 'Z'. Inverse of lettersToNumbers.
export function numbersToLetters(values: number[]): string {
  return values.map((value) => String.fromCharCode(value + 65)).join("");
}

// Cosmetic grouping: "HELLOWORLD" -> "HELLO WORLD".
export function groupedFive(text: string): string {
  return text.match(/.{1,5}/g)?.join(" ") ?? "";
}

// Derive the keystream from a shuffled 52-card deck.
//
//   keystream[i] = deck[i].value mod 26
//
// Each card contributes one keystream letter (uniform 0..25 distribution),
// so a full deck gives 52 keystream letters. The deck order is the secret —
// shuffle it and the keystream is unrecognisable to anyone without the
// same deck.
export function keystreamFromDeck(deckOrder: Card[]): number[] {
  return deckOrder.map((card) => card.value % 26);
}

// Encrypt: cipher[i] = ( plain[i] + keystream[i] ) mod 26.
// Caller guarantees normalizedPlaintext.length <= LETTERS_PER_DECK.
export function encryptText(normalizedPlaintext: string, deckOrder: Card[]): string {
  const plainNums = lettersToNumbers(normalizedPlaintext);
  const stream = keystreamFromDeck(deckOrder);
  const cipherNums = plainNums.map((value, index) => (value + stream[index]) % 26);
  return numbersToLetters(cipherNums);
}

// Decrypt: plain[i] = ( cipher[i] - keystream[i] + 26 ) mod 26.
// The "+ 26" keeps the result non-negative in JS modular arithmetic.
export function decryptText(normalizedCiphertext: string, deckOrder: Card[]): string {
  const cipherNums = lettersToNumbers(normalizedCiphertext);
  const stream = keystreamFromDeck(deckOrder);
  const plainNums = cipherNums.map((value, index) => (value - stream[index] + 26) % 26);
  return numbersToLetters(plainNums);
}

// Multi-deck mode: split the message into LETTERS_PER_DECK-sized blocks and
// encrypt each block with the next deck in the list.
export function encryptWithDecks(normalizedPlaintext: string, deckOrders: Card[][]): string {
  let result = "";
  for (let i = 0; i < normalizedPlaintext.length; i += LETTERS_PER_DECK) {
    const block = normalizedPlaintext.slice(i, i + LETTERS_PER_DECK);
    const deck = deckOrders[Math.floor(i / LETTERS_PER_DECK)];
    result += encryptText(block, deck);
  }
  return result;
}

// Mirror of encryptWithDecks. Decks must be supplied in the same order as
// they were used to encrypt.
export function decryptWithDecks(normalizedCiphertext: string, deckOrders: Card[][]): string {
  let result = "";
  for (let i = 0; i < normalizedCiphertext.length; i += LETTERS_PER_DECK) {
    const block = normalizedCiphertext.slice(i, i + LETTERS_PER_DECK);
    const deck = deckOrders[Math.floor(i / LETTERS_PER_DECK)];
    result += decryptText(block, deck);
  }
  return result;
}

// One deck covers LETTERS_PER_DECK letters. Clamp the minimum to 1 because
// every other code path assumes at least one deck is in play.
export function requiredDeckCount(length: number): number {
  return Math.max(1, Math.ceil(length / LETTERS_PER_DECK));
}

// Uniform random integer in [0, maxExclusive) backed by crypto.getRandomValues.
// Rejection sampling removes the modulo bias that a naive `% maxExclusive`
// would introduce.
export function secureRandomInt(maxExclusive: number): number {
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

// Fisher-Yates shuffle driven by secureRandomInt.
export function secureShuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = secureRandomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Stable text form of a deck order, used as the input to SHA-256.
export function deckSignature(deckOrder: Card[]): string {
  return deckOrder.map((card) => card.value.toString().padStart(2, "0")).join("-");
}
