import { openStore, OLD_GAME_MS } from './store.js';
import { CREW, CREW_IDS, spriteSVG, spriteRects } from './avatars.js';
import {
  ROUNDS, BONUS, bonusKeys, roundScore, scoreFor, sortedPlayers, dealerFor, leaderFor, totals, ranking,
  autoFillTricks, liveStatus, roundHighlights, tricksInRound, bidHint, playerSummary, plain,
  playersIn, playsIn, awards,
} from './scoring.js';
import { t, tn, ordinal, LANGS, getLang, setLang } from './i18n.js';
import { crewGames, gameRows, champion as crewChampion, leaderboard, playerStats, records, pastSeasons, usualSeating, memberGames } from './crew.js';

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
const randomCode = n => Array.from(crypto.getRandomValues(new Uint32Array(n)), x => CODE_CHARS[x % CODE_CHARS.length]).join('');
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
// This phone's player, if they are dealt in to round r (they may join later or have left).
const meIn = (g, r) => { const m = me(); return m && playsIn(g.players?.[m], r) ? m : null; };
// Gone from the table: removed, or left before the current round.
const gone = (g, p) => p.left != null && p.left <= (g.phase === 'done' ? g.round + 1 : g.round);

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
    toast(t('{name} is now playing on another phone', { name: name(seat) }));
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
  $toast.classList.toggle('top', S.game?.phase === 'playing');
  $toast.innerHTML = `<span>${esc(msg)}</span>${action ? `<button data-act="toast-action">${esc(action.label)}</button>` : ''}`;
  $toast.onclick = e => { if (e.target.dataset.act === 'toast-action') { action.run(); $toast.classList.remove('on'); } };
  $toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('on'), action ? 6000 : 2500);
}

