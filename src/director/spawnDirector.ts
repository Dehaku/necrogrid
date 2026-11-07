// Spawn director: when, where, and what to spawn. GAME_DESIGN.md section 6.

import { ELITE, ENEMIES, type EnemyId } from '../data/enemies';
import { SPAWN } from '../data/spawn';
import { TILE_SIZE, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { Point } from '../core/input';
import type { Rng } from '../core/rng';

export type SpawnAnchor = 'player' | 'phylactery';

/** What the director needs to know about the world this tick. */
export interface SpawnWorld {
  day: number;
  /** 0 by day, 1 at night, blending at dusk and dawn. */
  nightBlend: number;
  activeEnemies: number;
  player: Point;
  phylactery: Point;
  /** Center of the player's current view. */
  camera: Point;
  isGenerated(tileX: number, tileY: number): boolean;
  isRock(tileX: number, tileY: number): boolean;
  isBuilding(tileX: number, tileY: number): boolean;
  isNoSpawn(tileX: number, tileY: number): boolean;
}

export interface SpawnRequest {
  type: EnemyId;
  elite: boolean;
  /** World position (tile center). */
  x: number;
  y: number;
  anchor: SpawnAnchor;
}

/** A tried pack center, kept briefly for the debug overlay. */
export interface SpawnAttempt {
  x: number;
  y: number;
  ok: boolean;
  /** Director time when tried. */
  at: number;
}

const ATTEMPT_MEMORY = 5;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** How much more spawns on a day than on day 1, for every enemy type and phase. */
export function dailyGrowth(day: number): number {
  return Math.min(1 + SPAWN.dailyGrowth * (day - 1), SPAWN.growthCap);
}

/** Enemies per second for a day and night blend. */
export function spawnRate(day: number, nightBlend: number): number {
  return lerp(SPAWN.dayRateBase, SPAWN.nightRate, nightBlend) * dailyGrowth(day);
}

/** Most enemies alive at once on a day. */
export function activeEnemyCap(day: number): number {
  return Math.min(SPAWN.maxActiveEnemies + SPAWN.maxActivePerDay * (day - 1), SPAWN.maxActiveCap);
}

/** Spawn weights for the active roster, blended by phase, without enemies below their minDay. */
export function rosterWeights(day: number, nightBlend: number): { type: EnemyId; weight: number }[] {
  const out: { type: EnemyId; weight: number }[] = [];
  for (const type of SPAWN.activeRoster) {
    const def = ENEMIES[type];
    if (day < def.minDay) continue;
    const weight = lerp(def.spawnWeightDay, def.spawnWeightNight, nightBlend);
    if (weight > 0) out.push({ type, weight });
  }
  return out;
}

function pickWeighted(rng: Rng, weights: readonly { type: EnemyId; weight: number }[]): EnemyId | undefined {
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  if (total <= 0) return undefined;
  let roll = rng.next() * total;
  for (const w of weights) {
    roll -= w.weight;
    if (roll < 0) return w.type;
  }
  return weights[weights.length - 1]?.type;
}

/** True if a tile is outside the player's view plus the margin. */
export function isOffScreen(tileX: number, tileY: number, camera: Point): boolean {
  const halfW = VIEW_WIDTH / TILE_SIZE / 2 + SPAWN.offscreenMargin;
  const halfH = VIEW_HEIGHT / TILE_SIZE / 2 + SPAWN.offscreenMargin;
  return Math.abs(tileX + 0.5 - camera.x) > halfW || Math.abs(tileY + 0.5 - camera.y) > halfH;
}

/** The section 6 spawn checks for one tile. Flying enemies may spawn over rock. */
export function canSpawnAt(tileX: number, tileY: number, flying: boolean, world: SpawnWorld): boolean {
  if (!world.isGenerated(tileX, tileY)) return false;
  if (!flying && world.isRock(tileX, tileY)) return false;
  if (world.isBuilding(tileX, tileY)) return false;
  if (world.isNoSpawn(tileX, tileY)) return false;
  return isOffScreen(tileX, tileY, world.camera);
}

/** Tile offsets within the member search square, nearest first. */
const MEMBER_OFFSETS: readonly Point[] = (() => {
  const r = SPAWN.memberSearchRadius;
  const offsets: Point[] = [];
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) offsets.push({ x, y });
  return offsets.sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
})();

