// The simulation for one run: world, time, player, Phylactery, enemies, and spawning.
// main.ts owns the browser side (canvas, input, loop) and calls tick() at 60 Hz.

import { ALTAR, BUILD_RULES, BUILDINGS, COLLECTOR, LANTERN, PHYLACTERY, TERRAIN_EDITS, TOTEM, type BuildingKind } from './data/buildings';
import { nearestWithin, totemBolt } from './combat/totem';
import { createBuilding, footprintCenter, placementProblem, shareOf, type Building, type PlacementWorld } from './entities/building';
import { planStartingBase } from './entities/startingBase';
import { stepRepair, type Repairable } from './economy/repair';
import { CRAFTING, GEAR, type GearId, type GearSlot } from './data/recipes';
import { gearDef } from './crafting/unlocks';
import { baseStats, computeStats, type Stats } from './core/stats';
import { craftProblem } from './crafting/crafting';
import { GearState } from './crafting/unlocks';
import { type EnemyId } from './data/enemies';
import { SPAWN } from './data/spawn';
import { CHUNK_GENERATION_RADIUS, CHUNK_SIZE, TILE } from './data/terrain';
import { NAV, PLAYER, RESPAWN, SCORE } from './data/tuning';
import { DAY_CYCLE } from './data/time';
import { ENEMY_SHOT } from './data/enemies';
import type { EventBus, GameEvents } from './core/events';
import type { Point } from './core/input';
import { hashInts, Rng } from './core/rng';
import { stepBolt, tryCastBolt } from './combat/bolt';
import { chainDamage, tryCastChain } from './combat/chain';
import { chooseTarget } from './combat/targeting';
import { SpawnDirector, type SpawnWorld } from './director/spawnDirector';
import { createEnemy, type Enemy } from './entities/enemy';
import { createPhylactery, PHYLACTERY_ID, phylacteryRingTiles, type Phylactery } from './entities/phylactery';
import { createPlayer, mendProblem, startMend, updatePlayer, type MoveIntent, type Player, type PlayerTerrain } from './entities/player';
import type { Projectile } from './entities/projectile';
import { corpseExpiry, type Corpse } from './entities/corpse';
import { HARVEST } from './data/loot';
import { RESOURCE_ORDER, type ResourceAmounts } from './data/resources';
import { MEND } from './data/spells';
import { rollLoot } from './economy/lootRoll';
import { Resources } from './economy/resources';
import { DayCycle } from './time/dayCycle';
import { BuildingGrid } from './world/buildingGrid';
import { ChunkMap } from './world/chunks';
import { FlowFields, type FlowField, type GoalId } from './world/flowField';
import {
  distanceToFootprint,
  isWalkableTile,
  nearestPointOnFootprint,
  groundSpeedMultiplier,
  tileKey,
  type Footprint,
} from './world/grid';
import { separation, steer } from './world/navigation';
import { NoSpawnGrid } from './world/noSpawnGrid';
import { SpatialHash } from './world/spatialHash';
import { terrainEditProblem, terrainEditResult, type TerrainEdit } from './world/terrainEdit';

/** Separate RNG streams, so one system's rolls never shift another's. */
const SPAWN_STREAM = 0x5370;
const LOOT_STREAM = 0x1007;
const BUILD_STREAM = 0xb11d;

export interface PlayerCommand {
  move: MoveIntent;
  /** Aim point in world tiles. */
  aim: Point;
  /** Bolt button held. */
  bolt: boolean;
  /** Chain button pressed this tick. */
  chain: boolean;
  /** Harvest key pressed or held (holding keeps harvesting the next corpse). */
  harvest?: boolean;
  /** Mend key pressed this tick. */
  mend?: boolean;
  /** Repair key held. */
  repair?: boolean;
}

/** A shot fired by a ranged enemy (Wraith). Hits the player, or the first building it touches. */
export interface EnemyShot {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  life: number;
  /** Damage to the player, and to a building (after the enemy's building multiplier). */
  damage: number;
  buildingDamage: number;
  alive: boolean;
}

/** A harvest in progress. */
export interface HarvestState {
  corpse: Corpse;
  /** Seconds done so far, and seconds needed. */
  progress: number;
  duration: number;
}

/** How a run ended (section 11). */
export interface RunOutcome {
  cause: 'player' | 'phylactery';
  day: number;
  kills: number;
  corpsesHarvested: number;
  score: number;
}

export function computeScore(day: number, kills: number, buildingsLost: number): number {
  return day * SCORE.perDay + kills * SCORE.perKill + buildingsLost * SCORE.perBuildingLost;
}

export class Game {
  readonly map: ChunkMap;
  readonly cycle: DayCycle;
  readonly player: Player;
  readonly phylactery: Phylactery;
  /** Which tiles buildings (and the Phylactery) occupy. */
  readonly buildings = new BuildingGrid();
  /** Player buildings by id (the Phylactery is separate). */
  readonly buildingsById = new Map<number, Building>();
  readonly noSpawn = new NoSpawnGrid();
  readonly fields: FlowFields;
  readonly director: SpawnDirector;
  readonly enemies: Enemy[] = [];
  readonly enemyHash = new SpatialHash<Enemy>(NAV.hashCellSize);
  readonly projectiles: Projectile[] = [];
  readonly enemyShots: EnemyShot[] = [];
  /** The Phylactery is complete (the final day won). From then on, death means respawn (section 10.4). */
  completed = false;
  /** Seconds until the necromancer returns after dying post-completion; 0 while alive. */
  respawnTimer = 0;
  private deathSpot: Point = { x: 0, y: 0 };
  readonly resources = new Resources();
  /** Unlocked and equipped gear (section 10.3). */
  readonly gear = new GearState();
  /** The player's stats with equipped gear applied. */
  stats: Stats = baseStats();
  /** In creation order (oldest first). */
  readonly corpses: Corpse[] = [];
  harvest: HarvestState | undefined;
  kills = 0;
  /** Kills this run by enemy type (the pause screen's kill gallery). */
  readonly killsByType: Record<EnemyId, number> = { imp: 0, shambler: 0, brute: 0, wraith: 0, hellhound: 0 };
  /** Buildings destroyed by demons, for the score. */
  buildingsLost = 0;
  /** Corpses harvested (by hand; Collectors from M7 count too), for the end screen. */
  corpsesHarvested = 0;
  /** Debug: the player and the Phylactery take no damage. */
  godMode = false;
  /** Whether the Phylactery reaching 0 HP ends the run (on from M9). */
  phylacteryLossEnabled: boolean = PHYLACTERY.destructionEndsRun;
  /** Set when the run is lost; the simulation stops. */
  outcome: RunOutcome | undefined;
  /** Debug: which field rebuilt this tick, if any. */
  lastFieldRebuild: GoalId | undefined;

