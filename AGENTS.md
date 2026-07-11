# AGENTS.md — working on GRAZE

GRAZE is a neon survival arena ("danger pays") that lives at **https://playgraze.com**. The entire game is **one file, `index.html`** — no framework, no build step, no assets. One Netlify function (`netlify/functions/scores.mjs`) backs the global leaderboard. This document is everything a fresh agent needs to work on it well; it captures decisions and history that are *not* apparent from the code.

## Repo map

| File | What it is |
|---|---|
| `index.html` | The whole game: CSS, HTML overlays, and ~3,600 lines of vanilla JS on one `<canvas>`. All audio is synthesized (Web Audio), including the soundtrack. |
| `netlify/functions/scores.mjs` | Leaderboard API at `/api/scores`, storing into Netlify Blobs (store `leaderboard`, key `scores`). |
| `manifest.json`, `sw.js`, `icon.svg` | PWA: installable via SETTINGS → INSTALL. The service worker is network-first for the shell so deploys land instantly. |
| `package.json` | Only exists to pin `@netlify/blobs` for the function bundle. Netlify runs `npm ci` automatically — there is still no build command. |
| `.claude/launch.json` | Dev server config: `python3 -m http.server 8642` under the name `graze`. |

## The golden rules

1. **Every PR bumps `const VERSION` in index.html exactly once: PR #N = v1.N.0.** It renders in SETTINGS and the menu corner; the user tracks deploys by it. Set it when opening the PR; don't re-bump for follow-up commits to the same open PR. Patch slot (v1.N.1) is reserved for a rare hot-fix PR of the previous PR. This is part of definition-of-done.
2. **One feature branch per PR; never commit to main.** The user merges PRs on GitHub and deletes the branch, then tells you. Your tidy-up: `git checkout main && git pull`, delete the local branch, `git fetch --prune`, then verify production serves the new version (`curl -s https://playgraze.com | grep -o 'VERSION="[0-9.]*"'`).
3. **Verify in a real browser before opening/updating a PR.** See "How to verify" below. PR bodies follow the house style: *What changed* + *Verified in browser* with concrete measurements.
4. **Multiple features per PR is normal here.** The user tends to fire follow-up requests at an open PR; push them as separate commits and keep the PR body updated.
5. **Never leave test data in the production leaderboard** (see Data hygiene).

### Fast path for tiny changes

For copy tweaks, constant changes, or similarly low-risk edits, keep the workflow lean:

1. Read this file, check `git status` and the current PR state, then search for every occurrence of the text or value being changed.
2. Patch all occurrences, bump `VERSION` only if this will be a new PR, and inspect the diff. If a PR is already open, add a commit to it and do not bump again.
3. Run `git diff --check`. Run `node --check` on the extracted inline script only when JavaScript changed. Verify the affected UI once in the local browser; add one narrow-screen check only if the copy is longer or layout could move.
4. Commit, push, open or update the PR, and give the user the PR link immediately. Do not add unrelated refactors, spin up reviewers, invent a test suite, or wait for the deploy preview unless the change is risky or the user asks. There is no build step.

## Deployment (Netlify)

- Site: team **Spire**, project **quiet-platypus-b61f92**, site id `3ccf41ab-61ba-4011-b467-be345b9cd711`. Production = `main` → **playgraze.com** (~30s after merge). Every PR gets a preview at `https://deploy-preview-<PR#>--quiet-platypus-b61f92.netlify.app`.
- Build settings live in the **site UI**, not the repo: build command empty, publish = repo root. **Do not add a `netlify.toml`** — one was tried and removed; it adds nothing.
- **The repo must stay public.** Netlify's free plan blocks builds from private repos when commit authors (including `Co-Authored-By` trailers) aren't verified team members ("Build blocked: Unrecognized Git contributor"). The repo was made public specifically to solve this.
- GitHub's checks only say "Deploy Preview failed" — the real reason is in the deploy record:
  ```sh
  npx -y netlify-cli api listSiteDeploys \
    --data '{"site_id":"quiet-platypus-b61f92.netlify.app","per_page":3}' \
    | jq -r '.[] | "\(.created_at) \(.state) \(.branch) \(.commit_ref[0:7]) \(.error_message)"'
  ```