export class SpawnDirector {
  budget = 0;
  /** Debug: stop spawning. */
  paused = false;
  /** Recently tried pack centers, for the debug overlay. */
  readonly attempts: SpawnAttempt[] = [];
  private time = 0;
  private retryTimer = 0;
  private nextPackSize: number | undefined;

  constructor(private readonly rng: Rng) {}

  get pendingPackSize(): number | undefined {
    return this.nextPackSize;
  }

  update(dt: number, world: SpawnWorld): SpawnRequest[] {
    this.time += dt;
    while (this.attempts.length > 0 && this.time - this.attempts[0]!.at > ATTEMPT_MEMORY) this.attempts.shift();
    if (this.paused) return [];

    const cap = activeEnemyCap(world.day);
    if (world.activeEnemies < cap) {
      this.budget = Math.min(this.budget + spawnRate(world.day, world.nightBlend) * dt, SPAWN.budgetCap);
    }
    if (this.retryTimer > 0) {
      this.retryTimer -= dt;
      return [];
    }
    this.nextPackSize ??= this.rollPackSize(world.nightBlend);
    if (this.budget < this.nextPackSize) return [];

    const weights = rosterWeights(world.day, world.nightBlend);
    const anchor: SpawnAnchor = this.rng.chance(SPAWN.phylacterySpawnShare) ? 'phylactery' : 'player';
    const anchorPoint = anchor === 'phylactery' ? world.phylactery : world.player;
    const center = this.findCenter(anchorPoint, world);
    if (!center) {
      this.retryTimer = SPAWN.retryDelay;
      return [];
    }

    const packSize = this.nextPackSize;
    const room = Math.max(0, cap - world.activeEnemies);
    const used = new Set<string>();
    const requests: SpawnRequest[] = [];
    for (let m = 0; m < packSize && requests.length < room; m++) {
      const type = pickWeighted(this.rng, weights);
      if (!type) break;
      const elite = this.rng.chance(ELITE.chance);
      const flying = ENEMIES[type].movement === 'flying';
      for (const offset of MEMBER_OFFSETS) {
        const tx = center.x + offset.x;
        const ty = center.y + offset.y;
        const k = `${tx},${ty}`;
        if (used.has(k) || !canSpawnAt(tx, ty, flying, world)) continue;
        used.add(k);
        requests.push({ type, elite, x: tx + 0.5, y: ty + 0.5, anchor });
        break;
      }
    }
    // Members that found no tile (or hit the cap) are refunded: only spawned enemies cost budget.
    this.budget -= requests.length;
    this.nextPackSize = this.rollPackSize(world.nightBlend);
    return requests;
  }

  private rollPackSize(nightBlend: number): number {
    const range = this.rng.chance(nightBlend) ? SPAWN.packSizeNight : SPAWN.packSizeDay;
    return this.rng.int(range.min, range.max);
  }

  private findCenter(anchor: Point, world: SpawnWorld): Point | undefined {
    for (let attempt = 0; attempt < SPAWN.centerAttempts; attempt++) {
      const angle = this.rng.next() * Math.PI * 2;
      const distance = this.rng.range(SPAWN.ringMin, SPAWN.ringMax);
      const tx = Math.floor(anchor.x + Math.cos(angle) * distance);
      const ty = Math.floor(anchor.y + Math.sin(angle) * distance);
      // The pack center uses the ground rules, so every pack has a valid first member.
      const ok = canSpawnAt(tx, ty, false, world);
      this.attempts.push({ x: tx + 0.5, y: ty + 0.5, ok, at: this.time });
      if (ok) return { x: tx, y: ty };
    }
    return undefined;
  }
}
