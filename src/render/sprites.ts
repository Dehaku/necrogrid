// Placeholder shapes (GAME_DESIGN.md section 15, placeholder art rule).

import { PHYLACTERY, type BuildingKind } from '../data/buildings';
import { ELITE, type EnemyDef } from '../data/enemies';
import { BOLT } from '../data/spells';
import { CORPSES } from '../data/ui';
import { TILE_PROPS, UNGENERATED_COLOR, type TileId } from '../data/terrain';
import { TILE_SIZE, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { Footprint } from '../world/grid';
import type { Camera } from './camera';

const OUTLINE_COLOR = '#0d0b10';

const GRID_COLOR = 'rgba(255, 255, 255, 0.035)';
const ORIGIN_COLOR = 'rgba(155, 127, 209, 0.12)';
const PLAYER_COLOR = '#9b7fd1';
const PLAYER_FACING_COLOR = '#e4d8ff';

/** Anything that can say which tile is where (undefined = not generated). */
export interface TileSource {
  getTile(tileX: number, tileY: number): TileId | undefined;
}

/** Visible tiles, faint tile lines, and a marker where the Phylactery will stand. */
export function drawTerrain(ctx: CanvasRenderingContext2D, camera: Camera, tiles: TileSource): void {
  const topLeft = camera.screenToWorld(0, 0);
  const minX = Math.floor(topLeft.x);
  const minY = Math.floor(topLeft.y);
  const maxX = Math.ceil(topLeft.x + VIEW_WIDTH / TILE_SIZE);
  const maxY = Math.ceil(topLeft.y + VIEW_HEIGHT / TILE_SIZE);

  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      const tile = tiles.getTile(tx, ty);
      const p = camera.worldToScreen(tx, ty);
      ctx.fillStyle = tile === undefined ? UNGENERATED_COLOR : TILE_PROPS[tile].color;
      // Rounded edges with 1 px overlap so no seams show between tiles at fractional scales.
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      ctx.fillRect(x, y, TILE_SIZE + 1, TILE_SIZE + 1);
    }
  }

  // Mark the 3 × 3 area where the Phylactery will stand (tiles -1..1).
  const origin = camera.worldToScreen(-1, -1);
  ctx.fillStyle = ORIGIN_COLOR;
  ctx.fillRect(origin.x, origin.y, TILE_SIZE * 3, TILE_SIZE * 3);

  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = minX; x <= maxX; x++) {
    const sx = Math.round(camera.worldToScreen(x, 0).x) + 0.5;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, VIEW_HEIGHT);
  }
  for (let y = minY; y <= maxY; y++) {
    const sy = Math.round(camera.worldToScreen(0, y).y) + 0.5;
    ctx.moveTo(0, sy);
    ctx.lineTo(VIEW_WIDTH, sy);
  }
  ctx.stroke();
}

/** Phylactery placeholder: a 3 × 3 block with a bright edge and a label. */
export function drawPhylactery(ctx: CanvasRenderingContext2D, camera: Camera, fp: Footprint): void {
  const p = camera.worldToScreen(fp.x, fp.y);
  const w = fp.w * TILE_SIZE;
  const h = fp.h * TILE_SIZE;
  if (p.x > VIEW_WIDTH || p.y > VIEW_HEIGHT || p.x + w < 0 || p.y + h < 0) return;
  ctx.fillStyle = PHYLACTERY.color;
  ctx.fillRect(p.x, p.y, w, h);
  ctx.strokeStyle = PHYLACTERY.edgeColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(p.x + 1, p.y + 1, w - 2, h - 2);
  ctx.fillStyle = PHYLACTERY.edgeColor;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PHYLACTERY', p.x + w / 2, p.y + h / 2);
}

/** Mixes two #rrggbb colors; t = 0 gives a, t = 1 gives b. */
function mixHex(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number): number => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const parts = [0, 1, 2].map((i) => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t));
  return `rgb(${parts.join(', ')})`;
}

/** Elite marker: a circle under the enemy pulsing dark yellow ↔ light yellow (section 7.1). */
function drawEliteMarker(ctx: CanvasRenderingContext2D, sx: number, sy: number, time: number): void {
  const t = (1 - Math.cos((2 * Math.PI * time) / ELITE.markerPeriod)) / 2;
  ctx.beginPath();
  ctx.arc(sx, sy, ELITE.markerRadius * TILE_SIZE, 0, Math.PI * 2);
  ctx.fillStyle = mixHex(ELITE.markerDark, ELITE.markerLight, t);
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** An enemy as its placeholder shape, rotated to its heading. `time` drives the elite pulse. */
export function drawEnemy(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  def: EnemyDef,
  elite: boolean,
  x: number,
  y: number,
  heading: number,
  time: number,
): void {
  const p = camera.worldToScreen(x, y);
  const margin = TILE_SIZE * 2;
  if (p.x < -margin || p.y < -margin || p.x > VIEW_WIDTH + margin || p.y > VIEW_HEIGHT + margin) return;
  if (elite) drawEliteMarker(ctx, p.x, p.y, time);

  const s = def.drawSize * TILE_SIZE;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(heading);
  ctx.beginPath();
  switch (def.shape) {
    case 'triangle':
      ctx.moveTo(s, 0);
      ctx.lineTo(-s * 0.8, -s * 0.8);
      ctx.lineTo(-s * 0.8, s * 0.8);
      ctx.closePath();
      break;
    case 'circle':
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      break;
    case 'square':
      ctx.rect(-s, -s, s * 2, s * 2);
      break;
    case 'diamond':
      ctx.moveTo(s, 0);
      ctx.lineTo(0, -s);
      ctx.lineTo(-s, 0);
      ctx.lineTo(0, s);
      ctx.closePath();
      break;
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        if (i === 0) ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s);
        else ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
      }
      ctx.closePath();
      break;
  }
  ctx.fillStyle = def.color;
  ctx.fill();
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Facing tick, so heading and turning are readable on round shapes too.
  ctx.beginPath();
  ctx.moveTo(s * 0.3, 0);
  ctx.lineTo(s * 0.9, 0);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.stroke();
  ctx.restore();
}

