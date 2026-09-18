import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { useArenaPeople } from '@/hooks/useArenaPeople/useArenaPeople';
import type { useArenaPersonPost } from '@/hooks/useArenaPersonPost/useArenaPersonPost';
import type { UseBulkUserAvatarsResult } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars.types';
import type { UseHotTagsResult } from '@/hooks/useHotTags/useHotTags.types';
import type { UseStreamPaginationResult } from '@/hooks/useStreamPagination/useStreamPagination.types';
import type { ArenaIdea } from '@/libs/arena/arena';
import { useAuthStore } from '@/stores/auth/auth.store';
import { REACH } from '@/stores/home/home.types';
import { useHotStore } from '@/stores/hot/hot.store';
import { TIMEFRAME } from '@/stores/hot/hot.types';
import { Arena } from './Arena';

const mocks = vi.hoisted(() => ({
  personPost: vi.fn<typeof useArenaPersonPost>(),
  people: vi.fn<() => ReturnType<typeof useArenaPeople>>(),
  recentPeople: vi.fn<() => ReturnType<typeof useArenaPeople>>(),
  hotTags: vi.fn<() => UseHotTagsResult>(),
  profileStats: vi.fn(),
  stream: vi.fn<() => UseStreamPaginationResult>(),
  avatars: vi.fn<(ids: string[]) => UseBulkUserAvatarsResult>(),
  ideas: vi.fn<() => { ideas: ArenaIdea[]; error: string | null }>(),
  isMuted: vi.fn<(id: string) => boolean>(),
}));
vi.mock('@/hooks/useBulkUserAvatars/useBulkUserAvatars', () => ({ useBulkUserAvatars: mocks.avatars }));
vi.mock('@/hooks/useMutedUsers/useMutedUsers', () => ({ useMutedUsers: () => ({ isMuted: mocks.isMuted }) }));
vi.mock('@/hooks/useHotTags/useHotTags', () => ({ useHotTags: mocks.hotTags }));
vi.mock('@/hooks/useProfileStats/useProfileStats', () => ({ useProfileStats: mocks.profileStats }));
vi.mock('@/hooks/useStreamPagination/useStreamPagination', () => ({ useStreamPagination: mocks.stream }));
vi.mock('@/hooks/useArenaPersonPost/useArenaPersonPost', () => ({ useArenaPersonPost: mocks.personPost }));
vi.mock('@/hooks/useArenaPeople/useArenaPeople', () => ({ useArenaPeople: mocks.people }));
vi.mock('@/hooks/useArenaRecentPeople/useArenaRecentPeople', () => ({ useArenaRecentPeople: mocks.recentPeople }));
vi.mock('@/hooks/useArenaIdeas/useArenaIdeas', () => ({ useArenaIdeas: mocks.ideas }));
vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ requireAuth: (onAuthenticated: () => void) => onAuthenticated() }),
}));

function chooseAll() {
  fireEvent.click(screen.getByRole('button', { name: 'Choose topic tag' }));
  fireEvent.click(screen.getByRole('button', { name: 'all' }));
}

