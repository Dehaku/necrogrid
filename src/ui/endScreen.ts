// End screens. GAME_DESIGN.md section 11.
// Loss: summary and Return to title. Win (the Phylactery completes): summary and Continue,
// which resumes the run in endless mode.

import { MENU, TITLE } from '../data/ui';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { RunOutcome } from '../game';
import { contains, drawBox, drawButton, type MenuPress, type Rect } from './menuWidgets';

export interface RunSummary {
  day: number;
  kills: number;
  corpsesHarvested: number;
  score: number;
}

const HEADLINES: Record<RunOutcome['cause'], string> = {
  player: 'You have fallen',
  phylactery: 'The Phylactery is destroyed',
};

export class EndScreen {
  mode: 'lost' | 'won' = 'lost';
  outcome: RunOutcome | undefined;
  summary: RunSummary | undefined;

  get isOpen(): boolean {
    return this.summary !== undefined;
  }

  /** Opens the loss screen. */
  open(outcome: RunOutcome): void {
    this.mode = 'lost';
    this.outcome = outcome;
    this.summary = outcome;
  }

  /** Opens the win screen. */
  openWin(summary: RunSummary): void {
    this.mode = 'won';
    this.outcome = undefined;
    this.summary = summary;
  }

  close(): void {
    this.outcome = undefined;
    this.summary = undefined;
  }

  private box(): Rect {
    return { x: VIEW_WIDTH / 2 - 240, y: VIEW_HEIGHT / 2 - 160, w: 480, h: 320 };
  }

  buttonRect(): Rect {
    const b = this.box();
    return { x: b.x + (b.w - 220) / 2, y: b.y + b.h - 66, w: 220, h: MENU.buttonHeight };
  }

  /** 'title' after a loss, 'continue' after a win, when the player chooses the button. */
  handle(press: MenuPress): 'title' | 'continue' | undefined {
    const chosen = press.kind === 'confirm' || (press.kind === 'click' && contains(this.buttonRect(), press.at));
    if (!chosen) return undefined;
    return this.mode === 'won' ? 'continue' : 'title';
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const s = this.summary;
    if (!s) return;
    const won = this.mode === 'won';
    ctx.fillStyle = TITLE.pauseOverlay;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    const b = this.box();
    drawBox(ctx, b);
    const cx = b.x + b.w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = won ? '#c9b8ec' : '#e06a6a';
    ctx.font = `700 30px Georgia, 'Times New Roman', serif`;
    ctx.fillText(won ? 'The Phylactery is complete' : HEADLINES[this.outcome!.cause], cx, b.y + 44);
    if (won) {
      ctx.fillStyle = MENU.panelText;
      ctx.font = 'italic 14px system-ui, sans-serif';
      ctx.fillText('Your soul is bound. Death no longer ends you.', cx, b.y + 76);
    }

    const rows: [string, string][] = [
      [won ? 'Day' : 'Day reached', String(s.day)],
      ['Demons slain', String(s.kills)],
      ['Corpses harvested', String(s.corpsesHarvested)],
      ['Score', String(s.score)],
    ];
    ctx.font = '16px system-ui, sans-serif';
    rows.forEach(([label, value], i) => {
      const y = b.y + 112 + i * 28;
      ctx.textAlign = 'right';
      ctx.fillStyle = MENU.panelText;
      ctx.fillText(label, cx - 10, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = MENU.focusText;
      ctx.fillText(value, cx + 10, y);
    });
    drawButton(ctx, this.buttonRect(), won ? 'Continue' : 'Return to title', true);
  }
}
