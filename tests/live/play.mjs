// Full 10-round, 7→8-player playtest of the LIVE app (GitHub Pages + Firebase), one isolated
// browser context per phone (own storage, own anonymous sign-in), driven over CDP.
// Every round's totals are checked against an independent hand calculation of the planned play.
//
//   ~/.local/node/bin/node tests/live/play.mjs            classic scoring
//   MODE=rascal ~/.local/node/bin/node tests/live/play.mjs  Rascal scoring (Grapeshot / Cannonball)
//   BASE=http://localhost:8767/ …                            another server
//
// Besides the game itself it checks that typing is never disturbed by syncs from other phones:
// the join-name box (while others join and pick characters), the roster sheet's add-player box
// (while others tap tricks), a late joiner's name box mid-game, and the setup name box.
// Writes screenshots + log.txt to tests/live/out, Chrome's profile to tests/live/profile.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE || 'https://wunwunzero.github.io/skullking/';
const MODE = process.env.MODE === 'rascal' ? 'rascal' : 'classic';
const OUT = join(import.meta.dirname, 'out', MODE); rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = MODE === 'rascal' ? 9342 : 9341;   // both modes can run side by side
const TYPE_GAP = 150;           // ms between typed characters
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.now(), stamp = () => `${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}s`;
const log = (...a) => { const s = a.join(' '); console.log(s); LOG.push(`${stamp()} ${s}`); };
const LOG = [], BUGS = [], NOTES = [];
const bug = (...a) => { const s = a.join(' '); BUGS.push(s); log('  !! BUG:', s); };
const note = (...a) => { const s = a.join(' '); NOTES.push(s); log('  ~ note:', s); };
const pass = (...a) => log('  ✓', ...a);

const profile = join(import.meta.dirname, 'profile', MODE); rmSync(profile, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore' });
let ver; for (let i = 0; i < 50 && !ver; i++) { await sleep(200); try { ver = await (await fetch(`http://localhost:${PORT}/json/version`)).json(); } catch {} }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(), listeners = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.sessionId && listeners.has(m.sessionId)) listeners.get(m.sessionId)(m);
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, m => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
  ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
});

