import { openStore, OLD_GAME_MS } from './store.js';
import {
  ROUNDS, BONUS, bonusKeys, roundScore, scoreFor, sortedPlayers, dealerFor, leaderFor, totals, ranking,
  autoFillTricks, liveStatus, roundHighlights, gameHighlights, tricksInRound, bidHint,
} from './scoring.js';

const COLORS = ['#e9c46a', '#5ec8f2', '#ff7b7b', '#7ee08a', '#c79bff', '#ff9f43', '#f78fb3', '#9fb3c8'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O
const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';

const $app = document.getElementById('app');
const $top = document.getElementById('top');
const $sheet = document.getElementById('sheet');
const $toast = document.getElementById('toast');

const S = {
  store: null, code: null, game: undefined, unsub: null, online: true,
  seat: null,          // player id, 'watch', or null (not chosen)
  actingFor: null,     // player id when entering for someone else
  setup: null,         // { names: [], dealer: 0 } while creating
  drafts: {},          // results drafts keyed `${round}:${pid}`
  bonusOpen: {},       // `${round}:${pid}` -> bool
  sheet: null,         // { kind, ...args }
  lastPhaseKey: null, revealAnim: false,
  claimed: null,       // seat this phone has claimed in presence
  nudgeSeen: null,     // last nudge timestamp already handled
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const name = id => S.game?.players?.[id]?.name || '?';
const color = id => COLORS[(S.game?.players?.[id]?.order ?? 0) % COLORS.length];
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
const me = () => S.actingFor || (S.seat && S.seat !== 'watch' ? S.seat : null);

// ---------- seat memory (sessionStorage first so test tabs can differ) ----------
const seatKey = code => `sk.seat.${code}`;
function loadSeat(code) {
  try { return sessionStorage.getItem(seatKey(code)) || (new URLSearchParams(location.search).has('fresh') ? null : localStorage.getItem(seatKey(code))); }
  catch { return null; }
}
function saveSeat(code, seat) {
  try { sessionStorage.setItem(seatKey(code), seat); localStorage.setItem(seatKey(code), seat); } catch {}
}

// One id per phone (per tab with ?fresh, for testing) so seats can show "on another phone".
const DEVICE = (() => {
  const fresh = new URLSearchParams(location.search).has('fresh');
  const store = fresh ? sessionStorage : localStorage;
  try {
    let id = store.getItem('sk.device');
    if (!id) { id = crypto.randomUUID().slice(0, 18); store.setItem('sk.device', id); }
    return id;
  } catch { return 'dev-' + Math.random().toString(36).slice(2, 10); }
})();

// Hold this phone's seat in presence; re-claim after a reconnect clears it.
function syncPresence(g) {
  const seat = S.seat;
  if (!seat || seat === 'watch' || !g?.players?.[seat]) return;
  const holder = g.presence?.[seat];
  if (holder === DEVICE) return;
  if (holder && S.claimed === seat) {
    // Someone took this seat over on another phone.
    S.seat = null; S.claimed = null;
    try { sessionStorage.removeItem(seatKey(S.code)); localStorage.removeItem(seatKey(S.code)); } catch {}
    toast(`${name(seat)} is now playing on another phone`);
    return;
  }
  if (!holder) { S.claimed = seat; S.store.claim(S.code, seat, DEVICE).catch(() => {}); }
}

// ---------- undo history ----------
const historyKeys = g => Object.keys(g.history || {}).sort();
function lastUndo(g) {
  const keys = historyKeys(g);
  if (keys.length) return { key: keys[keys.length - 1], ...g.history[keys[keys.length - 1]] };
  return g.undo ? { legacy: true, ...g.undo } : null;
}
// Record where we were before a phase change; keep the last 40 steps.
function withHistory(g, patch, label) {
  const keys = historyKeys(g);
  let k = Date.now();
  if (keys.length && +keys[keys.length - 1] >= k) k = +keys[keys.length - 1] + 1;
  patch[`history/${k}`] = { phase: g.phase, round: g.round, label };
  keys.slice(0, Math.max(0, keys.length - 39)).forEach(old => { patch[`history/${old}`] = null; });
  return patch;
}

// ---------- toast ----------
let toastTimer;
function toast(msg, action) {
  $toast.innerHTML = `<span>${esc(msg)}</span>${action ? `<button data-act="toast-action">${esc(action.label)}</button>` : ''}`;
  $toast.onclick = e => { if (e.target.dataset.act === 'toast-action') { action.run(); $toast.classList.remove('on'); } };
  $toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('on'), action ? 6000 : 2500);
}

// ---------- sound (WebAudio chime, unlocked by first tap) ----------
let audio;
document.addEventListener('pointerdown', () => { try { audio ||= new AudioContext(); audio.resume(); } catch {} }, { once: false, passive: true });
function chime() {
  if (!audio) return;
  const t = audio.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t + i * .09);
    g.gain.linearRampToValueAtTime(.18, t + i * .09 + .02);
    g.gain.exponentialRampToValueAtTime(.001, t + i * .09 + .5);
    o.connect(g).connect(audio.destination); o.start(t + i * .09); o.stop(t + i * .09 + .55);
  });
}