- The Netlify CLI is authenticated on this machine and the repo dir is linked (`.netlify/state.json`). Use `npx -y netlify-cli …`.
- Free-plan credit math: production deploys cost ~15 credits each of 300/month; function+Blobs usage is negligible. Don't casually migrate the leaderboard to Netlify DB — it burns compute-hours while awake.

## The leaderboard (function + Blobs)

- Blob schema: `{ all: {nameKey: {name,score,time,at}}, day: {"YYYY-MM-DD": {…}}, week: {"YYYY-Www": {…}} }`. One entry per callsign (case-insensitive), **max score only**, per window. Old day/week buckets are pruned on write; a legacy flat blob migrates on read.
- `GET /api/scores?window=day|week` (default all) returns `{scores: top100, total}`. `POST {name, score, time}` returns `{best, bestAt, rank, improved, total}` — `bestAt` powers the client's "YOUR JUN 13 BEST OF 300,053 STANDS" message.
- **Consistency**: the POST read-modify-write reads with `consistency:"strong"` (eventual reads once let a lower score clobber a higher one). GET uses eventual/edge reads for speed. The game fires a warm-up `fetch` on page load because cold starts once made the board look broken (multi-second first calls).
- **Known weakness**: two simultaneous POSTs race (last write wins, one submission lost). Accepted at current traffic; fix candidate is write-verify-retry.
- Validation: callsign 2–16 chars `[a-z0-9 _.-]`, score ≥1, time 5–86400s, score ≤ (time+10)×25000. Friendly anti-forgery only.
- **Deploy previews share the production Blobs store.** Any POST you make while testing lands on the real board.

## Data hygiene

```sh
npx -y netlify-cli blobs:get leaderboard scores > /tmp/lb.json      # inspect
jq 'del(.all.test)' /tmp/lb.json > /tmp/lb2.json                    # surgically remove an entry
npx -y netlify-cli blobs:set leaderboard scores --input /tmp/lb2.json
```
Real players exist (Peter T., Conrad-Peter T., Shaunak, AdamP, DanDan…). Their data is sacred. When testing submission flows, stub `window.fetch` in the browser instead of hitting the real API; if you must POST for real, remove the entry afterwards.

## How to verify (the local workflow)

- Start the dev server via the preview tooling with launch config **`graze`** (serves on :8642). The leaderboard shows UNREACHABLE locally — expected; functions only run on Netlify.
- **Frame-driving is the key trick.** The game loop runs on `requestAnimationFrame`, which pauses in background tabs. Drive it manually:
  ```js
  let t = last + 33;                     // `last` is the loop's own clock — MUST continue from it,
  for (let i=0;i<60;i++){ t+=33; loop(t); }  // starting from performance.now() gives dt=0 frames
  ```
- Useful test switches: `AU.muted=true`, `G.invuln=99999`, `G.launch=0` (skip the launch flythrough), `G.introAt={}` (silence the spawn director), `G.runWeapon="<id>"` (equip anything), `meta.cores=99999`.
- Death/leaderboard flows: stub `window.fetch` and dispatch real `PointerEvent("pointerdown",{bubbles:true})` on buttons (the UI is pointerdown-driven, not click).
- The soundtrack scheduler can be tested silently with a fake AudioContext (stub createOscillator/createGain/etc. and step `currentTime`).
- **Always clean up**: `localStorage.removeItem("graze_save")` after tests that touch meta.
- Watch out: your own test runs can die mid-frame-drive (state flips to "dying"/"dead" and updates stop) — check `G.state` when results look impossible.

## Game architecture (all inside index.html's single script)

