// Night lighting: a darkness overlay with soft holes for light sources, pre-rendered to an
// offscreen canvas and composited once per frame. GAME_DESIGN.md sections 5 and 15.

import { LIGHTING } from '../data/time';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';

export interface LightSource {
  /** Logical screen position, in pixels. */
  x: number;
  y: number;
  /** Radius in pixels. */
  radius: number;
}

export class Lighting {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = VIEW_WIDTH;
    this.canvas.height = VIEW_HEIGHT;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  /**
   * Draws the darkness for a night blend of 0 (full day, nothing drawn) to 1 (full night)
   * onto `target`, which must be in logical view coordinates.
   */
  draw(target: CanvasRenderingContext2D, nightBlend: number, lights: readonly LightSource[]): void {
    if (nightBlend <= 0) return;
    const { ctx } = this;
    const rgb = LIGHTING.darknessRgb;

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.fillStyle = `rgba(${rgb}, ${LIGHTING.nightDarkness * nightBlend})`;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    // Cut a soft hole for each light.
    ctx.globalCompositeOperation = 'destination-out';
    for (const light of lights) {
      const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
      gradient.addColorStop(1 - LIGHTING.lightSoftEdge, 'rgba(0, 0, 0, 1)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(light.x - light.radius, light.y - light.radius, light.radius * 2, light.radius * 2);
    }

    // Vignette: darken toward the corners.
    ctx.globalCompositeOperation = 'source-over';
    const cx = VIEW_WIDTH / 2;
    const cy = VIEW_HEIGHT / 2;
    const corner = Math.hypot(cx, cy);
    const vignette = ctx.createRadialGradient(cx, cy, corner * 0.45, cx, cy, corner);
    vignette.addColorStop(0, `rgba(${rgb}, 0)`);
    vignette.addColorStop(1, `rgba(${rgb}, ${LIGHTING.nightVignette * nightBlend})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    target.drawImage(this.canvas, 0, 0);
  }
}
