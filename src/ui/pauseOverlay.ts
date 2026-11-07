// Auto-pause overlay (GAME_DESIGN.md section 8.3).

import { VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';

export function drawAutoPauseOverlay(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  ctx.fillStyle = '#e8e2d4';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 48px system-ui, sans-serif';
  ctx.fillText('Paused', VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 24);
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText('Click or press any key to resume', VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 28);
}