// ---------- phones ----------
const allPhones = {};
async function phone(name) {
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  const p = { name, s, errors: [], targetId, browserContextId };
  listeners.set(sessionId, m => {
    if (m.method === 'Runtime.exceptionThrown') p.errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') p.errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  });
  await s('Page.enable'); await s('Runtime.enable'); await s('Network.enable');
  p.size = async (height = 844) => s('Emulation.setDeviceMetricsOverride', { width: 390, height, deviceScaleFactor: 2, mobile: true });
  await p.size();
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  p.eval = async expr => {
    const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${name} eval: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  p.go = async url => { await s('Page.navigate', { url }); await sleep(400); await waitFor(p, `document.readyState === 'complete'`); };
  // A tap: el.click() (no focus move, like a quick tap that doesn't steal the keyboard).
  p.click = async (sel, { optional = false } = {}) => {
    const r = await p.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'missing'; if (e.disabled) return 'disabled'; e.click(); return 'ok'; })()`);
    if (r !== 'ok' && !optional) throw new Error(`${name}: click ${sel} → ${r}`);
    return r;
  };
  p.has = sel => p.eval(`!!document.querySelector(${JSON.stringify(sel)})`);
  p.text = sel => p.eval(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? null`);
  p.shot = async file => { const { data } = await s('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, file), Buffer.from(data, 'base64')); };
  // Real keyboard input into whatever has focus, one character at a time.
  p.type = async (text, gap = TYPE_GAP, each) => { for (const ch of text) { await s('Input.insertText', { text: ch }); if (each) await each(ch); await sleep(gap); } };
  p.enter = async () => {
    const k = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
    await s('Input.dispatchKeyEvent', { type: 'keyDown', ...k, text: '\r' });
    await s('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
  };
  p.close = async () => { try { await send('Target.closeTarget', { targetId }); } catch {} p.closed = true; };
  allPhones[name] = p;
  return p;
}
async function waitFor(p, expr, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await p.eval(`!!(${expr})`)) return Date.now() - t0; } catch {}
    await sleep(120);
  }
  throw new Error(`${p.name}: timed out after ${ms} ms waiting for ${expr}`);
}
const roundIs = r => `(document.querySelector('#top .round b')?.textContent || '').startsWith('Round ${r} ')`;
const phaseExpr = {
  bidding: `(document.querySelector('[data-act=bid]') || document.querySelector('.locked-card') || document.querySelector('.joins'))`,
  playing: `(document.querySelector('.bids-strip') && !document.querySelector('.bids-strip.drum'))`,
  results: `document.querySelector('.dock [data-act=score]')`,
};

// ---------- typing probe: is the box you type in left alone? ----------
// Tags the input with a property, counts blurs, and watches for it leaving the DOM between samples.
const probeInstall = (sel, focus = true) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'missing';
  window.__probe?.mo?.disconnect();
  const pr = window.__probe = { el, tag: 'probe-' + Math.random().toString(36).slice(2), blurs: 0, detachedAt: 0, mutations: 0 };
  el.__probeTag = pr.tag;
  el.addEventListener('blur', () => { if (!pr.quiet) pr.blurs++; });
  pr.mo = new MutationObserver(() => { pr.mutations++; if (!el.isConnected && !pr.detachedAt) pr.detachedAt = Date.now(); });
  pr.mo.observe(document.body, { childList: true, subtree: true });
  ${focus ? 'el.focus();' : ''}
  return document.activeElement === el ? 'ok' : 'nofocus';
})()`;
const probeState = `(() => { const pr = window.__probe; if (!pr) return null; const a = document.activeElement;
  return { same: pr.el.isConnected && pr.el.__probeTag === pr.tag, focused: a === pr.el, value: pr.el.value, blurs: pr.blurs,
    detached: !!pr.detachedAt, mutations: pr.mutations, active: a ? a.tagName + (a.dataset?.act ? '[' + a.dataset.act + ']' : '') + (a.name ? '[name=' + a.name + ']' : '') : null }; })()`;
// Type `text` into the probed box, sampling the box after every character and then for `holdMs`
// (a person pausing with the keyboard up) or until `holdUntil()` resolves. Returns problems found.
async function typeAndWatch(p, what, text, { holdUntil = null, holdMs = 0, prefix = '' } = {}) {
  const problems = [];
  let expected = prefix;
  const sample = async when => {
    const st = await p.eval(probeState);
    if (!st) return problems.push(`${when}: probe gone (page reloaded?)`);
    if (!st.same) problems.push(`${when}: the input was replaced (a new element is in its place)`);
    else if (!st.focused) problems.push(`${when}: the input lost focus (focus on ${st.active}) — the keyboard would close`);
    if (st.value !== expected && !(st.same === false)) problems.push(`${when}: value is "${st.value}", expected "${expected}"`);
    if (st.blurs) problems.push(`${when}: ${st.blurs} blur event(s) on the input`);
    return st;
  };
  await p.type(text, TYPE_GAP, async ch => { expected += ch; await sample(`after typing "${expected}"`); });
  const t0 = Date.now();
  let done = !holdUntil; holdUntil?.then(() => { done = true; }, () => { done = true; });
  while (!done || Date.now() - t0 < holdMs) { await sleep(150); await sample(`holding "${expected}" for ${Date.now() - t0} ms`); if (Date.now() - t0 > 30000) break; }
  const st = await p.eval(probeState);
  const uniq = [...new Set(problems)];
  if (uniq.length) bug(`${what}: ${uniq.slice(0, 4).join('; ')}${uniq.length > 4 ? ` (+${uniq.length - 4} more)` : ''}`);
  else pass(`${what}: same input element kept focus and value "${st.value}" through ${st.mutations} DOM mutations`);
  return { ok: !uniq.length, st };
}

// ---------- the plan: who bids what, who wins what (independent of the app) ----------
let seed = MODE === 'rascal' ? 20261107 : 20261014; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
const NAMES = ['Ana', 'Ben', 'Cat', 'Dmitri', 'Eve', 'Farouk', 'Gina'];
const CHARS = { Ana: 'captain', Ben: 'ghost', Cat: 'coralia', Dmitri: 'kraken', Eve: 'tigress', Farouk: 'parrot', Gina: 'witch', Hannah: 'crab' };
const roster = NAMES.map(n => ({ pid: null, name: n, from: 1, left: null }));
const byName = n => roster.find(x => x.name === n);
const pidOf = n => byName(n).pid;
const active = r => roster.filter(x => x.pid && x.from <= r && (x.left == null || r < x.left));
const plan = {};
function makeRound(r) {
  if (plan[r]) return plan[r];
  const ps = active(r), tricks = {}, bids = {}, bonus = {}, cannon = {};
  let left = r;
  ps.forEach((x, i) => { const t = i === ps.length - 1 ? left : Math.floor(rnd() * (left + 1) * 0.6); tricks[x.pid] = t; left -= t; });
  for (const x of ps) {
    const t = tricks[x.pid];
    bids[x.pid] = rnd() < .55 ? t : Math.max(0, Math.min(r, t + (rnd() < .5 ? -1 : 1)));
    if (t > 0 && rnd() < .3) bonus[x.pid] = rnd() < .7 ? { std14: 1 } : { black14: 1 };
    if (MODE === 'rascal' && rnd() < .25) cannon[x.pid] = true;
  }
  return (plan[r] = { tricks, bids, bonus, cannon });
}
const BON = { std14: 10, black14: 20, mermaids: 20, pirates: 30, skullKing: 40 };
function handScore(r, bid, tricks, b = {}, cannon = false) {
  const bonus = Object.entries(b).reduce((s, [k, v]) => s + BON[k] * v, 0), diff = Math.abs(tricks - bid);
  if (MODE === 'rascal') {
    const pot = (cannon ? 15 : 10) * r;
    return diff === 0 ? pot + bonus : diff === 1 && !cannon ? (pot + bonus) / 2 : 0;
  }
  if (bid === 0) return tricks === 0 ? 10 * r + bonus : -10 * r;
  return diff === 0 ? 20 * bid + bonus : -10 * diff;
}
const planScore = (r, pid) => handScore(r, plan[r].bids[pid], plan[r].tricks[pid], plan[r].bonus[pid], !!plan[r].cannon[pid]);
function expectedTotals(upto) {
  const tot = Object.fromEntries(roster.filter(x => x.pid).map(x => [x.name, 0]));
  for (let r = 1; r <= upto; r++) for (const x of active(r)) tot[x.name] += planScore(r, x.pid);
  return tot;
}

// ---------- helpers that act like people ----------
const phones = {};             // pid -> phone currently holding that seat (none for a phoneless player)
const timing = [], codes = [];
const num = s => +String(s).replace('−', '-').replace('+', '').trim();
async function checkErrors(tag) {
  for (const p of Object.values(allPhones)) if (!p.closed && p.errors.length) { bug(`${tag}: console errors on ${p.name}: ${p.errors.slice(0, 3).join(' | ')}`); p.errors = []; }
}
async function totalsOnScreen(p) {
  await p.click('[data-act=scores]');
  await waitFor(p, `document.querySelector('#sheet table.scores tfoot')`);
  const res = await p.eval(`(() => { const th = [...document.querySelectorAll('#sheet table.scores thead th')].slice(1).map(e => e.textContent.trim());
    const td = [...document.querySelectorAll('#sheet table.scores tfoot td')].slice(1).map(e => e.textContent.trim().replace('−', '-'));
    return Object.fromEntries(th.map((n, i) => [n, +td[i]])); })()`);
  await p.click('#sheet [data-act=close]');
  return res;
}
async function verify(r, label = `after round ${r}`) {
  const exp = expectedTotals(r), got = await totalsOnScreen(phones[pidOf('Ana')]);
  const diffs = Object.keys(exp).filter(n => got[n] !== exp[n] && !(got[n] === undefined && exp[n] === 0));
  if (diffs.length) bug(`${label}: totals differ: ${diffs.map(n => `${n} app ${got[n]} vs hand ${exp[n]}`).join(', ')}`);
  else pass(`totals ${label} match the hand calculation: ${Object.entries(exp).map(([n, v]) => `${n} ${v}`).join(', ')}`);
}
const phonesFor = r => active(r).map(x => phones[x.pid]).filter(Boolean);
async function allAt(r, phase, who = phonesFor(r), ms = 25000) {
  const t0 = Date.now();
  await Promise.all(who.map(p => waitFor(p, `${roundIs(r)} && ${phaseExpr[phase]}`, ms)));
  return Date.now() - t0;
}
// Bid on this phone (for whoever it is entering for), with the Rascal wager first when planned.
async function bid(p, n, { cannon = false } = {}) {
  await waitFor(p, `document.querySelector('[data-act=bid][data-n="${n}"]')`);
  if (MODE === 'rascal') {
    await p.click(`[data-act=cannon][data-v="${cannon ? 1 : 0}"]`);
    await waitFor(p, `document.querySelector('[data-act=cannon][data-v="${cannon ? 1 : 0}"]')?.getAttribute('aria-checked') === 'true'`, 8000)
      .catch(() => bug(`${p.name}: the ${cannon ? 'Cannonball' : 'Grapeshot'} wager never showed as chosen`));
  }
  await p.click(`[data-act=bid][data-n="${n}"]`);
}
const myCount = `+(document.querySelector('.mine-line b')?.firstChild?.textContent || 0)`;
async function tapTricks(p, n, r) {
  for (let i = 0; i < n; i++) {
    const before = await p.eval(myCount);
    await p.click('[data-act=live][data-d="1"]');
    await waitFor(p, `${myCount} === ${before + 1} || document.querySelector('.dock [data-act=score]')`, 8000);
  }
}
// Give a phoneless player their tricks from another phone (the chip on their row).
async function giveTricks(p, pid, n) {
  const sel = `[data-act=trick-for][data-id=${pid}]`;
  for (let i = 0; i < n; i++) {
    await waitFor(p, `document.querySelector('${sel}')`, 8000);
    const before = await p.eval(`parseInt(document.querySelector('${sel}').innerText) || 0`);
    await p.click(sel);
    await waitFor(p, `(parseInt(document.querySelector('${sel}')?.innerText) || 0) === ${before + 1} || document.querySelector('.dock [data-act=score]')`, 8000);
  }
}
// Results: tricks are already there from the live taps; add any planned bonus, then "Done".
async function enterResults(p, pid, r) {
  const b = plan[r].bonus[pid];
  if (!b) return;
  await waitFor(p, `document.querySelector('[data-act=open-bonus]') || document.querySelector('[data-act=draft][data-k=std14]')`, 8000);
  const opened = await p.click('[data-act=open-bonus]', { optional: true });
  for (const [k, v] of Object.entries(b)) for (let i = 0; i < v; i++) await p.click(`[data-act=draft][data-k="${k}"][data-d="1"]`);
  await waitFor(p, `document.querySelector('[data-act=bonus-done]')`, 10000)
    .catch(async () => {
      const others = await Promise.all(Object.values(phones).filter(q => q && q !== p && !q.closed).slice(0, 1).map(q => q.eval(`[...document.querySelectorAll('.editing-note')].map(e => e.closest('.prow').querySelector('.nm').textContent).join(',')`)));
      // Probe: one more tap 5 s later (past markEditing's 4 s throttle) — does the mark appear now?
      await sleep(5000);
      await p.click(`[data-act=draft][data-k=${Object.keys(b)[0]}][data-d="1"]`); await p.click(`[data-act=draft][data-k=${Object.keys(b)[0]}][data-d="-1"]`);
      const later = await waitFor(p, `document.querySelector('[data-act=bonus-done]')`, 6000).then(() => 'appeared after a tap 5 s later', () => 'still missing after a tap 5 s later');
      const edits = await allPhones.Ana.eval(`window.__edits.slice(-8).map(([t, e]) => ((t - Date.now()) / 1000).toFixed(1) + 's ' + e).join(' | ')`).catch(e => e.message);
      log('  editing/ history (relative to now):', edits);
      bug(`round ${r}: ${p.name} never got "Done, ready to score" after adding a bonus (open-bonus tap: ${opened}; another phone shows still editing: [${others}]; Done ${later})`);
    });
  await p.click('[data-act=bonus-done]', { optional: true });
}
// Before anyone scores: the results board on this phone shows each player's planned round score.
async function checkResultsBoard(p, r) {
  const want = Object.fromEntries(active(r).map(x => [x.name, planScore(r, x.pid)]));
  const read = () => p.eval(`Object.fromEntries([...document.querySelectorAll('#app .board .prow')].map(e => [e.querySelector('.nm')?.textContent, e.querySelector('.chip')?.textContent ?? null]))`);
  let got, bad = [];
  for (let i = 0; i < 40; i++) {
    got = await read();
    bad = Object.keys(want).filter(n => got[n] == null || num(got[n]) !== want[n]);
    if (!bad.length) break;
    await sleep(200);
  }
  if (bad.length) bug(`round ${r}: results board on ${p.name} before scoring: ${bad.map(n => `${n} shows ${got[n]} vs hand ${want[n]}`).join(', ')}`);
}
async function actAs(p, pid, how = 'menu') {
  // Let this phone's own bid finish locking in first: bidding for someone else inside the 1 s
  // lock cancels it (see notes in the report).
  await waitFor(p, `!document.querySelector('.locking')`, 5000);
  if (how === 'menu') { await p.click('[data-act=menu]'); await p.click('#sheet [data-act=open-actfor]'); await p.click(`#sheet [data-act=act-as][data-id=${pid}]`); }
  else await p.click(`#app [data-act=act-as][data-once="1"][data-id=${pid}]`);
  await waitFor(p, `document.querySelector('.acting')`, 5000);
}
async function stopActing(p) { await p.click('[data-act=stop-acting]', { optional: true }); await waitFor(p, `!document.querySelector('.acting')`, 5000); }
// A new phone opens the link and joins by typing its name (the QR flow).
async function joinByTyping(p, code, nm, { typed = false } = {}) {
  if (!typed) {
    await p.go(`${BASE}#${code}`);
    await waitFor(p, `document.querySelector('[data-form=join-name] input')`);
    await p.eval(`(() => { const i = document.querySelector('[data-form=join-name] input'); i.focus(); })()`);
    await p.type(nm, 40);
  }
  await p.enter();
  await waitFor(p, `document.querySelector('[data-act=pick-crew]') || document.querySelector('[data-act=start]')`, 15000);
  const pid = await p.eval(`sessionStorage.getItem('sk.seat.${code}')`);
  return pid;
}
async function pickCrew(p, nm) {
  const c = CHARS[nm];
  await waitFor(p, `document.querySelector('[data-act=pick-crew][data-c=${c}]:not([disabled])')`);
  await p.click(`[data-act=pick-crew][data-c=${c}]`);
}

