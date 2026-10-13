import test from 'node:test';
import assert from 'node:assert/strict';
import { roundScore, totals, ranking, autoFillTricks, dealerFor, leaderFor, liveStatus, roundHighlights, gameHighlights } from '../scoring.js';

test('bid made: 20 per trick plus bonuses', () => {
  assert.equal(roundScore(5, 3, { tricks: 3 }), 60);
  assert.equal(roundScore(5, 3, { tricks: 3, std14: 2, black14: 1 }), 60 + 20 + 20);
  assert.equal(roundScore(5, 2, { tricks: 2, mermaids: 1, pirates: 2, skullKing: 1 }), 40 + 20 + 60 + 40);
});

test('bid missed: -10 per trick off, bonuses dropped', () => {
  assert.equal(roundScore(5, 3, { tricks: 1, black14: 1 }), -20);
  assert.equal(roundScore(5, 1, { tricks: 4 }), -30);
});

test('zero bid: ±10 x round', () => {
  assert.equal(roundScore(7, 0, { tricks: 0 }), 70);
  assert.equal(roundScore(7, 0, { tricks: 0, std14: 1 }), 80);
  assert.equal(roundScore(7, 0, { tricks: 2 }), -70);
  assert.equal(roundScore(7, 0, { tricks: 1, skullKing: 1 }), -70);
});

test('missing data scores null', () => {
  assert.equal(roundScore(3, undefined, { tricks: 1 }), null);
  assert.equal(roundScore(3, 1, undefined), null);
});

const game = {
  phase: 'bidding', round: 4, firstDealer: 'b',
  players: { a: { name: 'Ana', order: 0 }, b: { name: 'Ben', order: 1 }, c: { name: 'Cat', order: 2 } },
  bids: {
    1: { a: 1, b: 0, c: 0 },
    2: { a: 1, b: 1, c: 0 },
    3: { a: 0, b: 2, c: 1 },
  },
  results: {
    1: { a: { tricks: 1 }, b: { tricks: 0 }, c: { tricks: 0 } },          // a 20, b 10, c 10
    2: { a: { tricks: 2 }, b: { tricks: 0 }, c: { tricks: 0, std14: 1 } }, // a -10, b -10, c 30
    3: { a: { tricks: 0 }, b: { tricks: 2, black14: 1 }, c: { tricks: 1 } }, // a 30, b 60, c 20
  },
};

test('sample game totals and ranking', () => {
  const t = totals(game);
  assert.equal(t.a.total, 40);
  assert.equal(t.b.total, 60);
  assert.equal(t.c.total, 60);
  assert.deepEqual(t.b.running, [10, 0, 60]);
  const r = ranking(game);
  assert.deepEqual(r.map(x => [x.id, x.place]), [['b', 1], ['c', 1], ['a', 3]]);
});

test('current unscored round is excluded until done', () => {
  const g = { ...game, round: 3, phase: 'results' };
  assert.equal(totals(g).a.total, 10);
  assert.equal(totals({ ...g, phase: 'done' }).a.total, 40);
});

test('auto-fill the last player', () => {
  const g = { ...game, results: { ...game.results, 4: { a: { tricks: 1 }, c: { tricks: 2 } } } };
  assert.deepEqual(autoFillTricks(g, 4), { id: 'b', tricks: 1 });
  assert.equal(autoFillTricks({ ...g, results: { 4: { a: { tricks: 1 } } } }, 4), null);
});

test('dealer rotates from first dealer, leader is next seat', () => {
  assert.equal(dealerFor(game, 1), 'b');
  assert.equal(dealerFor(game, 2), 'c');
  assert.equal(dealerFor(game, 3), 'a');
  assert.equal(leaderFor(game, 1), 'c');
  assert.equal(leaderFor(game, 2), 'a');
});

test('live status', () => {
  assert.equal(liveStatus(2, 1), 'need');
  assert.equal(liveStatus(2, 2), 'on');
  assert.equal(liveStatus(2, 3), 'bust');
  assert.equal(liveStatus(0, 0), 'safe0');
  assert.equal(liveStatus(0, 1), 'bust0');
});

test('highlights', () => {
  const name = id => game.players[id].name;
  const h3 = roundHighlights(game, 3, name);
  assert.ok(h3.some(l => l.text.includes('Ana nailed a zero bid (+30)')));
  assert.ok(h3.some(l => l.text.includes('Best round: Ben +60')));
  assert.ok(!h3.some(l => l.text.includes('takes the lead')), 'tie = no sole leader');
  assert.ok(roundHighlights(game, 2, name).some(l => l.text.includes('Cat takes the lead')));
  const done = { ...game, phase: 'done', round: 3 };
  const g = gameHighlights(done, name);
  assert.ok(g.some(l => l.text.includes('Biggest round: Ben +60 in round 3')));
});

import { scoreFor, bidHint, tricksInRound, bonusKeys } from '../scoring.js';

