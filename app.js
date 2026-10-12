import { openStore, OLD_GAME_MS } from './store.js';
import { CREW, CREW_IDS, spriteSVG, spriteRects } from './avatars.js';
import {
  ROUNDS, BONUS, bonusKeys, roundScore, scoreFor, sortedPlayers, dealerFor, leaderFor, totals, ranking,
  autoFillTricks, liveStatus, roundHighlights, gameHighlights, tricksInRound, bidHint, playerSummary, plain,
} from './scoring.js';

// Player identity = colour + signal-flag pattern, so it never depends on colour alone.
const COLORS = ['#1a9bb0', '#e5603e', '#2e9e63', '#6a5acd', '#d99a1e', '#3b82c4', '#a0663a', '#6b7a8c'];
const FLAG_PATTERNS = [
  c => `<rect width="18" height="13" fill="${c}"/>`,
  c => `<rect width="18" height="13" fill="#fff"/><rect width="18" height="6.5" fill="${c}"/>`,
  c => `<rect width="18" height="13" fill="#fff"/><rect width="9" height="13" fill="${c}"/>`,
  c => `<rect width="18" height="13" fill="${c}"/><rect x="7.5" width="3" height="13" fill="#fff"/><rect y="5" width="18" height="3" fill="#fff"/>`,
  c => `<rect width="18" height="13" fill="#fff"/><path d="M0 0h18L0 13Z" fill="${c}"/>`,
  c => `<rect width="18" height="13" fill="${c}"/><rect x="4.5" y="3.25" width="9" height="6.5" fill="#fff"/>`,
  c => `<rect width="18" height="13" fill="#fff"/><rect width="18" height="4.33" fill="${c}"/><rect y="8.67" width="18" height="4.33" fill="${c}"/>`,
  c => `<rect width="18" height="13" fill="#fff"/><rect width="9" height="6.5" fill="${c}"/><rect x="9" y="6.5" width="9" height="6.5" fill="${c}"/>`,
];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O
const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';

const $app = document.getElementById('app');
const $top = document.getElementById('top');
const $sheet = document.getElementById('sheet');
const $toast = document.getElementById('toast');
const $sr = document.getElementById('sr');
// Polite screen-reader announcements for moments that only animate on screen.
const announce = msg => { $sr.textContent = ''; setTimeout(() => { $sr.textContent = msg; }, 60); };

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
  prevX: {},           // Standings Line marker positions, for the glide after scoring
  deltaRound: null, deltaUntil: 0, // show round deltas on the Standings Line briefly
  counted: null,       // round whose "nailed it" count-up already played
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const name = id => S.game?.players?.[id]?.name || '?';
// A player's chosen crew character (null until they pick one; flags stand in until then).
const avatarOf = id => { const a = S.game?.players?.[id]?.avatar; return CREW[a] ? a : null; };
const color = id => avatarOf(id) ? CREW[avatarOf(id)].color : COLORS[(S.game?.players?.[id]?.order ?? 0) % COLORS.length];
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
const icon = (id, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const flagFor = order => `<svg class="flag" viewBox="0 0 18 13" aria-hidden="true">${FLAG_PATTERNS[order % 8](COLORS[order % 8])}</svg>`;
const avatarTile = (a, cls = '') => `<span class="flag ava ${cls}" style="--crew:${CREW[a].color}">${spriteSVG(a)}</span>`;
const flag = id => { const a = avatarOf(id); return a ? avatarTile(a) : flagFor(S.game?.players?.[id]?.order ?? 0); };
// For nesting inside an SVG (chart line ends).
const markSVG = (id, x, y, size) => {
  const a = avatarOf(id), o = S.game.players[id].order % 8;
  return a ? `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges">${spriteRects(a)}</svg>`
    : `<svg x="${x}" y="${y + 2}" width="${size}" height="${size * 13 / 18}" viewBox="0 0 18 13">${FLAG_PATTERNS[o](COLORS[o])}</svg>`;
};
const mark = (cls = 'mark') => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true"><use href="#i-mark"/></svg>`;
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
    S.seat = null; S.claimed = null; S.sheet = null; S.actingFor = null;
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
  S.changing = false;
  S.game = undefined; S.actingFor = null; S.drafts = {}; S.lastPhaseKey = null; S.sheet = null; S.claimed = null; S.nudgeSeen = null; S.prevX = {};
  if (S.code) {
    S.seat = loadSeat(S.code);
    S.unsub = S.store.subscribe(S.code, g => onGame(g));
    keepAwake();
  }
  render();
}
window.addEventListener('hashchange', route);
let resizeT; addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (S.seat === 'watch') render(); }, 150); });

