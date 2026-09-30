import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGraphHoverMotion } from './useGraphHoverMotion';

describe('graph hover motion', () => {
  let now: number;
  let nextFrame: number;
  let frames: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    now = 0;
    nextFrame = 0;
    frames = new Map();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  function advance(ms: number) {
    act(() => {
      now += ms;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(now));
    });
  }

  it('grows smoothly, shrinks on leave, and stops scheduling frames after settling', () => {
    const { result, rerender } = renderHook(({ id }) => useGraphHoverMotion(id, null, false), {
      initialProps: { id: 'tag:pubky' as string | null },
    });
    advance(60);
    expect(result.current.get('tag:pubky')).toBeGreaterThan(0);
    expect(result.current.get('tag:pubky')).toBeLessThan(1);
    advance(120);
    expect(result.current.get('tag:pubky')).toBe(1);
    expect(frames.size).toBe(0);
    rerender({ id: null });
    advance(60);
    expect(result.current.get('tag:pubky')).toBeGreaterThan(0);
    expect(result.current.get('tag:pubky')).toBeLessThan(1);
    advance(120);
    expect(result.current.size).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('retargets from the current size instead of snapping during rapid hover changes', () => {
    const { result, rerender } = renderHook(({ id }) => useGraphHoverMotion(id, null, false), {
      initialProps: { id: 'post:one' },
    });
    advance(60);
    const previous = result.current.get('post:one')!;
    rerender({ id: 'user:alice' });
    expect(result.current.get('post:one')).toBe(previous);
    advance(60);
    expect(result.current.get('post:one')).toBeLessThan(previous);
    expect(result.current.get('user:alice')).toBeGreaterThan(0);
    advance(120);
    expect(result.current.has('post:one')).toBe(false);
    expect(result.current.get('user:alice')).toBe(1);
  });

  it('animates actionable edge chips and cancels scheduled work on unmount', () => {
    const { result, unmount } = renderHook(() => useGraphHoverMotion(null, 'edge:one', false));
    advance(60);
    expect(result.current.get('edge:one')).toBeGreaterThan(0);
    unmount();
    expect(frames.size).toBe(0);
  });

  it('disables growth and cancels the animation when reduced motion is enabled', () => {
    const { result, rerender } = renderHook(({ reduced }) => useGraphHoverMotion('tag:pubky', null, reduced), {
      initialProps: { reduced: false },
    });
    advance(60);
    rerender({ reduced: true });
    expect(result.current.size).toBe(0);
    expect(frames.size).toBe(0);
  });
});
