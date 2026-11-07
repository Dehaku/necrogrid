// Title and pause screen: one screen for both. GAME_DESIGN.md section 8.5.
// Title mode: no run is active (page load, or after a loss). Pause mode: a run is active
// and paused behind the screen; Resume is the top button.

import { CONTROLS, type ControlBinding } from '../data/controls';
import { MENU, TITLE } from '../data/ui';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { Point } from '../core/input';
import { contains, drawBox, drawButton, hitIndex, type MenuPress, type Rect } from './menuWidgets';
import type { SettingsPanel } from './settings';

export type MenuMode = 'title' | 'pause';
/** What the screen asks the game to do. */
export type MenuResult = 'resume' | 'newGame' | 'abandon';

type ButtonId = 'resume' | 'newGame' | 'settings';
type View = 'menu' | 'confirm' | 'settings';

const LABELS: Record<ButtonId, string> = { resume: 'Resume', newGame: 'New Game', settings: 'Settings' };

/** Seconds from opening until every letter has risen. */
export function introLength(letterCount: number): number {
  return (letterCount - 1) * TITLE.introStagger + TITLE.introDuration;
}

/**
 * How much of letter `index` is below the earth line (0 = fully risen, 1 = fully buried)
 * `t` seconds after the screen opened. With `skipIntro`, the idle loop starts at once.
 */
export function letterSink(index: number, letterCount: number, t: number, skipIntro: boolean): number {
  const introEnd = introLength(letterCount);
  if (!skipIntro && t < introEnd) {
    const p = Math.min(Math.max((t - index * TITLE.introStagger) / TITLE.introDuration, 0), 1);
    return Math.pow(1 - p, 3); // 1 − ease-out
  }
  const idle = (skipIntro ? t : t - introEnd) - index * TITLE.idleStagger;
  if (idle <= 0) return 0;
  return (TITLE.idleDepth * (1 - Math.cos((2 * Math.PI * idle) / TITLE.idlePeriod))) / 2;
}

export interface ControlRow {
  keys: string;
  action: string;
}

/** Controls panel rows: game controls only, consecutive bindings with the same description merged (W A S D). */
export function controlsPanelRows(controls: readonly ControlBinding[] = CONTROLS): ControlRow[] {
  const rows: ControlRow[] = [];
  for (const c of controls) {
    if (c.menuOnly) continue;
    const last = rows[rows.length - 1];
    if (last && last.action === c.description) last.keys += ` ${c.label}`;
    else rows.push({ keys: c.label, action: c.description });
  }
  return rows;
}

export class TitleScreen {
  constructor(private readonly settingsPanel?: SettingsPanel) {}

  isOpen = false;
  mode: MenuMode = 'title';
  view: View = 'menu';
  focus = 0;
  /** 0 = Abandon, 1 = Cancel. */
  confirmFocus = 1;
  private openedAt = 0;
  private skipIntro = false;
  private lastMouse: Point = { x: Number.NaN, y: Number.NaN };

  open(mode: MenuMode, now: number): void {
    this.isOpen = true;
    this.mode = mode;
    this.view = 'menu';
    this.focus = 0;
    this.openedAt = now;
    this.skipIntro = mode === 'pause';
  }

  close(): void {
    this.isOpen = false;
  }

  buttons(): ButtonId[] {
    return this.mode === 'pause' ? ['resume', 'newGame', 'settings'] : ['newGame', 'settings'];
  }

  buttonRects(): Rect[] {
    return this.buttons().map((_, i) => ({
      x: (VIEW_WIDTH - MENU.buttonWidth) / 2,
      y: MENU.firstButtonY + i * (MENU.buttonHeight + MENU.buttonGap),
      w: MENU.buttonWidth,
      h: MENU.buttonHeight,
    }));
  }

  private dialogRect(): Rect {
    return { x: VIEW_WIDTH / 2 - 220, y: VIEW_HEIGHT / 2 - 80, w: 440, h: 160 };
  }

  /** [Abandon, Cancel]. */
  confirmRects(): Rect[] {
    const d = this.dialogRect();
    const w = 150;
    return [
      { x: d.x + d.w / 2 - w - 10, y: d.y + d.h - 62, w, h: MENU.buttonHeight },
      { x: d.x + d.w / 2 + 10, y: d.y + d.h - 62, w, h: MENU.buttonHeight },
    ];
  }

  private backRect(): Rect {
    const d = this.dialogRect();
    return { x: d.x + (d.w - 150) / 2, y: d.y + d.h - 62, w: 150, h: MENU.buttonHeight };
  }

  /** Handles one input. Returns what the game should do, if anything. */
  handle(press: MenuPress): MenuResult | undefined {
    if (this.view === 'confirm') return this.handleConfirm(press);
    if (this.view === 'settings') {
      if (this.settingsPanel) {
        if (this.settingsPanel.handle(press) === 'back') this.view = 'menu';
      } else if (press.kind === 'back' || press.kind === 'confirm' || (press.kind === 'click' && contains(this.backRect(), press.at))) {
        this.view = 'menu';
      }
      return undefined;
    }

    const count = this.buttons().length;
    switch (press.kind) {
      case 'prev':
        this.focus = (this.focus + count - 1) % count;
        return undefined;
      case 'next':
        this.focus = (this.focus + 1) % count;
        return undefined;
      case 'left':
      case 'right':
        return undefined;
      case 'back':
        return this.mode === 'pause' ? 'resume' : undefined;
      case 'confirm':
        return this.activate(this.focus);
      case 'click': {
        const i = hitIndex(this.buttonRects(), press.at);
        if (i < 0) return undefined;
        this.focus = i;
        return this.activate(i);
      }
    }
  }