  private readonly noBuildZone = new Set<number>();
  private readonly lootRng: Rng;
  /** Building randomness: starting base layout and Collector cooldowns. */
  private readonly buildRng: Rng;
  private nextCorpseId = 1;
  private nextEnemyId = 1;
  private nextBuildingId = PHYLACTERY_ID + 1;
  private readonly neighbors: Enemy[] = [];
  private readonly playerTerrain: PlayerTerrain;
  /** Enemies collide with rock, ungenerated ground, and every building (Bone Doors included). */
  private readonly groundBlocked = (tx: number, ty: number): boolean =>
    !isWalkableTile(this.map.getTile(tx, ty)) || this.buildings.has(tx, ty);
  /** The player collides with the same, except Bone Doors. */
  private readonly playerBlocked = (tx: number, ty: number): boolean => {
    if (!isWalkableTile(this.map.getTile(tx, ty))) return true;
    const id = this.buildings.buildingAt(tx, ty);
    if (id === undefined) return false;
    return !(this.buildingsById.get(id)?.playerPassable ?? false);
  };

  constructor(
    readonly seed: number,
    readonly events: EventBus<GameEvents>,
    /** `startingBase: false` skips the free walls and Totem (for focused tests). */
    options: { startingBase?: boolean } = {},
  ) {
    this.map = new ChunkMap(seed);
    this.cycle = new DayCycle(events);
    this.player = createPlayer(PLAYER.startTile.x, PLAYER.startTile.y);
    this.phylactery = createPhylactery();
    this.buildings.place(PHYLACTERY_ID, this.phylactery.footprint);
    this.noSpawn.add(this.phylactery.footprint, PHYLACTERY.noSpawnRadius);
    for (const t of phylacteryRingTiles(this.phylactery.footprint)) this.noBuildZone.add(tileKey(t.x, t.y));

    this.fields = new FlowFields(
      {
        isWalkable: (tx, ty) => isWalkableTile(this.map.getTile(tx, ty)),
        isBuilding: (tx, ty) => this.buildings.has(tx, ty),
      },
      { x: 0, y: 0 },
      phylacteryRingTiles(this.phylactery.footprint),
    );
    this.director = new SpawnDirector(new Rng(hashInts(seed, SPAWN_STREAM)));
    this.lootRng = new Rng(hashInts(seed, LOOT_STREAM));
    this.buildRng = new Rng(hashInts(seed, BUILD_STREAM));

    this.playerTerrain = {
      speedMultiplierAt: (x, y) => groundSpeedMultiplier(this.map.getTile(Math.floor(x), Math.floor(y))),
      isBlocked: this.playerBlocked,
    };

    events.on('chunk:generated', ({ chunkX, chunkY }) =>
      this.fields.chunkGenerated(chunkX * CHUNK_SIZE, chunkY * CHUNK_SIZE, CHUNK_SIZE),
    );
    // The Phylactery completes when the final day's (DAY_CYCLE.winDay) day phase ends with it still standing (section 10.4).
    events.on('phase:dusk', ({ day }) => {
      if (day === DAY_CYCLE.winDay) this.complete();
    });
    this.generateChunks();
    if (options.startingBase ?? true) this.buildStartingBase();
  }

  /** True while the necromancer is dead and waiting to respawn (only after completion). */
  get playerDead(): boolean {
    return this.respawnTimer > 0;
  }

  /** Seconds left in the final day's completion countdown, or undefined outside it. */
  completionRemaining(): number | undefined {
    const s = this.cycle.state;
    if (this.completed || s.day !== DAY_CYCLE.winDay || s.phase !== 'day') return undefined;
    return s.phaseLength - s.timeInPhase;
  }

  /**
   * Where the view (and the player-anchored spawn ring) is centered: the player, or while dead,
   * a pan from the death spot to the Phylactery over the first `panTime` seconds.
   */
  viewCenter(): Point {
    if (!this.playerDead) return { x: this.player.x, y: this.player.y };
    const t = Math.min(1, (RESPAWN.delay - this.respawnTimer) / RESPAWN.panTime);
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const to = this.phylactery.center;
    return { x: this.deathSpot.x + (to.x - this.deathSpot.x) * e, y: this.deathSpot.y + (to.y - this.deathSpot.y) * e };
  }

  private complete(): void {
    if (this.completed || this.outcome) return;
    this.completed = true;
    this.events.emit('run:won', {
      day: this.cycle.state.day,
      kills: this.kills,
      corpsesHarvested: this.corpsesHarvested,
      score: this.score,
    });
  }

  /** Death after completion: the binding pulls the necromancer back (section 10.4). */
  private die(): void {
    this.deathSpot = { x: this.player.x, y: this.player.y };
    this.respawnTimer = RESPAWN.delay;
    this.interruptHarvest('damage');
    this.player.mendHealLeft = 0;
    this.events.emit('player:died', {});
    if (!this.godMode) {
      this.phylactery.hp = Math.max(0, this.phylactery.hp - RESPAWN.phylacteryCost);
      this.events.emit('phylactery:damaged', { amount: RESPAWN.phylacteryCost, hp: this.phylactery.hp });
      if (this.phylactery.hp <= 0 && this.phylacteryLossEnabled) this.lose('phylactery');
    }
  }

  private respawn(): void {
    const p = this.player;
    p.x = p.prevX = PLAYER.startTile.x + 0.5;
    p.y = p.prevY = PLAYER.startTile.y + 0.5;
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    p.invulnerable = RESPAWN.invulnerability;
    p.boltCooldown = 0;
    p.chainCooldown = 0;
    p.mendCooldown = 0;
    p.mendHealLeft = 0;
    this.respawnTimer = 0;
    this.events.emit('player:respawned', {});
  }