- **Persistence**: `meta` object ↔ `localStorage["graze_save"]` (best, cores, owned weapons/hulls/pilots, `seen` weapon discovery, pilot, scheme, callsign `player`, shop levels, daily streak).
- **Audio** (`AU`): SFX + a composed soundtrack on **Am–F–C–G (i–♭VI–♭III–♭VII) at 126bpm** — 8-bar hook, bass, snare, chiptune arps, layered by intensity (1 base / 2 at 1:00 / 3 at 2:30); every 4th phrase breaks down; **menus play the same hook at half speed** (music box). `pluck()` follows the same progression.
- **Enemies**: `ETYPES` + `WSPAWN`; per-run shuffled introductions (`rollIntroPlan`: chaser/drifter/weaver fixed at 0/25/55s, rest randomized on 30s slots from 85s). Elites (after 2:00) carry affixes: shield / split / spray. Special: `courier` (fleeing treasure, excluded from rotation), `warden` (directional bullet-blocking shield — heavy weapons bypass), `bomber` (mines via `zones`), `leech` (drains surge through a tether).
- **Bosses**: THE HERALD (easier, once, at 1:30) then named bosses every 180s, rotating attacks (ring/burst/charge/summon), letterbox intro + kill-cam via the generic `G.cine` slow-mo/zoom system. Every slain boss leaves a pilot prisoner; collecting them unlocks one random undiscovered pilot.
- **Arena events** (after 90s, ~50s cadence): meteor shower (grazeable `ebul`), laser sweep (hurts everyone), gravity storm (wandering soft hole that pulls the player).
- **Black holes** (`holes`): hard (Event Horizon bonus, damages) vs `soft` (Singularity Seed / storms — holds without harming). Bosses are immune to wells.
- **Weapons**: all fire logic branches in `updatePlayer`'s auto-fire; waves/flail/holes have their own update fns. Heavy weapons (arc/beam/rift/flail) scale with `heavyBoost` (pierce/ricochet/homing each +12%). The CONRADIATOR uses `player.heat`: each shot adds 2.15% heat; its strongly nonlinear spool runs 1→15/s through 65% heat in roughly four seconds, then kicks to 34/s. Primary bullets deal 11% base damage, full heat vents back to a true 0-heat/1-shot-per-second cold restart, retargeting loses 60% heat, and cooling begins after 1.1s off-trigger so the opening shots can retain heat.
- **Progression**: bonus draft (3 cards; rarity legendary 5%/epic 19%/rare 32%; a weapon-refit seat is force-rolled 40% of shut-out drafts; **devil's pacts** unlock after the first boss kill — guaranteed 4th card next draft, 22% after). Weapon **discovery**: hangar only sells weapons taken as a refit mid-run (`meta.seen`). Pilot **rescue**: only REX NEBULAR starts unlocked; boss prisoners unlock the other pilots in random order, pausing on a dossier card with a unique inline-SVG portrait. If a bonus draft is already open, its choice resolves first and the queued pilot dossier follows immediately.
- **Hangar Shop tabs**: WEAPONS / SHIPS / PILOTS / SHIP SYSTEMS / PAINTWORK. Hull `size` scales drawn ship, heart ring, heat gauge **and hitbox** (`player.r`). Pilots (free) set aim (spread × acc + per-shot jitter, floor at acc 0.65) and fire-rate multiplier.
- **Weekly mutator** (`MUT`): ISO-week-derived, same for every player, hooks score/graze/surge/spawn/enemy-hp/speeds/cores/hearts. Shown on the menu.
- **Live meta-game**: rival ladder (silent until your run beats the current #10; then place countdown to the crown), bounty marks (~45s, +3 cores), photo-less share row (X/WhatsApp/FB/Telegram/Reddit/native/copy) with rank-bearing links.
- **Cheat mode**: the hidden hotspot is the top-left of the Z in the menu wordmark. Its entry string is validated against a SHA-256 digest; never put the plaintext in the repository. Enabling snapshots the entire pre-cheat `meta`, grants every weapon/ship/pilot plus max ship systems and 999,999 cores, and persists a CHEAT MODE badge. Disabling restores the snapshot exactly and returns to the menu. Cheat runs cannot submit leaderboard scores. Because every pilot is pre-unlocked, cheat-mode prisoner pickups choose a random non-REX dossier so rescue-card testing still works.
- **Cinematics**: launch flythrough (`G.launch`), boss intro/kill-cam (`G.cine`), death singularity (drags everything in, camera push, collapse flash, canvas snapshot idea was removed), staggered SIGNAL LOST entrance, count-up score, analog title flicker.
- **Background**: pre-baked nebula sprites + stars + wreckage debris on an ever-running camera tour (`cam`: drift 5–12px/s, glides 40–70px/s every 15–30s).

## Key decisions & their reasons (not visible in code)

- **"Bonuses", not "evolutions"** — user renamed for clarity; the bonus bar's visible HUD label is **NEXT BONUS · LV N**.
- **Milestones/lifetime-unlocks were removed on purpose** (v1.5). Don't reintroduce score-gated unlocks; progression is cores + discovery only. All paint schemes are free.
- **Restarting is deliberate**: ONE MORE RUN button, SPACE, or R — a stray click must never launch a run (it used to; players hated it).
- **Score submission is an explicit button**, never automatic — and boards keep *best per callsign*, which confuses players ("my run vanished"); that's why the not-improved message names the date of the standing best.
- **Best-per-window semantics**: day/week buckets only contain runs submitted during that window; old entries aging out of TODAY/THIS WEEK is correct, not a bug (this was investigated in production — nothing was lost).
- **Base ship speed was deliberately lowered twice** (235→185→155) so thruster upgrades and speed cards are feelable. Don't "fix" the slow ship.
- **Legendaries are events, not routine** (~18% of drafts); expensive weapons are rare in drafts but every weapon must remain *encounterable* (measured distribution: scatter ~7% of drafts … well ~1.4%).
- **Hitbox honesty**: bigger hulls are genuinely bigger targets. That's the balance, don't decouple visuals from hitbox.
- **Mobile is first-class**: two-finger tap or surge-bar tap = nova; overlays must scroll (`flex-shrink:0` on children of fixed-height flex columns — this exact bug shipped once); corner texts shrink at ≤760px.
- **Tesla Arc "never misses"** is a promise — pilot accuracy deliberately doesn't touch it.
- **Community naming**: CONRADIATOR (weapon) and the pilots (MR TILER loves coffee and must stay one of the better ones) reference real players/friends. Keep that spirit.

## Incident log (so you don't re-learn these)

- **Blobs eventual consistency** let a lower score overwrite a higher one → strong reads on POST only (v1.5). Cold-start + strong GET made the board feel dead → eventual GET + warm-up ping.
- **Death-screen overlap on phones**: fixed-height flex column *shrinks children into each other*; fix was `overflow-y:auto` + `flex-shrink:0`.
- **`hex2rgb` only parses 6-digit hex** — `"#fff"` in any `drawGlow`/`burst` color crashes the render loop.
- **GitHub connectivity flaps on this network**: DNS sometimes serves dead IPs. Fallbacks that work: `curl --resolve api.github.com:443:140.82.121.6` for the REST API (with `gh auth token`), and `GIT_SSH_COMMAND="ssh -o Hostname=140.82.121.4 -o HostKeyAlias=github.com" git push` for git. Try normal `gh`/`git` first.
- **Frame-driving with fresh `performance.now()`** silently produces dt=0 frames (the loop's `last` is in the future after prior synthetic frames). Always continue from `last`.
- **Empty spawn pools** (e.g. test harnesses clearing `G.introAt`) used to crash `director` — now guarded, keep it that way.

## Working with the user

- They propose features conversationally, often in batches; when *you* have ideas, present options and get approval before implementing (established pattern — they picked from menus of suggestions several times).
- They merge PRs themselves and delete branches on GitHub, then say so; do the local tidy-up and verify production without being asked twice.
- Tone of the game's copy: lowercase quiet menace ("handles like a fridge. beloved."). Match it in any new UI text.
