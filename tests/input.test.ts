import { describe, expect, it } from 'vitest';
import { CONTROLS } from '../src/data/controls';
import { boundKeys, Input, keysForAction } from '../src/core/input';

describe('Input', () => {
  it('reports a press for one tick and a hold until release', () => {
    const input = new Input();
    input.keyDown('KeyW');
    expect(input.isKeyDown('KeyW')).toBe(true);
    expect(input.wasKeyPressed('KeyW')).toBe(true);
    input.endTick();
    expect(input.wasKeyPressed('KeyW')).toBe(false);
    expect(input.isKeyDown('KeyW')).toBe(true);
    input.keyUp('KeyW');
    expect(input.isKeyDown('KeyW')).toBe(false);
  });

  it('consumes the press that resumes the game, including its repeats', () => {
    const input = new Input();
    let paused = true;
    input.interceptPress = () => {
      if (!paused) return false;
      paused = false;
      return true;
    };

    input.keyDown('KeyW');
    expect(paused).toBe(false);
    expect(input.isKeyDown('KeyW')).toBe(false);
    expect(input.wasKeyPressed('KeyW')).toBe(false);

    input.keyDown('KeyW', true);
    expect(input.isKeyDown('KeyW')).toBe(false);

    input.keyUp('KeyW');
    input.keyDown('KeyW');
    expect(input.isKeyDown('KeyW')).toBe(true);
  });

  it('consumes the resume click, so it does not cast', () => {
    const input = new Input();
    let paused = true;
    input.interceptPress = () => {
      if (!paused) return false;
      paused = false;
      return true;
    };

    input.mouseDown(0);
    expect(input.isButtonDown(0)).toBe(false);
    expect(input.wasButtonPressed(0)).toBe(false);
    input.mouseUp(0);
    input.mouseDown(0);
    expect(input.wasButtonPressed(0)).toBe(true);
  });

  it('ignores a key repeat for a key it does not think is held (left over from a blur)', () => {
    const input = new Input();
    let intercepted = 0;
    input.interceptPress = () => {
      intercepted++;
      return true;
    };
    input.keyDown('KeyD', true);
    expect(intercepted).toBe(0);
    expect(input.isKeyDown('KeyD')).toBe(false);
  });

  it('forgets everything on clearAll', () => {
    const input = new Input();
    input.keyDown('KeyA');
    input.mouseDown(2);
    input.clearAll();
    expect(input.isKeyDown('KeyA')).toBe(false);
    expect(input.isButtonDown(2)).toBe(false);
    expect(input.wasButtonPressed(2)).toBe(false);
  });
});

describe('control bindings', () => {
  it('finds the keys for an action', () => {
    expect(keysForAction(CONTROLS, 'moveUp')).toEqual(['KeyW']);
    expect(keysForAction(CONTROLS, 'buildSlot')).toHaveLength(8);
  });

  it('suppresses browser defaults for Tab, backtick, and every bound key', () => {
    const keys = boundKeys(CONTROLS);
    for (const code of ['Tab', 'Backquote', 'Escape', 'KeyW', 'KeyQ', 'Digit8']) {
      expect(keys.has(code)).toBe(true);
    }
  });
});