  /** Section 10.5: free walls on the ring 2 tiles out (60% each), then a Totem and a Collector on that ring (never fully closed). */
  private buildStartingBase(): void {
    const plan = planStartingBase(
      this.buildRng,
      this.phylactery.footprint,
      { x: PLAYER.startTile.x, y: PLAYER.startTile.y },
      (t) => placementProblem({ x: t.x, y: t.y, w: 1, h: 1 }, this.placementWorld(), true) === undefined,
    );
    for (const w of plan.walls) this.placeBuilding('wall', w.x, w.y, { free: true });
    // Placed after the walls; the plan already gave them their tiles over any wall.
    if (plan.totem) this.placeBuilding('totem', plan.totem.x, plan.totem.y, { free: true });
    if (plan.collector) this.placeBuilding('collector', plan.collector.x, plan.collector.y, { free: true });
  }

  private placementWorld(): PlacementWorld {
    return {
      getTile: (x, y) => this.map.getTile(x, y),
      isOccupied: (x, y) => this.buildings.has(x, y),
      isNoBuildZone: (x, y) => this.isNoBuildZone(x, y),
      units: () => [
        { x: this.player.x, y: this.player.y, radius: PLAYER.radius },
        ...this.enemies.filter((e) => e.alive).map((e) => ({ x: e.x, y: e.y, radius: e.def.radius })),
      ],
    };
  }

  /** Why a terrain edit cannot be made here (including cost), or undefined. Does not make it. */
  editProblem(edit: TerrainEdit, tileX: number, tileY: number): string | undefined {
    const problem = terrainEditProblem(edit, tileX, tileY, {
      getTile: (x, y) => this.map.getTile(x, y),
      isBuilding: (x, y) => this.buildings.has(x, y),
      isNoBuildZone: (x, y) => this.isNoBuildZone(x, y),
    });
    if (problem) return problem;
    return this.resources.canAfford(TERRAIN_EDITS[edit].cost) ? undefined : 'Not enough resources';
  }

  /** Why a building of this kind cannot go here (including cost), or undefined. Does not place it. */
  buildProblem(kind: BuildingKind, x: number, y: number): string | undefined {
    const def = BUILDINGS[kind];
    const problem = placementProblem({ x, y, w: def.w, h: def.h }, this.placementWorld());
    if (problem) return problem;
    return this.resources.canAfford(def.cost) ? undefined : 'Not enough resources';
  }

  /**
   * Places a building with its top-left tile at (x, y), paying its cost unless `free`.
   * Returns the building, or the reason it could not be placed.
   */
  placeBuilding(
    kind: BuildingKind,
    x: number,
    y: number,
    options: { free?: boolean; ignoreNoBuildZone?: boolean; playerPassable?: boolean } = {},
  ): Building | string {
    const def = BUILDINGS[kind];
    const fp: Footprint = { x, y, w: def.w, h: def.h };
    const problem = placementProblem(fp, this.placementWorld(), options.ignoreNoBuildZone ?? false);
    if (problem) return problem;
    const free = options.free ?? false;
    if (!free && !this.spend(def.cost)) return 'Not enough resources';
    const building = createBuilding(this.nextBuildingId++, kind, x, y, free, options.playerPassable);
    this.buildingsById.set(building.id, building);
    this.buildings.place(building.id, fp);
    this.noSpawn.add(fp, def.noSpawnRadius);
    this.fields.markAllDirty();
    if (kind === 'altar') this.updateCapBonus();
    this.events.emit('building:placed', { id: building.id, kind });
    return building;
  }

  /** The player removes a building: 50% refund (nothing for free starting buildings). */
  removeBuilding(id: number): boolean {
    const building = this.buildingsById.get(id);
    if (!building) return false;
    this.unregisterBuilding(building);
    const refund = building.free ? {} : this.gain(shareOf(building.def.cost, BUILD_RULES.removeRefund));
    const c = footprintCenter(building.footprint);
    this.events.emit('building:removed', { id, kind: building.kind, x: c.x, y: c.y, refund });
    return true;
  }

  /** The building (or none) whose footprint covers a tile. */
  buildingAtTile(tileX: number, tileY: number): Building | undefined {
    const id = this.buildings.buildingAt(tileX, tileY);
    return id === undefined ? undefined : this.buildingsById.get(id);
  }

  private unregisterBuilding(building: Building): void {
    this.buildingsById.delete(building.id);
    this.buildings.remove(building.footprint);
    this.noSpawn.remove(building.footprint, building.def.noSpawnRadius);
    this.fields.markAllDirty();
    if (building.kind === 'altar') this.updateCapBonus();
  }

  /** Every standing Altar raises every resource cap (section 9.1). */
  private updateCapBonus(): void {
    let altars = 0;
    for (const b of this.buildingsById.values()) if (b.kind === 'altar') altars++;
    this.resources.capBonus = altars * ALTAR.capBonus;
  }

  /**
   * Grave Lantern aura (section 10.2): free, slow healing for the player and repair for every
   * building and the Phylactery in reach of any Lantern. Several Lanterns do not stack.
   */
  private updateLanternAura(dt: number): void {
    const lanterns: Point[] = [];
    for (const b of this.buildingsById.values()) if (b.kind === 'lantern') lanterns.push(footprintCenter(b.footprint));
    if (lanterns.length === 0) return;
    const r = LANTERN.auraRadius;
    const reaches = (fp: Footprint) => lanterns.some((c) => distanceToFootprint(c.x, c.y, fp) <= r);
    const p = this.player;
    if (!this.playerDead && p.hp < p.maxHp && lanterns.some((c) => Math.hypot(c.x - p.x, c.y - p.y) <= r)) {
      p.hp = Math.min(p.maxHp, p.hp + LANTERN.healRate * dt);
    }
    const repair = (t: { hp: number; maxHp: number }) => {
      t.hp = Math.min(t.maxHp, t.hp + LANTERN.repairRate * dt);
    };
    for (const b of this.buildingsById.values()) if (b.hp < b.maxHp && reaches(b.footprint)) repair(b);
    const ph = this.phylactery;
    if (ph.hp > 0 && ph.hp < ph.maxHp && reaches(ph.footprint)) repair(ph);
  }

