/* ============================================================================
 * DeckBook share links
 * ----------------------------------------------------------------------------
 * Encode an encrypted transmission (index codes + ciphertext — the PUBLIC
 * half of the protocol) into a URL fragment so it can travel as a QR code
 * to another device. The deck orders never go in here: the receiving device
 * must already hold the same DeckBook, which is exactly the lesson.
 *
 * Pure functions, unit-tested in tests/share.test.ts.
 * ========================================================================= */

export type SharePayload = {
  v: 1;
  codes: string[];
  ct: string;
};

// The payload is ASCII-only by construction (index codes are WORD-NUMBER,
// ciphertext is A-Z and spaces), so btoa/atob are safe here.
function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

export function encodeSharePayload(codes: string[], ciphertext: string): string {
  const payload: SharePayload = { v: 1, codes, ct: ciphertext };
  return toBase64Url(JSON.stringify(payload));
}

// Returns null for anything that is not a well-formed v1 payload. The
// fragment arrives from an untrusted URL, so validate every field.
export function decodeSharePayload(encoded: string): SharePayload | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const maybe = parsed as Record<string, unknown>;
    if (
      maybe.v !== 1 ||
      typeof maybe.ct !== "string" ||
      !Array.isArray(maybe.codes) ||
      maybe.codes.length === 0 ||
      !maybe.codes.every((code) => typeof code === "string" && code.length > 0)
    ) {
      return null;
    }
    return { v: 1, codes: maybe.codes as string[], ct: maybe.ct };
  } catch {
    return null;
  }
}

// Full URL for the QR code: current page + #m=<payload>.
export function buildShareUrl(baseUrl: string, codes: string[], ciphertext: string): string {
  return `${baseUrl}#m=${encodeSharePayload(codes, ciphertext)}`;
}

// Parse a location.hash value ("#m=..." or "m=..."). Null if absent/invalid.
export function parseShareFragment(hash: string): SharePayload | null {
  const match = hash.replace(/^#/, "").match(/^m=(.+)$/);
  if (!match) {
    return null;
  }
  return decodeSharePayload(match[1]);
}
