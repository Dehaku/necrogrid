// Settings: values, local-storage persistence, and the panel shown from the title/pause
// screen. GAME_DESIGN.md section 12. Settings change rendering and audio only, never the
// simulation, so a seed plays out the same at any settings.

import { MENU, SETTINGS } from '../data/ui';
import { drawBox, drawButton, hitIndex, type MenuPress, type Rect } from './menuWidgets';

export interface Settings {
  corpseRenderCount: number;
  masterVolume: number;
  screenShake: boolean;
  damageNumbers: boolean;
}

type NumberKey = 'corpseRenderCount' | 'masterVolume';
type ToggleKey = 'screenShake' | 'damageNumbers';
type Row = { key: NumberKey; label: string; format: (v: number) => string } | { key: ToggleKey; label: string };

const ROWS: readonly Row[] = [
  { key: 'corpseRenderCount', label: 'Corpse render count', format: (v) => String(v) },
  { key: 'masterVolume', label: 'Master volume', format: (v) => `${v}%` },
  { key: 'screenShake', label: 'Screen shake' },
  { key: 'damageNumbers', label: 'Damage numbers' },
];

export function defaultSettings(): Settings {
  return {
    corpseRenderCount: SETTINGS.corpseRenderCount.default,
    masterVolume: SETTINGS.masterVolume.default,
    screenShake: SETTINGS.screenShake,
    damageNumbers: SETTINGS.damageNumbers,
  };
}

function clampToStep(value: unknown, range: { default: number; min: number; max: number; step: number }): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return range.default;
  const stepped = Math.round((value - range.min) / range.step) * range.step + range.min;
  return Math.min(range.max, Math.max(range.min, stepped));
}

/** Turns anything (e.g. parsed JSON from storage) into valid settings, keeping what is valid. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Record<string, unknown>;
  return {
    corpseRenderCount: clampToStep(r.corpseRenderCount, SETTINGS.corpseRenderCount),
    masterVolume: clampToStep(r.masterVolume, SETTINGS.masterVolume),
    screenShake: typeof r.screenShake === 'boolean' ? r.screenShake : d.screenShake,
    damageNumbers: typeof r.damageNumbers === 'boolean' ? r.damageNumbers : d.damageNumbers,
  };
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Loads saved settings, or the defaults if storage is missing, blocked, or holds junk. */
export function loadSettings(storage: Store | undefined): Settings {
  try {
    const text = storage?.getItem(SETTINGS.storageKey);
    return text ? sanitizeSettings(JSON.parse(text)) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

/** Saves settings; returns false if storage is unavailable (the settings still apply this session). */
export function saveSettings(storage: Store | undefined, settings: Settings): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SETTINGS.storageKey, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/** The panel: four rows and Back. Up/Down choose, Left/Right change, Enter toggles or goes back. */
export class SettingsPanel {
  /** 0–3 are the rows, 4 is Back. */
  focus = 0;

  constructor(
    public settings: Settings,
    /** Called after every change (save and apply). */
    private readonly onChange: (settings: Settings) => void,
  ) {}

  rect(): Rect {
    return { x: 1280 / 2 - 250, y: 720 / 2 - 170, w: 500, h: 340 };
  }

  private rowRect(i: number): Rect {
    const r = this.rect();
    return { x: r.x + 24, y: r.y + 64 + i * 46, w: r.w - 48, h: 38 };
  }

  /** The [decrease, increase] arrow boxes on a row; for toggles both flip it. */
  private arrowRects(i: number): Rect[] {
    const row = this.rowRect(i);
    const right = row.x + row.w;
    return [
      { x: right - 170, y: row.y + 4, w: 30, h: row.h - 8 },
      { x: right - 34, y: row.y + 4, w: 30, h: row.h - 8 },
    ];
  }

  backRect(): Rect {
    const r = this.rect();
    return { x: r.x + (r.w - 150) / 2, y: r.y + r.h - 58, w: 150, h: MENU.buttonHeight };
  }

  open(): void {
    this.focus = 0;
  }

  /** Returns 'back' when the player leaves the panel. */
  handle(press: MenuPress): 'back' | undefined {
    const count = ROWS.length + 1;
    switch (press.kind) {
      case 'prev':
        this.focus = (this.focus + count - 1) % count;
        return undefined;
      case 'next':
        this.focus = (this.focus + 1) % count;
        return undefined;
      case 'left':
      case 'right':
        if (this.focus < ROWS.length) this.change(this.focus, press.kind === 'left' ? -1 : 1);
        return undefined;
      case 'confirm':
        if (this.focus === ROWS.length) return 'back';
        if ('format' in ROWS[this.focus]!) return undefined;
        this.change(this.focus, 1);
        return undefined;
      case 'back':
        return 'back';
      case 'click': {
        if (hitIndex([this.backRect()], press.at) === 0) return 'back';
        for (let i = 0; i < ROWS.length; i++) {
          const arrow = hitIndex(this.arrowRects(i), press.at);
          if (arrow >= 0) {
            this.focus = i;
            this.change(i, arrow === 0 ? -1 : 1);
            return undefined;
          }
          if (hitIndex([this.rowRect(i)], press.at) === 0) this.focus = i;
        }
        return undefined;
      }
    }
  }

  private change(index: number, direction: -1 | 1): void {
    const row = ROWS[index]!;
    const next = { ...this.settings };
    if ('format' in row) {
      const range = SETTINGS[row.key];
      next[row.key] = clampToStep(next[row.key] + direction * range.step, range);
    } else {
      next[row.key] = !next[row.key];
    }
    this.settings = next;
    this.onChange(next);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const r = this.rect();
    drawBox(ctx, r);
    ctx.fillStyle = MENU.focusText;
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Settings', r.x + r.w / 2, r.y + 32);

    ROWS.forEach((row, i) => {
      const rr = this.rowRect(i);
      const focused = this.focus === i;
      ctx.fillStyle = focused ? 'rgba(90, 74, 106, 0.45)' : 'rgba(30, 24, 38, 0.6)';
      ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
      if (focused) {
        ctx.strokeStyle = MENU.focusBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(rr.x + 0.5, rr.y + 0.5, rr.w - 1, rr.h - 1);
      }
      ctx.font = '15px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = focused ? MENU.focusText : MENU.text;
      ctx.fillText(row.label, rr.x + 12, rr.y + rr.h / 2);
      const value = 'format' in row ? row.format(this.settings[row.key]) : this.settings[row.key] ? 'On' : 'Off';
      const [dec, inc] = this.arrowRects(i);
      ctx.textAlign = 'center';
      ctx.fillStyle = MENU.panelKey;
      ctx.fillText('◀', dec!.x + dec!.w / 2, rr.y + rr.h / 2);
      ctx.fillText('▶', inc!.x + inc!.w / 2, rr.y + rr.h / 2);
      ctx.fillStyle = MENU.focusText;
      ctx.fillText(value, (dec!.x + dec!.w + inc!.x) / 2, rr.y + rr.h / 2);
    });
    drawButton(ctx, this.backRect(), 'Back', this.focus === ROWS.length);
  }
}
