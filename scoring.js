// Skull King classic scoring + bonuses. Pure functions, no DOM — shared by app.js and tests.
import { t, tn } from './i18n.js';

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
  const of = tn(round, 'Bids total {sum} for {n} trick', 'Bids total {sum} for {n} tricks', { sum });
  if (d > 0) return { icon: 'swords', text: `${of}: ${t("someone's going down")}` };
  if (d < 0) return { icon: 'spare', text: `${of}: ${tn(-d, '{n} spare trick up for grabs', '{n} spare tricks up for grabs')}` };
  return { icon: 'equal', text: t('Bids total exactly {n}: every trick is spoken for', { n: round }) };
}

// Everyone who sat at the table at some point, in seating order. Players can join mid-game
// (`from`: first round they play) or leave (`left`: first round they no longer play); someone
// removed before they played a round is left out entirely.
export function sortedPlayers(game) {
  return Object.entries(game.players || {})
    .map(([id, p]) => ({ id, ...p }))
    .filter(p => p.left == null || p.left > (p.from || 1))
    .sort((a, b) => a.order - b.order);
}
export const playsIn = (p, round) => !!p && (p.from || 1) <= round && (p.left == null || round < p.left);
// The players dealt in to one round.
export const playersIn = (game, round) => sortedPlayers(game).filter(p => playsIn(p, round));
// Rounds this player was dealt in to, among the scored ones.
export const roundsPlayed = (game, pid) => scoredRounds(game).filter(r => playsIn(game.players?.[pid], r));

// Next player dealt in to the round, going round the table from a seat (that player too if `inclusive`).
function nextSeat(game, act, id, inclusive) {
  const o = game.players?.[id]?.order ?? -1;
  return (act.find(p => (inclusive ? p.order >= o : p.order > o)) || act[0]).id;
}
// Dealer rotates each round from firstDealer, skipping anyone not dealt in; the player after the
// dealer bids/leads first.
export function dealerFor(game, round) {
  let d = null;
  for (let r = 1; r <= round; r++) {
    const act = playersIn(game, r);
    if (!act.length) return null;
    d = nextSeat(game, act, r === 1 ? game.firstDealer : d, r === 1);
  }
  return d;
}
export function leaderFor(game, round) {
  const act = playersIn(game, round), d = dealerFor(game, round);
  return act.length && d ? nextSeat(game, act, d, false) : null;
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
      if (playsIn(p, r)) {
        const s = scoreFor(game, r, p.id) ?? 0;
        out[p.id].rounds[r] = s;
        out[p.id].total += s;
      }
      out[p.id].running.push(out[p.id].total);
    }
  }
  return out;
}

// Ranking with shared places for ties: [{id, name, total, place}]
export function ranking(game) {
  const tot = totals(game);
  const rows = sortedPlayers(game).map(p => ({ id: p.id, name: p.name, total: tot[p.id].total }))
    .sort((a, b) => b.total - a.total);
  rows.forEach((r, i) => { r.place = i && r.total === rows[i - 1].total ? rows[i - 1].place : i + 1; });
  return rows;
}

// Tricks for the one player still missing, when everyone else has entered theirs.
export function autoFillTricks(game, round) {
  const ps = playersIn(game, round);
  const res = game.results?.[round] || {};
  const missing = ps.filter(p => res[p.id]?.tricks == null);
  if (missing.length !== 1) return null;
  const sum = ps.reduce((s, p) => s + (res[p.id]?.tricks ?? 0), 0);
  const left = tricksInRound(game, round) - sum;
  return left >= 0 ? { id: missing[0].id, tricks: left } : null;
}

export function tricksEntered(game, round) {
  const res = game.results?.[round] || {};
  return playersIn(game, round).reduce((s, p) => s + (res[p.id]?.tricks ?? 0), 0);
}

// Live status during play: 'on' (bid met so far), 'need' (still short), 'bust' (over), 'safe0'/'bust0' for zero bids.
export function liveStatus(bid, tricks) {
  if (bid == null) return 'none';
  if (bid === 0) return tricks > 0 ? 'bust0' : 'safe0';
  if (tricks > bid) return 'bust';
  return tricks === bid ? 'on' : 'need';
}

