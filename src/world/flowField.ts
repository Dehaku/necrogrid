// Ground pathfinding: one windowed Dijkstra map per goal. GAME_DESIGN.md section 15.1.
// Each tile stores its path cost to the goal and a unit direction for the next step.
// Buildings are passable at extra cost, so enemies go around walls when they can and
// through them (by attacking) when they cannot. Diagonal steps never cut corners.

import { NAV } from '../data/tuning';
import type { Point } from '../core/input';

export interface FlowTerrain {
  /** Terrain only: false for rock and ungenerated tiles. */
  isWalkable(tileX: number, tileY: number): boolean;
  isBuilding(tileX: number, tileY: number): boolean;
}

const SQRT1_2 = Math.SQRT1_2;
// The 8 neighbors as flat arrays (the build loops are hot). Orthogonal first, so ties prefer
// straight steps. DX/DY: offset; STEP: step length; UX/UY: unit direction.
const DX = Int8Array.of(1, -1, 0, 0, 1, 1, -1, -1);
const DY = Int8Array.of(0, 0, 1, -1, 1, -1, 1, -1);
const STEP = Float32Array.of(1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2);
const UX = Float32Array.of(1, -1, 0, 0, SQRT1_2, SQRT1_2, -SQRT1_2, -SQRT1_2);
const UY = Float32Array.of(0, 0, 1, -1, SQRT1_2, -SQRT1_2, SQRT1_2, -SQRT1_2);

/** Binary min-heap of (cost, index) pairs in preallocated typed arrays. */
class MinHeap {
  private costs: Float32Array;
  private items: Int32Array;
  size = 0;
  /** Cost of the entry most recently returned by pop(). */
  lastCost = 0;

  constructor(capacity: number) {
    this.costs = new Float32Array(capacity);
    this.items = new Int32Array(capacity);
  }

  push(item: number, cost: number): void {
    if (this.size === this.items.length) this.grow();
    const { costs, items } = this;
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (costs[parent]! <= cost) break;
      costs[i] = costs[parent]!;
      items[i] = items[parent]!;
      i = parent;
    }
    costs[i] = cost;
    items[i] = item;
  }

  pop(): number {
    const { costs, items } = this;
    const top = items[0]!;
    this.lastCost = costs[0]!;
    const n = --this.size;
    const cost = costs[n]!;
    const item = items[n]!;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      if (left >= n) break;
      const right = left + 1;
      const child = right < n && costs[right]! < costs[left]! ? right : left;
      if (costs[child]! >= cost) break;
      costs[i] = costs[child]!;
      items[i] = items[child]!;
      i = child;
    }
    costs[i] = cost;
    items[i] = item;
    return top;
  }

  clear(): void {
    this.size = 0;
  }

  private grow(): void {
    const costs = new Float32Array(this.costs.length * 2);
    const items = new Int32Array(this.items.length * 2);
    costs.set(this.costs);
    items.set(this.items);
    this.costs = costs;
    this.items = items;
  }
}

export class FlowField {
  readonly size: number;
  /** Tile coordinate of the window's top-left corner. */
  minX = 0;
  minY = 0;
  built = false;
  /** Path cost to the goal; Infinity where unreachable. */
  readonly dist: Float32Array;
  /** Unit direction of the next step; 0, 0 at goal tiles and unreachable tiles. */
  readonly dirX: Float32Array;
  readonly dirY: Float32Array;
  readonly isGoal: Uint8Array;
  private readonly walkable: Uint8Array;
  private readonly building: Uint8Array;
  private readonly heap: MinHeap;

  constructor(readonly radius: number = NAV.fieldRadius) {
    this.size = radius * 2 + 1;
    const n = this.size * this.size;
    this.dist = new Float32Array(n);
    this.dirX = new Float32Array(n);
    this.dirY = new Float32Array(n);
    this.isGoal = new Uint8Array(n);
    this.walkable = new Uint8Array(n);
    this.building = new Uint8Array(n);
    this.heap = new MinHeap(n * 2);
  }