  private destroyBuilding(building: Building): void {
    this.unregisterBuilding(building);
    this.buildingsLost++;
    const drop = building.free ? {} : this.gain(shareOf(building.def.cost, BUILD_RULES.destroyDrop));
    const c = footprintCenter(building.footprint);
    this.events.emit('building:destroyed', { id: building.id, kind: building.kind, x: c.x, y: c.y, drop });
  }

  /** True while the player is within an Altar's aura (mana regen, all resource counters shown). */
  nearAltar(): boolean {
    for (const b of this.buildingsById.values()) {
      if (b.kind !== 'altar') continue;
      const c = footprintCenter(b.footprint);
      if (Math.hypot(c.x - this.player.x, c.y - this.player.y) <= ALTAR.auraRadius) return true;
    }
    return false;
  }

  /** What hold-R would repair: the nearest damaged building or Phylactery within range. */
  repairCandidate(): { target: Repairable; cost: ResourceAmounts; footprint: Footprint } | undefined {
    let best: { target: Repairable; cost: ResourceAmounts; footprint: Footprint } | undefined;
    let bestD: number = BUILD_RULES.repairRange;
    const consider = (target: Repairable, cost: ResourceAmounts, footprint: Footprint) => {
      if (target.hp >= target.maxHp || target.hp <= 0) return;
      const d = distanceToFootprint(this.player.x, this.player.y, footprint);
      if (d <= bestD) {
        bestD = d;
        best = { target, cost, footprint };
      }
    };
    consider(this.phylactery, PHYLACTERY.repairCost, this.phylactery.footprint);
    for (const b of this.buildingsById.values()) consider(b, b.def.cost, b.footprint);
    return best;
  }

  private updateRepair(dt: number, held: boolean): void {
    if (!held) return;
    const candidate = this.repairCandidate();
    if (!candidate) return;
    const healed = stepRepair(candidate.target, candidate.cost, BUILD_RULES.repairRate, dt, (id) => this.spend({ [id]: 1 }));
    if (healed > 0) this.events.emit('building:repaired', { amount: healed });
  }

  /** Totems shoot and Collectors harvest (section 10.2). */
  private updateBuildings(dt: number): void {
    for (const b of this.buildingsById.values()) {
      if (b.kind === 'collector') {
        this.updateCollector(b, dt);
        continue;
      }
      b.cooldown = Math.max(0, b.cooldown - dt);
      if (b.cooldown > 0) continue;
      const center = footprintCenter(b.footprint);
      if (b.kind === 'totem') {
        const nearby = this.enemyHash.queryRadius(center.x, center.y, TOTEM.range).filter((e) => e.alive && e.fadeIn <= 0);
        const target = nearestWithin(center, nearby, TOTEM.range);
        if (!target) continue;
        this.projectiles.push(totemBolt(center, target));
        this.events.emit('bolt:cast', { source: 'totem', x: center.x, y: center.y });
        b.cooldown = TOTEM.interval;
      }
    }
  }

  /**
   * Corpse Collector (section 10.2.1): links to the nearest unclaimed corpse in range for a
   * random 3–5 s, then takes it. If the corpse is gone first (harvested by hand or faded),
   * the link breaks and it links to the next one with a fresh duration.
   */
  private updateCollector(b: Building, dt: number): void {
    if (b.link && !this.corpses.includes(b.link)) b.link = undefined;
    const center = footprintCenter(b.footprint);
    if (!b.link) {
      const claimed = new Set<Corpse>();
      for (const other of this.buildingsById.values()) if (other.link) claimed.add(other.link);
      const corpse = nearestWithin(center, claimed.size ? this.corpses.filter((c) => !claimed.has(c)) : this.corpses, COLLECTOR.range);
      if (!corpse) return;
      b.link = corpse;
      b.linkDuration = b.cooldown = this.buildRng.range(COLLECTOR.cooldownMin, COLLECTOR.cooldownMax);
      return;
    }
    b.cooldown = Math.max(0, b.cooldown - dt);
    if (b.cooldown > 0) return;
    const corpse = b.link;
    b.link = undefined;
    if (this.harvest?.corpse === corpse) this.harvest = undefined;
    this.events.emit('collector:collected', { fromX: center.x, fromY: center.y, toX: corpse.x, toY: corpse.y });
    this.collectCorpse(corpse);
  }

  /** True while the player stands at an Altar: their edge within 0.5 tile of its footprint (section 10.1). */
  atAltar(): boolean {
    for (const b of this.buildingsById.values()) {
      if (b.kind !== 'altar') continue;
      if (distanceToFootprint(this.player.x, this.player.y, b.footprint) - PLAYER.radius <= CRAFTING.altarReach + 1e-6) return true;
    }
    return false;
  }

  /** Why an item cannot be crafted right now, or undefined. */
  craftProblem(id: GearId): string | undefined {
    return craftProblem(id, this.gear, (cost) => this.resources.canAfford(cost), this.atAltar());
  }

  /**
   * Crafts an item: pays its recipe once and unlocks it for the rest of the run. If its slot is
   * empty it is equipped right away. Returns the reason it could not be crafted, or undefined.
   */
  craft(id: GearId): string | undefined {
    const problem = this.craftProblem(id);
    if (problem) return problem;
    this.spend(gearDef(id).recipe);
    this.gear.unlock(id);
    this.events.emit('gear:crafted', { id });
    if (!this.gear.equipped[gearDef(id).slot]) this.equip(id);
    return undefined;
  }

  /** Equips an unlocked item (free, any time). Returns false if it is not unlocked. */
  equip(id: GearId): boolean {
    if (!this.gear.equip(id)) return false;
    this.refreshStats();
    this.events.emit('gear:equipped', { slot: gearDef(id).slot, id });
    return true;
  }

  unequip(slot: GearSlot): void {
    this.gear.unequip(slot);
    this.refreshStats();
    this.events.emit('gear:equipped', { slot, id: undefined });
  }

