import { readFileSync } from 'node:fs';
globalThis.localStorage = { getItem: () => null, setItem() {} };
const R = new URL('../', import.meta.url).pathname;   // repo root
const { DICT } = await import(R + 'i18n.js');
const src = ['app.js', 'scoring.js', 'crew.js', 'avatars.js'].map(f => [f, readFileSync(R + f, 'utf8')]);
// all quoted string literals
const lits = new Map();
for (const [f, s] of src) {
  const re = /(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g; let m;
  while ((m = re.exec(s))) { const v = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'); if (!lits.has(v)) lits.set(v, `${f}:${s.slice(0, m.index).split('\n').length}`); }
}
// candidate UI strings: those inside t( / tn( calls or arrays. Heuristic: has a letter + (space or capital start) and not code-like
const codey = v => /^[a-z0-9\-_.\/#:\[\]=\s>]*$/.test(v) && !/ /.test(v) || /[<>{}=]/.test(v.replace(/\{\w+\}/g, '')) || /^(sk\.|#|\.|\[|https?:)/.test(v) || /\$\{/.test(v);
const missing = { zh: [], ms: [] };
for (const [v, at] of lits) {
  if (!/[A-Za-z]/.test(v) || codey(v)) continue;
  for (const l of ['zh', 'ms']) if (!(v in DICT[l])) missing[l].push(`${at}  ${JSON.stringify(v)}`);
}
console.log('--- literals missing in zh (heuristic) ---'); console.log(missing.zh.join('\n'));
console.log('--- in zh not ms ---', Object.keys(DICT.zh).filter(k => !(k in DICT.ms)));
console.log('--- in ms not zh ---', Object.keys(DICT.ms).filter(k => !(k in DICT.zh)));
const ph = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
for (const l of ['zh', 'ms']) for (const [k, v] of Object.entries(DICT[l])) if (ph(k) !== ph(v)) console.log('PLACEHOLDER', l, JSON.stringify(k), '=>', JSON.stringify(v));
