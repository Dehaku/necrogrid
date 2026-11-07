// Debug overlays drawn on the canvas: flow field arrows and costs, and the spawn inset map.
// GAME_DESIGN.md section 13.

import { ENEMIES } from '../data/enemies';
import { SPAWN } from '../data/spawn';
import { TILE_SIZE, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { Game } from '../game';
import type { Camera } from '../render/camera';
import type { FlowField } from '../world/flowField';

/** Arrows for each visible tile's step direction, its cost, and red where unreachable. */
export function drawFlowField(ctx: CanvasRenderingContext2D, camera: Camera, field: FlowField): void {
  if (!field.built) return;
  const topLeft = camera.screenToWorld(0, 0);
  const minX = Math.floor(topLeft.x);
  const minY = Math.floor(topLeft.y);
  const maxX = Math.ceil(topLeft.x + VIEW_WIDTH / TILE_SIZE);
  const maxY = Math.ceil(topLeft.y + VIEW_HEIGHT / TILE_SIZE);
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 1.5;
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      const i = field.indexOf(tx, ty);
      if (i < 0) continue;
      const p = camera.worldToScreen(tx, ty);
      const cost = field.dist[i]!;
      if (cost === Infinity) {
        ctx.fillStyle = 'rgba(255, 40, 40, 0.18)';
        ctx.fillRect(p.x, p.y, TILE_SIZE, TILE_SIZE);
        continue;
      }
      const cx = p.x + TILE_SIZE / 2;
      const cy = p.y + TILE_SIZE / 2;
      if (field.isGoal[i]) {
        ctx.fillStyle = 'rgba(80, 255, 120, 0.35)';
        ctx.fillRect(p.x, p.y, TILE_SIZE, TILE_SIZE);
      } else {
        const dx = field.dirX[i]! * TILE_SIZE * 0.35;
        const dy = field.dirY[i]! * TILE_SIZE * 0.35;
        ctx.strokeStyle = 'rgba(140, 220, 255, 0.8)';
        ctx.beginPath();
        ctx.moveTo(cx - dx, cy - dy);
        ctx.lineTo(cx + dx, cy + dy);
        ctx.stroke();
        ctx.fillStyle = 'rgba(140, 220, 255, 0.95)';
        ctx.fillRect(cx + dx - 1.5, cy + dy - 1.5, 3, 3);
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillText(cost.toFixed(0), cx, p.y + 1);
    }
  }
}

const INSET_SIZE = 220;
const INSET_RANGE = 52;
const INSET_SCALE = INSET_SIZE / (INSET_RANGE * 2);

/**
 * Bottom-right inset map, ±52 tiles around the player: both spawn rings, the view
 * rectangle with its margin, no-spawn tiles, enemies, and recent pack-center tries.
 */
export function drawSpawnInset(ctx: CanvasRenderingContext2D, game: Game): void {
  const left = VIEW_WIDTH - INSET_SIZE - 12;
  const top = VIEW_HEIGHT - INSET_SIZE - 12;
  const { player, phylactery } = game;
  const toInset = (wx: number, wy: number) => ({
    x: left + INSET_SIZE / 2 + (wx - player.x) * INSET_SCALE,
    y: top + INSET_SIZE / 2 + (wy - player.y) * INSET_SCALE,
  });

  ctx.save();
  ctx.fillStyle = 'rgba(8, 6, 12, 0.85)';
  ctx.fillRect(left, top, INSET_SIZE, INSET_SIZE);
  ctx.beginPath();
  ctx.rect(left, top, INSET_SIZE, INSET_SIZE);
  ctx.clip();

  // No-spawn tiles.
  ctx.fillStyle = 'rgba(255, 150, 40, 0.45)';
  const px = Math.floor(player.x);
  const py = Math.floor(player.y);
  for (let ty = py - INSET_RANGE; ty <= py + INSET_RANGE; ty++) {
    for (let tx = px - INSET_RANGE; tx <= px + INSET_RANGE; tx++) {
      if (!game.noSpawn.isBlocked(tx, ty)) continue;
      const p = toInset(tx, ty);
      ctx.fillRect(p.x, p.y, INSET_SCALE, INSET_SCALE);
    }
  }

  // Spawn rings around both anchors.
  ctx.lineWidth = 1;
  const ring = (cx: number, cy: number, color: string) => {
    const c = toInset(cx, cy);
    ctx.strokeStyle = color;
    for (const r of [SPAWN.ringMin, SPAWN.ringMax]) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * INSET_SCALE, 0, Math.PI * 2);
      ctx.stroke();
    }
  };
  ring(player.x, player.y, 'rgba(120, 200, 255, 0.6)');
  ring(phylactery.center.x, phylactery.center.y, 'rgba(190, 140, 255, 0.6)');

  // Visible view plus the off-screen margin.
  const halfW = VIEW_WIDTH / TILE_SIZE / 2;
  const halfH = VIEW_HEIGHT / TILE_SIZE / 2;
  const view = toInset(player.x - halfW, player.y - halfH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.strokeRect(view.x, view.y, halfW * 2 * INSET_SCALE, halfH * 2 * INSET_SCALE);
  const m = SPAWN.offscreenMargin;
  const margin = toInset(player.x - halfW - m, player.y - halfH - m);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.strokeRect(margin.x, margin.y, (halfW + m) * 2 * INSET_SCALE, (halfH + m) * 2 * INSET_SCALE);

  // Phylactery, enemies, player.
  const fp = phylactery.footprint;
  const f = toInset(fp.x, fp.y);
  ctx.fillStyle = '#9b7fd1';
  ctx.fillRect(f.x, f.y, fp.w * INSET_SCALE, fp.h * INSET_SCALE);
  for (const e of game.enemies) {
    const p = toInset(e.x, e.y);
    ctx.fillStyle = e.elite ? '#ffe066' : ENEMIES[e.type].color;
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  const me = toInset(player.x, player.y);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(me.x - 2, me.y - 2, 4, 4);

  // Recent pack-center tries.
  for (const a of game.director.attempts) {
    const p = toInset(a.x, a.y);
    ctx.strokeStyle = a.ok ? '#4cff7a' : '#ff4c4c';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(155, 127, 209, 0.7)';
  ctx.strokeRect(left + 0.5, top + 0.5, INSET_SIZE - 1, INSET_SIZE - 1);
  ctx.fillStyle = 'rgba(221, 214, 200, 0.85)';
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('SPAWN MAP ±52 tiles', left + 4, top + 3);
}
