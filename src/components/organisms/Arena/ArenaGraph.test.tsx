import { forwardRef, type ReactElement, type ReactNode, useImperativeHandle } from 'react';
import { fireEvent, render, type RenderOptions, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { rankArenaIdeas } from '@/libs/arena/arena';
import type { SocialGraphHandle, SocialGraphProps } from '@/organisms/SocialGraph/SocialGraph.types';
import { TIMEFRAME } from '@/stores/hot/hot.types';
import { ArenaPeopleGraph, ArenaPostGraph, ArenaTagsGraph } from './ArenaGraph';

const mocks = vi.hoisted(() => ({
  metadata: vi.fn(),
  fit: vi.fn(),
  graph: vi.fn(),
  navigate: vi.fn(),
  profile: vi.fn(),
  stream: vi.fn(),
  ideas: vi.fn(),
}));
vi.mock('@/hooks/useStreamPagination/useStreamPagination', () => ({ useStreamPagination: mocks.stream }));
vi.mock('@/hooks/useArenaIdeas/useArenaIdeas', () => ({ useArenaIdeas: mocks.ideas }));
vi.mock('@/hooks/useArenaGraphMetadata/useArenaGraphMetadata', () => ({ useArenaGraphMetadata: mocks.metadata }));
vi.mock('@/hooks/useTrackedPoint/useTrackedPoint', () => ({ useTrackedPoint: () => ({ x: 180, y: 180 }) }));
vi.mock('@/hooks/useBulkUserAvatars/useBulkUserAvatars', () => ({
  useBulkUserAvatars: () => ({ usersMap: new Map([['author', { id: 'author', name: 'Author' }]]) }),
}));
vi.mock('@/hooks/useMutedUsers/useMutedUsers', () => ({
  useMutedUsers: () => ({ isMuted: (id: string) => id === 'muted' }),
}));
vi.mock('./useArenaPostImages', () => ({ useArenaPostImages: () => new Map() }));
vi.mock('./ArenaConversation', () => ({
  ArenaConversation: ({ rootId, selectedId }: { rootId: string; selectedId: string }) => (
    <p>{`Conversation ${rootId}, selected ${selectedId}`}</p>
  ),
}));
vi.mock('@/hooks/usePostNavigation/usePostNavigation', () => ({
  usePostNavigation: () => ({ navigateToPost: mocks.navigate }),
}));
vi.mock('@/molecules/UserInfoPopover/components/UserInfoPopoverContent/UserInfoPopoverContent', () => ({
  UserInfoPopoverContent: (props: { userId: string; userName: string }) => {
    mocks.profile(props);
    return <p>Feed profile {props.userName}</p>;
  },
}));
vi.mock('@/molecules/UserInfoPopover/components/UserInfoPopoverHeader/UserInfoPopoverHeader', () => ({
  UserInfoPopoverHeader: ({ userName, beforePublicKey }: { userName: string; beforePublicKey?: ReactNode }) => (
    <div>
      <p>{userName}</p>
      {beforePublicKey}
    </div>
  ),
}));
vi.mock('@/organisms/SocialGraph/SocialGraph', () => ({
  SocialGraph: forwardRef<SocialGraphHandle, SocialGraphProps>(function MockGraph(props, ref) {
    mocks.graph(props);
    useImperativeHandle(
      ref,
      () => ({
        fit: mocks.fit,
        zoomIn: vi.fn(),
        zoomOut: vi.fn(),
        screenPositionOf: () => null,
        screenMidpointOf: () => null,
        centerOn: vi.fn(),
        setPaused: vi.fn(),
        releasePins: vi.fn(),
        nodeIds: () => ({ user: [], post: [], tag: [], profile_tag: [] }),
        pinnedIds: () => [],
        isSettled: () => true,
        zoomLevel: () => 1,
        hoveredId: () => null,
      }),
      [],
    );
    return (
      <div data-testid="canvas">
        {props.nodes.map((node) => (
          <button key={node.id} onClick={() => props.onNodeClick(node.id)}>
            {node.id}
          </button>
        ))}
      </div>
    );
  }),
}));

const ideas = rankArenaIdeas(
  Array.from({ length: 12 }, (_, index) => ({
    id: `author:p${index}`,
    author: 'author',
    preview: `Idea ${index}`,
    kind: 'short',
    indexedAt: Date.now(),
    tags: 20 - index,
    replies: 0,
    reposts: 0,
    replyTo: null,
  })),
  'popular',
);

beforeEach(() => {
  mocks.stream.mockReset();
  mocks.ideas.mockReset();
  mocks.stream.mockReturnValue({
    postIds: ideas.map((idea) => idea.id),
    loading: false,
    loadingMore: false,
    hasMore: false,
    error: null,
    loadMore: vi.fn(),
    refresh: vi.fn(),
  });
  mocks.ideas.mockReturnValue({ ideas, loading: false, error: null });
  mocks.graph.mockClear();
  mocks.fit.mockClear();
  mocks.navigate.mockClear();
  mocks.profile.mockClear();
  mocks.metadata.mockReturnValue({
    metadata: { authors: new Map(), postTags: new Map(), reposts: new Map(), profileTags: new Map() },
    loading: false,
    error: false,
    retry: vi.fn(),
  });
});

async function renderGraph(ui: ReactElement, options?: RenderOptions) {
  const result = render(ui, options);
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Arena graph' })).toHaveAttribute('aria-busy', 'false'),
  );
  return result;
}

