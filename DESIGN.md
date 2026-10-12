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
  ecdis-night: "#07111d"
  ecdis-night-surface: "#0c1828"
  ecdis-tint: "#11223a"
  ecdis-tint-deep: "#17304e"
  night-hairline: "rgba(186, 212, 240, .12)"
  night-hairline-strong: "rgba(186, 212, 240, .24)"
  night-ink: "#e7eef7"
  night-ink-2: "#a7b7ca"
  night-ink-3: "#8597ad"
  night-magenta: "#f2569f"
  night-magenta-wash: "rgba(242, 86, 159, .12)"
  night-on-magenta: "#1a0610"
  night-brass: "#e9b74c"
  night-made-green: "#52cf8f"
  night-miss-red: "#ff737a"
  night-miss-hatch: "rgba(255, 115, 122, .16)"
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
  badge: "6px"
  tag: "8px"
  cell: "10px"
  control: "12px"
  card: "14px"
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
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "color-mix(in srgb, #c2187a 86%, #0e1b2c)"
  button-secondary:
    backgroundColor: "{colors.chart-paper-surface}"
    textColor: "{colors.chart-ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "52px"
  button-secondary-hover:
    backgroundColor: "{colors.shoal-tint}"
  button-ink:
    backgroundColor: "{colors.chart-ink}"
    textColor: "{colors.chart-paper}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "52px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.chart-ink-2}"
    rounded: "{rounded.control}"
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
    padding: "4px 10px"
  chip-lock:
    backgroundColor: "{colors.chart-ink}"
    textColor: "{colors.chart-paper}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  bid-key:
    backgroundColor: "{colors.shoal-tint}"
    textColor: "{colors.chart-ink}"
    rounded: "{rounded.control}"
    height: "58px"
  bid-key-selected:
    backgroundColor: "{colors.chart-magenta}"
    textColor: "{colors.on-magenta}"
  crew-row:
    backgroundColor: "{colors.chart-paper-surface}"
    padding: "11px 14px"
    height: "60px"
  crew-row-me:
    backgroundColor: "{colors.chart-magenta-wash}"
  standings-tag:
    backgroundColor: "{colors.chart-paper-surface}"
    textColor: "{colors.chart-ink}"
    rounded: "{rounded.tag}"
    padding: "3px 8px 3px 5px"
  code-chip:
    backgroundColor: "{colors.chart-paper-surface}"
    textColor: "{colors.chart-ink}"
    rounded: "{rounded.pill}"
    padding: "0 11px 0 10px"
    height: "36px"
---

# Design System: Skull King Scorer

## Overview

**Creative North Star: "The Admiralty Chart"**

The scorer reads like a nautical chart laid on the game table. Scores are soundings: italic, tabular numerals set into a quiet field of paper and shoal tint. The leader sits in the deepest water. By day the chart is printed on cool chart-paper white with navy ink; after dark it switches with the system setting to an ECDIS night palette of deep navy, pale ink and a brighter magenta, so the same chart holds in a dim living room, a café and daylight.

Structure comes from hairlines and tint fills, not from shadows or ornament. Every rule is one device pixel. Surfaces are white panels or shoal-blue fills separated by those hairlines, and the only colour that speaks is chart magenta, which on a real chart marks what the navigator must act on. Here it means "you" and "your move". Brass appears only where someone has won: a crown, a nailed bid, the final winner. The pirate world shows up in small touches (a crowned-skull mark, "shallows" and "deep water" lettered on the Standings Line, signal-flag player marks), never as parchment, treasure-map gold or costume type.

The world rejects two things, both named in the direction contract: the pirate-parchment costume (gold on navy, treasure-map texture) and the anonymous grey scorer with one accent colour. Density is calm and phone-first: one 560px column of 52px tap targets, with a 1100px table-screen mode for a tablet or TV in the middle of the table.

**Key Characteristics:**
- Chart-paper white by day and ECDIS night navy after dark, following `prefers-color-scheme`.
- One-device-pixel hairlines (`--hair`: 1px, .5px at 2dppx) for every structural line.
- Italic tabular "soundings" for every score, bid, count and delta.
- Chart magenta only for "you" and "action needed"; brass only for crowns and winners.
- Hits and misses never rely on colour alone: misses carry a diagonal hatch and an × mark, and players carry a signal-flag pattern as well as a colour.
- The Standings Line, a depth-banded scale where flag markers glide between soundings, is the signature component.

