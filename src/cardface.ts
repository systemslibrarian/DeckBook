/* ============================================================================
 * Playing-card faces (SVG)
 * ----------------------------------------------------------------------------
 * Renders authentic-looking card faces as inline SVG strings:
 *   - "realistic": traditional rank-appropriate pip layouts for 2-10, a large
 *      center pip for the Ace, and monogram court faces for J/Q/K, plus corner
 *      indices (rank over suit) top-left and bottom-right (rotated).
 *   - "simple": corner indices plus a single center pip. Cleaner for dense
 *      views and reduced-motion.
 *
 * Pure string builders — no DOM. viewBox is 100x140 (a ~2.5:3.5 card ratio),
 * so the same markup scales to any rendered size via width/height on <svg>.
 * ========================================================================= */

import { type Card, type Rank } from "./cipher";

export type CardStyle = "realistic" | "simple";

const RED = "#c0392b";
const BLACK = "#1b1205";

// Pip coordinates per number rank in the 100x140 viewBox. Pips whose y is
// below the vertical center (70) are drawn rotated 180deg, exactly like a
// real card, so the layout reads correctly from either end.
const PIP_LAYOUTS: Record<string, [number, number][]> = {
  "2": [[50, 30], [50, 110]],
  "3": [[50, 30], [50, 70], [50, 110]],
  "4": [[34, 30], [66, 30], [34, 110], [66, 110]],
  "5": [[34, 30], [66, 30], [50, 70], [34, 110], [66, 110]],
  "6": [[34, 30], [66, 30], [34, 70], [66, 70], [34, 110], [66, 110]],
  "7": [[34, 30], [66, 30], [50, 50], [34, 70], [66, 70], [34, 110], [66, 110]],
  "8": [[34, 30], [66, 30], [50, 50], [34, 70], [66, 70], [50, 90], [34, 110], [66, 110]],
  "9": [
    [34, 28], [66, 28], [34, 56], [66, 56], [50, 70], [34, 84], [66, 84], [34, 112], [66, 112]
  ],
  "10": [
    [34, 28], [66, 28], [50, 42], [34, 56], [66, 56], [34, 84], [66, 84], [50, 98], [34, 112], [66, 112]
  ]
};

function suitSymbol(card: Card): string {
  // label is `${rank}${symbol}` (e.g. "10♦"), so drop the rank prefix.
  return card.label.slice(card.rank.length);
}

export function cardColor(card: Card): string {
  return card.suit === "HEARTS" || card.suit === "DIAMONDS" ? RED : BLACK;
}

function pip(symbol: string, x: number, y: number, size: number, color: string): string {
  const rotate = y > 70 ? ` transform="rotate(180 ${x} ${y})"` : "";
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="middle" dominant-baseline="central"${rotate}>${symbol}</text>`;
}

// Corner index: rank stacked over a small suit symbol, at top-left; the same
// mirrored (rotated 180) at bottom-right.
function cornerIndices(rank: Rank, symbol: string, color: string): string {
  const block = (x: number, y: number, rotate: boolean) =>
    `<g${rotate ? ` transform="rotate(180 ${x} ${y})"` : ""} fill="${color}" text-anchor="middle">
       <text x="${x}" y="${y - 4}" font-size="15" font-weight="700" dominant-baseline="central">${rank}</text>
       <text x="${x}" y="${y + 11}" font-size="13" dominant-baseline="central">${symbol}</text>
     </g>`;
  return block(15, 18, false) + block(85, 122, true);
}

function courtFace(rank: Rank, symbol: string, color: string): string {
  // A tasteful monogram court card: framed panel, large rank letter, and a
  // suit pip above and below. Avoids needing illustrated art assets.
  return `
    <rect x="26" y="26" width="48" height="88" rx="6" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.55" />
    ${pip(symbol, 50, 40, 16, color)}
    <text x="50" y="72" font-size="40" font-weight="700" fill="${color}" text-anchor="middle" dominant-baseline="central" font-family="Garamond, 'Times New Roman', serif">${rank}</text>
    ${pip(symbol, 50, 104, 16, color)}`;
}

function faceBody(card: Card, style: CardStyle): string {
  const color = cardColor(card);
  const symbol = suitSymbol(card);

  if (style === "simple") {
    return cornerIndices(card.rank, symbol, color) + pip(symbol, 50, 72, 40, color);
  }

  let center: string;
  if (card.rank === "A") {
    center = pip(symbol, 50, 72, 62, color);
  } else if (card.rank === "J" || card.rank === "Q" || card.rank === "K") {
    center = courtFace(card.rank, symbol, color);
  } else {
    const layout = PIP_LAYOUTS[card.rank] ?? [];
    const size = card.rank === "10" || card.rank === "9" ? 20 : 24;
    center = layout.map(([x, y]) => pip(symbol, x, y, size, color)).join("");
  }

  return cornerIndices(card.rank, symbol, color) + center;
}

// Full inline SVG for a card face. `width`/`height` are the rendered pixel
// size; the viewBox keeps proportions and pip layout constant.
export function renderCardFaceSvg(card: Card, style: CardStyle, width = 96, height = 132): string {
  return `<svg class="card-svg" viewBox="0 0 100 140" width="${width}" height="${height}" role="img" aria-label="${card.rank} of ${card.suit.toLowerCase()}" font-family="Georgia, 'Times New Roman', serif">
    <rect x="1" y="1" width="98" height="138" rx="8" fill="#faf5e8" stroke="#c9b98d" stroke-width="1" />
    ${faceBody(card, style)}
  </svg>`;
}