test('rascal: full, half when off by one, zero beyond', () => {
  const o = { mode: 'rascal' };
  assert.equal(roundScore(6, 2, { tricks: 2 }, o), 60);
  assert.equal(roundScore(6, 2, { tricks: 2, black14: 1 }, o), 80);
  assert.equal(roundScore(6, 2, { tricks: 3, black14: 1 }, o), 40);   // half of 60 + 20
  assert.equal(roundScore(6, 2, { tricks: 1 }, o), 30);
  assert.equal(roundScore(6, 2, { tricks: 4 }, o), 0);
  assert.equal(roundScore(6, 0, { tricks: 0 }, o), 60);                // potential is per card, not per bid
  assert.equal(roundScore(5, 0, { tricks: 1 }, o), 25);
});

test('rascal cannonball: 15 per card or nothing', () => {
  const o = { mode: 'rascal', cannon: true };
  assert.equal(roundScore(6, 2, { tricks: 2 }, o), 90);
  assert.equal(roundScore(6, 2, { tricks: 2, std14: 1 }, o), 100);
  assert.equal(roundScore(6, 2, { tricks: 3 }, o), 0);
});

test('loot bonus, only listed when the expansion is on', () => {
  assert.equal(roundScore(4, 1, { tricks: 1, loot: 2 }), 60);
  assert.equal(roundScore(4, 1, { tricks: 2, loot: 2 }), -10);
  assert.ok(!bonusKeys({}).includes('loot'));
  assert.ok(bonusKeys({ expansions: { loot: true } }).includes('loot'));
});

test('scoreFor uses game mode and cannonball calls', () => {
  const g = { scoring: 'rascal', bids: { 3: { a: 1 } }, cannon: { 3: { a: true } }, results: { 3: { a: { tricks: 1 } } } };
  assert.equal(scoreFor(g, 3, 'a'), 45);
});

test('destroyed tricks shrink the round and auto-fill', () => {
  const g = { players: { a: { name: 'A', order: 0 }, b: { name: 'B', order: 1 } }, destroyed: { 4: 1 }, results: { 4: { a: { tricks: 2 } } } };
  assert.equal(tricksInRound(g, 4), 3);
  assert.deepEqual(autoFillTricks(g, 4), { id: 'b', tricks: 1 });
});

test('bid hints', () => {
  assert.match(bidHint({ bids: { 5: { a: 3, b: 3 } } }, 5).text, /going down/);
  assert.match(bidHint({ bids: { 5: { a: 1, b: 2 } } }, 5).text, /2 spare tricks/);
  assert.match(bidHint({ bids: { 5: { a: 2, b: 3 } } }, 5).text, /exactly 5/);
});

import { playerSummary, plain } from '../scoring.js';

test('player summary and plain totals', () => {
  const done = { ...game, phase: 'done', round: 3 };
  assert.deepEqual(playerSummary(done, 'a'), { place: 3, total: 40, best: { score: 30, round: 3 }, made: 2, played: 3 });
  assert.equal(plain(60), '60');
  assert.equal(plain(-10), '−10');
  assert.equal(plain(0), '0');
});

import { playersIn, sortedPlayers, awards } from '../scoring.js';
import { t, tn, setLang, ordinal } from '../i18n.js';

// Ana, Ben, Cat from round 1; Dan joins at round 3 sitting after Ana; Ben leaves after round 3.
const roster = {
  phase: 'bidding', round: 5, firstDealer: 'a',
  players: {
    a: { name: 'Ana', order: 0 }, d: { name: 'Dan', order: 1, from: 3 },
    b: { name: 'Ben', order: 2, left: 4 }, c: { name: 'Cat', order: 3 },
    x: { name: 'Oops', order: 4, from: 2, left: 2 },
  },
  bids: { 1: { a: 1, b: 0, c: 0 }, 2: { a: 0, b: 1, c: 1 }, 3: { a: 1, b: 1, c: 0, d: 1 }, 4: { a: 1, c: 1, d: 2 } },
  results: {
    1: { a: { tricks: 1 }, b: { tricks: 0 }, c: { tricks: 0 } },
    2: { a: { tricks: 0 }, b: { tricks: 1 }, c: { tricks: 1 } },
    3: { a: { tricks: 1 }, b: { tricks: 1 }, c: { tricks: 0 }, d: { tricks: 1 } },
    4: { a: { tricks: 1 }, c: { tricks: 1 }, d: { tricks: 2 } },
  },
};

test('players joining and leaving: who plays which round', () => {
  assert.deepEqual(sortedPlayers(roster).map(p => p.id), ['a', 'd', 'b', 'c'], 'removed-before-playing is gone');
  assert.deepEqual(playersIn(roster, 2).map(p => p.id), ['a', 'b', 'c']);
  assert.deepEqual(playersIn(roster, 3).map(p => p.id), ['a', 'd', 'b', 'c']);
  assert.deepEqual(playersIn(roster, 4).map(p => p.id), ['a', 'd', 'c']);
  const tot = totals(roster);
  assert.equal(tot.d.total, 20 + 40);
  assert.equal(tot.b.total, 10 + 20 + 20, 'Ben keeps his score after leaving');
  assert.equal(tot.d.rounds[2], undefined, 'no score before joining');
  assert.deepEqual(tot.d.running, [0, 0, 20, 60]);
});