## Colors

A cool, near-monochrome chart palette of navy ink on paper or night water, with two reserved signal colours and eight flag colours for player identity.

### Primary
- **Chart Magenta** (`chart-magenta`; night: `night-magenta`): the colour that means "you" or "act now". It marks the primary button, the selected bid key, the edge of your action card, your Standings Line marker, stem and tag, your bid cell, the "entering for" bar, focus rings, the text caret and selection. Its washes (`chart-magenta-wash`, or a 7-12% `color-mix` into the surface) tint your own crew row and your tag. Text placed on magenta uses `on-magenta`, which is white by day and a near-black wine colour at night, where the magenta itself is brighter.

### Secondary
- **Admiralty Brass** (`brass`, with `brass-fill` for strokes; night: `night-brass`): used only for winning. It appears on the crown over the leading marker, the crown in the logo mark, the border, crown and big score of a nailed-bid card, the podium winner's place and total, the final total, and the crown above the final winner's flag.

### Tertiary
- **Made Green** (`made-green` / `night-made-green`) and **Miss Red** (`miss-red` / `night-miss-red`): status inks for hit and miss, used on chip outlines, delta soundings and the connection dot. Miss Red always appears together with **Miss Hatch** (`miss-hatch` / `night-miss-hatch`), a -45° stripe fill on bust chips and warning boxes.
- **Signal-flag colours** (`flag-teal`, `flag-vermilion`, `flag-green`, `flag-violet`, `flag-saffron`, `flag-blue`, `flag-umber`, `flag-slate`): one per seat, by join order, always paired with that seat's flag pattern. They are used nowhere else.

### Neutral
- **Chart Paper / ECDIS Night** (`chart-paper` / `ecdis-night`): the page ground, the sticky header's frosted backing (88% mix) and the sheet panel.
- **Paper Surface / Night Surface** (`chart-paper-surface` / `ecdis-night-surface`): cards, the crew board, Standings Line tags, inputs and secondary buttons.
- **Shoal Tint and Deep Shoal Tint** (`shoal-tint`, `shoal-tint-deep`; night: `ecdis-tint`, `ecdis-tint-deep`): fills for quiet cards, bid keys, stepper buttons, chips, bid cells, hover states, the selected segment and the "leads" badge. They also fill the Standings Line's depth bands, with the deep tint for the shallows and the plain tint for the middle water.
- **Chart Ink, Ink 2, Ink 3** (`chart-ink`, `chart-ink-2`, `chart-ink-3`; night equivalents): primary text, secondary text and metadata, and tertiary text (tick labels, round numbers, "/ 10"). Chart Ink also serves as a solid fill for the ink button, the toast, the "In" lock chip and toggled-on states.
- **Hairline and Strong Hairline** (`hairline`, `hairline-strong`; night equivalents): ink at 13% and 26% (night: pale blue at 12% and 24%). The light hairline divides rows and outlines cards; the strong hairline draws the depth scale, ticks, stems, tag outlines and control borders.

### Named Rules
**The Magenta Means You Rule.** Chart magenta marks only the current player and the action they need to take. It is never decorative, never used for a heading, and never applied to another player's data.

**The Brass Is Earned Rule.** Brass appears only on crowns and winners. In light mode, brass text is used only at sounding size (1.2rem bold and larger), because it measures 4.1:1 on paper.

**The Never Colour Alone Rule.** Every colour-coded meaning has a second channel. Misses get the hatch plus an × icon; hits get a check icon; players get a flag pattern; final-chart lines get a dash pattern per seat (`DASHES`) and end on that seat's flag; the offline state gets a text label.

## Typography

**Display Font:** Hanken Grotesk (self-hosted variable woff2, roman and italic, weights 300-900, with system-ui fallback)
**Body Font:** Hanken Grotesk
**Label/Mono Font:** none; numerals use Hanken Grotesk italic with tabular figures

