# Skull King Scorer

Live scorekeeper for Skull King. Everyone joins on their own phone, bids are hidden until all are in, tricks are counted live, and the scoreboard updates on every phone at once.

Plain HTML/CSS/JS, no build step. Live sync via Firebase Realtime Database with anonymous sign-in (players need no accounts).

## Scoring (classic + bonuses)
| | |
|---|---|
| Bid 1+ made exactly | +20 per trick + bonuses |
| Bid 1+ missed | −10 per trick off |
| Bid 0 made | +10 × round + bonuses |
| Bid 0 missed | −10 × round |
| Coloured 14 / black 14 | +10 each / +20 |
| Mermaid captured by your Pirate | +20 each |
| Pirate captured by your Skull King | +30 each |
| Skull King captured by your Mermaid | +40 |

Bonuses only count when the bid is made.

## Firebase setup (one time, ~5 minutes)
1. Go to https://console.firebase.google.com → **Add project** (Analytics not needed).
2. **Build → Realtime Database → Create database**, location *Singapore (asia-southeast1)*, start in **locked mode**.
3. On the database's **Rules** tab, paste the contents of `database.rules.json` and **Publish**.
4. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable**.
5. **Authentication → Settings → Authorized domains → Add domain** `wunwunzero.github.io`.
6. **Project settings (gear) → Your apps → Web (`</>`)**, register an app (no hosting), and copy the `firebaseConfig` values into `firebase-config.js`.
7. Commit and push. The live site switches from local mode to live sync.

Without a config the app runs in **local mode**: games sync between tabs on one device only (handy for testing or one shared phone).

## Development
```
node --test tests/*.test.mjs
```
Preview: the `skull-king` entry in `~/Desktop/.claude/launch.json` (port 8767). Add `?local` to force local mode and `?fresh` to ignore the remembered seat (to test several players in tabs). In the console, `skSeed()` fills the open game with a random finished 10-round game.