  /** Debug: unlock every item. */
  unlockAllGear(): void {
    for (const g of GEAR) this.gear.unlock(g.id);
  }

  /**
   * Recomputes stats from equipped gear. A higher max keeps current HP/mana as they are; a lower
   * max clamps them (section 10.3).
   */
  private refreshStats(): void {
    this.stats = computeStats(baseStats(), this.gear.modifiers());
    this.player.maxHp = this.stats.maxHp;
    this.player.maxMana = this.stats.maxMana;
    this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    this.player.mana = Math.min(this.player.mana, this.player.maxMana);
  }

  /** Night light sources besides the player: Grave Lanterns. */
  lanterns(): Point[] {
    const out: Point[] = [];
    for (const b of this.buildingsById.values()) if (b.kind === 'lantern') out.push(footprintCenter(b.footprint));
    return out;
  }

  /** The 16 tiles bordering the Phylactery, where the player cannot build (section 10.4). */
  isNoBuildZone(tileX: number, tileY: number): boolean {
    return this.noBuildZone.has(tileKey(tileX, tileY));
  }

  /**
   * Applies a terrain edit (player-made marsh, or filling marsh to dirt) if it is allowed and
   * affordable, paying its cost (no refunds). Returns the reason it is not, or undefined.
   */
  editTerrain(edit: TerrainEdit, tileX: number, tileY: number): string | undefined {
    const problem = terrainEditProblem(edit, tileX, tileY, {
      getTile: (x, y) => this.map.getTile(x, y),
      isBuilding: (x, y) => this.buildings.has(x, y),
      isNoBuildZone: (x, y) => this.isNoBuildZone(x, y),
    });
    if (problem) return problem;
    if (!this.spend(TERRAIN_EDITS[edit].cost)) return 'Not enough resources';
    const tile = terrainEditResult(edit);
    this.map.setTile(tileX, tileY, tile);
    this.events.emit('tile:changed', { tileX, tileY, tile });
    return undefined;
  }

  get score(): number {
    return computeScore(this.cycle.state.day, this.kills, this.buildingsLost);
  }

  /** Adds resources (up to their caps). Returns what was actually added. */
  gain(amounts: ResourceAmounts): ResourceAmounts {
    const added: ResourceAmounts = {};
    for (const id of RESOURCE_ORDER) {
      const n = this.resources.add(id, amounts[id] ?? 0);
      if (n > 0) {
        added[id] = n;
        this.events.emit('resources:changed', { id, delta: n, total: this.resources.get(id) });
      }
    }
    return added;
  }

  /** Spends a whole cost, or nothing if it cannot be afforded. */
  spend(cost: ResourceAmounts): boolean {
    if (!this.resources.spend(cost)) return false;
    for (const id of RESOURCE_ORDER) {
      const n = cost[id] ?? 0;
      if (n > 0) this.events.emit('resources:changed', { id, delta: -n, total: this.resources.get(id) });
    }
    return true;
  }

  /** The corpse the harvest key would start on: the nearest within range, if any. */
  harvestCandidate(): Corpse | undefined {
    let best: Corpse | undefined;
    let bestD: number = HARVEST.range;
    for (const c of this.corpses) {
      const d = Math.hypot(c.x - this.player.x, c.y - this.player.y);
      if (d <= bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  tick(dt: number, command: PlayerCommand): void {
    if (this.outcome) return;
    this.cycle.advance(dt);
    if (this.outcome) return;
    if (this.playerDead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
    } else {
      updatePlayer(this.player, command.move, command.aim, dt, this.playerTerrain, this.stats.manaRegen);
      if (this.nearAltar()) this.player.mana = Math.min(this.player.maxMana, this.player.mana + ALTAR.manaRegenAura * dt);
      this.updateRepair(dt, command.repair ?? false);
      if (command.bolt) {
        const bolt = tryCastBolt(this.player, command.aim, this.stats);
        if (bolt) {
          this.projectiles.push(bolt);
          this.events.emit('bolt:cast', { source: 'player', x: this.player.x, y: this.player.y });
        }
      }
      if (command.chain) this.castChain(command.aim);
      if (command.mend) this.castMend();
      this.updateHarvest(dt, command.harvest ?? false);
    }
    this.updateLanternAura(dt);
    this.expireCorpses();
    this.generateChunks();

    this.fields.trackPlayer(Math.floor(this.player.x), Math.floor(this.player.y));
    this.lastFieldRebuild = this.fields.update();

    for (const request of this.director.update(dt, this.spawnWorld())) {
      this.spawnEnemy(request.type, request.x, request.y, request.elite);
    }

    this.enemyHash.clear();
    for (const enemy of this.enemies) this.enemyHash.insert(enemy);
    this.updateBuildings(dt);
    this.updateProjectiles(dt);
    for (const enemy of this.enemies) {
      if (enemy.alive) this.updateEnemy(enemy, dt);
      if (this.outcome) return;
    }
    this.updateEnemyShots(dt);
    if (this.outcome) return;
    this.removeGoneEnemies();
  }

  /** Deals damage to an enemy; it dies at 0 HP. */
  damageEnemy(enemy: Enemy, amount: number): void {
    if (!enemy.alive) return;
    enemy.hp = Math.max(0, enemy.hp - amount);
    this.events.emit('enemy:damaged', { id: enemy.id, x: enemy.x, y: enemy.y, amount, hp: enemy.hp });
    if (enemy.hp > 0) return;
    enemy.alive = false;
    this.kills++;
    this.killsByType[enemy.type]++;
    this.events.emit('enemy:died', { id: enemy.id, type: enemy.type, elite: enemy.elite, x: enemy.x, y: enemy.y });
    this.spawnCorpse(enemy);
  }

  private spawnCorpse(enemy: Enemy): void {
    const now = this.cycle.elapsed;
    const corpse: Corpse = {
      id: this.nextCorpseId++,
      x: enemy.x,
      y: enemy.y,
      enemyType: enemy.type,
      size: enemy.def.corpseSize,
      elite: enemy.elite,
      heading: enemy.heading,
      createdAt: now,
      expiresAt: corpseExpiry(now),
      loot: rollLoot(enemy.def.corpseSize, enemy.elite, this.lootRng),
    };
    this.corpses.push(corpse);
    this.events.emit('corpse:spawned', { id: corpse.id, x: corpse.x, y: corpse.y, size: corpse.size, elite: corpse.elite });
  }

  private expireCorpses(): void {
    const now = this.cycle.elapsed;
    let write = 0;
    for (const c of this.corpses) if (c.expiresAt > now) this.corpses[write++] = c;
    this.corpses.length = write;
    if (this.harvest && this.harvest.corpse.expiresAt <= now) this.interruptHarvest('faded');
  }

  /**
   * Harvesting (section 9.3): pressing or holding the key starts on the nearest corpse in
   * range. It completes after the size's duration unless the player takes damage, moves out
   * of range, or the corpse fades. While the key is held, the next corpse starts right away.
   */
  private updateHarvest(dt: number, keyDown: boolean): void {
    if (!this.harvest && keyDown) {
      const corpse = this.harvestCandidate();
      if (corpse) {
        this.harvest = { corpse, progress: 0, duration: HARVEST.duration[corpse.size] };
        this.events.emit('harvest:started', { id: corpse.id });
      }
    }
    const h = this.harvest;
    if (!h) return;
    if (Math.hypot(h.corpse.x - this.player.x, h.corpse.y - this.player.y) > HARVEST.range) {
      this.interruptHarvest('moved');
      return;
    }
    h.progress += dt;
    if (h.progress < h.duration) return;
    this.harvest = undefined;
    this.collectCorpse(h.corpse);
  }

  /** Gives a corpse's loot and removes it. Used by harvesting (and Corpse Collectors in M7). */
  collectCorpse(corpse: Corpse): ResourceAmounts {
    const index = this.corpses.indexOf(corpse);
    if (index < 0) return {};
    this.corpses.splice(index, 1);
    const added = this.gain(corpse.loot);
    this.corpsesHarvested++;
    this.events.emit('corpse:harvested', { id: corpse.id, x: corpse.x, y: corpse.y, loot: added });
    return added;
  }

  private interruptHarvest(reason: 'damage' | 'moved' | 'faded'): void {
    if (!this.harvest) return;
    const id = this.harvest.corpse.id;
    this.harvest = undefined;
    this.events.emit('harvest:interrupted', { id, reason });
  }

  private castMend(): void {
    if (mendProblem(this.player, this.resources.get('flesh'))) return;
    this.spend({ flesh: MEND.fleshCost });
    startMend(this.player);
    this.events.emit('mend:cast', {});
  }

  spawnEnemy(type: EnemyId, x: number, y: number, elite: boolean): Enemy {
    const enemy = createEnemy(this.nextEnemyId++, type, x, y, elite);
    enemy.heading = Math.atan2(this.player.y - y, this.player.x - x);
    this.enemies.push(enemy);
    this.events.emit('enemy:spawned', { id: enemy.id, type, elite });
    return enemy;
  }

  /** Counts by enemy type (plus elites), for the debug readout. */
  enemyCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const e of this.enemies) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      if (e.elite) counts.elite = (counts.elite ?? 0) + 1;
    }
    return counts;
  }