function leaderAfter(game, tot, r) {
  let best = null;
  for (const p of sortedPlayers(game)) {
    if ((p.from || 1) > r) continue;
    const v = tot[p.id].running[r - 1];
    if (best === null || v > best.v) best = { id: p.id, v, tie: false };
    else if (v === best.v) best.tie = true;
  }
  return best && !best.tie ? best.id : null;
}

// Short story lines for one scored round. Names resolved by the caller via `name(id)`.
export function roundHighlights(game, round, name) {
  const tot = totals(game);
  const ps = playersIn(game, round);
  const lines = [];
  const scores = ps.map(p => ({ id: p.id, s: tot[p.id].rounds[round] ?? 0,
    bid: game.bids?.[round]?.[p.id], res: game.results?.[round]?.[p.id] }));

  for (const x of scores) {
    if (x.bid === 0 && x.res?.tricks === 0 && round >= 3) lines.push({ icon: 'target', id: x.id, kind: 'zero', text: t('{name} nailed a zero bid (+{n})', { name: name(x.id), n: x.s }) });
    if (x.res?.skullKing && x.s > 0) lines.push({ icon: 'crown', text: t("{name}'s Mermaid sank the Skull King (+40)", { name: name(x.id) }) });
  }
  const top = [...scores].sort((a, b) => b.s - a.s);
  if (top[0] && top[0].s >= 40 && !(top[1] && top[1].s === top[0].s)) lines.push({ icon: 'up', text: t('Best round: {name} +{n}', { name: name(top[0].id), n: top[0].s }) });
  const low = top[top.length - 1];
  if (low && low.s <= -20 && !(top[top.length - 2] && top[top.length - 2].s === low.s)) lines.push({ icon: 'down', text: t('Ouch: {name} {n}', { name: name(low.id), n: plain(low.s) }) });
  if (round > 1) {
    const before = leaderAfter(game, tot, round - 1), now = leaderAfter(game, tot, round);
    if (now && before !== now) lines.push({ icon: 'crown', text: t('{name} takes the lead', { name: name(now) }) });
  }
  return lines;
}

// End-of-game awards.
export function gameHighlights(game, name) {
  const tot = totals(game);
  const rounds = scoredRounds(game);
  const lines = [];
  let best = null, streak = null, accurate = null;
  for (const p of sortedPlayers(game)) {
    let made = 0, run = 0, maxRun = 0;
    for (const r of rounds) {
      if (!playsIn(p, r)) continue;
      const s = tot[p.id].rounds[r];
      if (!best || s > best.s) best = { id: p.id, s, r };
      const hit = game.results?.[r]?.[p.id]?.tricks === game.bids?.[r]?.[p.id];
      if (hit) { made++; run++; maxRun = Math.max(maxRun, run); } else run = 0;
    }
    if (!streak || maxRun > streak.n) streak = { id: p.id, n: maxRun };
    if (!accurate || made > accurate.n) accurate = { id: p.id, n: made };
  }
  if (best && best.s > 0) lines.push({ icon: 'up', text: t('Biggest round: {name} +{n} in round {r}', { name: name(best.id), n: best.s, r: best.r }) });
  if (accurate && accurate.n > 0) lines.push({ icon: 'target', text: t('Sharpest bidder: {name}, {n}/{m} bids made', { name: name(accurate.id), n: accurate.n, m: rounds.length }) });
  if (streak && streak.n >= 3) lines.push({ icon: 'streak', text: t('Longest streak: {name}, {n} bids in a row', { name: name(streak.id), n: streak.n }) });
  return lines;
}

// One player's end-of-game story: place, best round and how many bids they hit exactly.
export function playerSummary(game, pid) {
  const tot = totals(game), rounds = roundsPlayed(game, pid);
  const place = ranking(game).find(r => r.id === pid)?.place;
  let best = null, made = 0;
  for (const r of rounds) {
    const s = tot[pid].rounds[r];
    if (best === null || s > best.score) best = { score: s, round: r };
    if (game.results?.[r]?.[pid]?.tricks === game.bids?.[r]?.[pid]) made++;
  }
  return { place, total: tot[pid].total, best, made, played: rounds.length };
}

