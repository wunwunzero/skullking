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
  assert.ok(h3.some(l => l.includes('Ana nailed a zero bid (+30)')));
  assert.ok(h3.some(l => l.includes('Best round: Ben +60')));
  assert.ok(!h3.some(l => l.includes('takes the lead')), 'tie = no sole leader');
  assert.ok(roundHighlights(game, 2, name).some(l => l.includes('Cat takes the lead')));
  const done = { ...game, phase: 'done', round: 3 };
  const g = gameHighlights(done, name);
  assert.ok(g.some(l => l.includes('Biggest round: Ben +60 in round 3')));
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
  assert.match(bidHint({ bids: { 5: { a: 3, b: 3 } } }, 5), /going down/);
  assert.match(bidHint({ bids: { 5: { a: 1, b: 2 } } }, 5), /2 spare tricks/);
  assert.match(bidHint({ bids: { 5: { a: 2, b: 3 } } }, 5), /exactly 5/);
});
