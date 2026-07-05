import { describe, expect, it } from "vitest";
import {
  buildShareUrl,
  decodeSharePayload,
  encodeSharePayload,
  parseShareFragment
} from "../src/share";

describe("encode/decode share payload", () => {
  it("round-trips codes and ciphertext", () => {
    const encoded = encodeSharePayload(["LANTERN-42", "CROWN-88"], "DMTQZ RQHLA");
    const decoded = decodeSharePayload(encoded);
    expect(decoded).toEqual({ v: 1, codes: ["LANTERN-42", "CROWN-88"], ct: "DMTQZ RQHLA" });
  });

  it("produces URL-safe output (no + / =)", () => {
    const encoded = encodeSharePayload(["RIVER-1"], "ABCDE FGHIJ KLMNO");
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("rejects malformed base64", () => {
    expect(decodeSharePayload("!!!not-base64!!!")).toBeNull();
  });

  it("rejects a payload missing required fields", () => {
    const badVersion = btoa(JSON.stringify({ v: 2, codes: ["X-1"], ct: "AB" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    expect(decodeSharePayload(badVersion)).toBeNull();
  });

  it("rejects an empty codes array", () => {
    const encoded = encodeSharePayload([], "ABCDE");
    expect(decodeSharePayload(encoded)).toBeNull();
  });
});

describe("buildShareUrl / parseShareFragment", () => {
  it("builds a #m= fragment that parses back", () => {
    const url = buildShareUrl("https://example.com/deckbook/", ["MOON-7"], "QWERT YUIOP");
    expect(url).toContain("#m=");
    const hash = url.slice(url.indexOf("#"));
    const parsed = parseShareFragment(hash);
    expect(parsed).toEqual({ v: 1, codes: ["MOON-7"], ct: "QWERT YUIOP" });
  });

  it("returns null for a hash without m=", () => {
    expect(parseShareFragment("#other=1")).toBeNull();
    expect(parseShareFragment("")).toBeNull();
  });
});
