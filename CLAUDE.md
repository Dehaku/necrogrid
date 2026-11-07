# Necrogrid

Top-down browser survival game: a necromancer defends a Phylactery against demon waves, harvests corpses, and builds on a grid.

## Source of truth

- `GAME_DESIGN.md` is the spec. Build what it says; if something is missing or contradictory, ask instead of guessing, then record the answer in the doc.
- `lore.md` is flavor only. It never overrides mechanics.
- Build milestones (GAME_DESIGN.md section 14) in order. Do not start a milestone until the previous one meets its "Done when" criteria.

## Current status

- Milestone: **M1 done** (procedural chunks, rock collision, marsh slow). Next: M2. Update this line when a milestone is finished.

## Commands

- `npm install`: install dependencies
- `npm run dev`: start the Vite dev server (http://localhost:5173)
- `npm test`: run Vitest once
- `npm run build`: type-check (`tsc`) and build for production

## Rules

- TypeScript + Vite + Canvas 2D. No game engine, no runtime dependencies beyond what M0 sets up.
- **Data over code:** every tunable number lives in `src/data/`. Files there hold data only. Logic that uses them has a different filename elsewhere.
- **Deterministic simulation:** all randomness goes through the seeded RNG in `src/core/rng.ts`. Never use `Math.random`. The one exception is picking a new run's seed with `crypto.getRandomValues` (GAME_DESIGN.md section 8.5).
- **Fixed timestep:** logic runs in 1/60 s steps. Only `src/render/` and `src/ui/` draw; simulation code never touches the canvas.
- **World units are tiles.** Tile (x, y) covers [x, x + 1) × [y, y + 1). Speeds in the doc are px/s; divide by `TILE_SIZE`.
- **Controls come from `src/data/controls.ts`.** Never hard-code a key code elsewhere.
- Systems talk through the event bus in `src/core/events.ts`, not by importing each other's internals.
- Add or update unit tests in `tests/` for the math the doc calls out (chain falloff, stat modifiers, repair cost, spawn rates, map generation, targeting, flow fields).
- When a balance value changes, record it in GAME_DESIGN.md section 16.

## Workflow

- Run `npm test` and `npm run build` before calling a milestone done.
- Check the milestone in the browser with `?debug` and the debug panel (GAME_DESIGN.md section 13). With `?debug`, `window.necrogrid` exposes internals for console checks. Add `&seed=N` for a fixed map.
- Commit at the end of each milestone.
