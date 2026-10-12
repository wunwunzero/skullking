// Skull King classic scoring + bonuses. Pure functions, no DOM — shared by app.js and tests.

export const ROUNDS = 10;

// Max of each bonus card in the deck (also enforced in database.rules.json).
export const BONUS = {
  std14:     { pts: 10, max: 3, label: 'Coloured 14s',            hint: 'Yellow, purple or green 14 in your tricks' },
  black14:   { pts: 20, max: 1, label: 'Black 14',                hint: 'The Jolly Roger 14 in your tricks' },
  mermaids:  { pts: 20, max: 2, label: 'Mermaids caught',         hint: 'Mermaids taken by your Pirate' },
  pirates:   { pts: 30, max: 5, label: 'Pirates caught',          hint: 'Pirates taken by your Skull King' },
  skullKing: { pts: 40, max: 1, label: 'Skull King caught',       hint: 'Skull King taken by your Mermaid' },
  loot:      { pts: 20, max: 2, label: 'Loot alliances',          hint: 'Only if your Loot ally also made their bid', exp: 'loot' },
};
export const BONUS_KEYS = Object.keys(BONUS);
// Bonus keys in play for this game (Loot only with that expansion).
export const bonusKeys = game => BONUS_KEYS.filter(k => !BONUS[k].exp || game?.expansions?.[BONUS[k].exp]);

export function bonusPoints(res) {
  if (!res) return 0;
  return BONUS_KEYS.reduce((s, k) => s + (res[k] || 0) * BONUS[k].pts, 0);
}

// Score for one player in one round. Bonuses only count when the bid is made exactly
// (Rascal: off by one earns half of everything).
// opts: { mode: 'classic' | 'rascal', cannon: bool }
export function roundScore(round, bid, res, opts = {}) {
  if (bid == null || !res || res.tricks == null) return null;
  const tricks = res.tricks, diff = Math.abs(tricks - bid);
  if (opts.mode === 'rascal') {
    const pot = (opts.cannon ? 15 : 10) * round;
    if (diff === 0) return pot + bonusPoints(res);
    if (diff === 1 && !opts.cannon) return (pot + bonusPoints(res)) / 2;
    return 0;
  }
  if (bid === 0) return tricks === 0 ? 10 * round + bonusPoints(res) : -10 * round;
  if (diff === 0) return 20 * bid + bonusPoints(res);
  return -10 * diff;
}

// Score using the game's scoring mode and the player's Cannonball call.
export function scoreFor(game, round, pid, res = game.results?.[round]?.[pid]) {
  return roundScore(round, game.bids?.[round]?.[pid], res, {
    mode: game.scoring, cannon: !!game.cannon?.[round]?.[pid],
  });
}

// Tricks a round actually awards (Kraken / White Whale can destroy tricks).
export const tricksInRound = (game, round) => round - (game.destroyed?.[round] || 0);

// Table talk about the bid total vs tricks available.
export function bidHint(game, round) {
  const bids = Object.values(game.bids?.[round] || {});
  if (!bids.length) return null;
  const sum = bids.reduce((a, b) => a + b, 0), d = sum - round;
  if (d > 0) return { icon: 'swords', text: `Bids total ${sum} for ${round} trick${round > 1 ? 's' : ''}: someone's going down` };
  if (d < 0) return { icon: 'spare', text: `Bids total ${sum} for ${round} trick${round > 1 ? 's' : ''}: ${-d} spare trick${d < -1 ? 's' : ''} up for grabs` };
  return { icon: 'equal', text: `Bids total exactly ${round}: every trick is spoken for` };
}

export function sortedPlayers(game) {
  return Object.entries(game.players || {})
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => a.order - b.order);
}

// Dealer rotates each round from firstDealer; the player after the dealer bids/leads first.
export function dealerFor(game, round) {
  const ps = sortedPlayers(game);
  if (!ps.length) return null;
  const start = Math.max(0, ps.findIndex(p => p.id === game.firstDealer));
  return ps[(start + round - 1) % ps.length].id;
}
export function leaderFor(game, round) {
  const ps = sortedPlayers(game);
  const d = ps.findIndex(p => p.id === dealerFor(game, round));
  return ps.length ? ps[(d + 1) % ps.length].id : null;
}

// Rounds that are fully scored: every round < current, plus the current one once the game is done.
export function scoredRounds(game) {
  const last = game.phase === 'done' ? game.round : (game.round || 1) - 1;
  const out = [];
  for (let r = 1; r <= last; r++) out.push(r);
  return out;
}

// { pid: { rounds: {r: score}, total, running: [t1, t2, ...] } }
export function totals(game) {
  const ps = sortedPlayers(game);
  const out = {};
  for (const p of ps) out[p.id] = { rounds: {}, total: 0, running: [] };
  for (const r of scoredRounds(game)) {
    for (const p of ps) {
      const s = scoreFor(game, r, p.id) ?? 0;
      out[p.id].rounds[r] = s;
      out[p.id].total += s;
      out[p.id].running.push(out[p.id].total);
    }
  }
  return out;
}

// Ranking with shared places for ties: [{id, name, total, place}]
export function ranking(game) {
  const t = totals(game);
  const rows = sortedPlayers(game).map(p => ({ id: p.id, name: p.name, total: t[p.id].total }))
    .sort((a, b) => b.total - a.total);
  rows.forEach((r, i) => { r.place = i && r.total === rows[i - 1].total ? rows[i - 1].place : i + 1; });
  return rows;
}

