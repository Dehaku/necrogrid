// The simulation for one run: world, time, player, Phylactery, enemies, and spawning.
// main.ts owns the browser side (canvas, input, loop) and calls tick() at 60 Hz.

import { PHYLACTERY } from './data/buildings';
import { type EnemyId } from './data/enemies';
import { SPAWN } from './data/spawn';
import { CHUNK_GENERATION_RADIUS, CHUNK_SIZE, TILE } from './data/terrain';
import { NAV, PLAYER } from './data/tuning';
import type { EventBus, GameEvents } from './core/events';
import type { Point } from './core/input';
import { hashInts, Rng } from './core/rng';
import { chooseTarget } from './combat/targeting';
import { SpawnDirector, type SpawnWorld } from './director/spawnDirector';
import { createEnemy, type Enemy } from './entities/enemy';
import { createPhylactery, PHYLACTERY_ID, phylacteryRingTiles, type Phylactery } from './entities/phylactery';
import { createPlayer, updatePlayer, type MoveIntent, type Player, type PlayerTerrain } from './entities/player';
import { DayCycle } from './time/dayCycle';
import { BuildingGrid } from './world/buildingGrid';
import { ChunkMap } from './world/chunks';
import { FlowFields, type FlowField, type GoalId } from './world/flowField';
import {
  distanceToFootprint,
  isWalkableTile,
  nearestPointOnFootprint,
  playerSpeedMultiplier,
  type Footprint,
} from './world/grid';
import { separation, steer } from './world/navigation';
import { NoSpawnGrid } from './world/noSpawnGrid';
import { SpatialHash } from './world/spatialHash';

/** Separate RNG stream for spawning, so other systems never shift spawn rolls. */
const SPAWN_STREAM = 0x5370;

export interface PlayerCommand {
  move: MoveIntent;
  /** Aim point in world tiles. */
  aim: Point;
}

export class Game {
  readonly map: ChunkMap;
  readonly cycle: DayCycle;
  readonly player: Player;
  readonly phylactery: Phylactery;
  readonly buildings = new BuildingGrid();
  readonly noSpawn = new NoSpawnGrid();
  readonly fields: FlowFields;
  readonly director: SpawnDirector;
  readonly enemies: Enemy[] = [];
  readonly enemyHash = new SpatialHash<Enemy>(NAV.hashCellSize);
  /** Debug: which field rebuilt this tick, if any. */
  lastFieldRebuild: GoalId | undefined;

  private nextEnemyId = 1;
  private readonly neighbors: Enemy[] = [];
  private readonly playerTerrain: PlayerTerrain;
  private readonly groundBlocked = (tx: number, ty: number): boolean =>
    !isWalkableTile(this.map.getTile(tx, ty)) || this.buildings.has(tx, ty);

  constructor(
    readonly seed: number,
    readonly events: EventBus<GameEvents>,
  ) {
    this.map = new ChunkMap(seed);
    this.cycle = new DayCycle(events);
    this.player = createPlayer(PLAYER.startTile.x, PLAYER.startTile.y);
    this.phylactery = createPhylactery();
    this.buildings.place(PHYLACTERY_ID, this.phylactery.footprint);
    this.noSpawn.add(this.phylactery.footprint, PHYLACTERY.noSpawnRadius);

    this.fields = new FlowFields(
      {
        isWalkable: (tx, ty) => isWalkableTile(this.map.getTile(tx, ty)),
        isBuilding: (tx, ty) => this.buildings.has(tx, ty),
      },
      { x: 0, y: 0 },
      phylacteryRingTiles(this.phylactery.footprint),
    );
    this.director = new SpawnDirector(new Rng(hashInts(seed, SPAWN_STREAM)));

    this.playerTerrain = {
      speedMultiplierAt: (x, y) => playerSpeedMultiplier(this.map.getTile(Math.floor(x), Math.floor(y))),
      isBlocked: this.groundBlocked,
    };

    events.on('chunk:generated', ({ chunkX, chunkY }) =>
      this.fields.chunkGenerated(chunkX * CHUNK_SIZE, chunkY * CHUNK_SIZE, CHUNK_SIZE),
    );
    this.generateChunks();
  }

  tick(dt: number, command: PlayerCommand): void {
    this.cycle.advance(dt);
    updatePlayer(this.player, command.move, command.aim, dt, this.playerTerrain);
    this.generateChunks();

    this.fields.trackPlayer(Math.floor(this.player.x), Math.floor(this.player.y));
    this.lastFieldRebuild = this.fields.update();

    for (const request of this.director.update(dt, this.spawnWorld())) {
      this.spawnEnemy(request.type, request.x, request.y, request.elite);
    }

    this.enemyHash.clear();
    for (const enemy of this.enemies) this.enemyHash.insert(enemy);
    for (const enemy of this.enemies) this.updateEnemy(enemy, dt);
    this.removeGoneEnemies();
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
    steer(
      enemy,
      { x: desired.x + push.x * NAV.separationWeight, y: desired.y + push.y * NAV.separationWeight },
      def.speed,
      def.radius,
      dt,
      ground ? this.groundBlocked : undefined,
    );
  }

  /** Counts down the attack cooldown and lands a hit when it is ready. */
  private attack(enemy: Enemy, dt: number, hit: () => void): void {
    enemy.attackCooldown -= dt;
    if (enemy.attackCooldown > 0) return;
    enemy.attackCooldown = enemy.def.attackInterval;
    hit();
  }

  private damagePlayer(amount: number): void {
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.events.emit('player:damaged', { amount, hp: this.player.hp });
  }

  /** An enemy hits a building. Player buildings arrive in M7; until then only the Phylactery exists. */
  private damageBuilding(buildingId: number, enemy: Enemy): void {
    const amount = enemy.damage * enemy.def.buildingDamageMultiplier;
    if (buildingId === PHYLACTERY_ID) {
      this.phylactery.hp = Math.max(0, this.phylactery.hp - amount);
      this.events.emit('phylactery:damaged', { amount, hp: this.phylactery.hp });
    }
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
