import { describe, expect, it } from "vitest";
import {
  LETTERS_PER_DECK,
  createStandardDeck,
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
  secureShuffle,
  type Card
} from "../src/cipher";

// A deterministic deck for tests: just the canonical 0..51 order. The cipher
// math works regardless of shuffle; we use the canonical deck so test
// expectations are easy to reason about.
function canonicalDeck(): Card[] {
  return createStandardDeck();
}

// A trivial "shuffle": reverse. Pure function, no crypto involved, so tests
// stay deterministic. Used to confirm encrypt/decrypt are inverses for any
// deck order, not just the canonical one.
function reversedDeck(): Card[] {
  return [...createStandardDeck()].reverse();
}

describe("normalizeAZ", () => {
  it("uppercases letters and strips everything else", () => {
    expect(normalizeAZ("Hello, World! 123")).toBe("HELLOWORLD");
  });

  it("returns empty for input with no letters", () => {
    expect(normalizeAZ("12 34 !!")).toBe("");
  });

  it("handles unicode by stripping it (A-Z only)", () => {
    expect(normalizeAZ("café — élan")).toBe("CAFLAN");
  });
});

describe("lettersToNumbers / numbersToLetters", () => {
  it("maps A..Z to 0..25 round-trip", () => {
    const text = "THEQUICKBROWNFOX";
    expect(numbersToLetters(lettersToNumbers(text))).toBe(text);
  });

  it("maps the alphabet exactly", () => {
    expect(lettersToNumbers("ABCXYZ")).toEqual([0, 1, 2, 23, 24, 25]);
    expect(numbersToLetters([0, 1, 25])).toBe("ABZ");
  });
});

describe("groupedFive", () => {
  it("splits into 5-letter blocks", () => {
    expect(groupedFive("HELLOWORLD")).toBe("HELLO WORLD");
  });

  it("handles a final short block", () => {
    expect(groupedFive("HELLOWORLDX")).toBe("HELLO WORLD X");
  });

  it("returns empty for empty input", () => {
    expect(groupedFive("")).toBe("");
  });
});