/** Darkens a #rrggbb or rgba() color toward black by `factor` (0 = black, 1 = unchanged). */
function darken(color: string, factor: number): string {
  if (color.startsWith('#')) {
    const c = [1, 3, 5].map((i) => Math.round(parseInt(color.slice(i, i + 2), 16) * factor));
    return `rgb(${c.join(', ')})`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return color;
  const [r, g, b] = m[1]!.split(',').map((v) => parseFloat(v));
  return `rgb(${Math.round(r! * factor)}, ${Math.round(g! * factor)}, ${Math.round(b! * factor)})`;
}

/**
 * A corpse: the enemy's shape, flattened and darkened, at `opacity` (it fades over the next
 * day phase). Elite corpses get a gold outline so they read as worth harvesting.
 */
export function drawCorpse(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  def: EnemyDef,
  elite: boolean,
  x: number,
  y: number,
  heading: number,
  opacity: number,
): void {
  const p = camera.worldToScreen(x, y);
  const margin = TILE_SIZE;
  if (opacity <= 0 || p.x < -margin || p.y < -margin || p.x > VIEW_WIDTH + margin || p.y > VIEW_HEIGHT + margin) return;
  const s = def.drawSize * TILE_SIZE;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(p.x, p.y);
  ctx.rotate(heading + Math.PI / 2);
  ctx.scale(1.15, 0.6);
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s, 0, 0, Math.PI * 2);
  ctx.fillStyle = darken(def.color, CORPSES.darken);
  ctx.fill();
  ctx.lineWidth = elite ? 2.5 : 1;
  ctx.strokeStyle = elite ? CORPSES.eliteOutline : 'rgba(0, 0, 0, 0.6)';
  ctx.stroke();
  // A pale bone mark, so corpses read as remains rather than shadows.
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, 0);
  ctx.lineTo(s * 0.4, 0);
  ctx.strokeStyle = 'rgba(232, 224, 204, 0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/**
 * A player building: a colored square with a short label (placeholder art). The Bone Door is a
 * wall square with a darker center stripe; the Lantern glows a little.
 */
export function drawBuilding(ctx: CanvasRenderingContext2D, camera: Camera, kind: BuildingKind, fp: Footprint, color: string, label: string): void {
  const p = camera.worldToScreen(fp.x, fp.y);
  const w = fp.w * TILE_SIZE;
  const h = fp.h * TILE_SIZE;
  if (p.x > VIEW_WIDTH || p.y > VIEW_HEIGHT || p.x + w < 0 || p.y + h < 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(p.x + 1, p.y + 1, w - 2, h - 2);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(p.x + 2, p.y + 2, w - 4, h - 4);
  if (kind === 'door') {
    ctx.fillStyle = 'rgba(40, 30, 24, 0.85)';
    ctx.fillRect(p.x + w / 2 - 4, p.y + 4, 8, h - 8);
  }
  if (kind === 'lantern') {
    ctx.beginPath();
    ctx.arc(p.x + w / 2, p.y + h / 2, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff3c4';
    ctx.fill();
    return;
  }
  if (label) {
    ctx.fillStyle = 'rgba(20, 14, 20, 0.85)';
    ctx.font = `700 ${fp.w > 1 ? 12 : 13}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x + w / 2, p.y + h / 2 + 1);
  }
}

/** A bolt: a glowing dot with a short trail back to its previous position. Totem bolts are pale green. */
export function drawBolt(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  x: number,
  y: number,
  prevX: number,
  prevY: number,
  color: string = BOLT.color,
): void {
  const p = camera.worldToScreen(x, y);
  const tail = camera.worldToScreen(prevX, prevY);
  ctx.strokeStyle = color === BOLT.color ? BOLT.glowColor : 'rgba(150, 240, 180, 0.35)';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * The necromancer: a square rotated to face the aim direction, with a marker on its front.
 * `blink` (during invulnerability) draws it half transparent.
 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  x: number,
  y: number,
  facing: number,
  blink = false,
): void {
  const p = camera.worldToScreen(x, y);
  const half = TILE_SIZE * 0.45;
  ctx.save();
  if (blink) ctx.globalAlpha = 0.45;
  ctx.translate(p.x, p.y);
  ctx.rotate(facing);
  ctx.fillStyle = PLAYER_COLOR;
  ctx.fillRect(-half, -half, half * 2, half * 2);
  ctx.fillStyle = PLAYER_FACING_COLOR;
  ctx.beginPath();
  ctx.moveTo(half + 6, 0);
  ctx.lineTo(half - 4, -6);
  ctx.lineTo(half - 4, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