describe('Arena graph interaction', () => {
  it.each(['Posts', 'Articles'])('labels the top ten %s menu for the selected content type', async (contentLabel) => {
    await renderGraph(
      <ArenaPostGraph
        ideas={ideas}
        metric="popular"
        contentLabel={contentLabel}
        topic={null}
        onSelect={vi.fn()}
        onTopic={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: `Top #10 ${contentLabel.toLowerCase()}` }));
    expect(within(screen.getByRole('list', { name: 'Graph standings' })).getAllByRole('listitem')).toHaveLength(10);
  });

  it('lists the top ten people and opens the tenth profile from the standings menu', async () => {
    const users = Array.from({ length: 12 }, (_, index) => ({
      id: `person${index}`,
      name: `Person ${index}`,
      bio: '',
      image: null,
      avatarUrl: null,
      status: null,
      counts: { followers: 100 - index, posts: 0, following: 0, replies: 0, tags: 0 },
    }));
    const onSelect = vi.fn();
    await renderGraph(
      <ArenaPeopleGraph users={users} metric="popular" topic={null} onSelect={onSelect} onTopic={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Top #10 people' }));
    const standings = screen.getByRole('list', { name: 'Graph standings' });
    expect(within(standings).getAllByRole('listitem')).toHaveLength(10);
    expect(within(standings).queryByRole('button', { name: /Rank 11/ })).not.toBeInTheDocument();
    const tenthPerson = within(standings).getByRole('button', { name: 'Rank 10, Person 9, 91 followers' });
    expect(within(tenthPerson).getByLabelText('91 followers')).toBeInTheDocument();
    fireEvent.click(tenthPerson);
    expect(screen.getByRole('dialog', { name: 'Rank 10 details' })).toHaveTextContent('Feed profile Person 9');
    expect(onSelect).toHaveBeenCalledWith('person9');
  });

  it('connects the top ten tags to their visible taggers', async () => {
    const topics = Array.from({ length: 11 }, (_, index) => ({
      label: `topic${index}`,
      tagged_count: 30 - index,
      taggers_count: 5,
      taggers_id: ['author', 'second', 'muted', 'third', 'fourth'],
    }));
    await renderGraph(<ArenaTagsGraph topics={topics} topic={null} onSelect={vi.fn()} onTopic={vi.fn()} />);
    const graph = mocks.graph.mock.lastCall?.[0] as SocialGraphProps;
    expect(graph.nodes.filter((node) => node.kind === 'tag')).toHaveLength(10);
    expect(graph.nodes.filter((node) => node.kind === 'user')).toHaveLength(3);
    expect(graph.nodes.filter((node) => node.kind === 'post')).toHaveLength(0);
    expect(graph.edges).toHaveLength(30);
    expect(graph.nodes.some((node) => node.id === 'user:muted')).toBe(false);
    expect(graph.tagRanks?.get('topic0')).toBe(1);
    expect(graph.tagRanks?.get('topic9')).toBe(10);
    expect(graph.tagRanks?.get('topic10')).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Top #10 tags' }));
    const standings = screen.getByRole('list', { name: 'Graph standings' });
    expect(within(standings).getAllByRole('listitem')).toHaveLength(10);
    const tenthTag = within(standings).getByRole('listitem', { name: 'Rank 10: topic9' });
    fireEvent.click(within(tenthTag).getByRole('button', { name: 'topic9 tag (21 posts)' }));
    expect(screen.getByRole('dialog', { name: 'Rank 10 details' })).toHaveTextContent("Top #10 posts for 'topic9'");
  });

  it('opens top-tag posts in an overlay without changing filters or fitting the graph', async () => {
    const onTopic = vi.fn();
    const onSelect = vi.fn();
    await renderGraph(
      <ArenaTagsGraph
        topics={[{ label: 'pubky', tagged_count: 14, taggers_count: 0, taggers_id: [] }]}
        topic={null}
        onSelect={onSelect}
        onTopic={onTopic}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'tag:pubky' }));
    expect(onTopic).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    const popup = screen.getByRole('dialog', { name: 'Rank 1 details' });
    expect(screen.getByRole('region', { name: 'Arena graph' })).toContainElement(popup);
    expect(within(popup).getByRole('list', { name: 'Matching posts' })).toBeInTheDocument();
    expect(within(popup).getAllByRole('listitem')).toHaveLength(10);
    expect(mocks.stream).toHaveBeenCalledWith(expect.objectContaining({ streamId: expect.stringMatching(/:pubky$/) }));
    expect(mocks.fit).not.toHaveBeenCalled();
    expect(within(popup).queryByRole('button', { name: 'View post' })).not.toBeInTheDocument();
    fireEvent.click(within(popup).getByRole('button', { name: /Rank 1, Author: Idea 0/ }));
    expect(screen.getByRole('dialog', { name: 'Original Post' })).toHaveTextContent('Conversation author:p0');
    expect(mocks.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(within(popup).getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('limits tag-overlay posts to the selected timeframe and excludes muted authors', async () => {
    const now = Date.now();
    mocks.ideas.mockReturnValue({
      ideas: [
        { ...ideas[0], id: 'author:recent', preview: 'Inside selected week', indexedAt: now },
        { ...ideas[1], id: 'author:old', preview: 'Outside selected week', indexedAt: now - 8 * 86400000 },
        { ...ideas[2], author: 'muted', id: 'muted:hidden', preview: 'Hidden author', indexedAt: now },
      ],
      loading: false,
      error: null,
    });
    await renderGraph(
      <ArenaTagsGraph
        topics={[{ label: 'pubky', tagged_count: 14, taggers_count: 0, taggers_id: [] }]}
        postWindow={{ timeframe: TIMEFRAME.THIS_WEEK, now }}
        topic={null}
        onSelect={vi.fn()}
        onTopic={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'tag:pubky' }));
    expect(screen.getByText('Inside selected week')).toBeInTheDocument();
    expect(screen.queryByText('Outside selected week')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden author')).not.toBeInTheDocument();
  });

  it('waits for the full tag scan before mounting the matching post stack', async () => {
    mocks.stream.mockReturnValue({ ...mocks.stream(), hasMore: true });
    const graph = () => (
      <ArenaTagsGraph
        topics={[{ label: 'pubky', tagged_count: 14, taggers_count: 0, taggers_id: [] }]}
        postWindow={{ timeframe: TIMEFRAME.THIS_MONTH, now: Date.now() }}
        topic={null}
        onSelect={vi.fn()}
        onTopic={vi.fn()}
      />
    );
    const { rerender } = await renderGraph(graph());
    fireEvent.click(screen.getByRole('button', { name: 'tag:pubky' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading posts');
    expect(screen.queryByRole('list', { name: 'Matching posts' })).not.toBeInTheDocument();
    expect(mocks.stream().loadMore).toHaveBeenCalled();
    mocks.stream.mockReturnValue({ ...mocks.stream(), loadingMore: true });
    rerender(graph());
    expect(screen.queryByRole('list', { name: 'Matching posts' })).not.toBeInTheDocument();
    mocks.stream.mockReturnValue({ ...mocks.stream(), hasMore: false, loadingMore: false });
    mocks.ideas.mockReturnValue({ ...mocks.ideas(), loading: true });
    rerender(graph());
    expect(screen.queryByRole('list', { name: 'Matching posts' })).not.toBeInTheDocument();
    mocks.ideas.mockReturnValue({ ...mocks.ideas(), loading: false });
    rerender(graph());
    expect(screen.getByRole('list', { name: 'Matching posts' }).children).toHaveLength(10);
  });

  it('offers retry when top-tag posts fail to load', async () => {
    const refresh = vi.fn();
    mocks.stream.mockReturnValue({ ...mocks.stream(), error: 'Failed', refresh });
    await renderGraph(
      <ArenaTagsGraph
        topics={[{ label: 'pubky', tagged_count: 14, taggers_count: 0, taggers_id: [] }]}
        topic={null}
        onSelect={vi.fn()}
        onTopic={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'tag:pubky' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load posts.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('shows only the selected ranking stat in graph labels and post overlays', async () => {
    const post = { ...ideas[0], tags: 3, replies: 2, reposts: 1 };
    const props = { topic: null, onSelect: vi.fn(), onTopic: vi.fn() };
    const { rerender } = await renderGraph(
      <ArenaPostGraph {...props} ideas={rankArenaIdeas([post], 'replies')} metric="replies" />,
      { wrapper: TooltipProvider },
    );
    const annotation = () => (mocks.graph.mock.lastCall?.[0] as SocialGraphProps).annotations?.get(`post:${post.id}`);
    expect(annotation()?.stats).toEqual([{ kind: 'replies', value: '2' }]);
    fireEvent.click(screen.getByRole('button', { name: `post:${post.id}` }));
    const popup = screen.getByRole('dialog');
    expect(within(popup).getByLabelText('2 replies')).toBeInTheDocument();
    expect(within(popup).queryByLabelText('14 popularity points')).not.toBeInTheDocument();
    for (const [metric, value] of [
      ['popular', '14'],
      ['tags', '3'],
      ['reposts', '1'],
    ] as const) {
      rerender(<ArenaPostGraph {...props} ideas={rankArenaIdeas([post], metric)} metric={metric} />);
      expect(annotation()?.stats).toEqual([{ kind: metric, value }]);
    }
    rerender(<ArenaPostGraph {...props} ideas={rankArenaIdeas([post], 'newest')} metric="newest" />);
    expect(annotation()?.stats).toEqual([{ kind: 'time', value: expect.any(String) }]);
  });

  it('omits tag ranks from the Content graph', async () => {
    const topTags = Array.from({ length: 11 }, (_, index) => ({
      label: `Tag${index}`,
      tagged_count: 100 - index,
      taggers_count: 1,
      taggers_id: ['author'],
    }));
    await renderGraph(
      <ArenaPostGraph
        ideas={ideas}
        metric="popular"
        topic={null}
        topTags={topTags}
        onSelect={vi.fn()}
        onTopic={vi.fn()}
      />,
    );
    expect(mocks.graph).toHaveBeenCalledWith(
      expect.objectContaining({
        tagRanks: new Map(),
      }),
    );
  });

  it('enriches the visible ten only and opens the selected post inside the graph without fitting the camera', async () => {
    const onSelect = vi.fn();
    await renderGraph(
      <ArenaPostGraph
        ideas={ideas}
        metric="popular"
        topic="pubky"
        selectedId={ideas[0].id}
        onSelect={onSelect}
        onTopic={vi.fn()}
      />,
    );
    expect(screen.getByText('Top #10 content')).toBeInTheDocument();
    expect(mocks.metadata).toHaveBeenCalledWith(
      ideas.slice(0, 10).map((idea) => idea.id),
      Array(10).fill('author'),
      false,
    );
    expect(screen.queryByText('post:author:p10')).not.toBeInTheDocument();
    const contenderMenu = screen.getByRole('button', { name: 'Top #10 content' });
    fireEvent.click(contenderMenu);
    expect(within(screen.getByRole('list', { name: 'Graph standings' })).getAllByRole('listitem')).toHaveLength(10);
    const contender = screen.getByRole('button', { name: 'Rank 2, Idea 1, 19 points' });
    fireEvent.click(contender);
    const popup = screen.getByRole('dialog', { name: 'Rank 2 details' });
    const miniPost = within(popup).getByRole('button', { name: /Rank 2, Author: Idea 1/ });
    expect(within(popup).getByText('Idea 1')).toBeInTheDocument();
    expect(within(popup).getByRole('heading', { name: 'Post' })).toBeVisible();
    expect(within(popup).getByLabelText('19 popularity points')).toBeInTheDocument();
    expect(within(popup).queryByRole('button', { name: 'View post' })).not.toBeInTheDocument();
    fireEvent.click(miniPost);
    expect(screen.getByRole('dialog', { name: 'Original Post' })).toHaveTextContent(
      'Conversation author:p1, selected author:p1',
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(miniPost);
    expect(screen.getByRole('dialog', { name: 'Original Post' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('region', { name: 'Arena graph' })).toContainElement(popup);
    expect(onSelect).toHaveBeenCalledWith('author:p1');
    expect(mocks.fit).not.toHaveBeenCalled();
    expect(screen.queryByRole('list', { name: 'Graph standings' })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(contenderMenu).toHaveFocus();
    fireEvent.click(contenderMenu);
    fireEvent.click(screen.getByRole('button', { name: 'Rank 10, Idea 9, 11 points' }));
    expect(screen.getByRole('dialog', { name: 'Rank 10 details' })).toHaveTextContent('Idea 9');
    expect(onSelect).toHaveBeenLastCalledWith('author:p9');
  });

  it('opens matching posts without a tag heading or changing the chosen contender', async () => {
    mocks.metadata().metadata.postTags = new Map([
      ['author:p0', ['shared']],
      ['author:p1', ['shared']],
    ]);
    const onSelect = vi.fn();
    const onTopic = vi.fn();
    await renderGraph(
      <ArenaPostGraph ideas={ideas} metric="tags" topic={null} onSelect={onSelect} onTopic={onTopic} />,
    );
    fireEvent.click(screen.getByText('user:author'));
    expect(screen.getByRole('dialog', { name: 'Author details' })).toBeInTheDocument();
    expect(screen.queryByText('Author', { exact: true })).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('tag:shared'));
    const matches = screen.getByRole('list', { name: 'Matching posts' });
    expect(within(matches).getAllByRole('listitem')).toHaveLength(2);
    expect(within(matches).getByText('Idea 0')).toBeInTheDocument();
    expect(within(matches).queryByText('Idea 2')).not.toBeInTheDocument();
    fireEvent.click(within(matches).getByRole('button', { name: /Rank 1, Author: Idea 0/ }));
    expect(screen.getByRole('dialog', { name: 'Original Post' })).toHaveTextContent('Conversation author:p0');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onTopic).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Use as topic' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open shared topic' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(onTopic).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Tag shared' })).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes the popup before leaving full screen with Escape', async () => {
    await renderGraph(
      <ArenaPostGraph ideas={ideas} metric="popular" topic={null} onSelect={vi.fn()} onTopic={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    fireEvent.click(screen.getByText('post:author:p0'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit full screen' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument();
  });

  it('shows exact People ranking units even when profile tags are unavailable', async () => {
    mocks.metadata().error = true;
    const users = [
      {
        id: 'person',
        name: 'Alice',
        bio: '',
        image: null,
        avatarUrl: null,
        status: null,
        counts: { posts: 10, followers: 3, following: 2, replies: 12, tags: 41 },
      },
    ];
    await renderGraph(
      <ArenaPeopleGraph users={users} metric="tags" topic={null} onSelect={vi.fn()} onTopic={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('user:person'));
    expect(screen.getByRole('dialog', { name: 'Rank 1 details' })).not.toHaveTextContent('41 tags applied');
    expect(screen.getByText('Feed profile Alice')).toBeInTheDocument();
    expect(mocks.profile).toHaveBeenCalledWith(expect.objectContaining({ userId: 'person', userName: 'Alice' }));
    expect(screen.queryByText('Lines: shared profile tags')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Graph information' }));
    expect(screen.getByText('Ranks follow the selected sorting option.')).toBeInTheDocument();
    expect(screen.getByText('Some connections unavailable.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry connections' }));
    expect(mocks.metadata().retry).toHaveBeenCalledOnce();
    expect(mocks.graph.mock.lastCall?.[0].nodes).toHaveLength(1);
  });

  it('lists only the people connected to the inspected tag, preserving their ranks', async () => {
    const users = ['Alice', 'Bob', 'Carol'].map((name) => ({
      id: name,
      name,
      bio: '',
      image: null,
      avatarUrl: null,
      status: null,
    }));
    mocks.metadata().metadata.profileTags = new Map([
      ['Alice', ['shared']],
      ['Carol', ['shared']],
    ]);
    await renderGraph(
      <ArenaPeopleGraph users={users} metric="popular" topic={null} onSelect={vi.fn()} onTopic={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('tag:shared'));
    const matches = screen.getByRole('list', { name: 'Matching people' });
    expect(within(matches).getAllByRole('listitem')).toHaveLength(2);
    expect(within(matches).getByLabelText('Rank 1')).toBeInTheDocument();
    expect(within(matches).getByLabelText('Rank 3')).toBeInTheDocument();
    expect(matches).toHaveTextContent('Alice');
    expect(matches).toHaveTextContent('Carol');
    expect(within(matches).queryByText('Bob')).not.toBeInTheDocument();
  });
});
