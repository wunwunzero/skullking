// The crew: original 16×16 pixel-art characters. Each has its own colour AND its own silhouette
// (hat, hair, tentacles, claws…) so players never depend on colour alone to tell each other apart.
// Grid keys: . empty · k outline · s skin · w white · m mouth · y gold · b beard · g parrot green
//            r main colour · R main (dark) · L light accent · T accent

const SPRITES = {
  captain: [
    '................',
    '......kkkk......',
    '...kkkkwwkkkk...',
    '.kkkkkwkkwkkkkk.',
    'kyyyyyyyyyyyyyyk',
    '.kk.ssssssss.kk.',
    '....ssssssss....',
    '...ssksssskss...',
    '...ssssssssss...',
    '....ssmmmmss....',
    '.....ssssss.....',
    '....RRssssRR....',
    '..RRRRRwwRRRRR..',
    '.RRrrrrwwrrrrRR.',
    '.rrrryrrrryrrrr.',
    '.rrrrrrrrrrrrrr.',
  ],
  deckhand: [
    '................',
    '................',
    '.....rrrrrr.....',
    '....rrrrrrrr....',
    '...rrwrrrrwrr...',
    '...rrrrrrrrrrRR.',
    '....ssssssss.RR.',
    '...ssksssskss...',
    '...ssssssssss...',
    '....sssmmsss....',
    '.....ssssss.....',
    '....wwsssssww...',
    '..wwwwwwwwwwww..',
    '.rrrrrrrrrrrrrr.',
    '.wwwwwwwwwwwwww.',
    '.rrrrrrrrrrrrrr.',
  ],
  gunner: [
    '................',
    '................',
    '................',
    '.....rrrrrr.....',
    '....rrrrrrrr....',
    '...rrrrrrrrrr...',
    '...ssssssssss...',
    '...skkkssskss...',
    '...ssssssssss...',
    '...sbbbbbbbbs...',
    '....bbmmmmbb....',
    '.....bbbbbb.....',
    '..RRRRRRRRRRRR..',
    '.RRRwwwwwwwwRRR.',
    '.RRRwwwwwwwwRRR.',
    '.RRRwwwwwwwwRRR.',
  ],
  parrot: [
    '................',
    '................',
    '....rrrrrrr.....',
    '...rrrrrrrrr....',
    '..rrrrrrrrrrr...',
    '...ssssssss.....',
    '...ssssssss.ggg.',
    '...ssksskss.gkgy',
    '...ssssssss.ggg.',
    '...sssmmsss.ggg.',
    '....ssssss..gg..',
    '...RRRssRRRggR..',
    '..RRRRRRRRRRRRR.',
    '.RRRRRRRRRRRRRR.',
    '.RRRRyRRRRyRRRR.',
    '.RRRRRRRRRRRRRR.',
  ],
  coralia: [
    '................',
    '.....rrrrrr.....',
    '....rrrrrrrr....',
    '...rrrrrrrrrry..',
    '..rrrssssssrrr..',
    '..rrssssssssrr..',
    '..rrssksskssrr..',
    '..rrssssssssrr..',
    '..rrsssmmsssrr..',
    '..rrrssssssrrr..',
    '.rrrr.ssss.rrrr.',
    '.rrr.ssssss.rrr.',
    '.rr.ssssssss.rr.',
    '..rssTTssTTssr..',
    '...sTTTssTTTs...',
    '...ssssssssss...',
  ],
  pearl: [
    '................',
    '..rr........rr..',
    '.rrrr.rrrr.rrrr.',
    '.rrrrrrrrrrrrrr.',
    '..rrrrrrrrrrrr..',
    '...rssssssssr...',
    '...rssksskssr...',
    '...ssssssssss...',
    '....sssmmsss....',
    '.....ssssss.....',
    '......ssss......',
    '....wsssssssw...',
    '...ssssssssss...',
    '..ssTTTssTTTss..',
    '..sTTTTssTTTTs..',
    '...ssssssssss...',
  ],
  kraken: [
    '................',
    '.....rrrrrr.....',
    '....rrrrrrrr....',
    '...rrrrrrrrrr...',
    '...rrrrrrrrrr...',
    '..rrwwrrrrwwrr..',
    '..rrwkrrrrwkrr..',
    '..rrrrrrrrrrrr..',
    '..rrrrrkkrrrrr..',
    '...rrrrrrrrrr...',
    '..r.rr.rr.rr.r..',
    '.rr.rr.rr.rr.rr.',
    '.r..r..rr..r..r.',
    '.rr.rr.rr.rr.rr.',
    '..r..r....r..r..',
    '................',
  ],
  whale: [
    '................',
    '................',
    '..........w.w...',
    '...........w....',
    '................',
    '....rrrrrrr.....',
    '..rrrrrrrrrrr...',
    '.rrrrrrrrrrrrr.r',
    '.rrwkrrrrrrrrrrr',
    '.rrrrrrrrrrrrrr.',
    '.rLLLLLLLrrrrrrr',
    '..LLLLLLLLrrrr..',
    '....LLLLLLrr....',
    '................',
    '................',
    '................',
  ],
  crab: [
    '................',
    '.rr..........rr.',
    'rrrr........rrrr',
    'r.rr........rr.r',
    '..rr........rr..',
    '...r..w..w..r...',
    '...r..k..k..r...',
    '....rrrrrrrr....',
    '...rrrrrrrrrr...',
    '..rrrrrrrrrrrr..',
    '..rrrrkkkkrrrr..',
    '...rrrrrrrrrr...',
    '..r.r.r..r.r.r..',
    '.r..r.r..r.r..r.',
    '................',
    '................',
  ],
  skullking: [
    '................',
    '...y..y..y..y...',
    '...yy.yyyy.yy...',
    '...yyyyyyyyyy...',
    '...yryyyyyyry...',
    '...wwwwwwwwww...',
    '..wwwwwwwwwwww..',
    '..wwkkwwwwkkww..',
    '..wwkkwwwwkkww..',
    '..wwwwwkkwwwww..',
    '...wwwwwwwwww...',
    '....wkwkwkwk....',
    '..RRRwwwwwwRRR..',
    '.RRRRRyyyyRRRRR.',
    '.RRRRRRyyRRRRRR.',
    '.RRRRRRRRRRRRRR.',
  ],
};

