# Necrogrid — Game Design Document

**Working title:** Necrogrid (placeholder)
**Platform:** Desktop browser (Chrome/Firefox/Edge), keyboard + mouse
**Genre:** Top-down survival with grid-based base building
**Status:** Design v0.20. Buildable from M0; decisions are listed in section 18.

> **How to use this document:** Each milestone in section 14 is a self-contained build step. Build them in order. Every numeric value in this document is a *starting value* that lives in `src/data/` so it can be tuned without touching logic. Flavor text lives in `lore.md` and never overrides mechanics here.

---

## Revision History

| Version | Changes |
|---|---|
| 0.1 | Initial design |
| 0.2 | Defaults confirmed. Corpses fade over the next day phase instead of a 60 s timer. Added the central Phylactery (section 10.4) as the win target and a loss condition. Enemies target whichever is closer: the player or the Phylactery. |
| 0.3 | Phylactery completion grants lich-like immortality. After completion, the necromancer respawns instantly on death, and destroying the Phylactery is the only way to end the run. Win is still completion on day 15. |
| 0.4 | Wraiths fly directly to their target with no pathing. Added a movement and navigation architecture (section 15.1). |
| 0.5 | Review pass. Lower spawn rates. Free starting walls and a guaranteed Totem (section 10.5). Repair cost scales with build cost. Player shots pass over their own buildings. Target hysteresis; Wraiths use straight-line distance. Ossuary replaced by the Corpse Collector. Cycle is now 150 / 10 / 80 / 10 s. Procedural chunked map with a follow camera. Ground enemies spawn around the player beyond view; Wraiths fade in around the Phylactery. Rock is rarer. Soul Shards come from large enemies. Allies removed from scope. Auto-pause on tab switch. Corpse render limit and a Settings section (section 12). Debug panel (section 13). Expanded gear for mana, regen, and damage. |
| 0.6 | Phylactery lore: it is built over all 15 days. Mechanically, nothing happens until the day 15 timer completes, which is the win. Wraiths appear on every night from day 1. |
| 0.7 | Second review pass. Mend (Flesh heal on Q). Resource sources follow the loot table, with drop chances. Unit radius 0.5 tile, melee range 2 tiles. Wraiths stop at range and fire slow shots. Base light radius 10. Altar range 0.5 tile. Totems shoot the nearest enemy. Spawn budget and spawn weights. Spawn rules keep enemies out of walled areas and off screen. Gear is unlocked, not stored. Hellhound from day 5. Player collides with buildings; new Bone Door. Elites (5%). Smoothed movement, no diagonal corner-cutting. Renamed duplicate filenames. Browser input handling. Time-scale and far-enemy fixes. |
| 0.8 | Elites drop 4× loot plus a guaranteed Soul Shard. HUD defined (section 8.4): health and mana crescents on the character, day ring, Phylactery panel and arrow, compact resources, warnings, contextual prompts. Tab and C menus pause the game. |
| 0.9 | Spell bar: Bolt and Chain icons beside the Mend badge. Title screen with grave-rising letters, reused as the pause screen (Resume on top while a run is active), with a New Game confirmation and a controls panel (section 8.5). Health bars on damaged enemies and buildings, green / yellow / red by thirds. Numbers confirmed as starting values for playtesting. |
| 0.10 | Spawning rewritten: no pathing, off screen, at least 3 tiles from buildings, around the player or the Phylactery (section 6). Wraiths use the same rules. Chunk generation radius raised to 2 × view. Respawn defined: no-build zone around the Phylactery, 3 s delay with camera pan, 30 HP Phylactery cost, 3 s invulnerability, cooldowns reset (section 10.4). |
| 0.11 | No-spawn grid: each building blocks spawns within its `noSpawnRadius` (3 tiles, Bone Totem 5), kept as a counter grid updated on place and remove (section 6). |
| 0.12 | Enemy attack swipes: a short crescent swipe toward what a melee enemy hits, red (orange for elites), built in M4 (section 7). |
| 0.13 | Swipe reworked: the bright edge leads and the fade trails behind. Player-made Marsh (10 Flesh, 1 Ichor) added to the build list, with open questions (decision 36). |
| 0.14 | Marsh slows ground demons too. Fill (5 Bone, 5 Flesh) turns any marsh into dirt. No refunds; marsh stays out of the no-build zone. Hotbar keys 1–8. |
| 0.15 | Starting Totem moved to the ring one tile past the walls. Esc, Tab, and E also leave build mode. Grave Lantern light 3 → 4 tiles. |
| 0.16 | Starting Totem back on the inner ring, and the player can walk through it. Build ghost: description line, and reach circles for the Totem and Collector. Gray jagged line when a Collector harvests. Shamblers: no pathfinding, straight at the target with a sway. |
| 0.17 | Starting base: the Totem (solid again) and a new free Corpse Collector both go on the wall ring, placed after the walls and taking priority over them; the ring is still never fully closed. |
| 0.18 | M9 built: Wraiths (fade-in, Lantern targeting, slow shots blocked by buildings) and Hellhounds join the roster; day-15 countdown and win screen with endless Continue; respawn after completion; Phylactery destruction ends the run; warning banners. |
| 0.19 | Shorter run: day 75 s and night 40 s (dusk and dawn stay 10 s), and the Phylactery completes on day 7 instead of day 15. Spawns of every enemy grow each day, day and night (×2.5 by day 7), and the active cap grows with them. Brutes from day 3. Grave Lanterns slowly heal the player and repair buildings for free. Each Altar adds 50 to every resource cap. |
| 0.20 | Corpse Collectors link to a corpse for their whole 3–5 s duration (a live jagged line) and take it at the end. M10 built: synthesized placeholder sound effects with master volume, particles, screen shake (Settings toggle), local best score on the title and end screens, and a relative-path build. |

---

## 1. Elevator Pitch

You are a necromancer holding back waves of demons in a procedurally generated wasteland. By day, demons pour in fast and in large numbers. By night, they trickle in slowly, but the night brings tougher creatures and the Wraiths. You fight with a bolt of dark magic and a chain spell that leaps between enemies. Slain demons leave corpses. You harvest those corpses for bones and materials, then craft necromancer gear and build a grid-based base around your Phylactery to survive until it is complete.

## 2. Design Pillars

1. **Readable chaos.** Large day swarms must still be legible. Every enemy has a distinct silhouette or color, and the player can always tell where danger is.
2. **Death feeds the build.** Killing is the input to crafting. Every kill matters because it produces a corpse.
3. **Build to hold, fight to grow.** Buildings buy time and kill things. Gear makes the necromancer stronger. Neither replaces skilled play.
4. **Day and night have different jobs.** Day is for surviving pressure and harvesting. Night is for quiet building, crafting, and preparing for the next swarm.

## 3. Core Loop

```
   DAY (heavy swarms)                NIGHT (sparse, tougher enemies)
   ─────────────────                 ───────────────────────────────
   Fight with bolt + chain    ─►     Harvest corpses that remain
   Harvest corpses                   Craft gear at the Altar
   Repair / defend buildings         Place and upgrade buildings
          ▲                                       │
          └───────────── Dawn: spend resources ◄──┘
```

**Minute-to-minute:** move, aim, cast bolt, chain enemies, step over corpses to harvest them, retreat behind walls.
**Session-level:** defend the Phylactery until it completes on day 7 (section 11).

## 4. World and Map

| Property | Starting value | Notes |
|---|---|---|
| Tile size | 32 px | Logical unit for everything on the grid |
| Logical view | 1280 × 720 px (40 × 22.5 tiles) | Canvas scales to the window and keeps this aspect ratio (letterboxed), so every player sees the same distance |
| View radius | 23 tiles | Distance from the player to a corner of the view. All "beyond view" distances below are multiples of this |
| Camera | Follows the player | No map-edge clamp; the map has no edges |
| Coordinates | World tile (0, 0) is the Phylactery's center. +x is east, +y is south (screen down) | |
| Simulation rate | 60 Hz fixed timestep | Render can be uncapped; logic is fixed |

### 4.1 Procedural Map

- The world is generated in **chunks** of 16 × 16 tiles.
- A chunk is generated when any part of it comes within **2 × view radius (≈ 46 tiles)** of the player. This covers the spawn rings (section 6): the player ring is always generated, and the Phylactery ring was generated at the start of the run, because the player starts next to the Phylactery. Generated chunks are kept for the rest of the run, so buildings and corpses never vanish.
- Each chunk is generated from `(seed, chunkX, chunkY)` alone. The same seed always produces the same world, whatever order chunks are visited in.
- Tiles in chunks that have not been generated yet count as impassable for pathfinding and spawning.

**Tile types (v1):**

| Tile | Walkable | Buildable | Coverage | Notes |
|---|---|---|---|---|
| `grass` | yes | yes | remainder | Default |
| `dirt` | yes | yes | ~20% | Cosmetic variant of grass |
| `rock` | no | no | ~4%, clusters of 1–4 tiles | Blocks ground movement and bolts |
| `marsh` | yes (slows 50%) | no | ~6% | Slows ground units (the player and ground demons) to 50% while their center is on it; flying units ignore it. Flow fields do not avoid it, so demons walk through and are slowed. Players can make it and fill it (section 10.2) |

**Generation rules:**
- No `rock` or `marsh` within 6 tiles of the Phylactery's center, so the starting base always fits.
- Rock is kept rare and in small clusters. Clusters are 4-connected, never touch another cluster (not even diagonally), and stay 1 tile inside their chunk so clusters in neighboring chunks cannot touch either. A cluster of at most 4 tiles cannot enclose a tile, so rock never seals off an area. The stuck-enemy rule (section 15.1) stays as a safety net.
- Each feature's tile count per chunk is its coverage × a random factor between 0.5 and 1.5, so chunks vary while the average matches. Placement order: rock, then marsh, then dirt on what is still grass. Values live in `src/data/terrain.ts`.
- `?seed=N` in the URL starts the run with that seed, for testing and bug reports.