  private generateChunks(): void {
    for (const chunk of this.map.ensureAround(this.player.x, this.player.y, CHUNK_GENERATION_RADIUS)) {
      this.events.emit('chunk:generated', { chunkX: chunk.chunkX, chunkY: chunk.chunkY });
    }
  }

  private spawnWorld(): SpawnWorld {
    return {
      day: this.cycle.state.day,
      nightBlend: this.cycle.nightBlend,
      activeEnemies: this.enemies.length,
      player: this.viewCenter(),
      phylactery: this.phylactery.center,
      camera: this.viewCenter(),
      isGenerated: (tx, ty) => this.map.getTile(tx, ty) !== undefined,
      isRock: (tx, ty) => this.map.getTile(tx, ty) === TILE.rock,
      isBuilding: (tx, ty) => this.buildings.has(tx, ty),
      isNoSpawn: (tx, ty) => this.noSpawn.isBlocked(tx, ty),
    };
  }

  private updateEnemy(enemy: Enemy, dt: number): void {
    const def = enemy.def;
    const ground = def.movement === 'ground';
    // Field-following ground enemies path around obstacles; 'direct' ones (Shamblers) just walk at the target.
    const usesField = ground && def.navigation === 'field';
    enemy.prevX = enemy.x;
    enemy.prevY = enemy.y;
    if (enemy.fadeIn > 0) {
      enemy.fadeIn = Math.max(0, enemy.fadeIn - dt);
      return;
    }
    if (!ground) {
      this.updateFlyer(enemy, dt);
      return;
    }
    const tileX = Math.floor(enemy.x);
    const tileY = Math.floor(enemy.y);
    const fp = this.phylactery.footprint;

    // Distances to each target: path cost inside a field window, straight line otherwise.
    // A dead (respawning) necromancer is not a target.
    const straightToPlayer = this.playerDead ? Infinity : Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y);
    const straightToPhylactery = distanceToFootprint(enemy.x, enemy.y, fp);
    let toPlayer = straightToPlayer;
    let toPhylactery = straightToPhylactery;
    if (usesField) {
      const fieldPlayer = this.fields.player.distanceAt(tileX, tileY);
      const fieldPhylactery = this.fields.phylactery.distanceAt(tileX, tileY);
      // Stuck: inside both windows with no path to either target (a sealed rock pocket).
      if (fieldPlayer === Infinity && fieldPhylactery === Infinity) {
        enemy.alive = false;
        return;
      }
      if (fieldPlayer !== undefined && !this.playerDead) toPlayer = fieldPlayer;
      if (fieldPhylactery !== undefined) toPhylactery = fieldPhylactery;
    }
    enemy.target = chooseTarget(enemy.target === 'lantern' ? undefined : enemy.target, { player: toPlayer, phylactery: toPhylactery });

