// The simulation for one run: world, time, player, Phylactery, enemies, and spawning.
// main.ts owns the browser side (canvas, input, loop) and calls tick() at 60 Hz.

import { PHYLACTERY } from './data/buildings';
import { type EnemyId } from './data/enemies';
import { SPAWN } from './data/spawn';
import { CHUNK_GENERATION_RADIUS, CHUNK_SIZE, TILE } from './data/terrain';
import { NAV, PLAYER, SCORE } from './data/tuning';
import type { EventBus, GameEvents } from './core/events';
import type { Point } from './core/input';
import { hashInts, Rng } from './core/rng';
import { stepBolt, tryCastBolt } from './combat/bolt';
import { chooseTarget } from './combat/targeting';
import { SpawnDirector, type SpawnWorld } from './director/spawnDirector';
import { createEnemy, type Enemy } from './entities/enemy';
import { createPhylactery, PHYLACTERY_ID, phylacteryRingTiles, type Phylactery } from './entities/phylactery';
import { createPlayer, updatePlayer, type MoveIntent, type Player, type PlayerTerrain } from './entities/player';
import type { Projectile } from './entities/projectile';
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
  /** Bolt button held. */
  bolt: boolean;
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
  readonly buildings = new BuildingGrid();
  readonly noSpawn = new NoSpawnGrid();
  readonly fields: FlowFields;
  readonly director: SpawnDirector;
  readonly enemies: Enemy[] = [];
  readonly enemyHash = new SpatialHash<Enemy>(NAV.hashCellSize);
  readonly projectiles: Projectile[] = [];
  kills = 0;
  /** Buildings destroyed by demons, for the score. Player buildings arrive in M7. */
  buildingsLost = 0;
  /** Corpses harvested, for the end screen. Corpses arrive in M6. */
  corpsesHarvested = 0;
  /** Debug: the player and the Phylactery take no damage. */
  godMode = false;
  /** Whether the Phylactery reaching 0 HP ends the run (on from M9). */
  phylacteryLossEnabled: boolean = PHYLACTERY.destructionEndsRun;
  /** Set when the run is lost; the simulation stops. */
  outcome: RunOutcome | undefined;
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

  get score(): number {
    return computeScore(this.cycle.state.day, this.kills, this.buildingsLost);
  }

  tick(dt: number, command: PlayerCommand): void {
    if (this.outcome) return;
    this.cycle.advance(dt);
    updatePlayer(this.player, command.move, command.aim, dt, this.playerTerrain);
    if (command.bolt) {
      const bolt = tryCastBolt(this.player, command.aim);
      if (bolt) this.projectiles.push(bolt);
    }
    this.generateChunks();

    this.fields.trackPlayer(Math.floor(this.player.x), Math.floor(this.player.y));
    this.lastFieldRebuild = this.fields.update();

    for (const request of this.director.update(dt, this.spawnWorld())) {
      this.spawnEnemy(request.type, request.x, request.y, request.elite);
    }

    this.enemyHash.clear();
    for (const enemy of this.enemies) this.enemyHash.insert(enemy);
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
    steer(
      enemy,
      { x: desired.x + push.x * NAV.separationWeight, y: desired.y + push.y * NAV.separationWeight },
      def.speed,
      def.radius,
      dt,
      ground ? this.groundBlocked : undefined,
    );
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
    }
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
