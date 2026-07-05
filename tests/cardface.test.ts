import { describe, expect, it } from "vitest";
import { cardColor, renderCardFaceSvg } from "../src/cardface";
import { createStandardDeck, type Card } from "../src/cipher";

function card(label: string): Card {
  const found = createStandardDeck().find((c) => c.label === label);
  if (!found) {
    throw new Error(`no such card: ${label}`);
  }
  return found;
}

// Count occurrences of a suit symbol in the rendered SVG. Realistic number
// cards draw N center pips plus 2 corner-index symbols, so total = N + 2.
function countSymbol(svg: string, symbol: string): number {
  return svg.split(symbol).length - 1;
}

describe("renderCardFaceSvg", () => {
  it("draws the right number of pips for number cards (realistic)", () => {
    const seven = card("7♥");
    const svg = renderCardFaceSvg(seven, "realistic");
    expect(countSymbol(svg, "♥")).toBe(7 + 2); // 7 center pips + 2 corners
  });

  it("draws two corner symbols plus one big pip in simple style", () => {
    const four = card("4♠");
    const svg = renderCardFaceSvg(four, "simple");
    expect(countSymbol(svg, "♠")).toBe(1 + 2); // 1 center + 2 corners
  });

  it("renders court cards without a pip layout", () => {
    const king = card("K♣");
    const svg = renderCardFaceSvg(king, "realistic");
    expect(svg).toContain(">K<");
    // Court face: 2 corner symbols + 2 monogram pips = 4 club symbols.
    expect(countSymbol(svg, "♣")).toBe(4);
  });

  it("produces a well-formed svg element with an accessible label", () => {
    const ace = card("A♦");
    const svg = renderCardFaceSvg(ace, "realistic");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toContain('aria-label="A of diamonds"');
  });

  it("colors red suits and black suits differently", () => {
    expect(cardColor(card("A♥"))).not.toBe(cardColor(card("A♠")));
  });
});
