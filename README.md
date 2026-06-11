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

Fallen enemies drop shards that level you up. Each level pauses the action and offers a draft of three **evolutions** (common through legendary) from a pool of 20+ — pierce, ricochet, frost, orbitals, black-hole novas, and occasional mid-run weapon refits. Builds compound, so no two runs evolve alike.

## Controls

| Input | Action |
|---|---|
| Mouse / WASD / arrows | Move (firing is automatic) |
| SPACE | Detonate nova when surge is full |
| 1 / 2 / 3 | Pick an evolution card |
| SPACE or R | Instant restart from the death screen |
| M | Toggle sound |
| ESC | Back out of menus / return to menu after death |

## Meta progression

- **Cores (⬢)** drop from elites and heavies, and your score banks more when you die. Spend them in the **HANGAR** on eight permanent ship systems (damage, fire rate, hull, speed, magnet, graze radius, surge gain, luck) and ten unlockable weapons — from scatter pellets and railguns to chain lightning, lasers, and a tethered wrecking orb. Weapons must be **discovered first**: take one as a mid-run refit card and it becomes purchasable; until then the hangar shows an UNDISCOVERED placeholder.
- **Lifetime-score unlocks** grant color schemes, starting perks, and a fourth heart at higher thresholds.
- **Difficulty director** introduces nine enemy types over the first four minutes, scales pressure with time survived, and starts sending elites after the two-minute mark.
- A **daily streak** bonus rewards coming back each day.
- A **global leaderboard** (from the main menu) tracks the best run per callsign. After your first death you can optionally enter a name — from then on your best scores submit automatically. No sign-in; one entry per name.

Progress saves to `localStorage` (a double-click reset button in the hangar wipes it).

## Tech notes

- Vanilla JavaScript on a single `<canvas>` — no frameworks, no assets.
- The leaderboard is a single Netlify function ([netlify/functions/scores.mjs](netlify/functions/scores.mjs)) storing scores in Netlify Blobs, exposed at `/api/scores`. It keeps the max score per username and applies basic plausibility checks on submissions.
- All audio is synthesized live with the Web Audio API, including the soundtrack, which layers up as a run gets more intense.
- Cinematic dressing (film grain, letterboxing, color grade, anamorphic title flare) is done in CSS on top of the canvas.
- Works with touch — the ship follows your finger.