// Tricks for the one player still missing, when everyone else has entered theirs.
export function autoFillTricks(game, round) {
  const ps = sortedPlayers(game);
  const res = game.results?.[round] || {};
  const missing = ps.filter(p => res[p.id]?.tricks == null);
  if (missing.length !== 1) return null;
  const sum = ps.reduce((s, p) => s + (res[p.id]?.tricks ?? 0), 0);
  const left = tricksInRound(game, round) - sum;
  return left >= 0 ? { id: missing[0].id, tricks: left } : null;
}

export function tricksEntered(game, round) {
  const res = game.results?.[round] || {};
  return sortedPlayers(game).reduce((s, p) => s + (res[p.id]?.tricks ?? 0), 0);
}

// Live status during play: 'on' (bid met so far), 'need' (still short), 'bust' (over), 'safe0'/'bust0' for zero bids.
export function liveStatus(bid, tricks) {
  if (bid == null) return 'none';
  if (bid === 0) return tricks > 0 ? 'bust0' : 'safe0';
  if (tricks > bid) return 'bust';
  return tricks === bid ? 'on' : 'need';
}

function leaderAfter(game, t, r) {
  let best = null;
  for (const p of sortedPlayers(game)) {
    const v = t[p.id].running[r - 1];
    if (best === null || v > best.v) best = { id: p.id, v, tie: false };
    else if (v === best.v) best.tie = true;
  }
  return best && !best.tie ? best.id : null;
}

// Short story lines for one scored round. Names resolved by the caller via `name(id)`.
export function roundHighlights(game, round, name) {
  const t = totals(game);
  const ps = sortedPlayers(game);
  const lines = [];
  const scores = ps.map(p => ({ id: p.id, s: t[p.id].rounds[round] ?? 0,
    bid: game.bids?.[round]?.[p.id], res: game.results?.[round]?.[p.id] }));

  for (const x of scores) {
    if (x.bid === 0 && x.res?.tricks === 0 && round >= 3) lines.push({ icon: 'target', text: `${name(x.id)} nailed a zero bid (+${x.s})` });
    if (x.res?.skullKing && x.s > 0) lines.push({ icon: 'crown', text: `${name(x.id)}'s Mermaid sank the Skull King (+40)` });
  }
  const top = [...scores].sort((a, b) => b.s - a.s);
  if (top[0] && top[0].s >= 40 && !(top[1] && top[1].s === top[0].s)) lines.push({ icon: 'up', text: `Best round: ${name(top[0].id)} +${top[0].s}` });
  const low = top[top.length - 1];
  if (low && low.s <= -20 && !(top[top.length - 2] && top[top.length - 2].s === low.s)) lines.push({ icon: 'down', text: `Ouch: ${name(low.id)} ${low.s}` });
  if (round > 1) {
    const before = leaderAfter(game, t, round - 1), now = leaderAfter(game, t, round);
    if (now && before !== now) lines.push({ icon: 'crown', text: `${name(now)} takes the lead` });
  }
  return lines;
}

// End-of-game awards.
export function gameHighlights(game, name) {
  const t = totals(game);
  const rounds = scoredRounds(game);
  const lines = [];
  let best = null, streak = null, accurate = null;
  for (const p of sortedPlayers(game)) {
    let made = 0, run = 0, maxRun = 0;
    for (const r of rounds) {
      const s = t[p.id].rounds[r];
      if (!best || s > best.s) best = { id: p.id, s, r };
      const hit = game.results?.[r]?.[p.id]?.tricks === game.bids?.[r]?.[p.id];
      if (hit) { made++; run++; maxRun = Math.max(maxRun, run); } else run = 0;
    }
    if (!streak || maxRun > streak.n) streak = { id: p.id, n: maxRun };
    if (!accurate || made > accurate.n) accurate = { id: p.id, n: made };
  }
  if (best && best.s > 0) lines.push({ icon: 'up', text: `Biggest round: ${name(best.id)} +${best.s} in round ${best.r}` });
  if (accurate && accurate.n > 0) lines.push({ icon: 'target', text: `Sharpest bidder: ${name(accurate.id)}, ${accurate.n}/${rounds.length} bids made` });
  if (streak && streak.n >= 3) lines.push({ icon: 'streak', text: `Longest streak: ${name(streak.id)}, ${streak.n} bids in a row` });
  return lines;
}

// One player's end-of-game story: place, best round and how many bids they hit exactly.
export function playerSummary(game, pid) {
  const t = totals(game), rounds = scoredRounds(game);
  const place = ranking(game).find(r => r.id === pid)?.place;
  let best = null, made = 0;
  for (const r of rounds) {
    const s = t[pid].rounds[r];
    if (best === null || s > best.score) best = { score: s, round: r };
    if (game.results?.[r]?.[pid]?.tricks === game.bids?.[r]?.[pid]) made++;
  }
  return { place, total: t[pid].total, best, made, played: rounds.length };
}

// Totals read as plain numbers (60, −10); only round changes carry a + sign.
export const plain = n => (n < 0 ? '−' : '') + Math.abs(n);
