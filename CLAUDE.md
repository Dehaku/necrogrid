# Necrogrid

Top-down browser survival game: a necromancer defends a Phylactery against demon waves, harvests corpses, and builds on a grid.

## Source of truth

- `GAME_DESIGN.md` is the spec. Build what it says; if something is missing or contradictory, ask instead of guessing, then record the answer in the doc.
- `lore.md` is flavor only. It never overrides mechanics.
- Build milestones (GAME_DESIGN.md section 14) in order. Do not start a milestone until the previous one meets its "Done when" criteria.

## Current status

- Milestone: **M9 done** (Wraiths with fade-in, Lantern targeting, and shots; Hellhounds from day 5; day-15 completion, win screen and endless; respawn after completion; Phylactery loss on; warning banners). Next: M10. Update this line when a milestone is finished.
- Before M10 a human should play one full run at 1× (GAME_DESIGN.md M9 "Done when"); the automated soak run (day 1 → completion) passes but is not a playtest.
- Player combat numbers come from `Game.stats` (base stats + equipped gear). Pass `stats` into Bolt, Chain, mana regen, and the spell bar; never read `BOLT.damage` etc. directly for gameplay.
- `new Game(seed, events, { startingBase: false })` skips the free walls and Totem; use it in tests that need open ground around the Phylactery.
- Resources change only through `Game.gain` / `Game.spend`, which emit `resources:changed` (the HUD counters depend on it).
- The page opens on the title screen with no run. `main.ts` owns `game` (undefined when no run is active) and creates a fresh `Game` and `EventBus` per run; anything that listens to game events must re-attach per run (see `Effects.attach`).
- `SPAWN.activeRoster` in `src/data/spawn.ts` lists the enemies the director spawns (all five since M9).

## Commands

- `npm install`: install dependencies
- `npm run dev`: start the Vite dev server (http://localhost:5173)
- `npm test`: run Vitest once
- `npm run build`: type-check (`tsc`) and build for production

## Rules

- TypeScript + Vite + Canvas 2D. No game engine, no runtime dependencies beyond what M0 sets up.
- **Data over code:** every tunable number lives in `src/data/`. Files there hold data only. Logic that uses them has a different filename elsewhere.
- **Deterministic simulation:** all randomness goes through the seeded RNG in `src/core/rng.ts`. Never use `Math.random`. The one exception is picking a new run's seed with `crypto.getRandomValues` (GAME_DESIGN.md section 8.5).
- **Fixed timestep:** logic runs in 1/60 s steps. Only `src/render/`, `src/ui/`, and `src/debug/` draw; simulation code (`src/game.ts` and everything it calls) never touches the canvas or the DOM.
- **Hot loops use typed arrays and indexed loops** (flow fields, chunk lookups). Keep `getTile` and field builds allocation-free; a field rebuild should stay around 3 ms.
- **World units are tiles.** Tile (x, y) covers [x, x + 1) × [y, y + 1). Speeds in the doc are px/s; divide by `TILE_SIZE`.
- **Controls come from `src/data/controls.ts`.** Never hard-code a key code elsewhere.
- Systems talk through the event bus in `src/core/events.ts`, not by importing each other's internals.
- Add or update unit tests in `tests/` for the math the doc calls out (chain falloff, stat modifiers, repair cost, spawn rates, map generation, targeting, flow fields).
- When a balance value changes, record it in GAME_DESIGN.md section 16.

## Workflow

- Run `npm test` and `npm run build` before calling a milestone done.
- Check the milestone in the browser with `?debug` and the debug panel (GAME_DESIGN.md section 13). With `?debug`, `window.necrogrid` exposes internals for console checks. Add `&seed=N` for a fixed map.
- Commit at the end of each milestone.