**Placement rules:**
- Buildings snap to the grid.
- A building occupies a rectangle of tiles (`footprint`, e.g. 1×1 wall, 2×2 altar).
- A placement is invalid if any footprint tile is non-buildable, occupied, ungenerated, overlaps any unit (the player or an enemy), overlaps the Phylactery, or is in the **no-build zone**: the 16 tiles bordering the Phylactery (section 10.4). In build mode, the no-build zone is tinted red.
- Invalid placement shows a red ghost. Valid placement shows a green ghost.

**Collision:**
- All units are circles with radius 0.5 tile (`radius` in their data, so it can change after playtesting).
- The player collides with `rock` and with **every building except Bone Doors** (section 10.2), including the Phylactery.
- Ground enemies collide with `rock` and with every building, including Bone Doors. They break through buildings by attacking them (section 7).
- Units do not hard-collide with each other. They spread out through the separation force (section 15.1).

## 5. Time and Day Cycle

A single repeating cycle with four phases.

| Phase | Length |
|---|---|
| Day | 75 s |
| Dusk | 10 s (lighting and spawn rate blend from day to night) |
| Night | 40 s |
| Dawn | 10 s (lighting and spawn rate blend from night to day) |
| **Full cycle** | **135 s** |

- The run starts at the beginning of day 1.
- A **day counter** increments at the start of each day. It appears in the HUD.
- Day 7 begins at 810 s (13.5 minutes). The Phylactery completes at 885 s (about 15 minutes).
- Night uses a vignette and a lower ambient light value. The player's light radius is 10 tiles; Grave Lanterns add more (section 10.2).
- Phase changes emit events (`phase:dusk`, `phase:night`, `phase:dawn`, `phase:day`) that other systems can listen to.

## 6. Spawn Director

The spawn director decides when, where, and what to spawn. It runs on the same tick as the rest of the simulation.

**Spawn rate (enemies per second, starting values):**

| Phase | Rate | Behavior |
|---|---|---|
| Day | 1.0 / s on day 1, growing each day | Large swarms, mostly fast weak enemies |
| Dusk / dawn | Linear blend between day and night rates | |
| Night | 0.2 / s on day 1, growing each day | Sparse, but tougher: Brutes (from day 3) and Wraiths make up most of it |

Per-day growth: both rates are multiplied by `1 + 0.25 × (day − 1)` (`dailyGrowth`), capped at ×4 (`growthCap`, reached on day 13 in endless). Every enemy type and phase grows together. Day 7 runs at 2.5 / s by day and 0.5 / s at night.

**Spawn budget:**
- Each tick, `budget += rate × dt`.
- The director rolls the size of the next pack in advance (day: 3–6, night: 1–2). When `budget ≥ packSize`, it spawns the pack and subtracts `packSize` from the budget.
- If a pack cannot be placed (all attempts fail), the budget is kept and the director tries again after 1 s.
- The budget is capped at 2 × the largest pack size (12), so a long failure streak never releases one giant burst.

**Spawn weights (roster per phase):** each enemy in a pack is drawn by weight from the current phase's roster. Enemies below their `minDay` are left out.

| Enemy | Day weight | Night weight |
|---|---|---|
| Imp | 60 | — |
| Shambler | 30 | 40 |
| Brute (day 3+) | 8 | 20 |
| Hellhound (day 5+) | 6 | — |
| Wraith | — | 40 |

During dusk and dawn, each enemy's weight blends linearly between its day and night weight.

**Elites:** each spawned enemy has a 5% chance (`eliteChance = 0.05`) to be an elite (section 7.1). This applies to every enemy type in every phase.

**Where enemies spawn.** The same rules apply to every enemy type, ground or flying. Spawning never uses pathfinding.

1. **Pick an anchor** for the pack: the **player** or the **Phylactery**, 50/50 (`phylacterySpawnShare = 0.5`). During the respawn delay (section 10.4), the player anchor is the camera's center.
   - Phylactery packs spawn whether or not the player is nearby. This keeps pressure on the base, so the player cannot win by running far away and leaving it untouched.
2. **Pick a center point:** a random angle and a random distance of **32–40 tiles** (1.4–1.75 × view radius) from the anchor. Both rings are farther out than the screen reaches, so the Phylactery ring is off screen even when the player stands at the Phylactery.
3. **Check the center tile.** It must pass all of these:
   - **Generated:** the tile's chunk exists (section 4.1).
   - **Open:** not `rock` (flying enemies skip this check) and not part of a building.
   - **Not on the no-spawn grid** (below).
   - **Off screen:** outside the player's current view rectangle (40 × 22.5 tiles around the camera), plus a 2-tile margin.
4. If the center fails, try a new angle and distance, up to 10 tries. If all 10 fail, the budget is kept and the director tries again after 1 s.
5. **Place the pack:** members go on tiles around the center, nearest first. Each member's tile must pass the same checks. A member with no passing tile within 3 tiles of the center is dropped, and its share of the budget is refunded.

**No-spawn grid** (`src/world/noSpawnGrid.ts`):
- Every building has a `noSpawnRadius` in `src/data/buildings.ts`. It is **3 tiles** by default and **5 tiles** for the Bone Totem. The Phylactery uses the default 3.
- When a building is placed, every tile within its radius of its footprint (a square extending that many tiles past each edge) gets its counter raised by 1. When the building is destroyed or removed, those counters drop by 1. A tile with a counter above 0 is a no-spawn tile.
- Counters, not true/false flags, so overlapping radii stay correct when one of the buildings is removed.
- The grid is a sparse map keyed by tile coordinate, separate from chunks, so a radius can reach into chunks that have not been generated yet.
- Spawn checks read one tile from it, so a check costs the same no matter how many buildings exist.
- A Totem placed inside a large walled compound covers an 11 × 11 area, so a compound defended by Totems has almost no interior spawn tiles.

**Wraiths:**
- A Wraith **fades in** over 2 s (drawn from transparent to solid). While fading in it cannot move, attack, or be hit: Bolts pass through it, and Chain and Totems ignore it.
- Wraiths appear on **every night**, from day 1 onward.

**Limits:**
- Active cap across the whole world: `150 + 20 × (day − 1)` (`maxActiveEnemies`, `maxActivePerDay`), up to 300 (`maxActiveCap`). Day 7 allows 270. The budget stops growing while the count is at the cap.
- An enemy farther than 2 × view radius from both the player and the Phylactery is removed without leaving a corpse.

## 7. Enemies

All enemies are defined as data in `src/data/enemies.ts`. Adding an enemy means adding one entry.

| Enemy | Phase | HP | Speed (px/s) | Damage | Attack | Corpse | Behavior |
|---|---|---|---|---|---|---|---|
| **Imp** | Day | 10 | 90 | 4 | melee, 0.8 s | small | Fast, arrives in packs |
| **Shambler** | Day + Night | 25 | 45 | 6 | melee, 1.2 s | medium | Slow and dumb: no pathfinding. Walks straight at its target with a shambling sway, and attacks any building in the way |
| **Brute** | Day + Night, from day 3 (`minDay = 3`) | 90 | 30 | 18 | melee, 2.0 s | large | Tanky, breaks walls quickly (`buildingDamageMultiplier = 2`) |
| **Wraith** | Night only | 40 | 70 | 8 | ranged, 2.5 s, range 6 tiles | medium | Flies directly toward its target. Ignores walls and `rock` for movement. Stops when its target is in range and fires slow shots. Spawns by the normal rules (section 6) |
| **Hellhound** | Day, from day 5 (`minDay = 5`) | 35 | 120 | 10 | melee, 1.0 s | medium | Rare, fast flanker |

**Melee range:** 2 tiles, measured center to center. A melee enemy attacks its target, or a building in its way, once it is within that range. For a building, the distance is measured from the enemy's center to the nearest point of the building's footprint, and the enemy's radius is subtracted from the range (so an enemy attacks a building from up to 1.5 tiles away from its edge).

**Shared enemy fields:** `id`, `name`, `hp`, `speed`, `damage`, `attackInterval`, `range`, `radius` (default 0.5 tile), `spawnWeightDay`, `spawnWeightNight`, `phases` (`day`, `night`, or both), `minDay`, `movement` (`ground` or `flying`), `projectileSpeed` (ranged only), `corpseSize`, `color`, `shape`.

**Target selection:**
1. Every enemy has two destinations: the **player** and the **Phylactery**.
2. **Ground enemies** compare their path distance to each, read from the flow fields. If an enemy is outside a field's window, it uses straight-line distance for that target instead. **Wraiths** always compare straight-line distance.
3. On spawn, an enemy targets whichever is closer. Ties go to the player.
4. **Hysteresis:** an enemy switches targets only when the other target is less than `0.8 ×` the distance to its current target (`targetSwitchRatio = 0.8`). This stops enemies flickering between targets when the two are about equally far away.
5. While moving, if the next tile on its path is a building (including a Bone Door), a ground enemy attacks that building until it is destroyed, then continues.
6. Wraiths also treat Grave Lanterns as destinations. A Lantern's straight-line distance counts as half its real value (`aggroWeight = 2`), so Wraiths often go for a Lantern before the Phylactery.

**Wraith attacks:**
- A Wraith stops moving while its target is within 6 tiles, and fires a shot every 2.5 s.
- Shots travel at **3 tiles/s (96 px/s)** in a straight line and expire after 2.5 s. They are slow enough to dodge.
- A shot hits the player, or is blocked by the first building it touches and damages it. A Wraith may hover outside a wall and chip at it. This is intended: Wraiths are an annoyance that costs repairs, not a main threat.

