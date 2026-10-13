# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A friend group playing the card game Skull King together. Everyone is comfortable with apps; new players join often and don't know the rules yet. Each player uses their own phone, lying on the table next to their cards, to bid, count tricks and see the scoreboard. Optionally one tablet or TV acts as a shared "table screen".

## Product Purpose

Replace pen-and-paper scoring for Skull King: hidden simultaneous bids, a live trick counter, automatic scoring (classic or Rascal, with bonuses and expansion cards), and a scoreboard every phone sees at once. Success is a game night where nobody does arithmetic, nobody argues about the score, and the app never slows the table down.

## Positioning

Live multi-phone play: each player bids on their own phone, bids reveal together like the fist shake, and every phone updates instantly. No accounts, just a 4-letter code or QR.

## Operating Context

- Played at home in the evening (warm or dim light), in cafés and bars (mixed light, noise, small tables), and in bright daytime. The interface must read well in all three.
- Phones lie flat on the table and get glanced at between tricks; actions happen in one or two taps, often one-handed.
- A round: everyone bids → reveal → tricks played physically while the winner taps "I won a trick" → bonuses entered → round scored. Ten rounds per game.
- House rule: the player after the dealer leads every trick of the round.

## Capabilities and Constraints

- Static PWA (plain HTML/CSS/JS, no build) on GitHub Pages at wunwunzero.github.io/skullking; Firebase Realtime Database with anonymous sign-in for sync; installable to the home screen; opens with weak signal.
- Scoring modes: Classic and Rascal (Grapeshot / Cannonball). Optional Kraken, White Whale, Loot.
- Features: lobby with code + QR, seat presence, nudge, rules sheet, round highlights, end-of-game chart, multi-step undo, enter-for-another-player, table screen mode.
- Crews (added 13 Oct 2026 at the users' request): one shared crew per friend group keeps every finished game, a season and all-time leaderboard, player stats, records and past seasons; the crew's last winner gets the Skull King next game. One-off games still work unsaved. Still no accounts.
- Per-phone language (English, 中文, Bahasa Melayu); players can join or leave mid-game.

## Brand Commitments

- Name: "Skull King" scorekeeper. Inspired by the game's pirate world (skulls, crowns, the sea), but its own look: no copying of the publisher's (Grandpa Beck's Games) artwork or logo.
- Voice: playful pirate flavour in small touches ("Hoisting the sails…", "The voyage"), plain and clear wherever scores and actions are concerned.

## Evidence on Hand

- App icon: icon.svg (crowned skull) and PNG sizes in the repo.
- No testimonials, users or stats exist; don't invent any.

## Product Principles

1. The table comes first: every action is a glance and a tap, never a form.
2. Scores must be unambiguous: numbers and status never depend on colour alone, and the math is always visible on request.
3. Teach as you play: new players can find the rules and understand any score without asking.
4. Fun in the moments that matter (the reveal, a nailed bid, the final winner), quiet everywhere else.

## Accessibility & Inclusion

Mixed lighting means light and dark appearances must both hold contrast. Large tap targets for phones on a table. Respect reduced motion.
