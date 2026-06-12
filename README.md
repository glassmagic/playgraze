# GRAZE

A neon survival arena where almost-dying is the point — skim bullets, build your combo, unleash the nova. Danger pays.

The entire game is one file, [index.html](index.html): no dependencies, no build step. Open it in a browser and play.

```sh
open index.html
```

(The global leaderboard is backed by a Netlify function, so it shows as unreachable when the file is opened locally — everything else works. The deployed game at [playgraze.com](https://playgraze.com) has the full experience.)

## How it plays

Your ship shadows the mouse (or WASD/arrows) and fires automatically at the nearest threat — position is your only real weapon. A faint ring surrounds your ship: any enemy or bullet that crosses it without touching you is a **graze**, and grazes feed everything — score, combo, and surge. Playing it safe makes the combo multiplier decay; living close to the fire is how you score.

Grazes charge the golden **surge** meter. Holding a full surge passively boosts your damage, or you can press **SPACE** to detonate a nova scaled by your current multiplier. Hoard it or spend it — greed is a strategy.

Fallen enemies drop shards that level you up. Each level pauses the action and offers a draft of three **bonuses** (common through legendary) from a pool of 20+ — pierce, ricochet, frost, orbitals, black-hole novas, and occasional mid-run weapon refits. Builds compound, so no two runs play alike.

## Controls

| Input | Action |
|---|---|
| Mouse / WASD / arrows | Move (firing is automatic) |
| SPACE | Detonate nova when surge is full |
| 1 / 2 / 3 | Pick a bonus card |
| SPACE or R | Instant restart from the death screen |
| M | Toggle sound |
| ESC | Back out of menus / return to menu after death |

## Meta progression

- **Cores (⬢)** drop from elites, heavies, and bosses, and your score banks more when you die. Spend them in the **HANGAR** on permanent ship systems, twelve weapons (from scatter pellets to gravity wells), and **ship hulls** with real tradeoffs — the fast two-heart DART or the four-heart AEGIS. Weapons must be **discovered first**: take one as a mid-run refit card and it becomes purchasable; until then the hangar shows an UNDISCOVERED placeholder.
- **Difficulty director** introduces nine enemy types over the first four minutes, sends affixed elites (shielded, fissile, burst) after the two-minute mark, sends an easier **herald boss at 1:30** then a **named boss every three minutes**, and past 90 seconds turns the arena itself hostile with meteor showers, laser sweeps, and gravity storms.
- A **daily streak** bonus rewards coming back each day, and a **weekly mutator** (same for every player, shown on the menu) rewrites one rule of the game each week.
- A **global leaderboard** (from the main menu) tracks the best run per callsign across ALL TIME / THIS WEEK / TODAY windows. After a death, ADD SCORE TO LEADERBOARD prompts for a callsign (remembered for next time) and shows your rank in the top ten. No sign-in; one entry per name.

Progress saves to `localStorage` (a double-click reset button in settings wipes it).

## Tech notes

- Vanilla JavaScript on a single `<canvas>` — no frameworks, no assets.
- The leaderboard is a single Netlify function ([netlify/functions/scores.mjs](netlify/functions/scores.mjs)) storing scores in Netlify Blobs, exposed at `/api/scores`. It keeps the max score per username and applies basic plausibility checks on submissions.
- All audio is synthesized live with the Web Audio API, including the soundtrack, which layers up as a run gets more intense.
- Cinematic dressing (film grain, letterboxing, color grade, anamorphic title flare) is done in CSS on top of the canvas; in-engine cinematics — the launch flythrough, boss intro slow-mo, kill-cam, and a parallax wreckage layer — run on the canvas itself.
- Works with touch — the ship follows your finger.
- Installable as a **PWA** (settings → INSTALL): a service worker keeps the shell cached for instant, offline-capable launches while deploys still land immediately.