**Attack visuals (swipe):**
- Each time a melee enemy lands a hit (on the player or a building), a red swipe appears in front of it, aimed at what it hit.
- The swipe is a crescent arc centered 0.6 × the enemy's draw size + 0.3 tile in front of its center, spanning 100°, with an outer radius of 0.5 tile × (draw size / 0.4), so Brutes swing wider than Imps.
- A bright leading edge (90% opacity) sweeps forward across the 100° (clockwise) in the first 65% of the 0.18 s, with a 60° trail behind it that fades to nothing. Once the edge reaches the far side, the whole swipe fades out. Color `#ff3b3b`; elites use `#ffb03b` so their hits stand out.
- Purely visual: the simulation emits `enemy:attacked` (`x`, `y`, `angle`, `size`, `elite`) and the renderer keeps a short list of active swipes. Swipes age with simulation time, so they freeze while paused and speed up with the debug time scale.
- Wraith shots get a small purple flash at the Wraith instead (orange for elites). Shots are purple orbs, fly over rock, and are stopped by the first building (any building, including the Phylactery and Lanterns) they touch.

**Pathfinding:** Ground enemies follow flow fields with smoothed movement, except Shamblers (navigation 'direct'), which walk straight at their target, sway (wiggle: up to 0.55 rad, two out-of-step waves with a per-enemy phase), and attack whatever building is on the straight line. Wraiths steer directly. Section 15.1 has the details.

### 7.1 Elites

| Property | Value |
|---|---|
| Chance | 5% per spawned enemy, any type, any phase |
| HP | × 2.5 |
| Damage | × 1.5 |
| Speed | unchanged |
| Loot | The corpse's loot is rolled once and every amount is multiplied by 4. Then 1 Soul Shard is added, whatever the corpse size |
| Marker | A circle drawn under the enemy, radius 0.7 tile, pulsing between dark yellow `#8a6a00` and light yellow `#ffe066` on a 1.2 s loop |

Elite values live in `src/data/enemies.ts` next to the roster.

## 8. Necromancer (Player)

| Stat | Starting value |
|---|---|
| Max HP | 100 |
| Max Mana | 100 |
| Mana regen | 8 / s |
| HP regen | None. Healing comes from Mend (section 8.2) |
| Move speed | 120 px/s |
| Radius | 0.5 tile |
| Light radius at night | 10 tiles |
| Invulnerability after hit | 0.5 s |
| Harvest range | 1 tile |

**Controls:**

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Aim |
| Left click (hold) | Cast **Bolt** |
| Right click | Cast **Chain** |
| Q | **Mend**: spend Flesh to heal (section 8.2) |
| E | Harvest the nearest corpse in range (or hold E for auto-harvest) |
| R (hold) | Repair the nearest damaged building within 2 tiles |
| B | Toggle build mode |
| 1–8 | Select building (1–6) or terrain edit (7 Marsh, 8 Fill) in build mode |
| C | Open crafting menu (pauses the game) |
| Tab | Open the equipment screen: resources and unlocked gear (pauses the game) |
| Esc | Open the pause screen (section 8.5). If the C or Tab menu is open, Esc closes that menu instead |
| ` (backtick) | Toggle debug panel, only when debug is enabled (section 13) |

The controls live as data in `src/data/controls.ts`. Input handling, the build hotbar labels, and the controls panel on the title screen (section 8.5) all read from it, so they never drift apart.

### 8.1 Spells

**Bolt (primary)**
- Projectile, straight line toward the cursor, speed 500 px/s, lifetime 1.0 s.
- Damage 12. Mana cost 5. Cooldown 0.25 s.
- Pierces nothing. Hits the first enemy, or stops at `rock`.
- **Passes over the player's own buildings.** Bone Totem bolts follow the same rule.
- A Wraith hovering over `rock` can still be hit: the enemy hit check runs before the rock check.

**Chain (secondary)**
- Hitscan to the nearest enemy within 6 tiles of the cursor. Ignores terrain and buildings.
- On hit, the chain jumps to up to `maxJumps = 3` other enemies within `jumpRange = 4 tiles`, each jump picking the nearest unhit enemy.
- Damage 18 on the first hit, multiplied by `0.75` on each jump (18 → 13.5 → 10.1 → 7.6).
- Mana cost 15. Cooldown 1.0 s.
- Casts once per right-click (not on hold). If no enemy is within 6 tiles of the cursor, nothing happens and no mana is spent.
- Visual: a jagged line from the necromancer through each link, fading over 0.2 s. Drawn over the night lighting, so it reads in the dark. The jaggedness uses a visual-only RNG, separate from the simulation.

Neither spell can hit a Wraith that is still fading in.

Spell values live in `src/data/spells.ts`. Gear modifies them through stat modifiers, not by editing the spell code. Early mana pressure is intended; gear (section 10.3) is the answer to it.

### 8.2 Mend (healing)

There is no passive HP regen. Mend is the only way to heal.

| Property | Value |
|---|---|
| Key | Q |
| Cost | 5 Flesh |
| Heal | 25 HP, applied evenly over 1 s |
| Cooldown | 4 s |
| Rules | Cannot be used at full HP or with less than 5 Flesh. Taking damage does not interrupt it |

Mend spends Flesh directly, so it needs no consumable inventory. Values live in `src/data/spells.ts`.

### 8.3 Input Handling (browser)

- Call `preventDefault` on: `contextmenu` (right click), Tab, backtick, and every key in the controls table, so the browser never opens menus, moves focus, or scrolls.
- Convert mouse positions from window pixels to the 1280 × 720 logical view (accounting for letterbox offset and scale), then to world coordinates through the camera.
- When the window loses focus, clear all held keys and mouse buttons, so nothing stays "stuck down" after returning.
- **Auto-pause:** the game pauses whenever the tab is hidden or the window loses focus, and shows "Click or press any key to resume". The input that resumes the game is **consumed**: it does not also cast a spell, move, or trigger a hotkey.
- **Menus pause:** the crafting menu (C), the equipment screen (Tab), and the pause screen (Esc, section 8.5) all pause the simulation while open. Build mode (B) does not pause.
- Auto-pause does nothing while a menu or the title screen is already open.

### 8.4 HUD

Drawn in screen space by `src/ui/hud.ts`, after the world. Each element lists the milestone that first builds it.

| Element | Where | Behavior | Milestone |
|---|---|---|---|
| **Health crescent** | Around the necromancer, left side | Red arc over a black background arc. See crescent rules below | M4 |
| **Mana crescent** | Around the necromancer, right side | Blue arc over a black background arc. Same rules | M4 |
| **Day ring** | Top-right corner | Pie-slice clock of the cycle. See day ring rules below | M2 |
| **Phylactery panel** | Top-center | Phylactery HP bar, colored like health bars (below). On day 7 a completion countdown (`1:15` → `0:00`) appears under it. After completion it reads "Bound" | M7 (HP), M9 (countdown) |
| **Phylactery arrow** | Screen edge | While the Phylactery is off screen, an arrow at the screen edge points toward it. It flashes red for 2 s after the Phylactery takes damage | M7 |
| **Resources** | Top-left | Compact counters (Bone, Flesh, Ichor, Soul Shard). See resource rules below | M6 |
| **Pickup popups** | In the world, over the corpse or Collector | "+3 Bone" style text, rising and fading over 1 s. One line per resource gained | M6 |
| **Warnings** | Top-center, under the Phylactery panel | Banner text for 3 s. See warning list below | M9 |
| **Build hotbar** | Bottom-center, build mode only | The six buildings plus Marsh and Fill (keys 1–8) with key, swatch, and cost. Unaffordable ones are greyed out. The ghost shows a cost tooltip, and the reason when it cannot be placed | M7 |
| **Prompts** | Next to the object | "E Harvest" by the corpse E would harvest. "R Repair (2 Bone)" by the building R would repair | M6 (E), M7 (R) |
| **Spell bar** | Centered 1.5 tiles (48 px) below the necromancer's on-screen position | Three icons in a row: Bolt, Chain, and the Mend badge. See spell bar rules below | M4 (Bolt), M5 (Chain), M6 (Mend) |
| **Health bars** | Above damaged enemies and buildings | Shown only while HP is below max. See health bar rules below | M4 (enemies), M7 (buildings) |

**Crescent rules:**
- Both crescents sit 1 tile from the necromancer's center, 4 px thick. Each spans 150° of arc: the health crescent is centered on the left (west) side and the mana crescent on the right (east), leaving gaps at the top and bottom.
- The black background arc is always drawn at full length.
- The colored fill starts at the bottom end of the arc and reaches up in proportion to the current value. As HP or mana drops, the top of the fill drains downward.
- Colors: health `#d23a3a`, mana `#3a6ed2`, background `#000000` at 70% opacity.

**Spell bar rules:**
- Left to right: **Bolt** (label "LMB"), **Chain** ("RMB"), **Mend** ("Q", with the current Flesh count). Each icon is 20 px square with a 4 px gap.
- Placeholder icons: Bolt is a purple dot, Chain is a zigzag, Mend is a cross.
- While a spell is on cooldown, a dark wedge covers the icon and sweeps away clockwise as the cooldown ends.
- An icon is greyed out while it cannot be used: not enough mana for Bolt or Chain, or (for Mend) less than 5 Flesh or full HP.

**Health bar rules:**
- Drawn over **enemies** and **buildings** while their HP is below max. Hidden at full HP, so an undamaged base stays clean. Hidden on a Wraith that is still fading in.
- Size: as wide as the footprint minus 4 px (1 tile for units and 1×1 buildings, 2 tiles for the Altar), 4 px tall, 4 px above the top of the shape. Black background at 70% opacity.
- Color changes in hard steps by HP fraction: above 2/3 green `#4caf50`, above 1/3 yellow `#e8c547`, otherwise red `#d23a3a`.
- The Phylactery has no bar in the world; its HP shows in the Phylactery panel, which uses the same colors. The player uses the health crescent instead.

**Day ring rules:**
- A 64 px circle split into pie slices sized by each phase's share of the 135 s cycle: day 56%, dusk 7%, night 30%, dawn 7%.
- Slice colors: day gold `#e8b94a`, dusk orange `#d9673b`, night indigo `#2b2f6b`, dawn rose `#d98aa6`.
- Day starts at 12 o'clock and the slices run clockwise. A white hand points at the current moment of the cycle.
- The center shows "Day 3 / 7". After the win it shows only "Day 9" (endless mode). The current phase name is written under the ring.

