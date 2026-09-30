import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT, REACH } from '@/stores/home/home.types';
import { TIMEFRAME } from '@/stores/hot/hot.types';
import { useArenaHistory } from './useArenaHistory';
import type { ArenaHistoryState } from './useArenaHistory.types';

const initial: ArenaHistoryState = {
  view: 'arena',
  metric: 'popular',
  content: CONTENT.ALL,
  reach: REACH.NETWORK,
  timeframe: TIMEFRAME.THIS_MONTH,
  topic: null,
  defaultReach: true,
};

describe('Arena history', () => {
  beforeEach(() => window.history.replaceState(null, '', '/arena'));
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('serializes the displayed audience so reload preserves it', () => {
    const restore = vi.fn();
    const { result, unmount } = renderHook(() => useArenaHistory(initial, restore, () => REACH.ALL));
    act(() => result.current({ view: 'graph' }));
    expect(new URLSearchParams(window.location.search).get('reach')).toBe(REACH.ALL);
    expect(window.history.state.arenaState.reach).toBe(REACH.NETWORK);
    unmount();
    window.history.replaceState(null, '', window.location.href);
    renderHook(() => useArenaHistory(initial, restore, () => REACH.ALL));
    expect(restore).toHaveBeenLastCalledWith(
      expect.objectContaining({ view: 'graph', reach: REACH.ALL, defaultReach: false, topic: null }),
    );
  });

  it('restores each stored selection on a history navigation event', () => {
    const restore = vi.fn();
    renderHook(() => useArenaHistory(initial, restore, (state) => state.reach));
    const selected = { ...initial, view: 'list' as const, topic: 'pubky', timeframe: TIMEFRAME.TODAY };
    window.history.replaceState({ arenaState: selected }, '', '/arena?view=list&tag=pubky');
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state })));
    expect(restore).toHaveBeenLastCalledWith(selected);
  });

  it('does not push another entry for an unchanged selection', () => {
    const restore = vi.fn();
    const { result } = renderHook(() => useArenaHistory(initial, restore, (state) => state.reach));
    const length = window.history.length;
    act(() => result.current({ view: 'arena' }));
    expect(window.history.length).toBe(length);
    expect(restore).not.toHaveBeenCalled();
  });
});
