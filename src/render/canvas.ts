// Canvas setup, letterboxed scaling, and window-to-logical coordinate conversion.
// GAME_DESIGN.md section 4 (logical view) and section 8.3 (mouse conversion).

import { VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { Point } from '../core/input';

/** How the logical view maps onto the window, in CSS pixels. */
export interface Viewport {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Largest scale that fits the logical view in the window, centered with letterbox bars. */
export function computeViewport(
  windowWidth: number,
  windowHeight: number,
  viewWidth = VIEW_WIDTH,
  viewHeight = VIEW_HEIGHT,
): Viewport {
  const scale = Math.min(windowWidth / viewWidth, windowHeight / viewHeight);
  return {
    scale,
    offsetX: (windowWidth - viewWidth * scale) / 2,
    offsetY: (windowHeight - viewHeight * scale) / 2,
  };
}

/** Converts a point in window CSS pixels to logical view pixels. */
export function windowToLogical(x: number, y: number, viewport: Viewport): Point {
  return {
    x: (x - viewport.offsetX) / viewport.scale,
    y: (y - viewport.offsetY) / viewport.scale,
  };
}

/** Owns the canvas element. Drawing code receives `ctx` already set to logical coordinates. */
export class GameCanvas {
  readonly ctx: CanvasRenderingContext2D;
  viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };
  private pixelRatio = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.pixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.viewport = computeViewport(width, height);
  }

  /** Clears the letterbox bars, then sets the transform to the 1280 × 720 logical view, clipped. */
  beginFrame(): void {
    const { ctx, viewport, pixelRatio } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    const s = viewport.scale * pixelRatio;
    ctx.setTransform(s, 0, 0, s, viewport.offsetX * pixelRatio, viewport.offsetY * pixelRatio);
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.clip();
  }

  endFrame(): void {
    this.ctx.restore();
  }

  /** Converts mouse event client coordinates to logical view pixels. */
  clientToLogical(clientX: number, clientY: number): Point {
    const rect = this.canvas.getBoundingClientRect();
    return windowToLogical(clientX - rect.left, clientY - rect.top, this.viewport);
  }
}
