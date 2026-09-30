import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  UserStreamUser,
  UseUserStreamParams,
  UseUserStreamResult,
} from '@/hooks/useUserStream/useUserStream.types';
import { REACH } from '@/stores/home/home.types';
import { TIMEFRAME } from '@/stores/hot/hot.types';
import { useArenaPeople } from './useArenaPeople';

const mocks = vi.hoisted(() => ({
  stream: vi.fn<(params: UseUserStreamParams) => UseUserStreamResult>(),
  search: vi.fn(),
  muted: vi.fn<(id: string) => boolean>(),
}));
vi.mock('@/hooks/useUserStream/useUserStream', () => ({ useUserStream: mocks.stream }));
vi.mock('@/hooks/useMutedUsers/useMutedUsers', () => ({ useMutedUsers: () => ({ isMuted: mocks.muted }) }));
vi.mock('@/controllers/search/search', () => ({ SearchController: { fetchUsersByTags: mocks.search } }));
const person = (id: string, followers = 1): UserStreamUser => ({
  id,
  name: id,
  bio: '',
  image: null,
  avatarUrl: null,
  status: null,
  counts: { posts: 3, tags: 4, followers, following: 0 },
});
const defaults = { timeframe: TIMEFRAME.TODAY, reach: REACH.ALL, topic: null, metric: 'active' } as const;
let stream: UseUserStreamResult;
beforeEach(() => {
  vi.clearAllMocks();
  stream = {
    users: [person('first'), person('second')],
    userIds: ['first', 'second'],
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    error: null,
    loadMore: vi.fn(),
    refetch: vi.fn(),
  };
  mocks.stream.mockImplementation(() => stream);
  mocks.search.mockResolvedValue([]);
  mocks.muted.mockReturnValue(false);
});

describe('useArenaPeople', () => {
  it('reuses the active stream and excludes muted people without profile search for All', () => {
    mocks.muted.mockImplementation((id) => id === 'first');
    const { result } = renderHook(() => useArenaPeople({ ...defaults, reach: REACH.NETWORK }));
    expect(mocks.stream).toHaveBeenCalledWith(
      expect.objectContaining({ streamId: 'influencers:today:wot', includeCounts: true, paginated: true }),
    );
    expect(result.current.users.map(({ id }) => id)).toEqual(['second']);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it('matches profile tags through search rather than tags applied by a user and preserves active order', async () => {
    stream.users[0].tags = ['bitcoin'];
    mocks.search.mockResolvedValue([{ user_id: 'second', score: 1 }]);
    const { result } = renderHook(() => useArenaPeople({ ...defaults, topic: ' Bitcoin ' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.search).toHaveBeenCalledWith({ tags: 'bitcoin', skip: 0, limit: 20 });
    expect(result.current.users.map(({ id }) => id)).toEqual(['second']);
  });
  it('searches beyond the first profile-tag page', async () => {
    mocks.search
      .mockResolvedValueOnce(Array.from({ length: 20 }, (_, i) => ({ user_id: `other${i}`, score: 2 })))
      .mockResolvedValueOnce([{ user_id: 'second', score: 1 }]);
    const { result } = renderHook(() => useArenaPeople({ ...defaults, topic: 'bitcoin' }));
    await waitFor(() => expect(result.current.users[0]?.id).toBe('second'));
    expect(mocks.search).toHaveBeenLastCalledWith({ tags: 'bitcoin', skip: 20, limit: 20 });
  });
  it('fills a filtered result from later activity pages and does not load more for an empty profile search', async () => {
    stream.hasMore = true;
    mocks.search.mockResolvedValue([{ user_id: 'later', score: 1 }]);
    const { result, unmount } = renderHook(() => useArenaPeople({ ...defaults, topic: 'bitcoin' }));
    await waitFor(() => expect(stream.loadMore).toHaveBeenCalled());
    expect(result.current.loading).toBe(true);
    unmount();
    vi.mocked(stream.loadMore).mockClear();
    mocks.search.mockResolvedValue([]);
    const empty = renderHook(() => useArenaPeople({ ...defaults, topic: 'unknown' }));
    await waitFor(() => expect(empty.result.current.loading).toBe(false));
    expect(stream.loadMore).not.toHaveBeenCalled();
  });
  it('inspects later activity pages for count rankings even with ten visible people', async () => {
    stream.users = Array.from({ length: 10 }, (_, i) => person(`user${i}`));
    stream.hasMore = true;
    const { result, rerender } = renderHook(() =>
      useArenaPeople({ ...defaults, metric: 'popular', reach: REACH.NETWORK }),
    );
    await waitFor(() => expect(stream.loadMore).toHaveBeenCalled());
    stream = { ...stream, users: [...stream.users, person('later-leader', 200)], hasMore: false };
    rerender();
    expect(result.current.users[0].id).toBe('later-leader');
    expect(result.current.users).toHaveLength(10);
  });
  it('stops the ordered most-followed everyone stream once ten visible people are available', () => {
    stream.users = Array.from({ length: 10 }, (_, i) => person(`user${i}`, 20 - i));
    stream.hasMore = true;
    const { result } = renderHook(() => useArenaPeople({ ...defaults, metric: 'popular' }));
    expect(result.current.users).toHaveLength(10);
    expect(result.current.loading).toBe(false);
    expect(stream.loadMore).not.toHaveBeenCalled();
  });
  it('stops fetching after a pagination failure and exposes retry', () => {
    stream = { ...stream, hasMore: true, error: 'Failed to fetch users' };
    const { result } = renderHook(() => useArenaPeople({ ...defaults, metric: 'posts' }));
    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
    expect(stream.loadMore).not.toHaveBeenCalled();
    act(() => result.current.retry());
    expect(stream.refetch).toHaveBeenCalled();
  });
  it('ignores an earlier tag response after changing filters', async () => {
    let resolveOld!: (value: { user_id: string; score: number }[]) => void;
    mocks.search
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
      )
      .mockResolvedValueOnce([{ user_id: 'second', score: 1 }]);
    const { result, rerender } = renderHook(({ topic }) => useArenaPeople({ ...defaults, topic }), {
      initialProps: { topic: 'old' },
    });
    rerender({ topic: 'new' });
    await waitFor(() => expect(result.current.users[0]?.id).toBe('second'));
    await act(async () => resolveOld([{ user_id: 'first', score: 2 }]));
    expect(result.current.users.map(({ id }) => id)).toEqual(['second']);
  });
});
