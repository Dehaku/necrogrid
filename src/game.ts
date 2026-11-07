// The simulation for one run: world, time, player, Phylactery, enemies, and spawning.
// main.ts owns the browser side (canvas, input, loop) and calls tick() at 60 Hz.

import { ALTAR, BUILD_RULES, BUILDINGS, COLLECTOR, PHYLACTERY, TERRAIN_EDITS, TOTEM, type BuildingKind } from './data/buildings';
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
import { NAV, PLAYER, SCORE } from './data/tuning';
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
  readonly resources = new Resources();
  /** Unlocked and equipped gear (section 10.3). */
  readonly gear = new GearState();
  /** The player's stats with equipped gear applied. */
  stats: Stats = baseStats();
  /** In creation order (oldest first). */
  readonly corpses: Corpse[] = [];
  harvest: HarvestState | undefined;
  kills = 0;
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
    return !(this.buildingsById.get(id)?.def.playerPassable ?? false);
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
    this.generateChunks();
    if (options.startingBase ?? true) this.buildStartingBase();
  }

  /** Section 10.5: free walls on the ring 2 tiles out (60% each, never closed), then one Totem 3 tiles out. */
  private buildStartingBase(): void {
    const plan = planStartingBase(
      this.buildRng,
      this.phylactery.footprint,
      { x: PLAYER.startTile.x, y: PLAYER.startTile.y },
      (t) => placementProblem({ x: t.x, y: t.y, w: 1, h: 1 }, this.placementWorld(), true) === undefined,
    );
    for (const w of plan.walls) this.placeBuilding('wall', w.x, w.y, { free: true });
    if (plan.totem) this.placeBuilding('totem', plan.totem.x, plan.totem.y, { free: true });
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
  placeBuilding(kind: BuildingKind, x: number, y: number, options: { free?: boolean; ignoreNoBuildZone?: boolean } = {}): Building | string {
    const def = BUILDINGS[kind];
    const fp: Footprint = { x, y, w: def.w, h: def.h };
    const problem = placementProblem(fp, this.placementWorld(), options.ignoreNoBuildZone ?? false);
    if (problem) return problem;
    const free = options.free ?? false;
    if (!free && !this.spend(def.cost)) return 'Not enough resources';
    const building = createBuilding(this.nextBuildingId++, kind, x, y, free);
    if (kind === 'collector') building.cooldown = this.buildRng.range(COLLECTOR.cooldownMin, COLLECTOR.cooldownMax);
    this.buildingsById.set(building.id, building);
    this.buildings.place(building.id, fp);
    this.noSpawn.add(fp, def.noSpawnRadius);
    this.fields.markAllDirty();
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
      b.cooldown = Math.max(0, b.cooldown - dt);
      if (b.cooldown > 0) continue;
      const center = footprintCenter(b.footprint);
      if (b.kind === 'totem') {
        const nearby = this.enemyHash.queryRadius(center.x, center.y, TOTEM.range).filter((e) => e.alive);
        const target = nearestWithin(center, nearby, TOTEM.range);
        if (!target) continue;
        this.projectiles.push(totemBolt(center, target));
        b.cooldown = TOTEM.interval;
      } else if (b.kind === 'collector') {
        const corpse = nearestWithin(center, this.corpses, COLLECTOR.range);
        if (!corpse) continue;
        if (this.harvest?.corpse === corpse) this.harvest = undefined;
        this.collectCorpse(corpse);
        b.cooldown = this.buildRng.range(COLLECTOR.cooldownMin, COLLECTOR.cooldownMax);
      }
    }
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
    updatePlayer(this.player, command.move, command.aim, dt, this.playerTerrain, this.stats.manaRegen);
    if (this.nearAltar()) this.player.mana = Math.min(this.player.maxMana, this.player.mana + ALTAR.manaRegenAura * dt);
    this.updateRepair(dt, command.repair ?? false);
    if (command.bolt) {
      const bolt = tryCastBolt(this.player, command.aim, this.stats);
      if (bolt) this.projectiles.push(bolt);
    }
    if (command.chain) this.castChain(command.aim);
    if (command.mend) this.castMend();
    this.updateHarvest(dt, command.harvest ?? false);
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
      player: this.player,
      phylactery: this.phylactery.center,
      camera: this.player,
      isGenerated: (tx, ty) => this.map.getTile(tx, ty) !== undefined,
      isRock: (tx, ty) => this.map.getTile(tx, ty) === TILE.rock,
      isBuilding: (tx, ty) => this.buildings.has(tx, ty),
      isNoSpawn: (tx, ty) => this.noSpawn.isBlocked(tx, ty),
    };
  }

  private updateEnemy(enemy: Enemy, dt: number): void {
    const def = enemy.def;
    const ground = def.movement === 'ground';
    enemy.prevX = enemy.x;
    enemy.prevY = enemy.y;
    const tileX = Math.floor(enemy.x);
    const tileY = Math.floor(enemy.y);
    const fp = this.phylactery.footprint;

    // Distances to each target: path cost inside a field window, straight line otherwise.
    const straightToPlayer = Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y);
    const straightToPhylactery = distanceToFootprint(enemy.x, enemy.y, fp);
    let toPlayer = straightToPlayer;
    let toPhylactery = straightToPhylactery;
    if (ground) {
      const fieldPlayer = this.fields.player.distanceAt(tileX, tileY);
      const fieldPhylactery = this.fields.phylactery.distanceAt(tileX, tileY);
      // Stuck: inside both windows with no path to either target (a sealed rock pocket).
      if (fieldPlayer === Infinity && fieldPhylactery === Infinity) {
        enemy.alive = false;
        return;
      }
      if (fieldPlayer !== undefined) toPlayer = fieldPlayer;
      if (fieldPhylactery !== undefined) toPhylactery = fieldPhylactery;
    }
    enemy.target = chooseTarget(enemy.target, { player: toPlayer, phylactery: toPhylactery });

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

    const field: FlowField = this.fields.field(enemy.target);

    // A building on the next step of the path is attacked until it is destroyed (section 7).
    if (ground) {
      const step = field.directionAt(tileX, tileY);
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
    let desired = ground ? field.sample(enemy.x, enemy.y) : undefined;
    if (!desired) {
      const aim = enemy.target === 'player' ? this.player : nearestPointOnFootprint(enemy.x, enemy.y, fp);
      const dx = aim.x - enemy.x;
      const dy = aim.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      desired = { x: dx / d, y: dy / d };
    }
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

  private castChain(cursor: Point): void {
    const targets = tryCastChain(this.player, cursor, this.enemies.filter((e) => e.alive), this.stats);
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
      const candidates = nearby.filter((e) => e.alive).map((e) => ({ x: e.x, y: e.y, radius: e.def.radius, enemy: e }));
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
    if (this.godMode || this.player.invulnerable > 0) return;
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.player.invulnerable = PLAYER.invulnerability;
    this.events.emit('player:damaged', { amount, hp: this.player.hp });
    this.interruptHarvest('damage');
    if (this.player.hp <= 0) this.lose('player');
  }

  /** An enemy hits a building. Player buildings arrive in M7; until then only the Phylactery exists. */
  private damageBuilding(buildingId: number, enemy: Enemy): void {
    const amount = enemy.damage * enemy.def.buildingDamageMultiplier;
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
    const { player, phylactery } = this;
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
