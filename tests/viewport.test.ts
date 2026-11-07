import { describe, expect, it } from 'vitest';
import { computeViewport, windowToLogical } from '../src/render/canvas';
import { Camera } from '../src/render/camera';

describe('computeViewport', () => {
  it('letterboxes a wide window with bars on the left and right', () => {
    const vp = computeViewport(1920, 720);
    expect(vp.scale).toBe(1);
    expect(vp.offsetX).toBe(320);
    expect(vp.offsetY).toBe(0);
  });

  it('letterboxes a tall window with bars on the top and bottom', () => {
    const vp = computeViewport(640, 720);
    expect(vp.scale).toBe(0.5);
    expect(vp.offsetX).toBe(0);
    expect(vp.offsetY).toBe(180);
  });
});

describe('windowToLogical', () => {
  it('maps the corners of the letterboxed area to the logical view corners', () => {
    const vp = computeViewport(1920, 720);
    expect(windowToLogical(320, 0, vp)).toEqual({ x: 0, y: 0 });
    expect(windowToLogical(1600, 720, vp)).toEqual({ x: 1280, y: 720 });
  });

  it('accounts for scale', () => {
    const vp = computeViewport(2560, 1440);
    expect(windowToLogical(1280, 720, vp)).toEqual({ x: 640, y: 360 });
  });
});

describe('Camera', () => {
  it('puts its own position at the center of the view', () => {
    const camera = new Camera();
    camera.centerOn(3, -2);
    expect(camera.worldToScreen(3, -2)).toEqual({ x: 640, y: 360 });
    expect(camera.screenToWorld(640, 360)).toEqual({ x: 3, y: -2 });
  });

  it('round-trips world and screen coordinates', () => {
    const camera = new Camera();
    camera.centerOn(10.25, 4.75);
    const screen = camera.worldToScreen(12, 1);
    const world = camera.screenToWorld(screen.x, screen.y);
    expect(world.x).toBeCloseTo(12);
    expect(world.y).toBeCloseTo(1);
  });
});