test('dealer rotation skips seats not dealt in', () => {
  // r1 Ana, r2 Ben (Dan not in yet), r3 Cat, r4 Ana, r5 Dan (Ben gone)
  assert.deepEqual([1, 2, 3, 4, 5].map(r => dealerFor(roster, r)), ['a', 'b', 'c', 'a', 'd']);
  assert.equal(leaderFor(roster, 2), 'c');
  assert.equal(leaderFor(roster, 4), 'd');
  assert.equal(leaderFor(roster, 5), 'c');
});

test('awards: one title for everyone, each one true', () => {
  const done = { ...game, phase: 'done', round: 3 };
  const a = awards(done);
  assert.deepEqual(Object.keys(a).sort(), ['a', 'b', 'c']);
  assert.equal(new Set(Object.values(a).map(x => x.award)).size, 3, 'all different here');
  const r = awards({ ...roster, phase: 'done', round: 4 });
  assert.equal(Object.keys(r).length, 4);
  assert.ok(Object.values(r).every(x => x.title && x.line));
});

test('translations fill placeholders, pick plurals and fall back to English', () => {
  assert.equal(t('Round {r}', { r: 3 }), 'Round 3');
  assert.equal(tn(1, '{n} player', '{n} players'), '1 player');
  setLang('zh');
  assert.equal(t('Round {r}', { r: 3 }), '第3轮');
  assert.equal(ordinal(2), '第2名');
  assert.equal(t('Not a key'), 'Not a key');
  setLang('ms');
  assert.equal(tn(4, '{n} player', '{n} players'), '4 pemain');
  setLang('en');
  assert.equal(ordinal(22), '22nd');
});

import { leaderboard, champion, playerStats, records, pastSeasons, usualSeating, crewGames } from '../crew.js';

// Two saved games: Ana wins game 1 (season 1), Ben wins game 2 (season 2) with Cat as a guest.
const snap = (at, season, players, bids, results) => ({ at, season, round: 2, scoring: 'classic', firstDealer: 'p0', players, bids, results });
const crew = {
  name: 'Friday Pirates', createdAt: 1, season: { n: 2, start: 150 }, seasons: { 1: { start: 1, end: 150 } },
  members: { mana: { name: 'Ana', avatar: 'captain', joinedAt: 1 }, mben: { name: 'Ben', joinedAt: 2 }, mcat: { name: 'Cat', joinedAt: 3 } },
  games: {
    AAAA: snap(100, 1, { p0: { name: 'Ana', order: 0, member: 'mana', avatar: 'captain' }, p1: { name: 'Ben', order: 1, member: 'mben' } },
      { 1: { p0: 1, p1: 0 }, 2: { p0: 1, p1: 0 } }, { 1: { p0: { tricks: 1 }, p1: { tricks: 0 } }, 2: { p0: { tricks: 1 }, p1: { tricks: 1 } } }),
    BBBB: snap(200, 2, { p0: { name: 'Ben', order: 0, member: 'mben' }, p1: { name: 'Cat', order: 1, member: 'mcat' }, p2: { name: 'Ana', order: 2, member: 'mana', avatar: 'captain' } },
      { 1: { p0: 1, p1: 0, p2: 0 }, 2: { p0: 2, p1: 0, p2: 1 } }, { 1: { p0: { tricks: 1 }, p1: { tricks: 0 }, p2: { tricks: 0 } }, 2: { p0: { tricks: 2 }, p1: { tricks: 0 }, p2: { tricks: 0 } } }),
  },
};

test('crew: games, champion and leaderboards', () => {
  assert.deepEqual(crewGames(crew).map(g => g.code), ['BBBB', 'AAAA']);
  assert.equal(champion(crew), 'mben', 'last game winner');
  const all = leaderboard(crew);
  assert.deepEqual(all.map(x => [x.member, x.wins, x.games]), [['mben', 1, 2], ['mana', 1, 2], ['mcat', 0, 1]]);
  assert.deepEqual(leaderboard(crew, 1).map(x => x.member), ['mana', 'mben']);
  assert.equal(pastSeasons(crew)[0].champion, 'mana');
});

test('crew: personal stats, head to head, records, usual seating', () => {
  const a = playerStats(crew, 'mana');
  assert.equal(a.games, 2); assert.equal(a.wins, 1);
  assert.equal(a.favourite, 'captain');
  assert.equal(a.made, 3, 'two in game 1, zero bid in round 1 of game 2'); assert.equal(a.rounds, 4);
  const vsBen = a.rivals.find(v => v.member === 'mben');
  assert.deepEqual([vsBen.together, vsBen.ahead, vsBen.behind], [2, 1, 1]);
  const rec = records(crew);
  assert.equal(rec.highGame.member, 'mben');
  assert.deepEqual(usualSeating(crew).recent, ['mben', 'mcat', 'mana']);
});
