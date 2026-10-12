// Game storage. Firebase Realtime Database when configured; otherwise a local backend that
// syncs tabs on this device only (localStorage + BroadcastChannel) — for testing / one-phone play.
import { firebaseConfig } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
export const isLive = () => !!firebaseConfig?.databaseURL && !new URLSearchParams(location.search).has('local');

export async function openStore() {
  return isLive() ? firebaseStore() : localStore();
}

async function firebaseStore() {
  const [{ initializeApp }, auth, db] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-database.js'),
  ]);
  const app = initializeApp(firebaseConfig);
  await auth.signInAnonymously(auth.getAuth(app));
  const database = db.getDatabase(app);
  const gref = (code, path = '') => db.ref(database, `games/${code}${path ? '/' + path : ''}`);
  let connected = true, onConn = null;
  db.onValue(db.ref(database, '.info/connected'), s => { connected = !!s.val(); onConn?.(connected); });
  return {
    live: true,
    onConnection(fn) { onConn = fn; fn(connected); },
    async exists(code) { return (await db.get(gref(code, 'createdAt'))).exists(); },
    async create(code, game) { await db.set(gref(code), game); },
    subscribe(code, cb) { return db.onValue(gref(code), s => cb(s.val())); },
    // Multi-path update relative to the game: {'bids/3/p1': 2, phase: 'playing'}; null deletes.
    update(code, patch) { return db.update(gref(code), patch); },
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
  return {
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
  };
}