**Resource rules (compact mode):**
- Counters are hidden by default.
- When a resource changes, its counter appears. It fades out 3 s after the last change.
- While the player is within 5 tiles of an Altar (its aura radius), and while the C or Tab menu is open, all four counters stay visible.

**Warnings:**

| Banner | When |
|---|---|
| "Dusk approaching" | 10 s before dusk |
| "Dawn approaching. The swarm returns" | 10 s before dawn |
| "Phylactery under attack!" | When the Phylactery takes damage, at most once every 15 s |
| "Phylactery critical!" | When Phylactery HP falls below 25%. Shown again only after it has been repaired above 25% |
| "Day 7. The binding begins" | Start of day 7 (the final day, `DAY_CYCLE.winDay`) |
| "The Phylactery is complete" | On completion (the win) |

### 8.5 Title and Pause Screen

One screen, `src/ui/titleScreen.ts`, serves as both the title screen and the pause screen.

- **On page load** it opens as the title screen, with no run active. The background is a flat `#0d0b10`.
- **During a run**, Esc opens it as the pause screen. The paused world stays drawn behind it under a 70% black overlay.
- A run is **active** from New Game until it is lost. After the win, the run stays active in endless mode.

**Title animation ("rising from the grave"):**
- The title "NECROGRID" is drawn large (96 px), bone colored `#c9c2b0`, centered above the buttons.
- A 2 px earth-colored line `#5a4a3a` runs under the title at its baseline, 40 px wider than the title on each side.
- Each letter is clipped to the area above the line. Any part of a letter below the line is hidden, as if buried.
- **Intro:** when the screen opens as the title screen, all letters start fully below the line. They rise one at a time, left to right, 0.12 s apart. Each takes 0.6 s with an ease-out curve.
- **Idle loop:** after the intro, each letter sinks until 40% of its height is below the line, then rises back to full height. It follows a sine wave with a 3.0 s period, and each letter runs 0.2 s behind the one before it, so a slow wave travels across the word. A letter never sinks more than 40%, so the title always stays readable.
- When the screen opens as the pause screen, the intro is skipped and the idle loop starts at once.

**Buttons, top to bottom:**

| Button | Shown | Action |
|---|---|---|
| **Resume** | Only while a run is active | Closes the screen and resumes the run. Esc does the same |
| **New Game** | Always | Starts a new run. If a run is active, asks for confirmation first (below) |
| **Settings** | Always | Opens Settings (section 12). Esc returns to this screen |

- Buttons work with the mouse, and with Up/Down (also W/S) plus Enter or Space. Left/Right (also A/D) change settings and move between Abandon and Cancel. The top button is focused when the screen opens. Menu keys are bindings in `src/data/controls.ts` marked `menuOnly`, so the controls panel leaves them out.
- While any screen is open, every key and click goes to it and never reaches the game.
- **Confirmation:** New Game during an active run shows "Abandon the current run?" with **Abandon** and **Cancel**. Cancel is focused, and Esc means Cancel. Abandon ends the current run with no score saved and starts a new one.

**Corner panels:**
- **Controls** (bottom-right, both modes): a small two-column list of key and action, generated from `src/data/controls.ts`.
- **Seed** (bottom-left, pause mode only): "Seed 1234567890" in small text, so a run can be reported or replayed.

**New run seed:** a new run picks its seed with `crypto.getRandomValues` (one 32-bit value). This is the only randomness allowed outside the seeded RNG. Debug "set seed" (section 13) overrides it.

## 9. Resources, Corpses, and Harvesting

### 9.1 Resources

Resources are plain counters. They go up when harvested and down when spent. There is no item inventory.

| Resource | Tier | Source (from the loot table, section 9.2) | Used for |
|---|---|---|---|
| **Bone** | basic | Every corpse | Basic buildings, basic gear, repairs |
| **Flesh** | basic | Medium and large corpses | Mend, some buildings and gear |
| **Ichor** | rare | Any corpse (chance on small and medium, guaranteed on large) | Magic buildings, advanced gear |
| **Soul Shard** | rare | Large corpses (Brutes) and every elite, guaranteed | Top-tier gear |

Cap: 200 of each basic resource, 50 of each rare resource. Each standing Altar adds 50 to every cap (`ALTAR.capBonus`, stacking). Anything gained over the cap is lost. If an Altar is lost, amounts already above the new cap are kept but cannot grow until spent below it.

### 9.2 Corpses

- Every enemy death spawns a **corpse** entity on its tile.
- A corpse has a `corpseSize` (`small`, `medium`, `large`) that determines its loot yield.
- Corpses **fade out over the next day phase**, not on a fixed timer. A corpse's opacity drops linearly from 1 to 0 from its creation until the end of the first day phase that starts after it. A corpse created at night fades during the coming day. A corpse created during day N fades during day N+1. It can be harvested while it exists and is removed once fully faded.
- Corpses are **not** blocking. They are walkable and can be harvested while enemies are still around.
- **Render limit:** only the most recent corpses are drawn, up to the `Corpse render count` setting (section 12). Older corpses still exist, keep fading, and can still be harvested or collected; they are just not drawn.

**Loot table by size.** Ranges are uniform integer rolls. A percentage is the chance of getting 1.

| Size | Bone | Flesh | Ichor | Soul Shard |
|---|---|---|---|---|
| Small | 1–2 | 0 | 15% | 0 |
| Medium | 2–3 | 50% | 30% | 0 |
| Large | 3–5 | 1–2 | 1 | 1 |

The loot table lives in `src/data/loot.ts`, keyed by corpse size. Elite corpses give 4× the rolled amounts plus 1 guaranteed Soul Shard (section 7.1).

### 9.3 Harvesting

- Stand within 1 tile of a corpse and press **E**. Harvest takes 0.6 s (small), 1.0 s (medium), 1.6 s (large).
- Holding **E** keeps going: when one harvest finishes, the nearest corpse still in range starts at once.
- Harvesting is interrupted if the player takes damage (a hit absorbed by invulnerability or god mode does not count), moves more than 1 tile away, or the corpse fades out.
- Loot is rolled when the enemy dies (seeded loot stream), so a hand harvest and a Corpse Collector give the same thing.
- While harvesting, a ring around the corpse fills up; otherwise the "E Harvest" prompt marks the corpse E would take.
- Corpses are drawn as the enemy's shape, flattened and darkened, fading with their opacity. Elite corpses have a gold outline.
- Harvesting is possible at night and during the day. Daytime harvesting is risky, which is the design intent.
- Corpse Collectors (section 10.2.1) harvest automatically.

## 10. Crafting and Buildings

### 10.1 Crafting Stations

- Gear marked "needs Altar" (⌂ in the menu) can only be crafted while the player's edge is within **0.5 tile of an Altar's footprint** (their center within 1 tile). The player collides with the Altar, so in practice this means standing against it.
- The C menu (pauses the game) lists every recipe with its cost and effects. Recipes the player cannot craft right now are greyed out with the reason: Already unlocked, Needs an Altar, or Not enough resources. Up/Down and Enter, or a click, craft; C or Esc closes. All four resource counters show while it is open.
- A crafted item is equipped right away if its slot is empty.
- Buildings are placed in build mode. Their costs are paid in resources.

### 10.2 Buildings (v1 roster)

| Key | Building | Footprint | Cost | HP | Function |
|---|---|---|---|---|---|
| 1 | **Bone Wall** | 1×1 | 4 Bone | 150 | Blocks the player, enemies, and Wraith shots |
| 2 | **Bone Door** | 1×1 | 12 Bone | 150 | Same as a Bone Wall, but the player can walk through it. Enemies cannot |
| 3 | **Bone Totem** | 1×1 | 10 Bone, 5 Ichor | 80 | Turret. Fires a bolt at the nearest enemy within 6 tiles every 1.0 s, damage 8 |
| 4 | **Corpse Collector** | 1×1 | 8 Bone, 2 Flesh | 80 | Instantly harvests the nearest corpse within 3 tiles, then waits a random 3–5 s cooldown (section 10.2.1) |
| 5 | **Altar** | 2×2 | 10 Flesh, 10 Ichor | 150 | Crafting station. +4 mana regen aura, radius 5 tiles. +50 to every resource cap (section 9.1) |
| 6 | **Grave Lantern** | 1×1 | 3 Bone, 2 Flesh | 40 | Lights a 4-tile radius around itself at night. Slow, free heal and repair aura (below). Draws Wraith targeting (decoy, `aggroWeight = 2`) |
| 7 | **Marsh** | 1×1 | 10 Flesh, 1 Ichor | — | Terrain edit, not a building: turns a grass or dirt tile into `marsh`, which slows the player and ground demons by 50% |
| 8 | **Fill** | 1×1 | 5 Bone, 5 Flesh | — | Terrain edit: turns any `marsh` tile, wild or player-made, into `dirt` (which is buildable) |

**Terrain edit rules (Marsh and Fill):**
- Neither is refunded and neither has HP; they change the tile itself.
- Marsh can be placed only on grass or dirt, not on a building, and not in the no-build zone around the Phylactery (section 10.4). Fill works on any marsh tile.
- Units standing on the tile do not block either edit.
- Rules live in `src/world/terrainEdit.ts`, costs in `TERRAIN_EDITS` in `src/data/buildings.ts`. `Game.editTerrain` checks the rules, then charges the cost (nothing is charged for a refused edit). Placement from build mode arrives in M7.

Totems never target a Wraith that is still fading in.

#### 10.2.1 Corpse Collector

- While it has no link and a corpse is within 3 tiles, it **links** to the nearest one that no other Collector is linked to, and rolls a link duration uniformly between 3 and 5 s from the seeded RNG. Random durations keep groups of Collectors from firing in sync.
- When the duration runs out, it takes the corpse. The loot goes straight to the player's resources, wherever the player is. On the next tick it links to the next corpse in range, if any.
- If the linked corpse disappears first (the player harvested it, or it faded), the link breaks and the Collector links to the next corpse with a fresh duration.
- If the player is harvesting the corpse a Collector takes, the player's harvest stops.
- While no corpse is in range, it checks again each tick.

