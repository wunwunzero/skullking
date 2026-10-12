// Game storage. Firebase Realtime Database when configured; otherwise a local backend that
// syncs tabs on this device only (localStorage + BroadcastChannel) — for testing / one-phone play.
import { firebaseConfig } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
export const OLD_GAME_MS = 30 * 24 * 3600 * 1000; // games older than this get cleaned up
export const isLive = () => !!firebaseConfig?.databaseURL && !new URLSearchParams(location.search).has('local');

export async function openStore() {
  return isLive() ? firebaseStore() : localStore();
}

const timeout = ms => new Promise(res => setTimeout(res, ms));

async function firebaseStore() {
  const [{ initializeApp }, auth, db] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-database.js'),
  ]);
  const app = initializeApp(firebaseConfig);
  const a = auth.getAuth(app);
  // Reuse the saved anonymous user; only sign in fresh when there is none. On a weak
  // connection don't block the app — keep retrying in the background.
  const signedIn = new Promise(res => {
    const stop = auth.onAuthStateChanged(a, u => { if (u) { stop(); res(u); } });
  });
  const trySignIn = () => { if (!a.currentUser) auth.signInAnonymously(a).catch(() => setTimeout(trySignIn, 5000)); };
  await a.authStateReady?.();
  trySignIn();
  await Promise.race([signedIn, timeout(6000)]);

  const database = db.getDatabase(app);
  const gref = (code, path = '') => db.ref(database, `games/${code}${path ? '/' + path : ''}`);
  let connected = true, onConn = null;
  db.onValue(db.ref(database, '.info/connected'), s => { connected = !!s.val(); onConn?.(connected); });
  return {
    live: true,
    onConnection(fn) { onConn = fn; fn(connected); },
    async exists(code) { return (await db.get(gref(code, 'createdAt'))).exists(); },
    async create(code, game) { await db.set(gref(code), game); },
    subscribe(code, cb) {
      let off = () => {};
      // Wait for sign-in so the first read isn't rejected by the rules.
      signedIn.then(() => { off = db.onValue(gref(code), s => cb(s.val()), () => cb(null)); });
      return () => off();
    },
    // Multi-path update relative to the game: {'bids/3/p1': 2, phase: 'playing'}; null deletes.
    update(code, patch) { return db.update(gref(code), patch); },
    // Mark this device as holding a seat; Firebase clears it if the phone drops off.
    async claim(code, pid, device) {
      const r = gref(code, `presence/${pid}`);
      await db.onDisconnect(r).remove();
      await db.set(r, device);
    },
    async release(code, pid) {
      const r = gref(code, `presence/${pid}`);
      await db.onDisconnect(r).cancel();
      await db.remove(r);
    },
    // Delete one game; the rules only allow this once it is 30+ days old.
    async remove(code) { await db.remove(gref(code)); },
  };
}

function localStore() {
  const KEY = 'sk.local.games';
  const chan = 'BroadcastChannel' in self ? new BroadcastChannel('sk-local') : null;
  const subs = new Map();
  const all = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = g => { try { localStorage.setItem(KEY, JSON.stringify(g)); } catch {} };
  const emit = code => { const g = all()[code] ?? null; (subs.get(code) || []).forEach(cb => cb(structuredClone(g))); };
  chan && (chan.onmessage = e => emit(e.data));
  const setPath = (obj, path, val) => {
    const keys = path.split('/');
    let o = obj;
    keys.slice(0, -1).forEach(k => { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; });
    const last = keys[keys.length - 1];
    if (val === null || val === undefined) delete o[last]; else o[last] = structuredClone(val);
  };
  const write = (code, fn) => { const g = all(); fn(g); save(g); emit(code); chan?.postMessage(code); };
  const store = {
    live: false,
    onConnection(fn) { fn(true); },
    async exists(code) { return !!all()[code]; },
    async create(code, game) { write(code, g => { g[code] = game; }); },
    subscribe(code, cb) {
      subs.set(code, [...(subs.get(code) || []), cb]);
      queueMicrotask(() => cb(structuredClone(all()[code] ?? null)));
      return () => subs.set(code, (subs.get(code) || []).filter(f => f !== cb));
    },
    async update(code, patch) {
      write(code, g => { if (!g[code]) return; for (const [p, v] of Object.entries(patch)) setPath(g[code], p, v); });
    },
    async claim(code, pid, device) {
      await store.update(code, { [`presence/${pid}`]: device });
      // No server to notice a closed tab, so release on the way out.
      addEventListener('pagehide', () => store.update(code, { [`presence/${pid}`]: null }), { once: true });
    },
    async release(code, pid) { await store.update(code, { [`presence/${pid}`]: null }); },
    async remove(code) { write(code, g => { delete g[code]; }); },
  };
  return store;
}