  /** Rebuilds the field in a window centered on (centerX, centerY) toward the goal tiles. */
  build(centerX: number, centerY: number, goals: readonly Point[], terrain: FlowTerrain): void {
    const { size, dist, dirX, dirY, isGoal, walkable, building, heap } = this;
    this.minX = centerX - this.radius;
    this.minY = centerY - this.radius;
    const penalty = NAV.buildingPathCost;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        walkable[i] = terrain.isWalkable(this.minX + x, this.minY + y) ? 1 : 0;
        building[i] = terrain.isBuilding(this.minX + x, this.minY + y) ? 1 : 0;
      }
    }
    dist.fill(Infinity);
    dirX.fill(0);
    dirY.fill(0);
    isGoal.fill(0);
    heap.clear();

    for (const goal of goals) {
      const i = this.indexOf(goal.x, goal.y);
      if (i < 0 || !walkable[i] || building[i]) continue;
      dist[i] = 0;
      isGoal[i] = 1;
      heap.push(i, 0);
    }

    // Dijkstra outward from the goals. dist[n] is the cost for an enemy standing on n to
    // reach a goal, paying a penalty for each building tile it steps into.
    while (heap.size > 0) {
      const i = heap.pop();
      const cost = heap.lastCost;
      // Stale entry. Heap costs and dist are both 32-bit, so this compares like with like.
      if (cost > dist[i]!) continue;
      const ix = i % size;
      const iy = (i - ix) / size;
      const enterCost = building[i] ? penalty : 0;
      for (let k = 0; k < 8; k++) {
        const nx = ix + DX[k]!;
        const ny = iy + DY[k]!;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (!walkable[n]) continue;
        if (k >= 4 && !this.diagonalOpen(ix, iy, DX[k]!, DY[k]!)) continue;
        const next = cost + STEP[k]! + enterCost;
        if (next < dist[n]!) {
          dist[n] = next;
          heap.push(n, dist[n]!);
        }
      }
    }

    // Direction: the allowed neighbor that minimizes (its cost + the cost of stepping into it).
    for (let iy = 0; iy < size; iy++) {
      for (let ix = 0; ix < size; ix++) {
        const i = iy * size + ix;
        if (isGoal[i] || dist[i] === Infinity) continue;
        let best = Infinity;
        for (let k = 0; k < 8; k++) {
          const nx = ix + DX[k]!;
          const ny = iy + DY[k]!;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const n = ny * size + nx;
          if (!walkable[n] || dist[n] === Infinity) continue;
          if (k >= 4 && !this.diagonalOpen(ix, iy, DX[k]!, DY[k]!)) continue;
          const total = dist[n]! + STEP[k]! + (building[n] ? penalty : 0);
          if (total < best) {
            best = total;
            dirX[i] = UX[k]!;
            dirY[i] = UY[k]!;
          }
        }
      }
    }
    this.built = true;
  }

  /** Index into the field arrays, or -1 outside the window. */
  indexOf(tileX: number, tileY: number): number {
    const x = tileX - this.minX;
    const y = tileY - this.minY;
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return -1;
    return y * this.size + x;
  }

  inWindow(tileX: number, tileY: number): boolean {
    return this.built && this.indexOf(tileX, tileY) >= 0;
  }

  /** Path cost from a tile, Infinity if unreachable, undefined outside the window. */
  distanceAt(tileX: number, tileY: number): number | undefined {
    if (!this.built) return undefined;
    const i = this.indexOf(tileX, tileY);
    return i < 0 ? undefined : this.dist[i];
  }

  /** Unit step direction at a tile; undefined outside the window, at goals, or where unreachable. */
  directionAt(tileX: number, tileY: number): Point | undefined {
    if (!this.built) return undefined;
    const i = this.indexOf(tileX, tileY);
    if (i < 0) return undefined;
    const x = this.dirX[i]!;
    const y = this.dirY[i]!;
    return x === 0 && y === 0 ? undefined : { x, y };
  }

  /**
   * Smoothed direction at a world position: the bilinear blend of the directions of the four
   * tiles around it, so direction changes gradually across tile borders. Tiles with no
   * direction are left out. Undefined if none of the four has one.
   */
  sample(x: number, y: number): Point | undefined {
    if (!this.built) return undefined;
    const gx = x - 0.5;
    const gy = y - 0.5;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    let sx = 0;
    let sy = 0;
    let weight = 0;
    for (let k = 0; k < 4; k++) {
      const tx = x0 + (k & 1);
      const ty = y0 + (k >> 1);
      const i = this.indexOf(tx, ty);
      if (i < 0) continue;
      const dx = this.dirX[i]!;
      const dy = this.dirY[i]!;
      if (dx === 0 && dy === 0) continue;
      const w = (k & 1 ? fx : 1 - fx) * (k >> 1 ? fy : 1 - fy);
      sx += dx * w;
      sy += dy * w;
      weight += w;
    }
    if (weight <= 0) return undefined;
    const length = Math.hypot(sx, sy);
    return length > 1e-6 ? { x: sx / length, y: sy / length } : undefined;
  }

  private diagonalOpen(ix: number, iy: number, dx: number, dy: number): boolean {
    const { size, walkable, building } = this;
    const a = iy * size + (ix + dx);
    const b = (iy + dy) * size + ix;
    return walkable[a] === 1 && building[a] === 0 && walkable[b] === 1 && building[b] === 0;
  }
}