    // Attack the target when in range.
    const inRange =
      enemy.target === 'player'
        ? straightToPlayer <= def.range
        : straightToPhylactery <= def.range - def.radius;
    if (inRange) {
      const aim = enemy.target === 'player' ? this.player : nearestPointOnFootprint(enemy.x, enemy.y, fp);
      enemy.heading = Math.atan2(aim.y - enemy.y, aim.x - enemy.x);
      if (enemy.target === 'player') this.attack(enemy, dt, () => this.damagePlayer(enemy.damage));
      else this.attack(enemy, dt, () => this.damageBuilding(PHYLACTERY_ID, enemy));
      return;
    }
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);

    const field: FlowField = this.fields.field(enemy.target === 'player' ? 'player' : 'phylactery');

    const aimPoint = enemy.target === 'player' ? this.player : nearestPointOnFootprint(enemy.x, enemy.y, fp);

    // A building on the next step of the path is attacked until it is destroyed (section 7).
    // Direct walkers check the tile straight ahead toward their target instead.
    if (ground) {
      const step = usesField ? field.directionAt(tileX, tileY) : directStep(enemy, aimPoint);
      if (step) {
        const nextX = tileX + Math.round(step.x);
        const nextY = tileY + Math.round(step.y);
        const blocking = this.buildings.buildingAt(nextX, nextY);
        if (blocking !== undefined) {
          const tile: Footprint = { x: nextX, y: nextY, w: 1, h: 1 };
          if (distanceToFootprint(enemy.x, enemy.y, tile) <= def.range - def.radius) {
            enemy.heading = Math.atan2(nextY + 0.5 - enemy.y, nextX + 0.5 - enemy.x);
            this.attack(enemy, dt, () => this.damageBuilding(blocking, enemy));
            return;
          }
        }
      }
    }

    // Desired direction: the smoothed field, or straight at the target.
    let desired = usesField ? field.sample(enemy.x, enemy.y) : undefined;
    if (!desired) {
      const dx = aimPoint.x - enemy.x;
      const dy = aimPoint.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      desired = { x: dx / d, y: dy / d };
    }
    if (def.wiggle) desired = rotate(desired, wiggleAngle(enemy.id, this.cycle.elapsed, def.wiggle));
    const push = separation(enemy, this.enemyHash, this.neighbors);
    // Marsh (wild or player-made) slows ground demons the same as the player. Flying ignores it.
    const speed = ground ? def.speed * groundSpeedMultiplier(this.map.getTile(tileX, tileY)) : def.speed;
    steer(
      enemy,
      { x: desired.x + push.x * NAV.separationWeight, y: desired.y + push.y * NAV.separationWeight },
      speed,
      def.radius,
      dt,
      ground ? this.groundBlocked : undefined,
    );
  }

