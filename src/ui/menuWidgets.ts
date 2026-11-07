// Shared menu pieces: buttons, hit testing, and the presses menus understand.

import { MENU } from '../data/ui';
import type { Point } from '../core/input';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A menu input: keyboard navigation, or a click at a logical-view point. */
export type MenuPress = { kind: 'prev' } | { kind: 'next' } | { kind: 'confirm' } | { kind: 'back' } | { kind: 'click'; at: Point };

export function contains(rect: Rect, p: Point): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}

/** Index of the first rect containing p, or -1. */
export function hitIndex(rects: readonly Rect[], p: Point): number {
  return rects.findIndex((r) => contains(r, p));
}

export function drawButton(ctx: CanvasRenderingContext2D, rect: Rect, label: string, focused: boolean): void {
  ctx.fillStyle = MENU.fill;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = focused ? MENU.focusBorder : MENU.border;
  ctx.lineWidth = focused ? 2 : 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.fillStyle = focused ? MENU.focusText : MENU.text;
  ctx.font = MENU.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
}

/** A centered dialog box behind other content. */
export function drawBox(ctx: CanvasRenderingContext2D, rect: Rect): void {
  ctx.fillStyle = 'rgba(16, 12, 20, 0.97)';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = MENU.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
}