**Character:** One grotesk family does all the work. Tight, heavy display weights give the Linear-clean frame, and the italic, used with tabular figures, becomes the chart's sounding lettering. Upright type is for words; italic type is for numbers and for water lettering.

### Hierarchy
- **Display** (800, clamp(2.6rem, 12vw, 3.8rem), 1.15, -.045em): the home hero title. The final screen's winner line uses a smaller variant (800, clamp(2.2rem, 10vw, 3.2rem), -.04em).
- **Headline** (750, 1.6rem, 1.15, -.02em): screen headings; sheet headings drop to 1.35rem.
- **Title** (700, 1.05rem, 1.15): card and section headings; the header's "Round N" line is 750 at 1.05rem.
- **Body** (400, 16px, 1.45): instructions, hints and highlights, with secondary copy at .88-.92rem in Ink 2. The hero subtitle is capped at 28ch.
- **Label** (650, .78-.82rem): tags, chips, segment captions and the header subline.
- **Sounding** (italic, 750-800, tabular-nums): every number that is a score, bid, trick count, delta or tick. Sizes step from the .7rem tick, through the .78rem tag value, the 1.2rem row total, 1.5rem bid keys and 1.7rem bid cells, up to 2-2.4rem for hero counts and nailed scores. Table-screen mode enlarges them to 2.1-2.6rem.
- **Game code** (750-800, tracked .14em in the header chip, .28em in the lobby and .32em in the join field): the four-letter room code, the only tracked text in the system.

### Named Rules
**The Soundings Rule.** Every score, bid, count and delta is italic with tabular numerals (`font-style: italic; font-variant-numeric: tabular-nums`). Rank numbers (`.place`) and words stay upright.

**The One Family Rule.** Hanken Grotesk only, self-hosted from `fonts/`. Don't use a second display face or a system display face.

## Layout

The layout is one centred column, 560px wide (`spacing.column`) with 16px side padding (`spacing.pad`) and safe-area insets on every edge. The sticky header spans the full width but aligns its content to the same column. Rhythm comes from gaps of 6, 8, 10 and 12px inside modules, 12px between cards, and 22px above section headings. Touch targets are at least 44px; primary controls are 52px (`spacing.tap`), bid keys 58px and trick-counter buttons 84px.

The first viewport always has the same order: the slim header (code chip, "Round N / 10" with cards and dealer, scores and menu icons), then the Standings Line, then a single action card (bid pad, trick counter or result form), then the crew list as hairline-ruled rows.

There are no width breakpoints. The app responds to colour scheme, pixel density (`--hair`), reduced motion and one explicit mode. **Table-screen mode** (`body.table`) widens the column to 1100px, deepens Standings Line lanes from 38px to 58px, lays the crew board out as a multi-column grid with hairline gutters (`gap: var(--hair)` over a hairline-coloured background), and scales names, tags, chips and soundings up for viewing across a table. Bottom sheets rise from the bottom edge, capped at 560px wide and 88dvh tall.

## Elevation & Depth

