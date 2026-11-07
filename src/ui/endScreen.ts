// End screen after a loss. GAME_DESIGN.md section 11.

import { MENU, TITLE } from '../data/ui';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { RunOutcome } from '../game';
import { contains, drawBox, drawButton, type MenuPress, type Rect } from './menuWidgets';

const HEADLINES: Record<RunOutcome['cause'], string> = {
  player: 'You have fallen',
  phylactery: 'The Phylactery is destroyed',
};

export class EndScreen {
  outcome: RunOutcome | undefined;

  get isOpen(): boolean {
    return this.outcome !== undefined;
  }

  open(outcome: RunOutcome): void {
    this.outcome = outcome;
  }

  close(): void {
    this.outcome = undefined;
  }

  private box(): Rect {
    return { x: VIEW_WIDTH / 2 - 230, y: VIEW_HEIGHT / 2 - 150, w: 460, h: 300 };
  }

  buttonRect(): Rect {
    const b = this.box();
    return { x: b.x + (b.w - 220) / 2, y: b.y + b.h - 66, w: 220, h: MENU.buttonHeight };
  }

  /** Returns 'title' when the player chooses Return to title. */
  handle(press: MenuPress): 'title' | undefined {
    if (press.kind === 'confirm') return 'title';
    if (press.kind === 'click' && contains(this.buttonRect(), press.at)) return 'title';
    return undefined;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const o = this.outcome;
    if (!o) return;
    ctx.fillStyle = TITLE.pauseOverlay;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    const b = this.box();
    drawBox(ctx, b);
    const cx = b.x + b.w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e06a6a';
    ctx.font = `700 30px Georgia, 'Times New Roman', serif`;
    ctx.fillText(HEADLINES[o.cause], cx, b.y + 48);

    const rows: [string, string][] = [
      ['Day reached', String(o.day)],
      ['Demons slain', String(o.kills)],
      ['Corpses harvested', String(o.corpsesHarvested)],
      ['Score', String(o.score)],
    ];
    ctx.font = '16px system-ui, sans-serif';
    rows.forEach(([label, value], i) => {
      const y = b.y + 100 + i * 28;
      ctx.textAlign = 'right';
      ctx.fillStyle = MENU.panelText;
      ctx.fillText(label, cx - 10, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = MENU.focusText;
      ctx.fillText(value, cx + 10, y);
    });
    drawButton(ctx, this.buttonRect(), 'Return to title', true);
  }
}