// ---------- sound & vibration (WebAudio, unlocked by first tap; one switch per phone) ----------
let audio, noise;
document.addEventListener('pointerdown', () => { try { audio ||= new AudioContext(); audio.resume().catch(() => {}); } catch {} }, { once: false, passive: true });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') audio?.resume().catch(() => {}); });
S.sound = (() => { try { return localStorage.getItem('sk.sound') !== 'off'; } catch { return true; } })();
// Phones only allow vibration once someone has tapped the page.
const buzz = pattern => { if (S.sound && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(pattern); };
function tones(freqs, gap = .09, peak = .18) {
  if (!audio || !S.sound) return;
  const t0 = audio.currentTime;
  freqs.forEach((f, i) => {
    const o = audio.createOscillator(), g = audio.createGain(), at = t0 + i * gap;
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + .02);
    g.gain.exponentialRampToValueAtTime(.001, at + .5);
    o.connect(g).connect(audio.destination); o.start(at); o.stop(at + .55);
  });
}
const chime = () => tones([523.25, 659.25, 783.99, 1046.5]);
const fanfare = () => tones([783.99, 1046.5, 1318.5, 1568], .07, .16);
// A snare roll that swells for `dur` seconds and lands on a low thump and a splash.
function drumroll(dur) {
  if (!audio || !S.sound) return;
  if (!noise) {
    noise = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = audio.currentTime, hits = Math.round(dur * 26);
  const burst = (at, peak, len, type, freq) => {
    const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
    src.buffer = noise; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(peak, at); g.gain.exponentialRampToValueAtTime(.001, at + len);
    src.connect(f).connect(g).connect(audio.destination); src.start(at, Math.random() * .5); src.stop(at + len + .02);
  };
  for (let i = 0; i < hits; i++) burst(t0 + (i / hits) * dur, .04 + .22 * (i / hits) ** 2, .05, 'bandpass', 1900);
  const end = t0 + dur, o = audio.createOscillator(), g = audio.createGain();
  o.frequency.setValueAtTime(130, end); o.frequency.exponentialRampToValueAtTime(48, end + .25);
  g.gain.setValueAtTime(.5, end); g.gain.exponentialRampToValueAtTime(.001, end + .3);
  o.connect(g).connect(audio.destination); o.start(end); o.stop(end + .32);
  burst(end, .16, .6, 'highpass', 5000);
}
const DRUM_MS = 1100;
const BID_HOLD_MS = 2000;

// ---------- wake lock ----------
let wakeLock = null;
async function keepAwake() {
  if (!S.code || !('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch {}
}
document.addEventListener('visibilitychange', keepAwake);

// ---------- routing ----------
function route() {
  const raw = location.hash.slice(1);
  const crewMatch = raw.match(/^crew=([A-Za-z]{5})$/);
  const code = crewMatch ? '' : (raw || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  S.crewCode = crewMatch ? crewMatch[1].toUpperCase() : null;
  if (S.crewCode) watchCrew(S.crewCode);
  if (code === S.code && (S.code || !S.crewCode)) return render();
  S.unsub?.(); S.unsub = null;
  S.code = code.length === 4 ? code : null;
  if (S.claimed && S.code) S.store.release(S.code, S.claimed).catch(() => {});
  S.changing = false;
  S.game = undefined; S.actingFor = null; S.drafts = {}; S.lastPhaseKey = null; S.sheet = null; S.claimed = null; S.nudgeSeen = null; S.prevX = {};
  renderSheet();
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
  if (g?.crew) watchCrew(g.crew);
  if (g) saveToCrew(prev, g);
  if (g) {
    const key = `${g.round}:${g.phase}`;
    S.revealAnim = !!(prev && prev.phase === 'bidding' && g.phase === 'playing' && prev.round === g.round);
    if (prev && prev.phase === 'results' && (g.phase === 'bidding' || g.phase === 'done') && (g.round !== prev.round || g.phase === 'done')) {
      S.deltaRound = prev.round; S.deltaUntil = Date.now() + 3400;
    }
    if (S.revealAnim) {
      // Drumroll with the bids face down, then they all flip together.
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const wait = still ? 0 : DRUM_MS, b = g.bids?.[g.round] || {};
      S.drumUntil = Date.now() + wait; S.flipPending = true;
      drumroll(wait / 1000);
      clearTimeout(S.drumTimer);
      S.drumTimer = setTimeout(() => {
        chime(); buzz(60); render();
        if (tvMode()) setTimeout(render, 4500);   // the TV holds the flipped cards, then settles to the grid
        announce(`${t('All bids in.')} ${playersIn(g, g.round).map(p => `${p.name} ${b[p.id]}`).join(', ')}.`);
      }, wait);
    }
    if (S.deltaUntil > Date.now() && S.deltaRound && prev?.phase === 'results') {
      const tot = totals(g), r = S.deltaRound, mine = meIn(g, r), lead = ranking(g)[0];
      const nailed = mine && g.bids?.[r]?.[mine] === g.results?.[r]?.[mine]?.tricks;
      if (nailed && g.phase !== 'done') { fanfare(); buzz([40, 50, 40, 50, 160]); }
      announce(`${t('Round {r} scored.', { r })}${mine ? ` ${t('You {n}.', { n: signed(tot[mine].rounds[r]) })}` : ''} ${t('{name} is ahead with {n}.', { name: lead.name, n: plain(lead.total) })}`);
    }
    if (prev && prev.phase === 'playing' && g.phase === 'results' && prev.round === g.round) announce(t('Round {r} over: check your tricks and lock in.', { r: g.round }));
    S.finalAnim = !!(prev && prev.phase !== 'done' && g.phase === 'done');
    if (S.finalAnim) { chime(); buzz([80, 60, 80, 60, 240]); }
    S.lastPhaseKey = key;
    if (S.seat && S.seat !== 'watch' && !sortedPlayers(g).some(p => p.id === S.seat)) S.seat = null;
    // Rematch started on another phone: follow it, keeping this phone's seat.
    if (g.next && g.phase === 'done') {
      // The new game seats everyone still at the table as p0, p1… in seating order.
      const ps = sortedPlayers(g).filter(p => !gone(g, p)), i = ps.findIndex(p => p.id === S.seat);
      const seat = S.seat === 'watch' ? 'watch' : i >= 0 ? `p${i}` : null;
      if (seat) saveSeat(g.next, seat);
      location.hash = g.next;
      return;
    }
    syncPresence(g);
    checkNudge(g);
    // "Score before everyone locks in?" is open but everyone just did: go ahead.
    if (S.ask?.score && (S.ask.score !== g.round || g.phase !== 'results')) setTimeout(() => actions.close(), 0);   // someone else scored
    else if (S.ask?.score === g.round) {
      const eff = effectiveResults(g, g.round);
      if (playersIn(g, g.round).every(p => eff[p.id]?.src === 'confirmed')) setTimeout(() => actions['ask-yes'](), 0);
    }
    maybeReveal(g);
    maybeResults(prev, g);
    // If another phone changed this player's saved round (entering for them), their copy wins.
    for (const key of Object.keys(S.drafts)) {
      const [r, pid] = key.split(':'), saved = g.results?.[r]?.[pid], mineNow = JSON.stringify(S.drafts[key]);
      if (saved && JSON.stringify(saved) !== mineNow && JSON.stringify(prev?.results?.[r]?.[pid]) !== mineNow && JSON.stringify(prev?.results?.[r]?.[pid]) !== JSON.stringify(saved)) delete S.drafts[key];
    }
  }
  render();
}

// Someone tapped "Nudge" on this phone's player.
function checkNudge(g) {
  const seat = S.seat, ts = seat && seat !== 'watch' ? g.nudge?.[seat] : null;
  if (S.nudgeSeen === null) { S.nudgeSeen = ts || 0; return; }
  if (ts && ts > S.nudgeSeen) {
    S.nudgeSeen = ts;
    if (Date.now() - ts < 120000) {
      buzz([120, 60, 120]); chime();
      toast(t(g.phase === 'results' ? 'The crew is waiting for your tricks' : 'The crew is waiting for your bid'));
    }
  }
}

// Any phone flips bidding → playing once every bid is in (idempotent).
function maybeReveal(g) {
  if (g.phase !== 'bidding') return;
  const bids = g.bids?.[g.round] || {}, ps = playersIn(g, g.round);
  if (ps.length && ps.every(p => bids[p.id] != null)) update({ phase: 'playing' });
}

// The last trick of the round takes every phone to results. One phone does it so it happens
// once: the dealer's, or (if the dealer's phone isn't connected) the first connected seat.
// Only on a fresh tap (the count went up), so "Back to playing" isn't undone by itself.
function maybeResults(prev, g) {
  const r = g.round;
  if (g.phase !== 'playing' || prev?.phase !== 'playing' || prev.round !== r) return;
  if (tricksTapped(g, r) < r || tricksTapped(prev, r) >= r) return;
  const ps = playersIn(g, r), dealer = dealerFor(g, r);
  const driver = g.presence?.[dealer] ? dealer : ps.find(p => g.presence?.[p.id])?.id;
  if (!driver || S.seat !== driver) return;
  update(withHistory(g, { phase: 'results' }, '← Back to playing'));
}

function update(patch) {
  return S.store.update(S.code, patch).catch(err => {
    console.error(err);
    toast(t("Couldn't save that. Check your connection."), { label: t('Retry'), run: () => update(patch) });
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
  const fk = focusKey(), sheetFocused = $sheet.contains(document.activeElement), hadFocus = $app.contains(document.activeElement);
  document.body.classList.toggle('table', S.seat === 'watch' && !!S.code && innerWidth >= 700);
  // Bidding and playing fit the phone: the page doesn't scroll, the player list does (inside its box).
  document.body.classList.toggle('fit', !!S.game && S.seat && S.seat !== 'watch' && !S.picking && (S.game.phase === 'bidding' || S.game.phase === 'playing') && innerWidth < 700);
  renderTop();
  if (!S.code && S.setup) { $app.innerHTML = setupView(); }
  else if (!S.code && S.crewCode) { $app.innerHTML = S.crew === undefined ? `<p class="loading">${t('Finding the ship…')}</p>` : S.crew ? crewHomeView(S.crew) : noCrewView(); }
  else if (!S.code) { $app.innerHTML = homeView(); }
  else if (S.game === undefined) { $app.innerHTML = `<p class="loading">${t('Finding the ship…')}</p>`; }
  else if (S.game === null) {
    $app.innerHTML = `<div class="card"><h2>${t('No game “{code}”', { code: esc(S.code) })}</h2><p class="muted">${t('Check the code with whoever started the game.')}</p>
      <form class="join" data-form="join" style="margin:14px 0"><input name="code" maxlength="5" autocomplete="off" autocapitalize="characters" placeholder="CODE" aria-label="${t('Game or crew code')}" required>
      <button class="btn ink">${t('Join')}</button></form>
      <button class="btn ghost" data-act="home">${t('Back')}</button></div>`;
  }
  else if (!S.seat) { $app.innerHTML = seatView(); }
  else if (S.seat !== 'watch' && S.game.players?.[S.seat] && S.game.phase !== 'done' && (S.picking || (!avatarOf(S.seat) && !S.skipPick?.[S.code]))) { $app.innerHTML = crewView(); }
  else {
    const g = S.game;
    $app.innerHTML = (S.actingFor ? actingBanner() : '') + ({
      lobby: lobbyView, bidding: biddingView, playing: playingView, results: resultsView, done: doneView,
    }[g.phase] || lobbyView)(g);
    if (g.phase === 'lobby') drawQR();
  }
  // Never mid-round: a strip appearing above the bid keys would move them under a thumb.
  const calm = !S.code || !S.game || ['lobby', 'done'].includes(S.game.phase) || (S.game.phase === 'bidding' && !Object.keys(S.game.bids?.[S.game.round] || {}).length);
  if (S.updateReady && calm) $app.insertAdjacentHTML('afterbegin', `<div class="update-bar" role="status"><span>${icon('refresh', 'sm')}${t('A new version is ready')}</span><button class="btn" data-act="reload-app">${t('Refresh')}</button></div>`);
  if (!sheetFocused) renderSheet();
  afterRender();
  const back = fk && document.querySelector(fk);
  if (back && !back.disabled) back.focus({ preventScroll: true });
  else if (hadFocus && !sheetFocused) {
    // The control you were on is gone (new phase, locked in): land on what to do next.
    const next = ['#app .card.action h2', '#app .dock .btn.primary', '#app .dock .btn', '#app h2'].map(s => document.querySelector(s)).find(Boolean);
    if (next) { if (next.tagName === 'H2') next.tabIndex = -1; next.focus({ preventScroll: true }); }
  }
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
      const k = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 4); // rAF time can precede t0
      c.textContent = (c.dataset.plain ? plain : signed)(Math.round(target * e));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // Animation frames pause when the screen is off or the app is in the background: always land on the real number.
    setTimeout(() => { c.textContent = (c.dataset.plain ? plain : signed)(target); }, dur + 150);
  }
  // Player boards read as lists to screen readers ("4 items").
  document.querySelectorAll('#app .board').forEach(b => {
    if (b.querySelector(':scope > button')) return;
    b.setAttribute('role', 'list');
    b.querySelectorAll(':scope > .prow:not(button)').forEach(p => p.setAttribute('role', 'listitem'));
  });
  // Toasts float above the bottom dock rather than over its button.
  const dock = document.querySelector('#app .dock');
  document.documentElement.style.setProperty('--dock-h', dock ? `${dock.offsetHeight}px` : '0px');
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
  const sub = g.phase === 'lobby' ? t('Waiting to start') : g.phase === 'done' ? t('Game over')
    : t('{name} deals', { name: esc(name(dealerFor(g, r))) });
  const inPlay = g.phase === 'bidding' || g.phase === 'playing' || g.phase === 'results';
  $top.innerHTML = `
    <h1 class="sr-only">${t('Skull King scorer')}${g.phase === 'lobby' || g.phase === 'done' ? '' : `, ${t('Round {r}', { r })}`}</h1>
    <button class="code-chip ${S.online ? '' : 'offline'}" data-act="share" aria-label="${t('Game {code}', { code: esc(S.code) })}${S.online ? '' : `, ${t('offline: changes will sync when you reconnect')}`}. ${t('Invite players')}"><span class="dot ${S.online ? '' : 'off'}" aria-hidden="true"></span>${esc(S.code)}${S.online ? '' : `<span class="off-label">${t('Offline')}</span>`}</button>
    <div class="round">${g.phase === 'lobby' || g.phase === 'done' ? `<b>${g.phase === 'done' ? t('Final scores') : t('Lobby')}</b>` : `<b>${t('Round {r}', { r })}<span> / ${ROUNDS}</span></b>`}<small>${sub}</small></div>
    ${inPlay ? `<button class="icon-btn" data-act="cheat" aria-label="${t('What beats what')}" title="${t('What beats what')}">${icon('cards')}</button>` : ''}
    <button class="icon-btn" data-act="scores" aria-label="${t('Scores table')}" title="${t('Scores table')}">${icon('table')}</button>
    <button class="icon-btn" data-act="menu" aria-label="${t('Menu')}">${icon('more')}</button>`;
}

// ---------- home & setup ----------
function homeView() {
  const returning = myCrews().length > 0;
  const steps = `<ol class="steps">
      <li><b>1</b><span>${t('Everyone bids on their own phone')}</span></li>
      <li><b>2</b><span>${t('Bids reveal together, like the fist shake')}</span></li>
      <li><b>3</b><span>${t('Tap when you win a trick; scoring is automatic')}</span></li>
    </ol>`;
  return `
  <section class="hero ${returning ? 'compact' : ''}">${mark()}<h1>Skull King</h1><p>${t('Live scores for the whole table.')}</p>
    ${returning ? '' : `<div class="parade" aria-hidden="true">${['captain', 'coralia', 'kraken', 'parrot', 'ghost', 'tigress', 'crab'].map((id, i) => `<span style="--i:${i}">${avatarTile(id)}</span>`).join('')}</div>${steps}`}</section>
  ${myCrews().length ? `${myCrews().map((c, i) => `${i ? '' : `<button class="btn primary" data-act="crew-quick" data-c="${c.code}">${icon('plus')} ${t('New game with {crew}', { crew: esc(c.name) })}</button>`}
    <button class="card crew-link" data-act="open-crew" data-c="${c.code}">${icon('users')}<div><small>${t('History, leaderboard and stats')}</small><b>${esc(c.name)}</b></div>${icon('lead')}</button>`).join('')}
    `
  : `<button class="btn primary" data-act="new">${icon('plus')} ${t('New game')}</button>`}
  <div class="card">
    <h2 class="t3">${t('Join a game or crew')}</h2>
    <form class="join" data-form="join"><input name="code" maxlength="5" autocomplete="off" autocapitalize="characters" placeholder="CODE" aria-label="${t('Game or crew code')}" required>
    <button class="btn ink">${t('Join')}</button></form>
  </div>
  ${myCrews().length ? `<button class="btn ghost" data-act="new">${icon('plus')} ${t('One-off game (not saved)')}</button>` : ''}
  ${myCrews().length ? `<button class="link" data-act="new-crew">${icon('users', 'sm')}<span>${t('Start another crew')}</span></button>` : `<button class="btn" data-act="new-crew">${icon('users')} ${t('Start a crew to keep score over time')}</button>`}
  <button class="btn ghost" data-act="rules">${icon('book')} ${t('How scoring works')}</button>
  ${installTip()}
  ${langPicker()}
  ${S.store.live ? '' : `<p class="note">${t('Local mode: games sync between tabs on this device only.')}</p>`}`;
}

// A one-time tip to put the app on the home screen, so it opens full-screen with no browser bar.
let installEvent = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; if (!S.code) render(); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || !!navigator.standalone;
// Safari and the home-screen app keep separate memories on iOS, so a QR scanned in Safari
// forgets your seat and character. A quick hint sends people back to the installed app.
function openInAppHint() {
  if (isStandalone() || !/iPhone|iPad|iPod/i.test(navigator.userAgent)) return '';
  let installed = false, seen = false;
  try { installed = localStorage.getItem('sk.installed') === 'yes'; seen = sessionStorage.getItem('sk.appHint') === 'done'; } catch {}
  if (!installed || seen) return '';
  return `<div class="card install-tip app-hint">${icon('phone')}<div><b>${t('You also have this on your home screen')}</b>
    <span>${t('Opening the game there keeps your seat and character from last time. Copy the code {code} and type it in the app.', { code: esc(S.code) })}</span></div>
    <button class="icon-btn" data-act="app-hint-dismiss" aria-label="${t('Dismiss')}">${icon('close')}</button></div>`;
}

function installTip() {
  const standalone = isStandalone();
  let seen = false; try { seen = localStorage.getItem('sk.installTip') === 'done'; } catch {}
  if (standalone || seen || !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) return '';
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return `<div class="card install-tip">${icon('phone')}<div><b>${t('Keep it on your home screen')}</b>
    <span>${installEvent ? t('It opens full-screen, like an app, and works with weak signal.')
      : ios ? t('In Safari tap Share, then “Add to Home Screen”. It opens full-screen, like an app.')
      : t('In your browser menu, choose “Add to Home screen”. It opens full-screen, like an app.')}</span>
    ${installEvent ? `<button class="btn mini" data-act="install">${t('Add to home screen')}</button>` : ''}</div>
    <button class="icon-btn" data-act="install-dismiss" aria-label="${t('Dismiss')}">${icon('close')}</button></div>`;
}

// Each phone picks its own language.
function langPicker() {
  return `<div class="lang" role="radiogroup" aria-label="${t('Language')}">${Object.entries(LANGS).map(([k, l]) =>
    `<button type="button" role="radio" lang="${k}" aria-checked="${getLang() === k}" class="${getLang() === k ? 'on' : ''}" data-act="set-lang" data-v="${k}">${l}</button>`).join('')}</div>`;
}

function setupView() {
  const { names, dealer, members = [], crew } = S.setup;
  const crewData = crew && S.crew;
  const away = crewData ? Object.entries(crewData.members || {}).filter(([m]) => !members.includes(m)) : [];
  return `
  <button class="link back-link" data-act="cancel-setup">${icon('exit', 'sm')}<span>${t('Back')}</span></button>
  <h2>${t(crew ? 'Who’s playing tonight?' : "Who's playing?")}</h2>
  <p class="muted small">${t('Seating order around the table.')}</p>
  <form data-form="setup" style="margin-top:14px">
    ${names.map((n, i) => `
      <div class="name-row">
        <span class="seatno">${i + 1}</span>
        ${members[i] && crewData?.members?.[members[i]] ? `<span class="member-name">${memberTile(crewData.members[members[i]])}<b>${esc(n)}</b></span>`
          : `<input type="text" name="n${i}" value="${esc(n)}" maxlength="24" placeholder="${t(crew ? 'Guest name' : 'Player {n}', { n: i + 1 })}" autocomplete="off" data-idx="${i}">`}
        ${i > 0 ? `<button type="button" class="x" data-act="move-up" data-i="${i}" aria-label="${t('Move {name} up', { name: esc(n || t('Player {n}', { n: i + 1 })) })}">${icon('up-arrow')}</button>` : '<span class="x-space"></span>'}
        ${names.length > 2 ? `<button type="button" class="x" data-act="rm-name" data-i="${i}" aria-label="${n ? t('Remove {name}', { name: esc(n) }) : t('Remove player {n}', { n: i + 1 })}">${icon('close')}</button>` : ''}
      </div>`).join('')}
    ${names.length < 8 ? `<button type="button" class="btn ghost" data-act="add-name">${icon('plus')} ${t(crew ? 'Add a guest' : 'Add player')}</button>` : ''}
    ${crewData && away.length ? `<p class="muted small" style="margin:6px 2px 6px">${t('Also in the crew: tap to add')}</p>
      <div class="toggles away">${away.map(([m, x]) => `<button type="button" data-act="add-member" data-m="${m}">${memberTile(x)}${esc(x.name)}</button>`).join('')}</div>` : ''}
    <label class="dealer-pick"><span>${t('Deals round 1')}</span>
      <select data-setup="dealer">${names.map((n, i) => `<option value="${i}" ${dealer === i ? 'selected' : ''}>${esc(n || t('Player {n}', { n: i + 1 }))}</option>`).join('')}</select></label>
    <div class="section-h"><h2 class="t3">${t('House rules')}</h2></div>
    <div class="seg" role="radiogroup" aria-label="${t('Scoring')}">
      <button type="button" role="radio" aria-checked="${S.setup.scoring === 'classic'}" class="${S.setup.scoring === 'classic' ? 'on' : ''}" data-act="set-scoring" data-v="classic"><b>${t('Classic')}</b><span>${t('+20 a trick made · −10 a trick off')}</span></button>
      <button type="button" role="radio" aria-checked="${S.setup.scoring === 'rascal'}" class="${S.setup.scoring === 'rascal' ? 'on' : ''}" data-act="set-scoring" data-v="rascal"><b>${t('Rascal')}</b><span>${t('10/card, half if off by 1')}</span></button>
    </div>
    <p class="muted small" style="margin:14px 2px 8px">${t('Expansion cards in the deck')}</p>
    <div class="toggles">
      ${[['kraken', 'Kraken'], ['whale', 'White Whale'], ['loot', 'Loot']].map(([k, l]) =>
        `<button type="button" aria-pressed="${!!S.setup.exp[k]}" class="${S.setup.exp[k] ? 'on' : ''}" data-act="toggle-exp" data-k="${k}">${icon(k)}${t(l)}</button>`).join('')}
    </div>
    <button class="btn primary" style="margin-top:20px">${t('Create game')}</button>
    ${crew ? `<p class="small muted" style="margin:8px 2px 0">${t('Saved to {crew} when the game finishes.', { crew: esc(crewData?.name || '') })}</p>` : ''}
    <button type="button" class="btn ghost" data-act="cancel-setup">${t('Cancel')}</button>
  </form>`;
}

async function createGame(names, dealer, opts = {}) {
  let code;
  for (let i = 0; i < 8; i++) {
    code = randomCode(4);
    if (!(await S.store.exists(code))) break;
  }
  const players = {}, members = opts.members || [];
  // A crew's last winner gets the Skull King; everyone else keeps the character they last played.
  if (opts.crew && S.crew && opts.champion === undefined) {
    const champ = crewChampion(S.crew), i = members.indexOf(champ);
    opts.champion = i >= 0 ? 'p' + i : null;
    opts.avatars = Object.fromEntries(members.map((m, j) => [`p${j}`, S.crew.members?.[m]?.avatar])
      .filter(([pid, a]) => CREW[a] && (a !== 'skullking' || pid === opts.champion)));
  }
  names.forEach((n, i) => {
    players['p' + i] = { name: n, order: i, ...(opts.avatars?.['p' + i] ? { avatar: opts.avatars['p' + i] } : {}), ...(opts.crew && members[i] ? { member: members[i] } : {}) };
  });
  const game = { createdAt: Date.now(), phase: 'lobby', round: 1, firstDealer: 'p' + dealer, players, scoring: opts.scoring || 'classic' };
  if (opts.champion) game.champion = opts.champion;
  if (opts.crew) game.crew = opts.crew;
  const exp = Object.fromEntries(Object.entries(opts.exp || {}).filter(([, v]) => v));
  if (Object.keys(exp).length) game.expansions = exp;
  await S.store.create(code, game);
  if (opts.crew) S.store.updateCrew(opts.crew, { current: code }).catch(() => {});
  rememberCreated(code, game.createdAt);
  S.setup = null;
  location.hash = code;
}

// ---------- seat ----------
function seatView() {
  const ps = sortedPlayers(S.game).filter(p => !gone(S.game, p));
  return `
  ${openInAppHint()}
  <h2 style="margin-top:24px">${t('Who are you?')}</h2>
  <p class="muted small">${t('Game {code}. Pick your name to bid from this phone.', { code: esc(S.code) })}</p>
  <div class="seat-list">
    ${ps.map(p => {
      const taken = S.game.presence?.[p.id] && S.game.presence[p.id] !== DEVICE;
      return `<button class="btn ${taken ? 'taken' : ''}" data-act="seat" data-id="${p.id}">${flag(p.id)}${esc(p.name)}${taken ? `<span class="chip tag">${icon('phone')}${t('On another phone')}</span>` : ''}</button>`;
    }).join('')}
    <button class="btn ghost" data-act="seat" data-id="watch">${icon('screen')} ${t('Table screen (big scoreboard, no seat)')}</button>
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
  <h2 style="margin-top:24px">${t('Pick your character')}</h2>
  <p class="muted small" style="margin-top:0">${t('{name}, this is how the crew will see you on the scoreboard.', { name: esc(name(seat)) })}${champ ? ` ${t('You won the last game, so the Skull King is yours to claim.')}` : ''}
</p>
  <div class="crew-grid">
    ${order.map(id => {
      const c = CREW[id], who = takenBy[id], locked = c.earned && !champ, reward = c.earned && champ;
      const chip = who ? `<span class="crew-chip">${esc(who)}</span>` : locked ? `<span class="crew-chip">${icon('crown', 'xs')}${t('Winner')}</span>` : reward ? `<span class="crew-chip claim">${icon('crown', 'xs')}${t('Claim')}</span>` : '';
      const label = `${t(c.name)}${who ? `, ${t('taken by {name}', { name: who })}` : locked ? `, ${t('only for the last game’s winner')}` : reward ? `, ${t('your reward for winning')}` : ''}`;
      return `<button class="crew-pick ${mine === id ? 'on' : ''} ${reward ? 'reward' : ''}" data-act="pick-crew" data-c="${id}" ${who || locked ? 'disabled' : ''} aria-pressed="${mine === id}" aria-label="${esc(label)}">
        <span class="crew-art">${avatarTile(id, 'big')}${chip}</span><b>${esc(t(c.name))}</b></button>`;
    }).join('')}
  </div>
  ${mine ? `<button class="btn" style="margin-top:14px" data-act="crew-done">${t('Keep {name}', { name: esc(t(CREW[mine].name)) })}</button>` : `<button class="link" data-act="crew-skip">${t('Skip for now (use a flag)')}</button>`}`;
}

function roleBadges(g, r, pid) {
  // House rule: the player after the dealer leads every trick of the round.
  return (dealerFor(g, r) === pid ? `<span class="badge">${t('dealer')}</span>` : '')
    + (leaderFor(g, r) === pid ? `<span class="badge lead" title="${t('Plays first in every trick this round')}">${icon('lead', 'xs')}${t('leads tricks')}</span>` : '');
}

function rulesLine(g) {
  const exp = Object.keys(g.expansions || {}).map(k => t({ kraken: 'Kraken', whale: 'White Whale', loot: 'Loot' }[k]));
  return `${t(g.scoring === 'rascal' ? 'Rascal scoring' : 'Classic scoring')}${exp.length ? ' · ' + exp.join(', ') : ''}`;
}

function actingBanner() {
  return `<div class="acting"><span>${t('Entering for {name}', { name: esc(name(S.actingFor)) })}</span><button data-act="stop-acting">${t('Done')}</button></div>`;
}

// ---------- lobby ----------
function shareURL() { return `${location.origin}${location.pathname}#${S.code}`; }
function lobbyView(g) {
  const ps = playersIn(g, 1);
  const seated = ps.filter(p => g.presence?.[p.id]).length;
  const champ = g.champion && g.players[g.champion];
  return `
  ${champ ? `<div class="card scored nailed"><div class="outcome">${icon('crown', 'crownmark')}<div class="what">${t('{name} won the last game', { name: esc(champ.name) })}
    <small>${t(g.champion === S.seat ? 'The Skull King is unlocked for you this game.' : 'Only they can sail as the Skull King this game.')}</small></div>
    ${g.champion === S.seat && avatarOf(S.seat) !== 'skullking' ? `<button class="btn" style="width:auto;margin-left:auto" data-act="pick-crew" data-c="skullking">${avatarTile('skullking')}${t('Claim')}</button>` : ''}</div></div>` : ''}
  <div class="card share ${seated === ps.length ? 'joined' : ''}">
    <p class="muted small" style="margin:0">${t('Scan or open the link, then pick your name')}</p>
    <div class="big-code">${esc(S.code)}</div>
    <div class="qr" id="qr" aria-label="${t('QR code for the game link')}"></div>
    ${shareButtons()}
  </div>
  <div class="section-h"><h2 class="t3">${t('At the table')}</h2><span>${tn(ps.length, '{n} player', '{n} players')}</span></div>
  <p class="deal-line">${icon('cards', 'sm')}<span>${t('{name} deals round 1', { name: `<b>${esc(name(dealerFor(g, 1)))}</b>` })}${g.champion ? ` · ${t('the deal moves one seat each game')}` : ''}</span></p>
  <div class="board">
    ${ps.map(p => `<div class="prow ${p.id === S.seat ? 'me' : ''}" style="--crew:${color(p.id)}">${flag(p.id)}
      <div class="who"><b><span class="nm">${esc(p.name)}</span>${p.id === S.seat || p.id === S.actingFor ? `<span class="you-tag">${t('you')}</span>` : ''}</b>${p.id === dealerFor(g, 1) ? `<span class="roles"><span class="badge">${t('deals first')}</span></span>` : ''}</div>
      ${g.presence?.[p.id] ? `<span class="chip good">${icon('phone')}${t('On a phone')}</span>` : `<span class="chip quiet-chip">${t('No phone yet')}</span>`}<span></span></div>`).join('')}
  </div>
  <button class="link" data-act="roster">${icon('users', 'sm')}<span>${t('Add or remove players')}</span></button>
  <p class="rules-line">${esc(rulesLine(g))}${g.crew && S.crew ? `<br>${t('Saved to {crew} when the game finishes.', { crew: esc(S.crew.name) })}` : ''}</p>
  <button class="btn ghost" data-act="rules">${icon('book')} ${esc(t('Rules & scoring'))}</button>
  <div class="dock"><p class="status-line ${seated === ps.length ? 'ok' : ''}">${icon(seated === ps.length ? 'check' : 'phone', 'sm')}<span>${t('{n} of {m} phones joined', { n: seated, m: ps.length })}${seated < ps.length && ps.length - seated <= 3 ? ` · ${t('waiting on {names}', { names: ps.filter(p => !g.presence?.[p.id]).map(p => esc(p.name)).join(', ') })}` : ''}</span></p>
    <button class="btn primary" data-act="start">${t('Start round 1')}</button></div>`;
}
function shareButtons(url = '') {
  const u = url ? ` data-url="${esc(url)}"` : '';
  return `<div class="row-btns"><button class="btn" data-act="copy-link"${u}>${icon('link')} ${t('Copy link')}</button>${navigator.share ? `<button class="btn" data-act="native-share"${u}>${icon('share')} ${t('Share')}</button>` : ''}</div>`;
}

let qrLoading;
function drawQR() {
  const el = document.getElementById('qr');
  if (!el) return;
  const paint = () => {
    try {
      const url = el.dataset.url || shareURL();
      if (el.dataset.drawn === url) return;
      const q = window.qrcode(0, 'M'); q.addData(url); q.make(); el.innerHTML = q.createImgTag(7, 0); el.dataset.drawn = url;
    }
    catch { el.hidden = true; }
  };
  if (window.qrcode) return paint();
  qrLoading ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = QR_LIB; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  qrLoading.then(() => { if (document.getElementById('qr')) { drawQR(); } }).catch(() => { el.hidden = true; });
}

// ---------- the Standings Line ----------
const niceStep = raw => [10, 20, 25, 50, 100, 200, 250, 500, 1000].find(v => v >= raw) || 1000;

function standingsLine(g, { full = false } = {}) {
  const tot = totals(g), ps = sortedPlayers(g).filter(p => !gone(g, p) || g.phase === 'done');
  if (!ps.length) return '';
  const vals = ps.map(p => tot[p.id].total);
  const minV = Math.min(0, ...vals), maxV = Math.max(0, ...vals);
  const step = niceStep(Math.max(maxV - minV, 40) / 4);
  const lo = Math.floor(minV / step) * step, hi = Math.max(lo + step * 2, Math.ceil(maxV / step) * step);
  const pos = v => ((v - lo) / (hi - lo)) * 100;
  const top = Math.max(...vals), scored = g.round > 1 || g.phase === 'done';
  const showDelta = S.deltaUntil > Date.now() && S.deltaRound;
  const elapsed = showDelta ? 3400 - (S.deltaUntil - Date.now()) : 0;
  // Players on the same score share one marker (their characters stacked), so a fresh game
  // is one tag, not a stack of zeros. Then stack markers on lanes so tags never overlap.
  const groups = [];
  for (const p of [...ps].sort((a, b) => tot[a.id].total - tot[b.id].total)) {
    const v = tot[p.id].total, last = groups[groups.length - 1];
    if (last && last.v === v) last.ps.push(p); else groups.push({ v, ps: [p] });
  }
  const lay = gap => {
    const ends = [];
    const placed = groups.map(gr => {
      const x = pos(gr.v), w = gap + (gr.ps.length - 1) * 4;
      let lane = ends.findIndex(end => x - end >= w);
      if (lane < 0) { lane = ends.length; ends.push(x); } else ends[lane] = x;
      return { gr, x, lane };
    });
    return { placed, lanes: ends.length };
  };
  // Tags are wider while round deltas show, so they need more room on the line.
  const gap = showDelta ? 48 : 34;
  // Slim waterline most of the time (flag + sounding only); the full line at the big moments.
  let compact = !full && S.seat !== 'watch', L = lay(compact ? gap / 2 : gap);
  if (!compact && L.lanes > 3 && S.seat !== 'watch') { compact = true; L = lay(gap / 2); }
  let ticks = '';
  for (let v = lo; v <= hi; v += step) ticks += `<span class="tick ${v === 0 ? 'zero' : ''}" style="left:${pos(v)}%">${plain(v)}</span>`;
  // Depth bands: shoal water at the low end, open water toward the leader.
  const bands = [1, 2, 3].map(i => `<span class="band b${i}" style="left:${((i - 1) / 3) * 100}%" aria-hidden="true"></span>`).join('')
    + `<span class="water-label shoal" aria-hidden="true">${t('shallows')}</span><span class="water-label deep" aria-hidden="true">${t('deep water')}</span>`;
  const markers = L.placed.map(({ gr, x, lane }) => {
    const lead = scored && gr.v === top && top > 0, solo = gr.ps.length === 1, p = gr.ps[0];
    const ds = showDelta ? [...new Set(gr.ps.map(q => tot[q.id].rounds[S.deltaRound]))] : [];
    const d = ds.length === 1 && ds[0] != null ? ds[0] : null;
    const edge = x < 12 ? 'edge-l' : x > 88 ? 'edge-r' : '';
    const faces = solo ? flag(p.id) : `<span class="faces">${gr.ps.map(q => flag(q.id)).join('')}</span>`;
    return `<div class="marker ${gr.ps.some(q => q.id === me()) ? 'me' : ''} ${lead ? 'lead' : ''} ${edge}" data-id="${p.id}" style="--x:${x.toFixed(2)}%;--lane:${lane}">
      <span class="stem"></span>
      <span class="tag">${lead ? icon('crown', 'crown') : ''}${faces}${compact || !solo ? '' : `<span class="nm-cut">${esc(p.name)}</span> `}<b>${plain(gr.v)}</b>
        ${d != null ? `<span class="delta ${d >= 0 ? 'good-t' : 'bad-t'}" style="animation-delay:-${elapsed}ms">${signed(d)}</span>` : ''}</span></div>`;
  }).join('');
  return `<div class="standings ${compact ? 'compact' : ''}" role="img" aria-label="${t('Standings')}: ${esc(ranking(g).map(r => `${r.name}${r.id === me() ? ` (${t('you')})` : ''} ${plain(r.total)}${scored && r.total === top && top > 0 ? ` (${t('in the lead')})` : ''}`).join(', '))}">
    <div class="lanes" style="--lanes:${L.lanes}">${bands}${markers}</div><div class="scale">${ticks}</div></div>`;
}

// During play only trick counts matter: the standings shrink to one line, leader first.
function standingsStrip(g) {
  const rank = ranking(g), top = rank[0]?.total, scored = g.round > 1;
  return `<div class="standings-strip" role="img" aria-label="${t('Standings')}: ${esc(rank.map(x => `${x.name}${x.id === me() ? ` (${t('you')})` : ''} ${plain(x.total)}`).join(', '))}">
    ${rank.map(x => `<span class="${x.id === me() ? 'me' : ''}">${scored && x.total === top && top > 0 ? icon('crown', 'crown') : ''}${flag(x.id)}<b>${plain(x.total)}</b></span>`).join('')}</div>`;
}

// Round-scored card: your result first (the "nailed it" moment), then everyone's round.
function lastRoundBanner(g) {
  const r = g.round - 1;
  if (r < 1 || g.phase !== 'bidding' || (g.bids?.[g.round] && Object.keys(g.bids[g.round]).length)) return '';
  const tot = totals(g), mine = meIn(g, r);
  const lines = roundHighlights(g, r, name).filter(l => !(mine && l.id === mine && l.kind === 'zero') && l.icon !== 'down');
  const myScore = mine ? tot[mine].rounds[r] : null;
  const myBid = mine ? g.bids?.[r]?.[mine] : null, myTricks = mine ? g.results?.[r]?.[mine]?.tricks : null;
  const nailed = mine && myBid != null && myBid === myTricks;
  const outcome = !mine ? '' : `<div class="outcome">${icon(nailed ? 'check' : 'down', 'crownmark')}
      <div class="what">${nailed ? t(myBid === 0 ? 'Zero bid nailed' : 'Bid nailed') : t('Missed by {n}', { n: Math.abs((myTricks ?? 0) - (myBid ?? 0)) })}
        <small>${t('Bid {b} · won {w}', { b: myBid ?? '–', w: myTricks ?? '–' })}${g.cannon?.[r]?.[mine] ? ` · ${t('Cannonball')}` : ''}</small></div>
      <span class="big" data-count="${myScore}" data-key="${S.code}:${r}">${signed(myScore)}</span></div>`;
  const rows = playersIn(g, r).filter(p => p.id !== mine).map(p =>
    `<span>${flag(p.id)}${esc(p.name)} <b class="${tot[p.id].rounds[r] >= 0 ? 'good-t' : 'bad-t'}">${signed(tot[p.id].rounds[r])}</b></span>`).join('');
  return `<div class="card scored ${mine ? (nailed ? 'nailed' : myScore < 0 || (g.scoring === 'rascal' && myScore === 0) ? 'missed' : '') : ''}">
    ${mine ? '' : `<h2 class="t3">${t('Round {r} scored', { r })}</h2>`}${outcome}
    ${rows ? `<div class="round-row">${mine ? `<span>${t('Round {r}', { r })}:</span>` : ''}${rows}</div>` : ''}
    ${lines.length ? `<ul class="hl">${lines.map(l => `<li>${icon(l.icon)}<span>${esc(l.text)}</span></li>`).join('')}</ul>` : ''}
    ${undoCard(g)}</div>`;
}
function undoCard(g) {
  const u = lastUndo(g);
  return u ? `<button class="link" data-act="undo">${icon('undo', 'sm')}${esc(undoLabel(u))}</button>` : '';
}
// History labels are stored in English; show them in this phone's language.
function undoLabel(u) {
  const s = u.label.replace(/^[↶←]\s*/, ''), m = s.match(/^Undo scoring round (\d+)$/);
  return m ? t('Undo scoring round {r}', { r: m[1] }) : t(s);
}

const giveTipSeen = () => { try { return localStorage.getItem('sk.giveTip') === 'done'; } catch { return true; } };

// The table screen on a TV or tablet: everything in one grid that reads from across the room.
const tvMode = () => S.seat === 'watch' && !S.actingFor && innerWidth >= 700;
// Browsers only play sound after a tap. The table screen gets no taps, so it asks for one.
function tvSoundBar() {
  let off = false; try { off = localStorage.getItem('sk.tvSound') === 'off'; } catch {}
  if (!S.sound || audio?.state === 'running' || off) return '';
  return `<div class="tv-sound" role="status"><span>${icon('bell', 'sm')}${t('Tap once so the TV can play the drumroll and chimes')}</span>
    <button class="btn mini" data-act="tv-sound">${t('Turn sound on')}</button><button class="link" data-act="tv-sound-off">${t('No sound')}</button></div>`;
}

function tvView(g) {
  const r = g.round, ps = playersIn(g, r), bids = g.bids?.[r] || {}, live = g.live?.[r] || {}, tot = totals(g);
  const eff = g.phase === 'results' ? effectiveResults(g, r) : {};
  const revealed = g.phase !== 'bidding', played = tricksTapped(g, r);
  const top = Math.max(...ps.map(p => tot[p.id].total)), scored = r > 1;
  const waiting = ps.filter(p => bids[p.id] == null);
  const head = g.phase === 'bidding' ? (waiting.length ? t('Waiting for {names}', { names: waiting.map(p => esc(p.name)).join(', ') }) : t('Revealing'))
    : g.phase === 'playing' ? `${t('Tricks played')} <b class="sounding">${played}</b> / ${r} · ${t('{name} leads every trick', { name: esc(name(leaderFor(g, r))) })}`
    : t('{n} of {m} locked in', { n: ps.filter(p => eff[p.id]?.src === 'confirmed').length, m: ps.length });
  // The reveal, big: bids sit face down through the drumroll, then flip row by row.
  const drum = g.phase === 'playing' && S.drumUntil > Date.now();
  const flip = g.phase === 'playing' && !drum && S.flipPending;
  if (flip) S.flipPending = false;
  const hint = revealed && !drum ? bidHint(g, r) : null;
  // The reveal on the big screen: every bid as a card face down, flipping together.
  if (g.phase === 'playing' && (drum || flip)) {
    return `<div class="tv-reveal ${drum ? 'drum' : 'flip'}" style="--cols:${ps.length <= 4 ? ps.length : Math.ceil(ps.length / 2)}" role="group" aria-label="${t('Bids this round')}">
      ${ps.map((p, i) => `<div class="tv-card" style="--i:${i};--crew:${color(p.id)}"><div class="face back">${flag(p.id)}<b>?</b></div>
        <div class="face front">${flag(p.id)}<b>${bids[p.id] ?? '–'}</b>${g.cannon?.[r]?.[p.id] ? icon('cannon', 'sm') : ''}<small>${esc(p.name)}</small></div></div>`).join('')}
    </div>
    ${flip && hint ? `<p class="verdict tv-verdict">${icon(hint.icon)}<span>${esc(hint.text)}</span></p>` : ''}`;
  }
  return `${tvSoundBar()}${g.phase === 'bidding' ? lastRoundBanner(g) : ''}
  ${standingsLine(g, { full: true })}
  <div class="tv-head"><p>${head}</p>${hint ? `<p class="verdict">${icon(hint.icon, 'sm')}<span>${esc(hint.text)}</span></p>` : ''}</div>
  <table class="tv-grid ${drum ? 'drum' : flip ? 'flip' : ''}" style="--rows:${ps.length}"><thead><tr><th>${t('Players')}</th><th>${t('Bid')}</th><th>${t(g.phase === 'results' ? 'won' : 'Tricks')}</th>${g.phase === 'results' ? `<th>${t('This round')}</th>` : ''}<th>${t('Total')}</th></tr></thead><tbody>
  ${ps.map((p, i) => {
    const bid = bids[p.id], got = g.phase === 'results' ? eff[p.id]?.tricks : live[p.id] || 0, st = liveStatus(bid, got ?? 0);
    const sc = g.phase === 'results' && eff[p.id] ? scoreFor(g, r, p.id, eff[p.id]) : null;
    const lead = scored && tot[p.id].total === top && top > 0;
    return `<tr style="--crew:${color(p.id)}"><td><span class="tv-who">${flag(p.id)}<b>${esc(p.name)}</b>${roleBadges(g, r, p.id)}</span></td>
      <td class="num">${!revealed ? (bid != null ? `<span class="chip lock">${icon('check')}${t('In')}</span>` : '<span class="muted">…</span>') : `<span class="bidv" style="--i:${i}">${drum ? '?' : bid ?? '–'}</span>`}</td>
      <td class="num ${revealed && bid != null ? ({ on: 'good-t', bust: 'bad-t', bust0: 'bad-t' }[st] || '') : ''}">${revealed && bid != null && { on: 1, bust: 1, bust0: 1 }[st] ? icon(st === 'on' ? 'check' : 'x', 'tv-mark') : ''}${revealed ? `${got ?? '–'}${g.phase === 'playing' && bid != null ? `<small class="of"> / ${bid}</small>` : ''}` : ''}</td>
      ${g.phase === 'results' ? `<td class="num">${sc == null ? '' : `<span class="${sc >= 0 ? 'good-t' : 'bad-t'}">${signed(sc)}</span>`}</td>` : ''}
      <td class="num total">${lead ? icon('crown', 'crown') : ''}${plain(tot[p.id].total + (sc || 0))}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function biddingView(g) {
  if (tvMode()) return tvView(g);
  const r = g.round, bids = g.bids?.[r] || {}, mine = meIn(g, r);
  const ps = playersIn(g, r);
  const waiting = ps.filter(p => bids[p.id] == null).length;
  const cannon = !!g.cannon?.[r]?.[mine];
  const pending = S.pendingBid && S.pendingBid.r === r && S.pendingBid.who === mine ? S.pendingBid : null;
  const locked = mine && bids[mine] != null && !S.changing && !pending;
  const teach = g.scoring === 'rascal'
    ? t('Your bid is how many tricks you think you’ll win this round.')
    : t('Your bid is how many tricks you think you’ll win. Exactly right: +20 each (zero bid: +{n}). Off: −10 per trick.', { n: 10 * r });
  const joining = !mine && me() && !S.actingFor ? g.players[me()] : null;
  const card = !mine ? (joining && (joining.from || 1) > r ? joinsCard(joining) : '') : locked ? `<div class="card locked-card">
      <div class="locked-row">${icon('check', 'big-check')}<div><h2 class="t3" style="margin:0">${t('Bid is in')}</h2>
        <p class="muted small" style="margin:2px 0 0">${t('Hidden until everyone has bid. Tap Peek to see it for 3 seconds')}${g.scoring === 'rascal' ? ` · ${t(cannon ? 'Cannonball' : 'Grapeshot')}` : ''}.</p></div></div>
      <div class="row-btns"><button class="btn peek" data-act="noop" data-peek="${bids[mine]}" aria-label="${t('Peek at your bid')}">${t('Peek')}</button>
        <button class="btn" data-act="change-bid">${t('Change')}</button></div></div>`
    : `<div class="card action">
    <h2 class="t3">${S.actingFor ? t('How many tricks will {name} win?', { name: esc(name(mine)) }) : t('How many tricks will you win?')} <span class="muted">· ${tn(r, '{n} card', '{n} cards')}</span></h2>
    <p class="muted small" style="margin:0">${r <= 2 ? `${teach} ` : ''}<button class="link inline" data-act="rules">${t('How scoring works')}</button> · <button class="link inline" data-act="cheat">${t('What beats what')}</button></p>
    <div class="bid-grid" role="group" aria-label="${t('Your bid')}" style="--keys:${r + 1 <= 6 ? r + 1 : Math.ceil((r + 1) / 2)}">${Array.from({ length: r + 1 }, (_, n) => { const on = pending ? pending.n === n : bids[mine] === n; return `<button data-act="bid" data-n="${n}" class="${on ? 'on' : ''}" aria-pressed="${on}" aria-label="${tn(n, 'Bid {n} trick', 'Bid {n} tricks')}">${n}</button>`; }).join('')}</div>
    ${pending ? `<div class="locking" role="status"><span class="locking-bar" style="--hold:${BID_HOLD_MS}ms;--elapsed:-${Date.now() - pending.at}ms"></span><span>${t('Locking in {n}…', { n: pending.n })}</span><button class="link" data-act="cancel-bid">${t('Change')}</button></div>` : ''}
    ${g.scoring === 'rascal' ? `<div class="seg wager" role="radiogroup" aria-label="${t('Rascal wager')}">
      <button type="button" role="radio" aria-checked="${!cannon}" class="${!cannon ? 'on' : ''}" data-act="cannon" data-v="0"><b>${icon('target', 'sm')}${t('Grapeshot')}</b><span>${t('{n} pts · half if off by 1', { n: 10 * r })}</span></button>
      <button type="button" role="radio" aria-checked="${cannon}" class="${cannon ? 'on' : ''}" data-act="cannon" data-v="1"><b>${icon('cannon', 'sm')}${t('Cannonball')}</b><span>${t('{n} pts · all or nothing', { n: 15 * r })}</span></button>
    </div>` : ''}
  </div>`;
  const banner = lastRoundBanner(g);
  return `
  ${standingsLine(g, { full: !!banner })}
  ${banner}
  ${card}
  <div class="section-h"><h2 class="t3">${waiting === 1 && mine && bids[mine] == null ? t('Waiting for you') : waiting ? t('Waiting for {n}', { n: waiting }) : t('Revealing')}</h2><span>${t('{n} of {m} in', { n: ps.length - waiting, m: ps.length })}</span></div>
  <div class="fit-scroll"><div class="board" style="--cols:${tableCols(ps.length)}">
    ${ps.map(p => `<div class="prow ${p.id === mine ? 'me' : ''}" style="--crew:${color(p.id)}">${flag(p.id)}
      <div class="who"><b><span class="nm">${esc(p.name)}</span>${p.id === S.seat || p.id === S.actingFor ? `<span class="you-tag">${t('you')}</span>` : ''}</b>${roleBadges(g, r, p.id) ? `<span class="roles">${roleBadges(g, r, p.id)}</span>` : ''}</div>
      ${bids[p.id] != null ? `<span class="chip lock">${icon('check')}${t('In')}</span>` : nudgeChip(p.id, mine)}
      <span></span></div>`).join('')}${tableFill(ps.length)}
  </div></div>`;
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
  return `<button class="chip nudge" data-act="nudge" data-id="${pid}" aria-label="${t('Nudge {name}', { name: esc(name(pid)) })}">${icon('bell')}${t('Nudge')}</button>`;
}

// Shown to a player who joined mid-round: they sit this one out.
function joinsCard(p) {
  return `<div class="card quiet joins">${flag(p.id)}<div><b>${t('You join from round {r}', { r: p.from })}</b>
    <span>${t('Watch this round; your first bid comes next round.')}</span></div></div>`;
}

// ---------- playing ----------
function boardRows(g, r, { showLive }) {
  const bids = g.bids?.[r] || {}, live = g.live?.[r] || {}, tot = totals(g), mine = me();
  // Anyone can log a trick for another player by tapping their chip (for a phone that's away).
  const canGive = showLive && g.phase === 'playing' && !(S.seat === 'watch' && !S.actingFor) && tricksTapped(g, r) < r;
  return playersIn(g, r).map((p, i) => {
    const bid = bids[p.id], got = live[p.id] || 0, st = liveStatus(bid, got);
    let chip = !showLive ? '' : {
      need: `<span class="chip num" aria-label="${t('{n} of {m}', { n: got, m: bid })}">${got}<small>/${bid}</small></span>`,
      on: `<span class="chip good num" aria-label="${t('{n} of {m}', { n: got, m: bid })}">${icon('check')}${got}<small>/${bid}</small></span>`,
      bust: `<span class="chip bad num" aria-label="${t('{n} won · bid {m}', { n: got, m: bid })}">${icon('x')}${got}<small>/${bid}</small></span>`,
      safe0: `<span class="chip sk num" aria-label="${t('Zero bid · none won')}">0<small>/0</small></span>`,
      bust0: `<span class="chip bad num" aria-label="${t('Zero · {n} won', { n: got })}">${icon('x')}${got}<small>/0</small></span>`, none: '',
    }[st];
    if (canGive && p.id !== mine && chip) chip = chip.replace(/^<span class="chip/, `<button type="button" data-act="trick-for" data-id="${p.id}" aria-label="${t('Give {name} a trick', { name: esc(p.name) })}" class="chip give`).replace(/<\/span>$/, `${icon('plus', 'sm give-plus')}</button>`);
    return `<div class="prow ${p.id === mine ? 'me' : ''}" style="--crew:${color(p.id)}">${flag(p.id)}
      <div class="who"><b><span class="nm">${esc(p.name)}</span>${p.id === S.seat || p.id === S.actingFor ? `<span class="you-tag">${t('you')}</span>` : ''}</b><span class="roles">${roleBadges(g, r, p.id)}<span class="bidtxt">${t('Bid')} <b>${bid ?? '–'}</b>${g.cannon?.[r]?.[p.id] ? ` ${icon('cannon', 'sm')}` : ''}</span></span></div>
      ${chip}<span class="total">${plain(tot[p.id].total)}</span></div>`;
  }).join('') + tableFill(playersIn(g, r).length);
}

function playingView(g) {
  if (tvMode()) return tvView(g);
  const r = g.round, live = g.live?.[r] || {}, bids = g.bids?.[r] || {}, mine = meIn(g, r), ps = playersIn(g, r);
  const destroyed = g.destroyed?.[r] || 0;
  const played = Object.values(live).reduce((a, b) => a + b, 0) + destroyed;
  const done = played >= r;
  const canDestroy = g.expansions?.kraken || g.expansions?.whale;
  const watch = S.seat === 'watch' && !S.actingFor;
  const hint = bidHint(g, r);
  const myGot = mine ? live[mine] || 0 : 0, myBid = mine ? bids[mine] : null;
  // The reveal: every bid flips up at once, then stays as the round's reference strip.
  // During the drumroll the bids stay face down; the first render after it flips them.
  const drum = S.drumUntil > Date.now();
  const flip = !drum && S.flipPending;
  if (flip) S.flipPending = false;
  const strip = `<div class="bids-strip ${drum ? 'drum' : flip ? 'reveal' : ''} ${ps.length > 5 ? 'wide' : ''}" style="--bcols:${ps.length <= 5 ? ps.length : Math.ceil(ps.length / 2)}" role="group" aria-label="${t('Bids this round')}">
    ${ps.map((p, i) => drum
      ? `<span class="bid-cell" style="--i:${i}" role="img" aria-label="${esc(p.name)}">${flag(p.id)}<b aria-hidden="true">?</b><small>${esc(p.name)}</small></span>`
      : `<span class="bid-cell ${p.id === mine ? 'me' : ''}" style="--i:${i}" role="img" aria-label="${t('{name} bid {n}', { name: esc(p.name), n: bids[p.id] ?? '–' })}${g.cannon?.[r]?.[p.id] ? `, ${t('Cannonball')}` : ''}">${flag(p.id)}<b>${bids[p.id] ?? '–'}</b>${g.cannon?.[r]?.[p.id] ? icon('cannon', 'sm') : ''}<small>${esc(p.name)}</small></span>`).join('')}
  </div>`;
  return `
  ${S.revealAnim ? standingsLine(g, { full: true }) : standingsStrip(g)}
  <div class="card ${mine && !done ? 'action' : ''} play-card">
    ${watch ? `<div class="progress" style="margin-bottom:12px"><span class="muted">${t('Tricks played')}</span><b>${played}<span> / ${r}</span></b></div>` : ''}
    ${strip}
    ${hint && !drum ? `<p class="verdict ${played === 0 ? 'loud' : ''}">${icon(hint.icon, played === 0 ? '' : 'sm')}<span>${esc(hint.text)}</span></p>` : ''}
    ${mine ? `<div class="mine-line"><span class="muted">${S.actingFor ? t("{name}'s tricks", { name: esc(name(mine)) }) : t('Your tricks')}</span>
      <b>${myGot}<span> ${t('of')} ${myBid ?? '–'}</span></b></div>
    <div class="counter">
      <button class="btn minus" data-act="live" data-d="-1" ${myGot <= 0 ? 'disabled' : ''} aria-label="${t('Remove a trick')}">${icon('minus')}</button>
      <button class="btn primary plus" data-act="live" data-d="1" ${done || drum ? 'disabled' : ''}>${icon('plus')}${S.actingFor ? t('{name} won a trick', { name: esc(name(mine)) }) : t('I won a trick')}</button>
    </div>
    ${canDestroy && me() === dealerFor(g, r) ? `<button class="btn destroyed-btn" data-act="destroy" data-d="1" ${done || drum || destroyed >= 2 ? 'disabled' : ''}>${icon('kraken', 'sm')}${t('Trick destroyed')}${destroyed ? ` <span class="chip">${destroyed}</span>` : ''}</button>
      ${destroyed ? `<button class="link" data-act="destroy" data-d="-1">${t('Undo a destroyed trick')}</button>` : ''}` : ''}` : ''}
    ${watch ? `<p class="table-line small muted">${t('{name} leads every trick', { name: esc(name(leaderFor(g, r))) })}</p>`
      : `<p class="table-line small muted">${t('Table:')} <b class="sounding">${played}</b> ${tn(r, 'of {n} trick played', 'of {n} tricks played')} · ${t('{name} leads every trick', { name: esc(name(leaderFor(g, r))) })}</p>`}
  </div>
  ${!mine && me() && !S.actingFor && (g.players[me()]?.from || 1) > r ? joinsCard(g.players[me()]) : ''}
  ${canDestroy && !watch && !mine && me() === dealerFor(g, r) ? destroyCard(destroyed, done) : ''}
  <div class="fit-scroll"><div class="board" style="--cols:${tableCols(ps.length)}">${boardRows(g, r, { showLive: true })}</div>
  ${!watch && !giveTipSeen() ? `<p class="small muted give-tip">${icon('plus', 'sm')}${t('Someone’s phone away? Tap their chip to give them a trick.')}</p>` : ''}
  ${watch ? '' : `${done ? `<p class="small muted stuck" role="status">${t('Every trick is in. Moving to results…')} <button class="link inline" data-act="to-results">${t('Not moving? Tap here')}</button></p>`
    : `<button class="btn" style="margin-top:12px" data-act="to-results">${t('Round over')}</button>`}
  <button class="link" data-act="fix-bids">${t('Fix a bid')}</button>`}</div>`;
}
function destroyCard(destroyed, done) {
  return `<div class="card quiet destroy"><span class="small">${icon('kraken', 'sm')}${t('Destroyed by Kraken / White Whale:')} <b class="sounding">${destroyed}</b></span>
    <span><button class="icon-btn outline" data-act="destroy" data-d="-1" ${destroyed <= 0 ? 'disabled' : ''} aria-label="${t('One fewer destroyed trick')}">${icon('minus')}</button>
    <button class="icon-btn outline" data-act="destroy" data-d="1" ${done || destroyed >= 2 ? 'disabled' : ''}>${icon('plus')}${t('Destroyed')}</button></span></div>`;
}

// Tricks accounted for so far this round: everyone's taps plus any destroyed by Kraken / White Whale.
const tricksTapped = (g, r) => playersIn(g, r).reduce((s, p) => s + (g.live?.[r]?.[p.id] || 0), 0) + (g.destroyed?.[r] || 0);

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
  for (const p of playersIn(g, r)) if (p.id !== except && res[p.id] == null && g.live?.[r]?.[p.id] != null) res[p.id] = { tricks: g.live[r][p.id] };
  return { ...g, results: { ...g.results, [r]: res } };
}

// Final per-player results used when scoring: confirmed entry, else live count, else auto-fill.
function effectiveResults(g, r) {
  const out = {}, ps = playersIn(g, r);
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
  // Anyone who never tapped won nothing; if the counts don't add up, the warning says so
  // rather than waiting on players who have nothing to enter.
  for (const p of ps) out[p.id] ||= { tricks: 0, src: 'live' };
  return out;
}

function stepper(act, key, label, hint, val, max) {
  const bare = esc(label.replace(/<[^>]+>/g, '').trim());
  return `<div class="stepper"><div class="lbl"><b>${label}</b>${hint ? `<span>${hint}</span>` : ''}</div>
    <div class="ctl"><button type="button" data-act="${act}" data-k="${key}" data-d="-1" ${val <= 0 ? 'disabled' : ''} aria-label="${t('{x}, minus one', { x: bare })}">${icon('minus')}</button>
    <output>${val}</output><button type="button" data-act="${act}" data-k="${key}" data-d="1" ${val >= max ? 'disabled' : ''} aria-label="${t('{x}, plus one', { x: bare })}">${icon('plus')}</button></div></div>`;
}

function resultForm(g, r, pid) {
  const d = draftFor(g, r, pid), bid = g.bids?.[r]?.[pid], keys = bonusKeys(g);
  const key = `${r}:${pid}`, open = S.bonusOpen[key] ?? keys.some(k => d[k]);
  const score = scoreFor(g, r, pid, d);
  const confirmed = !!g.results?.[r]?.[pid] && !S.drafts[key];
  const made = bid === d.tricks;
  return `
    ${stepper('draft', 'tricks', t('Tricks won'), `${t('Bid')} ${bid ?? '–'}`, d.tricks ?? 0, tricksInRound(g, r))}
    ${open ? keys.map(k => bonusStepper('draft', k, d[k] || 0, true)).join('')
      : `<button class="link" data-act="open-bonus">${icon('plus', 'sm')}<span>${t('Add bonuses (14s, Pirates, Mermaids, Skull King)')}</span></button>`}
    ${open && !made ? `<p class="small muted" style="margin:4px 0 0">${t(g.scoring === 'rascal' && !g.cannon?.[r]?.[pid] && Math.abs((d.tricks ?? 0) - bid) === 1 ? 'Off by one: half of everything, bonuses included.' : 'Bonuses only count when the bid is made.')}</p>` : ''}
    <div class="preview"><span class="muted">${t('This round')}</span><b class="${score >= 0 ? 'good-t' : 'bad-t'}">${score == null ? '–' : signed(score)}</b></div>
    <p class="small muted saved-note">${icon('check', 'sm')}${t('Saved as you go. You can change it until the round is scored.')}</p>`;
}
const bonusStepper = (act, k, val, hint) =>
  stepper(act, k, `${esc(t(BONUS[k].label))} <span class="muted small">+${BONUS[k].pts}</span>`, hint ? esc(t(BONUS[k].hint)) : '', val, BONUS[k].max);

function resultsView(g) {
  if (tvMode()) return tvView(g);
  const r = g.round, mine = meIn(g, r), eff = effectiveResults(g, r), ps = playersIn(g, r);
  const n = tricksInRound(g, r), destroyed = g.destroyed?.[r] || 0;
  const allIn = ps.every(p => eff[p.id]);
  const sum = ps.reduce((s, p) => s + (eff[p.id]?.tricks || 0), 0);
  const inCount = ps.filter(p => eff[p.id]).length;
  const tot = totals(g), watch = S.seat === 'watch' && !S.actingFor;
  // Everyone's tapped tricks count straight away; rounds save as they're changed. Score is
  // magenta once every trick is accounted for and they add up.
  const myPending = false;
  const ready = allIn && sum === n;
  const status = !allIn ? `${t('{n} of {m} in', { n: inCount, m: ps.length })} · ${t('waiting on {names}', { names: ps.filter(p => !eff[p.id]).map(p => esc(p.name)).join(', ') })}`
    : sum === n ? t('Tricks add up · add any bonuses, then score') : t("Tricks don't add up: check the numbers");
  const srcLabel = e => !e ? `<span class="src">${t('waiting')}</span>` : e.src === 'auto' ? `<span class="src">${t('auto-filled')}</span>` : '';
  return `
  ${mine ? `<div class="card ${myPending ? 'action' : ''}"><h2 class="t3">${S.actingFor ? t("{name}'s round {r}", { name: esc(name(mine)), r }) : t('Your round {r}', { r })}</h2>${resultForm(g, r, mine)}</div>` : ''}
  <div class="section-h"><h2 class="t3">${t('Round {r} results', { r })}</h2><span>${t('Totals after this round')}</span></div>
  <div class="board" style="--cols:${tableCols(ps.length)}">
    ${ps.map(p => {
      const e = eff[p.id], bid = g.bids?.[r]?.[p.id], s = e ? scoreFor(g, r, p.id, e) : null;
      const made = e && bid === e.tricks;
      return `<div class="prow ${p.id === mine ? 'me' : ''}" style="--crew:${color(p.id)}">${flag(p.id)}
        <div class="who"><b><span class="nm">${esc(p.name)}</span>${p.id === S.seat || p.id === S.actingFor ? `<span class="you-tag">${t('you')}</span>` : ''}</b><span>${t('Bid')} <b>${bid ?? '–'}</b>${g.cannon?.[r]?.[p.id] ? ` ${icon('cannon', 'sm')}` : ''} · ${t('won')} <b>${e ? e.tricks : '–'}</b>${srcLabel(e) ? ` · ${srcLabel(e)}` : ''}</span></div>
        ${e ? `<span class="chip ${made ? 'good' : s > 0 ? '' : 'bad'}">${made ? icon('check') : s > 0 ? '' : icon('x')}${signed(s)}</span>` : nudgeChip(p.id, mine)}
        <span class="total">${plain(tot[p.id].total + (s || 0))}</span></div>`;
    }).join('')}${tableFill(ps.length)}
  </div>
  ${(g.expansions?.kraken || g.expansions?.whale) && !watch && me() === dealerFor(g, r) ? destroyCard(destroyed, false) : ''}
  ${allIn && sum !== n ? `<div class="warnbox">${icon('x')}<span>${tn(n, 'The tricks add up to {sum}, but {n} was won this round', 'The tricks add up to {sum}, but {n} were won this round', { sum })}${destroyed ? ` (${t('{r} played, {d} destroyed', { r, d: destroyed })})` : ''}. ${t('Check the "won" numbers above; tap a player\'s chip in Scores to fix it later.')}</span></div>` : ''}
  ${watch ? '' : `<div class="dock"><p class="status-line ${ready ? 'ok' : ''}">${icon(ready ? 'check' : 'bell', 'sm')}<span>${status}</span></p>
  ${`<button class="btn ${ready ? 'primary' : ''}" data-act="score" ${allIn ? '' : 'disabled'}>${allIn && sum !== n ? t('Score anyway') : r === ROUNDS ? t('Score final round') : t('Score round {r}', { r })}</button>`}</div>`}`;
}

// ---------- done ----------
// Each player's line gets its own dash pattern and ends on their flag, so it never relies on colour.
const DASHES = ['', '7 4', '2 4', '10 3 2 3', '4 3', '12 4', '1 3', '6 2 2 2'];
function chartSVG(g) {
  const tot = totals(g), ps = sortedPlayers(g), n = ROUNDS;
  const vals = ps.flatMap(p => [0, ...tot[p.id].running]);
  const lo = Math.min(0, ...vals), hi = Math.max(10, ...vals);
  const W = 340, H = 200, L = 34, R = 24, T = 12, B = 22;
  const x = i => L + (i / n) * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const step = Math.max(50, Math.ceil((hi - lo) / 4 / 50) * 50);
  let grid = '';
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid += `<line class="${v === 0 ? 'zero' : 'grid'}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 4}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  for (let i = 1; i <= n; i++) grid += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${i}</text>`;
  const ends = spreadEnds(ps.map(p => ({ id: p.id, y: y(tot[p.id].running[tot[p.id].running.length - 1] ?? 0) - 7 })), 15, T - 6, H - B - 8);
  const lines = ps.map(p => {
    const o = p.order % 8, run = [0, ...tot[p.id].running];
    const pts = run.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const ex = x(run.length - 1), ey = ends.find(e => e.id === p.id).y;
    return `<polyline points="${pts}" fill="none" stroke="${color(p.id)}" stroke-width="2.25" stroke-dasharray="${DASHES[o]}" stroke-linejoin="round" stroke-linecap="round"/>
      ${markSVG(p.id, +(ex + 3).toFixed(1), +ey.toFixed(1), 14)}`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Running totals by round')}: ${esc(ranking(g).map(r => `${r.name} ${r.total}`).join(', '))}">${grid}${lines}</svg>
    <div class="legend">${ps.map(p => `<span><svg class="dash" viewBox="0 0 24 4" aria-hidden="true"><line x1="1" y1="2" x2="23" y2="2" stroke="${color(p.id)}" stroke-width="2.25" stroke-dasharray="${DASHES[p.order % 8]}" stroke-linecap="round"/></svg>${flag(p.id)}${esc(p.name)}</span>`).join('')}</div>`;
}

// Everyone gets their own ending, not just the winner.
function personalLine(g) {
  const mine = S.seat && S.seat !== 'watch' ? S.seat : null;
  if (!mine || !g.players[mine]) return '';
  const p = playerSummary(g, mine), a = awards(g)[mine];
  const line = p.place === 1 ? t('You won the voyage') : t('You finished {place}', { place: ordinal(p.place) });
  return `<div class="card personal">${flag(mine)}<div><b>${line}</b>
    ${a ? `<span class="award-title">${icon(a.icon, 'sm')}${esc(a.title)}</span>` : ''}
    <span>${t('Best round')} ${p.best ? `${signed(p.best.score)} (${t('Round {r}', { r: p.best.round })})` : '–'} · ${t('{n}/{m} bids made', { n: p.made, m: p.played })}</span></div></div>`;
}

// A title for everyone at the table, in final order.
function awardsCard(g) {
  const a = awards(g), rank = ranking(g);
  return `<div class="card"><h2 class="t3">${t('Awards')}</h2><ul class="awards">${rank.map(r => a[r.id] ? `<li class="${r.id === S.seat ? 'me' : ''}">${flag(r.id)}
    <div><b>${esc(a[r.id].title)}</b><span><span class="nm">${esc(r.name)}</span> · ${esc(a[r.id].line)}</span></div>${icon(a[r.id].icon)}</li>` : '').join('')}</ul></div>`;
}

function doneView(g) {
  const rank = ranking(g);
  const tops = rank.filter(r => r.place === 1);
  if (tvMode()) {
    const a = awards(g);
    return `
    <section class="winner finale tv-finale ${S.finalAnim ? 'arrive' : ''}">
      <div class="hero-flags">${tops.map(x => `<span class="hero-flag">${icon('crown', 'hero-crown')}${flag(x.id)}</span>`).join('')}</div>
      <h1>${tops.length > 1 ? t('{names} win', { names: tops.map(x => esc(x.name)).join(' & ') }) : t('{name} wins', { name: esc(tops[0].name) })}</h1>
      <p class="final-total"><b data-count="${tops[0].total}" data-key="${S.code}:final" data-plain="1">${plain(tops[0].total)}</b></p>
    </section>
    ${standingsLine(g, { full: true })}
    <div class="tv-board"><table class="tv-grid" style="--rows:${rank.length}"><thead><tr><th>#</th><th>${t('Players')}</th><th>${t('Awards')}</th><th>${t('Total')}</th></tr></thead><tbody>
      ${rank.map(x => `<tr style="--crew:${color(x.id)}"><td class="num place">${x.place}</td><td><span class="tv-who">${flag(x.id)}<b>${esc(x.name)}</b></span></td>
        <td class="award">${a[x.id] ? `<span class="aw">${icon(a[x.id].icon, 'sm')}<b>${esc(a[x.id].title)}</b><small>${esc(a[x.id].line)}</small></span>` : ''}</td>
        <td class="num total">${x.place === 1 ? icon('crown', 'crown') : ''}${plain(x.total)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const hero = tops.map(r => `<span class="hero-flag">${icon('crown', 'hero-crown')}${flag(r.id)}</span>`).join('');
  return `
  <section class="winner finale ${S.finalAnim ? 'arrive' : ''}">
    <div class="hero-flags">${hero}</div>
    <h1>${tops.length > 1 ? t('{names} win', { names: tops.map(r => esc(r.name)).join(' & ') }) : t('{name} wins', { name: esc(tops[0].name) })}</h1>
    <p class="final-total"><b data-count="${tops[0].total}" data-key="${S.code}:final" data-plain="1">${plain(tops[0].total)}</b> ${t('after 10 rounds')} · ${esc(rulesLine(g))}</p>
  </section>
  ${personalLine(g)}
  ${standingsLine(g, { full: true })}
  <div class="board podium" style="margin-top:8px">
    ${rank.map(r => { const left = g.players[r.id].left; return `<div class="prow ${r.id === S.seat ? 'me' : ''}" style="--crew:${color(r.id)}"><span class="place">${r.place}</span>${flag(r.id)}<div class="who"><b><span class="nm">${esc(r.name)}</span>${r.place === 1 ? icon('crown', 'sm') : ''}</b>${left ? `<span>${t('Left after round {r}', { r: left - 1 })}</span>` : ''}</div><span class="total">${plain(r.total)}</span></div>`; }).join('')}
  </div>
  <button class="btn primary" data-act="rematch" style="margin-top:14px">${t('Rematch, same crew')}</button>
  ${g.crew && S.crew ? `<button class="btn" data-act="open-crew" data-c="${g.crew}">${icon('users')} ${t('Saved to {crew}: see the history', { crew: esc(S.crew.name) })}</button>` : ''}
  ${awardsCard(g)}
  <div class="card"><h2 class="t3">${t('The voyage')}</h2>${chartSVG(g)}</div>
  <button class="btn" data-act="scores">${icon('chart')} ${t('Round-by-round table')}</button>
  <button class="btn ghost" data-act="home">${t('Home')}</button>
  ${undoCard(g)}`;
}

// ---------- sheets ----------
function renderSheet() {
  const s = S.sheet;
  if (!s || (!['rules', 'member', 'pastgame', 'crewshare', 'newcrew', 'ask'].includes(s.kind) && !S.game)) {
    const wasOpen = !$sheet.hidden;
    $sheet.hidden = true; $sheet.innerHTML = '';
    $top.inert = false; $app.inert = false;
    if (wasOpen) {
      // Back to whatever opened the sheet (found again by its selector if the page was redrawn).
      const back = S.opener?.isConnected ? S.opener : S.openerKey && document.querySelector(S.openerKey);
      back?.focus({ preventScroll: true });
    }
    S.opener = null; S.openerKey = null;
    return;
  }
  const body = { scores: scoresSheet, menu: menuSheet, rules: rulesSheet, edit: editSheetWrapper, actfor: actForSheet, share: shareSheet, bidpick: bidPickSheet, roster: rosterSheet, cheat: cheatSheet, member: memberSheet, pastgame: pastGameSheet, ask: askSheet, crewshare: crewShareSheet, newcrew: newCrewSheet }[s.kind]?.(s) || '';
  const title = { scores: t('Scores'), menu: t('Menu'), rules: t('Rules & scoring'), edit: s.bidOnly ? t('Fix a bid') : t('Edit round {r}', { r: s.r }), actfor: t('Enter for…'), share: t('Game {code}', { code: S.code }), bidpick: t('Fix whose bid?'), roster: t('Players'), cheat: t('What beats what'), member: t('Player stats'), pastgame: s.code ? fmtDate(S.crew?.games?.[s.code]?.at) : '', crewshare: S.crew?.name || '', newcrew: t('Start a crew'), ask: S.ask?.title || '' }[s.kind];
  const opening = $sheet.hidden;
  if (opening) { S.opener = document.activeElement; S.openerKey = focusKey(); $toast.classList.remove('on'); }
  $sheet.hidden = false;
  // Only the sheet is reachable while it is open.
  $top.inert = true; $app.inert = true;
  $sheet.innerHTML = `<div class="panel" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="head"><h2 tabindex="-1">${esc(title)}</h2><button class="icon-btn outline" data-act="close" aria-label="${t('Close')}">${icon('close')}</button></div>${body}</div>`;
  if (s.kind === 'share' || s.kind === 'crewshare') drawQR();
  if (s.kind === 'newcrew') $sheet.querySelector('input')?.focus();
  if (opening && s.kind !== 'newcrew') $sheet.querySelector('h2')?.focus();
}

function scoresSheet() {
  const g = S.game, ps = sortedPlayers(g), tot = totals(g);
  const lastEditable = g.phase === 'done' ? g.round : g.round - 1;
  let rows = '';
  for (let r = 1; r <= ROUNDS; r++) {
    rows += `<tr><td class="rn">${r}</td>${ps.map(p => {
      const bid = g.bids?.[r]?.[p.id], res = g.results?.[r]?.[p.id];
      if (!playsIn(p, r)) return '<td class="muted"></td>';
      if (r > lastEditable) return `<td class="muted">${r === g.round && bid != null && g.phase !== 'bidding' ? `<small>${t('Bid')} ${bid}</small>` : ''}</td>`;
      const s = tot[p.id].rounds[r];
      if (S.readOnlyTable) return `<td><span class="ro"><b class="${s >= 0 ? 'good-t' : 'bad-t'}">${signed(s)}</b><small>${bid ?? '–'}/${res?.tricks ?? '–'}</small></span></td>`;
      return `<td><button data-act="edit" data-r="${r}" data-id="${p.id}" aria-label="${t('{name}, round {r}: {s}, bid {b} won {w}. Edit', { name: esc(p.name), r, s: signed(s), b: bid ?? '–', w: res?.tricks ?? '–' })}"><b class="${s >= 0 ? 'good-t' : 'bad-t'}">${signed(s)}</b><small>${bid ?? '–'}/${res?.tricks ?? '–'}</small></button></td>`;
    }).join('')}</tr>`;
  }
  return `<p class="small muted" style="margin-top:0">${t(S.readOnlyTable ? 'Cells show score and bid/won.' : 'Cells show score and bid/won. Tap a scored round to fix it.')}</p>
  <div class="tbl-wrap"><table class="scores ${ps.length > 5 ? 'many' : ''}"><thead><tr><th>#</th>${ps.map(p => `<th>${flag(p.id)}${esc(p.name)}</th>`).join('')}</tr></thead>
  <tbody>${rows}</tbody><tfoot><tr><td></td>${ps.map(p => `<td>${plain(tot[p.id].total)}</td>`).join('')}</tr></tfoot></table></div>`;
}

function editSheet(s) {
  const g = S.game, key = `${s.r}:${s.id}`;
  const d = S.drafts[key] ||= { ...(g.results?.[s.r]?.[s.id] || { tricks: 0 }) };
  const bid = s.bid ?? g.bids?.[s.r]?.[s.id] ?? 0;
  const cannon = s.cannon ?? !!g.cannon?.[s.r]?.[s.id];
  const score = roundScore(s.r, bid, d, { mode: g.scoring, cannon });
  return `<p style="margin-top:0;display:flex;gap:8px;align-items:center">${flag(s.id)}<b>${esc(name(s.id))}</b></p>
    ${stepper('edit-bid', 'bid', t('Bid'), '', bid, s.r)}
    ${g.scoring === 'rascal' ? `<div class="seg" style="margin:6px 0" role="radiogroup" aria-label="${t('Rascal wager')}">
      <button type="button" role="radio" aria-checked="${!cannon}" class="${!cannon ? 'on' : ''}" data-act="edit-cannon" data-v="0"><b>${t('Grapeshot')}</b></button>
      <button type="button" role="radio" aria-checked="${cannon}" class="${cannon ? 'on' : ''}" data-act="edit-cannon" data-v="1"><b>${icon('cannon', 'sm')}${t('Cannonball')}</b></button></div>` : ''}
    ${stepper('edit-draft', 'tricks', t('Tricks won'), '', d.tricks ?? 0, s.r)}
    ${bonusKeys(g).map(k => bonusStepper('edit-draft', k, d[k] || 0, false)).join('')}
    <div class="preview"><span class="muted">${t('Round {r}', { r: s.r })}</span><b class="${score >= 0 ? 'good-t' : 'bad-t'}">${signed(score ?? 0)}</b></div>
    <button class="btn primary" style="margin-top:12px" data-act="save-edit">${t('Save')}</button>`;
}

function menuSheet() {
  const g = S.game, u = lastUndo(g);
  return `<h2 class="t3 menu-h first">${t('This round')}</h2>
  <div class="menu-list">
    ${u ? `<button data-act="undo">${icon('undo')}${esc(undoLabel(u))}</button>` : ''}
    <button data-act="open-actfor">${icon('users')}${t('Enter for another player')}</button>
  </div>
  <h2 class="t3 menu-h">${t('Help')}</h2>
  <div class="menu-list">
    <button data-act="cheat">${icon('cards')}${t('What beats what')}</button>
    <button data-act="rules">${icon('book')}${esc(t('Rules & scoring'))}</button>
  </div>
  <h2 class="t3 menu-h">${t('Seat & game')}</h2>
  <div class="menu-list">
    ${g.phase !== 'done' ? `<button data-act="roster">${icon('plus')}${t('Add or remove players')}</button>` : ''}
    <button data-act="share">${icon('share')}${esc(t('Invite players (code & QR)'))}</button>
    ${S.seat !== 'watch' && g.phase !== 'done' ? `<button data-act="change-crew">${avatarOf(S.seat) ? avatarTile(avatarOf(S.seat), 'menu-ava') : icon('users')}${t('Change character')}</button>` : ''}
    <button data-act="change-seat">${icon('swap')}${t('Switch player on this phone')}</button>
    ${S.seat !== 'watch' ? `<button data-act="table-mode">${icon('screen')}${t('Use as the table scoreboard')}</button>` : ''}
    <button data-act="home">${icon('exit')}${t('Leave game (it keeps going)')}</button>
  </div>
  <h2 class="t3 menu-h">${t('This phone')}</h2>
  <div class="menu-list">
    <button role="switch" aria-checked="${S.sound}" data-act="toggle-sound">${icon('bell')}<span class="grow">${t('Sound & vibration')}</span><span class="switch" aria-hidden="true"></span></button>
  </div>
  ${langPicker()}
  <p class="small muted" style="margin:12px 2px 0">${S.seat === 'watch' ? t('You are the table screen.') : t('You are {name}.', { name: `<b>${esc(name(S.seat))}</b>` })} ${esc(rulesLine(g))}. ${t(S.store.live ? 'Live sync on.' : 'Local mode: this device only.')}</p>`;
}

// ---------- confirmations: a themed sheet instead of the browser's confirm() ----------
function ask(title, body, yes) {
  S.ask?.res(false);
  return new Promise(res => { S.ask = { title, body, yes, res }; S.sheet = { kind: 'ask' }; renderSheet(); });
}
function askSheet() {
  const a = S.ask;
  return a ? `<p style="margin-top:0">${esc(a.body)}</p>
    <button class="btn primary" data-act="ask-yes">${esc(a.yes)}</button>
    <button class="btn ghost" data-act="close">${t('Cancel')}</button>` : '';
}

// ---------- crews: a friend group's shared history ----------
const CREWS_KEY = 'sk.crews';
function myCrews() { try { return JSON.parse(localStorage.getItem(CREWS_KEY) || '[]'); } catch { return []; } }
function saveCrews(list) { try { localStorage.setItem(CREWS_KEY, JSON.stringify(list)); } catch {} }
const crewURL = code => `${location.origin}${location.pathname}#crew=${code}`;

// Follow one crew's data (the one on screen, or the crew of the game being played).
function watchCrew(code) {
  if (S.crewWatching === code) return;
  S.crewUnsub?.();
  S.crewWatching = code; S.crew = undefined; S.crewAll = false;
  S.crewUnsub = S.store.subscribeCrew(code, c => {
    S.crew = c;
    if (c && S.quickStart === code && S.crewCode === code) { S.quickStart = null; actions['crew-new'](); return; }
    if (c) {
      // This phone now belongs to the crew: show it on the home screen.
      const list = myCrews().filter(x => x.code !== code);
      saveCrews([{ code, name: c.name }, ...list]);
      if (S.game) saveToCrew(null, S.game);
    }
    if (!S.code || S.game) render();
  });
}

// A crew member for a typed name: an existing member with that name, or a new one added to `patch`.
function memberFor(nm, patch) {
  const hit = Object.entries(S.crew?.members || {}).find(([, x]) => x.name.toLowerCase() === nm.toLowerCase());
  if (hit) return hit[0];
  const m = 'm' + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => (b % 36).toString(36)).join('');
  patch[`members/${m}`] = { name: nm, joinedAt: Date.now() };
  return m;
}

// A finished crew game is saved to the crew's history (any phone can do it; the write is the
// same from every phone). If the final scoring is undone, it comes back out.
function saveToCrew(prev, g) {
  if (!g.crew || !S.crew || S.crewWatching !== g.crew) return;
  if (g.phase === 'done') {
    const keys = Object.keys(g.history || {}).sort();
    const pick = (o, ks) => Object.fromEntries(ks.filter(k => o?.[k] != null).map(k => [k, o[k]]));
    const snap = JSON.parse(JSON.stringify({
      at: +keys[keys.length - 1] || g.createdAt, round: g.round, scoring: g.scoring || 'classic', firstDealer: g.firstDealer,
      players: Object.fromEntries(Object.entries(g.players).map(([pid, p]) => [pid, pick(p, ['name', 'order', 'member', 'avatar', 'from', 'left'])])),
      ...pick(g, ['expansions', 'bids', 'results', 'cannon', 'destroyed']),
    }));
    const key = JSON.stringify(snap);
    if (S.savedSnap === `${S.code}:${key}`) return;
    S.savedSnap = `${S.code}:${key}`;
    snap.season = S.crew.games?.[S.code]?.season ?? S.crew.season?.n ?? 1;
    const patch = { [`games/${S.code}`]: snap };
    // Remember each member's character for next time.
    for (const p of Object.values(g.players)) if (p.member && CREW[p.avatar] && p.avatar !== 'skullking' && S.crew.members?.[p.member]) patch[`members/${p.member}/avatar`] = p.avatar;
    if (S.crew.current === S.code) patch.current = null;
    S.store.updateCrew(g.crew, patch).catch(err => console.warn('crew save', err));
  } else if (prev?.phase === 'done' && S.crew.games?.[S.code]) {
    S.savedSnap = null;
    S.store.updateCrew(g.crew, { [`games/${S.code}`]: null }).catch(() => {});
  }
}

const memberTile = (x, cls = '') => x?.avatar && CREW[x.avatar] ? avatarTile(x.avatar, cls)
  : `<span class="flag ava initial ${cls}" aria-hidden="true">${esc((x?.name || '?').slice(0, 1).toUpperCase())}</span>`;
const mname = m => S.crew?.members?.[m]?.name || '?';
const pct = x => `${Math.round(x * 100)}%`;
function fmtDate(at) {
  if (!at) return '';
  const loc = { zh: 'zh-CN', ms: 'ms-MY' }[getLang()] || 'en-GB';
  return new Date(at).toLocaleDateString(loc, { day: 'numeric', month: 'short', ...(new Date(at).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}
// Render a saved game with the helpers that read S.game (flags, chart, tables).
function withGame(g, fn) { const keep = S.game; S.game = g; try { return fn(); } finally { S.game = keep; } }

function noCrewView() {
  return `<div class="card"><h2>${t('No crew “{code}”', { code: esc(S.crewCode) })}</h2><p class="muted">${t('Check the code with whoever started the crew.')}</p>
    <button class="btn primary" data-act="home">${t('Back')}</button></div>`;
}

function crewHomeView(c) {
  const season = c.season?.n || 1, tab = S.crewTab === 'all' ? 'all' : 'season';
  const board = leaderboard(c, tab === 'all' ? null : season), games = crewGames(c);
  const champ = crewChampion(c), rec = records(c), past = pastSeasons(c);
  const live = c.current && !c.games?.[c.current] ? c.current : null;
  const shown = S.crewAll ? games : games.slice(0, 8);
  const recLine = (k, label, fmt) => rec[k] ? `<li>${icon({ highGame: 'up', lowGame: 'down', bigRound: 'streak', badRound: 'down', streak: 'target', wins: 'crown' }[k])}<span>${t(label)}: <b>${esc(mname(rec[k].member))}</b> ${fmt(rec[k])} <small>· ${fmtDate(rec[k].at)}</small></span></li>` : '';
  return `
  <div class="crew-top"><button class="link" data-act="home">${icon('exit', 'sm')}<span>${t('Home')}</span></button>
    <button class="code-chip" data-act="crew-share" aria-label="${t('Invite to the crew')}">${icon('share', 'sm')}${esc(S.crewCode)}</button></div>
  <section class="crew-hero"><h1>${esc(c.name)}</h1>
    <p>${tn(games.length, '{n} game played', '{n} games played')} · ${t('Season {n}', { n: season })}</p></section>
  ${crewGames(c, season).length >= 5 ? seasonChart(c, season) : ''}
  ${champ && c.members?.[champ] ? `<div class="card scored nailed champ"><div class="outcome">${avatarTile('skullking')}<div class="what">${t('{name} won the last game', { name: esc(mname(champ)) })}
    <small>${t('They sail as the Skull King next game.')}</small></div></div></div>` : ''}
  ${live ? `<button class="btn" data-act="open-game" data-code="${live}">${icon('lead')} ${t('Back to game {code}', { code: live })}</button>` : ''}
  <button class="btn primary" data-act="crew-new">${icon('plus')} ${t('New game')}</button>

  <div class="section-h"><h2 class="t3">${t('Leaderboard')}</h2></div>
  <div class="seg crew-seg" role="radiogroup" aria-label="${t('Leaderboard')}">
    <button type="button" role="radio" aria-checked="${tab === 'season'}" class="${tab === 'season' ? 'on' : ''}" data-act="crew-tab" data-v="season"><b>${t('Season {n}', { n: season })}</b></button>
    <button type="button" role="radio" aria-checked="${tab === 'all'}" class="${tab === 'all' ? 'on' : ''}" data-act="crew-tab" data-v="all"><b>${t('All time')}</b></button>
  </div>
  ${board.length ? `${new Set(board.map(x => x.wins)).size >= 3 ? crewLine(c, board) : ''}<div class="board podium crew-board">${board.map(x => `<button class="prow" data-act="member" data-m="${x.member}" style="--crew:${CREW[c.members?.[x.member]?.avatar]?.color || 'transparent'}">
      <span class="place">${board.filter(y => y.place === x.place).length > 1 ? '=' : ''}${x.place}</span>${memberTile(c.members?.[x.member])}
      <div class="who"><b><span class="nm">${esc(x.name)}</span>${x.place === 1 ? icon('crown', 'sm') : ''}</b><span>${tn(x.games, '{n} game', '{n} games')} · ${t('avg {n}', { n: plain(x.avg) })}</span></div>
      <span class="total">${tn(x.wins, '{n} win', '{n} wins')}</span>${icon('lead', 'sm chev')}</button>`).join('')}</div>
    <p class="small muted" style="margin:8px 2px 0">${t('Ranked by wins, then win rate, then average score. Tap a name for their stats.')}</p>
    ${crewGames(c, season).length < 5 ? seasonChart(c, season) : ''}`
    : `<p class="note">${t(tab === 'all' || !games.length ? 'No finished games yet. Play all 10 rounds and the game lands here.' : 'No games this season yet.')}</p>`}

  ${games.length ? `<details class="fold"><summary><h2 class="t3">${t('Records')}</h2>${icon('lead', 'sm')}</summary><ul class="hl records">
    ${recLine('highGame', 'Highest score', x => plain(x.value))}
    ${recLine('bigRound', 'Biggest round', x => `${signed(x.value)} (${t('Round {r}', { r: x.round })})`)}
    ${recLine('streak', 'Longest bid streak', x => tn(x.value, '{n} in a row', '{n} in a row'))}
    ${recLine('wins', 'Most wins in a row', x => tn(x.value, '{n} game', '{n} games'))}
    ${recLine('badRound', 'Worst round', x => `${signed(x.value)} (${t('Round {r}', { r: x.round })})`)}
    ${recLine('lowGame', 'Lowest score', x => plain(x.value))}
  </ul></details>` : ''}

  ${games.length ? `<div class="section-h"><h2 class="t3">${t('Games')}</h2><span>${tn(games.length, '{n} game', '{n} games')}</span></div>
  <div class="board game-log">${shown.map(g => {
    const rows = gameRows(g), w = rows.filter(x => x.place === 1);
    return `<button class="prow" data-act="pastgame" data-code="${g.code}">${memberTile(c.members?.[w[0]?.member] || { name: w[0]?.name, avatar: w[0]?.avatar })}
      <div class="who"><b><span class="nm">${t('{name} won', { name: esc(w.map(x => x.name).join(' & ')) })}</span></b><span>${fmtDate(g.at)} · ${tn(rows.length, '{n} player', '{n} players')}${g.season !== season ? ` · <span class="nowrap">${t('Season {n}', { n: g.season })}</span>` : ''}</span></div>
      <span class="total">${plain(w[0]?.total ?? 0)}</span>${icon('lead', 'sm chev')}</button>`;
  }).join('')}</div>
  ${games.length > shown.length ? `<button class="link" data-act="crew-more">${t('Show all {n} games', { n: games.length })}</button>` : ''}` : ''}

  ${past.length ? `<details class="fold"><summary><h2 class="t3">${t('Past seasons')}</h2>${icon('lead', 'sm')}</summary>
  <div class="board">${past.map(s => `<div class="prow">${memberTile(c.members?.[s.champion])}
    <div class="who"><b>${t('Season {n}', { n: s.n })}</b><span>${fmtDate(s.start)} – ${fmtDate(s.end)} · ${tn(s.games, '{n} game', '{n} games')}</span></div>
    <span class="chip">${icon('crown')}${esc(s.champion ? mname(s.champion) : '–')}</span></div>`).join('')}</div></details>` : ''}

  <div class="crew-actions">
    <button class="btn" data-act="crew-share">${icon('share')} ${t('Invite to the crew')}</button>
    <button class="btn ghost" data-act="new-season">${icon('streak')} ${t('Start a new season')}</button>
    <button class="btn ghost" data-act="forget-crew">${icon('exit')} ${t('Remove this crew from this phone')}</button>
  </div>`;
}

// The leaderboard as a Standings Line: wins along the chart, tied sailors share a marker.
function crewLine(c, board) {
  const hi = Math.max(2, ...board.map(x => x.wins) ) + 1, pos = v => (v / hi) * 100;
  const groups = [];
  for (const x of [...board].sort((a, b) => a.wins - b.wins)) {
    const last = groups[groups.length - 1];
    if (last && last.v === x.wins) last.xs.push(x); else groups.push({ v: x.wins, xs: [x] });
  }
  const top = Math.max(...board.map(x => x.wins)), ends = [];
  const markers = groups.map(gr => {
    const x = pos(gr.v), solo = gr.xs.length === 1, w = 30 + (gr.xs.length - 1) * 4;
    let lane = ends.findIndex(e => x - e >= w); if (lane < 0) { lane = ends.length; ends.push(x); } else ends[lane] = x;
    const faces = solo ? memberTile(c.members?.[gr.xs[0].member]) : `<span class="faces">${gr.xs.map(m => memberTile(c.members?.[m.member])).join('')}</span>`;
    const edge = x < 12 ? 'edge-l' : x > 88 ? 'edge-r' : '';
    return `<div class="marker ${gr.v === top && top > 0 ? 'lead' : ''} ${edge}" data-id="crew-${gr.xs[0].member}" style="--x:${x.toFixed(2)}%;--lane:${lane}">
      <span class="stem"></span><span class="tag">${gr.v === top && top > 0 ? icon('crown', 'crown') : ''}${faces}${solo ? `<span class="nm-cut">${esc(gr.xs[0].name)}</span> ` : ''}<b>${gr.v}</b></span></div>`;
  }).join('');
  let ticks = '';
  for (let v = 0; v <= hi; v++) ticks += `<span class="tick ${v === 0 ? 'zero' : ''}" style="left:${pos(v)}%">${v}</span>`;
  const bands = [1, 2, 3].map(i => `<span class="band b${i}" style="left:${((i - 1) / 3) * 100}%" aria-hidden="true"></span>`).join('')
    + `<span class="water-label shoal" aria-hidden="true">${t('shallows')}</span><span class="water-label deep" aria-hidden="true">${t('deep water')}</span>`;
  return `<div class="standings crew-line" role="img" aria-label="${t('Wins')}: ${esc(board.map(x => `${x.name} ${x.wins}`).join(', '))}">
    <div class="lanes" style="--lanes:${Math.max(1, ends.length)}">${bands}${markers}</div><div class="scale">${ticks}</div></div>`;
}

// One sailor's record: their score in every game, wins in brass, best and worst marked.
function recordChart(c, m) {
  const gs = memberGames(c, m);
  if (gs.length < 2) return '';
  const W = 340, H = 150, L = 34, R = 14, T = 16, B = 22;
  const vals = gs.map(g => g.total), lo = Math.min(0, ...vals), hi = Math.max(10, ...vals);
  const x = i => L + (i / (gs.length - 1)) * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const best = vals.indexOf(Math.max(...vals)), worst = vals.indexOf(Math.min(...vals));
  const step = Math.max(50, Math.ceil((hi - lo) / 3 / 50) * 50);
  let grid = '';
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid += `<line class="${v === 0 ? 'zero' : 'grid'}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 5}" y="${y(v) + 4}" text-anchor="end">${plain(v)}</text>`;
  const col = CREW[c.members?.[m]?.avatar]?.color || 'var(--ink-2)';
  const dots = gs.map((g, i) => `<circle cx="${x(i)}" cy="${y(g.total)}" r="${g.place === 1 ? 5 : 3.2}" class="${g.place === 1 ? 'win' : 'pt'}"/>`).join('');
  const label = (i, txt, cls) => `<text x="${Math.min(W - R, Math.max(L, x(i)))}" y="${y(vals[i]) + (cls === 'worst' ? 16 : -9)}" text-anchor="middle" class="mark-${cls}">${txt}</text>`;
  return `<div class="card record"><div class="section-h" style="margin:0 0 4px"><h3 class="t3">${t('Every game')}</h3><span>${t('gold dot = a win')}</span></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Scores game by game')}: ${gs.map(g => `${plain(g.total)}${g.place === 1 ? ` (${t('won')})` : ''}`).join(', ')}">${grid}
    <polyline points="${gs.map((g, i) => `${x(i).toFixed(1)},${y(g.total).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="2.25" stroke-linejoin="round"/>${dots}
    ${label(best, plain(vals[best]), 'best')}${worst !== best ? label(worst, plain(vals[worst]), 'worst') : ''}</svg></div>`;
}

// The season as a voyage chart: each game a sounding along the bottom, each sailor a line of
// wins so far, ending on their character. Same dash patterns and colours as the game chart.
function seasonChart(c, season) {
  const games = crewGames(c, season).reverse();
  if (games.length < 5) return '';
  const board = leaderboard(c, season), ids = board.map(x => x.member);
  const n = games.length, W = 340, H = 170, L = 26, R = 30, T = 14, B = 22;
  const lines = Object.fromEntries(ids.map(m => [m, [0]]));
  for (const g of games) {
    const won = new Set(gameRows(g).filter(x => x.place === 1).map(x => x.member));
    for (const m of ids) { const a = lines[m]; a.push(a[a.length - 1] + (won.has(m) ? 1 : 0)); }
  }
  const hi = Math.max(1, ...ids.map(m => lines[m][n]));
  const x = i => L + (i / n) * (W - L - R), y = v => T + (1 - v / hi) * (H - T - B);
  const colr = (m, i) => CREW[c.members?.[m]?.avatar]?.color || COLORS[i % COLORS.length];
  let grid = '';
  for (let v = 0; v <= hi; v++) grid += `<line class="${v ? 'grid' : 'zero'}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 5}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  games.forEach((g, i) => { grid += `<text x="${x(i + 1)}" y="${H - 6}" text-anchor="middle">${i + 1}</text>`; });
  // Lift end markers apart when lines finish on the same number.
  const ends = spreadEnds(ids.map(m => ({ m, y: y(lines[m][n]) - 7 })), 15, T - 6, H - B - 8);
  const paths = ids.map((m, i) => {
    const off = (i - (ids.length - 1) / 2) * 1.6, L2 = lines[m];
    const pts = L2.map((v, j) => j ? `${x(j).toFixed(1)},${(y(L2[j - 1]) + off).toFixed(1)} ${x(j).toFixed(1)},${(y(v) + off).toFixed(1)}` : `${x(0).toFixed(1)},${(y(v) + off).toFixed(1)}`).join(' ');
    const a = c.members?.[m]?.avatar, ey = ends.find(e => e.m === m).y, ex = x(n) + 4;
    const mark = CREW[a] ? `<svg x="${ex}" y="${ey}" width="14" height="14" viewBox="0 0 16 16" shape-rendering="crispEdges">${spriteRects(a)}</svg>`
      : `<circle cx="${ex + 7}" cy="${ey + 7}" r="7" fill="${colr(m, i)}"/><text x="${ex + 7}" y="${ey + 11}" text-anchor="middle" class="ini">${esc(mname(m).slice(0, 1).toUpperCase())}</text>`;
    return `<polyline points="${pts}" fill="none" stroke="${colr(m, i)}" stroke-width="2.25" stroke-dasharray="${DASHES[i % 8]}" stroke-linejoin="round" stroke-linecap="round"/>${mark}`;
  }).join('');
  return `<div class="card voyage"><div class="section-h" style="margin:0 0 6px"><h2 class="t3">${t('Season {n} voyage', { n: season })}</h2><span>${t('wins after each game')}</span></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Wins so far this season')}: ${esc(board.map(b => `${b.name} ${b.wins}`).join(', '))}">${grid}${paths}</svg>
    <div class="legend">${ids.map((m, i) => `<span><svg class="dash" viewBox="0 0 24 4" aria-hidden="true"><line x1="1" y1="2" x2="23" y2="2" stroke="${colr(m, i)}" stroke-width="2.25" stroke-dasharray="${DASHES[i % 8]}" stroke-linecap="round"/></svg>${memberTile(c.members?.[m])}${esc(mname(m))}</span>`).join('')}</div></div>`;
}

// Push labels apart (top to bottom) so none sit closer than `gap`, keeping them inside [lo, hi].
function spreadEnds(items, gap, lo, hi) {
  const s = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < s.length; i++) s[i].y = Math.max(s[i].y, s[i - 1].y + gap);
  const over = s.length ? s[s.length - 1].y - hi : 0;
  if (over > 0) { for (const e of s) e.y -= over; for (let i = s.length - 2; i >= 0; i--) s[i].y = Math.min(s[i].y, s[i + 1].y - gap); }
  for (const e of s) e.y = Math.max(lo, e.y);
  return s;
}

function memberSheet(s) {
  const c = S.crew, x = c?.members?.[s.m];
  if (!x) return '';
  const st = playerStats(c, s.m);
  const cell = (label, value, sub = '') => `<div class="stat"><span>${t(label)}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  return `<div class="member-head">${memberTile(x, 'big')}<div><b>${esc(x.name)}</b><small>${t('All seasons with {crew}', { crew: esc(c.name) })}</small>
    ${st.title ? `<span>${icon(st.title.icon, 'sm')}${t(st.games > 1 ? 'Most common award: {title}' : 'Award: {title}', { title: esc(st.title.title) })}</span>` : ''}</div></div>
  ${st.games ? `<div class="soundings">
    ${cell('Games', st.games)}${cell('Wins', st.wins, pct(st.rate))}${cell('Average score', plain(st.avg))}${cell('Bid accuracy', pct(st.accuracy))}
  </div>
  ${recordChart(c, s.m)}
  <ul class="log">
    ${st.bestGame ? `<li><span>${t('Best game')}</span><b>${plain(st.bestGame.total)}</b><small>${fmtDate(st.bestGame.at)}</small></li>` : ''}
    ${st.bestRound ? `<li><span>${t('Best round')}</span><b>${signed(st.bestRound.score)}</b><small>${t('Round {r}', { r: st.bestRound.round })} · ${fmtDate(st.bestRound.at)}</small></li>` : ''}
    <li><span>${t('Bids made')}</span><b>${st.made}</b><small>${t('{n} of {m} rounds', { n: st.made, m: st.rounds })}</small></li>
    <li><span>${t('Zero bids nailed')}</span><b>${st.zeros}</b><small></small></li>
    ${st.favourite ? `<li><span>${t('Favourite character')}</span><b class="fav">${avatarTile(st.favourite)}${esc(t(CREW[st.favourite].name))}</b><small></small></li>` : ''}
  </ul>
  ${st.rivals.length ? `<div class="section-h"><h3 class="t3">${t('Head to head')}</h3><span>${t('ahead – behind')}</span></div>
    <div class="board rivals">${st.rivals.map(v => `<div class="prow">${memberTile(c.members?.[v.member])}
      <div class="who"><b><span class="nm">${t('vs {name}', { name: esc(mname(v.member)) })}</span></b><span>${tn(v.together, '{n} game together', '{n} games together')}${v.together - v.ahead - v.behind ? ` · ${tn(v.together - v.ahead - v.behind, '{n} tie', '{n} ties')}` : ''}</span></div>
      <span class="h2h" aria-label="${t('Finished ahead {a} times, behind {b} times', { a: v.ahead, b: v.behind })}"><b class="${v.ahead > v.behind ? 'good-t' : v.ahead < v.behind ? 'bad-t' : ''}">${v.ahead}–${v.behind}</b></span></div>`).join('')}</div>
` : ''}`
    : `<p class="note">${t('No finished games yet.')}</p>`}`;
}

function pastGameSheet(s) {
  const c = S.crew, raw = c?.games?.[s.code];
  if (!raw) return '';
  const g = { ...raw, phase: 'done', round: raw.round || 10 };
  return withGame(g, () => {
    const rank = ranking(g), aw = awards(g);
    S.readOnlyTable = true;
    try {
      return `<p class="small muted" style="margin-top:0">${esc(rulesLine(g))}${raw.season ? ` · ${t('Season {n}', { n: raw.season })}` : ''}</p>
      <div class="board podium">${rank.map(r => `<div class="prow"><span class="place">${r.place}</span>${flag(r.id)}<div class="who"><b><span class="nm">${esc(r.name)}</span>${r.place === 1 ? icon('crown', 'sm') : ''}</b>${aw[r.id] ? `<span>${esc(aw[r.id].title)}</span>` : ''}</div><span class="total">${plain(r.total)}</span></div>`).join('')}</div>
      <div class="card" style="margin-top:12px"><h2 class="t3">${t('The voyage')}</h2>${chartSVG(g)}</div>
      ${scoresSheet()}
      <button class="link" data-act="remove-game" data-code="${s.code}">${icon('close', 'sm')}<span>${t('Remove this game from the history')}</span></button>`;
    } finally { S.readOnlyTable = false; }
  });
}

function crewShareSheet() {
  return `<div class="share"><p class="muted small" style="margin:0">${t('Everyone in the group opens this once; their phone remembers the crew.')}</p>
    <div class="big-code">${esc(S.crewCode)}</div><div class="qr" id="qr" data-url="${esc(crewURL(S.crewCode))}"></div>${shareButtons(crewURL(S.crewCode))}</div>`;
}

function newCrewSheet() {
  return `<p class="small muted" style="margin-top:0">${t('A crew keeps every finished game, a leaderboard and everyone’s stats, shared by the whole group. One-off games still work without one.')}</p>
  <form class="add-player" data-form="new-crew"><input type="text" name="name" maxlength="30" placeholder="${t('Crew name, e.g. Friday Pirates')}" aria-label="${t('Crew name')}" autocomplete="off" required>
    <button class="btn primary">${t('Start the crew')}</button></form>`;
}

// ---------- players joining and leaving mid-game ----------
const PIDS = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
// The first round a player added now would play: this round if bids are still open.
const joinRound = g => g.phase === 'lobby' ? 1 : g.phase === 'bidding' ? g.round : g.round + 1;
function rosterSheet() {
  const g = S.game, r = g.round, ps = sortedPlayers(g).filter(p => !gone(g, p));
  const from = joinRound(g), full = !PIDS.some(id => !g.players[id]);
  const status = p => {
    if (p.left != null) return `<span class="chip">${t('Leaves after this round')}</span><button class="btn mini" data-act="keep-player" data-id="${p.id}">${t('Keep')}</button>`;
    if ((p.from || 1) > r && g.phase !== 'lobby') return `<span class="chip">${t('Joins round {r}', { r: p.from })}</span><button class="btn mini" data-act="rm-player" data-id="${p.id}" aria-label="${t('Remove {name}', { name: esc(p.name) })}">${t('Remove')}</button>`;
    return p.id === S.seat ? `<span class="chip">${t('You')}</span>` : `<button class="btn mini" data-act="rm-player" data-id="${p.id}" aria-label="${t('Remove {name}', { name: esc(p.name) })}">${t('Remove')}</button>`;
  };
  return `<div class="board roster">${ps.map(p => `<div class="prow" style="--crew:${color(p.id)}">${flag(p.id)}
      <div class="who"><b><span class="nm">${esc(p.name)}</span></b></div><span class="roster-act">${status(p)}</span></div>`).join('')}</div>
  ${from > ROUNDS ? `<p class="small muted">${t('It’s the last round, so nobody new can join this game.')}</p>`
    : full ? `<p class="small muted">${t('All 8 seats are used in this game.')}</p>`
    : `<form class="add-player" data-form="add-player">
      <h3 class="t3">${t('Add a player')}</h3>
      <input type="text" name="name" maxlength="24" placeholder="${t('Name')}" autocomplete="off" aria-label="${t('Name')}" required>
      <label class="small muted" for="sits-after">${t('Sits after')}</label>
      <select id="sits-after" name="after">${ps.map((p, i) => `<option value="${p.id}" ${i === ps.length - 1 ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <button class="btn primary">${t('Add player')}</button>
      <p class="small muted" style="margin:0">${g.phase === 'lobby' ? t('They play from round 1.') : t('They play from round {r}; earlier rounds count as 0.', { r: from })}</p>
    </form>`}`;
}

function addPlayer(nm) {
  const g = S.game, from = joinRound(g), after = document.getElementById('sits-after')?.value;
  const ps = sortedPlayers(g).filter(p => !gone(g, p));
  if (!nm) return;
  if (ps.some(p => p.name.toLowerCase() === nm.toLowerCase())) return toast(t('Names must be different'));
  const id = PIDS.find(x => !g.players[x]);
  if (!id || from > ROUNDS) return;
  const at = (g.players[after]?.order ?? Math.max(...Object.values(g.players).map(p => p.order))) + 1;
  let member = null;
  if (g.crew && S.crew) {
    const cp = {};
    member = memberFor(nm, cp);
    if (Object.keys(cp).length) S.store.updateCrew(g.crew, cp).catch(() => {});
  }
  const patch = { [`players/${id}`]: { name: nm, order: at, ...(from > 1 ? { from } : {}), ...(member ? { member } : {}) } };
  for (const [pid, p] of Object.entries(g.players)) if (p.order >= at) patch[`players/${pid}/order`] = p.order + 1;
  update(patch);
  toast(from > 1 ? t('{name} joins from round {r}', { name: nm, r: from }) : t('{name} joined the crew', { name: nm }));
}

async function removePlayer(pid) {
  const g = S.game, r = g.round, p = g.players[pid];
  const now = g.phase === 'lobby' || g.phase === 'bidding' || (p.from || 1) > r;
  const left = now ? Math.max(r, p.from || 1) : r + 1;
  if (playersIn({ ...g, players: { ...g.players, [pid]: { ...p, left } } }, Math.min(left, ROUNDS)).length < 2) return toast(t('A game needs at least 2 players'));
  const msg = g.phase === 'lobby' || (p.from || 1) > r ? t('Remove {name} from the game?', { name: p.name })
    : g.phase === 'bidding' ? t('{name} leaves now and sits out this round. If the cards are already dealt, deal again without them.', { name: p.name })
    : t('{name} leaves after this round. Their score so far stays on the board.', { name: p.name });
  const back = S.sheet;
  const ok = ask(t('Remove {name}?', { name: p.name }), msg, t('Remove'));
  S.ask.back = back;
  if (!(await ok)) return;
  const patch = { [`players/${pid}/left`]: left };
  if (g.phase === 'bidding') Object.assign(patch, { [`bids/${r}/${pid}`]: null, [`cannon/${r}/${pid}`]: null });
  update(patch);
}

function actForSheet() {
  return `<p class="small muted" style="margin-top:0">${t("For when someone's phone is dead or away. Your screen will act as them until you tap Done.")}</p>
  <div class="seat-list">${playersIn(S.game, S.game.round).filter(p => p.id !== S.seat).map(p =>
    `<button class="btn" data-act="act-as" data-id="${p.id}">${flag(p.id)}${esc(p.name)}</button>`).join('')}</div>`;
}

function shareSheet() {
  return `<div class="share"><div class="big-code">${esc(S.code)}</div><div class="qr" id="qr"></div>${shareButtons()}</div>`;
}

function rulesSheet() {
  const rows = list => list.map(([k, v]) => `<tr><td>${esc(t(k))}</td><td>${esc(t(v))}</td></tr>`).join('');
  const items = list => list.map(k => `<li>${esc(t(k))}</li>`).join('');
  return `<div class="rules">
  ${S.game ? `<p class="note" style="margin-top:0">${t('This game:')} ${esc(rulesLine(S.game))}</p>` : ''}
  <h2 class="t3">${t('Scoring')}</h2>
  <table>${rows([
    ['Bid 1+ and hit it exactly', '+20 per trick'],
    ['Bid 1+ and miss', '−10 per trick off'],
    ['Bid 0 and take no tricks', '+10 × round'],
    ['Bid 0 and take any trick', '−10 × round'],
  ])}</table>
  <h2 class="t3">${t('Bonus points')} <span>${t('only if your bid is made')}</span></h2>
  <table>${rows([
    ['Each yellow, purple or green 14 in your tricks', '+10'],
    ['Black 14 in your tricks', '+20'],
    ['Each Mermaid captured by your Pirate', '+20'],
    ['Each Pirate captured by your Skull King', '+30'],
    ['Skull King captured by your Mermaid', '+40'],
  ])}</table>
  <h2 class="t3">${t('Who wins a trick')}</h2>
  <ul>${items([
    'Follow the suit that was led if you can. Special cards may always be played instead.',
    'Highest card of the led suit wins, unless a black card (trump) is played: highest black wins.',
    'Pirates beat every numbered card. Skull King beats Pirates. Mermaids beat numbered cards and the Skull King, but lose to Pirates.',
    'If a Pirate, the Skull King and a Mermaid all land in one trick, the Mermaid wins.',
    'Ties between the same special card: the first one played wins.',
    'Escape cards always lose. If everyone plays Escape, the first one played wins.',
    'Tigress: when you play it, announce Pirate or Escape.',
    'If an Escape or special card leads, the next numbered card played sets the suit.',
  ])}</ul>
  <h2 class="t3">${t('Rascal scoring')} <span>${t('optional')}</span></h2>
  <ul>${items([
    'Every round is worth 10 points per card dealt, whatever you bid.',
    'Hit your bid: all of it plus bonuses. Off by one: half of everything. Off by more: nothing.',
    'Cannonball: reveal it with your bid. 15 points per card if exact, nothing otherwise.',
  ])}</ul>
  <h2 class="t3">${t('Expansion cards')} <span>${t('optional')}</span></h2>
  <ul>${items([
    'Kraken: the trick is destroyed and nobody wins it. Whoever would have won leads next.',
    "White Whale: special cards lose their power; the highest number wins, any suit. If only special cards were played, the trick is destroyed and the Whale's player leads.",
    'If both the Kraken and the White Whale land in one trick, the second one played counts.',
    "Loot: plays like an Escape. Whoever wins the trick forms an alliance with the Loot's player: if both make their bids, each gets +20.",
  ])}</ul>
  <h2 class="t3">${t('Reading the board')}</h2>
  <ul>${items([
    'The Standings Line is a sea chart: further right, into deep water, means a higher score.',
    'A crown marks the leader. Players on the same score share one marker.',
  ])}</ul>
  <h2 class="t3">${t('Rounds')}</h2>
  <p class="muted" style="margin-top:0">${t('10 rounds; round N deals N cards. The deal passes left each round. House rule: the player after the dealer leads every trick of the round.')}</p>
  </div>`;
}

// One-tap card ranks for the middle of a hand: the ladder, the triangle, then the odd cards.
function cheatSheet() {
  const g = S.game, exp = g?.expansions || {};
  const swatch = (cls, n = '14') => `<span class="suit ${cls}" aria-hidden="true">${n}</span>`;
  // Card faces, not crew characters: a card-shaped tile with the card's own mark.
  const face = (cls, mark) => `<span class="card-face ${cls}" aria-hidden="true">${mark}</span>`;
  const king = face('king', '<svg viewBox="0 0 64 64"><use href="#i-mark"/></svg>'), pirate = face('pirate', icon('swords')),
    mermaid = face('mermaid', icon('tail')), escape = face('escape', icon('flag'));
  const step = (art, title, line) => `<li>${art}<div><b>${esc(t(title))}</b><span>${esc(t(line))}</span></div></li>`;
  const notes = [
    'Tigress: you choose. Play her as a Pirate or as an Escape.',
    'Same special cards in one trick: the first one played wins.',
    'Pirate, Skull King and Mermaid all in one trick: the Mermaid wins.',
  ];
  // What this game's optional rules do, only when they're switched on.
  const extras = [
    ...(g?.scoring === 'rascal' ? [
      ['target', 'Grapeshot', 'Your usual bid: 10 points a card if exact, half if you miss by one, nothing if by more.'],
      ['cannon', 'Cannonball', 'Call it with your bid: 15 points a card if exact, nothing if you miss at all.'],
    ] : []),
    ...(exp.kraken ? [['kraken', 'Kraken', 'The trick is destroyed: nobody wins it. Whoever would have won leads next.']] : []),
    ...(exp.whale ? [['whale', 'White Whale', 'Special cards lose their power: the highest number wins, any suit.']] : []),
    ...(exp.loot ? [['loot', 'Loot', 'Plays like an Escape. You and whoever wins the trick both get +20 if you both make your bids.']] : []),
  ];
  return `<p class="small muted" style="margin-top:0">${t('Strongest at the top. Follow the suit that was led if you can; special cards can always be played.')}</p>
  <ol class="ladder">
    ${step(king, 'Skull King', 'Beats Pirates and everything below')}
    ${step(pirate, 'Pirate', 'Beats Mermaids and every number')}
    ${step(mermaid, 'Mermaid', 'Beats every number')}
    ${step(swatch('black'), 'Black suit (trump)', 'Beats any coloured card')}
    ${step(`<span class="suits">${swatch('yellow', '')}${swatch('purple', '')}${swatch('green')}</span>`, 'Yellow, purple, green', 'Highest card of the suit that was led')}
    ${step(escape, 'Escape', 'Always loses')}
  </ol>
  <div class="twist">
    <p><b>${t('The twist')}</b> ${t('The Mermaid catches the Skull King.')}</p>
    <div class="cycle" role="img" aria-label="${t('Skull King beats Pirate, Pirate beats Mermaid, Mermaid beats Skull King')}">
      ${king}<span>${icon('lead', 'sm')}<small>${t('beats')}</small></span>${pirate}<span>${icon('lead', 'sm')}<small>${t('beats')}</small></span>${mermaid}<span>${icon('lead', 'sm')}<small>${t('beats')}</small></span>${king}
    </div>
  </div>
  <ul class="hl">${notes.map(n => `<li>${icon('check', 'sm')}<span>${esc(t(n))}</span></li>`).join('')}</ul>
  ${extras.length ? `<h3 class="t3" style="margin:18px 2px 8px">${t('In this game')}</h3>
  <ul class="hl extras">${extras.map(([ic, name, line]) => `<li>${icon(ic, 'sm')}<span><b>${esc(t(name))}</b> ${esc(t(line))}</span></li>`).join('')}</ul>` : ''}`;
}

// ---------- actions ----------
const actions = {
  home() { S.sheet = null; S.actingFor = null; location.hash = ''; S.setup = null; render(); },
  'crew-home'() { S.sheet = null; S.setup = null; render(); },
  new() { S.setup = { names: ['', '', '', ''], dealer: 0, scoring: 'classic', exp: {} }; render(); document.querySelector('[data-form=setup] input')?.focus(); },
  'cancel-setup'() { S.setup = null; render(); },
  'add-name'() { syncSetupInputs(); S.setup.names.push(''); S.setup.members?.push(null); render(); document.querySelector(`[data-idx="${S.setup.names.length - 1}"]`)?.focus(); },
  'rm-name'(el) { syncSetupInputs(); const i = +el.dataset.i; S.setup.names.splice(i, 1); S.setup.members?.splice(i, 1); if (S.setup.dealer >= S.setup.names.length || S.setup.dealer === i) S.setup.dealer = 0; render(); },
  'move-up'(el) {
    syncSetupInputs();
    const i = +el.dataset.i, s = S.setup, swap = a => { [a[i - 1], a[i]] = [a[i], a[i - 1]]; };
    swap(s.names); if (s.members) swap(s.members);
    if (s.dealer === i) s.dealer = i - 1; else if (s.dealer === i - 1) s.dealer = i;
    render();
    document.querySelector(`[data-act="move-up"][data-i="${Math.max(1, i - 1)}"]`)?.focus();
  },
  'add-member'(el) {
    syncSetupInputs();
    if (S.setup.names.length >= 8) return toast(t('All 8 seats are used in this game.'));
    const m = el.dataset.m;
    S.setup.names.push(S.crew.members[m].name); S.setup.members.push(m);
    render();
  },
  'set-dealer'(el) { syncSetupInputs(); S.setup.dealer = +el.dataset.i; render(); },
  'set-scoring'(el) { syncSetupInputs(); S.setup.scoring = el.dataset.v; render(); },
  'toggle-exp'(el) { syncSetupInputs(); S.setup.exp[el.dataset.k] = !S.setup.exp[el.dataset.k]; render(); },
  rules() { S.sheet = { kind: 'rules' }; renderSheet(); },
  'new-crew'() { S.sheet = { kind: 'newcrew' }; renderSheet(); },
  'open-crew'(el) { S.sheet = null; location.hash = `crew=${el.dataset.c}`; window.scrollTo(0, 0); },
  // Home's "New game with <crew>": open the crew and go straight to its game setup once it loads.
  'crew-quick'(el) {
    const c = el.dataset.c;
    S.quickStart = c; location.hash = `crew=${c}`;
    // Already following this crew: no fresh load will arrive, so start right away.
    if (S.crew && S.crewWatching === c) { S.crewCode = c; S.quickStart = null; actions['crew-new'](); }
  },
  'crew-new'() {
    const c = S.crew, seat = usualSeating(c), last = crewGames(c)[0];
    const members = seat.recent.length ? seat.recent : seat.others.slice(0, 8);
    S.setup = { crew: S.crewCode, members: [...members], names: members.map(m => c.members[m].name), dealer: 0,
      scoring: last?.scoring || 'classic', exp: { ...(last?.expansions || {}) } };
    if (S.setup.names.length < 2) { S.setup.names.push(...Array(2 - S.setup.names.length).fill('')); S.setup.members.push(...Array(2).fill(null)); S.setup.members.length = S.setup.names.length; }
    render(); window.scrollTo(0, 0);
  },
  'crew-share'() { S.sheet = { kind: 'crewshare' }; renderSheet(); },
  'crew-tab'(el) { S.crewTab = el.dataset.v; render(); document.querySelector(`[data-act="crew-tab"][data-v="${el.dataset.v}"]`)?.focus({ preventScroll: true }); },
  'crew-more'() { S.crewAll = true; render(); },
  member(el) { S.sheet = { kind: 'member', m: el.dataset.m }; renderSheet(); },
  pastgame(el) { S.sheet = { kind: 'pastgame', code: el.dataset.code }; renderSheet(); },
  async 'new-season'() {
    const c = S.crew, n = c.season?.n || 1;
    if (!(await ask(t('Start season {n}?', { n: n + 1 }), t('Start season {n}? The current leaderboard is saved with its champion and a fresh one begins.', { n: n + 1 }), t('Start season {n}', { n: n + 1 })))) return;
    S.store.updateCrew(S.crewCode, { season: { n: n + 1, start: Date.now() }, [`seasons/${n}`]: { start: c.season?.start || c.createdAt, end: Date.now() } })
      .then(() => toast(t('Season {n} has begun', { n: n + 1 }))).catch(() => toast(t("Couldn't save that. Check your connection.")));
  },
  async 'forget-crew'() {
    if (!(await ask(t('Remove {name}?', { name: S.crew?.name || '' }), t('Remove {name} from this phone? The crew and its history stay; you can rejoin with the code.', { name: S.crew?.name || '' }), t('Remove')))) return;
    saveCrews(myCrews().filter(c => c.code !== S.crewCode));
    location.hash = '';
  },
  async 'remove-game'(el) {
    const code = el.dataset.code, ok = ask(t('Remove this game from the history?'), t('Its scores leave the leaderboard and stats. This can’t be undone.'), t('Remove'));
    if (!(await ok)) return;
    S.store.updateCrew(S.crewCode, { [`games/${code}`]: null });
    toast(t('Removed'));
  },
  cheat() { S.sheet = { kind: 'cheat' }; renderSheet(); },
  roster() { S.sheet = { kind: 'roster' }; renderSheet(); },
  'rm-player'(el) { removePlayer(el.dataset.id); },
  'keep-player'(el) { update({ [`players/${el.dataset.id}/left`]: null }); },
  'set-lang'(el) {
    setLang(el.dataset.v);
    render(); renderSheet();
    document.querySelector(`[data-act="set-lang"][data-v="${el.dataset.v}"]`)?.focus({ preventScroll: true });
  },
  'toggle-sound'() {
    S.sound = !S.sound;
    try { localStorage.setItem('sk.sound', S.sound ? 'on' : 'off'); } catch {}
    renderSheet();
    if (S.sound) { chime(); buzz(40); }
    document.querySelector('[data-act="toggle-sound"]')?.focus({ preventScroll: true });
  },
  'reload-app'() { location.reload(); },
  'tv-sound'() { try { audio ||= new AudioContext(); audio.resume().then(() => { chime(); render(); }).catch(() => {}); } catch {} },
  'tv-sound-off'() { try { localStorage.setItem('sk.tvSound', 'off'); } catch {} render(); },
  async install() { const e = installEvent; installEvent = null; if (e) { e.prompt(); await e.userChoice.catch(() => {}); } actions['install-dismiss'](); },
  'install-dismiss'() { try { localStorage.setItem('sk.installTip', 'done'); } catch {} render(); },
  'app-hint-dismiss'() { try { sessionStorage.setItem('sk.appHint', 'done'); } catch {} render(); },
  'open-game'(el) { location.hash = el.dataset.code; },
  scores() { S.sheet = { kind: 'scores' }; renderSheet(); },
  menu() { S.sheet = { kind: 'menu' }; renderSheet(); },
  share() { S.sheet = { kind: 'share' }; renderSheet(); },
  close() {
    if (S.sheet?.kind === 'edit') delete S.drafts[`${S.sheet.r}:${S.sheet.id}`];
    const a = S.ask; S.ask = null; S.sheet = a?.back || null; renderSheet(); a?.res(false);
  },
  'ask-yes'() { const a = S.ask; S.ask = null; S.sheet = a?.back || null; renderSheet(); a?.res(true); },
  async seat(el) {
    const id = el.dataset.id, holder = S.game.presence?.[id];
    if (id !== 'watch' && holder && holder !== DEVICE && !(await ask(t('Take over this seat?'), t('{name} is already open on another phone. Take over this seat here?', { name: name(id) }), t('Take over')))) return;
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
    toast(t('Nudged {name}', { name: name(el.dataset.id) }));
  },
  cannon(el) {
    const g = S.game, who = me();
    if (g.phase !== 'bidding' || !who) return;
    update({ [`cannon/${g.round}/${who}`]: el.dataset.v === '1' });
  },
  'edit-cannon'(el) { S.sheet.cannon = el.dataset.v === '1'; renderSheet(); },
  destroy(el) {
    const g = S.game, r = g.round, cur = g.destroyed?.[r] || 0, next = Math.max(0, Math.min(2, cur + +el.dataset.d));
    update({ [`destroyed/${r}`]: next || null });
  },
  'open-actfor'() { S.sheet = { kind: 'actfor' }; renderSheet(); },
  'act-as'(el) { S.actingFor = el.dataset.id; S.sheet = null; render(); window.scrollTo(0, 0); },
  'stop-acting'() { S.actingFor = null; render(); },
  async 'copy-link'(el) { const u = el.dataset.url || shareURL(); try { await navigator.clipboard.writeText(u); toast(t('Link copied')); } catch { toast(u); } },
  'native-share'(el) {
    const text = el.dataset.url ? t('Join our Skull King crew: {name}', { name: S.crew?.name || '' }) : t('Join our Skull King game: {code}', { code: S.code });
    navigator.share({ title: 'Skull King', text, url: el.dataset.url || shareURL() }).catch(() => {});
  },
  start() { update({ phase: 'bidding', round: 1 }); },
  noop() {},
  'pick-crew'(el) {
    const id = el.dataset.c;
    S.picking = false;
    update({ [`players/${S.seat}/avatar`]: id });
    toast(t('{name} sails as {crew}', { name: name(S.seat), crew: t(CREW[id].name) }));
  },
  'crew-done'() { S.picking = false; render(); },
  'crew-skip'() { (S.skipPick ||= {})[S.code] = true; S.picking = false; render(); },
  'change-crew'() { S.sheet = null; S.picking = true; render(); window.scrollTo(0, 0); },
  'change-bid'() { S.changing = true; render(); document.querySelector('[data-act="bid"].on')?.focus(); },
  // A bid locks in after a short beat, so a mis-tap on a phone lying flat can be changed
  // before it counts (and before a last bid sets off the reveal).
  bid(el) {
    const g = S.game, r = g.round, who = me();
    if (g.phase !== 'bidding' || !who) return;
    clearTimeout(S.bidTimer);
    S.pendingBid = { r, who, n: +el.dataset.n, at: Date.now() };
    buzz(15);
    render();
    announce(t('Bid {n}: locking in', { n: +el.dataset.n }));
    S.bidTimer = setTimeout(() => {
      const p = S.pendingBid; S.pendingBid = null; S.changing = false;
      if (p && S.game?.phase === 'bidding' && S.game.round === p.r) { update({ [`bids/${p.r}/${p.who}`]: p.n }); announce(t('Bid {n} is in', { n: p.n })); }
      else render();
    }, BID_HOLD_MS);
  },
  'cancel-bid'() { clearTimeout(S.bidTimer); S.pendingBid = null; render(); document.querySelector('[data-act="bid"]')?.focus(); },
  live(el) {
    const g = S.game, r = g.round, who = me();
    const cur = g.live?.[r]?.[who] || 0, next = Math.max(0, Math.min(r, cur + +el.dataset.d));
    update({ [`live/${r}/${who}`]: next });
    announce(t('Tricks: {n} of {m}', { n: next, m: g.bids?.[r]?.[who] ?? '–' }));
    buzz(15);
  },
  async 'to-results'() {
    const g = S.game, r = g.round, counted = tricksTapped(g, r);
    if (g.phase === 'playing' && counted < r) {
      const ok = await ask(t('Go to results early?'), t('{n} of {m} tricks counted. Anyone who won an uncounted trick gets no credit for it. You can still fix tricks on the results screen.', { n: counted, m: r }), t('Go to results'));
      if (!ok || S.game.phase !== 'playing' || S.game.round !== r) return;
    }
    update(withHistory(S.game, { phase: 'results' }, '← Back to playing'));
  },
  'trick-for'(el) {
    try { localStorage.setItem('sk.giveTip', 'done'); } catch {}
    const g = S.game, r = g.round, pid = el.dataset.id, cur = g.live?.[r]?.[pid] || 0;
    if (g.phase !== 'playing' || tricksTapped(g, r) >= r) return;
    update({ [`live/${r}/${pid}`]: cur + 1 });
    buzz(15);
    toast(t('Trick for {name}', { name: name(pid) }), { label: t('Undo'), run: () => {
      const now = S.game.live?.[r]?.[pid] || 0;
      if (S.game.round === r && now > 0) update({ [`live/${r}/${pid}`]: now - 1, ...(S.game.phase === 'results' ? { phase: 'playing' } : {}) });
    } });
  },
  'fix-bids'() { S.sheet = { kind: 'bidpick' }; renderSheet(); },
  'open-bonus'() { S.bonusOpen[`${S.game.round}:${me()}`] = true; render(); },
  // Your round saves itself as you change it: no lock-in tap, and nothing is held back on a
  // phone when someone else scores.
  draft(el) {
    const g = S.game, r = g.round, who = me(), key = `${r}:${who}`;
    if (g.phase !== 'results' || !who) return;
    // Your own round lives in a local draft while you edit it, so two quick taps (or a sync
    // arriving in between) never rebuild the save from a stale copy and lose the first tap.
    const d = S.drafts[key] ||= { ...draftFor(g, r, who) };
    const k = el.dataset.k, max = k === 'tricks' ? tricksInRound(g, r) : BONUS[k].max;
    d[k] = Math.max(0, Math.min(max, (d[k] || 0) + +el.dataset.d));
    const clean = { tricks: d.tricks || 0 };
    bonusKeys(g).forEach(b => { if (d[b]) clean[b] = d[b]; });
    update({ [`results/${r}/${who}`]: clean, [`live/${r}/${who}`]: clean.tricks });
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
    toast(t('Locked in'));
  },
  async score() {
    const g = S.game, r = g.round, eff = effectiveResults(g, r), patch = {};
    if (S.game.phase !== 'results' || S.game.round !== r) return;
    for (const [pid, e] of Object.entries(eff)) {
      if (e.src === 'confirmed') continue;
      patch[`results/${r}/${pid}`] = { tricks: e.tricks };
    }
    const last = r >= ROUNDS;
    Object.assign(patch, { phase: last ? 'done' : 'bidding', round: last ? r : r + 1, undo: null });
    withHistory(g, patch, `↶ Undo scoring round ${r}`);
    S.drafts = {};
    update(patch);
    toast(t('Round {r} scored', { r }), { label: t('Undo'), run: () => actions.undo() });
  },
  undo() {
    const u = lastUndo(S.game);
    if (!u) return;
    S.sheet = null;
    update({ phase: u.phase, round: u.round, ...(u.legacy ? { undo: null } : { [`history/${u.key}`]: null }) });
    toast(t('Undone'));
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
    toast(t('Saved'));
  },
  'fix-pick'(el) { S.sheet = { kind: 'edit', r: S.game.round, id: el.dataset.id, bidOnly: true }; renderSheet(); },
  async rematch() {
    const g = S.game, ps = sortedPlayers(g).filter(p => !gone(g, p));
    const firstIdx = Math.max(0, ps.findIndex(p => p.id === dealerFor(g, 1)));
    const prevSeat = ps.findIndex(p => p.id === S.seat) >= 0 ? `p${ps.findIndex(p => p.id === S.seat)}` : S.seat === 'watch' ? 'watch' : null, oldCode = S.code;
    const champion = ranking(g)[0].id;
    // Characters carry over; the Skull King is only kept by the new champion.
    const avatars = Object.fromEntries(ps.map((p, i) => [`p${i}`, p.avatar, p.id]).filter(([, a, pid]) => CREW[a] && (a !== 'skullking' || pid === champion)).map(([k, a]) => [k, a]));
    const champIdx = ps.findIndex(p => p.id === champion);
    await createGame(ps.map(p => p.name), (firstIdx + 1) % ps.length, { scoring: g.scoring, exp: g.expansions, champion: champIdx >= 0 ? `p${champIdx}` : null, avatars,
      ...(g.crew ? { crew: g.crew, members: ps.map(p => p.member || null) } : {}) });
    // Carry this phone's seat into the new game (same player ids p0..pN), and point the old game at it.
    const code = location.hash.slice(1);
    if (prevSeat) saveSeat(code, prevSeat);
    S.store.update(oldCode, { next: code });
  },
};

// "Fix a bid" during play: pick a player, then a bid-only edit sheet.
function bidPickSheet() {
  const g = S.game;
  return `<div class="seat-list">${playersIn(g, g.round).map(p => `<button class="btn" data-act="fix-pick" data-id="${p.id}">${flag(p.id)}${esc(p.name)}<span class="chip tag">${t('Bid')} ${g.bids?.[g.round]?.[p.id] ?? '–'}</span></button>`).join('')}</div>`;
}

// The edit sheet hides tricks/bonuses for bid-only fixes.
function editSheetWrapper(s) {
  if (!s.bidOnly) return editSheet(s);
  const bid = s.bid ?? S.game.bids?.[s.r]?.[s.id] ?? 0;
  return `<p style="margin-top:0;display:flex;gap:8px;align-items:center">${flag(s.id)}<b>${esc(name(s.id))}</b> · ${t('Round {r}', { r: s.r })}</p>
    ${stepper('edit-bid', 'bid', t('Bid'), '', bid, s.r)}
    <button class="btn primary" style="margin-top:12px" data-act="save-edit">${t('Save bid')}</button>`;
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
  b.textContent = t('Your bid: {n}', { n: b.dataset.peek }); b.classList.add('on');
  b.setAttribute('aria-label', t('Your bid is {n}', { n: b.dataset.peek }));
  announce(t('Your bid is {n}', { n: b.dataset.peek }));
}
function peekHide() {
  clearTimeout(peekT);
  document.querySelectorAll('.peek.on').forEach(b => { b.textContent = t('Peek'); b.classList.remove('on'); b.setAttribute('aria-label', t('Peek at your bid')); });
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

document.addEventListener('change', e => {
  if (e.target.matches?.('select[data-setup=dealer]')) { syncSetupInputs(); S.setup.dealer = +e.target.value; }
});
document.addEventListener('input', e => {
  const i = e.target.dataset?.idx;
  if (i == null) return;
  const opt = document.querySelector(`select[data-setup=dealer] option[value="${i}"]`);
  if (opt) opt.textContent = e.target.value || t('Player {n}', { n: +i + 1 });
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  if (form.dataset.form === 'join') {
    const code = new FormData(form).get('code').toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length === 5) { location.hash = `crew=${code}`; return; }
    if (code.length !== 4) return toast(t('Game codes are 4 letters, crew codes 5'));
    location.hash = code;
  }
  if (form.dataset.form === 'new-crew') {
    const nm = new FormData(form).get('name').trim().slice(0, 30);
    if (!nm) return;
    form.querySelector('button').disabled = true;
    try {
      let code;
      for (let i = 0; i < 8; i++) { code = randomCode(5); if (!(await S.store.crewExists(code))) break; }
      await S.store.createCrew(code, { name: nm, createdAt: Date.now(), season: { n: 1, start: Date.now() } });
      S.sheet = null; renderSheet();
      location.hash = `crew=${code}`;
    } catch (err) { console.error(err); toast(t("Couldn't save that. Check your connection.")); form.querySelector('button').disabled = false; }
  }
  if (form.dataset.form === 'add-player') {
    addPlayer(new FormData(form).get('name').trim().slice(0, 24));
    form.reset();
  }
  if (form.dataset.form === 'setup') {
    syncSetupInputs();
    const names = S.setup.names.map(n => n.trim().slice(0, 24));
    const filled = names.filter(Boolean);
    if (filled.length < 2) return toast(t('Need at least 2 players'));
    if (new Set(filled.map(n => n.toLowerCase())).size !== filled.length) return toast(t('Names must be different'));
    // Keep the dealer pointing at the same person after dropping blank rows.
    const dealerName = names[S.setup.dealer];
    const dealer = Math.max(0, filled.indexOf(dealerName));
    form.querySelector('button:not([type])').disabled = true;
    try {
      const opts = { scoring: S.setup.scoring, exp: S.setup.exp };
      if (S.setup.crew) {
        // Guests become crew members (a typed name that matches a member is that member).
        const patch = {};
        opts.crew = S.setup.crew;
        opts.members = names.map((n, i) => [n, S.setup.members[i]]).filter(([n]) => n).map(([n, m]) => m || memberFor(n, patch));
        if (Object.keys(patch).length) await S.store.updateCrew(S.setup.crew, patch);
      }
      await createGame(filled, dealer, opts);
    } catch (err) { console.error(err); toast(t('Could not create game')); form.querySelector('button:not([type])').disabled = false; }
  }
});

// ---------- boot ----------
(async function boot() {
  try {
    S.store = await openStore();
  } catch (err) {
    console.error(err);
    $app.innerHTML = `<div class="card"><h2>${t("Can't reach the server")}</h2><p class="muted">${t('Check your internet connection and reload.')}</p><button class="btn primary" onclick="location.reload()">${t('Reload')}</button></div>`;
    return;
  }
  S.store.onConnection(on => { S.online = on; if (S.game) renderTop(); });
  if (isStandalone()) { try { localStorage.setItem('sk.installed', 'yes'); } catch {} }
  route();
  cleanupOldGames();
  if ('serviceWorker' in navigator && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') watchForUpdates();
  // Debug helper for testing highlights/chart: window.skSeed() fills a finished 10-round game.
  window.skSeed = seedFinishedGame;
})();

// A new version was published: the new service worker takes over in the background, and the
// app offers a refresh (phones on the table can stay open for hours). Checks every 30 minutes
// and whenever the app comes back to the front.
function watchForUpdates() {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || S.updateReady) return;
    S.updateReady = true;
    render();
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    const check = () => reg.update().catch(() => {});
    setInterval(check, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }).catch(() => {});
}

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
  const patch = { phase: 'done', round: ROUNDS };
  for (let r = 1; r <= ROUNDS; r++) {
    const ps = playersIn(S.game, r);
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
