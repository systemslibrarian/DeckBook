/* ============================================================================
 * DeckBook attack & analysis math
 * ----------------------------------------------------------------------------
 * Pure functions only — no DOM, no storage. Everything here is unit-tested
 * in tests/analysis.test.ts.
 *
 * These functions power the Key Reuse Attack Lab (crib dragging) and the
 * letter-frequency histograms. They model what an EAVESDROPPER can compute:
 * they take only ciphertext (never the deck order), which is the whole point.
 * ========================================================================= */

// Count of each letter A-Z in the text. Input must already be normalized A-Z.
export function letterFrequencies(normalized: string): number[] {
  const counts = Array.from({ length: 26 }, () => 0);
  for (const char of normalized) {
    counts[char.charCodeAt(0) - 65] += 1;
  }
  return counts;
}

// Typical relative frequency of each letter in English prose (percent).
// Shown as ghost bars behind the plaintext histogram so the "spiky English
// fingerprint vs flat ciphertext" lesson is visible even for short samples.
export const ENGLISH_FREQUENCY_PERCENT: number[] = [
  8.17, 1.49, 2.78, 4.25, 12.7, 2.23, 2.02, 6.09, 6.97, 0.15, 0.77, 4.03, 2.41,
  6.75, 7.51, 1.93, 0.1, 5.99, 6.33, 9.06, 2.76, 0.98, 2.36, 0.15, 1.97, 0.07
];

// Positionwise difference (a[i] - b[i]) mod 26 over the common prefix.
// For two ciphertexts made with the same keystream k:
//   cipherA[i] - cipherB[i] = (plainA[i] + k[i]) - (plainB[i] + k[i])
//                           = plainA[i] - plainB[i]   (mod 26)
// The key cancels. This difference is public knowledge to any eavesdropper
// who captured both ciphertexts.
export function differenceMod26(a: string, b: string): number[] {
  const length = Math.min(a.length, b.length);
  const diff: number[] = [];
  for (let i = 0; i < length; i += 1) {
    diff.push(((a.charCodeAt(i) - b.charCodeAt(i)) % 26 + 26) % 26);
  }
  return diff;
}

// Crib dragging: guess that `crib` appears in message A starting at `offset`.
// Because diff[i] = plainA[i] - plainB[i] (mod 26), a correct guess for a
// slice of A reveals the same slice of B:
//
//   plainB[offset+i] = crib[i] - diff[offset+i]   (mod 26)
//
// If the guess is wrong the letters that come out are gibberish; if it is
// right, readable English appears — that is the "aha" of the attack.
// `side` says which message the crib is guessed to be in: guessing in A
// reveals B (subtract the diff), guessing in B reveals A (add the diff).
export function dragCrib(
  diff: number[],
  crib: string,
  offset: number,
  side: "A" | "B"
): string {
  const out: number[] = [];
  for (let i = 0; i < crib.length; i += 1) {
    const d = diff[offset + i];
    if (d === undefined) {
      break;
    }
    const c = crib.charCodeAt(i) - 65;
    out.push(side === "A" ? ((c - d) % 26 + 26) % 26 : (c + d) % 26);
  }
  return out.map((value) => String.fromCharCode(value + 65)).join("");
}

// Score a revealed fragment by how English-like it is: sum of the typical
// English frequency of each letter, normalized per letter. Random mod-26
// gibberish averages ~3.85%/letter; common English letters average higher.
// Used to rank crib offsets so the UI can hint "try these positions first".
export function englishScore(fragment: string): number {
  if (fragment.length === 0) {
    return 0;
  }
  let total = 0;
  for (const char of fragment) {
    total += ENGLISH_FREQUENCY_PERCENT[char.charCodeAt(0) - 65];
  }
  return total / fragment.length;
}

// All valid crib offsets ranked by englishScore of what they would reveal,
// best first. The UI uses the top entries as "promising positions" hints.
export function rankCribOffsets(
  diff: number[],
  crib: string,
  side: "A" | "B"
): { offset: number; revealed: string; score: number }[] {
  const results: { offset: number; revealed: string; score: number }[] = [];
  const lastOffset = diff.length - crib.length;
  for (let offset = 0; offset <= lastOffset; offset += 1) {
    const revealed = dragCrib(diff, crib, offset, side);
    results.push({ offset, revealed, score: englishScore(revealed) });
  }
  return results.sort((a, b) => b.score - a.score);
}