**Build mode controls:** B toggles build mode (it does not pause). Esc, Tab, and E also leave build mode (and do only that: no pause screen, equipment screen, or harvest). Keys 1–8 pick from the hotbar. Left click places at the ghost; holding it and dragging places on every new tile the cursor crosses (painting walls or marsh). Right click removes the building under the cursor. While build mode is on, the mouse builds instead of casting Bolt and Chain; Q, E, and R still work. The ghost is red with the reason (including "Not enough resources") when the choice cannot go there.

**Build ghost:** the tooltip shows the name and cost, a one-line description of what it does, and the reason in red when it cannot be placed. The Bone Totem, Corpse Collector, and Grave Lantern ghosts also draw a dashed circle showing their reach (6, 3, and 4 tiles).

**Collector link:** for the whole link, a thin gray jagged line connects the Collector to its corpse. The jagged shape re-rolls every 0.12 s (a crackle), and the line brightens and thickens as the take nears. When it takes the corpse, a final line flashes and fades over 0.35 s.

**Grave Lantern light:** each Lantern lights a 4-tile radius around itself at night, in addition to the player's own light.

**Grave Lantern aura:** always on, day and night, and free. Within 4 tiles of a Lantern's center, the player heals 1 HP/s (`LANTERN.healRate`), and every building and the Phylactery whose footprint is in reach is repaired 1 HP/s (`LANTERN.repairRate`), the Lantern itself included. Auras do not stack: standing near several Lanterns heals at the same rate as one.

**Building rules:**
- Buildings have HP. When HP reaches 0, the building is destroyed and drops 50% of its cost as resources (each resource rounded down), straight into the player's counters.
- **Repair:** hold R within 2 tiles of a damaged building, during any phase. Repairing from damaged to full costs, for each resource in the build cost, `ceil(cost × missingHP / maxHP)`. Repair happens at 50 HP/s, and resources are spent as it goes. A Bone Wall at half HP costs 2 Bone to repair fully.
- Repair pays one resource unit at a time, as the repair needs it. Anything paid but not yet used stays on the building as credit, so stopping and restarting never costs more than the formula. Repair stops where the player runs out of resources. The "R Repair (2 Bone)" prompt shows the cost to finish.
- Removing a building refunds 50% of its cost (each resource rounded down).
- Starting buildings (section 10.5) are free, so they give no refund and no drop.

### 10.3 Necromancer Gear (unlocks)

Gear is **unlocked**, not stored. Crafting an item spends its recipe once and unlocks it for the rest of the run. The player then equips any unlocked item in its slot from the equipment screen (Tab), and can swap freely at any time for no cost. Crafting an item that is already unlocked is not allowed.

There are three slots: **Weapon**, **Robe**, and **Charm**. Each slot has a progression from early to late game, so mana, regen, and damage keep up with the rising spawn rate.

| Item | Slot | Recipe | Stat effects |
|---|---|---|---|
| **Bone Staff** | Weapon | 12 Bone, 4 Flesh | Bolt damage +4 |
| **Gravewood Staff** | Weapon | 8 Bone, 6 Ichor (needs Altar) | Bolt damage +8, Bolt cooldown −0.05 s |
| **Lich Staff** | Weapon | 10 Ichor, 3 Soul Shard (needs Altar) | Bolt damage +14, Bolt mana cost −2, Chain damage ×1.25 |
| **Shroud of Rot** | Robe | 10 Flesh | Max HP +25 |
| **Grave Vestments** | Robe | 6 Bone, 8 Flesh, 4 Ichor (needs Altar) | Max HP +40, Max Mana +30, Mana regen +2 |
| **Shroud of the Undying** | Robe | 12 Flesh, 8 Ichor, 3 Soul Shard (needs Altar) | Max HP +60, Max Mana +60, Mana regen +4 |
| **Ring of Marrow** | Charm | 5 Bone, 3 Ichor | Mana regen +3 |
| **Mana Phial** | Charm | 6 Flesh, 4 Ichor | Max Mana +50, Mana regen +2 |
| **Chain Focus** | Charm | 10 Ichor, 3 Soul Shard (needs Altar) | Chain max jumps +1, Chain cooldown −0.2 s |
| **Heart of Ash** | Charm | 12 Ichor, 5 Soul Shard (needs Altar) | Mana regen +6, Bolt damage ×1.2 |

**Equipment screen (Tab):** three columns (Weapon, Robe, Charm), each listing "(none)" and every unlocked item for that slot, with the equipped one ticked. Up/Down move, Left/Right jump between columns, Enter or a click equips (or empties the slot with "(none)"). A stats summary at the bottom shows the result. Swapping is free and instant.

**Ichor budget:** crafting all ten items needs 57 Ichor in total, more than the 50 cap, so Ichor has to be spent as it comes in rather than banked.

**Modifiable stats:** `maxHp`, `maxMana`, `manaRegen`, `boltDamage`, `boltCooldown`, `boltManaCost`, `chainDamage`, `chainMaxJumps`, `chainCooldown`.

Stats apply as **modifiers** (`{ stat, op: 'add' | 'mul', value }`) so that multiple sources stack predictably: all `add` modifiers first, then all `mul` modifiers. When a swap lowers max HP or max mana, current HP or mana is clamped to the new maximum.

### 10.4 The Phylactery (central core)

The Phylactery is the binding the necromancer is building. It is the reason the base exists and the goal of the run.

| Property | Value |
|---|---|
| Footprint | 3×3, centered on world tile (0, 0) |
| Placement | Pre-placed at the start of the run. The player cannot build, move, remove, or refund it |
| No-build zone | The 16 tiles bordering the footprint (the inner ring, section 10.5). The player cannot build there, so the respawn tile is always free. Nothing is built there at the start either |
| HP | 600 |
| Repair | Hold R within 2 tiles. Costs 1 Bone per 10 HP (it has no build cost to scale from) |
| Drops on destruction | None |
| Completion timer | 75 s, runs for the whole of day 7 (the final day) |

- **Construction (lore):** the binding is built over all 7 days. The necromancer works on it from the first dawn, and the lore has no separate progress for days 1–6.
- **Construction (mechanical):** nothing happens on days 1–6 except the normal game. The completion timer runs only during day 7. It completes when it reaches 75 s with the Phylactery still standing, and that completion is the win.
- **Immortality (flavor and effect):** completing the Phylactery binds the necromancer's soul to it. From that moment, the necromancer has infinite lives. Each death pulls on the binding (below).
- **Respawn** (after completion only):
  1. **On death:** the Phylactery immediately loses **30 HP** (5% of max, `respawnPhylacteryCost = 30`), shown as a "−30" popup over it. If that drops it to 0, it is destroyed and the run is lost.
  2. **Delay:** the necromancer is gone for **3 s** (`respawnDelay = 3`). Over the first 1 s, the camera pans from the death spot to the Phylactery with an ease-in-out curve, then holds there. The simulation keeps running: enemies chasing the player switch to the Phylactery, and the player-anchored spawn ring follows the camera (section 6).
  3. **Return:** the necromancer appears on tile (0, 2), directly south of the Phylactery. The no-build zone keeps that tile free of buildings. Enemies standing there do not block it, because units do not hard-collide.
  4. **State on return:** full HP and mana, and **3 s of invulnerability** (`respawnInvulnerability = 3`). Bolt, Chain, and Mend cooldowns are reset. Any Mend in progress and any harvest in progress are cancelled. Resources and unlocked gear are kept.
- **Protection:** enemies target it like any destination (section 7). The player defends it with walls, totems, lanterns, and repairs.
- **Loss:** destroying the Phylactery ends the run immediately, regardless of player HP, both before and after completion. It is the only way to end the run after completion.

### 10.5 Starting Base

Every run starts with a small free defense, generated from the run's seed so it differs each time. Setup order:

1. Place the Phylactery at the center.
2. Place the player directly south of the Phylactery at tile (0, 2), on the inner ring (the 16 tiles bordering the footprint, which is the no-build zone, section 10.4).
3. **Walls:** the **wall ring** is the 24 tiles exactly 2 tiles out from the Phylactery footprint (the border of the 7×7 square centered on it). Each wall-ring tile gets a Bone Wall with a 60% chance (`startingWallChance = 0.6`), if it passes the normal footprint check.
4. **Totem and Corpse Collector:** after the walls, one free Bone Totem and then one free Corpse Collector each take a random wall-ring tile (different tiles). They take priority: a wall rolled on their tile is not built. Both are solid, like any building.
5. **Never sealed:** if the wall ring is now completely filled (walls, Totem, and Collector), one random wall is removed, so the player is never sealed in.

Gaps in the wall ring are expected. They give enemies a route in, so the first few days are about filling and reinforcing the ring, and adding doors.

## 11. Win and Lose Conditions

- **Win:** the Phylactery completes when day 7's day phase ends with it standing (section 10.4); the panel counts down 1:15 → 0:00 during that phase, then reads "Bound". The game pauses on "The Phylactery is complete" with a summary and a **Continue** button. Continue resumes the run in endless mode (the day ring shows "Day N" only).
- **Respawn view:** while the necromancer is gone (3 s), the necromancer and their HUD are hidden, "Your soul returns to the Phylactery… N" counts down, and the camera pans to the Phylactery. Enemies ignore the dead necromancer.
- **Lose (before completion):** player HP reaches 0, or the Phylactery is destroyed. The end screen shows the day reached, the number of corpses harvested, the score, and the best score (or "New best!"), with a **Return to title** button. The run is no longer active, so the title screen shows no Resume.
- **Lose (after completion):** only if the Phylactery is destroyed. Player death is not a loss; the necromancer respawns (section 10.4). Each death costs the Phylactery 30 HP, which can destroy it.
- **Score:** `day × 100 + kills × 2 + buildingsDestroyedByDemons × −10`. Shown on the end screen and saved locally.