// End-of-game awards: one title for every player. Each award goes to whoever is best at it
// (ties: the first still without a title); anyone left over gets a title that is true of them.
const AWARDS = [
  { id: 'sharp', icon: 'target', title: 'Sharpshooter', min: 3, stat: s => s.made, line: s => t('{n} of {m} bids made exactly', { n: s.made, m: s.played }) },
  { id: 'kraken', icon: 'kraken', title: 'Kraken Bait', min: 30, stat: s => -s.worst.score, line: s => t('{n} in round {r}', { n: plain(s.worst.score), r: s.worst.round }) },
  { id: 'zero', icon: 'spare', title: 'Zero Hero', min: 2, stat: s => s.zeros, line: s => tn(s.zeros, '{n} zero bid nailed', '{n} zero bids nailed') },
  { id: 'bounty', icon: 'loot', title: 'Bounty Hunter', min: 30, stat: s => s.bonus, line: s => t('+{n} in bonus cards', { n: s.bonus }) },
  { id: 'comeback', icon: 'up', title: 'Comeback Captain', min: 2, stat: s => s.climb, line: s => tn(s.climb, 'Climbed {n} place from the bottom', 'Climbed {n} places from the bottom') },
  { id: 'splash', icon: 'streak', title: 'Big Splash', min: 60, stat: s => s.best.score, line: s => t('+{n} in round {r}', { n: s.best.score, r: s.best.round }) },
  { id: 'siren', icon: 'crown', title: 'Siren Song', min: 1, stat: s => s.sank, line: s => tn(s.sank, 'Sank the Skull King with a Mermaid', 'Sank the Skull King {n} times') },
  { id: 'streak', icon: 'streak', title: 'Hot Streak', min: 4, stat: s => s.run, line: s => t('{n} bids in a row', { n: s.run }) },
  { id: 'roller', icon: 'swords', title: 'High Roller', min: 1, stat: s => s.bids, line: s => t('Bid {n} tricks in all', { n: s.bids }) },
  { id: 'wreck', icon: 'down', title: 'Shipwrecked', min: 5, stat: s => s.missed, line: s => t('{n} bids missed', { n: s.missed }) },
  // More titles, so a big table still gets one each.
  { id: 'early', icon: 'crown', title: 'Early Leader', min: 1, stat: s => s.ledEarly, line: () => t('Led the table after round 3') },
  { id: 'late', icon: 'up', title: 'Late Bloomer', min: 60, stat: s => s.late, line: s => t('+{n} in the last three rounds', { n: s.late }) },
  { id: 'lucky', icon: 'spare', title: 'Lucky 14s', min: 2, stat: s => s.fourteens, line: s => t('{n} fourteens captured', { n: s.fourteens }) },
  { id: 'magnet', icon: 'target', title: 'Trick Magnet', min: 1, stat: s => s.tricks, line: s => t('{n} tricks won', { n: s.tricks }) },
  { id: 'bold', icon: 'swords', title: 'Bold Call', min: 3, stat: s => s.boldest, line: s => t('Made a bid of {n}', { n: s.boldest }) },
  { id: 'unsinkable', icon: 'check', title: 'Unsinkable', min: 1, stat: s => (s.played >= 5 && s.losses === 0 ? 1 : 0), line: () => t('Not one losing round') },
  { id: 'close', icon: 'equal', title: 'Closest Call', min: 1, stat: s => s.close, line: s => t('{n} behind {name}', { n: s.gap, name: s.above }) },
  { id: 'ghost', icon: 'bell', title: 'Ghost Ship', min: 1, stat: s => (s.played >= 5 ? 1000 - s.tricks : 0), line: s => tn(s.tricks, 'Only {n} trick all game', 'Only {n} tricks all game') },
];
export function awards(game) {
  const tot = totals(game), ps = sortedPlayers(game), last = scoredRounds(game);
  const stats = {};
  for (const p of ps) {
    const rounds = roundsPlayed(game, p.id);
    const s = { made: 0, missed: 0, zeros: 0, bonus: 0, sank: 0, bids: 0, run: 0, climb: 0, played: rounds.length,
      tricks: 0, fourteens: 0, boldest: 0, losses: 0, late: 0, ledEarly: 0, close: 0, gap: 0, above: '',
      best: { score: -Infinity, round: 0 }, worst: { score: Infinity, round: 0 } };
    let run = 0;
    for (const r of rounds) {
      const bid = game.bids?.[r]?.[p.id], res = game.results?.[r]?.[p.id] || {}, sc = tot[p.id].rounds[r];
      const hit = bid != null && res.tricks === bid;
      if (hit) { s.made++; run++; s.run = Math.max(s.run, run); } else { s.missed++; run = 0; }
      if (hit && bid === 0) s.zeros++;
      if (hit) s.bonus += bonusPoints(res);
      if (hit && res.skullKing) s.sank += res.skullKing;
      s.bids += bid || 0;
      s.tricks += res.tricks || 0;
      s.fourteens += (res.std14 || 0) + (res.black14 || 0);
      if (hit) s.boldest = Math.max(s.boldest, bid);
      if (sc < 0) s.losses++;
      if (r > last.length - 3) s.late += sc;
      if (sc > s.best.score) s.best = { score: sc, round: r };
      if (sc < s.worst.score) s.worst = { score: sc, round: r };
    }
    stats[p.id] = s;
  }
  // Comeback: lowest place held after round 3 or later, against the final place.
  const final = Object.fromEntries(ranking(game).map(r => [r.id, r.place]));
  for (const r of last.filter(r => r >= 3 && r < last.length)) {
    const vals = ps.map(p => tot[p.id].running[r - 1]);
    for (const p of ps) {
      if (!playsIn(p, r)) continue;
      const place = 1 + vals.filter(v => v > tot[p.id].running[r - 1]).length;
      stats[p.id].climb = Math.max(stats[p.id].climb, place - final[p.id]);
    }
  }
  // Early leader: sole leader after round 3. Closest call: finished within 20 of the place above.
  if (last.length > 3) {
    const v3 = ps.filter(p => playsIn(p, 3)).map(p => [p.id, tot[p.id].running[2]]).sort((a, b) => b[1] - a[1]);
    if (v3.length > 1 && v3[0][1] > v3[1][1]) stats[v3[0][0]].ledEarly = 1;
  }
  const rank = ranking(game);
  rank.forEach((x, i) => {
    const gap = i ? rank[i - 1].total - x.total : Infinity;
    if (gap > 0 && gap <= 20) Object.assign(stats[x.id], { close: 100 - gap, gap, above: rank[i - 1].name });
  });
  const out = {};
  for (const a of AWARDS) {
    const eligible = ps.filter(p => stats[p.id].played && a.stat(stats[p.id]) >= a.min);
    if (!eligible.length) continue;
    const top = Math.max(...eligible.map(p => a.stat(stats[p.id])));
    const who = eligible.find(p => a.stat(stats[p.id]) === top && !out[p.id]);
    if (who) out[who.id] = { award: a.id, icon: a.icon, title: t(a.title), line: a.line(stats[who.id]) };
  }
  for (const p of ps) {
    const s = stats[p.id];
    out[p.id] ||= s.played && s.made * 2 >= s.played
      ? { award: 'steady', icon: 'check', title: t('Steady Hand'), line: t('{n} of {m} bids made exactly', { n: s.made, m: s.played }) }
      : { award: 'brave', icon: 'bell', title: t('Brave Sailor'), line: s.played ? t('Best round: {n} in round {r}', { n: plain(s.best.score), r: s.best.round }) : t('Joined for the last stretch') };
  }
  return out;
}

// Totals read as plain numbers (60, −10); only round changes carry a + sign.
export const plain = n => (n < 0 ? '−' : '') + Math.abs(n);