// name, main colour, dark variant, skin, accent. Skull King is earned: only last game's winner may pick him.
export const CREW = {
  captain:   { name: 'Captain',      color: '#d6453d', dark: '#9e2b25', skin: '#f1c27d' },
  deckhand:  { name: 'Deckhand',     color: '#3b82c4', dark: '#255c8f', skin: '#8d5524' },
  gunner:    { name: 'Gunner',       color: '#2e9e63', dark: '#1d6b42', skin: '#e0ac69' },
  parrot:    { name: 'Parrot Pete',  color: '#7a5bd6', dark: '#5440a0', skin: '#c68642' },
  coralia:   { name: 'Coralia',      color: '#e5803e', dark: '#b05a24', skin: '#ffdbac', accent: '#1a9bb0' },
  pearl:     { name: 'Pearl',        color: '#1a9bb0', dark: '#126e7d', skin: '#c68642', accent: '#e86f9a' },
  kraken:    { name: 'Kraken',       color: '#a0663a', dark: '#6e4325' },
  whale:     { name: 'Whale',        color: '#6b8299', dark: '#4a5d70', light: '#d3dde7' },
  crab:      { name: 'Crab',         color: '#e0a526', dark: '#a8780f' },
  skullking: { name: 'Skull King',   color: '#7a1f2a', dark: '#7a1f2a', earned: true },
};
export const CREW_IDS = Object.keys(CREW);

function paint(id, key) {
  const c = CREW[id];
  return {
    k: '#1b1414', s: c.skin || '#f1c27d', w: '#ffffff', m: '#b5524a', y: '#f0b54a', b: '#6b4226', g: '#3fae5a',
    r: c.color, R: c.dark, L: c.light || '#e8eef4', T: c.accent || '#f0b54a',
  }[key];
}

// Crisp SVG: one rect per horizontal run of same-coloured pixels.
const cache = {};
export function spriteSVG(id, cls = 'sprite', label = '') {
  if (!SPRITES[id]) return '';
  if (!cache[id]) {
    let rects = '';
    SPRITES[id].forEach((row, y) => {
      for (let x = 0; x < 16;) {
        const ch = row[x];
        if (ch === '.') { x++; continue; }
        let w = 1;
        while (row[x + w] === ch) w++;
        rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${paint(id, ch)}"/>`;
        x += w;
      }
    });
    cache[id] = rects;
  }
  const c = CREW[id];
  return `<svg class="${cls}" viewBox="0 0 16 16" shape-rendering="crispEdges" style="--crew:${c.color}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${cache[id]}</svg>`;
}

// Just the pixel rects, for nesting inside another SVG (the end-of-game chart).
export function spriteRects(id) { spriteSVG(id); return cache[id] || ''; }