  /** Mouse hover moves focus, but only when the mouse actually moved (so keys keep working). */
  hover(mouse: Point): void {
    if (mouse.x === this.lastMouse.x && mouse.y === this.lastMouse.y) return;
    this.lastMouse = { ...mouse };
    if (this.view === 'menu') {
      const i = hitIndex(this.buttonRects(), mouse);
      if (i >= 0) this.focus = i;
    } else if (this.view === 'confirm') {
      const i = hitIndex(this.confirmRects(), mouse);
      if (i >= 0) this.confirmFocus = i;
    }
  }

  private activate(index: number): MenuResult | undefined {
    const id = this.buttons()[index];
    if (id === 'resume') return 'resume';
    if (id === 'settings') {
      this.view = 'settings';
      this.settingsPanel?.open();
      return undefined;
    }
    if (id === 'newGame') {
      if (this.mode !== 'pause') return 'newGame';
      this.view = 'confirm';
      this.confirmFocus = 1;
    }
    return undefined;
  }

  private handleConfirm(press: MenuPress): MenuResult | undefined {
    switch (press.kind) {
      case 'prev':
      case 'next':
      case 'left':
      case 'right':
        this.confirmFocus = this.confirmFocus === 0 ? 1 : 0;
        return undefined;
      case 'back':
        this.view = 'menu';
        return undefined;
      case 'confirm':
        if (this.confirmFocus === 0) return 'abandon';
        this.view = 'menu';
        return undefined;
      case 'click': {
        const i = hitIndex(this.confirmRects(), press.at);
        if (i === 0) return 'abandon';
        if (i === 1) this.view = 'menu';
        return undefined;
      }
    }
  }

  /** Draws the screen. In pause mode the paused world must already be drawn underneath. */
  draw(ctx: CanvasRenderingContext2D, now: number, seed: number | undefined): void {
    ctx.fillStyle = this.mode === 'pause' ? TITLE.pauseOverlay : TITLE.background;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    this.drawTitle(ctx, (now - this.openedAt) / 1000);
    const rects = this.buttonRects();
    this.buttons().forEach((id, i) => drawButton(ctx, rects[i]!, LABELS[id], this.view === 'menu' && i === this.focus));
    this.drawControls(ctx);
    if (this.mode === 'pause' && seed !== undefined) {
      ctx.fillStyle = MENU.panelText;
      ctx.font = '12px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`Seed ${seed}`, 16, VIEW_HEIGHT - 14);
    }

    if (this.view === 'confirm') this.drawConfirm(ctx);
    if (this.view === 'settings') this.drawSettings(ctx);
  }

  private drawTitle(ctx: CanvasRenderingContext2D, t: number): void {
    const letters = [...TITLE.text];
    ctx.font = `700 ${TITLE.fontSize}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const spacing = 6;
    const widths = letters.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (letters.length - 1);
    const capHeight = ctx.measureText('N').actualBoundingBoxAscent || TITLE.fontSize * 0.7;
    const left = (VIEW_WIDTH - total) / 2;
    const lineY = TITLE.baselineY;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_WIDTH, lineY);
    ctx.clip();
    ctx.fillStyle = TITLE.color;
    let x = left;
    letters.forEach((ch, i) => {
      const sink = letterSink(i, letters.length, t, this.skipIntro);
      ctx.fillText(ch, x, lineY + sink * (capHeight + 4));
      x += widths[i]! + spacing;
    });
    ctx.restore();

    ctx.fillStyle = TITLE.lineColor;
    ctx.fillRect(left - TITLE.lineOverhang, lineY, total + TITLE.lineOverhang * 2, TITLE.lineWidth);
  }

  private drawControls(ctx: CanvasRenderingContext2D): void {
    const rows = controlsPanelRows();
    const lineHeight = 16;
    const right = VIEW_WIDTH - 16;
    const keyColumn = right - 190;
    let y = VIEW_HEIGHT - 14 - (rows.length - 1) * lineHeight;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    for (const row of rows) {
      ctx.textAlign = 'right';
      ctx.fillStyle = MENU.panelKey;
      ctx.fillText(row.keys, keyColumn, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = MENU.panelText;
      ctx.fillText(row.action, keyColumn + 10, y);
      y += lineHeight;
    }
  }

  private drawConfirm(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    const d = this.dialogRect();
    drawBox(ctx, d);
    ctx.fillStyle = MENU.focusText;
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Abandon the current run?', d.x + d.w / 2, d.y + 44);
    const [abandon, cancel] = this.confirmRects();
    drawButton(ctx, abandon!, 'Abandon', this.confirmFocus === 0);
    drawButton(ctx, cancel!, 'Cancel', this.confirmFocus === 1);
  }

  private drawSettings(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    if (this.settingsPanel) {
      this.settingsPanel.draw(ctx);
      return;
    }
    const d = this.dialogRect();
    drawBox(ctx, d);
    ctx.fillStyle = MENU.focusText;
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Settings', d.x + d.w / 2, d.y + 34);
    ctx.fillStyle = MENU.panelText;
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('Settings arrive in M6.', d.x + d.w / 2, d.y + 66);
    drawButton(ctx, this.backRect(), 'Back', true);
  }
}