/**
   * Flying enemies (Wraiths, section 7): fly straight at a target, ignoring walls and rock. They
   * choose between the player, the Phylactery, and Grave Lanterns by straight-line distance, with
   * a Lantern's distance halved (aggroWeight 2), and switch only when another is clearly closer.
   * In range they stop and fire slow shots.
   */
  private updateFlyer(enemy: Enemy, dt: number): void {
    const def = enemy.def;
    type Option = { kind: 'player' | 'phylactery' | 'lantern'; id?: number; point: Point; dist: number; score: number };
    const options: Option[] = [];
    if (!this.playerDead) {
      const d = Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y);
      options.push({ kind: 'player', point: this.player, dist: d, score: d });
    }
    const fp = this.phylactery.footprint;
    const pd = distanceToFootprint(enemy.x, enemy.y, fp);
    options.push({ kind: 'phylactery', point: nearestPointOnFootprint(enemy.x, enemy.y, fp), dist: pd, score: pd });
    for (const b of this.buildingsById.values()) {
      if (b.kind !== 'lantern') continue;
      const c = footprintCenter(b.footprint);
      const d = Math.hypot(c.x - enemy.x, c.y - enemy.y);
      options.push({ kind: 'lantern', id: b.id, point: c, dist: d, score: d / LANTERN.aggroWeight });
    }
    const best = options.reduce((a, b) => (b.score < a.score ? b : a));
    const current = options.find((o) => o.kind === enemy.target && (o.kind !== 'lantern' || o.id === enemy.targetLanternId));
    const pick = current && !(best.score < NAV.targetSwitchRatio * current.score) ? current : best;
    enemy.target = pick.kind;
    enemy.targetLanternId = pick.id;

    if (pick.dist <= def.range) {
      enemy.heading = Math.atan2(pick.point.y - enemy.y, pick.point.x - enemy.x);
      enemy.attackCooldown -= dt;
      if (enemy.attackCooldown <= 0) {
        enemy.attackCooldown = def.attackInterval;
        this.fireShot(enemy, pick.point);
      }
      return;
    }
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    const dx = pick.point.x - enemy.x;
    const dy = pick.point.y - enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    const push = separation(enemy, this.enemyHash, this.neighbors);
    steer(
      enemy,
      { x: dx / d + push.x * NAV.separationWeight, y: dy / d + push.y * NAV.separationWeight },
      def.speed,
      def.radius,
      dt,
      undefined,
    );
  }

  private fireShot(enemy: Enemy, at: Point): void {
    const speed = (enemy.def.projectileSpeed ?? 96) / 32;
    const dx = at.x - enemy.x;
    const dy = at.y - enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    this.enemyShots.push({
      x: enemy.x,
      y: enemy.y,
      prevX: enemy.x,
      prevY: enemy.y,
      vx: (dx / d) * speed,
      vy: (dy / d) * speed,
      life: ENEMY_SHOT.lifetime,
      damage: enemy.damage,
      buildingDamage: enemy.damage * enemy.def.buildingDamageMultiplier,
      alive: true,
    });
    this.events.emit('enemy:fired', { x: enemy.x, y: enemy.y, elite: enemy.elite });
  }

  /** Shots fly straight, pass over rock, hit the player, or are blocked by the first building they touch. */
  private updateEnemyShots(dt: number): void {
    for (const shot of this.enemyShots) {
      shot.prevX = shot.x;
      shot.prevY = shot.y;
      const stepLength = Math.hypot(shot.vx, shot.vy) * dt;
      const steps = Math.max(1, Math.ceil(stepLength / 0.2));
      for (let i = 0; i < steps && shot.alive; i++) {
        shot.x += (shot.vx * dt) / steps;
        shot.y += (shot.vy * dt) / steps;
        if (!this.playerDead && Math.hypot(shot.x - this.player.x, shot.y - this.player.y) <= PLAYER.radius + ENEMY_SHOT.radius) {
          shot.alive = false;
          this.damagePlayer(shot.damage);
          break;
        }
        const building = this.buildings.buildingAt(Math.floor(shot.x), Math.floor(shot.y));
        if (building !== undefined) {
          shot.alive = false;
          this.damageBuildingBy(building, shot.buildingDamage);
        }
      }
      shot.life -= dt;
      if (shot.life <= 0) shot.alive = false;
      if (this.outcome) return;
    }
    let write = 0;
    for (const s of this.enemyShots) if (s.alive) this.enemyShots[write++] = s;
    this.enemyShots.length = write;
  }

  private castChain(cursor: Point): void {
    const targets = tryCastChain(this.player, cursor, this.enemies.filter((e) => e.alive && e.fadeIn <= 0), this.stats);
    if (targets.length === 0) return;
    // Record positions before damage, so the visual links the enemies where they were hit.
    const points = [{ x: this.player.x, y: this.player.y }, ...targets.map((e) => ({ x: e.x, y: e.y }))];
    targets.forEach((enemy, i) => this.damageEnemy(enemy, chainDamage(i, this.stats.chainDamage)));
    this.events.emit('chain:cast', { points });
  }

  private updateProjectiles(dt: number): void {
    const solid = (tx: number, ty: number) => !isWalkableTile(this.map.getTile(tx, ty));
    const nearby: Enemy[] = [];
    for (const bolt of this.projectiles) {
      const reach = Math.hypot(bolt.vx, bolt.vy) * dt + bolt.radius + 1;
      nearby.length = 0;
      this.enemyHash.queryRadius(bolt.x, bolt.y, reach, nearby);
      const candidates = nearby.filter((e) => e.alive && e.fadeIn <= 0).map((e) => ({ x: e.x, y: e.y, radius: e.def.radius, enemy: e }));
      const hit = stepBolt(bolt, dt, candidates, solid);
      if (hit) this.damageEnemy(hit.enemy, bolt.damage);
    }
    let write = 0;
    for (const bolt of this.projectiles) if (bolt.alive) this.projectiles[write++] = bolt;
    this.projectiles.length = write;
  }

  /** Counts down the attack cooldown and lands a hit when it is ready. */
  private attack(enemy: Enemy, dt: number, hit: () => void): void {
    enemy.attackCooldown -= dt;
    if (enemy.attackCooldown > 0) return;
    enemy.attackCooldown = enemy.def.attackInterval;
    this.events.emit('enemy:attacked', {
      x: enemy.x,
      y: enemy.y,
      angle: enemy.heading,
      size: enemy.def.drawSize,
      elite: enemy.elite,
    });
    hit();
  }

  private damagePlayer(amount: number): void {
    if (this.godMode || this.player.invulnerable > 0 || this.playerDead) return;
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.player.invulnerable = PLAYER.invulnerability;
    this.events.emit('player:damaged', { amount, hp: this.player.hp });
    this.interruptHarvest('damage');
    if (this.player.hp <= 0) {
      if (this.completed) this.die();
      else this.lose('player');
    }
  }

  /** An enemy hits a building. Player buildings arrive in M7; until then only the Phylactery exists. */
  private damageBuilding(buildingId: number, enemy: Enemy): void {
    this.damageBuildingBy(buildingId, enemy.damage * enemy.def.buildingDamageMultiplier);
  }

  private damageBuildingBy(buildingId: number, amount: number): void {
    if (buildingId === PHYLACTERY_ID) {
      if (this.godMode) return;
      this.phylactery.hp = Math.max(0, this.phylactery.hp - amount);
      this.events.emit('phylactery:damaged', { amount, hp: this.phylactery.hp });
      if (this.phylactery.hp <= 0 && this.phylacteryLossEnabled) this.lose('phylactery');
      return;
    }
    const building = this.buildingsById.get(buildingId);
    if (!building) return;
    building.hp = Math.max(0, building.hp - amount);
    this.events.emit('building:damaged', { id: building.id, hp: building.hp });
    if (building.hp <= 0) this.destroyBuilding(building);
  }

  private lose(cause: RunOutcome['cause']): void {
    if (this.outcome) return;
    this.outcome = {
      cause,
      day: this.cycle.state.day,
      kills: this.kills,
      corpsesHarvested: this.corpsesHarvested,
      score: this.score,
    };
    this.events.emit('run:lost', this.outcome);
  }

  private removeGoneEnemies(): void {
    const player = this.viewCenter();
    const { phylactery } = this;
    let write = 0;
    for (const enemy of this.enemies) {
      const far =
        Math.hypot(enemy.x - player.x, enemy.y - player.y) > SPAWN.despawnDistance &&
        Math.hypot(enemy.x - phylactery.center.x, enemy.y - phylactery.center.y) > SPAWN.despawnDistance;
      if (enemy.alive && !far) this.enemies[write++] = enemy;
    }
    this.enemies.length = write;
  }
}

/** For direct walkers: the unit step (rounded to a tile neighbor) from the enemy's tile toward a point. */
function directStep(enemy: { x: number; y: number }, aim: Point): Point | undefined {
  const dx = aim.x - enemy.x;
  const dy = aim.y - enemy.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return undefined;
  // Snap to the 8 neighbors, like a flow field step.
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function rotate(v: Point, angle: number): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/**
 * A deterministic sway for an enemy's heading at run time `time`: two out-of-step sine waves
 * with a per-enemy phase, so a crowd does not sway in unison. At most `strength` radians.
 */
export function wiggleAngle(enemyId: number, time: number, wiggle: { strength: number; speed: number }): number {
  const phase = (hashInts(enemyId, 0x3177) / 4294967296) * Math.PI * 2;
  const phase2 = (hashInts(enemyId, 0x3178) / 4294967296) * Math.PI * 2;
  const t = time * wiggle.speed * Math.PI * 2;
  return wiggle.strength * (0.65 * Math.sin(t + phase) + 0.35 * Math.sin(t * 2.3 + phase2));
}