The system is flat. Depth is shown by the chart's own means: tint fills in two steps (shoal tint, deep shoal tint), hairlines, and the Standings Line's water bands, which run from tinted shallows to clear deep water. Cards, rows, tags and controls cast no shadows. Floating layers are the only exception: the bottom sheet and the toast lift off the page with a soft, two-part shadow (`--shadow`), and the sheet sits over a 45% night-navy scrim. The sticky header is separated by a frosted backdrop (`saturate(1.4) blur(14px)`) and a bottom hairline, not by a shadow.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 1px 2px rgba(14, 27, 44, .06), 0 8px 24px -12px rgba(14, 27, 44, .18)`; night: `0 1px 2px rgba(0, 0, 0, .4), 0 10px 30px -14px rgba(0, 0, 0, .7)`): bottom sheets and the toast only.

### Named Rules
**The Hairline Rule.** Every structural line is `var(--hair)` (one device pixel), in `hairline` or `hairline-strong`. Dashed hairlines mark soft boundaries: depth contours, the nudge chip, the offline note and the chart's zero line.

**The Overlays-Only Lift Rule.** A shadow means "this floats above the chart" (sheet, toast). In-flow surfaces never carry a shadow, halo or glow.

## Shapes

Shapes are soft-cornered rectangles that get rounder as they get smaller and more tappable. Cards, the crew board and the menu list use 14px corners (`rounded.card`). Buttons, inputs, bid keys, the toast, the warning box and the QR frame use 12px (`rounded.control`). Bid cells and segment buttons use 10px, Standings Line tags 8px, badges 6px, and flags 2px, which keeps them reading as cloth rectangles. Chips, toggles and the code chip are full pills (`rounded.pill`). Bottom sheets round only their top corners (`rounded.sheet`, 20px) and carry a 36×4px grab bar. Circles are used only for the 5px Standings Line waterline dots, the 7px connection dot and the locked-bid check disc.

Signal flags are the recurring silhouette: an 18×13 rectangle drawn in one of eight patterns (solid, horizontal halves, vertical halves, cross, diagonal, centred square, three bands, quarters) in the seat's colour on white, outlined by a 1px strong-hairline ring. Icons come from a single inline SVG sprite in `index.html`, drawn as 24-unit outline icons with a 1.75 stroke and round caps and joins, at 20px (16px small, 14px in chips).

## Components

### Buttons
Buttons feel firm and quiet: full-width slabs that tint on hover rather than glow.
- **Shape:** gently rounded (12px), full width, at least 52px tall, weight 650, hairline-strong border.
- **Primary (magenta):** the one action this player needs to take now. There is at most one per screen.
- **Ink:** a solid chart-ink slab for table-level commits that aren't "your" action (for example, scoring the round).
- **Secondary:** a paper-surface slab with a hairline border.
- **Ghost / Link:** a transparent ghost button in Ink 2, or an underlined text link with a strong-hairline underline at a 3px offset.
- **Hover / Focus / Active:** hover moves secondary to shoal tint and mixes primary 14% toward ink. Press scales to .985 over .1s. Focus shows a 2px magenta outline at a 2px offset. Disabled drops to 40% opacity.
- **Icon button:** 44px square, 12px corners, transparent, shoal tint on hover.

### Chips
- **Style:** pill, .8rem weight 650, tabular. The default is a shoal tint with Ink 2 text.
- **State:** *good* has a transparent fill, a 50% green outline and a check icon. *Bad* has the miss hatch fill, a 50% red outline and an × icon. *Lock* ("In") is solid chart ink. *Zero-safe* has a strong-hairline outline. *Nudge* is a dashed hairline button that turns magenta on hover, with its hit area extended by a pseudo-element.
- **Badge:** a small 6px-cornered outline label for "dealer" and "leads"; "leads" switches to a deep shoal fill.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** paper surface, or shoal tint for quiet cards (borderless).
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** a hairline. The action card switches it to magenta, which makes it the single magenta-edged module on screen. A nailed-bid card switches it to brass fill.
- **Internal Padding:** 16px; internal sub-sections are divided by a hairline with 12px padding above.

### Inputs / Fields
- **Style:** 52px tall, 12px corners, paper surface, strong hairline border, 14px horizontal padding, placeholder in Ink 3. The join-code field is centred, uppercase, 750 weight and tracked .32em.
- **Focus:** the border turns magenta (no glow), and the caret is magenta.
- **Segmented control:** a hairline-bordered 13px tray with a 3px inset; the selected segment fills with deep shoal tint.
- **Stepper:** a 46px tinted ± pair with the value between them as an italic sounding.

### Navigation
- **Header:** sticky and slim, frosted 88% page ground, hairline bottom. It holds the code chip (a pill with a status dot and a tracked code; offline adds a red outline and a text label), the round title, and icon buttons for the scores table and the menu.
- **Menu sheet:** a bottom sheet holding a hairline-ruled list of 52px rows with Ink 2 icons that tint on hover.

### The Standings Line (signature)
A full-width depth scale under the header. A strong-hairline waterline carries italic tick soundings, with zero set in bold ink. Behind the markers, three equal water bands run from deep-shoal-tinted **shallows** through shoal-tinted middle water to clear **deep water**. They are separated by dashed hairline contours and lettered in small italic water type. Each player is a marker: a 5px dot on the waterline (magenta for you), a hairline stem and a tag holding their flag, name (dropped in compact mode) and total as a sounding. The leader's tag is crowned in brass. Lanes are measured from the tags' real widths, so tags never overlap.
- **Motion:** transform-only. Markers glide on `translateX` over .95s, tags rise between lanes on `translateY` over .6s, and stems grow on `scaleY` from the waterline. A `measuring` class freezes transitions while lanes are measured, and markers then glide from their previous soundings. After a round is scored, each tag shows that round's delta as a coloured italic sounding that fades over 3.4s.

### Crew List
A hairline-ruled board of 60px rows on a grid of flag, name and sub-line, status chip, and total sounding. Your row carries the magenta wash. In table-screen mode the board becomes a 2-column grid of 88px cells.

### Bid Pad, Hidden Bid and Reveal Strip
- **Bid pad:** a grid of tinted 58px keys with italic 1.5rem numerals. The selected key fills magenta.
- **Hidden locked bid:** after you bid, your number disappears from the screen. A "Bid is in" card shows an ink check disc and a **hold-to-peek** button that reveals "Your bid: N" in an inverted ink, italic state only while the pointer (or Space/Enter) is held.
- **Reveal strip:** when bidding closes, every bid cell (tint, with your cell magenta-washed) flips up from its base (`rotateX(-88deg)`, .7s) in a 120ms stagger, and its numeral pops in 180ms later. The strip then stays as the round's reference. The direction contract specified a flip of the bids within the crew rows; the build uses this dedicated strip instead.

### Round Scored and Final
A nailed bid turns the result card brass. The crown springs in (`crownin`, .9s overshoot) and the score counts up over 900ms with a quartic ease-out. A miss shows its score in miss red. On the final screen the winner's flag rises (1s), its crown follows .5s later, the podium winner's place and total are set in brass, and the "voyage" chart draws each seat with its own colour and dash pattern, ending on that seat's flag.

### Toast
A solid ink bar with 12px corners that slides up from the bottom (.35s) with an underlined inline action. It carries the overlay shadow.

## Do's and Don'ts

### Do:
- **Do** draw every structural line with `var(--hair)` in `hairline` or `hairline-strong`, so it renders at .5px on 2dppx screens.
- **Do** set every score, bid, count, delta and tick as an italic tabular sounding.
- **Do** give every player mark both its seat colour and its signal-flag pattern, and give every chart line its seat's dash pattern.
- **Do** pair every miss with the -45° miss hatch and an × icon, and every hit with a check icon.
- **Do** keep a single magenta-edged action card per screen, with at most one magenta primary button.
- **Do** animate only `transform` and `opacity`, all on the shared `--ease` (`cubic-bezier(.16, 1, .3, 1)`), and keep the big motion for the three chosen moments: the bid reveal, a nailed bid and the round being scored (plus the final winner).
- **Do** honour `prefers-reduced-motion`. The global rule collapses animation and transition durations to .01ms, and JavaScript count-ups are skipped. Pair every moment that only animates with a polite screen-reader announcement.
- **Do** define both light and dark values for every new token under `prefers-color-scheme`, and check that both hold contrast.
- **Do** draw new icons in the inline sprite as 24-unit outline icons with a 1.75 stroke and round caps and joins.

### Don't:
- **Don't** dress the app as pirate parchment: no gold-on-navy treasure maps, aged-paper textures or costume display faces.
- **Don't** fall back to an anonymous grey scorer with one accent colour. The chart tints, soundings, flags and Standings Line are the identity.
- **Don't** use chart magenta for decoration, headings or another player's data.
- **Don't** use brass for anything except crowns, winners and the nailed-bid moment.
- **Don't** put shadows, halos or glows on in-flow surfaces. Shadow belongs to sheets and the toast only.
- **Don't** let any score or status depend on colour alone.
- **Don't** use gradients other than the miss hatch.
- **Don't** use emoji or text glyphs as icons. Every icon comes from the SVG sprite.
- **Don't** animate layout properties (left, width, height, top) on the Standings Line. Use transforms only.
