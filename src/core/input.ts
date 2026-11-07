// Keyboard and mouse state, browser default suppression, and resume-input consumption.
// GAME_DESIGN.md section 8.3.

import type { ControlAction, ControlBinding } from '../data/controls';

export interface Point {
  x: number;
  y: number;
}

/**
 * Input state read by the simulation once per tick.
 * "Held" is true while a key or button is down. "Pressed" is true for the first tick
 * after it went down, then cleared by endTick().
 */
export class Input {
  /** Mouse position in logical view pixels (0–1280, 0–720 inside the letterbox). */
  readonly mouse: Point = { x: 0, y: 0 };

  /**
   * Called on every fresh key or button press with the key code or mouse button. Return true
   * to consume the press: it is then ignored until released. Used to resume from auto-pause
   * without the resume input also casting, moving, or triggering a hotkey.
   */
  interceptPress: (press: { key?: string; button?: number }) => boolean = () => false;

  private readonly keysHeld = new Set<string>();
  private readonly keysPressed = new Set<string>();
  private readonly keysConsumed = new Set<string>();
  private readonly buttonsHeld = new Set<number>();
  private readonly buttonsPressed = new Set<number>();
  private readonly buttonsConsumed = new Set<number>();

  keyDown(code: string, repeat = false): void {
    // A repeat for a key we do not think is held is left over from before a blur.
    // It is not a fresh press, so it neither resumes the game nor counts as input.
    if (repeat || this.keysHeld.has(code) || this.keysConsumed.has(code)) return;
    if (this.interceptPress({ key: code })) {
      this.keysConsumed.add(code);
      return;
    }
    this.keysHeld.add(code);
    this.keysPressed.add(code);
  }

  keyUp(code: string): void {
    this.keysHeld.delete(code);
    this.keysConsumed.delete(code);
  }

  mouseDown(button: number): void {
    if (this.buttonsHeld.has(button) || this.buttonsConsumed.has(button)) return;
    if (this.interceptPress({ button })) {
      this.buttonsConsumed.add(button);
      return;
    }
    this.buttonsHeld.add(button);
    this.buttonsPressed.add(button);
  }

  mouseUp(button: number): void {
    this.buttonsHeld.delete(button);
    this.buttonsConsumed.delete(button);
  }

  mouseMove(x: number, y: number): void {
    this.mouse.x = x;
    this.mouse.y = y;
  }

  isKeyDown(code: string): boolean {
    return this.keysHeld.has(code);
  }

  wasKeyPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  anyKeyDown(codes: readonly string[]): boolean {
    return codes.some((code) => this.keysHeld.has(code));
  }

  isButtonDown(button: number): boolean {
    return this.buttonsHeld.has(button);
  }

  wasButtonPressed(button: number): boolean {
    return this.buttonsPressed.has(button);
  }

  /** Call at the end of each simulation tick. */
  endTick(): void {
    this.keysPressed.clear();
    this.buttonsPressed.clear();
  }

  /** Forget everything, e.g. when the window loses focus and key-up events may never arrive. */
  clearAll(): void {
    this.keysHeld.clear();
    this.keysPressed.clear();
    this.keysConsumed.clear();
    this.buttonsHeld.clear();
    this.buttonsPressed.clear();
    this.buttonsConsumed.clear();
  }
}

/** The keyboard codes bound to an action. */
export function keysForAction(controls: readonly ControlBinding[], action: ControlAction): string[] {
  return controls.filter((c) => c.action === action).flatMap((c) => c.keys);
}

/** The mouse buttons bound to an action. */
export function buttonsForAction(controls: readonly ControlBinding[], action: ControlAction): number[] {
  return controls.filter((c) => c.action === action).flatMap((c) => c.mouseButtons);
}

/** Every keyboard code that appears in the bindings; the browser default is suppressed for these. */
export function boundKeys(controls: readonly ControlBinding[]): Set<string> {
  return new Set(controls.flatMap((c) => c.keys));
}

function isTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
  );
}

/**
 * Connects an Input to browser events. `toLogical` converts window client coordinates
 * to logical view pixels. Returns a function that removes the listeners.
 */
export function bindInput(
  input: Input,
  canvas: HTMLElement,
  toLogical: (clientX: number, clientY: number) => Point,
  preventKeys: ReadonlySet<string>,
): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    // Typing in a text field (e.g. the debug panel) is not game input.
    if (isTextField(e.target)) return;
    if (preventKeys.has(e.code)) e.preventDefault();
    input.keyDown(e.code, e.repeat);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    // Always release, so a key pressed in the game and released in a text field never sticks.
    if (preventKeys.has(e.code) && !isTextField(e.target)) e.preventDefault();
    input.keyUp(e.code);
  };
  const onMouseDown = (e: MouseEvent): void => {
    // Middle click would start browser autoscroll.
    if (e.button === 1) e.preventDefault();
    const p = toLogical(e.clientX, e.clientY);
    input.mouseMove(p.x, p.y);
    input.mouseDown(e.button);
  };
  const onMouseUp = (e: MouseEvent): void => {
    input.mouseUp(e.button);
  };
  const onMouseMove = (e: MouseEvent): void => {
    const p = toLogical(e.clientX, e.clientY);
    input.mouseMove(p.x, p.y);
  };
  const onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('contextmenu', onContextMenu);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('contextmenu', onContextMenu);
  };
}
