import { describe, expect, it } from "vitest";
import {
  ENGLISH_FREQUENCY_PERCENT,
  differenceMod26,
  dragCrib,
  englishScore,
  letterFrequencies,
  rankCribOffsets
} from "../src/analysis";
import { createStandardDeck, encryptText, normalizeAZ, secureShuffle } from "../src/cipher";

describe("letterFrequencies", () => {
  it("counts each letter A-Z", () => {
    const counts = letterFrequencies("AABBBC");
    expect(counts[0]).toBe(2); // A
    expect(counts[1]).toBe(3); // B
    expect(counts[2]).toBe(1); // C
    expect(counts[25]).toBe(0); // Z
  });

  it("returns 26 buckets summing to the length", () => {
    const text = "THEQUICKBROWNFOX";
    const counts = letterFrequencies(text);
    expect(counts).toHaveLength(26);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(text.length);
  });
});

describe("ENGLISH_FREQUENCY_PERCENT", () => {
  it("has 26 entries roughly summing to 100", () => {
    expect(ENGLISH_FREQUENCY_PERCENT).toHaveLength(26);
    const sum = ENGLISH_FREQUENCY_PERCENT.reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(98);
    expect(sum).toBeLessThan(102);
  });
});

describe("differenceMod26", () => {
  it("computes positionwise (a-b) mod 26 over the common prefix", () => {
    // A=0, C=2 -> diff 2; B=1, A=0 -> diff 1
    expect(differenceMod26("AB", "CA")).toEqual([(0 - 2 + 26) % 26, 1]);
  });

  it("stops at the shorter length", () => {
    expect(differenceMod26("ABCD", "AB")).toHaveLength(2);
  });

  it("cancels the key: cipher diff equals plaintext diff for reused keys", () => {
    const deck = secureShuffle(createStandardDeck());
    const plainA = normalizeAZ("ATTACKATDAWN");
    const plainB = normalizeAZ("DEFENDTHEEAS");
    const cipherA = encryptText(plainA, deck);
    const cipherB = encryptText(plainB, deck);
    expect(differenceMod26(cipherA, cipherB)).toEqual(differenceMod26(plainA, plainB));
  });
});

describe("dragCrib", () => {
  it("recovers the other message when the crib and offset are correct", () => {
    const deck = secureShuffle(createStandardDeck());
    const plainA = normalizeAZ("ATTACKATDAWN");
    const plainB = normalizeAZ("DEFENDTHEEAS");
    const diff = differenceMod26(encryptText(plainA, deck), encryptText(plainB, deck));

    // Guess a real substring of A at its true offset -> reveals B's slice.
    const offset = 4;
    const crib = plainA.slice(offset, offset + 4); // "CKAT"
    const revealed = dragCrib(diff, crib, offset, "A");
    expect(revealed).toBe(plainB.slice(offset, offset + 4));
  });

  it("is symmetric: guessing in B reveals A", () => {
    const deck = secureShuffle(createStandardDeck());
    const plainA = normalizeAZ("MEETMEATNOON");
    const plainB = normalizeAZ("BURNAFTERUSE");
    const diff = differenceMod26(encryptText(plainA, deck), encryptText(plainB, deck));

    const crib = plainB.slice(0, 4);
    expect(dragCrib(diff, crib, 0, "B")).toBe(plainA.slice(0, 4));
  });

  it("truncates the crib at the end of the difference", () => {
    const diff = [1, 2, 3];
    expect(dragCrib(diff, "ABCDEF", 1, "A")).toHaveLength(2);
  });
});

describe("englishScore / rankCribOffsets", () => {
  it("scores common English higher than random gibberish", () => {
    expect(englishScore("THERE")).toBeGreaterThan(englishScore("QZJXV"));
  });

  it("ranks the true offset among the best when the crib is real", () => {
    const deck = secureShuffle(createStandardDeck());
    const plainA = normalizeAZ("THEQUICKBROWNFOXJUMPS");
    const plainB = normalizeAZ("PACKMYBOXWITHFIVEDOZE");
    const diff = differenceMod26(encryptText(plainA, deck), encryptText(plainB, deck));

    // The crib "PACK" really is in B at offset 0, revealing A's start.
    const ranked = rankCribOffsets(diff, "PACK", "B");
    expect(ranked[0].revealed.length).toBe(4);
    const trueHit = ranked.find((hit) => hit.offset === 0);
    expect(trueHit?.revealed).toBe(plainA.slice(0, 4));
  });
});