// ============ the game ============
let code;
try {
  log(`Mode ${MODE} · opening phones on ${BASE}`);
  const ana = await phone('Ana');

  // ---- Host: New game, types only her own name (regression: setup box left alone while typing) ----
  await ana.go(BASE);
  await waitFor(ana, `document.querySelector('[data-act=new]')`);
  const appVersion = await ana.text('#app .muted.small:last-child');
  log('App', appVersion || '(version not shown)');
  await ana.click('[data-act=new]');
  await waitFor(ana, `document.querySelector('[data-idx="0"]')`);
  if ((await ana.eval(probeInstall('[data-idx="0"]'))) !== 'ok') bug('setup: could not focus the "Your name" box');
  await typeAndWatch(ana, 'setup: Ana types her name', 'Ana', { holdMs: 1200 });
  if (await ana.has('[data-idx="1"]')) bug('setup shows a second name row by default (should be your name only)');
  if (MODE === 'rascal') await ana.click('[data-act=set-scoring][data-v=rascal]');
  if ((await ana.eval(`document.querySelector('[data-idx="0"]').value`)) !== 'Ana') bug('setup: the typed name was lost after choosing the scoring');
  await ana.click('[data-form=setup] button.primary');
  await waitFor(ana, `/^#[A-Z]{4}$/.test(location.hash)`);
  code = (await ana.eval('location.hash')).slice(1);
  codes.push(code);
  log('Game code', code);
  writeFileSync(join(OUT, 'code.txt'), code);
  // Host is auto-seated as p0 and goes to the character picker.
  await waitFor(ana, `document.querySelector('[data-act=pick-crew]')`, 15000).then(() => pass('host auto-seated and sent to the character picker'), () => bug('host was not taken to the character picker after creating the game'));
  byName('Ana').pid = await ana.eval(`sessionStorage.getItem('sk.seat.${code}')`);
  if (byName('Ana').pid !== 'p0') bug(`host seat is ${byName('Ana').pid}, expected p0`);
  phones[byName('Ana').pid] = ana;
  await pickCrew(ana, 'Ana');
  await waitFor(ana, `document.querySelector('[data-act=start]')`);
  if (await ana.has('[data-act=start].primary')) bug('lobby: Start is the primary action with only the host at the table');

  // ---- Regression 1: Ben types his name on the join screen while Cat, Dmitri and Eve join ----
  // Diagnostics: Ana's page keeps its own log of every change to editing/ (read with editLog()).
  await ana.eval(`(async () => { const { openStore } = await import('./store.js'); const st = await openStore(); let last = '';
    window.__edits = []; st.subscribe('${code}', g => { const e = JSON.stringify(g?.editing || null) + ' ' + g?.phase + g?.round; if (e !== last) { last = e; window.__edits.push([Date.now(), e]); } }); })()`);
  const [ben, cat, dmitri, eve] = await Promise.all(['Ben', 'Cat', 'Dmitri', 'Eve'].map(n => phone(n)));
  await Promise.all([ben, cat, dmitri, eve].map(async p => { await p.go(`${BASE}#${code}`); await waitFor(p, `document.querySelector('[data-form=join-name] input')`); }));
  const seatsBefore = await ben.eval(`document.querySelectorAll('[data-act=seat]:not([data-id=watch])').length`);
  if ((await ben.eval(probeInstall('[data-form=join-name] input'))) !== 'ok') bug('join: could not focus the name box');
  const typingStart = Date.now(), landed = [];
  const others = Promise.all([cat, dmitri, eve].map(async (p, i) => {
    await sleep(250 + i * 300);
    await p.eval(`document.querySelector('[data-form=join-name] input').focus()`);
    await p.type(p.name, 30);
    const pid = await joinByTyping(p, code, p.name, { typed: true });
    landed.push([`${p.name} joined`, Date.now()]);
    byName(p.name).pid = pid; phones[pid] = p;
    await pickCrew(p, p.name);
    await waitFor(p, `document.querySelector('[data-act=start]')`);
    landed.push([`${p.name} picked a character`, Date.now()]);
  }));
  const r1 = await typeAndWatch(ben, 'join screen: Ben types his name while Cat, Dmitri and Eve join and pick characters', 'Ben', { holdUntil: others.then(() => sleep(1500)) });
  await others;
  const typingEnd = Date.now();
  const during = landed.filter(([, t]) => t >= typingStart && t <= typingEnd);
  log(`  · ${during.length} joins/picks landed while Ben's box had focus: ${during.map(([w]) => w).join(', ') || 'none'}`);
  if (!during.length) note('join typing check inconclusive: no other phone joined while Ben was typing');
  const staleSeats = await ben.eval(`document.querySelectorAll('[data-act=seat]:not([data-id=watch])').length`);
  log(`  · Ben's screen held its redraw while typing: seat list shows ${staleSeats} player(s) (was ${seatsBefore}; 4 are at the table now)`);
  // Regression 3: once typing ends (blur), the held updates show.
  await ben.eval(`(() => { window.__probe.quiet = true; document.activeElement.blur(); })()`);
  await waitFor(ben, `['Cat', 'Dmitri', 'Eve'].every(n => [...document.querySelectorAll('[data-act=seat]')].some(b => b.innerText.includes(n)))`, 6000)
    .then(ms => pass(`after Ben's box lost focus his screen caught up (Cat, Dmitri, Eve listed) in ${ms} ms`),
      () => bug('join screen did not catch up after typing ended: Ben\'s "Already at the table" list is missing players who joined while he typed'));
  if ((await ben.eval(`document.querySelector('[data-form=join-name] input')?.value`)) !== 'Ben') bug('join screen: the typed name "Ben" was lost by the catch-up redraw');
  // A phone keyboard (or the browser bar) changing the viewport height while the box has focus.
  await ben.eval(probeInstall('[data-form=join-name] input'));
  await ben.size(520); await sleep(700);
  const afterResize = await ben.eval(probeState);
  if (!afterResize.same || !afterResize.focused) bug(`join screen: a viewport resize while typing (keyboard opening, 844→520 px tall) redrew the screen: the name box was ${afterResize.same ? 'kept but lost focus' : 'replaced'} and focus went to ${afterResize.active} — the keyboard would close (app.js resize listener calls render() whenever a game is open)`);
  else pass('join screen: a viewport resize while typing left the name box alone');
  await ben.size(844); await sleep(300);
  await ben.eval(`document.querySelector('[data-form=join-name] input').focus()`);
  byName('Ben').pid = await joinByTyping(ben, code, 'Ben', { typed: true });
  phones[byName('Ben').pid] = ben;
  await pickCrew(ben, 'Ben');
  await waitFor(ben, `document.querySelector('[data-act=start]')`);
  pass(`Ben joined as ${byName('Ben').pid}`);

  // Farouk and Gina join the plain way; Start turns primary only when every phone is in.
  for (const nm of ['Farouk', 'Gina']) {
    const p = await phone(nm);
    const pid = await joinByTyping(p, code, nm);
    byName(nm).pid = pid; phones[pid] = p;
    await pickCrew(p, nm);
    await waitFor(p, `document.querySelector('[data-act=start]')`);
  }
  log('  · seats:', roster.map(x => `${x.name}=${x.pid}`).join(' '));
  if (new Set(roster.map(x => x.pid)).size !== 7) bug('two phones ended up on the same seat: ' + roster.map(x => `${x.name}=${x.pid}`).join(' '));
  await waitFor(ana, `(document.querySelector('.dock .status-line')?.innerText || '').startsWith('7 of 7')`, 15000)
    .then(() => pass('lobby shows 7 of 7 phones joined'), async () => bug(`lobby never showed 7 of 7 phones joined: "${await ana.text('.dock .status-line')}"`));
  await waitFor(ana, `document.querySelector('[data-act=start].primary')`, 5000).then(() => pass('Start is primary once every phone is in'), () => bug('Start never became primary with every phone in'));
  await ana.shot('01-lobby.png');
  await ana.click('[data-act=start]');

  let ivy = null, hannahPhone = null;
  for (let r = 1; r <= 10; r++) {
    makeRound(r);
    const ps = active(r), P = plan[r];
    log(`\nRound ${r}: ${ps.length} players · bids ${ps.map(x => `${x.name} ${P.bids[x.pid]}${P.cannon[x.pid] ? 'c' : ''}`).join(', ')} · tricks ${ps.map(x => P.tricks[x.pid]).join('/')}`);
    timing.push(['bidding visible on all phones', r, await allAt(r, 'bidding')]);
    if (r > 1) {
      if (!(await ana.has('#app .card.scored'))) bug(`round ${r}: no round-scored card on Ana's bidding screen`);
      const y = await ana.eval('scrollY');
      if (y > 0) bug(`round ${r}: Ana's page did not scroll to the top on the new round (scrollY ${y})`);
    }

    // ---- bidding ----
    const order = [...ps].sort(() => rnd() - .5);
    // Ben's wrong bid must not be the last one in (it would set off the reveal)
    if (r === 2) order.sort((a, b) => (b.name === 'Ben') - (a.name === 'Ben'));
    const pending = [];
    for (const x of order) {
      const p = phones[x.pid];
      if (!p) continue;      // phoneless: someone bids for them below
      if (await p.has('.locked-card')) { log(`  · ${x.name}'s bid was already in`); continue; }
      if (r === 2 && x.name === 'Ben') {
        // Ben taps the wrong bid, it locks in, then he changes it before the reveal
        const wrong = (P.bids[x.pid] + 1) % (r + 1);
        await bid(p, wrong, { cannon: P.cannon[x.pid] });
        if (!(await p.has('.locking'))) bug('round 2: no "Locking in…" bar right after Ben tapped a bid');
        await waitFor(p, `document.querySelector('[data-act=change-bid]')`);
        await p.click('[data-act=change-bid]');
        await bid(p, P.bids[x.pid], { cannon: P.cannon[x.pid] });
        log('  · Ben changed his bid after it locked in, before the reveal');
        continue;
      }
      if (r === 2 && x.name === 'Cat') {
        // Cat mis-taps and cancels during the 1 s lock
        await bid(p, (P.bids[x.pid] + 1) % (r + 1), { cannon: P.cannon[x.pid] });
        await p.click('[data-act=cancel-bid]');
        await sleep(1300);
        if (await p.has('.locked-card')) bug('round 2: Cat cancelled during the lock but the bid went in anyway');
        await bid(p, P.bids[x.pid], { cannon: P.cannon[x.pid] });
        log('  · Cat cancelled a mis-tap during the 1 s lock');
        continue;
      }
      if (r === 4 && x.name === 'Cat') {
        // Hannah has no phone yet: Cat bids for her from Hannah's row, then bids her own
        const h = pidOf('Hannah');
        await actAs(p, h, 'inline');
        await bid(p, P.bids[h], { cannon: P.cannon[h] });
        await waitFor(p, `!document.querySelector('.acting')`, 5000).then(() => pass('Cat bid for Hannah from her row and was back on her own seat after one bid'), () => bug('round 4: after "Bid for Hannah" Cat\'s phone stayed in "Entering for Hannah"'));
      }
      if (r === 7 && x.name === 'Gina') {
        // Gina's phone died: Ana enters for her from the menu
        await actAs(ana, x.pid);
        await bid(ana, P.bids[x.pid], { cannon: P.cannon[x.pid] });
        await waitFor(ana, `document.querySelector('.locked-card')`, 5000);
        await stopActing(ana);
        log('  · Ana entered Gina’s bid for her (phone “dead”)');
        continue;
      }
      await bid(p, P.bids[x.pid], { cannon: P.cannon[x.pid] });
    }
    if (r === 4) await ana.shot('04-bidding-8p-before-reveal.png');
    // Every phone sees the drumroll, then the bids
    timing.push(['reveal on all phones after last bid', r, await allAt(r, 'playing')]);
    if (r === 4) { await sleep(1800); await ana.shot('04-playing-8p.png'); }

    const sum = ps.reduce((s, x) => s + P.bids[x.pid], 0);
    const hint = await ana.text('.verdict');
    if (hint && !hint.includes(String(sum))) bug(`round ${r}: bid hint "${hint}" doesn't mention the bid total ${sum}`);
    if (MODE === 'rascal') {
      const cannons = await ana.eval(`document.querySelectorAll('.bids-strip .bid-cell .ico').length`);
      const want = ps.filter(x => P.cannon[x.pid]).length;
      if (cannons !== want) bug(`round ${r}: the bids strip shows ${cannons} Cannonball mark(s), ${want} were called`);
    }

    if (r === 2) {
      // Cat's bid was entered wrong; Ana fixes it after the reveal
      const c = pidOf('Cat'), nb = P.bids[c] + 1 <= r ? P.bids[c] + 1 : P.bids[c] - 1;
      await ana.click('[data-act=fix-bids]'); await ana.click(`#sheet [data-act=fix-pick][data-id=${c}]`);
      await ana.click(`#sheet [data-act=edit-bid][data-d="${nb > P.bids[c] ? 1 : -1}"]`);
      await ana.click('#sheet [data-act=save-edit]');
      P.bids[c] = nb;
      await waitFor(phones[c], `[...document.querySelectorAll('.bid-cell')].some(e => e.innerText.includes('Cat') && e.querySelector('b').textContent.trim() === '${nb}')`, 8000)
        .then(() => pass('Ana fixed Cat’s bid after the reveal; Cat’s phone shows', nb), () => bug('fixed bid not shown on Cat’s phone'));
    }

    // ---- tricks ----
    if (r === 6) {
      // Eve's phone refreshes mid-round; Farouk's goes offline while he taps his tricks
      const e = phones[pidOf('Eve')];
      await e.s('Page.reload');
      await waitFor(e, `${roundIs(6)} && ${phaseExpr.playing}`).then(ms => pass(`Eve's phone reloaded and came back to her seat in ${ms} ms`), () => bug('Eve lost her seat after a reload'));
      await phones[pidOf('Farouk')].s('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await sleep(2500);
      const off = await phones[pidOf('Farouk')].text('.code-chip');
      if (!/offline/i.test(off || '')) note(`Farouk's code chip did not show Offline after 2.5 s of no network (shows "${off}")`); else pass('Farouk’s phone shows Offline');
    }
    if (r === 7) {
      // Farouk has to go home after this round (removed during play, if the round is still on)
      {
        await ana.click('[data-act=menu]'); await ana.click('#sheet [data-act=roster]');
        await ana.click(`#sheet [data-act=rm-player][data-id=${pidOf('Farouk')}]`);
        await waitFor(ana, `document.querySelector('[data-act=ask-yes]')`);
        await ana.click('[data-act=ask-yes]');
        await waitFor(ana, `(document.getElementById('sheet').innerText || '').includes('Leaves after this round')`, 8000).then(() => pass('Farouk marked as leaving after round 7'), () => bug('Farouk not marked as leaving'));
        await ana.click('#sheet [data-act=close]', { optional: true });
        byName('Farouk').left = 8;
      }
    }
    const tapOne = async x => {
      const n = P.tricks[x.pid];
      if (!n) return;
      if (r === 7 && x.name === 'Gina') { await actAs(ana, x.pid); await tapTricks(ana, n, r); await stopActing(ana); return; }
      if (!phones[x.pid]) { await giveTricks(phones[pidOf('Dmitri')], x.pid, n); log(`  · Dmitri gave ${x.name} her ${n} trick(s) from her chip`); return; }
      await tapTricks(phones[x.pid], n, r);
    };
    if (r === 3) {
      // ---- Regression 2: Ana types a new player's name in the roster sheet while others tap tricks;
      //      Ivy (a late friend) types on the join screen at the same time ----
      ivy = await phone('Ivy');
      await ivy.go(`${BASE}#${code}`);
      await waitFor(ivy, `document.querySelector('[data-form=join-name] input')`);
      await ana.click('[data-act=menu]'); await ana.click('#sheet [data-act=roster]');
      await waitFor(ana, `document.querySelector('#sheet [data-form=add-player] input')`);
      if ((await ana.eval(probeInstall('#sheet [data-form=add-player] input'))) !== 'ok') bug('roster sheet: could not focus the add-player name box');
      if ((await ivy.eval(probeInstall('[data-form=join-name] input'))) !== 'ok') bug('Ivy: could not focus the join name box');
      const tappers = Promise.all(ps.filter(x => x.name !== 'Ana').map(async (x, i) => { await sleep(i * 250); await tapOne(x); }));
      let added; const hannahAdded = new Promise(r => { added = r; });
      const ivyTyping = typeAndWatch(ivy, 'mid-game join screen: Ivy types her name while the table taps tricks and Ana adds Hannah', 'Ivy', { holdUntil: Promise.all([tappers, hannahAdded.then(() => sleep(2000))]) });
      await typeAndWatch(ana, 'roster sheet: Ana types "Hannah" in Add a player while the table taps tricks', 'Hannah', { holdUntil: tappers });
      await ana.eval(`document.getElementById('sits-after').value = '${pidOf('Dmitri')}'`);
      await ana.enter();
      added();
      roster.push({ pid: 'p7', name: 'Hannah', from: 4, left: null });
      // After adding: the sheet should list Hannah (focus is still in the name box).
      const listed = () => `[...document.querySelectorAll('#sheet .roster .nm')].some(e => e.textContent === 'Hannah')`;
      await waitFor(ana, listed(), 5000).then(() => pass('roster sheet lists Hannah right after adding her'),
        async () => bug(`roster sheet: after typing "Hannah" and pressing Go/Enter, the player list in the sheet never showed her while the name box kept focus (the add went through: ${await ana.eval(`document.querySelector('#sheet [data-form=add-player] input')?.value === '' ? 'box cleared' : 'box not cleared'`)}); #sheet is never redrawn while it holds focus`));
      // Regression 3 for the sheet: typing ends → the sheet catches up.
      await ana.eval(`(() => { window.__probe.quiet = true; document.activeElement.blur(); })()`);
      await waitFor(ana, listed(), 5000).then(ms => pass(`roster sheet caught up (Hannah listed) ${ms} ms after the name box lost focus`),
        () => bug('roster sheet did not catch up after the name box lost focus: Hannah still missing from the list 5 s later (no redraw of #sheet on focusout, only on the next sync)'));
      await ana.click('#sheet [data-act=close]', { optional: true });
      await ivyTyping;
      const ivySeesHannah = `[...document.querySelectorAll('[data-act=seat]')].some(b => b.innerText.includes('Hannah'))`;
      log(`  · Ivy's screen while typing ${await ivy.eval(ivySeesHannah) ? 'already listed' : 'held back'} Hannah`);
      await ivy.eval(`(() => { window.__probe.quiet = true; document.activeElement.blur(); })()`);
      await waitFor(ivy, ivySeesHannah, 6000).then(ms => pass(`Ivy's join screen caught up (Hannah listed) ${ms} ms after typing ended`), () => bug('mid-game join screen did not catch up after typing ended: Hannah missing from Ivy\'s list'));
      const ivyVal = await ivy.eval(`[...document.querySelectorAll('input')].map(i => (i.form?.dataset.form || '-') + ':' + i.name + '=' + JSON.stringify(i.value)).join(' ')`);
      // Hannah took the 8th and last seat, so the join form is (rightly) gone from Ivy's screen.
      if (!ivyVal && await ivy.eval(`[...document.querySelectorAll('[data-act=seat]:not([data-id=watch])')].length === 8`)) pass('table now full (8 seats): Ivy’s join form is gone and her screen offers the seats / table screen');
      else if (!/join-name:name="Ivy"/.test(ivyVal)) bug(`mid-game join screen: the typed name "Ivy" was lost by the catch-up redraw (inputs now: ${ivyVal})`);
      await ivy.close(); ivy = null;     // Ivy decides to just watch over someone's shoulder
      await tapOne(byName('Ana'));
    } else {
      for (const x of ps) await tapOne(x);
    }
    if (r === 6) {
      await phones[pidOf('Farouk')].s('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      if (P.tricks[pidOf('Farouk')]) await waitFor(ana, `${phaseExpr.results} || [...document.querySelectorAll('.board .prow')].some(e => e.innerText.includes('Farouk') && e.innerText.includes('${P.tricks[pidOf('Farouk')]}/'))`, 20000)
        .then(ms => pass(`Farouk's offline taps synced ${ms} ms after reconnecting`), () => bug('Farouk’s tricks tapped offline never reached the other phones'));
    }
    // The last trick takes every phone to results by itself (the dealer's phone drives it)
    const toRes = await allAt(r, 'results', phonesFor(r), 12000).catch(() => null);
    if (toRes == null) {
      bug(`round ${r}: the last trick did not move every phone to results within 12 s (table line: "${await ana.text('.table-line')}")`);
      await ana.click('[data-act=to-results]', { optional: true });
      await allAt(r, 'results');
    } else timing.push(['last trick → results on all phones', r, toRes]);
    if (r === 4) await ana.shot('04-results-8p.png');

    // ---- results: save as you go ----
    const raceX = r === 9 ? ps.find(x => phones[x.pid] && x.name !== 'Ana' && P.tricks[x.pid] > 0 && !P.bonus[x.pid]) || ps.find(x => phones[x.pid] && x.name !== 'Ana' && P.tricks[x.pid] > 0) : null;
    for (const x of ps) {
      if (x === raceX) continue;
      const p = phones[x.pid];
      if (!p) {
        // Phoneless Hannah: Ana enters for her from her row
        if (P.bonus[x.pid]) { await actAs(ana, x.pid, 'inline'); await enterResults(ana, x.pid, r); await stopActing(ana); log(`  · Ana entered ${x.name}'s bonus from her row`); }
        continue;
      }
      if (r === 7 && x.name === 'Gina') {
        if (P.bonus[x.pid]) { await actAs(ana, x.pid); await enterResults(ana, x.pid, r); await stopActing(ana); log('  · Ana entered Gina’s bonus for her'); }
        continue;
      }
      if (r === 3 && x.name === 'Dmitri') {
        // Dmitri bumps his trick count by mistake: the warning shows, he's "still editing", Score waits
        const wrong = P.tricks[x.pid] < r ? 1 : -1;
        await p.click(`[data-act=draft][data-k=tricks][data-d="${wrong}"]`);
        await waitFor(ana, `document.querySelector('.warnbox')`, 8000).then(() => pass('Ana sees the "tricks don’t add up" warning'), () => bug('round 3: no "tricks don’t add up" warning on Ana while Dmitri’s count was wrong'));
        await waitFor(ana, `[...document.querySelectorAll('.editing-note')].some(e => e.closest('.prow').innerText.includes('Dmitri'))`, 8000)
          .then(() => pass('Ana sees Dmitri "still editing…"'), () => bug('round 3: Ana never saw Dmitri as "still editing…" after his tap'));
        if (await ana.has('.dock [data-act=score].primary')) bug('round 3: Score is primary while the tricks don’t add up');
        await p.click(`[data-act=draft][data-k=tricks][data-d="${-wrong}"]`);
        await enterResults(p, x.pid, r);
        if (!P.bonus[x.pid]) { await waitFor(p, `document.querySelector('[data-act=bonus-done]')`, 8000).catch(() => {}); await p.click('[data-act=bonus-done]', { optional: true }); }
        continue;
      }
      await enterResults(p, x.pid, r);
    }

    const scorerX = r === 9 ? ps.find(x => phones[x.pid] && x !== raceX && x.name !== 'Ana') : ps.filter(x => phones[x.pid])[Math.floor(rnd() * ps.filter(x => phones[x.pid]).length)];
    const scorer = phones[scorerX.pid];
    if (r === 9) {
      // ---- the race: a phone scores the instant another taps a bonus ----
      const X = phones[raceX.pid];
      P.bonus[raceX.pid] = { ...(P.bonus[raceX.pid] || {}), std14: (P.bonus[raceX.pid]?.std14 || 0) + 1 };
      log(`  · race: ${raceX.name} adds a coloured 14 the instant ${scorerX.name} taps Score`);
      await X.click('[data-act=open-bonus]', { optional: true });
      await waitFor(scorer, `[...document.querySelectorAll('.editing-note')].some(e => e.closest('.prow').innerText.includes('${raceX.name}'))`, 8000)
        .then(() => pass(`${scorerX.name} sees ${raceX.name} "still editing…"`), () => bug(`round 9: ${scorerX.name} never saw ${raceX.name} as "still editing…" after they opened bonuses`));
      if (await scorer.has('.dock [data-act=score].primary')) bug(`round 9: Score is primary on ${scorerX.name} while ${raceX.name} is still editing`);
      const xTaps = async () => { const out = []; for (const [k, v] of Object.entries(P.bonus[raceX.pid])) for (let i = 0; i < v; i++) out.push(await X.click(`[data-act=draft][data-k=${k}][data-d="1"]`, { optional: true })); return out; };
      const [taps] = await Promise.all([xTaps(), scorer.click('[data-act=score]')]);
      if (taps.some(t => t !== 'ok')) { bug(`round 9 race: ${raceX.name}'s bonus taps hit no button (${taps}); the plan keeps the bonus, so expect a totals gap`); }
      await waitFor(scorer, `document.querySelector('#sheet [data-act=ask-yes]')`, 3000)
        .then(async () => {
          const primary = await scorer.eval(`document.querySelector('#sheet .btn.primary')?.dataset.act`);
          const title = await scorer.text('#sheet h2');
          if (primary !== 'close') bug(`round 9: the "still editing" ask on ${scorerX.name} makes "${primary}" primary, not Wait`);
          else pass(`${scorerX.name} got "${title}" with Wait as the primary button; chose Score anyway`);
          await scorer.click('#sheet [data-act=ask-yes]');
        }, () => bug(`round 9: ${scorerX.name} scored without the "still editing" ask while ${raceX.name} was mid-bonus`));
      // markEditing() ignores taps within 4 s of the last mark and S.editMarked isn't reset per round.
      // At harness speed round 10 can reach results < 4 s later, swallowing the racer's next mark;
      // no real round is that quick, so wait it out.
      await sleep(4000);
    } else {
      await waitFor(scorer, `document.querySelector('.dock [data-act=score].primary')`, 20000)
        .catch(async () => bug(`round ${r}: Score never became primary on ${scorer.name} once everyone was done (status: ${await scorer.text('.status-line')})`));
      await checkResultsBoard(scorer, r);
      if (r === 5) await ana.shot('05-results-ready.png');
      await scorer.eval('window.scrollTo(0, document.body.scrollHeight)');
      await scorer.click('[data-act=score]');
      await sleep(150);
      if (await scorer.has('#sheet [data-act=ask-yes]')) { bug(`round ${r}: Score asked "${await scorer.text('#sheet h2')}" although everyone was done and tricks add up`); await scorer.click('#sheet [data-act=ask-yes]'); }
    }
    const t0 = Date.now(), next = r + 1;
    if (r < 10) {
      if (r === 4) {
        // Hannah's phone arrives: she takes her seat from "Already at the table"
        const h = hannahPhone = await phone('Hannah');
        await h.go(`${BASE}#${code}`);
        await waitFor(h, `document.querySelector('[data-act=seat][data-id=p7]')`);
        const lbl = await h.text('[data-act=seat][data-id=p7]');
        if (!/Hannah/.test(lbl)) bug(`seat p7 on Hannah's phone reads "${lbl}"`);
        await h.click('[data-act=seat][data-id=p7]');
        await pickCrew(h, 'Hannah');
        phones.p7 = h;
        pass('Hannah took her seat on her own phone from "Already at the table"');
      }
      await allAt(next, 'bidding', phonesFor(next));
      timing.push(['scored → next round on all phones', r, Date.now() - t0]);
      const y = await scorer.eval('scrollY');
      if (y > 0) bug(`round ${r}: ${scorer.name}'s page stayed scrolled (scrollY ${y}) after scoring from the bottom; new round should start at the top`);
    } else {
      await Promise.all(phonesFor(10).map(p => waitFor(p, `document.querySelector('.winner h1')`)));
      timing.push(['scored → final screen on all phones', r, Date.now() - t0]);
    }
    log(`  · ${scorer.name} scored round ${r}`);

    if (r === 5) {
      // Scored too early: Eve has already bid in round 6, so Undo asks first
      makeRound(6);
      const e = phones[pidOf('Eve')];
      await bid(e, plan[6].bids[pidOf('Eve')], { cannon: plan[6].cannon[pidOf('Eve')] });
      await waitFor(ana, `[...document.querySelectorAll('#app .prow')].some(e => e.innerText.includes('Eve') && e.querySelector('.chip.lock'))`, 8000);
      await ana.click('[data-act=menu]'); await ana.click('#sheet [data-act=undo]');
      await waitFor(ana, `document.querySelector('#sheet [data-act=ask-yes]')`, 4000)
        .then(() => ana.click('#sheet [data-act=ask-yes]'), () => bug('undo with round 6 bids already in did not ask first'));
      await allAt(5, 'results');
      pass('undo took every phone back to round 5 results');
      await ana.click('[data-act=score]');
      await sleep(150);
      if (await ana.has('#sheet [data-act=ask-yes]')) { note(`after undo, scoring round 5 again asked "${await ana.text('#sheet h2')}"`); await ana.click('#sheet [data-act=ask-yes]'); }
      await allAt(6, 'bidding');
    }
    if (r < 10) await verify(r); else await verify(10, 'at the end (scores table)');

    if (r === 7) {
      // Gina's phone comes back as a different phone: she takes over her seat there
      const gpid = pidOf('Gina'), g2 = await phone('Gina (new phone)');
      await g2.go(`${BASE}#${code}`);
      await waitFor(g2, `document.querySelector('[data-act=seat][data-id=${gpid}]')`);
      const taken = await g2.text(`[data-act=seat][data-id=${gpid}]`);
      if (!/another phone/i.test(taken)) note(`Gina's seat on the new phone didn't say "On another phone" (old phone still open): "${taken}"`);
      await g2.click(`[data-act=seat][data-id=${gpid}]`);
      await waitFor(g2, `document.querySelector('#sheet [data-act=ask-yes]')`, 3000).then(() => g2.click('#sheet [data-act=ask-yes]'), () => note('seat takeover did not ask "Take over this seat?"'));
      await waitFor(phones[gpid], `document.querySelector('[data-act=seat][data-id=${gpid}]')`, 10000)
        .then(() => pass('Gina’s old phone was released to the seat picker'), () => bug('old phone kept Gina’s seat after a takeover'));
      await phones[gpid].close();
      phones[gpid] = g2;
    }
    if (r === 8) {
      // A mistake from round 2 is noticed: one player actually won one trick more, another one fewer
      const r2 = plan[2], ps2 = active(2);
      const from = ps2.find(x => r2.tricks[x.pid] > 0), to = ps2.find(x => x !== from);
      for (const [x, d] of [[from, -1], [to, 1]]) {
        await ana.click('[data-act=scores]');
        await ana.click(`#sheet [data-act=edit][data-r="2"][data-id="${x.pid}"]`);
        await ana.click(`#sheet [data-act=edit-draft][data-k=tricks][data-d="${d}"]`);
        await ana.click('#sheet [data-act=save-edit]');
        await ana.click('#sheet [data-act=close]', { optional: true });
        r2.tricks[x.pid] += d;
        // A bonus needs a trick: one that no longer fits is dropped by the app too
        if (!r2.tricks[x.pid]) delete r2.bonus[x.pid];
      }
      log(`  · Fixed round 2 in the score table: ${from.name} −1 trick, ${to.name} +1 trick`);
      await sleep(800);
      await verify(8, 'after fixing round 2');
    }
    await checkErrors(`round ${r}`);
  }

  // ---- final screen checks ----
  const exp = expectedTotals(10), host = phones[pidOf('Ana')];
  const podium = await host.eval(`[...document.querySelectorAll('.podium .prow')].map(e => [e.querySelector('.nm').textContent, +e.querySelector('.total').textContent.replace('−', '-')])`);
  const bad = podium.filter(([n, v]) => exp[n] !== v);
  if (bad.length) bug('final podium differs from hand totals: ' + bad.map(([n, v]) => `${n} ${v} vs ${exp[n]}`).join(', '));
  else pass('final podium matches the hand calculation');
  const sorted = [...podium].sort((a, b) => b[1] - a[1]).map(x => x[0]).join(',');
  if (sorted !== podium.map(x => x[0]).join(',')) bug('podium is not in score order');
  const winner = await host.text('.winner h1'), top = Object.entries(exp).sort((a, b) => b[1] - a[1]);
  log('  winner on screen:', winner, '| hand:', top[0][0], top[0][1]);
  const awards = await host.eval(`[...document.querySelectorAll('.awards li')].map(li => li.innerText.replace(/\\n/g, ' '))`);
  log('  awards:', awards.length, 'for', podium.length, 'players');
  if (awards.length !== podium.length) bug(`awards card lists ${awards.length} players, podium has ${podium.length}`);
  awards.forEach(a => log('   -', a));
  await host.shot('10-final.png');
  await host.click('[data-act=scores]'); await sleep(400); await host.shot('10-scores-table.png'); await host.click('#sheet [data-act=close]');
  for (const [k, v] of Object.entries({ Hannah: 'joined round 4', Farouk: 'left after round 7' })) log(`  ${k} (${v}) final total ${exp[k]}`);
  await checkErrors('final');
} catch (err) {
  bug('script stopped: ' + err.message);
  for (const p of Object.values(allPhones)) if (!p.closed) try {
    log(`  [${p.name}] ` + await p.eval(`(document.querySelector('#top')?.innerText || '').replace(/\\s+/g, ' ') + ' | ' + (document.querySelector('#app')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 220) + (document.getElementById('sheet').hidden ? '' : ' | SHEET: ' + document.getElementById('sheet').innerText.replace(/\\s+/g, ' ').slice(0, 120))`));
  } catch (e) { log(`  [${p.name}] dump failed: ${e.message}`); }
  try { await allPhones.Ana.shot('crash.png'); } catch {}
}

log('\n== Game codes (test games) ==\n' + (codes.join(', ') || 'none'));
log('\n== Sync timings (ms) ==');
for (const [what, r, ms] of timing) log(`${what.padEnd(40)} round ${r}: ${ms}`);
log('\n== Bugs ==\n' + (BUGS.length ? BUGS.map(b => '- ' + b).join('\n') : 'none'));
log('\n== Notes ==\n' + (NOTES.length ? NOTES.map(b => '- ' + b).join('\n') : 'none'));
writeFileSync(join(OUT, 'log.txt'), LOG.join('\n'));
ws.close(); chrome.kill();
process.exit(0);