describe("keystreamFromDeck", () => {
  it("produces exactly LETTERS_PER_DECK letters", () => {
    const stream = keystreamFromDeck(canonicalDeck());
    expect(stream).toHaveLength(LETTERS_PER_DECK);
  });

  it("yields a uniform distribution over 0..25 (each letter hit exactly twice)", () => {
    // The canonical deck contains every value 0..51 exactly once. Mapping
    // value % 26 means each of the 26 keystream letters is produced by
    // exactly two cards. This is the whole reason we switched away from
    // the (a+b) mod 26 pair-sum formula.
    const counts = new Map<number, number>();
    for (const k of keystreamFromDeck(canonicalDeck())) {
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (let letter = 0; letter < 26; letter += 1) {
      expect(counts.get(letter)).toBe(2);
    }
  });

  it("changes when deck order changes", () => {
    const a = keystreamFromDeck(canonicalDeck());
    const b = keystreamFromDeck(reversedDeck());
    expect(a).not.toEqual(b);
  });
});

describe("encryptText / decryptText round-trip", () => {
  it("recovers the plaintext for a short message", () => {
    const deck = canonicalDeck();
    const plain = "HELLO";
    expect(decryptText(encryptText(plain, deck), deck)).toBe(plain);
  });

  it("recovers the plaintext at the LETTERS_PER_DECK boundary", () => {
    const deck = canonicalDeck();
    const plain = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(2); // exactly 52
    expect(plain).toHaveLength(LETTERS_PER_DECK);
    expect(decryptText(encryptText(plain, deck), deck)).toBe(plain);
  });

  it("works for a reversed (non-canonical) deck too", () => {
    const deck = reversedDeck();
    const plain = "ATTACKATDAWN";
    expect(decryptText(encryptText(plain, deck), deck)).toBe(plain);
  });

  it("matches the worked example from the How It Works panel", () => {
    // The doc example uses a deck whose first two cards have values 16 and 22.
    // value 16 = 5 of Hearts (suitIndex 1 * 13 + rankIndex 3). The canonical
    // deck happens to have value 16 at position 16, so build a tiny custom
    // 2-card deck just to verify the documented sums.
    const deck: Card[] = [
      { rank: "5", suit: "HEARTS", label: "5♥", value: 16 },
      { rank: "10", suit: "CLUBS", label: "10♣", value: 48 }
    ];
    expect(encryptText("HI", deck)).toBe("XE");
    expect(decryptText("XE", deck)).toBe("HI");
  });
});

describe("encryptWithDecks / decryptWithDecks", () => {
  it("splits at LETTERS_PER_DECK boundaries", () => {
    const decks = [canonicalDeck(), reversedDeck()];
    const plain = "A".repeat(LETTERS_PER_DECK) + "B".repeat(20);
    const cipher = encryptWithDecks(plain, decks);
    expect(cipher).toHaveLength(plain.length);
    expect(decryptWithDecks(cipher, decks)).toBe(plain);
  });

  it("uses each deck for its own block, not the whole message", () => {
    // If we encrypt a single LETTERS_PER_DECK-letter message with [deckA],
    // we should get the same result as encryptText with deckA, ignoring
    // any extra decks supplied.
    const decks = [canonicalDeck(), reversedDeck()];
    const plain = "X".repeat(LETTERS_PER_DECK);
    expect(encryptWithDecks(plain, decks)).toBe(encryptText(plain, decks[0]));
  });

  it("recovers the empty string", () => {
    expect(decryptWithDecks(encryptWithDecks("", [canonicalDeck()]), [canonicalDeck()])).toBe("");
  });
});

describe("requiredDeckCount", () => {
  it("returns 1 for an empty message (callers expect at least one deck)", () => {
    expect(requiredDeckCount(0)).toBe(1);
  });

  it("returns 1 for messages up to LETTERS_PER_DECK letters", () => {
    expect(requiredDeckCount(1)).toBe(1);
    expect(requiredDeckCount(LETTERS_PER_DECK)).toBe(1);
  });

  it("returns 2 just past the boundary", () => {
    expect(requiredDeckCount(LETTERS_PER_DECK + 1)).toBe(2);
  });

  it("scales linearly", () => {
    expect(requiredDeckCount(LETTERS_PER_DECK * 3)).toBe(3);
    expect(requiredDeckCount(LETTERS_PER_DECK * 3 + 1)).toBe(4);
  });
});

describe("secureRandomInt", () => {
  it("rejects non-positive or non-integer bounds", () => {
    expect(() => secureRandomInt(0)).toThrow();
    expect(() => secureRandomInt(-5)).toThrow();
    expect(() => secureRandomInt(3.5)).toThrow();
  });

  it("produces values within [0, maxExclusive)", () => {
    for (let i = 0; i < 200; i += 1) {
      const v = secureRandomInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe("secureShuffle", () => {
  it("preserves length and elements", () => {
    const deck = createStandardDeck();
    const shuffled = secureShuffle(deck);
    expect(shuffled).toHaveLength(deck.length);
    expect(new Set(shuffled.map((c) => c.value))).toEqual(new Set(deck.map((c) => c.value)));
  });

  it("does not mutate the input", () => {
    const deck = createStandardDeck();
    const snapshot = deck.map((c) => c.value);
    secureShuffle(deck);
    expect(deck.map((c) => c.value)).toEqual(snapshot);
  });

  it("almost certainly changes order for a 52-card deck", () => {
    // The probability that a random shuffle of 52 elements is the identity
    // is 1/52! — vanishingly small. If this flakes, you have bigger problems.
    const deck = createStandardDeck();
    const shuffled = secureShuffle(deck);
    const sameOrder = shuffled.every((c, i) => c.value === deck[i].value);
    expect(sameOrder).toBe(false);
  });
});