export type GoalId = 'player' | 'phylactery';

/**
 * The two fields and their rebuild schedule. At most one field rebuilds per tick, so
 * rebuilds never cause frame spikes.
 */
export class FlowFields {
  readonly player = new FlowField();
  readonly phylactery = new FlowField();
  private playerDirty = true;
  private phylacteryDirty = true;
  private lastRebuilt: GoalId = 'phylactery';
  private playerTileX = Number.NaN;
  private playerTileY = Number.NaN;

  constructor(
    private readonly terrain: FlowTerrain,
    /** Center tile of the Phylactery field window. */
    private readonly phylacteryCenter: Point,
    /** Goal tiles around the Phylactery. */
    private readonly phylacteryGoals: readonly Point[],
  ) {}

  field(goal: GoalId): FlowField {
    return goal === 'player' ? this.player : this.phylactery;
  }

  /** Call every tick with the player's tile; the player field rebuilds when it changes. */
  trackPlayer(tileX: number, tileY: number): void {
    if (tileX !== this.playerTileX || tileY !== this.playerTileY) {
      this.playerTileX = tileX;
      this.playerTileY = tileY;
      this.playerDirty = true;
    }
  }

  /** A building was placed or destroyed. */
  markAllDirty(): void {
    this.playerDirty = true;
    this.phylacteryDirty = true;
  }

  /** A chunk generated; rebuild any field whose window it overlaps. */
  chunkGenerated(minX: number, minY: number, size: number): void {
    const overlaps = (field: FlowField, cx: number, cy: number): boolean =>
      minX <= cx + field.radius && minX + size > cx - field.radius && minY <= cy + field.radius && minY + size > cy - field.radius;
    if (overlaps(this.player, this.playerTileX, this.playerTileY)) this.playerDirty = true;
    if (overlaps(this.phylactery, this.phylacteryCenter.x, this.phylacteryCenter.y)) this.phylacteryDirty = true;
  }

  /** Rebuilds at most one dirty field. Returns which one, if any. */
  update(): GoalId | undefined {
    let next: GoalId | undefined;
    if (this.playerDirty && this.phylacteryDirty) next = this.lastRebuilt === 'player' ? 'phylactery' : 'player';
    else if (this.playerDirty) next = 'player';
    else if (this.phylacteryDirty) next = 'phylactery';
    if (!next) return undefined;

    if (next === 'player') {
      if (Number.isNaN(this.playerTileX)) return undefined;
      this.player.build(this.playerTileX, this.playerTileY, [{ x: this.playerTileX, y: this.playerTileY }], this.terrain);
      this.playerDirty = false;
    } else {
      this.phylactery.build(this.phylacteryCenter.x, this.phylacteryCenter.y, this.phylacteryGoals, this.terrain);
      this.phylacteryDirty = false;
    }
    this.lastRebuilt = next;
    return next;
  }
}
