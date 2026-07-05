import { describe, expect, it } from "vitest";
import { PUZZLES } from "../src/challenge";
import { createStandardDeck, encryptText, normalizeAZ, secureShuffle } from "../src/cipher";
import { differenceMod26, dragCrib } from "../src/analysis";

// The challenge relies on the two-time-pad property: because both puzzle
// messages are encrypted with the SAME key, the difference of the ciphertexts
// equals the difference of the plaintexts, so crib dragging on the captured
// ciphertext recovers the messages. These tests verify each shipped puzzle is
// actually solvable that way.

describe("challenge puzzles", () => {
  it("ships at least three puzzles with unique ids", () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(3);
    const ids = new Set(PUZZLES.map((p) => p.id));
    expect(ids.size).toBe(PUZZLES.length);
  });

  for (const puzzle of PUZZLES) {
    it(`"${puzzle.id}" is solvable by crib dragging on captured ciphertext`, () => {
      const plainA = normalizeAZ(puzzle.plainA);
      const plainB = normalizeAZ(puzzle.plainB);
      expect(plainA.length).toBeGreaterThan(0);
      expect(plainB.length).toBeGreaterThan(0);

      // Encrypt BOTH with one shared key, as the challenge does.
      const key = secureShuffle(createStandardDeck());
      const cipherA = encryptText(plainA, key);
      const cipherB = encryptText(plainB, key);

      // Eve only has the ciphertexts. Their difference is key-independent.
      const capturedDiff = differenceMod26(cipherA, cipherB);
      expect(capturedDiff).toEqual(differenceMod26(plainA, plainB));

      // Guessing a real prefix of A recovers the matching prefix of B.
      const common = Math.min(plainA.length, plainB.length);
      const crib = plainA.slice(0, Math.min(6, common));
      const revealed = dragCrib(capturedDiff, crib, 0, "A");
      expect(revealed).toBe(plainB.slice(0, crib.length));
    });
  }
});
