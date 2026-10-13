---
name: Skull King Scorer
description: A live multi-phone Skull King scorekeeper drawn as an admiralty chart, with scores as soundings and the leader in deep water.
colors:
  chart-paper: "#f6f8fa"
  chart-paper-surface: "#ffffff"
  shoal-tint: "#e9f1f8"
  shoal-tint-deep: "#d9e7f3"
  hairline: "rgba(14, 27, 44, .13)"
  hairline-strong: "rgba(14, 27, 44, .26)"
  chart-ink: "#0e1b2c"
  chart-ink-2: "#44546a"
  chart-ink-3: "#5f6f84"
  chart-magenta: "#c2187a"
  chart-magenta-wash: "rgba(194, 24, 122, .08)"
  on-magenta: "#ffffff"
  brass: "#a8720c"
  brass-fill: "#e3a92b"
  made-green: "#1d7a4b"
  miss-red: "#b3222c"
  miss-hatch: "rgba(179, 34, 44, .14)"
  tarred-wood: "#121010"
  tarred-wood-surface: "#1c1917"
  tarred-wood-tint: "#25211e"
  tarred-wood-tint-deep: "#312b27"
  night-hairline: "rgba(240, 228, 214, .12)"
  night-hairline-strong: "rgba(240, 228, 214, .25)"
  night-ink: "#f1ebe4"
  night-ink-2: "#b8ada1"
  night-ink-3: "#998f84"
  night-magenta: "#f2569f"
  night-magenta-wash: "rgba(242, 86, 159, .12)"
  night-on-magenta: "#1a0610"
  night-brass: "#e9b74c"
  night-made-green: "#6fcf97"
  night-miss-red: "#ff7a72"
  night-miss-hatch: "rgba(255, 122, 114, .16)"
  night-water-1: "#1f3a3d"
  night-water-2: "#182a2b"
  crew-captain: "#d6453d"
  crew-deckhand: "#3b82c4"
  crew-gunner: "#2e9e63"
  crew-parrot-pete: "#7a5bd6"
  crew-coralia: "#e5803e"
  crew-pearl: "#1a9bb0"
  crew-kraken: "#a0663a"
  crew-whale: "#6b8299"
  crew-crab: "#e0a526"
  crew-cook: "#7d8f2e"
  crew-first-mate: "#3f4aa8"
  crew-lookout: "#4fb3d9"
  crew-lady-captain: "#c46aa0"
  crew-tigress: "#ea6a1f"
  crew-escape-flag: "#8c96a3"
  crew-loot-chest: "#23967f"
  crew-ghost-pirate: "#3f8f8a"
  crew-skeleton: "#8a8270"
  crew-sea-witch: "#8e44ad"
  crew-skull-king: "#7a1f2a"
  flag-teal: "#1a9bb0"
  flag-vermilion: "#e5603e"
  flag-green: "#2e9e63"
  flag-violet: "#6a5acd"
  flag-saffron: "#d99a1e"
  flag-blue: "#3b82c4"
  flag-umber: "#a0663a"
  flag-slate: "#6b7a8c"
typography:
  display:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "clamp(2.6rem, 12vw, 3.8rem)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-.045em"
  headline:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 750
    lineHeight: 1.15
    letterSpacing: "-.02em"
  title:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-.02em"
  body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: ".8rem"
    fontWeight: 650
    lineHeight: 1.3
  sounding:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 750
    lineHeight: 1
    letterSpacing: "-.01em"
    fontFeature: "\"tnum\" 1"
  sounding-big:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "2.4rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-.03em"
    fontFeature: "\"tnum\" 1"
  game-code:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: ".28em"
rounded:
  flag: "2px"
  tile-sm: "5px"
  tile: "7px"
  badge: "6px"
  tag: "8px"
  cell: "10px"
  tile-row: "10px"
  control: "12px"
  piece: "14px"
  card: "18px"
  sheet: "20px"
  pill: "999px"
spacing:
  hair: "1px"
  hair-retina: ".5px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  pad: "16px"
  section: "22px"
  tap: "52px"
  column: "560px"
  column-table: "1100px"