function onGame(g) {
  const prev = S.game;
  S.game = g;
  if (g) {
    const key = `${g.round}:${g.phase}`;
    S.revealAnim = !!(prev && prev.phase === 'bidding' && g.phase === 'playing' && prev.round === g.round);
    if (prev && prev.phase === 'results' && (g.phase === 'bidding' || g.phase === 'done') && (g.round !== prev.round || g.phase === 'done')) {
      S.deltaRound = prev.round; S.deltaUntil = Date.now() + 3400;
    }
    if (S.revealAnim) {
      chime(); navigator.vibrate?.(60);
      const b = g.bids?.[g.round] || {};
      announce(`All bids in. ${sortedPlayers(g).map(p => `${p.name} ${b[p.id]}`).join(', ')}.`);
    }
    if (S.deltaUntil > Date.now() && S.deltaRound && prev?.phase === 'results') {
      const t = totals(g), mine = me(), lead = ranking(g)[0];
      announce(`Round ${S.deltaRound} scored.${mine ? ` You ${signed(t[mine].rounds[S.deltaRound])}.` : ''} ${lead.name} is ahead with ${plain(lead.total)}.`);
    }
    S.finalAnim = !!(prev && prev.phase !== 'done' && g.phase === 'done');
    if (S.finalAnim) chime();
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
      toast(g.phase === 'results' ? 'The crew is waiting for your tricks' : 'The crew is waiting for your bid');
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
  return S.store.update(S.code, patch).catch(err => {
    console.error(err);
    toast("Couldn't save that. Check your connection.", { label: 'Retry', run: () => update(patch) });
  });
}

// ---------- render ----------
// Remember which control had focus so a redraw (ours or a sync from another phone) keeps your place.
function focusKey() {
  const a = document.activeElement;
  if (!a || a === document.body || !a.dataset) return null;
  const d = a.dataset;
  return d.act ? `[data-act="${d.act}"]${d.k ? `[data-k="${d.k}"]` : ''}${d.n ? `[data-n="${d.n}"]` : ''}${d.id ? `[data-id="${d.id}"]` : ''}${d.d ? `[data-d="${d.d}"]` : ''}${d.v ? `[data-v="${d.v}"]` : ''}${d.c ? `[data-c="${d.c}"]` : ''}` : null;
}

function render() {
  const fk = focusKey(), sheetFocused = $sheet.contains(document.activeElement);
  document.body.classList.toggle('table', S.seat === 'watch' && !!S.code && innerWidth >= 700);
  renderTop();
  if (!S.code) { $app.innerHTML = S.setup ? setupView() : homeView(); }
  else if (S.game === undefined) { $app.innerHTML = '<p class="loading">Finding the ship…</p>'; }
  else if (S.game === null) {
    $app.innerHTML = `<div class="card"><h2>No game “${esc(S.code)}”</h2><p class="muted">Check the code with whoever started the game.</p>
      <button class="btn primary" data-act="home">Back</button></div>`;
  }
  else if (!S.seat) { $app.innerHTML = seatView(); }
  else if (S.seat !== 'watch' && S.game.players?.[S.seat] && (S.picking || (!avatarOf(S.seat) && !S.skipPick?.[S.code]))) { $app.innerHTML = crewView(); }
  else {
    const g = S.game;
    $app.innerHTML = (S.actingFor ? actingBanner() : '') + ({
      lobby: lobbyView, bidding: biddingView, playing: playingView, results: resultsView, done: doneView,
    }[g.phase] || lobbyView)(g);
    if (g.phase === 'lobby') drawQR();
  }
  if (!sheetFocused) renderSheet();
  afterRender();
  if (fk) { const el = document.querySelector(fk); if (el && !el.disabled) el.focus({ preventScroll: true }); }
}

// Glide Standings Line markers from their previous sounding, and count up the "nailed it" score.
function afterRender() {
  // Standings Line: assign lanes from the tags' real widths (no overlaps, whatever the names),
  // then glide every marker from its previous position and lane to the new one.
  document.querySelectorAll('.standings').forEach(st => {
    st.classList.add('measuring');
    const boxes = [...st.querySelectorAll('.marker[data-id]')].map(m => {
      const r = m.querySelector('.tag').getBoundingClientRect();
      return { m, l: r.left, r: r.right };
    }).sort((a, b) => a.l - b.l);
    const ends = [];
    for (const b of boxes) {
      let lane = ends.findIndex(e => b.l - e >= 6);
      if (lane < 0) { lane = ends.length; ends.push(b.r); } else ends[lane] = b.r;
      b.lane = lane;
    }
    st.querySelector('.lanes').style.setProperty('--lanes', Math.max(1, ends.length));
    for (const { m, lane } of boxes) {
      const id = m.dataset.id, x = m.style.getPropertyValue('--x'), before = S.prevX[id];
      if (before) { m.style.setProperty('--x', before.x); m.style.setProperty('--lane', before.lane); }
      else m.style.setProperty('--lane', lane);
      S.prevX[id] = { x, lane };
      m.dataset.to = JSON.stringify({ x, lane });
    }
    st.getBoundingClientRect();
    st.classList.remove('measuring');
    for (const { m } of boxes) {
      const to = JSON.parse(m.dataset.to);
      m.style.setProperty('--x', to.x); m.style.setProperty('--lane', to.lane);
    }
  });
  const c = document.querySelector('[data-count]');
  if (c && S.counted !== c.dataset.key) {
    S.counted = c.dataset.key;
    const target = +c.dataset.count, t0 = performance.now(), dur = 900;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      c.textContent = (c.dataset.plain ? plain : signed)(Math.round(target * e));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  // When the round deltas finish fading, redraw once so their space in the tags closes up.
  if (S.deltaUntil > Date.now() && !S.deltaTimer) {
    S.deltaTimer = setTimeout(() => { S.deltaTimer = null; S.deltaUntil = 0; render(); }, S.deltaUntil - Date.now() + 50);
  }
}

function renderTop() {
  const g = S.game;
  if (!S.code || !g || !S.seat) { $top.hidden = true; return; }
  $top.hidden = false;
  const r = g.round;
  const sub = g.phase === 'lobby' ? 'Waiting to start' : g.phase === 'done' ? 'Game over'
    : `${r} card${r > 1 ? 's' : ''} · ${esc(name(dealerFor(g, r)))} deals`;
  $top.innerHTML = `
    <h1 class="sr-only">Skull King scorer${g.phase === 'lobby' || g.phase === 'done' ? '' : `, round ${r}`}</h1>
    <button class="code-chip ${S.online ? '' : 'offline'}" data-act="share" aria-label="Game ${esc(S.code)}${S.online ? '' : ', offline: changes will sync when you reconnect'}. Invite players"><span class="dot ${S.online ? '' : 'off'}" aria-hidden="true"></span>${esc(S.code)}${S.online ? '' : '<span class="off-label">Offline</span>'}</button>
    <div class="round">${g.phase === 'lobby' || g.phase === 'done' ? `<b>${g.phase === 'done' ? 'Final scores' : 'Lobby'}</b>` : `<b>Round ${r}<span> / ${ROUNDS}</span></b>`}<small>${sub}</small></div>
    <button class="icon-btn" data-act="scores" aria-label="Scores table">${icon('chart')}</button>
    <button class="icon-btn" data-act="menu" aria-label="Menu">${icon('more')}</button>`;
}

// ---------- home & setup ----------
function homeView() {
  return `
  <section class="hero">${mark()}<h1>Skull King</h1><p>Live scores for the whole table.</p>
    <div class="parade" aria-hidden="true">${['captain', 'coralia', 'kraken', 'parrot', 'ghost', 'tigress', 'crab'].map((id, i) => `<span style="--i:${i}">${avatarTile(id)}</span>`).join('')}</div>
    <ol class="steps">
      <li><b>1</b><span>Everyone bids on their own phone</span></li>
      <li><b>2</b><span>Bids reveal together, like the fist shake</span></li>
      <li><b>3</b><span>Tap when you win a trick; scoring is automatic</span></li>
    </ol></section>
  <button class="btn primary" data-act="new">${icon('plus')} New game</button>
  <div class="card">
    <h2 class="t3">Join a game</h2>
    <form class="join" data-form="join"><input name="code" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="CODE" aria-label="Game code" required>
    <button class="btn ink">Join</button></form>
  </div>
  <button class="btn ghost" data-act="rules">${icon('book')} How scoring works</button>
  ${S.store.live ? '' : `<p class="note">Local mode: games sync between tabs on this device only.</p>`}`;
}

function setupView() {
  const { names, dealer } = S.setup;
  return `
  <h2>Who's playing?</h2>
  <p class="muted small">Seating order around the table. Tap the circle next to whoever deals round 1.</p>
  <form data-form="setup" role="radiogroup" aria-label="Who deals first">
    ${names.map((n, i) => `
      <div class="name-row">
        <span class="seatno">${i + 1}</span>
        <input type="text" name="n${i}" value="${esc(n)}" maxlength="24" placeholder="Player ${i + 1}" autocomplete="off" data-idx="${i}">
        <button type="button" role="radio" aria-checked="${dealer === i}" aria-label="${esc(n || `Player ${i + 1}`)} deals first" class="deal ${dealer === i ? 'on' : ''}" data-act="set-dealer" data-i="${i}">${dealer === i ? `${icon('check', 'xs')}Deals` : '<span class="radio-dot" aria-hidden="true"></span>'}</button>
        ${names.length > 2 ? `<button type="button" class="x" data-act="rm-name" data-i="${i}" aria-label="Remove player ${i + 1}">${icon('close')}</button>` : ''}
      </div>`).join('')}
    ${names.length < 8 ? `<button type="button" class="btn ghost" data-act="add-name">${icon('plus')} Add player</button>` : ''}
    <div class="section-h"><h2 class="t3">House rules</h2></div>
    <div class="seg" role="radiogroup" aria-label="Scoring">
      <button type="button" role="radio" aria-checked="${S.setup.scoring === 'classic'}" class="${S.setup.scoring === 'classic' ? 'on' : ''}" data-act="set-scoring" data-v="classic"><b>Classic</b><span>±20 per trick</span></button>
      <button type="button" role="radio" aria-checked="${S.setup.scoring === 'rascal'}" class="${S.setup.scoring === 'rascal' ? 'on' : ''}" data-act="set-scoring" data-v="rascal"><b>Rascal</b><span>10/card, half if off by 1</span></button>
    </div>
    <p class="muted small" style="margin:14px 2px 8px">Expansion cards in the deck</p>
    <div class="toggles">
      ${[['kraken', 'Kraken'], ['whale', 'White Whale'], ['loot', 'Loot']].map(([k, l]) =>
        `<button type="button" aria-pressed="${!!S.setup.exp[k]}" class="${S.setup.exp[k] ? 'on' : ''}" data-act="toggle-exp" data-k="${k}">${icon(k)}${l}</button>`).join('')}
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
  names.forEach((n, i) => { players['p' + i] = { name: n, order: i, ...(opts.avatars?.['p' + i] ? { avatar: opts.avatars['p' + i] } : {}) }; });
  const game = { createdAt: Date.now(), phase: 'lobby', round: 1, firstDealer: 'p' + dealer, players, scoring: opts.scoring || 'classic' };
  if (opts.champion) game.champion = opts.champion;
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
  <h2 style="margin-top:24px">Who are you?</h2>
  <p class="muted small">Game ${esc(S.code)}. Pick your name to bid from this phone.</p>
  <div class="seat-list">
    ${ps.map(p => {
      const taken = S.game.presence?.[p.id] && S.game.presence[p.id] !== DEVICE;
      return `<button class="btn ${taken ? 'taken' : ''}" data-act="seat" data-id="${p.id}">${flag(p.id)}${esc(p.name)}${taken ? `<span class="chip tag">${icon('phone')}On another phone</span>` : ''}</button>`;
    }).join('')}
    <button class="btn ghost" data-act="seat" data-id="watch">${icon('screen')} Table screen (big scoreboard, no seat)</button>
  </div>`;
}

// ---------- crew picker ----------
function crewView() {
  const g = S.game, seat = S.seat, mine = avatarOf(seat);
  const takenBy = {};
  for (const [pid, p] of Object.entries(g.players)) if (pid !== seat && CREW[p.avatar]) takenBy[p.avatar] = p.name;
  const champ = g.champion === seat;
  // The champion sees their reward first; everyone else sees it last, locked.
  const order = champ ? ['skullking', ...CREW_IDS.filter(id => id !== 'skullking')] : CREW_IDS;
  return `
  <h2 style="margin-top:24px">Pick your character</h2>
  <p class="muted small" style="margin-top:0">${esc(name(seat))}, this is how the crew will see you on the scoreboard.${champ ? ' You won the last game, so the Skull King is yours to claim.' : ''}</p>
  <div class="crew-grid">
    ${order.map(id => {
      const c = CREW[id], who = takenBy[id], locked = c.earned && !champ, reward = c.earned && champ;
      const chip = who ? `<span class="crew-chip">${esc(who)}</span>` : locked ? `<span class="crew-chip">${icon('crown', 'xs')}Winner</span>` : reward ? `<span class="crew-chip claim">${icon('crown', 'xs')}Claim</span>` : '';
      const label = `${c.name}${who ? `, taken by ${who}` : locked ? ', only for the last game’s winner' : reward ? ', your reward for winning' : ''}`;
      return `<button class="crew-pick ${mine === id ? 'on' : ''} ${reward ? 'reward' : ''}" data-act="pick-crew" data-c="${id}" ${who || locked ? 'disabled' : ''} aria-pressed="${mine === id}" aria-label="${esc(label)}">
        <span class="crew-art">${avatarTile(id, 'big')}${chip}</span><b>${esc(c.name)}</b></button>`;
    }).join('')}
  </div>
  ${mine ? `<button class="btn" style="margin-top:14px" data-act="crew-done">Keep ${esc(CREW[mine].name)}</button>` : `<button class="link" data-act="crew-skip">Skip for now (use a flag)</button>`}`;
}

function roleBadges(g, r, pid) {
  // House rule: the player after the dealer leads every trick of the round.
  return (dealerFor(g, r) === pid ? '<span class="badge">dealer</span>' : '')
    + (leaderFor(g, r) === pid ? `<span class="badge lead" title="Plays first in every trick this round">${icon('lead', 'xs')}leads tricks</span>` : '');
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
  const champ = g.champion && g.players[g.champion];
  return `
  ${champ ? `<div class="card scored nailed"><div class="outcome">${icon('crown', 'crownmark')}<div class="what">${esc(champ.name)} won the last game
    <small>${g.champion === S.seat ? 'The Skull King is unlocked for you this game.' : 'Only they can sail as the Skull King this game.'}</small></div>
    ${g.champion === S.seat && avatarOf(S.seat) !== 'skullking' ? `<button class="btn" style="width:auto;margin-left:auto" data-act="pick-crew" data-c="skullking">${avatarTile('skullking')}Claim</button>` : ''}</div></div>` : ''}
  <div class="card share">
    <p class="muted small" style="margin:0">Scan or open the link, then pick your name</p>
    <div class="big-code">${esc(S.code)}</div>
    <div class="qr" id="qr" aria-label="QR code for the game link"></div>
    <div class="row-btns"><button class="btn" data-act="copy-link">${icon('link')} Copy link</button>${navigator.share ? `<button class="btn" data-act="native-share">${icon('share')} Share</button>` : ''}</div>
  </div>
  <div class="section-h"><h2 class="t3">Crew</h2><span>${ps.length} players</span></div>
  <div class="board">
    ${ps.map(p => `<div class="prow ${p.id === S.seat ? 'me' : ''}" style="--crew:${color(p.id)}">${flag(p.id)}
      <div class="who"><b><span class="nm">${esc(p.name)}</span>${p.id === g.firstDealer ? '<span class="badge">deals first</span>' : ''}</b></div><span></span><span></span></div>`).join('')}
  </div>
  <p class="rules-line">${esc(rulesLine(g))}</p>
  <button class="btn ghost" data-act="rules">${icon('book')} Rules &amp; scoring</button>
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

// ---------- the Standings Line ----------
const niceStep = raw => [10, 20, 25, 50, 100, 200, 250, 500, 1000].find(v => v >= raw) || 1000;

function standingsLine(g, { full = false } = {}) {
  const t = totals(g), ps = sortedPlayers(g);
  if (!ps.length) return '';
  const vals = ps.map(p => t[p.id].total);
  const minV = Math.min(0, ...vals), maxV = Math.max(0, ...vals);
  const step = niceStep(Math.max(maxV - minV, 40) / 4);
  const lo = Math.floor(minV / step) * step, hi = Math.max(lo + step * 2, Math.ceil(maxV / step) * step);
  const pos = v => ((v - lo) / (hi - lo)) * 100;
  const top = Math.max(...vals), scored = g.round > 1 || g.phase === 'done';
  const showDelta = S.deltaUntil > Date.now() && S.deltaRound;
  const elapsed = showDelta ? 3400 - (S.deltaUntil - Date.now()) : 0;
  // Stack markers on lanes so tags never overlap. On phones, cap at two lanes by
  // dropping names from the tags (flag + sounding only) when the crew is crowded.
  const lay = gap => {
    const ends = [];
    const placed = [...ps].sort((a, b) => t[a.id].total - t[b.id].total).map(p => {
      const x = pos(t[p.id].total);
      let lane = ends.findIndex(end => x - end >= gap);
      if (lane < 0) { lane = ends.length; ends.push(x); } else ends[lane] = x;
      return { p, x, lane };
    });
    return { placed, lanes: ends.length };
  };
  // Tags are wider while round deltas show, so they need more room on the line.
  const gap = showDelta ? 48 : 34;
  // Slim waterline most of the time (flag + sounding only); the full line at the big moments.
  let compact = !full && S.seat !== 'watch', L = lay(compact ? gap / 2 : gap);
  if (!compact && L.lanes > 3 && S.seat !== 'watch') { compact = true; L = lay(gap / 2); }
  let ticks = '';
  for (let v = lo; v <= hi; v += step) ticks += `<span class="tick ${v === 0 ? 'zero' : ''}" style="left:${pos(v)}%">${v}</span>`;
  // Depth bands: shoal water at the low end, open water toward the leader.
  const bands = [1, 2, 3].map(i => `<span class="band b${i}" style="left:${((i - 1) / 3) * 100}%" aria-hidden="true"></span>`).join('')
    + '<span class="water-label shoal" aria-hidden="true">shallows</span><span class="water-label deep" aria-hidden="true">deep water</span>';
  const markers = L.placed.map(({ p, x, lane }) => {
    const lead = scored && t[p.id].total === top && top > 0;
    const d = showDelta ? t[p.id].rounds[S.deltaRound] : null;
    const edge = x < 12 ? 'edge-l' : x > 88 ? 'edge-r' : '';
    return `<div class="marker ${p.id === me() ? 'me' : ''} ${lead ? 'lead' : ''} ${edge}" data-id="${p.id}" style="--x:${x.toFixed(2)}%;--lane:${lane}">
      <span class="stem"></span>
      <span class="tag">${lead ? icon('crown', 'crown') : ''}${flag(p.id)}${compact ? '' : esc(p.name.slice(0, 8)) + ' '}<b>${plain(t[p.id].total)}</b>
        ${d != null ? `<span class="delta ${d >= 0 ? 'good-t' : 'bad-t'}" style="animation-delay:-${elapsed}ms">${signed(d)}</span>` : ''}</span></div>`;
  }).join('');
  return `<div class="standings ${compact ? 'compact' : ''}" role="img" aria-label="Standings: ${esc(ranking(g).map(r => `${r.name} ${plain(r.total)}${scored && r.total === top && top > 0 ? ' (in the lead)' : ''}`).join(', '))}">
    <div class="lanes" style="--lanes:${L.lanes}">${bands}${markers}</div><div class="scale">${ticks}</div></div>`;
}

// Round-scored card: your result first (the "nailed it" moment), then everyone's round.
function lastRoundBanner(g) {
  const r = g.round - 1;
  if (r < 1 || g.phase !== 'bidding' || (g.bids?.[g.round] && Object.keys(g.bids[g.round]).length)) return '';
  const t = totals(g), mine = me();
  const lines = roundHighlights(g, r, name);
  const myScore = mine ? t[mine].rounds[r] : null;
  const myBid = mine ? g.bids?.[r]?.[mine] : null, myTricks = mine ? g.results?.[r]?.[mine]?.tricks : null;
  const nailed = mine && myBid != null && myBid === myTricks;
  const outcome = !mine ? '' : `<div class="outcome">${icon(nailed ? 'check' : 'target', 'crownmark')}
      <div class="what">${nailed ? (myBid === 0 ? 'Zero bid nailed' : 'Bid nailed') : `Missed by ${Math.abs((myTricks ?? 0) - (myBid ?? 0))}`}
        <small>Bid ${myBid ?? '–'} · won ${myTricks ?? '–'}${g.cannon?.[r]?.[mine] ? ' · Cannonball' : ''}</small></div>
      <span class="big" data-count="${myScore}" data-key="${S.code}:${r}">${signed(myScore)}</span></div>`;
  const rows = sortedPlayers(g).filter(p => p.id !== mine).map(p =>
    `<span>${flag(p.id)}${esc(p.name)} <b class="${t[p.id].rounds[r] >= 0 ? 'good-t' : 'bad-t'}">${signed(t[p.id].rounds[r])}</b></span>`).join('');
  return `<div class="card scored ${mine ? (nailed ? 'nailed' : myScore < 0 || (g.scoring === 'rascal' && myScore === 0) ? 'missed' : '') : ''}">
    ${mine ? '' : `<h2 class="t3">Round ${r} scored</h2>`}${outcome}
    ${rows ? `<div class="round-row">${mine ? `<span>Round ${r}:</span>` : ''}${rows}</div>` : ''}
    ${lines.length ? `<ul class="hl">${lines.map(l => `<li>${icon(l.icon)}<span>${esc(l.text)}</span></li>`).join('')}</ul>` : ''}
    ${undoCard(g)}</div>`;
}
function undoCard(g) {
  const u = lastUndo(g);
  return u ? `<button class="link" data-act="undo">${icon('undo', 'sm')}${esc(u.label.replace(/^[↶←]\s*/, ''))}</button>` : '';
}

function biddingView(g) {
  const r = g.round, bids = g.bids?.[r] || {}, mine = me();
  const ps = sortedPlayers(g);
  const waiting = ps.filter(p => bids[p.id] == null).length;
  const cannon = !!g.cannon?.[r]?.[mine];
  const locked = mine && bids[mine] != null && !S.changing;
  const teach = g.scoring === 'rascal'
    ? 'Your bid is how many tricks you think you’ll win this round.'
    : `Your bid is how many tricks you think you’ll win. Exactly right: +20 each (zero bid: +${10 * r}). Off: −10 per trick.`;
  const card = !mine ? '' : locked ? `<div class="card locked-card">
      <div class="locked-row">${icon('check', 'big-check')}<div><h2 class="t3" style="margin:0">Bid is in</h2>
        <p class="muted small" style="margin:2px 0 0">Hidden until everyone has bid. Tap or hold Peek to check it${g.scoring === 'rascal' ? (cannon ? ' · Cannonball' : ' · Grapeshot') : ''}.</p></div></div>
      <div class="row-btns"><button class="btn peek" data-act="noop" data-peek="${bids[mine]}" aria-label="Peek at your bid">Peek</button>
        <button class="btn" data-act="change-bid">Change</button></div></div>`
    : `<div class="card action">
    <h2 class="t3">${S.actingFor ? esc(name(mine)) + "'s" : 'Your'} bid · ${r} card${r > 1 ? 's' : ''}</h2>
    <p class="muted small" style="margin:0">${teach} <button class="link inline" data-act="rules">How scoring works</button></p>
    <div class="bid-grid">${Array.from({ length: r + 1 }, (_, n) => `<button data-act="bid" data-n="${n}" class="${bids[mine] === n ? 'on' : ''}" aria-pressed="${bids[mine] === n}">${n}</button>`).join('')}</div>
    ${g.scoring === 'rascal' ? `<div class="seg wager" role="radiogroup" aria-label="Rascal wager">
      <button type="button" role="radio" aria-checked="${!cannon}" class="${!cannon ? 'on' : ''}" data-act="cannon" data-v="0"><b>${icon('target', 'sm')}Grapeshot</b><span>${10 * r} pts · half if off by 1</span></button>
      <button type="button" role="radio" aria-checked="${cannon}" class="${cannon ? 'on' : ''}" data-act="cannon" data-v="1"><b>${icon('cannon', 'sm')}Cannonball</b><span>${15 * r} pts · all or nothing</span></button>
    </div>` : ''}
  </div>`;
  const banner = lastRoundBanner(g);
  return `
  ${standingsLine(g, { full: !!banner })}
  ${banner}
  ${card}
  <div class="section-h"><h2 class="t3">${waiting ? `Waiting for ${waiting}` : 'Revealing'}</h2><span>${ps.length - waiting} of ${ps.length} in</span></div>
  <div class="board" style="--cols:${tableCols(ps.length)}">
    ${ps.map(p => `<div class="prow ${p.id === mine ? 'me' : ''}" style="--crew:${color(p.id)}">${flag(p.id)}
      <div class="who"><b><span class="nm">${esc(p.name)}</span>${roleBadges(g, r, p.id)}</b></div>
      ${bids[p.id] != null ? `<span class="chip lock">${icon('check')}In</span>` : nudgeChip(p.id, mine)}
      <span></span></div>`).join('')}${tableFill(ps.length)}
  </div>`;
}

// Table screen: balanced columns for the crew grid, plus filler cells so every rule lines up.
function tableCols(n) { return n <= 4 ? 2 : n <= 6 ? 3 : 4; }
function tableFill(n) {
  if (S.seat !== 'watch') return '';
  const c = tableCols(n), rem = n % c;
  return rem ? '<div class="prow fill" aria-hidden="true"></div>'.repeat(c - rem) : '';
}

// "thinking…" chip that buzzes that player's phone when tapped.
function nudgeChip(pid, mine) {
  if (pid === mine || S.seat === pid) return '<span></span>';
  return `<button class="chip nudge" data-act="nudge" data-id="${pid}" aria-label="Nudge ${esc(name(pid))}">${icon('bell')}Nudge</button>`;
}

// ---------- playing ----------
function boardRows(g, r, { showLive }) {
  const bids = g.bids?.[r] || {}, live = g.live?.[r] || {}, t = totals(g), mine = me();
  return sortedPlayers(g).map((p, i) => {
    const bid = bids[p.id], got = live[p.id] || 0, st = liveStatus(bid, got);
    const chip = !showLive ? '' : {
      need: `<span class="chip">${got} of ${bid}</span>`,
      on: `<span class="chip good">${icon('check')}${got} of ${bid}</span>`,
      bust: `<span class="chip bad">${icon('x')}${got} of ${bid}</span>`,
      safe0: `<span class="chip sk">Zero bid · none won</span>`,
      bust0: `<span class="chip bad">${icon('x')}Zero · ${got} won</span>`, none: '',
    }[st];
    return `<div class="prow ${p.id === mine ? 'me' : ''}" style="--crew:${color(p.id)}">${flag(p.id)}
      <div class="who"><b><span class="nm">${esc(p.name)}</span>${roleBadges(g, r, p.id)}</b><span>Bid <b>${bid ?? '–'}</b>${g.cannon?.[r]?.[p.id] ? ` ${icon('cannon', 'sm')}` : ''}</span></div>
      ${chip}<span class="total">${plain(t[p.id].total)}</span></div>`;
  }).join('') + tableFill(sortedPlayers(g).length);
}

function playingView(g) {
  const r = g.round, live = g.live?.[r] || {}, bids = g.bids?.[r] || {}, mine = me(), ps = sortedPlayers(g);
  const destroyed = g.destroyed?.[r] || 0;
  const played = Object.values(live).reduce((a, b) => a + b, 0) + destroyed;
  const done = played >= r;
  const canDestroy = g.expansions?.kraken || g.expansions?.whale;
  const watch = S.seat === 'watch' && !S.actingFor;
  const hint = bidHint(g, r);
  const myGot = mine ? live[mine] || 0 : 0, myBid = mine ? bids[mine] : null;
  // The reveal: every bid flips up at once, then stays as the round's reference strip.
  const strip = `<div class="bids-strip ${S.revealAnim ? 'reveal' : ''}" role="group" aria-label="Bids this round">
    ${ps.map((p, i) => `<span class="bid-cell ${p.id === mine ? 'me' : ''}" style="--i:${i}" role="img" aria-label="${esc(p.name)} bid ${bids[p.id] ?? 'none'}${g.cannon?.[r]?.[p.id] ? ', Cannonball' : ''}">${flag(p.id)}<b>${bids[p.id] ?? '–'}</b>${g.cannon?.[r]?.[p.id] ? icon('cannon', 'sm') : ''}<small>${esc(p.name.slice(0, 7))}</small></span>`).join('')}
  </div>`;
  return `
  ${standingsLine(g, { full: S.revealAnim })}
  <div class="card ${mine && !done ? 'action' : ''} play-card">
    ${watch ? `<div class="progress" style="margin-bottom:12px"><span class="muted">Tricks played</span><b>${played}<span> / ${r}</span></b></div>` : ''}
    ${strip}
    ${hint ? `<p class="verdict ${played === 0 ? 'loud' : ''}">${icon(hint.icon, played === 0 ? '' : 'sm')}<span>${esc(hint.text)}</span></p>` : ''}
    ${mine ? `<div class="mine-line"><span class="muted">${S.actingFor ? esc(name(mine)) + "'s" : 'Your'} tricks</span>
      <b>${myGot}<span> of ${myBid ?? '–'}</span></b></div>
    <div class="counter">
      <button class="btn minus" data-act="live" data-d="-1" ${myGot <= 0 ? 'disabled' : ''} aria-label="Remove a trick">${icon('minus')}</button>
      <button class="btn primary plus" data-act="live" data-d="1" ${done ? 'disabled' : ''}>${icon('plus')}${S.actingFor ? esc(name(mine)) : 'I'} won a trick</button>
    </div>` : ''}
    ${watch ? `<p class="table-line small muted">${esc(name(leaderFor(g, r)))} leads every trick</p>`
      : `<p class="table-line small muted">Table: <b class="sounding">${played}</b> of ${r} trick${r > 1 ? 's' : ''} played · ${esc(name(leaderFor(g, r)))} leads every trick</p>`}
  </div>
  ${canDestroy && !watch && (me() === dealerFor(g, r)) ? `<div class="card quiet destroy"><span class="small">${icon('kraken', 'sm')}Destroyed by Kraken / White Whale: <b class="sounding">${destroyed}</b></span>
    <span><button class="icon-btn outline" data-act="destroy" data-d="-1" ${destroyed <= 0 ? 'disabled' : ''} aria-label="One fewer destroyed trick">${icon('minus')}</button>
    <button class="icon-btn outline" data-act="destroy" data-d="1" ${done || destroyed >= 2 ? 'disabled' : ''}>${icon('plus')}Destroyed</button></span></div>` : ''}
  <div class="board" style="--cols:${tableCols(ps.length)}">${boardRows(g, r, { showLive: true })}</div>
  ${watch ? '' : `<button class="btn ${done ? 'primary' : ''}" style="margin-top:16px" data-act="to-results">${done ? 'Round over: check results' : 'Round over'}</button>
  <button class="link" data-act="fix-bids">Fix a bid</button>`}`;
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
    <div class="ctl"><button type="button" data-act="${act}" data-k="${key}" data-d="-1" ${val <= 0 ? 'disabled' : ''} aria-label="Less ${plain}">${icon('minus')}</button>
    <output>${val}</output><button type="button" data-act="${act}" data-k="${key}" data-d="1" ${val >= max ? 'disabled' : ''} aria-label="More ${plain}">${icon('plus')}</button></div></div>`;
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
      : `<button class="link" data-act="open-bonus">${icon('plus', 'sm')}<span>Add bonuses: 14s you captured, Pirates, Mermaids or the Skull King you caught${g.expansions?.loot ? ', Loot' : ''}</span></button>`}
    ${open && !made ? `<p class="small muted" style="margin:4px 0 0">${g.scoring === 'rascal' && !g.cannon?.[r]?.[pid] && Math.abs((d.tricks ?? 0) - bid) === 1 ? 'Off by one: half of everything, bonuses included.' : 'Bonuses only count when the bid is made.'}</p>` : ''}
    <div class="preview"><span class="muted">This round</span><b class="${score >= 0 ? 'good-t' : 'bad-t'}">${score == null ? '–' : signed(score)}</b></div>
    <button class="btn ${confirmed ? '' : 'primary'}" style="margin-top:12px" data-act="confirm" ${confirmed ? 'disabled' : ''}>${confirmed ? `${icon('check')}Confirmed` : 'Confirm'}</button>
    ${confirmed ? '' : `<p class="small muted" style="margin:8px 2px 0">No bonuses? You can skip this: your trick count is already in.</p>`}`;
}

function resultsView(g) {
  const r = g.round, mine = me(), eff = effectiveResults(g, r), ps = sortedPlayers(g);
  const n = tricksInRound(g, r), destroyed = g.destroyed?.[r] || 0;
  const allIn = ps.every(p => eff[p.id]);
  const sum = ps.reduce((s, p) => s + (eff[p.id]?.tricks || 0), 0);
  const inCount = ps.filter(p => eff[p.id]).length;
  const t = totals(g), watch = S.seat === 'watch' && !S.actingFor;
  const myPending = mine && (!g.results?.[r]?.[mine] || S.drafts[`${r}:${mine}`]);
  // Score is the table's action: quiet while your own card still needs you, magenta once the counts reconcile.
  const ready = allIn && sum === n;
  const status = !allIn ? `${inCount} of ${ps.length} in · waiting on ${ps.filter(p => !eff[p.id]).map(p => esc(p.name)).join(', ')}`
    : sum === n ? `${ps.length} of ${ps.length} in · tricks add up` : `${ps.length} of ${ps.length} in · tricks don't add up`;
  const srcLabel = e => !e ? 'waiting' : e.src === 'confirmed' ? 'confirmed' : e.src === 'live' ? 'from taps' : 'auto-filled';
  return `
  ${standingsLine(g)}
  ${mine ? `<div class="card ${myPending ? 'action' : ''}"><h2 class="t3">${S.actingFor ? esc(name(mine)) + "'s" : 'Your'} round ${r}</h2>${resultForm(g, r, mine)}</div>` : ''}
  <div class="section-h"><h2 class="t3">Round ${r} results</h2><span>Totals after this round</span></div>
  <div class="board" style="--cols:${tableCols(ps.length)}">
    ${ps.map(p => {
      const e = eff[p.id], bid = g.bids?.[r]?.[p.id], s = e ? scoreFor(g, r, p.id, e) : null;
      const made = e && bid === e.tricks;
      return `<div class="prow ${p.id === mine ? 'me' : ''}" style="--crew:${color(p.id)}">${flag(p.id)}
        <div class="who"><b><span class="nm">${esc(p.name)}</span></b><span>Bid <b>${bid ?? '–'}</b>${g.cannon?.[r]?.[p.id] ? ` ${icon('cannon', 'sm')}` : ''} · won <b>${e ? e.tricks : '–'}</b> · ${srcLabel(e)}</span></div>
        ${e ? `<span class="chip ${made ? 'good' : s > 0 ? '' : 'bad'}">${made ? icon('check') : s > 0 ? '' : icon('x')}${signed(s)}</span>` : nudgeChip(p.id, mine)}
        <span class="total">${plain(t[p.id].total + (s || 0))}</span></div>`;
    }).join('')}${tableFill(ps.length)}
  </div>
  ${(g.expansions?.kraken || g.expansions?.whale) && !watch && me() === dealerFor(g, r) ? `<div class="card quiet destroy"><span class="small">${icon('kraken', 'sm')}Destroyed by Kraken / White Whale: <b class="sounding">${destroyed}</b></span>
    <span><button class="icon-btn outline" data-act="destroy" data-d="-1" ${destroyed <= 0 ? 'disabled' : ''} aria-label="One fewer destroyed trick">${icon('minus')}</button>
    <button class="icon-btn outline" data-act="destroy" data-d="1" ${destroyed >= 2 ? 'disabled' : ''}>${icon('plus')}Destroyed</button></span></div>` : ''}
  ${allIn && sum !== n ? `<div class="warnbox">${icon('x')}<span>The tricks add up to ${sum}, but ${n} ${n === 1 ? 'was' : 'were'} won this round${destroyed ? ` (${r} played, ${destroyed} destroyed)` : ''}. Check the "won" numbers above; tap a player's chip in Scores to fix it later.</span></div>` : ''}
  ${watch ? '' : `<div class="dock"><p class="status-line ${ready ? 'ok' : ''}">${icon(ready ? 'check' : 'bell', 'sm')}<span>${status}</span></p>
  <button class="btn ${ready && !myPending ? 'primary' : ''}" data-act="score" ${allIn ? '' : 'disabled'}>${allIn && sum !== n ? 'Score anyway' : r === ROUNDS ? 'Score final round' : `Score round ${r}`}</button></div>`}`;
}

// ---------- done ----------
// Each player's line gets its own dash pattern and ends on their flag, so it never relies on colour.
const DASHES = ['', '7 4', '2 4', '10 3 2 3', '4 3', '12 4', '1 3', '6 2 2 2'];
function chartSVG(g) {
  const t = totals(g), ps = sortedPlayers(g), n = ROUNDS;
  const vals = ps.flatMap(p => [0, ...t[p.id].running]);
  const lo = Math.min(0, ...vals), hi = Math.max(10, ...vals);
  const W = 340, H = 200, L = 34, R = 24, T = 12, B = 22;
  const x = i => L + (i / n) * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const step = Math.max(50, Math.ceil((hi - lo) / 4 / 50) * 50);
  let grid = '';
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid += `<line class="${v === 0 ? 'zero' : 'grid'}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 4}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  for (let i = 1; i <= n; i++) grid += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${i}</text>`;
  const lines = ps.map(p => {
    const o = p.order % 8, run = [0, ...t[p.id].running];
    const pts = run.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const ex = x(run.length - 1), ey = y(run[run.length - 1]);
    return `<polyline points="${pts}" fill="none" stroke="${color(p.id)}" stroke-width="2.25" stroke-dasharray="${DASHES[o]}" stroke-linejoin="round" stroke-linecap="round"/>
      ${markSVG(p.id, +(ex + 3).toFixed(1), +(ey - 7).toFixed(1), 14)}`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Running totals by round: ${esc(ranking(g).map(r => `${r.name} ${r.total}`).join(', '))}">${grid}${lines}</svg>
    <div class="legend">${ps.map(p => `<span><svg class="dash" viewBox="0 0 24 4" aria-hidden="true"><line x1="1" y1="2" x2="23" y2="2" stroke="${color(p.id)}" stroke-width="2.25" stroke-dasharray="${DASHES[p.order % 8]}" stroke-linecap="round"/></svg>${flag(p.id)}${esc(p.name)}</span>`).join('')}</div>`;
}

// Everyone gets their own ending, not just the winner.
function personalLine(g) {
  const mine = S.seat && S.seat !== 'watch' ? S.seat : null;
  if (!mine || !g.players[mine]) return '';
  const p = playerSummary(g, mine), ord = n => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
  const line = p.place === 1 ? 'You won the voyage' : `You finished ${ord(p.place)}`;
  return `<div class="card personal">${flag(mine)}<div><b>${line}</b>
    <span>Best round ${p.best ? `${signed(p.best.score)} (round ${p.best.round})` : '–'} · ${p.made}/${p.played} bids made</span></div></div>`;
}

function doneView(g) {
  const rank = ranking(g), lines = gameHighlights(g, name);
  const tops = rank.filter(r => r.place === 1);
  const hero = tops.map(r => `<span class="hero-flag">${icon('crown', 'hero-crown')}${flag(r.id)}</span>`).join('');
  return `
  <section class="winner ${S.finalAnim ? 'arrive' : ''}">
    <div class="hero-flags"><svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><use href="#i-skull"/></svg>${hero}</div>
    <h1>${tops.map(r => esc(r.name)).join(' & ')} win${tops.length > 1 ? '' : 's'}</h1>
    <p class="final-total"><b data-count="${tops[0].total}" data-key="${S.code}:final" data-plain="1">${plain(tops[0].total)}</b> after 10 rounds · ${esc(rulesLine(g))}</p>
  </section>
  ${personalLine(g)}
  ${standingsLine(g, { full: true })}
  <div class="board podium" style="margin-top:8px">
    ${rank.map(r => `<div class="prow ${r.id === S.seat ? 'me' : ''}" style="--crew:${color(r.id)}"><span class="place">${r.place}</span>${flag(r.id)}<div class="who"><b><span class="nm">${esc(r.name)}</span>${r.place === 1 ? icon('crown', 'sm') : ''}</b></div><span class="total">${plain(r.total)}</span></div>`).join('')}
  </div>
  ${lines.length ? `<div class="card"><h2 class="t3">Hall of fame</h2><ul class="hl">${lines.map(l => `<li>${icon(l.icon)}<span>${esc(l.text)}</span></li>`).join('')}</ul></div>` : ''}
  <div class="card"><h2 class="t3">The voyage</h2>${chartSVG(g)}</div>
  <button class="btn primary" data-act="rematch">Rematch, same crew</button>
  <button class="btn" data-act="scores">${icon('chart')} Round-by-round table</button>
  <button class="btn ghost" data-act="home">Home</button>
  ${undoCard(g)}`;
}

// ---------- sheets ----------
function renderSheet() {
  const s = S.sheet;
  if (!s || (s.kind !== 'rules' && !S.game)) {
    const wasOpen = !$sheet.hidden;
    $sheet.hidden = true; $sheet.innerHTML = '';
    if (wasOpen && S.opener?.isConnected) S.opener.focus({ preventScroll: true });
    S.opener = null;
    return;
  }
  const body = { scores: scoresSheet, menu: menuSheet, rules: rulesSheet, edit: editSheetWrapper, actfor: actForSheet, share: shareSheet, bidpick: bidPickSheet }[s.kind]?.(s) || '';
  const title = { scores: 'Scores', menu: 'Menu', rules: 'Rules & scoring', edit: s.bidOnly ? 'Fix a bid' : `Edit round ${s.r}`, actfor: 'Enter for…', share: `Game ${S.code}`, bidpick: 'Fix whose bid?' }[s.kind];
  $sheet.hidden = false;
  const opening = $sheet.hidden;
  $sheet.innerHTML = `<div class="panel" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="head"><h2 tabindex="-1">${esc(title)}</h2><button class="icon-btn outline" data-act="close" aria-label="Close">${icon('close')}</button></div>${body}</div>`;
  if (s.kind === 'share') drawQR();
  if (opening) { S.opener = document.activeElement; $sheet.querySelector('h2')?.focus(); }
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
  <div class="tbl-wrap"><table class="scores"><thead><tr><th>#</th>${ps.map(p => `<th>${flag(p.id)}${esc(p.name)}</th>`).join('')}</tr></thead>
  <tbody>${rows}</tbody><tfoot><tr><td></td>${ps.map(p => `<td>${plain(t[p.id].total)}</td>`).join('')}</tr></tfoot></table></div>`;
}

function editSheet(s) {
  const g = S.game, key = `${s.r}:${s.id}`;
  const d = S.drafts[key] ||= { ...(g.results?.[s.r]?.[s.id] || { tricks: 0 }) };
  const bid = s.bid ?? g.bids?.[s.r]?.[s.id] ?? 0;
  const cannon = s.cannon ?? !!g.cannon?.[s.r]?.[s.id];
  const score = roundScore(s.r, bid, d, { mode: g.scoring, cannon });
  return `<p style="margin-top:0;display:flex;gap:8px;align-items:center">${flag(s.id)}<b>${esc(name(s.id))}</b></p>
    ${stepper('edit-bid', 'bid', 'Bid', '', bid, s.r)}
    ${g.scoring === 'rascal' ? `<div class="seg" style="margin:6px 0" role="radiogroup" aria-label="Rascal wager">
      <button type="button" role="radio" aria-checked="${!cannon}" class="${!cannon ? 'on' : ''}" data-act="edit-cannon" data-v="0"><b>Grapeshot</b></button>
      <button type="button" role="radio" aria-checked="${cannon}" class="${cannon ? 'on' : ''}" data-act="edit-cannon" data-v="1"><b>${icon('cannon', 'sm')}Cannonball</b></button></div>` : ''}
    ${stepper('edit-draft', 'tricks', 'Tricks won', '', d.tricks ?? 0, s.r)}
    ${bonusKeys(g).map(k => stepper('edit-draft', k, `${BONUS[k].label} <span class="muted small">+${BONUS[k].pts}</span>`, '', d[k] || 0, BONUS[k].max)).join('')}
    <div class="preview"><span class="muted">Round ${s.r}</span><b class="${score >= 0 ? 'good-t' : 'bad-t'}">${signed(score ?? 0)}</b></div>
    <button class="btn primary" style="margin-top:12px" data-act="save-edit">Save</button>`;
}

function menuSheet() {
  const g = S.game, u = lastUndo(g);
  return `<div class="menu-list">
    <button data-act="open-actfor">${icon('users')}Enter for another player</button>
    <button data-act="share">${icon('share')}Invite players (code &amp; QR)</button>
    <button data-act="rules">${icon('book')}Rules &amp; scoring</button>
    ${u ? `<button data-act="undo">${icon('undo')}${esc(u.label.replace(/^[↶←]\s*/, ''))}</button>` : ''}
    ${S.seat !== 'watch' ? `<button data-act="change-crew">${avatarOf(S.seat) ? avatarTile(avatarOf(S.seat), 'menu-ava') : icon('users')}Change character</button>` : ''}
    <button data-act="change-seat">${icon('swap')}Switch player on this phone</button>
    ${S.seat !== 'watch' ? `<button data-act="table-mode">${icon('screen')}Use as the table scoreboard</button>` : ''}
    <button data-act="home">${icon('exit')}Leave game (it keeps going)</button>
  </div>
  <p class="small muted" style="margin:12px 2px 0">You are ${S.seat === 'watch' ? 'the table screen' : `<b>${esc(name(S.seat))}</b>`}. ${esc(rulesLine(g))}. ${S.store.live ? 'Live sync on.' : 'Local mode: this device only.'}</p>`;
}

function actForSheet() {
  return `<p class="small muted" style="margin-top:0">For when someone's phone is dead or away. Your screen will act as them until you tap Done.</p>
  <div class="seat-list">${sortedPlayers(S.game).filter(p => p.id !== S.seat).map(p =>
    `<button class="btn" data-act="act-as" data-id="${p.id}">${flag(p.id)}${esc(p.name)}</button>`).join('')}</div>`;
}

function shareSheet() {
  return `<div class="share"><div class="big-code">${esc(S.code)}</div><div class="qr" id="qr"></div>
    <div class="row-btns"><button class="btn" data-act="copy-link">${icon('link')} Copy link</button>${navigator.share ? `<button class="btn" data-act="native-share">${icon('share')} Share</button>` : ''}</div></div>`;
}

function rulesSheet() {
  return `<div class="rules">
  ${S.game ? `<p class="note" style="margin-top:0">This game: ${esc(rulesLine(S.game))}</p>` : ''}
  <h2 class="t3">Scoring</h2>
  <table>
    <tr><td>Bid 1+ and hit it exactly</td><td>+20 per trick</td></tr>
    <tr><td>Bid 1+ and miss</td><td>−10 per trick off</td></tr>
    <tr><td>Bid 0 and take no tricks</td><td>+10 × round</td></tr>
    <tr><td>Bid 0 and take any trick</td><td>−10 × round</td></tr>
  </table>
  <h2 class="t3">Bonus points <span>only if your bid is made</span></h2>
  <table>
    <tr><td>Each yellow, purple or green 14 in your tricks</td><td>+10</td></tr>
    <tr><td>Black 14 in your tricks</td><td>+20</td></tr>
    <tr><td>Each Mermaid captured by your Pirate</td><td>+20</td></tr>
    <tr><td>Each Pirate captured by your Skull King</td><td>+30</td></tr>
    <tr><td>Skull King captured by your Mermaid</td><td>+40</td></tr>
  </table>
  <h2 class="t3">Who wins a trick</h2>
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
  <h2 class="t3">Rascal scoring <span>optional</span></h2>
  <ul>
    <li>Every round is worth 10 points per card dealt, whatever you bid.</li>
    <li>Hit your bid: all of it plus bonuses. Off by one: half of everything. Off by more: nothing.</li>
    <li>Cannonball: reveal it with your bid. 15 points per card if exact, nothing otherwise.</li>
  </ul>
  <h2 class="t3">Expansion cards <span>optional</span></h2>
  <ul>
    <li>Kraken: the trick is destroyed and nobody wins it. Whoever would have won leads next.</li>
    <li>White Whale: special cards lose their power; the highest number wins, any suit. If only special cards were played, the trick is destroyed and the Whale's player leads.</li>
    <li>If both the Kraken and the White Whale land in one trick, the second one played counts.</li>
    <li>Loot: plays like an Escape. Whoever wins the trick forms an alliance with the Loot's player: if both make their bids, each gets +20.</li>
  </ul>
  <h2 class="t3">Rounds</h2>
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
    toast(`Nudged ${name(el.dataset.id)}`);
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
  noop() {},
  'pick-crew'(el) {
    const id = el.dataset.c;
    S.picking = false;
    update({ [`players/${S.seat}/avatar`]: id });
    toast(`${name(S.seat)} sails as ${id === 'skullking' ? 'the Skull King' : `the ${CREW[id].name}`}`);
  },
  'crew-done'() { S.picking = false; render(); },
  'crew-skip'() { (S.skipPick ||= {})[S.code] = true; S.picking = false; render(); },
  'change-crew'() { S.sheet = null; S.picking = true; render(); window.scrollTo(0, 0); },
  'change-bid'() { S.changing = true; render(); document.querySelector('[data-act="bid"].on')?.focus(); },
  bid(el) {
    const g = S.game, r = g.round, who = me();
    if (g.phase !== 'bidding' || !who) return;
    S.changing = false;
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
    toast(`Round ${r} scored`, { label: 'Undo', run: () => actions.undo() });
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
    const champion = ranking(g)[0].id;
    // Characters carry over; the Skull King is only kept by the new champion.
    const avatars = Object.fromEntries(ps.map(p => [p.id, p.avatar]).filter(([pid, a]) => CREW[a] && (a !== 'skullking' || pid === champion)));
    await createGame(ps.map(p => p.name), (firstIdx + 1) % ps.length, { scoring: g.scoring, exp: g.expansions, champion, avatars });
    // Carry this phone's seat into the new game (same player ids p0..pN), and point the old game at it.
    const code = location.hash.slice(1);
    if (prevSeat) saveSeat(code, prevSeat);
    S.store.update(oldCode, { next: code });
  },
};

// "Fix a bid" during play: pick a player, then a bid-only edit sheet.
function bidPickSheet() {
  const g = S.game;
  return `<div class="seat-list">${sortedPlayers(g).map(p => `<button class="btn" data-act="fix-pick" data-id="${p.id}">${flag(p.id)}${esc(p.name)}<span class="chip tag">Bid ${g.bids?.[g.round]?.[p.id] ?? '–'}</span></button>`).join('')}</div>`;
}

// The edit sheet hides tricks/bonuses for bid-only fixes.
function editSheetWrapper(s) {
  if (!s.bidOnly) return editSheet(s);
  const bid = s.bid ?? S.game.bids?.[s.r]?.[s.id] ?? 0;
  return `<p style="margin-top:0;display:flex;gap:8px;align-items:center">${flag(s.id)}<b>${esc(name(s.id))}</b> · round ${s.r}</p>
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
// Peek at your own hidden bid: hold to see it, or tap to show it for 3 seconds.
// Works by keyboard too (Enter/Space toggles), and the bid is announced for screen readers.
let peekT = null, peekDown = 0;
function peekShow(b) {
  clearTimeout(peekT);
  b.textContent = `Your bid: ${b.dataset.peek}`; b.classList.add('on');
  b.setAttribute('aria-label', `Your bid is ${b.dataset.peek}`);
  announce(`Your bid is ${b.dataset.peek}`);
}
function peekHide() {
  clearTimeout(peekT);
  document.querySelectorAll('.peek.on').forEach(b => { b.textContent = 'Peek'; b.classList.remove('on'); b.setAttribute('aria-label', 'Peek at your bid'); });
}
document.addEventListener('pointerdown', e => { const b = e.target.closest('.peek'); if (b) { peekDown = Date.now(); peekShow(b); } });
document.addEventListener('pointerup', () => {
  if (!peekDown) return;
  const quick = Date.now() - peekDown < 350; peekDown = 0;
  if (quick) peekT = setTimeout(peekHide, 3000); else peekHide();
});
document.addEventListener('pointercancel', () => { peekDown = 0; peekHide(); });
document.addEventListener('keydown', e => {
  const b = (e.key === ' ' || e.key === 'Enter') && e.target.closest?.('.peek');
  if (!b) return;
  e.preventDefault();
  if (b.classList.contains('on')) peekHide(); else { peekShow(b); peekT = setTimeout(peekHide, 3000); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.sheet) actions.close();
  if (e.key === 'Tab' && !$sheet.hidden) {
    const f = [...$sheet.querySelectorAll('button:not([disabled]), input, [tabindex="0"]')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!$sheet.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

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