// ---------- wake lock ----------
let wakeLock = null;
async function keepAwake() {
  if (!S.code || !('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch {}
}
document.addEventListener('visibilitychange', keepAwake);

// ---------- routing ----------
function route() {
  const code = (location.hash.slice(1) || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (code === S.code) return render();
  S.unsub?.(); S.unsub = null;
  S.code = code.length === 4 ? code : null;
  if (S.claimed && S.code) S.store.release(S.code, S.claimed).catch(() => {});
  S.game = undefined; S.actingFor = null; S.drafts = {}; S.lastPhaseKey = null; S.sheet = null; S.claimed = null; S.nudgeSeen = null;
  if (S.code) {
    S.seat = loadSeat(S.code);
    S.unsub = S.store.subscribe(S.code, g => onGame(g));
    keepAwake();
  }
  render();
}
window.addEventListener('hashchange', route);

function onGame(g) {
  const prev = S.game;
  S.game = g;
  if (g) {
    const key = `${g.round}:${g.phase}`;
    S.revealAnim = !!(prev && prev.phase === 'bidding' && g.phase === 'playing' && prev.round === g.round);
    if (S.revealAnim) { chime(); navigator.vibrate?.(60); }
    S.lastPhaseKey = key;
    if (S.seat && S.seat !== 'watch' && !g.players?.[S.seat]) S.seat = null;
    // Rematch started on another phone: follow it, keeping this phone's seat.
    if (g.next && g.phase === 'done') {
      if (S.seat) saveSeat(g.next, S.seat);
      location.hash = g.next;
      return;
    }
    syncPresence(g);
    checkNudge(g);
    maybeReveal(g);
  }
  render();
}

// Someone tapped "Nudge" on this phone's player.
function checkNudge(g) {
  const seat = S.seat, t = seat && seat !== 'watch' ? g.nudge?.[seat] : null;
  if (S.nudgeSeen === null) { S.nudgeSeen = t || 0; return; }
  if (t && t > S.nudgeSeen) {
    S.nudgeSeen = t;
    if (Date.now() - t < 120000) {
      navigator.vibrate?.([120, 60, 120]); chime();
      toast(g.phase === 'results' ? '⏰ The crew is waiting for your tricks!' : '⏰ The crew is waiting for your bid!');
    }
  }
}

// Any phone flips bidding → playing once every bid is in (idempotent).
function maybeReveal(g) {
  if (g.phase !== 'bidding') return;
  const bids = g.bids?.[g.round] || {};
  if (sortedPlayers(g).every(p => bids[p.id] != null)) update({ phase: 'playing' });
}

function update(patch) {
  return S.store.update(S.code, patch).catch(err => { console.error(err); toast('Could not save — check connection'); });
}

// ---------- render ----------
function render() {
  document.body.classList.toggle('table', S.seat === 'watch' && !!S.code);
  renderTop();
  if (!S.code) { $app.innerHTML = S.setup ? setupView() : homeView(); }
  else if (S.game === undefined) { $app.innerHTML = '<p class="loading">Finding the ship…</p>'; }
  else if (S.game === null) {
    $app.innerHTML = `<div class="card"><h2>No game “${esc(S.code)}”</h2><p class="muted">Check the code with whoever started the game.</p>
      <button class="btn primary" data-act="home">Back</button></div>`;
  }
  else if (!S.seat) { $app.innerHTML = seatView(); }
  else {
    const g = S.game;
    $app.innerHTML = (S.actingFor ? actingBanner() : '') + ({
      lobby: lobbyView, bidding: biddingView, playing: playingView, results: resultsView, done: doneView,
    }[g.phase] || lobbyView)(g);
    if (g.phase === 'lobby') drawQR();
  }
  renderSheet();
}

function renderTop() {
  const g = S.game;
  if (!S.code || !g || !S.seat) { $top.hidden = true; return; }
  $top.hidden = false;
  const r = g.round;
  const sub = g.phase === 'lobby' ? 'Waiting to start' : g.phase === 'done' ? 'Game over'
    : `${r} card${r > 1 ? 's' : ''} · ${esc(name(dealerFor(g, r)))} deals`;
  $top.innerHTML = `
    <span class="dot ${S.online ? '' : 'off'}" title="${S.online ? 'Connected' : 'Offline — changes will sync'}"></span>
    <button class="icon-btn code" data-act="share" aria-label="Share game code">${esc(S.code)}</button>
    <div class="round">${g.phase === 'lobby' || g.phase === 'done' ? `<b>${g.phase === 'done' ? 'Final scores' : 'Skull King'}</b>` : `<b>Round ${r} of ${ROUNDS}</b>`}<span>${sub}</span></div>
    <button class="icon-btn" data-act="scores">Scores</button>
    <button class="icon-btn" data-act="menu" aria-label="Menu">⋯</button>`;
}

// ---------- home & setup ----------
function homeView() {
  return `
  <section class="hero"><div class="skull" aria-hidden="true">☠️</div><h1>Skull King</h1><p>Live scorekeeper for the whole table</p></section>
  <button class="btn primary" data-act="new">Start a new game</button>
  <div class="card">
    <h3>Join a game</h3>
    <form class="join" data-form="join"><input name="code" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="CODE" aria-label="Game code" required>
    <button class="btn primary" style="width:auto">Join</button></form>
  </div>
  <button class="btn ghost" data-act="rules">How scoring works</button>
  ${S.store.live ? '' : `<p class="note">Local mode: games sync between tabs on this device only. Add the Firebase config to play across phones.</p>`}`;
}

function setupView() {
  const { names, dealer } = S.setup;
  return `
  <h2>Who's playing?</h2>
  <p class="muted small">Seating order around the table. Tap “Deals” on whoever deals round 1.</p>
  <form data-form="setup">
    ${names.map((n, i) => `
      <div class="name-row">
        <span class="num">${i + 1}</span>
        <input type="text" name="n${i}" value="${esc(n)}" maxlength="24" placeholder="Player ${i + 1}" autocomplete="off" data-idx="${i}">
        <button type="button" class="deal ${dealer === i ? 'on' : ''}" data-act="set-dealer" data-i="${i}">Deals</button>
        ${names.length > 2 ? `<button type="button" class="x" data-act="rm-name" data-i="${i}" aria-label="Remove player ${i + 1}">×</button>` : ''}
      </div>`).join('')}
    ${names.length < 8 ? `<button type="button" class="btn ghost" data-act="add-name">+ Add player</button>` : ''}
    <h3 style="margin-top:20px">House rules</h3>
    <div class="seg" role="radiogroup" aria-label="Scoring">
      <button type="button" role="radio" aria-checked="${S.setup.scoring === 'classic'}" class="${S.setup.scoring === 'classic' ? 'on' : ''}" data-act="set-scoring" data-v="classic"><b>Classic</b><span>±20 per trick</span></button>
      <button type="button" role="radio" aria-checked="${S.setup.scoring === 'rascal'}" class="${S.setup.scoring === 'rascal' ? 'on' : ''}" data-act="set-scoring" data-v="rascal"><b>Rascal</b><span>10/card, half if off by 1</span></button>
    </div>
    <p class="muted small" style="margin:12px 0 6px">Expansion cards in the deck</p>
    <div class="toggles">
      ${[['kraken', '🐙 Kraken'], ['whale', '🐋 White Whale'], ['loot', '💰 Loot']].map(([k, l]) =>
        `<button type="button" aria-pressed="${!!S.setup.exp[k]}" class="${S.setup.exp[k] ? 'on' : ''}" data-act="toggle-exp" data-k="${k}">${l}</button>`).join('')}
    </div>
    <button class="btn primary" style="margin-top:20px">Create game</button>
    <button type="button" class="btn ghost" data-act="cancel-setup">Cancel</button>
  </form>`;
}

async function createGame(names, dealer, opts = {}) {
  let code;
  for (let i = 0; i < 8; i++) {
    code = Array.from(crypto.getRandomValues(new Uint32Array(4)), x => CODE_CHARS[x % CODE_CHARS.length]).join('');
    if (!(await S.store.exists(code))) break;
  }
  const players = {};
  names.forEach((n, i) => { players['p' + i] = { name: n, order: i }; });
  const game = { createdAt: Date.now(), phase: 'lobby', round: 1, firstDealer: 'p' + dealer, players, scoring: opts.scoring || 'classic' };
  const exp = Object.fromEntries(Object.entries(opts.exp || {}).filter(([, v]) => v));
  if (Object.keys(exp).length) game.expansions = exp;
  await S.store.create(code, game);
  rememberCreated(code, game.createdAt);
  S.setup = null;
  location.hash = code;
}

// ---------- seat ----------
function seatView() {
  const ps = sortedPlayers(S.game);
  return `
  <h2 style="margin-top:16px">Who are you?</h2>
  <p class="muted small">Game ${esc(S.code)}. Pick your name to bid from this phone.</p>
  <div class="seat-list">
    ${ps.map(p => {
      const taken = S.game.presence?.[p.id] && S.game.presence[p.id] !== DEVICE;
      return `<button class="btn ${taken ? 'taken' : ''}" data-act="seat" data-id="${p.id}"><span class="dot" style="background:${color(p.id)}"></span>${esc(p.name)}${taken ? '<span class="chip">📱 on another phone</span>' : ''}</button>`;
    }).join('')}
    <button class="btn ghost" data-act="seat" data-id="watch">Table screen (big scoreboard, no seat)</button>
  </div>`;
}

function roleBadges(g, r, pid) {
  // House rule: the player after the dealer leads every trick of the round.
  return (dealerFor(g, r) === pid ? '<span class="badge">dealer</span>' : '')
    + (leaderFor(g, r) === pid ? '<span class="badge lead">leads</span>' : '');
}

function rulesLine(g) {
  const exp = Object.keys(g.expansions || {}).map(k => ({ kraken: 'Kraken', whale: 'White Whale', loot: 'Loot' }[k]));
  return `${g.scoring === 'rascal' ? 'Rascal scoring' : 'Classic scoring'}${exp.length ? ' · ' + exp.join(', ') : ''}`;
}

function actingBanner() {
  return `<div class="acting"><span>Entering for ${esc(name(S.actingFor))}</span><button data-act="stop-acting">Done</button></div>`;
}

// ---------- lobby ----------
function shareURL() { return `${location.origin}${location.pathname}#${S.code}`; }
function lobbyView(g) {
  const ps = sortedPlayers(g);
  return `
  <div class="card share">
    <p class="muted small" style="margin:0">Everyone scan or open the link, then pick their name</p>
    <div class="big-code">${esc(S.code)}</div>
    <div class="qr" id="qr" aria-label="QR code for the game link"></div>
    <div class="row-btns"><button class="btn" data-act="copy-link">Copy link</button>${navigator.share ? `<button class="btn" data-act="native-share">Share…</button>` : ''}</div>
  </div>
  <div class="board">
    ${ps.map(p => `<div class="prow ${p.id === S.seat ? 'me' : ''}"><span class="swatch" style="background:${color(p.id)}"></span>
      <div class="who"><b>${esc(p.name)}${p.id === g.firstDealer ? '<span class="badge">deals first</span>' : ''}</b></div><span></span><span></span></div>`).join('')}
  </div>
  <p class="muted small" style="text-align:center">${esc(rulesLine(g))} · <button class="link" data-act="rules" style="min-height:0;padding:0">rules</button></p>
  <button class="btn primary" style="margin-top:8px" data-act="start">Start round 1</button>`;
}

let qrLoading;
function drawQR() {
  const el = document.getElementById('qr');
  if (!el) return;
  const paint = () => {
    try { const q = window.qrcode(0, 'M'); q.addData(shareURL()); q.make(); el.innerHTML = q.createImgTag(5, 0); }
    catch { el.hidden = true; }
  };
  if (window.qrcode) return paint();
  qrLoading ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = QR_LIB; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  qrLoading.then(() => { if (document.getElementById('qr')) { drawQR(); } }).catch(() => { el.hidden = true; });
}

// ---------- bidding ----------
function lastRoundBanner(g) {
  const r = g.round - 1;
  if (r < 1 || g.phase !== 'bidding' || (g.bids?.[g.round] && Object.keys(g.bids[g.round]).length)) return undoCard(g);
  const lines = roundHighlights(g, r, name);
  const t = totals(g);
  const rows = sortedPlayers(g).map(p => `${esc(p.name)} <b class="${t[p.id].rounds[r] >= 0 ? 'good-t' : 'bad-t'}">${signed(t[p.id].rounds[r])}</b>`).join(' · ');
  return `<div class="card gold"><h3>Round ${r} scored</h3><p class="small" style="margin:0 0 8px">${rows}</p>
    ${lines.length ? `<ul class="hl">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    ${undoCard(g)}</div>`;
}
function undoCard(g) {
  const u = lastUndo(g);
  return u ? `<button class="link" data-act="undo">${esc(u.label)}</button>` : '';
}

function biddingView(g) {
  const r = g.round, bids = g.bids?.[r] || {}, mine = me();
  const ps = sortedPlayers(g);
  const t = totals(g);
  const waiting = ps.filter(p => bids[p.id] == null).length;
  const cannon = !!g.cannon?.[r]?.[mine];
  return `
  ${lastRoundBanner(g)}
  ${mine ? `<div class="card ${bids[mine] == null ? 'gold' : ''}">
    <h3>${S.actingFor ? esc(name(mine)) + "'s" : 'Your'} bid · ${r} card${r > 1 ? 's' : ''}</h3>
    <p class="muted small" style="margin:0">${bids[mine] == null ? 'Shake your fist, then tap your bid. It stays hidden until everyone has bid.' : `Locked in: <b>${bids[mine]}</b>${g.scoring === 'rascal' ? (cannon ? ' 💣 Cannonball' : ' · Grapeshot') : ''}. You can change it until the last bid is in.`}</p>
    <div class="bid-grid">${Array.from({ length: r + 1 }, (_, n) => `<button data-act="bid" data-n="${n}" class="${bids[mine] === n ? 'on' : ''}">${n}</button>`).join('')}</div>
    ${g.scoring === 'rascal' ? `<div class="seg" style="margin-top:10px" role="radiogroup" aria-label="Rascal wager">
      <button type="button" role="radio" aria-checked="${!cannon}" class="${!cannon ? 'on' : ''}" data-act="cannon" data-v="0"><b>Grapeshot</b><span>${10 * r} pts · half if off by 1</span></button>
      <button type="button" role="radio" aria-checked="${cannon}" class="${cannon ? 'on' : ''}" data-act="cannon" data-v="1"><b>💣 Cannonball</b><span>${15 * r} pts · all or nothing</span></button>
    </div>` : ''}
  </div>` : ''}
  <h3 style="margin-top:20px">${waiting ? `Waiting for ${waiting}…` : 'Revealing…'}</h3>
  <div class="board">
    ${ps.map(p => `<div class="prow ${p.id === mine ? 'me' : ''}"><span class="swatch" style="background:${color(p.id)}"></span>
      <div class="who"><b>${esc(p.name)}${roleBadges(g, r, p.id)}</b><span>${signed(t[p.id].total)} pts</span></div>
      ${bids[p.id] != null ? '<span class="chip good">✓ locked</span>' : nudgeChip(p.id, mine)}
      <span></span></div>`).join('')}
  </div>`;
}

// "thinking…" chip that buzzes that player's phone when tapped.
function nudgeChip(pid, mine) {
  if (pid === mine || S.seat === pid) return '<span class="chip">thinking…</span>';
  return `<button class="chip nudge" data-act="nudge" data-id="${pid}" aria-label="Nudge ${esc(name(pid))}">thinking… 🔔</button>`;
}

// ---------- playing ----------
function boardRows(g, r, { showLive }) {
  const bids = g.bids?.[r] || {}, live = g.live?.[r] || {}, t = totals(g), mine = me();
  return sortedPlayers(g).map(p => {
    const bid = bids[p.id], got = live[p.id] || 0, st = liveStatus(bid, got);
    const chip = !showLive ? '' : {
      need: `<span class="chip">${got}/${bid}</span>`, on: `<span class="chip good">${got}/${bid} ✓</span>`,
      bust: `<span class="chip bad">${got}/${bid} ✗</span>`, safe0: `<span class="chip gold">0 bid · safe</span>`,
      bust0: `<span class="chip bad">0 bid · ${got} ✗</span>`, none: '',
    }[st];
    return `<div class="prow ${p.id === mine ? 'me' : ''} ${S.revealAnim ? 'reveal' : ''}"><span class="swatch" style="background:${color(p.id)}"></span>
      <div class="who"><b>${esc(p.name)}${roleBadges(g, r, p.id)}</b><span>bid <b>${bid ?? '–'}</b>${g.cannon?.[r]?.[p.id] ? ' 💣' : ''}</span></div>
      ${chip}<span class="total">${signed(t[p.id].total)}</span></div>`;
  }).join('');
}

function playingView(g) {
  const r = g.round, live = g.live?.[r] || {}, mine = me();
  const destroyed = g.destroyed?.[r] || 0;
  const played = Object.values(live).reduce((a, b) => a + b, 0) + destroyed;
  const done = played >= r;
  const canDestroy = g.expansions?.kraken || g.expansions?.whale;
  const hint = bidHint(g, r);
  return `
  <div class="card">
    <div class="progress"><span class="muted">Tricks played</span><b>${played} / ${r}</b></div>
    ${hint ? `<p class="small hint">${esc(hint)}</p>` : ''}
    ${mine ? `<div class="counter">
      <button class="btn minus" data-act="live" data-d="-1" ${(live[mine] || 0) <= 0 ? 'disabled' : ''} aria-label="Remove a trick">−1</button>
      <button class="btn primary plus" data-act="live" data-d="1" ${done ? 'disabled' : ''}>${S.actingFor ? esc(name(mine)) : 'I'} won a trick</button>
    </div>` : ''}
    ${canDestroy ? `<div class="destroy"><span class="small muted">🐙 Tricks destroyed: <b>${destroyed}</b></span>
      <span><button class="icon-btn" data-act="destroy" data-d="-1" ${destroyed <= 0 ? 'disabled' : ''} aria-label="One fewer destroyed trick">−</button>
      <button class="icon-btn" data-act="destroy" data-d="1" ${done || destroyed >= 2 ? 'disabled' : ''}>+ Destroyed</button></span></div>` : ''}
  </div>
  <div class="board">${boardRows(g, r, { showLive: true })}</div>
  <button class="btn ${done ? 'primary' : ''}" style="margin-top:16px" data-act="to-results">${done ? 'Round over — check results' : 'Round over'}</button>
  <button class="link" data-act="fix-bids">Fix a bid</button>`;
}

// ---------- results ----------
function draftFor(g, r, pid) {
  const key = `${r}:${pid}`;
  if (S.drafts[key]) return S.drafts[key];
  const saved = g.results?.[r]?.[pid];
  if (saved) return { ...saved };
  const auto = autoFillTricks(withLiveAsResults(g, r, pid), r);
  const tricks = g.live?.[r]?.[pid] ?? (auto?.id === pid ? auto.tricks : 0);
  return { tricks };
}

// Treat other players' live counts as their tricks, so the last player can be auto-filled.
function withLiveAsResults(g, r, except) {
  const res = { ...(g.results?.[r] || {}) };
  for (const p of sortedPlayers(g)) if (p.id !== except && res[p.id] == null && g.live?.[r]?.[p.id] != null) res[p.id] = { tricks: g.live[r][p.id] };
  return { ...g, results: { ...g.results, [r]: res } };
}

// Final per-player results used when scoring: confirmed entry, else live count, else auto-fill.
function effectiveResults(g, r) {
  const out = {}, ps = sortedPlayers(g);
  for (const p of ps) {
    if (g.results?.[r]?.[p.id]) out[p.id] = { ...g.results[r][p.id], src: 'confirmed' };
    else if (g.live?.[r]?.[p.id] != null) out[p.id] = { tricks: g.live[r][p.id], src: 'live' };
  }
  // Every trick counted live: whoever never tapped won 0.
  const n = tricksInRound(g, r);
  const liveSum = ps.reduce((s, p) => s + (g.live?.[r]?.[p.id] || 0), 0);
  if (liveSum === n) for (const p of ps) out[p.id] ||= { tricks: 0, src: 'live' };
  const missing = ps.filter(p => !out[p.id]);
  if (missing.length === 1) {
    const sum = Object.values(out).reduce((s, x) => s + x.tricks, 0);
    if (n - sum >= 0) out[missing[0].id] = { tricks: n - sum, src: 'auto' };
  }
  return out;
}

function stepper(act, key, label, hint, val, max) {
  const plain = esc(label.replace(/<[^>]+>/g, '').trim());
  return `<div class="stepper"><div class="lbl"><b>${label}</b>${hint ? `<span>${hint}</span>` : ''}</div>
    <div class="ctl"><button type="button" data-act="${act}" data-k="${key}" data-d="-1" ${val <= 0 ? 'disabled' : ''} aria-label="Less ${plain}">−</button>
    <output>${val}</output><button type="button" data-act="${act}" data-k="${key}" data-d="1" ${val >= max ? 'disabled' : ''} aria-label="More ${plain}">+</button></div></div>`;
}

function resultForm(g, r, pid) {
  const d = draftFor(g, r, pid), bid = g.bids?.[r]?.[pid], keys = bonusKeys(g);
  const key = `${r}:${pid}`, open = S.bonusOpen[key] ?? keys.some(k => d[k]);
  const score = scoreFor(g, r, pid, d);
  const confirmed = !!g.results?.[r]?.[pid] && !S.drafts[key];
  const made = bid === d.tricks;
  return `
    ${stepper('draft', 'tricks', 'Tricks won', `Bid ${bid ?? '–'}`, d.tricks ?? 0, tricksInRound(g, r))}
    ${open ? keys.map(k => stepper('draft', k, `${BONUS[k].label} <span class="muted small">+${BONUS[k].pts}</span>`, BONUS[k].hint, d[k] || 0, BONUS[k].max)).join('')
      : `<button class="link" data-act="open-bonus">Add bonus cards (14s, captures${g.expansions?.loot ? ', loot' : ''})</button>`}
    ${open && !made ? `<p class="small muted" style="margin:4px 0 0">${g.scoring === 'rascal' && !g.cannon?.[r]?.[pid] && Math.abs((d.tricks ?? 0) - bid) === 1 ? 'Off by one: half of everything, bonuses included.' : 'Bonuses only count when the bid is made.'}</p>` : ''}
    <div class="preview"><span class="muted">This round</span><b class="${score >= 0 ? 'good-t' : 'bad-t'}">${score == null ? '–' : signed(score)}</b></div>
    <button class="btn ${confirmed ? '' : 'primary'}" style="margin-top:12px" data-act="confirm" ${confirmed ? 'disabled' : ''}>${confirmed ? 'Confirmed ✓' : 'Confirm'}</button>`;
}

function resultsView(g) {
  const r = g.round, mine = me(), eff = effectiveResults(g, r), ps = sortedPlayers(g);
  const n = tricksInRound(g, r), destroyed = g.destroyed?.[r] || 0;
  const allIn = ps.every(p => eff[p.id]);
  const sum = ps.reduce((s, p) => s + (eff[p.id]?.tricks || 0), 0);
  const t = totals(g);
  return `
  ${mine ? `<div class="card gold"><h3>${S.actingFor ? esc(name(mine)) + "'s" : 'Your'} round ${r}</h3>${resultForm(g, r, mine)}</div>` : ''}
  <h3 style="margin-top:20px">Round ${r} results</h3>
  <div class="board">
    ${ps.map(p => {
      const e = eff[p.id], bid = g.bids?.[r]?.[p.id], s = e ? scoreFor(g, r, p.id, e) : null;
      const src = !e ? 'not entered' : e.src === 'confirmed' ? 'confirmed ✓' : e.src === 'live' ? 'from live count' : 'auto-filled';
      return `<div class="prow ${p.id === mine ? 'me' : ''}"><span class="swatch" style="background:${color(p.id)}"></span>
        <div class="who"><b>${esc(p.name)}</b><span>bid ${bid ?? '–'}${g.cannon?.[r]?.[p.id] ? ' 💣' : ''} · won ${e ? e.tricks : '–'} · ${src}</span></div>
        ${e ? `<span class="chip ${s >= 0 ? 'good' : 'bad'}">${signed(s)}</span>` : nudgeChip(p.id, mine).replace('thinking…', 'waiting')}
        <span class="total">${signed(t[p.id].total + (s || 0))}</span></div>`;
    }).join('')}
  </div>
  ${g.expansions?.kraken || g.expansions?.whale ? `<div class="destroy card" style="margin-top:12px"><span class="small">🐙 Tricks destroyed by Kraken / White Whale: <b>${destroyed}</b></span>
    <span><button class="icon-btn" data-act="destroy" data-d="-1" ${destroyed <= 0 ? 'disabled' : ''} aria-label="One fewer">−</button>
    <button class="icon-btn" data-act="destroy" data-d="1" ${destroyed >= 2 ? 'disabled' : ''} aria-label="One more">+</button></span></div>` : ''}
  ${allIn && sum !== n ? `<div class="warnbox">Tricks add up to ${sum}, but this round had ${n} to win${destroyed ? ` (${r} minus ${destroyed} destroyed)` : ''}. Someone's count is off.</div>` : ''}
  ${!allIn ? `<div class="warnbox">Waiting on tricks from ${ps.filter(p => !eff[p.id]).map(p => esc(p.name)).join(', ')}.</div>` : ''}
  <button class="btn primary" style="margin-top:12px" data-act="score" ${allIn ? '' : 'disabled'}>${allIn && sum !== n ? 'Score anyway' : r === ROUNDS ? 'Score final round' : `Score round ${r}`}</button>
  <p class="small muted">Anyone without bonus cards can skip confirming — their live count is used.</p>
  ${undoCard(g)}`;
}

// ---------- done ----------
function chartSVG(g) {
  const t = totals(g), ps = sortedPlayers(g), n = ROUNDS;
  const vals = ps.flatMap(p => [0, ...t[p.id].running]);
  const lo = Math.min(0, ...vals), hi = Math.max(10, ...vals);
  const W = 340, H = 200, L = 34, R = 8, T = 10, B = 22;
  const x = i => L + (i / n) * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const step = Math.max(50, Math.ceil((hi - lo) / 4 / 50) * 50);
  let grid = '';
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid += `<line class="${v === 0 ? 'zero' : 'grid'}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 4}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  for (let i = 1; i <= n; i++) grid += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${i}</text>`;
  const lines = ps.map(p => {
    const pts = [0, ...t[p.id].running].map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${color(p.id)}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Running totals by round">${grid}${lines}</svg>
    <div class="legend">${ps.map(p => `<span style="--c:${color(p.id)}">${esc(p.name)}</span>`).join('')}</div>`;
}

function doneView(g) {
  const rank = ranking(g), lines = gameHighlights(g, name);
  const winners = rank.filter(r => r.place === 1).map(r => esc(r.name)).join(' & ');
  return `
  <section class="hero" style="padding:16px 0 4px"><div class="skull">🏴‍☠️</div><h1 style="font-size:2.4rem">${winners} win${rank.filter(r => r.place === 1).length > 1 ? '' : 's'}!</h1></section>
  <div class="board podium">
    ${rank.map(r => `<div class="prow"><span class="place">${r.place}</span><div class="who"><b>${esc(r.name)}</b></div><span></span><span class="total">${signed(r.total)}</span></div>`).join('')}
  </div>
  ${lines.length ? `<div class="card"><h3>Hall of fame</h3><ul class="hl">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}
  <div class="card"><h3>The voyage</h3>${chartSVG(g)}</div>
  <button class="btn" data-act="scores">Round-by-round table</button>
  <button class="btn primary" data-act="rematch">Rematch, same crew</button>
  <button class="btn ghost" data-act="home">Home</button>
  ${undoCard(g)}`;
}

// ---------- sheets ----------
function renderSheet() {
  const s = S.sheet;
  if (!s || (s.kind !== 'rules' && !S.game)) { $sheet.hidden = true; $sheet.innerHTML = ''; return; }
  const body = { scores: scoresSheet, menu: menuSheet, rules: rulesSheet, edit: editSheetWrapper, actfor: actForSheet, share: shareSheet, bidpick: bidPickSheet }[s.kind]?.(s) || '';
  const title = { scores: 'Scores', menu: 'Menu', rules: 'Rules & scoring', edit: s.bidOnly ? 'Fix a bid' : `Edit round ${s.r}`, actfor: 'Enter for…', share: `Game ${S.code}`, bidpick: 'Fix whose bid?' }[s.kind];
  $sheet.hidden = false;
  $sheet.innerHTML = `<div class="panel" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="head"><h2>${esc(title)}</h2><button class="icon-btn" data-act="close">Close</button></div>${body}</div>`;
  if (s.kind === 'share') drawQR();
}

function scoresSheet() {
  const g = S.game, ps = sortedPlayers(g), t = totals(g);
  const lastEditable = g.phase === 'done' ? g.round : g.round - 1;
  let rows = '';
  for (let r = 1; r <= ROUNDS; r++) {
    rows += `<tr><td class="rn">${r}</td>${ps.map(p => {
      const bid = g.bids?.[r]?.[p.id], res = g.results?.[r]?.[p.id];
      if (r > lastEditable) return `<td class="muted">${r === g.round && bid != null && g.phase !== 'bidding' ? `<small>bid ${bid}</small>` : ''}</td>`;
      const s = t[p.id].rounds[r];
      return `<td><button data-act="edit" data-r="${r}" data-id="${p.id}" aria-label="Edit ${esc(p.name)} round ${r}"><b class="${s >= 0 ? 'good-t' : 'bad-t'}">${signed(s)}</b><small>${bid ?? '–'}/${res?.tricks ?? '–'}</small></button></td>`;
    }).join('')}</tr>`;
  }
  return `<p class="small muted" style="margin-top:0">Cells show score and bid/won. Tap a scored round to fix it.</p>
  <div class="tbl-wrap"><table class="scores"><thead><tr><th>#</th>${ps.map(p => `<th style="color:${color(p.id)}">${esc(p.name)}</th>`).join('')}</tr></thead>
  <tbody>${rows}</tbody><tfoot><tr><td></td>${ps.map(p => `<td>${signed(t[p.id].total)}</td>`).join('')}</tr></tfoot></table></div>`;
}

function editSheet(s) {
  const g = S.game, key = `${s.r}:${s.id}`;
  const d = S.drafts[key] ||= { ...(g.results?.[s.r]?.[s.id] || { tricks: 0 }) };
  const bid = s.bid ?? g.bids?.[s.r]?.[s.id] ?? 0;
  const cannon = s.cannon ?? !!g.cannon?.[s.r]?.[s.id];
  const score = roundScore(s.r, bid, d, { mode: g.scoring, cannon });
  return `<p style="margin-top:0"><b style="color:${color(s.id)}">${esc(name(s.id))}</b></p>
    ${stepper('edit-bid', 'bid', 'Bid', '', bid, s.r)}
    ${g.scoring === 'rascal' ? `<div class="seg" style="margin:6px 0" role="radiogroup" aria-label="Rascal wager">
      <button type="button" role="radio" aria-checked="${!cannon}" class="${!cannon ? 'on' : ''}" data-act="edit-cannon" data-v="0"><b>Grapeshot</b></button>
      <button type="button" role="radio" aria-checked="${cannon}" class="${cannon ? 'on' : ''}" data-act="edit-cannon" data-v="1"><b>💣 Cannonball</b></button></div>` : ''}
    ${stepper('edit-draft', 'tricks', 'Tricks won', '', d.tricks ?? 0, s.r)}
    ${bonusKeys(g).map(k => stepper('edit-draft', k, `${BONUS[k].label} <span class="muted small">+${BONUS[k].pts}</span>`, '', d[k] || 0, BONUS[k].max)).join('')}
    <div class="preview"><span class="muted">Round ${s.r}</span><b class="${score >= 0 ? 'good-t' : 'bad-t'}">${signed(score ?? 0)}</b></div>
    <button class="btn primary" style="margin-top:12px" data-act="save-edit">Save</button>`;
}

function menuSheet() {
  const g = S.game;
  return `<div class="seat-list">
    <button class="btn" data-act="open-actfor">Enter for another player…</button>
    <button class="btn" data-act="share">Invite players (code &amp; QR)</button>
    <button class="btn" data-act="rules">Rules &amp; scoring</button>
    ${lastUndo(g) ? `<button class="btn" data-act="undo">${esc(lastUndo(g).label)}</button>` : ''}
    <button class="btn" data-act="change-seat">Switch player on this phone</button>
    ${S.seat !== 'watch' ? `<button class="btn" data-act="table-mode">Use this screen as the table scoreboard</button>` : ''}
    <button class="btn ghost" data-act="home">Leave game (it keeps going)</button>
  </div>
  <p class="small muted">You are ${S.seat === 'watch' ? 'the table screen' : `<b>${esc(name(S.seat))}</b>`}. ${esc(rulesLine(g))}. ${S.store.live ? 'Live sync on.' : 'Local mode: this device only.'}</p>`;
}

function actForSheet() {
  return `<p class="small muted" style="margin-top:0">For when someone's phone is dead or away. Your screen will act as them until you tap Done.</p>
  <div class="seat-list">${sortedPlayers(S.game).filter(p => p.id !== S.seat).map(p =>
    `<button class="btn" data-act="act-as" data-id="${p.id}"><span class="dot" style="background:${color(p.id)}"></span>${esc(p.name)}</button>`).join('')}</div>`;
}

function shareSheet() {
  return `<div class="share"><div class="big-code">${esc(S.code)}</div><div class="qr" id="qr"></div>
    <div class="row-btns"><button class="btn" data-act="copy-link">Copy link</button>${navigator.share ? `<button class="btn" data-act="native-share">Share…</button>` : ''}</div></div>`;
}

function rulesSheet() {
  return `<div class="rules">
  ${S.game ? `<p class="note" style="margin-top:0">This game: ${esc(rulesLine(S.game))}</p>` : ''}
  <h3>Scoring</h3>
  <table>
    <tr><td>Bid 1+ and hit it exactly</td><td>+20 per trick</td></tr>
    <tr><td>Bid 1+ and miss</td><td>−10 per trick off</td></tr>
    <tr><td>Bid 0 and take no tricks</td><td>+10 × round</td></tr>
    <tr><td>Bid 0 and take any trick</td><td>−10 × round</td></tr>
  </table>
  <h3>Bonus points <span class="small muted">(only if your bid is made)</span></h3>
  <table>
    <tr><td>Each yellow, purple or green 14 in your tricks</td><td>+10</td></tr>
    <tr><td>Black 14 in your tricks</td><td>+20</td></tr>
    <tr><td>Each Mermaid captured by your Pirate</td><td>+20</td></tr>
    <tr><td>Each Pirate captured by your Skull King</td><td>+30</td></tr>
    <tr><td>Skull King captured by your Mermaid</td><td>+40</td></tr>
  </table>
  <h3>Who wins a trick</h3>
  <ul>
    <li>Follow the suit that was led if you can. Special cards may always be played instead.</li>
    <li>Highest card of the led suit wins, unless a black card (trump) is played: highest black wins.</li>
    <li>Pirates beat every numbered card. Skull King beats Pirates. Mermaids beat numbered cards and the Skull King, but lose to Pirates.</li>
    <li>If a Pirate, the Skull King and a Mermaid all land in one trick, the Mermaid wins.</li>
    <li>Ties between the same special card: the first one played wins.</li>
    <li>Escape cards always lose. If everyone plays Escape, the first one played wins.</li>
    <li>Tigress: when you play it, announce Pirate or Escape.</li>
    <li>If an Escape or special card leads, the next numbered card played sets the suit.</li>
  </ul>
  <h3>Rascal scoring <span class="small muted">(optional)</span></h3>
  <ul>
    <li>Every round is worth 10 points per card dealt, whatever you bid.</li>
    <li>Hit your bid: all of it plus bonuses. Off by one: half of everything. Off by more: nothing.</li>
    <li>💣 Cannonball: reveal it with your bid. 15 points per card if exact, nothing otherwise.</li>
  </ul>
  <h3>Expansion cards <span class="small muted">(optional)</span></h3>
  <ul>
    <li>🐙 Kraken: the trick is destroyed and nobody wins it. Whoever would have won leads next.</li>
    <li>🐋 White Whale: special cards lose their power; the highest number wins, any suit. If only special cards were played, the trick is destroyed and the Whale's player leads.</li>
    <li>If both the Kraken and the White Whale land in one trick, the second one played counts.</li>
    <li>💰 Loot: plays like an Escape. Whoever wins the trick forms an alliance with the Loot's player: if both make their bids, each gets +20.</li>
  </ul>
  <h3>Rounds</h3>
  <p class="muted" style="margin-top:0">10 rounds; round N deals N cards. The deal passes left each round. House rule: the player after the dealer leads every trick of the round.</p>
  </div>`;
}

// ---------- actions ----------
const actions = {
  home() { S.sheet = null; S.actingFor = null; location.hash = ''; S.setup = null; render(); },
  new() { S.setup = { names: ['', '', '', ''], dealer: 0, scoring: 'classic', exp: {} }; render(); document.querySelector('[data-form=setup] input')?.focus(); },
  'cancel-setup'() { S.setup = null; render(); },
  'add-name'() { syncSetupInputs(); S.setup.names.push(''); render(); document.querySelector(`[data-idx="${S.setup.names.length - 1}"]`)?.focus(); },
  'rm-name'(el) { syncSetupInputs(); const i = +el.dataset.i; S.setup.names.splice(i, 1); if (S.setup.dealer >= S.setup.names.length || S.setup.dealer === i) S.setup.dealer = 0; render(); },
  'set-dealer'(el) { syncSetupInputs(); S.setup.dealer = +el.dataset.i; render(); },
  'set-scoring'(el) { syncSetupInputs(); S.setup.scoring = el.dataset.v; render(); },
  'toggle-exp'(el) { syncSetupInputs(); S.setup.exp[el.dataset.k] = !S.setup.exp[el.dataset.k]; render(); },
  rules() { S.sheet = { kind: 'rules' }; renderSheet(); },
  scores() { S.sheet = { kind: 'scores' }; renderSheet(); },
  menu() { S.sheet = { kind: 'menu' }; renderSheet(); },
  share() { S.sheet = { kind: 'share' }; renderSheet(); },
  close() { if (S.sheet?.kind === 'edit') delete S.drafts[`${S.sheet.r}:${S.sheet.id}`]; S.sheet = null; renderSheet(); },
  seat(el) {
    const id = el.dataset.id, holder = S.game.presence?.[id];
    if (id !== 'watch' && holder && holder !== DEVICE && !confirm(`${name(id)} is already open on another phone. Take over this seat here?`)) return;
    S.seat = id; saveSeat(S.code, id);
    if (id !== 'watch') { S.claimed = id; S.store.claim(S.code, id, DEVICE).catch(() => {}); }
    render();
  },
  'change-seat'() {
    const held = S.claimed;
    S.seat = null; S.claimed = null; S.actingFor = null; S.sheet = null;
    if (held) S.store.release(S.code, held).catch(() => {});
    try { sessionStorage.removeItem(seatKey(S.code)); localStorage.removeItem(seatKey(S.code)); } catch {}
    render();
  },
  'table-mode'() {
    const held = S.claimed;
    S.seat = 'watch'; S.claimed = null; S.actingFor = null; S.sheet = null; saveSeat(S.code, 'watch');
    if (held) S.store.release(S.code, held).catch(() => {});
    render();
  },
  nudge(el) {
    update({ [`nudge/${el.dataset.id}`]: Date.now() });
    toast(`Nudged ${name(el.dataset.id)} 🔔`);
  },
  cannon(el) {
    const g = S.game, who = me();
    if (g.phase !== 'bidding' || !who) return;
    update({ [`cannon/${g.round}/${who}`]: el.dataset.v === '1' });
  },
  'edit-cannon'(el) { S.sheet.cannon = el.dataset.v === '1'; renderSheet(); },
  destroy(el) {
    const g = S.game, r = g.round, cur = g.destroyed?.[r] || 0;
    update({ [`destroyed/${r}`]: Math.max(0, Math.min(2, cur + +el.dataset.d)) || null });
  },
  'open-actfor'() { S.sheet = { kind: 'actfor' }; renderSheet(); },
  'act-as'(el) { S.actingFor = el.dataset.id; S.sheet = null; render(); window.scrollTo(0, 0); },
  'stop-acting'() { S.actingFor = null; render(); },
  async 'copy-link'() { try { await navigator.clipboard.writeText(shareURL()); toast('Link copied'); } catch { toast(shareURL()); } },
  'native-share'() { navigator.share({ title: 'Skull King', text: `Join our Skull King game: ${S.code}`, url: shareURL() }).catch(() => {}); },
  start() { update({ phase: 'bidding', round: 1 }); },
  bid(el) {
    const g = S.game, r = g.round, who = me();
    if (g.phase !== 'bidding' || !who) return;
    update({ [`bids/${r}/${who}`]: +el.dataset.n });
    navigator.vibrate?.(15);
  },
  live(el) {
    const g = S.game, r = g.round, who = me();
    const cur = g.live?.[r]?.[who] || 0, next = Math.max(0, Math.min(r, cur + +el.dataset.d));
    update({ [`live/${r}/${who}`]: next });
    navigator.vibrate?.(15);
  },
  'to-results'() {
    const g = S.game;
    update(withHistory(g, { phase: 'results' }, '← Back to playing'));
  },
  'fix-bids'() { S.sheet = { kind: 'bidpick' }; renderSheet(); },
  'open-bonus'() { S.bonusOpen[`${S.game.round}:${me()}`] = true; render(); },
  draft(el) {
    const g = S.game, r = g.round, who = me(), key = `${r}:${who}`;
    const d = S.drafts[key] ||= { ...draftFor(g, r, who) };
    const k = el.dataset.k, max = k === 'tricks' ? tricksInRound(g, r) : BONUS[k].max;
    d[k] = Math.max(0, Math.min(max, (d[k] || 0) + +el.dataset.d));
    render();
  },
  confirm() {
    const g = S.game, r = g.round, who = me(), key = `${r}:${who}`;
    const d = { ...draftFor(g, r, who) };
    const clean = { tricks: d.tricks || 0 };
    bonusKeys(g).forEach(k => { if (d[k]) clean[k] = d[k]; });
    delete S.drafts[key];
    if (S.actingFor) S.actingFor = null;
    update({ [`results/${r}/${who}`]: clean, [`live/${r}/${who}`]: clean.tricks });
    toast('Confirmed');
  },
  score() {
    const g = S.game, r = g.round, eff = effectiveResults(g, r), patch = {};
    for (const [pid, e] of Object.entries(eff)) {
      if (e.src === 'confirmed') continue;
      patch[`results/${r}/${pid}`] = { tricks: e.tricks };
    }
    const last = r >= ROUNDS;
    Object.assign(patch, { phase: last ? 'done' : 'bidding', round: last ? r : r + 1, undo: null });
    withHistory(g, patch, `↶ Undo scoring round ${r}`);
    S.drafts = {};
    update(patch);
  },
  undo() {
    const u = lastUndo(S.game);
    if (!u) return;
    S.sheet = null;
    update({ phase: u.phase, round: u.round, ...(u.legacy ? { undo: null } : { [`history/${u.key}`]: null }) });
    toast('Undone');
  },
  edit(el) { S.sheet = { kind: 'edit', r: +el.dataset.r, id: el.dataset.id }; renderSheet(); },
  'edit-draft'(el) {
    const s = S.sheet, key = `${s.r}:${s.id}`, d = S.drafts[key];
    const k = el.dataset.k, max = k === 'tricks' ? tricksInRound(S.game, s.r) : BONUS[k].max;
    d[k] = Math.max(0, Math.min(max, (d[k] || 0) + +el.dataset.d));
    renderSheet();
  },
  'edit-bid'(el) {
    const s = S.sheet;
    s.bid = Math.max(0, Math.min(s.r, (s.bid ?? S.game.bids?.[s.r]?.[s.id] ?? 0) + +el.dataset.d));
    renderSheet();
  },
  'save-edit'() {
    const s = S.sheet, key = `${s.r}:${s.id}`, d = S.drafts[key] || {}, patch = {};
    if (s.bid != null) patch[`bids/${s.r}/${s.id}`] = s.bid;
    if (s.cannon != null) patch[`cannon/${s.r}/${s.id}`] = s.cannon || null;
    if (!s.bidOnly) {
      const clean = { tricks: d.tricks || 0 };
      bonusKeys(S.game).forEach(k => { if (d[k]) clean[k] = d[k]; });
      patch[`results/${s.r}/${s.id}`] = clean;
    }
    delete S.drafts[key];
    S.sheet = s.bidOnly ? null : { kind: 'scores' };
    update(patch);
    toast('Saved');
  },
  'fix-pick'(el) { S.sheet = { kind: 'edit', r: S.game.round, id: el.dataset.id, bidOnly: true }; renderSheet(); },
  async rematch() {
    const g = S.game, ps = sortedPlayers(g);
    const firstIdx = Math.max(0, ps.findIndex(p => p.id === g.firstDealer));
    const prevSeat = S.seat, oldCode = S.code;
    await createGame(ps.map(p => p.name), (firstIdx + 1) % ps.length, { scoring: g.scoring, exp: g.expansions });
    // Carry this phone's seat into the new game (same player ids p0..pN), and point the old game at it.
    const code = location.hash.slice(1);
    if (prevSeat) saveSeat(code, prevSeat);
    S.store.update(oldCode, { next: code });
  },
};

// "Fix a bid" during play: pick a player, then a bid-only edit sheet.
function bidPickSheet() {
  const g = S.game;
  return `<div class="seat-list">${sortedPlayers(g).map(p => `<button class="btn" data-act="fix-pick" data-id="${p.id}"><span class="dot" style="background:${color(p.id)}"></span>${esc(p.name)} · bid ${g.bids?.[g.round]?.[p.id] ?? '–'}</button>`).join('')}</div>`;
}

// The edit sheet hides tricks/bonuses for bid-only fixes.
function editSheetWrapper(s) {
  if (!s.bidOnly) return editSheet(s);
  const bid = s.bid ?? S.game.bids?.[s.r]?.[s.id] ?? 0;
  return `<p style="margin-top:0"><b style="color:${color(s.id)}">${esc(name(s.id))}</b>, round ${s.r}</p>
    ${stepper('edit-bid', 'bid', 'Bid', '', bid, s.r)}
    <button class="btn primary" style="margin-top:12px" data-act="save-edit">Save bid</button>`;
}

function syncSetupInputs() {
  document.querySelectorAll('[data-form=setup] input[data-idx]').forEach(i => { S.setup.names[+i.dataset.idx] = i.value; });
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el === $sheet) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});
$sheet.addEventListener('click', e => { if (e.target === $sheet) actions.close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.sheet) actions.close(); });

document.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  if (form.dataset.form === 'join') {
    const code = new FormData(form).get('code').toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 4) return toast('Codes are 4 letters');
    location.hash = code;
  }
  if (form.dataset.form === 'setup') {
    syncSetupInputs();
    const names = S.setup.names.map(n => n.trim().slice(0, 24));
    const filled = names.filter(Boolean);
    if (filled.length < 2) return toast('Need at least 2 players');
    if (new Set(filled.map(n => n.toLowerCase())).size !== filled.length) return toast('Names must be different');
    // Keep the dealer pointing at the same person after dropping blank rows.
    const dealerName = names[S.setup.dealer];
    const dealer = Math.max(0, filled.indexOf(dealerName));
    form.querySelector('button:not([type])').disabled = true;
    try { await createGame(filled, dealer, { scoring: S.setup.scoring, exp: S.setup.exp }); } catch (err) { console.error(err); toast('Could not create game'); form.querySelector('button:not([type])').disabled = false; }
  }
});

