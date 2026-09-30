import { describe, expect, it } from 'vitest';
import { fitGraphCamera } from './SocialGraph.camera';

describe('graph camera fit', () => {
  it('fits asymmetric painted labels rather than only node centers', () => {
    const bounds = { left: -240, right: 340, top: -140, bottom: 170 };
    const camera = fitGraphCamera(600, 400, () => bounds)!;
    expect(camera.x).toBe(50);
    expect(camera.y).toBe(15);
    expect(camera.zoom * (bounds.right - bounds.left)).toBeLessThanOrEqual(536);
    expect(camera.zoom * (bounds.bottom - bounds.top)).toBeLessThanOrEqual(336);
  });

  it('keeps minimum-size labels visible when zoomed out on a phone', () => {
    const boundsAtZoom = (zoom: number) => ({
      left: -300 - 100 / Math.min(zoom, 1),
      right: 300 + 100 / Math.min(zoom, 1),
      top: -100,
      bottom: 100,
    });
    const camera = fitGraphCamera(390, 500, boundsAtZoom)!;
    const bounds = boundsAtZoom(camera.zoom);
    expect(camera.zoom).toBeLessThan(1);
    expect((bounds.right - camera.x) * camera.zoom).toBeLessThanOrEqual(163.1);
    expect((camera.x - bounds.left) * camera.zoom).toBeLessThanOrEqual(163.1);
  });

  it('does not fit an empty graph or an unmeasured viewport', () => {
    expect(fitGraphCamera(600, 400, () => null)).toBeNull();
    expect(fitGraphCamera(0, 0, () => ({ left: 0, right: 10, top: 0, bottom: 10 }))).toBeNull();
  });
});