## 12. Settings

Opened from the title or pause screen (section 8.5). Saved in local storage under `necrogrid.settings`. If storage is unavailable, the defaults are used for the session.

| Setting | Default | Range | Effect |
|---|---|---|---|
| Corpse render count | 300 | 50–1000 | Maximum number of corpses drawn, most recent first (section 9.2) |
| Master volume | 70% | 0–100% | All sound |
| Screen shake | On | On / Off | Screen shake on big hits |
| Damage numbers | On | On / Off | Floating damage numbers |

The panel opens from Settings on the title or pause screen: Up/Down choose a row, Left/Right (or the ◀ ▶ arrows) change it, Enter flips On/Off, Esc or Back returns. Every change is saved at once and applies immediately.

Settings change rendering and audio only. They never change the simulation, so a seed plays out the same at any settings.

## 13. Debug Panel

Testing a full run takes about an hour, so the build needs debug tools from early on.

- Enabled by adding `?debug` to the page URL. Hidden and inert otherwise.
- Toggled with the backtick key (`).

| Tool | Effect | Available from |
|---|---|---|
| Time scale | Run the simulation at 1×, 2×, 5×, 10×, or 20× | M2 |
| Skip phase | Jump to the start of the next phase | M2 |
| Jump to day | Jump to the start of day N | M2 |
| Show seed / set seed | Show the current seed, or restart with a given seed | M2 |
| Stats readout | FPS, tick time, entity counts by type | M2 |
| Spawn enemy | Spawn a chosen enemy type at the cursor, optionally as an elite | M3 |
| Flow field overlay | Draw the player and Phylactery field directions and costs | M3 |
| Spawn overlay | An inset map (bottom-right, ±52 tiles around the player, because the rings are off screen) showing both spawn rings, the view and its margin, no-spawn tiles, enemies, and tried pack centers: green passed, red failed | M3 |
| Pause spawning | Stop the spawn director | M3 |
| God mode | Player and Phylactery take no damage | M4 |
| Grant resources | Add 50 of any resource, or 50 of all four | M6 |
| Unlock all gear | Unlock every item in section 10.3 | M8 |

Time scale runs more fixed 1/60 s steps per frame; it never changes the step size. That keeps sped-up runs deterministic.

"Spawn enemy" is a "Click spawns" checkbox: while it is on, a left click in the world spawns the chosen type there (optionally elite) and does nothing else. The Wraith is left out of the list until its attack exists (M9).

The panel is an HTML overlay (top-left), shown by default when `?debug` is on. "Set seed" reloads the page with `?seed=N`. Keys typed into its text fields are not game input.

## 14. Milestones (build order for Claude Code)

Each milestone should be playable or testable on its own. Do not start a milestone until the previous one passes its acceptance criteria. Use the debug panel (section 13) to reach the state each check needs. Commit at the end of each milestone.

### M0 — Skeleton
- Vite + TypeScript project, a single `<canvas>` at a 1280 × 720 logical resolution scaled to the window, fixed-timestep loop (60 Hz logic), render loop, keyboard and mouse input module.
- Input handling from section 8.3: `preventDefault`, mouse-to-world conversion, clearing held input on blur, auto-pause with a consumed resume input.
- **Done when:** a colored square moves with WASD and faces the mouse cursor, right click opens no browser menu, and the game pauses on tab switch and resumes without the resume click doing anything else.

### M1 — Procedural World
- Chunked map generation from a seeded RNG (`src/core/rng.ts`), per section 4.1. Tile types and coverage from section 4. Camera follows the player.
- Player collides with `rock`. Marsh slows movement.
- **Done when:** the player can walk in any direction and chunks appear before they come into view, the same seed always gives the same map (unit test), and the area around the origin is clear.

### M2 — Day/Night Cycle and Debug Panel
- Time system from section 5. Lighting overlay with the player's 10-tile light radius. HUD day ring with the day counter (section 8.4). Phase events fire on transitions.
- Debug panel with the M2 tools from section 13.
- **Done when:** the cycle loops with the right phase lengths, lighting blends at dusk and dawn, the day counter increments, and "Jump to day" works (to the final day, day 7).

### M3 — Enemies and Spawn Director
- Enemy data from `src/data/enemies.ts`. Imp, Shambler, and Brute first. Elites with their marker (section 7.1).
- Flow fields for the player and Phylactery goals, smoothed movement, and no diagonal corner-cutting (section 15.1). Target selection with hysteresis and the straight-line fallback (section 7).
- Spawn director with the section 6 rates, spawn budget, spawn weights, pack spawning on the player and Phylactery rings, the generated / open / building-clearance / off-screen checks, and the active cap.
- Enemies damage the player within melee range. A Phylactery placeholder stands in until M7.
- **Done when:** enemies spawn off screen at the right rates and mix per phase, about half around the Phylactery even when the player is far away, never in rock or on a no-spawn tile (unit test, including counters dropping correctly when overlapping buildings are removed), move smoothly around rocks to their target without flickering between targets or cutting corners, about 1 in 20 is an elite, and they damage the player or the Phylactery.

### M4 — Bolt and Combat
- Bolt projectile, mana cost, cooldown, enemy HP, damage numbers, death.
- Player HP, invulnerability frames, death screen.
- HUD: health and mana crescents, the Bolt icon of the spell bar, and enemy health bars (section 8.4).
- Enemy attack swipes (section 7).
- Title and pause screen with the grave-rising title, Resume / New Game / Settings (Settings can be a stub until M6), the New Game confirmation, and the controls and seed panels (section 8.5).
- **Done when:** the page opens on the animated title screen, New Game starts a run with a fresh seed, the player can kill enemies with bolts, damaged enemies show bars that turn yellow and then red, the player dies when HP reaches 0, and after death the title screen shows no Resume. During a run, Esc shows Resume on top, and New Game asks for confirmation.

### M5 — Chain Magic
- Chain spell per section 8.1 with jumps and falloff.
- Visuals for the chain links. Chain icon on the spell bar.
- **Done when:** a chain hitting a pack of 4 enemies jumps the right number of times and damage falls off as specified (verified by a unit test).

### M6 — Corpses, Harvesting, Mend, and Settings
- Corpse entities, loot table with drop chances, E-to-harvest with interrupt rules. Corpse fade per section 9.2. Elite corpses give 4× loot plus a Soul Shard.
- Mend on Q (section 8.2).
- Resource counters on the equipment screen (Tab).
- Settings screen (section 12) with the corpse render limit.
- **Done when:** killed enemies leave corpses, harvesting adds the right resources, corpses fade out across the correct day phase, large corpses always give a Soul Shard, Mend heals 25 HP for 5 Flesh, and only the newest N corpses are drawn.

### M7 — Building Placement and Starting Base
- Build mode (B), ghost preview (green/red), grid snapping, footprint validation including units and the no-build zone.
- Player collision with buildings, with the Bone Door exception.
- Pre-place the Phylactery and the starting base (section 10.5).
- All six buildings, including the Corpse Collector's random cooldown and the Totem's nearest-enemy targeting.
- Marsh (key 7) and Fill (key 8) in the hotbar, using `Game.editTerrain` and paying their costs.
- Buildings take damage, show health bars while damaged, can be destroyed, can be repaired with the scaled cost, and can be removed for a 50% refund. Player and Totem bolts pass over player buildings.
- **Done when:** all six buildings place and function as described in section 10.2, the player walks through doors but enemies cannot, every seed gives a different starting wall pattern with at least one gap and exactly one Totem (unit test), and repair cost matches the formula (unit test).

### M8 — Crafting and Gear Unlocks
- C menu with Altar range check. Recipes from `src/data/recipes.ts`. Gear unlocks and slot equipping on the equipment screen. Stat modifier system.
- **Done when:** all ten items in section 10.3 can be crafted once and then swapped freely, and equipping the Bone Staff increases bolt damage by 4 (verified by a unit test).

### M9 — Full Roster and Win/Lose
- Wraith: spawns by the section 6 rules, fades in, flies directly, stops at range, fires slow shots blocked by buildings, and uses straight-line targeting with Lantern weighting.
- Hellhound from day 5. Night-only and minDay rules.
- Turn on `PHYLACTERY.destructionEndsRun`.
- Phylactery completion timer on the final day (day 7 since v0.19), victory on completion, respawn after completion (3 s delay with camera pan, 30 HP Phylactery cost, 3 s invulnerability, cooldown reset), loss on destruction. Scoring and win/lose screens.
- Tuning pass against the numbers in this document. Record any changed values in section 16.
- **Done when:** using "Jump to day" with the final day, a run ends in victory when the Phylactery completes, the necromancer respawns on (0, 2) 3 s after death and the Phylactery loses 30 HP, a run ends in loss when the Phylactery is destroyed, and the end screen shows score. One full run at 1× is also played end-to-end.

### M10 — Polish
- Sound effects (optional, can be stubbed), particles, screen shake on big hits, local best-score save.
- Set Vite's `base` to `'./'` so the build works from any folder. The hosting site is not chosen yet (GitHub Pages and itch.io both serve a static build for free).
- **Built (v0.20):**
  - **Sound** (`src/audio/sound.ts`, values in `src/data/audio.ts`): short synthesized placeholder effects (an oscillator or filtered noise with a pitch sweep; no audio files) for bolts, Totem shots, Chain, hits, deaths, elite deaths, player and Phylactery hits, harvests, Collector takes, building, removing and destruction, Wraith shots, Mend, crafting, dusk and dawn, win, loss, and respawn. Each sound has a minimum interval so swarms do not roar. World sounds fade with distance from the view center, silent at 30 tiles. Master volume scales everything. Audio starts on the first key press or click (browser rule).
  - **Particles** (`src/render/particles.ts`, values in `src/data/fx.ts`): enemy deaths burst in the enemy's color (more for larger corpses, gold sparks for elites), hit sparks, building debris in the building's color, soul motes rising from harvested corpses, and purple sparks when the Phylactery is hit. At most 900 at once.
  - **Screen shake** (`src/render/shake.ts`): trauma model, offset = 12 px × trauma², decaying 1.8 per second. Added by player hits of 10+ damage (0.45), player death (0.8), buildings destroyed on screen (0.3), and Phylactery hits of 15+ damage while it is on screen (0.3). Off when Settings → Screen shake is off. It moves only the drawn view, never aiming.
  - **Best score** (`src/ui/bestScore.ts`): saved in local storage under `necrogrid.best` (score, day, whether that run was won). Recorded on the win (score at completion) and on every loss, including an endless run ending later. Shown bottom-left on the title and pause screens, and on the end screen.
- **Done when:** the game is shareable with another player with no setup beyond opening the page.

## 15. Technical Plan

**Stack:**
- **TypeScript** with **Vite** for dev server and build.
- **HTML5 Canvas 2D** for rendering. No game engine in v1. Keeps dependencies near zero and the code easy to reason about.
- **Vitest** for unit tests (chain math, crafting, stat modifiers, spawn rates, map generation, repair cost, targeting).
- No backend. Local storage only for best score and settings.

**Architecture rules:**
- **Simulation is separate from rendering.** Systems read and write plain data. Only `render/` touches the canvas.
- **Data over code.** Enemies, buildings, recipes, spells, loot, and tuning values live in `src/data/` as typed objects. Files in `src/data/` hold data only; logic that uses it lives elsewhere, under a different filename.
- **Systems communicate through a small event bus** (`src/core/events.ts`). Example events: `enemy:died`, `corpse:spawned`, `building:destroyed`, `phase:night`.
- **Deterministic simulation.** All randomness comes from a seeded RNG passed in, so bugs can be reproduced with a seed. Never use `Math.random`.
- **Fixed timestep.** Logic runs in 1/60 s steps regardless of frame rate. The accumulator is capped at 0.25 s of **real** elapsed time per frame, and time scale multiplies it after the cap. A stalled tab never tries to catch up all at once, and 20× speed still works.
- **Auto-pause.** Listen for `visibilitychange` and window `blur`, and pause the game. Resume rules are in section 8.3.

**Rendering performance:**
- Draw only tiles, entities, and corpses inside the view.
- Corpses are capped by the render limit setting (section 12).
- Pre-render lighting to an offscreen canvas and composite it once per frame.

### 15.1 Movement and Navigation

**Movement profiles.** Every enemy declares one:

| Profile | Blocked by | Navigation | Used by |
|---|---|---|---|
| `ground` | `rock`, ungenerated tiles; buildings cost +20 | Flow fields | Imp, Shambler, Brute, Hellhound |
| `flying` | Nothing | Direct steering | Wraith |

The player is moved by input and is never navigated.

**Goals and flow fields.**
- There are two goals: `player` and `phylactery`. Each has one flow field, used by `ground` enemies. The Phylactery's goal tiles are the tiles bordering its footprint.
- A flow field is a Dijkstra map: every tile stores its path cost to the goal and the direction to step. Buildings are passable at +20 cost, so enemies route around walls when a route exists and attack through them when none does.
- **No diagonal corner-cutting.** Neighbors are 8-way, but a diagonal step is allowed only if both tiles beside it (the two orthogonal neighbors it passes between) are walkable and free of buildings.
- Each field covers a window of radius `fieldRadius = 48` tiles around its goal. Enemies spawn 32–40 tiles from their anchor (section 6), so they always start inside that anchor's field.
- **Stuck enemies.** A ground enemy standing inside a field window on a tile with no path to either target (infinite cost in both fields, which only happens in a sealed rock pocket) is removed without a corpse. Walls never cause this, because buildings are passable at +20 cost.
- The player field is rebuilt when the player changes tile. Both fields are rebuilt when a building is placed or destroyed, or when a chunk generates inside their window. At most one field rebuilds per tick, so rebuilds never cause frame spikes.
- An enemy outside both windows steers directly toward its target until it enters one.
- **Flying units never use a field.** They steer straight at their target.

**Smoothed movement.** Ground enemies follow the field without snapping to tile centers:
- The desired direction is the **bilinear blend** of the flow directions of the four tiles around the enemy's position, so direction changes gradually across tile borders.
- Separation (below) is added to the desired direction.
- The enemy's velocity turns toward the desired direction at a limited rate (`turnRate = 540°/s`) instead of changing instantly.
- Collision with `rock` and buildings still applies, so smoothing never lets an enemy pass through a blocked tile.

**Target selection** follows section 7. It is written as a small selector function (`closestOf(['player', 'phylactery'])` with hysteresis) so new enemy types can choose a different one without new pathing code.

**Neighbor queries.** A spatial hash (`src/world/spatialHash.ts`, cells of 2 tiles) answers "what is within radius R?" for chain jumps, Totem targeting, Corpse Collector range, attack checks, and separation. Without it, 150 enemies become an O(n²) problem.

**Crowd separation.** Every enemy adds a small separation force from nearby enemies, so swarms spread out instead of stacking on one tile.

**Factions.** Every entity has a `faction`: `player` (the necromancer, buildings, Totem bolts) or `demon`. Targeting and damage only consider the opposing faction.

**Proposed folder layout:**

```
necrogrid/
  index.html
  package.json
  vite.config.ts
  tsconfig.json
  CLAUDE.md
  GAME_DESIGN.md
  lore.md
  src/
    main.ts                  # browser side: canvas, input, loop, drawing; owns one Game
    game.ts                  # the simulation for one run: world, time, player, enemies, spawning
    core/
      stats.ts               # base stats and modifier math (add, then mul)
      loop.ts                # fixed-timestep loop, accumulator cap, auto-pause
      input.ts               # keyboard + mouse state, preventDefault, resume consumption
      events.ts              # typed event bus
      rng.ts                 # seeded RNG
    world/
      tiles.ts               # tile types
      mapGen.ts              # chunk generation logic from (seed, chunkX, chunkY)
      chunks.ts              # chunk storage and generation radius
      grid.ts                # grid queries, footprints, collision
      flowField.ts           # ground pathfinding, one windowed field per goal
      navigation.ts          # smoothed field following, direct steering, separation
      spatialHash.ts         # neighbor queries
      noSpawnGrid.ts         # per-tile no-spawn counters from building radii
      buildingGrid.ts        # which tiles buildings occupy
    time/
      dayCycle.ts
    director/
      spawnDirector.ts       # budget, weights, spawn ring, spawn checks, elites
    entities/
      player.ts              # includes Mend
      enemy.ts
      corpse.ts
      projectile.ts
      building.ts
      phylactery.ts
      startingBase.ts        # starting walls and Totem
    combat/
      bolt.ts                # casting, flight, segment hit tests
      chain.ts
      damage.ts
      targeting.ts           # target selectors and hysteresis
      chain.ts               # chain targets and falloff
      totem.ts               # Totem targeting and bolts
    economy/
      resources.ts           # resource counters and caps
      lootRoll.ts            # rolls loot from src/data/loot.ts
      repair.ts              # repair cost and pay-as-you-go repair
    crafting/
      crafting.ts            # crafting logic, reads src/data/recipes.ts
      unlocks.ts             # unlocked gear and equipped slots
    ui/
      hud.ts
      buildMenu.ts
      craftMenu.ts
      equipmentScreen.ts
      titleScreen.ts         # title and pause screen, confirmation, controls and seed panels
      endScreen.ts           # loss and win summaries, best score
      bestScore.ts           # local best score
      warnings.ts            # warning banners
      menuWidgets.ts         # shared buttons, dialogs, hit tests
      healthBars.ts          # enemy and building health bars
      resourceHud.ts         # compact resource counters
      settings.ts            # settings values, storage, and panel
    audio/
      sound.ts               # sound effects: event mapping, rate limits, Web Audio backend
    debug/
      debugPanel.ts
      overlays.ts            # flow field and spawn map overlays
    render/
      canvas.ts
      camera.ts
      lighting.ts
      effects.ts             # attack swipes, damage numbers, chains, popups, Collector links
      particles.ts           # death bursts, sparks, debris, harvest motes
      shake.ts               # screen shake
      sprites.ts             # placeholder shapes first, sprites later
    data/
      tuning.ts
      enemies.ts             # roster, spawn weights, elite values
      buildings.ts           # building roster, Phylactery, no-spawn radii
      recipes.ts             # gear recipes, slots, modifiers, stat labels
      spells.ts              # Bolt, Chain, Mend
      spawn.ts
      loot.ts                # loot table, elite loot, harvest times
      resources.ts           # resource types, colors, caps
      terrain.ts             # map generation tuning (coverage, cluster sizes)
      controls.ts            # key bindings and their labels
      ui.ts                  # HUD, menu, and effect sizes, colors, timings
      time.ts                # day cycle phases, lighting, day ring
      audio.ts               # sound effect definitions
      fx.ts                  # particle and screen shake values
  tests/
    chain.test.ts
    crafting.test.ts
    spawn.test.ts
    stats.test.ts
    mapGen.test.ts
    startingBase.test.ts
    repair.test.ts
    targeting.test.ts
    flowField.test.ts
```

**Placeholder art rule:** Until M10, every entity is drawn as a simple shape. Enemies use distinct shapes and colors (Imp = small red triangle, Shambler = green circle, Brute = large dark square, Wraith = translucent purple diamond, Hellhound = orange hexagon). Elites add the yellow pulsing circle beneath. Buildings are colored squares with a short text label; the Bone Door is a wall square with a darker center stripe. This keeps the readability pillar testable early.

## 16. Tuning Log

Record every balance change here so intent is not lost.

| Date | Value | From | To | Reason |
|---|---|---|---|---|
| — | — | — | — | Initial design values |
| v0.5 | Day spawn rate | 1.5 / s, +0.15 per day, cap 4.0 | 1.0 / s, +0.1 per day, cap 3.0 | Day 1 was too hard before any buildings existed |
| v0.5 | Night spawn rate | 0.3 / s | 0.2 / s | Kept in proportion with the day rate |
| v0.5 | Repair cost | 1 Bone per 10 HP | Scales with build cost | Repairing a wall cost more than building a new one |
| v0.5 | Large corpse Soul Shard | 0–1 (5%) | 1 (guaranteed) | Large enemies are the Soul Shard source |
| v0.7 | Ichor sources | Wraiths and rare Imps | Any corpse, per the loot table | Resource table now follows the loot table |
| v0.7 | Hellhound `minDay` | "after day 5" | 5 | Removed ambiguity |
| v0.8 | Elite loot | Rolled twice | 4× amounts + 1 Soul Shard | Elites should feel worth hunting |
| v0.10 | Respawn invulnerability | 1.5 s | 3 s | Respawning into a crowd |
| v0.10 | Chunk generation radius | 1.5 × view | 2 × view | Spawn rings reach 40 tiles out |
| v0.15 | Grave Lantern light radius | 3 tiles | 4 tiles | Playtest feedback |
| v0.18 | (observation, no change) | — | — | Automated full run with an idle necromancer: the 150-enemy cap is reached by day 3 and stays full, so spawning stalls; an undefended starting base is gone by day 3. Revisit the cap and despawn rules after human playtests |
| v0.19 | Day / night length | 150 s / 80 s | 75 s / 40 s | Shorter run; dusk and dawn stay 10 s |
| v0.19 | Final day | 15 | 7 | Shorter run (about 15 minutes) |
| v0.19 | Spawn ramp | Day rate +0.1 / s per day (cap 3.0), night flat 0.2 / s | Day and night rates × (1 + 0.25 × (day − 1)), cap ×4 | Difficulty did not visibly grow, and nights never grew at all |
| v0.19 | Active enemy cap | 150 | 150 + 20 per day, up to 300 | A fixed cap stopped the ramp once enemies piled up |
| v0.19 | Brute `minDay` | 1 | 3 | Ease the first days |
| v0.19 | Grave Lantern | Light and decoy only | + heal 1 HP/s, repair 1 HP/s within 4 tiles, free, no stacking | Playtest request |
| v0.19 | Resource caps | 200 basic / 50 rare | + 50 per Altar | Playtest request |

## 17. Non-Goals (v1)

- Multiplayer or online features.
- Allies of any kind, including raised minions (strong fit for the theme; good v2 candidate).
- An item inventory. Gear is unlocked (section 10.3) and resources are counters.
- Mobile or touch controls.
- Save-and-continue. A run ends on death before the Phylactery completes, or on Phylactery destruction.
- Story, dialogue, or quests.
- Procedural audio (generated music or adaptive soundscapes). The M10 sound effects are short synthesized placeholders, not this.

## 18. Decisions

**Confirmed (v0.2):**
1. **Spawn direction:** Day is heavy, night is sparse.
2. **Win condition:** Complete the Phylactery on day 7 (day 15 before v0.19), then endless (section 10.4).
3. **Death:** Restart from scratch. No meta-progression in v1.
4. **Corpse source:** Demons only.
5. **Art direction:** Flat vector.
6. **Tech stack:** Plain TypeScript + Canvas.

**Confirmed (v0.3):**
7. **Corpse fade:** A corpse fades out during the next day phase after it is created (section 9.2).
8. **Phylactery timer:** Construction is mechanical. It runs for all of the final day (day 7, 75 s, since v0.19) and completes if the Phylactery is still standing. Completion is the win and grants immortality as flavor and effect (section 10.4). Lore-wise, the binding is built over the whole run (v0.6).

**Confirmed (v0.4):**
9. **Wraith movement:** Direct flight, no pathing.

**Confirmed (v0.5):**
10. **Spawning:** Lower rates (section 6). Spawn locations were replaced in v0.10 (decision 33).
11. **Starting base:** Random walls on the ring 2 tiles out, then a guaranteed Totem and Corpse Collector on that ring (section 10.5, revised in v0.17).
12. **Mana pressure:** Solved through gear progression, not base stats (section 10.3).
13. **Corpse Collector** replaces the Ossuary (section 10.2.1).
14. **Map:** Procedural chunks generated beyond view (radius raised to 2 × view in v0.10), follow camera, rarer rock (section 4).
15. **Allies:** Out of scope for v1.
16. **Wraith attacks:** Blocked by buildings; Wraiths are an annoyance, not a main threat.

**Confirmed (v0.6):**
17. **Wraiths every night**, from day 1 (section 6).

**Confirmed (v0.7):**
18. **Healing:** Mend spends Flesh on Q. No passive HP regen (section 8.2).
19. **Unit size:** Radius 0.5 tile for all units for now. Melee range 2 tiles.
20. **Wraiths** stop at range; shots travel 3 tiles/s.
21. **Gear** is unlocked and swapped freely; there is no item inventory.
22. **Player collision:** Blocked by all buildings except the Bone Door (12 Bone).
23. **Elites:** 5% of spawns, marked by a pulsing yellow circle.
24. **Movement:** Smoothed field following, no diagonal corner-cutting.

**Confirmed (v0.8):**
25. **Elite loot:** 4× the rolled amounts plus 1 guaranteed Soul Shard (section 7.1).
26. **HUD:** crescents on the character, day ring, Phylactery panel and arrow, compact resources (all shown near an Altar), warnings, contextual prompts. No threat indicators or minimap (section 8.4).
27. **Menus pause:** C, Tab, and Esc pause the game; build mode does not (section 8.3).

**Confirmed (v0.9):**
28. **Spell bar:** Bolt and Chain icons beside the Mend badge (section 8.4).
29. **Title and pause screen:** one screen with grave-rising letters. Resume on top while a run is active, New Game confirmation, controls panel in the corner (section 8.5).
30. **Health bars:** on damaged enemies and buildings, green / yellow / red by thirds (section 8.4).
31. **Numbers are starting values.** Every value in this document is a first guess to be tuned in playtesting, with changes recorded in section 16.

**Confirmed (v0.10):**
32. **Respawn** after completion (section 10.4): no-build zone on the 16 tiles around the Phylactery keeps the respawn tile free; 3 s delay with a camera pan; 30 HP Phylactery cost per death; 3 s invulnerability; cooldowns reset.
33. **Spawn locations** (section 6): no pathing. Every enemy spawns off screen, outside every building's no-spawn radius, on a ring 32–40 tiles around either the player or the Phylactery (50/50). This replaced the v0.7 "outside" flood-fill rule and the separate Wraith rule.

**Confirmed (v0.11):**
34. **No-spawn grid:** each building blocks spawns within its `noSpawnRadius`: 3 tiles by default, 5 for the Bone Totem (section 6).

**Confirmed (v0.12):**
35. **Enemy attack swipes:** a short red crescent swipe toward whatever a melee enemy hits; orange for elites (section 7, built in M4).

**Confirmed (v0.14):**
36. **Marsh:** all marsh, wild or player-made, slows ground demons by 50% like the player. Players can make marsh (10 Flesh, 1 Ichor, key 7) and fill any marsh into dirt (5 Bone, 5 Flesh, key 8). No refunds. Marsh stays out of the no-build zone (section 10.2).

**Confirmed (v0.19):**
37. **Run length:** 7 days of 135 s (day 75, dusk 10, night 40, dawn 10); the Phylactery completes at the end of day 7's day phase (section 5).
38. **Difficulty ramp:** every enemy type spawns more each day, by day and by night (section 6). Brutes from day 3, Hellhounds from day 5.
39. **Grave Lantern aura:** slow, free heal (player) and repair (buildings and Phylactery), not stacking (section 10.2).
40. **Altar caps:** each Altar adds 50 to every resource cap, stacking (section 9.1).

**Confirmed (v0.20):**
41. **Collector link:** a Collector shows its link for the whole 3–5 s duration, then takes the corpse (section 10.2.1).
42. **Sound:** synthesized placeholder effects ship in M10 rather than a silent stub; recorded sounds can replace them later behind the same backend.

**Open:** none right now.

## 19. Glossary

- **Bone / Flesh / Ichor / Soul Shard:** the four resource types (section 9.1).
- **Bone Door:** a wall the player can walk through and enemies cannot (section 10.2).
- **Chunk:** a 16 × 16 tile block of the procedural map (section 4.1).
- **Corpse:** the entity left by a dead enemy. Harvestable until it fades out (section 9.2).
- **Corpse Collector:** a building that harvests nearby corpses automatically (section 10.2.1).
- **Debug panel:** testing tools enabled with `?debug` (section 13).
- **Elite:** a tougher variant of any enemy, 5% of spawns (section 7.1).
- **Flow field:** a grid of path costs and directions toward a goal (the player or the Phylactery), used by ground enemies (section 15.1).
- **Footprint:** the set of tiles a building occupies.
- **Hysteresis:** the rule that an enemy only switches targets when the other is clearly closer (section 7).
- **Mend:** the Flesh-powered heal on Q (section 8.2).
- **No-build zone:** the 16 tiles bordering the Phylactery, where the player cannot build (section 10.4).
- **No-spawn grid:** per-tile counters marking where buildings block spawning (section 6).
- **Spawn anchor:** the point a pack spawns around, either the player or the Phylactery (section 6).
- **Phylactery:** the central 3×3 binding the necromancer is building. Its completion wins the run and grants infinite respawns; its destruction ends the run (section 10.4).
- **Spawn budget:** the running total that decides when the next pack spawns (section 6).
- **Spawn director:** the system that decides what spawns, where, and how often (section 6).
- **Stat modifier:** an additive or multiplicative change to a stat, supplied by gear or buildings.
- **Unlock:** a crafted gear item, available to equip for the rest of the run (section 10.3).
- **View radius:** the distance from the player to a corner of the view, 23 tiles (section 4).