// ---------- boot ----------
(async function boot() {
  try {
    S.store = await openStore();
  } catch (err) {
    console.error(err);
    $app.innerHTML = `<div class="card"><h2>Can't reach the server</h2><p class="muted">Check your internet connection and reload.</p><button class="btn primary" onclick="location.reload()">Reload</button></div>`;
    return;
  }
  S.store.onConnection(on => { S.online = on; if (S.game) renderTop(); });
  route();
  cleanupOldGames();
  if ('serviceWorker' in navigator && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') navigator.serviceWorker.register('sw.js').catch(() => {});
  // Debug helper for testing highlights/chart: window.skSeed() fills a finished 10-round game.
  window.skSeed = seedFinishedGame;
})();

// Each phone remembers the games it created and deletes them once they're 30+ days old
// (checked once a day). The database rules refuse to delete anything newer.
const CREATED_KEY = 'sk.created';
function rememberCreated(code, createdAt) {
  try {
    const list = JSON.parse(localStorage.getItem(CREATED_KEY) || '[]');
    list.push({ code, createdAt });
    localStorage.setItem(CREATED_KEY, JSON.stringify(list.slice(-200)));
  } catch {}
}
function cleanupOldGames() {
  let list;
  try {
    const last = +localStorage.getItem('sk.cleanup') || 0;
    if (Date.now() - last < 24 * 3600 * 1000) return;
    localStorage.setItem('sk.cleanup', Date.now());
    list = JSON.parse(localStorage.getItem(CREATED_KEY) || '[]');
  } catch { return; }
  const cutoff = Date.now() - OLD_GAME_MS - 3600 * 1000;
  const old = list.filter(g => g.createdAt < cutoff);
  if (!old.length) return;
  setTimeout(async () => {
    const done = new Set();
    for (const g of old) {
      try { await S.store.remove(g.code); done.add(g.code); } catch (err) { console.warn('cleanup skipped', g.code, err); }
    }
    try { localStorage.setItem(CREATED_KEY, JSON.stringify(list.filter(g => !done.has(g.code)))); } catch {}
  }, 4000);
}

async function seedFinishedGame() {
  if (!S.code || !S.game) return 'open a game first';
  const ps = sortedPlayers(S.game), patch = { phase: 'done', round: ROUNDS };
  for (let r = 1; r <= ROUNDS; r++) {
    let left = r;
    ps.forEach((p, i) => {
      const tricks = i === ps.length - 1 ? left : Math.floor(Math.random() * (left + 1));
      left -= tricks;
      const bid = Math.random() < .6 ? tricks : Math.max(0, tricks + (Math.random() < .5 ? -1 : 1));
      patch[`bids/${r}/${p.id}`] = bid;
      patch[`results/${r}/${p.id}`] = { tricks, ...(Math.random() < .15 ? { std14: 1 } : {}), ...(Math.random() < .05 ? { skullKing: 1 } : {}) };
    });
  }
  await S.store.update(S.code, patch);
  return 'seeded';
}