describe('Arena filters and topic standings', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((media: string) => ({
        matches: false,
        media,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    mocks.personPost.mockReturnValue({ post: undefined, loading: false, error: null, retry: vi.fn() });
    mocks.people.mockReturnValue({ users: [], loading: false, error: null, retry: vi.fn() });
    mocks.recentPeople.mockReturnValue({ users: [], loading: false, error: null, retry: vi.fn() });
    mocks.isMuted.mockReturnValue(false);
    mocks.profileStats.mockReturnValue({
      stats: { followers: 10, following: 10 },
      isLoading: false,
    });
    mocks.ideas.mockReturnValue({ ideas: [], error: null });
    mocks.avatars.mockReturnValue({
      usersMap: new Map(),
      getUsersWithAvatars: (ids) => ids.map((id) => ({ id, name: id })),
      isLoading: false,
    });
    useAuthStore.setState({ currentUserPubky: null });
    useHotStore.setState({ reach: REACH.ALL, timeframe: TIMEFRAME.THIS_MONTH, hasUserSetReach: false });
    mocks.hotTags.mockReturnValue({
      tags: [{ name: 'pubky', count: 10 }],
      rawTags: [{ label: 'pubky', tagged_count: 10, taggers_count: 1, taggers_id: [] }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.stream.mockReturnValue({
      postIds: [],
      loading: false,
      loadingMore: false,
      error: null,
      hasMore: false,
      loadMore: vi.fn(),
      refresh: vi.fn(),
      prependPosts: vi.fn(),
      prependOptimisticPosts: vi.fn(),
      removePosts: vi.fn(),
      removePostsOptimistically: vi.fn(),
    });
  });

  function setMutedPost(overrides: Partial<ArenaIdea> = {}) {
    mocks.isMuted.mockImplementation((id) => id === 'muted');
    mocks.ideas.mockReturnValue({
      ideas: [
        {
          id: 'muted:post',
          author: 'muted',
          preview: 'A hidden idea',
          kind: 'short',
          indexedAt: Date.now(),
          tags: 1,
          replies: 0,
          reposts: 0,
          replyTo: null,
          ...overrides,
        },
      ],
      error: null,
    });
  }

  it.each(['Most active', 'Most posted'])(
    'automatically switches to people for %s and restores a valid post ranking',
    async (ranking) => {
      const user = userEvent.setup();
      render(<Arena />);
      await user.click(screen.getByRole('button', { name: 'Ranking: Most popular' }));
      await user.click(screen.getByRole('menuitem', { name: ranking }));
      expect(screen.getByRole('button', { name: 'Content: People' })).toBeInTheDocument();
      expect(mocks.people).toHaveBeenLastCalledWith(
        expect.objectContaining({ metric: ranking === 'Most active' ? 'active' : 'posts', topic: 'pubky' }),
      );
      await user.click(screen.getByRole('button', { name: 'Content: People' }));
      await user.click(screen.getByRole('menuitem', { name: 'Posts' }));
      expect(screen.getByRole('button', { name: 'Ranking: Most popular' })).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'People standings' })).not.toBeInTheDocument();
    },
  );

  it('places People above the default Content selection and preserves the people followers ranking', async () => {
    const user = userEvent.setup();
    render(<Arena />);
    await user.click(screen.getByRole('button', { name: 'Content: Content' }));
    expect(
      screen
        .getAllByRole('menuitem')
        .slice(0, 2)
        .map((item) => item.textContent),
    ).toEqual(['People', 'Content']);
    expect(screen.getByRole('menuitem', { name: 'Content' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('separator')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'People' }));
    expect(mocks.people).toHaveBeenLastCalledWith(expect.objectContaining({ metric: 'popular' }));
    await user.click(screen.getByRole('button', { name: 'Ranking: Most popular' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Most popular',
      'Most active',
      'Most replied',
      'Most tagged',
      'Most posted',
      'Most reposted',
      'Most recent',
    ]);
  });

  it.each([
    ['Most reposted', 'Content'],
    ['Most recent', 'People'],
  ])('keeps every option visible and uses %s with %s', async (ranking, content) => {
    const user = userEvent.setup();
    render(<Arena />);
    await user.click(screen.getByRole('button', { name: 'Content: Content' }));
    await user.click(screen.getByRole('menuitem', { name: 'People' }));
    await user.click(screen.getByRole('button', { name: 'Ranking: Most popular' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(7);
    await user.click(screen.getByRole('menuitem', { name: ranking }));
    expect(screen.getByRole('button', { name: `Content: ${content}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Ranking: ${ranking}` })).toBeInTheDocument();
  });

  it('keeps Most replied in People mode and displays the authored reply count', async () => {
    mocks.people.mockReturnValue({
      users: [
        {
          id: 'person',
          name: 'Person',
          avatarUrl: null,
          image: null,
          bio: '',
          status: null,
          counts: { tags: 4, posts: 12, replies: 8, followers: 23, following: 0 },
        },
      ],
      loading: false,
      error: null,
      retry: vi.fn(),
    });
    const user = userEvent.setup();
    render(<Arena />);
    await user.click(screen.getByRole('button', { name: 'Ranking: Most popular' }));
    await user.click(screen.getByRole('menuitem', { name: 'Most replied' }));
    await user.click(screen.getByRole('button', { name: 'Content: Content' }));
    await user.click(screen.getByRole('menuitem', { name: 'People' }));
    expect(screen.getByRole('button', { name: 'Ranking: Most replied' })).toBeInTheDocument();
    expect(mocks.people).toHaveBeenLastCalledWith(expect.objectContaining({ metric: 'replies' }));
    expect(
      within(screen.getByRole('list', { name: 'People standings' })).getByLabelText('8 replies'),
    ).toBeInTheDocument();
  });

  it('selects a person and updates their post conversation while preserving avatar stats', async () => {
    mocks.people.mockReturnValue({
      users: [
        {
          id: 'person',
          name: 'Person',
          avatarUrl: null,
          image: null,
          bio: '',
          status: null,
          counts: { tags: 4, posts: 12, followers: 23, following: 0 },
        },
        { id: 'second', name: 'Second person', avatarUrl: null, image: null, bio: '', status: null },
      ],
      loading: false,
      error: null,
      retry: vi.fn(),
    });
    const user = userEvent.setup();
    render(<Arena />);
    await user.click(screen.getByRole('button', { name: 'Ranking: Most popular' }));
    await user.click(screen.getByRole('menuitem', { name: 'Most active' }));
    const floor = screen.getByRole('list', { name: 'People standings' });
    const first = within(floor).getByRole('button', { name: 'Rank 1, Person. Show most popular post' });
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.personPost).toHaveBeenLastCalledWith(
      'person',
      expect.objectContaining({ timeframe: TIMEFRAME.THIS_MONTH }),
    );
    for (const label of ['4 tags', '12 posts', '23 followers'])
      expect(within(floor).getByLabelText(label)).toBeInTheDocument();
    expect(screen.getByLabelText('Original post conversation')).toBeInTheDocument();
    await user.click(within(floor).getByRole('button', { name: 'Rank 2, Second person. Show most popular post' }));
    expect(first).toHaveAttribute('aria-pressed', 'false');
    expect(mocks.personPost).toHaveBeenLastCalledWith(
      'second',
      expect.objectContaining({ timeframe: TIMEFRAME.THIS_MONTH }),
    );
  });

  it('explains a muted-only result and allows a reversible temporary reveal', () => {
    setMutedPost();
    render(<Arena />);
    expect(screen.getByText('Posts are hidden by your mute settings.')).toBeInTheDocument();
    expect(screen.queryByText('No posts found for this tag.')).not.toBeInTheDocument();
    expect(screen.queryByText('A hidden idea')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show muted' }));
    expect(screen.getByText('A hidden idea')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide muted' }));
    expect(screen.queryByText('A hidden idea')).not.toBeInTheDocument();
    expect(screen.getByText('Posts are hidden by your mute settings.')).toBeInTheDocument();
  });

  it('ranks visible contenders from first place and restores muted contenders on demand', () => {
    setMutedPost({ tags: 99 });
    const hidden = mocks.ideas().ideas[0];
    mocks.ideas.mockReturnValue({
      ideas: [hidden, { ...hidden, id: 'visible:post', author: 'visible', preview: 'Visible idea', tags: 1 }],
      error: null,
    });
    render(<Arena />);
    expect(screen.getByRole('button', { name: /Rank 1,.*Visible idea/ })).toBeInTheDocument();
    expect(screen.queryByText('A hidden idea')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show muted' }));
    expect(screen.getByRole('button', { name: /Rank 1,.*A hidden idea/ })).toBeInTheDocument();
  });

  it('does not blame muting when muted posts fall outside the timeframe', () => {
    setMutedPost({ indexedAt: Date.UTC(2000, 0, 1) });
    render(<Arena />);
    expect(screen.getByText('No posts found for this tag.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show muted' })).not.toBeInTheDocument();
  });

  it('resets the temporary reveal after a topic change and when Reset is clicked', () => {
    setMutedPost();
    render(<Arena />);
    fireEvent.click(screen.getByRole('button', { name: 'Show muted' }));
    chooseAll();
    expect(screen.queryByText('A hidden idea')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show muted' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.queryByText('A hidden idea')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show muted' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.queryByText('A hidden idea')).not.toBeInTheDocument();
  });

  it('shows at most three taggers without a counter, fetching only deduplicated visible profiles', () => {
    const rawTags = Array.from({ length: 10 }, (_, index) => ({
      label: `topic${index}`,
      tagged_count: 662,
      taggers_count: 11,
      taggers_id: [
        'shared',
        'shared',
        `tagger${index}a`,
        `tagger${index}b`,
        `tagger${index}c`,
        `tagger${index}d`,
        `overflow${index}`,
      ],
    }));
    mocks.hotTags.mockReturnValue({ ...mocks.hotTags(), rawTags });
    render(<Arena />);

    for (const tag of rawTags) {
      const stack = screen.getByTestId(`arena-topic-taggers-${tag.label}`);
      expect(stack.children).toHaveLength(3);
      expect(stack).not.toHaveTextContent(/\+/);
      expect(screen.getByRole('group', { name: `${tag.label} topic taggers` })).toContainElement(stack);
      const topicButton = screen.getByRole('button', { name: `${tag.label} tag (662 posts)` });
      expect(topicButton).not.toContainElement(stack);
    }
    expect(mocks.avatars).toHaveBeenLastCalledWith([
      'shared',
      ...rawTags.flatMap((_, index) => [`tagger${index}a`, `tagger${index}b`]),
    ]);
    expect(screen.queryByText('+659')).not.toBeInTheDocument();
  });

  it('excludes muted taggers and hides empty stacks', () => {
    mocks.isMuted.mockImplementation((id) => id === 'muted');
    mocks.hotTags.mockReturnValue({
      ...mocks.hotTags(),
      rawTags: [
        {
          label: 'pubky',
          tagged_count: 20,
          taggers_count: 5,
          taggers_id: ['muted', 'one', 'one', 'two', 'three', 'four'],
        },
      ],
    });
    const { rerender } = render(<Arena />);
    expect(mocks.avatars).toHaveBeenLastCalledWith(['one', 'two', 'three']);
    expect(screen.getByTestId('arena-topic-taggers-pubky').children).toHaveLength(3);

    mocks.isMuted.mockReturnValue(true);
    rerender(<Arena />);
    expect(screen.queryByTestId('arena-topic-taggers-pubky')).not.toBeInTheDocument();
    expect(mocks.avatars).toHaveBeenLastCalledWith([]);
  });

  it('does not expose the capped Nexus total and fills visible slots after muting', () => {
    mocks.hotTags.mockReturnValue({
      ...mocks.hotTags(),
      rawTags: [
        {
          label: 'pubky',
          tagged_count: 662,
          taggers_count: 20,
          taggers_id: Array.from({ length: 20 }, (_, i) => `tagger${i}`),
        },
      ],
    });
    const { rerender } = render(<Arena />);
    expect(screen.getByTestId('arena-topic-taggers-pubky').children).toHaveLength(3);
    expect(screen.getByTestId('arena-topic-taggers-pubky')).not.toHaveTextContent(/\+/);
    expect(mocks.avatars).toHaveBeenLastCalledWith(['tagger0', 'tagger1', 'tagger2']);

    mocks.isMuted.mockImplementation((id) => id === 'tagger0');
    rerender(<Arena />);
    expect(screen.getByTestId('arena-topic-taggers-pubky').children).toHaveLength(3);
    expect(mocks.avatars).toHaveBeenLastCalledWith(['tagger1', 'tagger2', 'tagger3']);
  });

  it('updates the stack with topic data and shows no overflow for a single tagger', () => {
    mocks.hotTags.mockReturnValue({
      ...mocks.hotTags(),
      rawTags: [{ label: 'pubky', tagged_count: 20, taggers_count: 1, taggers_id: ['one'] }],
    });
    const { rerender } = render(<Arena />);
    expect(screen.getByRole('group', { name: 'pubky topic taggers' })).toBeInTheDocument();
    expect(screen.getByTestId('arena-topic-taggers-pubky').children).toHaveLength(1);

    mocks.hotTags.mockReturnValue({
      ...mocks.hotTags(),
      rawTags: [{ label: 'music', tagged_count: 3, taggers_count: 2, taggers_id: ['two', 'three'] }],
    });
    rerender(<Arena />);
    expect(screen.queryByTestId('arena-topic-taggers-pubky')).not.toBeInTheDocument();
    expect(screen.getByTestId('arena-topic-taggers-music').children).toHaveLength(2);
    expect(mocks.avatars).toHaveBeenLastCalledWith(['two', 'three']);
  });

  it('keeps avatar loading limited to the arena view', async () => {
    const user = userEvent.setup();
    mocks.hotTags.mockReturnValue({
      ...mocks.hotTags(),
      rawTags: [{ label: 'pubky', tagged_count: 20, taggers_count: 1, taggers_id: ['one'] }],
    });
    render(<Arena />);
    expect(screen.getByTestId('arena-topic-taggers-pubky')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View: In arena' }));
    await user.click(screen.getByRole('menuitem', { name: 'In grid' }));
    expect(screen.queryByTestId('arena-topic-taggers-pubky')).not.toBeInTheDocument();
    expect(mocks.avatars).toHaveBeenLastCalledWith([]);
  });

  it('switches from the top tag to an unfiltered stream and back through the same picker', () => {
    render(<Arena />);
    expect(mocks.stream).toHaveBeenLastCalledWith({
      streamId: 'timeline:all:all:pubky',
      limit: 50,
      includeMuted: true,
    });
    chooseAll();
    expect(mocks.stream).toHaveBeenLastCalledWith({ streamId: 'timeline:all:all', limit: 50, includeMuted: true });
    expect(screen.getByRole('button', { name: 'Choose topic tag' })).toHaveTextContent('all');
    expect(screen.getByText('No posts found for these filters.')).toBeInTheDocument();
    expect(screen.queryByTestId('arena-tag-connectors')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose topic tag' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Top tags' })).getByRole('button', { name: 'pubky tag (10 posts)' }),
    );
    expect(mocks.stream).toHaveBeenLastCalledWith({
      streamId: 'timeline:all:all:pubky',
      limit: 50,
      includeMuted: true,
    });
  });

  it.each(['loading', 'error', 'empty'])('loads All independently of %s trending tags', (state) => {
    mocks.hotTags.mockReturnValue({
      tags: [],
      rawTags: [],
      isLoading: state === 'loading',
      error: state === 'error' ? 'Unavailable' : null,
      refetch: vi.fn(),
    });
    render(<Arena />);
    expect(mocks.stream).not.toHaveBeenCalled();
    chooseAll();
    expect(mocks.stream).toHaveBeenLastCalledWith({ streamId: 'timeline:all:all', limit: 50, includeMuted: true });
    expect(screen.getByText('No posts found for these filters.')).toBeInTheDocument();
  });

  it('retains All across content, timeframe, and reach changes, and Reset returns to the top tag', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ currentUserPubky: 'viewer' });
    render(<Arena />);
    chooseAll();
    await user.click(screen.getByRole('button', { name: 'Content: Content' }));
    await user.click(screen.getByRole('menuitem', { name: 'Posts' }));
    expect(screen.getByRole('button', { name: 'Choose topic tag' })).toHaveTextContent('all');
    await user.click(screen.getByRole('button', { name: 'Timeframe: This month’s' }));
    await user.click(screen.getByRole('menuitem', { name: 'All-time' }));
    expect(mocks.stream).toHaveBeenLastCalledWith({
      streamId: 'total_engagement:all:all',
      limit: 24,
      includeMuted: true,
    });
    await user.click(screen.getByRole('button', { name: 'Reach: From everyone' }));
    await user.click(screen.getByRole('menuitem', { name: 'From my network' }));
    expect(mocks.stream).toHaveBeenLastCalledWith({
      streamId: 'total_engagement:wot:all',
      limit: 24,
      includeMuted: true,
    });
    expect(screen.getByRole('button', { name: 'Choose topic tag' })).toHaveTextContent('all');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByRole('button', { name: 'Choose topic tag' })).toHaveTextContent('pubky');
    expect(mocks.stream).toHaveBeenLastCalledWith({
      streamId: 'timeline:all:all:pubky',
      limit: 50,
      includeMuted: true,
    });
  });

  it('defaults a small network to From everyone', () => {
    useAuthStore.setState({ currentUserPubky: 'viewer' });
    useHotStore.setState({ reach: REACH.NETWORK, hasUserSetReach: false });
    mocks.profileStats.mockReturnValue({ stats: { followers: 1, following: 1 }, isLoading: false });

    render(<Arena />);

    expect(screen.getByRole('button', { name: 'Reach: From everyone' })).toBeInTheDocument();
  });

  it('keeps an explicitly selected network reach for a small network', () => {
    useAuthStore.setState({ currentUserPubky: 'viewer' });
    useHotStore.setState({ reach: REACH.NETWORK, hasUserSetReach: true });
    mocks.profileStats.mockReturnValue({ stats: { followers: 1, following: 1 }, isLoading: false });

    render(<Arena />);

    expect(screen.getByRole('button', { name: 'Reach: From my network' })).toBeInTheDocument();
  });
});
