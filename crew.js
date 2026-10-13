// A crew's shared history: every finished game is saved as a snapshot shaped like a game,
// so the same scoring functions read it. Players are linked to crew members by `member` id.
// Pure functions, no DOM: shared by app.js and the tests.
import { totals, ranking, awards, playerSummary, playsIn, sortedPlayers } from './scoring.js';

// Saved games, newest first; one season or (season null) all of them.
export function crewGames(crew, season = null) {
  return Object.entries(crew?.games || {})
    .map(([code, g]) => ({ ...g, code, phase: 'done', round: g.round || 10 }))
    .filter(g => season == null || g.season === season)
    .sort((a, b) => b.at - a.at);
}

// One row per crew member in one game: place, total, bids made and the award they got.
export function gameRows(g) {
  const tot = totals(g), aw = awards(g);
  return ranking(g).map(r => {
    const p = g.players[r.id], s = playerSummary(g, r.id);
    return { pid: r.id, member: p.member, name: p.name, avatar: p.avatar, place: r.place, total: r.total,
      made: s.made, played: s.played, best: s.best, award: aw[r.id], rounds: tot[r.id].rounds };
  }).filter(x => x.member);
}

// Who won a game (shared first place counts for everyone on it).
export const winners = g => gameRows(g).filter(x => x.place === 1).map(x => x.member);

// The member who won the most recent game: they get the Skull King next time.
export function champion(crew) {
  const last = crewGames(crew)[0];
  return last ? winners(last)[0] || null : null;
}

// Ranked by wins, then win rate, then average score. Ties share a place.
export function leaderboard(crew, season = null) {
  const by = {};
  for (const g of crewGames(crew, season)) {
    for (const x of gameRows(g)) {
      const m = by[x.member] ||= { member: x.member, games: 0, wins: 0, sum: 0 };
      m.games++; m.sum += x.total;
      if (x.place === 1) m.wins++;
    }
  }
  const rows = Object.values(by)
    .map(m => ({ ...m, name: crew.members?.[m.member]?.name || '?', rate: m.wins / m.games, avg: Math.round(m.sum / m.games) }))
    .sort((a, b) => b.wins - a.wins || b.rate - a.rate || b.avg - a.avg);
  rows.forEach((r, i) => {
    const p = rows[i - 1];
    r.place = p && p.wins === r.wins && p.rate === r.rate && p.avg === r.avg ? p.place : i + 1;
  });
  return rows;
}

// Everything about one member across all games.
export function playerStats(crew, member) {
  const games = crewGames(crew);
  const s = { games: 0, wins: 0, sum: 0, made: 0, rounds: 0, zeros: 0, bestGame: null, bestRound: null,
    characters: {}, titles: {}, rivals: {} };
  for (const g of games) {
    const rows = gameRows(g), me = rows.find(x => x.member === member);
    if (!me) continue;
    s.games++; s.sum += me.total; s.made += me.made; s.rounds += me.played;
    if (me.place === 1) s.wins++;
    if (!s.bestGame || me.total > s.bestGame.total) s.bestGame = { total: me.total, code: g.code, at: g.at };
    for (const [r, sc] of Object.entries(me.rounds)) {
      if (!s.bestRound || sc > s.bestRound.score) s.bestRound = { score: sc, round: +r, code: g.code, at: g.at };
      if (g.bids?.[r]?.[me.pid] === 0 && g.results?.[r]?.[me.pid]?.tricks === 0) s.zeros++;
    }
    if (me.avatar) s.characters[me.avatar] = (s.characters[me.avatar] || 0) + 1;
    if (me.award) { const k = me.award.award; (s.titles[k] ||= { n: 0, ...me.award }).n++; }
    for (const o of rows) {
      if (o.member === member) continue;
      const v = s.rivals[o.member] ||= { member: o.member, together: 0, ahead: 0, behind: 0 };
      v.together++;
      if (me.place < o.place) v.ahead++; else if (me.place > o.place) v.behind++;
    }
  }
  const top = obj => Object.entries(obj).sort((a, b) => (b[1].n ?? b[1]) - (a[1].n ?? a[1]))[0];
  return {
    games: s.games, wins: s.wins,
    rate: s.games ? s.wins / s.games : 0,
    avg: s.games ? Math.round(s.sum / s.games) : 0,
    accuracy: s.rounds ? s.made / s.rounds : 0, made: s.made, rounds: s.rounds,
    zeros: s.zeros, bestGame: s.bestGame, bestRound: s.bestRound,
    favourite: top(s.characters)?.[0] || null,
    title: top(s.titles)?.[1] || null,
    rivals: Object.values(s.rivals).sort((a, b) => b.together - a.together),
  };
}

// Crew records, all time. Each: { member, value, code, at, round? }.
export function records(crew) {
  const games = crewGames(crew), out = {};
  const keep = (k, rec, better) => { if (!out[k] || better(rec.value, out[k].value)) out[k] = rec; };
  for (const g of games) {
    for (const x of gameRows(g)) {
      const base = { member: x.member, code: g.code, at: g.at };
      keep('highGame', { ...base, value: x.total }, (a, b) => a > b);
      keep('lowGame', { ...base, value: x.total }, (a, b) => a < b);
      for (const [r, sc] of Object.entries(x.rounds)) {
        keep('bigRound', { ...base, value: sc, round: +r }, (a, b) => a > b);
        keep('badRound', { ...base, value: sc, round: +r }, (a, b) => a < b);
      }
      // Longest run of exact bids within one game.
      let run = 0, best = 0;
      for (let r = 1; r <= g.round; r++) {
        if (!playsIn(g.players[x.pid], r)) continue;
        if (g.bids?.[r]?.[x.pid] != null && g.bids[r][x.pid] === g.results?.[r]?.[x.pid]?.tricks) best = Math.max(best, ++run); else run = 0;
      }
      if (best) keep('streak', { ...base, value: best }, (a, b) => a > b);
    }
  }
  // Most games won in a row, oldest to newest.
  let cur = null, n = 0;
  for (const g of [...games].reverse()) {
    const w = winners(g);
    if (cur && w.includes(cur)) n++; else { cur = w[0] || null; n = cur ? 1 : 0; }
    if (cur && n >= 2) keep('wins', { member: cur, value: n, code: g.code, at: g.at }, (a, b) => a > b);
  }
  return out;
}

// Finished seasons, newest first, each with its champion (top of that season's leaderboard).
export function pastSeasons(crew) {
  const cur = crew?.season?.n || 1, out = [];
  for (let n = cur - 1; n >= 1; n--) {
    const board = leaderboard(crew, n), info = crew.seasons?.[n] || {};
    out.push({ n, start: info.start, end: info.end, games: crewGames(crew, n).length, champion: board[0]?.member || null });
  }
  return out;
}

// Usual seating: members in the order they sat in the most recent game, then everyone else.
export function usualSeating(crew) {
  const last = crewGames(crew)[0], seen = new Set(), out = [];
  if (last) for (const p of sortedPlayers(last)) if (p.member && crew.members?.[p.member] && !p.left) { seen.add(p.member); out.push(p.member); }
  const rest = Object.entries(crew?.members || {}).filter(([m]) => !seen.has(m)).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0)).map(([m]) => m);
  return { recent: out, others: rest };
}