components:
  button-primary:
    backgroundColor: "{colors.chart-magenta}"
    textColor: "{colors.on-magenta}"
    typography: "{typography.label}"
    rounded: "{rounded.piece}"
    padding: "10px 16px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "color-mix(in srgb, #c2187a 86%, #0e1b2c)"
  button-secondary:
    backgroundColor: "{colors.chart-paper-surface}"
    textColor: "{colors.chart-ink}"
    rounded: "{rounded.piece}"
    padding: "10px 16px"
    height: "52px"
  button-secondary-hover:
    backgroundColor: "{colors.shoal-tint}"
  button-ink:
    backgroundColor: "{colors.chart-ink}"
    textColor: "{colors.chart-paper}"
    rounded: "{rounded.piece}"
    padding: "10px 16px"
    height: "52px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.chart-ink-2}"
    rounded: "{rounded.piece}"
    padding: "10px 16px"
  input-text:
    backgroundColor: "{colors.chart-paper-surface}"
    textColor: "{colors.chart-ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "52px"
  card:
    backgroundColor: "{colors.chart-paper-surface}"
    rounded: "{rounded.card}"
    padding: "16px"
  card-quiet:
    backgroundColor: "{colors.shoal-tint}"
    rounded: "{rounded.card}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.shoal-tint}"
    textColor: "{colors.chart-ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "5px 11px"
  chip-lock:
    backgroundColor: "{colors.chart-ink}"
    textColor: "{colors.chart-paper}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  bid-key:
    backgroundColor: "{colors.shoal-tint}"
    textColor: "{colors.chart-ink}"
    rounded: "{rounded.piece}"
    height: "62px"
  bid-key-selected:
    backgroundColor: "{colors.chart-magenta}"
    textColor: "{colors.on-magenta}"
  crew-row:
    backgroundColor: "{colors.chart-paper-surface}"
    padding: "11px 14px"
    height: "60px"
  crew-row-me:
    backgroundColor: "{colors.chart-magenta-wash}"
  results-dock:
    backgroundColor: "color-mix(in srgb, #f6f8fa 92%, transparent)"
    padding: "4px 16px 12px"
  personal-line:
    backgroundColor: "{colors.chart-paper-surface}"
    rounded: "{rounded.card}"
    padding: "16px"
  peek-on:
    backgroundColor: "{colors.chart-ink}"
    textColor: "{colors.chart-paper}"
    rounded: "{rounded.piece}"
    height: "52px"
  dealer-radio:
    textColor: "{colors.chart-ink-2}"
    rounded: "{rounded.cell}"
    padding: "0 12px"
    height: "44px"
  dealer-radio-on:
    backgroundColor: "{colors.chart-ink}"
    textColor: "{colors.chart-paper}"
  radio-dot:
    rounded: "{rounded.pill}"
    size: "16px"
  standings-tag:
    backgroundColor: "{colors.chart-paper-surface}"
    textColor: "{colors.chart-ink}"
    rounded: "{rounded.pill}"
    padding: "3px 10px 3px 4px"
  code-chip:
    backgroundColor: "{colors.chart-paper-surface}"
    textColor: "{colors.chart-ink}"
    rounded: "{rounded.pill}"
    padding: "0 11px 0 10px"
    height: "36px"
  crew-tile:
    backgroundColor: "color-mix(in srgb, var(--crew) 24%, #ffffff)"
    rounded: "{rounded.tile}"
    size: "26px"
  crew-tile-night:
    backgroundColor: "color-mix(in srgb, var(--crew) 46%, #1c1917)"
  crew-tile-small:
    rounded: "{rounded.tile-sm}"
    size: "20px"
  crew-tile-tag:
    rounded: "{rounded.pill}"
    size: "20px"
  crew-tile-row:
    rounded: "{rounded.tile-row}"
    size: "34px"
  crew-tile-parade:
    rounded: "{rounded.tile-row}"
    size: "40px"
  crew-tile-big:
    rounded: "{rounded.control}"
    size: "54px"
  crew-tile-reward:
    rounded: "{rounded.control}"
    size: "64px"
  crew-pick:
    backgroundColor: "{colors.chart-paper-surface}"
    textColor: "{colors.chart-ink}"
    rounded: "{rounded.piece}"
    padding: "12px 6px 10px"
  crew-pick-hover:
    backgroundColor: "{colors.shoal-tint}"
  crew-pick-selected:
    backgroundColor: "{colors.chart-magenta-wash}"
  crew-chip:
    backgroundColor: "{colors.chart-ink}"
    textColor: "{colors.chart-paper}"
    rounded: "{rounded.pill}"
    padding: "1px 6px"
  crew-chip-claim:
    backgroundColor: "{colors.brass-fill}"
    textColor: "#1d1404"
---

# Design System: Skull King Scorer

## Overview

**Creative North Star: "The Admiralty Chart"**

The scorer reads like a nautical chart laid on the game table. Scores are soundings: italic, tabular numerals set into a quiet field of paper and shoal tint. The leader sits in the deepest water. By day the chart is printed on cool chart-paper white with navy ink; after dark it switches with the system setting to **Tarred Wood**, a ship's deck at night: warm brown-black grounds, pale warm ink, a brighter magenta and cool slate-teal water, so the same chart holds in a dim living room, a café and daylight.

Structure comes from hairlines and tint fills, not from shadows or ornament. Every rule is one device pixel. Surfaces are white panels or shoal-blue fills (warm wood tints after dark) separated by those hairlines, and the only colour that speaks is chart magenta, which on a real chart marks what the navigator must act on. Here it means "you" and "your move". Brass appears only where someone has won: the leader's crown, a nailed bid, the final winner. The pirate world shows up in small touches (a crowned-skull mark, "shallows" and "deep water" lettered on the Standings Line, and a crew of twenty pixel-art characters as player marks), never as parchment, treasure-map gold or costume type.

The chart is loose and a little chunky rather than drafting-table tight: generous 18px card corners, pill-shaped markers with round avatars, game pieces (the primary button and bid keys) with a heavier bottom edge that collapses when pressed, and each player's crew colour washing softly into their row.

The world rejects two things, both named in the direction contract: the pirate-parchment costume (gold on navy, treasure-map texture) and the anonymous grey scorer with one accent colour. Density is calm and phone-first: one 560px column of 52px tap targets, with a 1100px table-screen mode for a tablet or TV in the middle of the table.

**Key Characteristics:**
- Chart-paper white by day and Tarred Wood brown-black after dark, following `prefers-color-scheme`.
- One-device-pixel hairlines (`--hair`: 1px, .5px at 2dppx) for every structural line.
- Italic tabular "soundings" for every score, bid, count and delta; totals unsigned, round changes signed.
- Chart magenta only for "you" and "action needed"; brass only for the leader, winners and the nailed bid.
- Hits and misses never rely on colour alone: misses carry a diagonal hatch and an × mark, and players are pixel-art crew characters with their own silhouette as well as a colour (signal flags stand in until a player picks).
- Pressable game pieces with a collapsing bottom edge, not lifted cards.
- The Standings Line, a depth-banded scale where crew markers glide between soundings, is the signature component.

## Colors

A near-monochrome chart palette, navy ink on cool paper by day and warm ink on tarred wood after dark, with two reserved signal colours, twenty crew colours for player identity and eight fallback flag colours.

### Primary
- **Chart Magenta** (`chart-magenta`; night: `night-magenta`): the colour that means "you" or "act now". It marks the primary button, the selected bid key, the edge of your action card, your Standings Line marker, stem and tag, your bid cell, the ring on your crew row, the "entering for" bar, focus rings, the text caret and selection. Its washes (`chart-magenta-wash`, or a 7-12% `color-mix` into the surface) tint your own crew row and your tag. Text placed on magenta uses `on-magenta`, which is white by day and a near-black wine colour at night, where the magenta itself is brighter.

### Secondary
- **Admiralty Brass** (`brass`, with `brass-fill` for strokes and fills; night: `night-brass`): used only for winning. It appears on the crown over the leading marker, the crown in the logo mark, the border and big score of a nailed-bid card, the podium winner's place (1.3rem) and total, the final total, the crown above the final winner's tile, and the champion's reward card in the picker (brass-fill edge and "Claim" chip).

### Tertiary
- **Made Green** (`made-green` / `night-made-green`) and **Miss Red** (`miss-red` / `night-miss-red`): status inks for hit and miss, used on chip outlines, delta soundings, the ready status line and the connection dot. Miss Red always appears together with **Miss Hatch** (`miss-hatch` / `night-miss-hatch`), a -45° stripe fill on bust chips and warning boxes.
- **Crew colours** (`crew-captain`, `crew-deckhand`, `crew-gunner`, `crew-parrot-pete`, `crew-coralia`, `crew-pearl`, `crew-kraken`, `crew-whale`, `crew-crab`, `crew-cook`, `crew-first-mate`, `crew-lookout`, `crew-lady-captain`, `crew-tigress`, `crew-escape-flag`, `crew-loot-chest`, `crew-ghost-pirate`, `crew-skeleton`, `crew-sea-witch`, `crew-skull-king`): one per character (`CREW` in `avatars.js`; First Mate's id is `quartermaster`), always paired with that character's silhouette. A crew colour paints the character's main pixels, tints its tile ground, washes 10% into the left of that player's crew row and draws its line on the end-of-game chart. It is used nowhere else.
- **Signal-flag colours** (`flag-teal`, `flag-vermilion`, `flag-green`, `flag-violet`, `flag-saffron`, `flag-blue`, `flag-umber`, `flag-slate`): the fallback mark for a player who has not picked a character yet. One per seat, by join order, always paired with that seat's flag pattern. They are used nowhere else.

### Neutral
- **Chart Paper / Tarred Wood** (`chart-paper` / `tarred-wood`): the page ground, the sticky header's frosted backing (88% mix), the results dock's backing (92% mix), the sheet panel and the dark `theme-color`.
- **Paper Surface / Wood Surface** (`chart-paper-surface` / `tarred-wood-surface`): cards, the crew board, Standings Line tags, inputs, secondary buttons and crew-picker cards. It is also the crew tile ground: a tile mixes its crew colour 24% into white by day and 46% into the wood surface at night (`--tile-mix` into `--tile-ground`), so tiles stay pastel in daylight and stop glaring after dark.
- **Shoal Tint and Deep Shoal Tint** (`shoal-tint`, `shoal-tint-deep`; night: `tarred-wood-tint`, `tarred-wood-tint-deep`): fills for quiet cards, bid keys, stepper buttons, chips, bid cells, hover states, the selected segment and the "leads tricks" badge.
- **Water** (`--water-1`, `--water-2`): the Standings Line's shallows and middle-water bands. By day they reuse Deep Shoal Tint and Shoal Tint; at night they switch to a cool slate-teal pair (`night-water-1`, `night-water-2`) laid over the tarred wood, so the depth steps still read in the dark.
- **Chart Ink, Ink 2, Ink 3** (`chart-ink`, `chart-ink-2`, `chart-ink-3`; night equivalents): primary text, secondary text and metadata, and tertiary text (tick labels, round numbers, "/ 10"). Chart Ink also serves as a solid fill for the ink button, the toast, the "In" lock chip, the peeked bid, the selected dealer, crew-picker owner chips and toggled-on states.
- **Hairline and Strong Hairline** (`hairline`, `hairline-strong`; night equivalents): ink at 13% and 26% (night: warm pale ink at 12% and 25%). The light hairline divides rows and outlines cards; the strong hairline draws the depth scale, ticks, stems, tag outlines, badges, the flag ring, control borders and the resting edge of bid keys.

### Named Rules
**The Magenta Means You Rule.** Chart magenta marks only the current player and the action they need to take. It is never decorative, never used for a heading, and never applied to another player's data.

**The Brass Is Earned Rule.** Brass appears only on crowns and winners. In light mode, brass text is used only at sounding size (1.2rem bold and larger), because it measures 4.1:1 on paper.

**The Never Colour Alone Rule.** Every colour-coded meaning has a second channel. Misses get the hatch plus an × icon; hits get a check icon; players get a crew character with its own silhouette (or a flag pattern before they pick); final-chart lines get a dash pattern per seat (`DASHES`) and end on that player's character or flag; the offline state gets a text label.

## Typography

**Display Font:** Hanken Grotesk (self-hosted variable woff2, roman and italic, weights 300-900, with system-ui fallback)
**Body Font:** Hanken Grotesk
**Label/Mono Font:** none; numerals use Hanken Grotesk italic with tabular figures

**Character:** One grotesk family does all the work. Tight, heavy display weights give the Linear-clean frame, and the italic, used with tabular figures, becomes the chart's sounding lettering. Upright type is for words; italic type is for numbers and for water lettering.

### Hierarchy
- **Display** (800, clamp(2.6rem, 12vw, 3.8rem), 1.15, -.045em): the home hero title. The final screen's winner line uses a smaller variant (800, clamp(2.2rem, 10vw, 3.2rem), -.04em).
- **Headline** (750, 1.6rem, 1.15, -.02em): screen headings; sheet headings drop to 1.35rem.
- **Title** (700, 1.05rem, 1.15, -.02em): card and section headings. View section headings are `h2` elements set in this style (`h2.t3`), so the outline is h1 → h2 while the visual size stays small. Each in-game screen also carries a visually hidden `h1` in the header naming the game and round; the home hero and final winner keep their visible `h1`. The header's "Round N" line is 750 at 1.05rem.
- **Body** (400, 16px, 1.45): instructions, hints and highlights, with secondary copy at .88-.92rem in Ink 2. The hero subtitle is capped at 28ch.
- **Label** (650-700, .75-.82rem): tags, chips, badges, segment captions, crew-picker names and the header subline. Buttons set at 700.
- **Sounding** (italic, 750-800, tabular-nums): every number that is a score, bid, trick count, delta or tick. Sizes step from the .75rem tick, through the .78rem tag value, the 1.2rem row total, 1.5rem bid keys and 1.7rem bid cells, up to 2-2.4rem for hero counts and nailed scores. Table-screen mode enlarges them to 2.1-2.6rem.
- **Game code** (750-800, tracked .14em in the header chip, .28em in the lobby and .32em in the join field): the four-letter room code, the only tracked text in the system.

### Named Rules
**The Soundings Rule.** Every score, bid, count and delta is italic with tabular numerals (`font-style: italic; font-variant-numeric: tabular-nums`). Rank numbers (`.place`) and words stay upright.

**The One Sign Per Meaning Rule.** A total is a position, so it is never signed: row totals, tags, the table footer and the final total show the bare number (`plain()`, with a true minus only when negative). Only a round's change carries a sign (`signed()`, "+" or "−"). Each mark means one thing: the brass crown marks only the score leader and the winner; the final screen uses the crownless skull (`#i-skull`), keeping the crowned skull (`#i-mark`) as the logo; the trick-lead badge reads "leads tricks" with an arrow (`#i-lead`), never a crown.

**The One Family Rule.** Hanken Grotesk only, self-hosted from `fonts/`. Don't use a second display face or a system display face.

**The 12px Floor Rule.** No text sets below .75rem (12px): badges, Standings Line ticks, water labels, bid-cell names and crew-picker captions sit exactly on the floor.

## Layout

The layout is one centred column, 560px wide (`spacing.column`) with 16px side padding (`spacing.pad`) and safe-area insets on every edge. The sticky header spans the full width but aligns its content to the same column. Rhythm comes from gaps of 6, 8, 10 and 12px inside modules, 12px between cards, and 22px above section headings. Touch targets are at least 44px; primary controls are 52px (`spacing.tap`), bid keys 62px and trick-counter buttons 84px.

The first viewport always has the same order: the slim header (code chip, "Round N / 10" with cards and dealer, scores and menu icons), then the Standings Line, then a single action card (bid pad, trick counter or result form), then the crew list as hairline-ruled rows. On the results screen the status line and the Score button leave the flow and sit in the **results dock**, a sticky bar at the bottom edge, so the commit stays in thumb reach while the list scrolls.

There is one width gate. **Table-screen mode** (`body.table`) applies only to the table-screen seat on a viewport at least 700px wide; a phone watching the table keeps the phone layout. Table mode widens the column to 1100px, deepens Standings Line lanes to 58px, lays the crew board out as a multi-column grid with hairline gutters (`gap: var(--hair)` over a hairline-coloured background), and scales names, tags, chips and soundings up for viewing across a table. Otherwise the app responds to colour scheme, pixel density (`--hair`) and reduced motion. Bottom sheets rise from the bottom edge, capped at 560px wide and 88dvh tall.

## Elevation & Depth

The system is flat. Depth is shown by the chart's own means: tint fills in two steps, hairlines, and the Standings Line's water bands, which run from tinted shallows to clear deep water. Cards, rows, tags and controls never lift. Floating layers are the only exception: the bottom sheet and the toast lift off the page with a soft, two-part shadow (`--shadow`), and the sheet sits over a 45% black scrim. The sticky header (88% page ground, `saturate(1.4) blur(14px)`, bottom hairline) and the results dock (92% page ground, `blur(10px)`, top hairline) are separated by frost and a hairline, not by a shadow.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 1px 2px rgba(14, 27, 44, .06), 0 8px 24px -12px rgba(14, 27, 44, .18)`; night: `0 1px 2px rgba(0, 0, 0, .45), 0 10px 30px -14px rgba(0, 0, 0, .75)`): bottom sheets and the toast only.
- **Press edge** (`inset 0 -3px 0`, magenta mixed 65% with black on the primary button and the selected bid key, strong hairline on resting bid keys; pressed: `inset 0 -1px 0 rgba(0, 0, 0, .25)` with `translateY(2px)`): a heavier bottom edge drawn inside the piece, following its rounded corners. It is a keycap edge, not a lift.
- **Rings** (`0 0 0 var(--hair) var(--line-strong)` on flags; `inset 0 0 0 var(--hair)` at 40% magenta on your crew row): hairlines drawn with box-shadow, not elevation.

### Named Rules
**The Hairline Rule.** Every structural line is `var(--hair)` (one device pixel), in `hairline` or `hairline-strong`, including chip, badge, warning-box and icon-button borders, the flag ring and your row's ring. Dashed hairlines mark soft boundaries: depth contours, the nudge chip, the offline note and the chart's zero line.

**The Overlays-Only Lift Rule.** A drop shadow means "this floats above the chart" (sheet, toast). In-flow surfaces never carry a drop shadow, halo or glow; the only box-shadows they carry are inset: hairline rings and the press edge of game pieces.

**The Pressable Piece Rule.** Only game pieces you tap to play (the primary button and bid keys) get the 3px press edge, and it always collapses on press. Cards, rows, chips and secondary buttons stay flat.

## Shapes

Shapes are soft, generously rounded rectangles. Cards, the crew board and the menu list use 18px corners (`rounded.card`, `--radius`). Buttons, bid keys and crew-picker cards use 14px (`rounded.piece`). Inputs, icon buttons, the toast, the warning box, stepper buttons and the QR frame use 12px (`rounded.control`). Bid cells, segment buttons and dealer buttons use 10px; crew tiles 7px by default (`rounded.tile`; 5px at 20-22px, `rounded.tile-sm`; 10px at 34-44px, `rounded.tile-row`), badges 6px, and flags 2px, which keeps them reading as cloth rectangles. Chips, toggles, the code chip, crew-picker chips and Standings Line tags are full pills (`rounded.pill`). Bottom sheets round only their top corners (`rounded.sheet`, 20px) and carry a 36×4px grab bar. Circles are used for the round avatars inside Standings Line tags, the 5px waterline dots, the 7px connection dot, the 16px dealer radio dot, the seat-number disc and the locked-bid check disc.

Crew characters are the recurring silhouette: twenty 16×16 pixel-art sprites (Captain, Deckhand, Gunner, Parrot Pete, Coralia, Pearl, Kraken, Whale, Crab, Cook, First Mate, Lookout, Lady Captain, Tigress, Escape Flag, Loot Chest, Ghost Pirate, Skeleton, Sea Witch, Skull King) rendered as crisp SVG (`shape-rendering: crispEdges`, one rect per pixel run) at 84% of a square tile. Each character differs by outline as well as colour. Signal flags remain only as the fallback before a player picks: an 18×13 rectangle drawn in one of eight patterns (solid, horizontal halves, vertical halves, cross, diagonal, centred square, three bands, quarters) in the seat's colour on white, outlined by a one-device-pixel strong-hairline ring. Icons come from a single inline SVG sprite in `index.html`, drawn as 24-unit outline icons with a 1.75 stroke and round caps and joins, at 20px (16px small, 14px in chips, 12px extra-small in badges and picker chips). The two filled exceptions are the crowned skull logo (`#i-mark`) and the crownless final-screen skull (`#i-skull`).

## Components

### Buttons
Buttons feel firm: full-width slabs that tint on hover rather than glow, with the primary one built like a game piece.
- **Shape:** generously rounded (14px), full width, at least 52px tall, weight 700, hairline-strong border.
- **Primary (magenta):** the one action this player needs to take now. There is at most one per screen. It carries the press edge.
- **Ink:** a solid chart-ink slab for table-level commits that aren't "your" action.
- **Secondary:** a paper-surface slab with a hairline border.
- **Ghost / Link:** a transparent ghost button in Ink 2, or an underlined text link with a strong-hairline underline at a 3px offset.
- **Hover / Focus / Active:** hover moves secondary to shoal tint and mixes primary 14% toward ink. Primary presses down 2px as its edge collapses; other buttons scale to .985 over .1s. Focus shows a 2px magenta outline at a 2px offset. Disabled drops to 40% opacity.
- **Icon button:** 44px square, 12px corners, transparent, shoal tint on hover.

### Chips
- **Style:** pill, .8rem weight 650, tabular, 5px 11px padding. The default is a shoal tint with Ink 2 text.
- **State:** *good* has a transparent fill, a 50% green outline and a check icon. *Bad* has the miss hatch fill, a 50% red outline and an × icon. *Lock* ("In") is solid chart ink. *Zero-safe* has a strong-hairline outline. *Nudge* is a dashed hairline button that turns magenta on hover, with its hit area extended by a pseudo-element.
- **Badge:** a small 6px-cornered hairline outline label (.75rem, 700) for "dealer" and "leads tricks". "Leads tricks" switches to a deep shoal fill and leads with the 12px arrow icon; it means only who plays first.

### Cards / Containers
- **Corner Style:** 18px.
- **Background:** paper surface, or shoal tint for quiet cards (borderless).
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** a hairline. The action card switches it to magenta, which makes it the single magenta-edged module on screen. A nailed-bid card switches it to brass fill.
- **Internal Padding:** 16px; internal sub-sections are divided by a hairline with 12px padding above.

### Inputs / Fields
- **Style:** 52px tall, 12px corners, paper surface, strong hairline border, 14px horizontal padding, placeholder in Ink 3. The join-code field is centred, uppercase, 750 weight and tracked .32em.
- **Focus:** the border turns magenta (no glow), and the caret is magenta.
- **Segmented control:** a hairline-bordered 13px tray with a 3px inset; the selected segment fills with deep shoal tint. Exposed as a radio group.
- **Stepper:** a 46px tinted ± pair with the value between them as an italic sounding.
- **Dealer choice:** one radio group across the setup name rows ("Who deals first"). Each row ends in a 44px, 10px-cornered button: unselected it shows a hollow 16px dot in strong hairline; selected it fills with chart ink and reads "Deals" after an extra-small check.

### Navigation
- **Header:** sticky and slim, frosted 88% page ground, hairline bottom. It holds the visually hidden page `h1`, the code chip (a pill with a status dot and a tracked code; offline adds a red outline and a text label), the round title, and icon buttons for the scores table and the menu.
- **Menu sheet:** a bottom sheet holding a hairline-ruled list of 52px rows with Ink 2 icons that tint on hover.

### The Standings Line (signature)
A full-width depth scale under the header. A strong-hairline waterline carries italic tick soundings, with zero set in bold ink. Behind the markers, three equal water bands run from the **shallows** (`--water-1`) through middle water (`--water-2`) to clear **deep water**. They are separated by dashed hairline contours and lettered in small italic water type. Each player is a marker: a 5px dot on the waterline (magenta for you), a hairline stem and a pill tag holding a round 20px avatar (or flag), name and unsigned total as a sounding. The leader's tag is crowned in brass. Lanes are measured from the tags' real widths, so tags never overlap.
- **Slim and full:** on phones the line is slim by default (`compact`: 32px lanes, tags show only the avatar and total). It opens to full (44px lanes, names shown) at the bid reveal, after a round is scored, on the final screen and in table mode (58px lanes); a phone falls back to slim if the full line would need more than three lanes.
- **Motion:** transform-only. Markers glide on `translateX` over .95s, tags rise between lanes on `translateY` over .6s, and stems grow on `scaleY` from the waterline. A `measuring` class freezes transitions while lanes are measured, and markers then glide from their previous soundings. After a round is scored, each tag shows that round's signed delta as a coloured italic sounding that fades over 3.4s.

### Crew List
A hairline-ruled board (18px corners) of 60px rows on a grid of crew tile (34px, 10px corners), name and sub-line, status chip, and unsigned total sounding. Each row carries a soft wash of that player's crew colour, 10% at the left edge fading out by 60% of the width. Your row replaces the wash with the flat magenta tint plus a hairline ring at 40% magenta. In table-screen mode the board becomes a multi-column grid of 88px cells with 44px tiles.

### Crew Tile
The player mark everywhere a flag used to stand: the character sprite on a square ground of its crew colour mixed into the tile ground (24% into white by day, 46% into the wood surface at night), no border or ring. It sizes to its context: 20px and round in Standings Line tags; 20px with 5px corners in the chart legend and round rows; 22px in the menu; 24px in the score-table header; 26px by default; 30px in bid cells and seat buttons; 34px with 10px corners in crew and podium rows; 40px in the personal end line and the home parade; 54px with 12px corners in the picker (64px for the champion's reward); 76px with 16px corners for the final winner. Table-screen mode raises rows to 44px, tags to 28px and bid cells to 40px. A player without a character shows their signal flag at the same spot.

### Crew Picker
Each player picks a character on joining. Twenty equal picker cards sit on an auto-fill grid (76px minimum, 8px gap): a paper-surface card with 14px corners and a strong hairline, holding a 54px tile and the name at .8rem. Hover tints to shoal; press scales to .97. Your pick takes the magenta edge and wash. A character another player holds is disabled (tile greyscale at 45% opacity, name in Ink 3) and carries a solid ink pill chip under the tile with the owner's name. **The Skull King is earned:** only the previous game's winner (`game.champion`, set by Rematch) may pick him. For the champion his card comes first, spans two columns, takes a brass-fill edge, a 64px tile and a brass "Claim" chip with a crown; for everyone else it comes last, disabled, with a "Winner" chip. The lobby also announces the champion in a brass nailed-bid card with a Claim button for them. Below the grid sits "Keep <character>" or a "Skip for now (use a flag)" link.

### Home Parade
Under the home hero, seven crew tiles (40px, 11px corners) bob 4px in a staggered wave (2.6s, ease-in-out, offset .37s each). It is decorative (`aria-hidden`), is the only ambient loop in the app, and collapses under reduced motion.

### Bid Pad, Hidden Bid and Reveal Strip
- **Bid pad:** a grid of tinted 62px keys with 14px corners, italic 1.5rem numerals and the press edge (strong hairline at rest, dark magenta when selected). The selected key fills magenta. Pressing moves the key down 2px as the edge collapses.
- **Hidden locked bid:** after you bid, your number disappears from the screen. A "Bid is in" card shows an ink check disc and a **Peek** control that turns into an inverted ink, italic "Your bid: N". A quick tap shows it for 3 seconds; holding shows it only while held; Enter or Space toggles it with the same 3-second timeout. Each reveal updates the button's label and is announced through the polite live region.
- **Reveal strip:** when bidding closes, every bid cell (tint, with your cell magenta-washed) flips up from its base (`rotateX(-88deg)`, .7s) in a 120ms stagger, and its numeral pops in 180ms later. The strip then stays as the round's reference. The direction contract specified a flip of the bids within the crew rows; the build uses this dedicated strip instead.

### Results Dock
On the results screen, a sticky bar pinned to the bottom edge, full-bleed across the column, frosted at 92% page ground with a top hairline and safe-area padding. It holds the status line (bell and Ink 2 while waiting; check and Made Green when everyone is in) and the Score button, which becomes the magenta primary only when the round is ready and you have nothing left to enter. The table screen has no dock.

### Round Scored and Final
A nailed bid turns the result card brass (brass-fill border, brass big score), and the score counts up over 900ms with a quartic ease-out; the card's mark springs in (`crownin`, .9s overshoot). A miss shows its score in miss red. On the final screen the crownless skull mark sits beside the winner's tile, which rises (1s) with its brass crown following .5s later; the podium winner's place (1.3rem) and total are set in brass, and the "voyage" chart draws each player's line in their character's colour with their seat's dash pattern, ending on their character sprite (or flag).
- **Personal end line:** directly under the winner, every player gets their own card: their 40px tile, "You won the voyage" or "You finished Nth" at 1.05rem bold, and a sub-line with their best round (signed, with its round number) and bids made out of rounds played.

- **Awards:** a card on the final screen gives every player one title (Sharpshooter, Kraken Bait, Zero Hero…), listed in final order: 34px tile, the title in bold (magenta for you), and a sub-line with the player's name and the stat that earned it. Your own title also appears in your personal end line with its icon.

### Drumroll
When the last bid lands, the reveal strip shows every cell face down (a muted "?") shivering for 1.1s (`shiver`, ±1.2° with a 40ms stagger) under a synthesised snare roll, then flips as above with the chime. Reduced motion skips the wait. A nailed bid is celebrated with a short rising fanfare and a buzz pattern; sound and vibration share one per-phone switch in the menu.

### Cheat Card ("What beats what")
A sheet opened from a cards icon in the header during bidding and play (and from the menu). A ladder in one hairline-ruled surface, strongest first: each rung has a card face (an upright 30×40 card with a double hairline frame and the card's own mark: crowned skull, red crossed swords, teal tail, grey flag; never a crew character, so card identity can't be confused with a player) or suit swatch, a bold card name and a one-line Ink 2 rule. Suits are small upright cards (black with an outline, then a fanned yellow/purple/green stack). Under it, a tinted "twist" panel shows the Skull King → Pirate → Mermaid → Skull King cycle as card faces joined by small arrows labelled "beats", and checked notes for Tigress, ties and any expansion cards in play.

### Crew Changes
A "Players" sheet (menu, or a link in the lobby) lists everyone at the table with a quiet underlined Remove (or Keep, for someone leaving after this round) and status chips ("Joins round 5", "Leaves after this round"), then an add form: name field, a "Sits after" select and the primary button. A player who joins mid-round sees a quiet card with their tile: "You join from round N". Someone who left keeps their score; the podium notes "Left after round N" under their name.

### Language and Updates
Each phone picks English, 中文 or Bahasa Melayu from pill buttons written in their own language (home screen and menu); Chinese falls back to the system CJK face. When a new version is published, a quiet strip at the top of the page offers "A new version is ready · Refresh" instead of a popup.

### Crew (shared history)
A crew page reached from a card at the top of the home screen ("Your crew", name, arrow). It opens with a small Home link and the crew code as a share chip, then the crew name at display size (clamp 2–2.8rem, 800; no eyebrow label) and a muted line ("12 games played · Season 2"). On the home screen the crew comes first: the magenta button is "New game with <crew>" (straight into setup), then the crew card, then a ghost "One-off game (not saved)".
- **Season voyage chart:** under New game, the season drawn like the game chart: games along the bottom as soundings, each member a line of wins so far (their character colour and seat dash pattern), ending on their sprite or an initial disc; end markers are pushed apart when lines finish level.
- **Folds:** Records and Past seasons sit behind hairline-topped disclosure rows (chevron turns 90° when open). The last winner gets the brass "nailed" card with the Skull King tile ("They sail as the Skull King next game"). One magenta New game button follows. The leaderboard sits under a Season / All time segmented control and uses the podium rows (place, tile, name with "N games · avg X", wins as the italic sounding, brass for first); rows are buttons that open a Player stats sheet. Records are a hairline list card, games a log of tappable rows (winner tile, "Ben won", date and player count, winning score), then past seasons with each champion in a chip. Members with no character yet get an initial on a Tint 2 tile.
- **Player stats sheet:** a 56px tile with their name and most common award title, then a two-column hairline grid of stat cells (Ink 2 label, 1.45rem italic sounding, Ink 3 sub-line), then Head to head rows with an italic "ahead–behind" score in Made Green / Miss Red.
- **Crew game setup:** members appear as tinted name chips (not inputs) with their tile; absent members sit above as pill buttons to add back; every row after the first has an up arrow to fix the seating.

### Lock In and Score
Each player locks in their own round (tricks plus any bonuses) with the magenta "Lock in my round"; "No bonuses? Just tap Lock in." sits under it. The dock's Score button stays secondary ("Score now") until every player has locked in, and scoring early asks first, naming who hasn't locked in, so nobody's bonus is lost. Rows show their score chip only once that player has locked in; until then they offer Nudge. The lobby uses the same sticky dock: "N of M phones joined" and Start round 1, and its QR shrinks to 112px once every seat is on a phone.

### Confirm Sheet
Destructive or seat-taking choices (remove a player, take over a seat, start a season, remove a game or crew) use the bottom sheet, not the browser's confirm(): the question as the title, one plain sentence of consequence, the primary button naming the action ("Remove", "Take over"), then a ghost Cancel. Cancelling returns to the sheet you came from.

### Menu
Three short groups under small headings: This round (Undo, Enter for another player), Help (What beats what, Rules), Seat & game (players, invite, character, switch, table screen, leave), then This phone (sound switch, language). The switch's on state is ink, not magenta.

### Toast
A solid ink bar with 12px corners that slides up from the bottom (.35s) with an underlined inline action. It carries the overlay shadow.

## Do's and Don'ts

### Do:
- **Do** draw every structural line with `var(--hair)` in `hairline` or `hairline-strong`, so it renders at .5px on 2dppx screens.
- **Do** set every score, bid, count, delta and tick as an italic tabular sounding; show totals unsigned and sign only round changes.
- **Do** show every player as their crew character (colour plus silhouette), falling back to their signal flag only before they pick, and give every chart line its seat's dash pattern.
- **Do** pair every miss with the -45° miss hatch and an × icon, and every hit with a check icon.
- **Do** keep a single magenta-edged action card per screen, with at most one magenta primary button.
- **Do** give the press edge only to pieces you tap to play, and make it collapse on press.
- **Do** animate only `transform` and `opacity`, on the shared `--ease` (`cubic-bezier(.16, 1, .3, 1)`), and keep the big motion for the three chosen moments: the bid reveal, a nailed bid and the round being scored (plus the final winner). The home parade's gentle bob is the one ambient exception.
- **Do** honour `prefers-reduced-motion`. The global rule collapses animation and transition durations to .01ms, and JavaScript count-ups are skipped. Pair every moment that only animates, and every peek, with a polite screen-reader announcement.
- **Do** define both light and dark (Tarred Wood) values for every new token under `prefers-color-scheme`, and check that both hold contrast.
- **Do** keep all text at .75rem (12px) or larger.
- **Do** set view section headings as `h2` in the title style, under the hidden header `h1`.
- **Do** draw new icons in the inline sprite as 24-unit outline icons with a 1.75 stroke and round caps and joins.

### Don't:
- **Don't** dress the app as pirate parchment: no gold-on-navy treasure maps, aged-paper textures or costume display faces.
- **Don't** fall back to an anonymous grey scorer with one accent colour. The chart tints, soundings, crew characters and Standings Line are the identity.
- **Don't** use chart magenta for decoration, headings or another player's data.
- **Don't** use brass for anything except crowns, winners and the nailed-bid moment.
- **Don't** use the crown for anything but the score leader and the winner; trick lead gets the arrow, the final screen gets the crownless skull.
- **Don't** let anyone but the previous game's champion pick the Skull King.
- **Don't** put drop shadows, halos or glows on in-flow surfaces. Drop shadows belong to sheets and the toast only.
- **Don't** let any score or status depend on colour alone.
- **Don't** use gradients other than the miss hatch and the crew-row wash.
- **Don't** use emoji or text glyphs as icons. Every icon comes from the SVG sprite.
- **Don't** animate layout properties (left, width, height, top) on the Standings Line. Use transforms only.
