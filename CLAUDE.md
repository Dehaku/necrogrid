# Necrogrid

Top-down browser survival game: a necromancer defends a Phylactery against demon waves, harvests corpses, and builds on a grid.

## Source of truth

- `GAME_DESIGN.md` is the spec. Build what it says; if something is missing or contradictory, ask instead of guessing, then record the answer in the doc.
- `lore.md` is flavor only. It never overrides mechanics.
- Build milestones (GAME_DESIGN.md section 14) in order. Do not start a milestone until the previous one meets its "Done when" criteria.

## Current status

- Milestone: **M0 not started.** Update this line when a milestone is finished.

## Commands

Set up during M0; keep this list accurate once they exist.

- `npm install`: install dependencies
- `npm run dev`: start the Vite dev server
- `npm test`: run Vitest once
- `npm run build`: type-check and build for production

## Rules

- TypeScript + Vite + Canvas 2D. No game engine, no runtime dependencies beyond what M0 sets up.
- **Data over code:** every tunable number lives in `src/data/`. Files there hold data only. Logic that uses them has a different filename elsewhere.
- **Deterministic simulation:** all randomness goes through the seeded RNG in `src/core/rng.ts`. Never use `Math.random`. The one exception is picking a new run's seed with `crypto.getRandomValues` (GAME_DESIGN.md section 8.5).
- **Fixed timestep:** logic runs in 1/60 s steps. Only `src/render/` touches the canvas.
- Systems talk through the event bus in `src/core/events.ts`, not by importing each other's internals.
- Add or update unit tests in `tests/` for the math the doc calls out (chain falloff, stat modifiers, repair cost, spawn rates, map generation, targeting, flow fields).
- When a balance value changes, record it in GAME_DESIGN.md section 16.

## Workflow

- Run `npm test` and `npm run build` before calling a milestone done.
- Check the milestone in the browser with `?debug` and the debug panel (GAME_DESIGN.md section 13).
- Commit at the end of each milestone.
