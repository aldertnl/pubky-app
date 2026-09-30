import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rankArenaIdeas } from '@/libs/arena/arena';
import styles from './Arena.module.css';
import { ArenaFloor } from './ArenaFloor';
import { ArenaStat } from './ArenaStats';

vi.mock('@/molecules/PostHeaderTimestamp/PostHeaderTimestamp', () => ({
  PostHeaderTimestamp: ({ timeAgo }: { timeAgo: string }) => <span>{timeAgo}</span>,
}));

vi.mock('@/hooks/useBulkUserAvatars/useBulkUserAvatars', () => ({
  useBulkUserAvatars: () => ({
    usersMap: new Map([
      ['a', { name: 'Mira' }],
      ['b', { name: 'Jules' }],
    ]),
  }),
}));
const arenaImageMocks = vi.hoisted(() => ({ use: vi.fn(() => new Map()) }));
vi.mock('./useArenaPostImages', () => ({ useArenaPostImages: arenaImageMocks.use }));

beforeEach(() => {
  arenaImageMocks.use.mockReset();
  arenaImageMocks.use.mockReturnValue(new Map());
});
const ideas = rankArenaIdeas(
  [
    {
      id: 'a:1',
      author: 'a',
      preview: 'What makes a tag useful?',
      kind: 'short',
      indexedAt: 1,
      tags: 42,
      replies: 18,
      reposts: 1,
      replyTo: null,
    },
    {
      id: 'b:2',
      author: 'b',
      preview: 'Context matters.',
      kind: 'long',
      indexedAt: 2,
      tags: 60,
      replies: 12,
      reposts: 7,
      replyTo: 'a:1',
    },
  ],
  'tags',
);

describe('Arena floor', () => {
  it('shows twelve ranked posts in the grid and ten around the arena', () => {
    const ranked = rankArenaIdeas(
      Array.from({ length: 13 }, (_, index) => ({
        id: `a:${index}`,
        author: 'a',
        preview: `Post ${index}`,
        kind: 'short' as const,
        indexedAt: index,
        tags: 13 - index,
        replies: 0,
        reposts: 0,
        replyTo: null,
      })),
      'tags',
    );
    const { rerender } = render(<ArenaFloor ideas={ranked} onSelect={vi.fn()} isList metric="tags" />);
    expect(screen.getByRole('list', { name: 'Idea standings' }).children).toHaveLength(12);
    rerender(<ArenaFloor ideas={ranked} onSelect={vi.fn()} isList={false} metric="tags" />);
    expect(screen.getByRole('list', { name: 'Idea standings' }).children).toHaveLength(10);
  }, 15_000);

  it.each([false, true])('selects and opens a post in one click (isList: %s)', (isList) => {
    const onSelect = vi.fn();
    const onExpand = vi.fn();
    render(
      <ArenaFloor
        ideas={ideas}
        onSelect={onSelect}
        onExpand={onExpand}
        isList={isList}
        metric="tags"
        selectedId="a:1"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Open full post' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Rank 1, Jules/ }));
    expect(onSelect).toHaveBeenCalledWith('b:2');
    expect(onExpand).toHaveBeenCalledOnce();
    expect(onSelect.mock.invocationCallOrder[0]).toBeLessThan(onExpand.mock.invocationCallOrder[0]);
    fireEvent.click(screen.getByRole('button', { name: /Rank 2, Mira/ }));
    expect(onSelect).toHaveBeenLastCalledWith('a:1');
    expect(onExpand).toHaveBeenCalledTimes(2);
  });

  it('shows the lead below the winning preview even when another post is selected', () => {
    const ranked = rankArenaIdeas(ideas, 'popular');
    render(
      <ArenaFloor ideas={ranked} selectedId="a:1" onSelect={vi.fn()} isList={false} metric="popular" topic="pubky" />,
    );
    const label = screen.getByText('leading by 12 points');
    const leader = screen.getByRole('button', { name: /Rank 1, Jules/ });
    expect(leader).toContainElement(label);
    expect(label.parentElement?.previousElementSibling).toHaveTextContent('Context matters.');
    expect(screen.getByRole('button', { name: /Rank 2, Mira/ })).not.toHaveTextContent('leading by');
  });

  it('renders an image attachment as a clipped full-width mini preview', () => {
    arenaImageMocks.use.mockReturnValue(
      new Map([['a:1', { src: 'https://example.com/image-feed.jpg', alt: 'Poster' }]]),
    );
    render(<ArenaFloor ideas={ideas} selectedId="a:1" onSelect={vi.fn()} isList={false} metric="tags" />);

    const image = document.querySelector('img[src="https://example.com/image-feed.jpg"]');
    if (!(image instanceof HTMLImageElement)) throw new Error('Expected the mini post image to render');
    expect(image).toHaveAttribute('src', 'https://example.com/image-feed.jpg');
    expect(image).toHaveClass('object-cover', 'object-center');
    expect(image.parentElement).toHaveClass(styles.previewMedia);
  });

  it('shows ties accurately and hides the margin for a lone post or Most recent', () => {
    const tied = rankArenaIdeas(
      ideas.map((idea) => ({ ...idea, tags: 10 })),
      'tags',
    );
    const props = { onSelect: vi.fn(), isList: false, metric: 'tags' as const };
    const { rerender } = render(<ArenaFloor {...props} ideas={tied} />);
    expect(screen.getByText('tied for lead')).toBeInTheDocument();
    rerender(<ArenaFloor {...props} ideas={tied.slice(0, 1)} />);
    expect(screen.queryByText(/leading by|tied for lead/)).not.toBeInTheDocument();
    rerender(<ArenaFloor {...props} ideas={rankArenaIdeas(ideas, 'newest')} metric="newest" />);
    expect(screen.queryByText(/leading by|tied for lead/)).not.toBeInTheDocument();
  });

  it('shows the rank as the first stat and uses the brand accent for the overall leader', () => {
    render(
      <ArenaFloor
        ideas={ideas}
        selectedId="b:2"
        onSelect={vi.fn()}
        isList={false}
        metric="tags"
        topic={null}
        contentLabel="Posts"
      />,
    );
    expect(screen.getByLabelText('Rank 1')).toHaveClass(styles.rankStat);
    expect(screen.getByLabelText('Rank 1').parentElement?.firstElementChild).toBe(screen.getByLabelText('Rank 1'));
    expect(screen.queryByText(/All Posts/)).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Idea standings' })).toHaveStyle({ '--arena-topic-color': 'var(--brand)' });
  });

  it('varies rotations on filter changes while selection and the center card stay stable', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    try {
      const props = { ideas, onSelect: vi.fn(), isList: false, metric: 'tags' as const };
      const { rerender } = render(<ArenaFloor {...props} rotationKey="pubky" />);
      const rotation = (name: RegExp) =>
        (screen.getByRole('button', { name }).closest('[data-slot="card"]') as HTMLElement).style.getPropertyValue(
          '--arena-post-rotation',
        );
      await waitFor(() => expect(rotation(/Rank 2, Mira/)).toBe('-3.75deg'));
      expect(rotation(/Rank 1, Jules/)).toBe('-0.75deg');

      random.mockReturnValue(0.75);
      rerender(<ArenaFloor {...props} rotationKey="pubky" selectedId="a:1" />);
      await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(rotation(/Rank 2, Mira/)).toBe('-3.75deg');

      rerender(<ArenaFloor {...props} rotationKey="bitcoin" selectedId="a:1" />);
      await waitFor(() => expect(rotation(/Rank 2, Mira/)).toBe('-2.25deg'));
      expect(rotation(/Rank 1, Jules/)).toBe('0.75deg');
    } finally {
      random.mockRestore();
    }
  });

  it('shows the popularity total with its contributing counts across engagement modes', () => {
    const { rerender } = render(
      <ArenaFloor ideas={rankArenaIdeas(ideas, 'popular')} onSelect={vi.fn()} isList={false} metric="popular" />,
    );
    expect(screen.getByLabelText('129 popularity points')).toHaveAttribute(
      'title',
      '129 popularity points · Tags + (replies × 4) + (reposts × 3)',
    );
    expect(screen.getByLabelText('60 tags')).toBeInTheDocument();
    expect(screen.getByLabelText('12 replies')).toBeInTheDocument();
    expect(screen.getByLabelText('7 reposts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rank 1, Jules/ })).toContainElement(screen.getByLabelText('Rank 1'));
    rerender(
      <ArenaFloor ideas={rankArenaIdeas(ideas, 'replies')} onSelect={vi.fn()} isList={false} metric="replies" />,
    );
    expect(screen.getByLabelText('129 popularity points')).toBeInTheDocument();
    expect(screen.getByLabelText('7 reposts')).toBeInTheDocument();
  });

  it('opens the leading reply without exposing persistent selection', () => {
    const onSelect = vi.fn();
    const onExpand = vi.fn();
    render(
      <ArenaFloor
        ideas={ideas}
        selectedId="a:1"
        onSelect={onSelect}
        onExpand={onExpand}
        isList={false}
        metric="tags"
      />,
    );
    const reply = screen.getByRole('button', { name: /Rank 1, Jules/ });
    expect(reply).toHaveAttribute('aria-haspopup', 'dialog');
    expect(reply).not.toHaveAttribute('aria-pressed');
    expect(screen.getByRole('button', { name: /Rank 2, Mira/ })).not.toHaveAttribute('aria-pressed');
    fireEvent.click(reply);
    expect(onSelect).toHaveBeenCalledWith('b:2');
    expect(onExpand).toHaveBeenCalledOnce();
    expect(screen.queryByText('Reply')).not.toBeInTheDocument();
  });
  it('shows icon plus number while retaining an accessible metric name', () => {
    render(<ArenaStat kind="posts" count={158} />);
    expect(screen.getByLabelText('158 posts')).toHaveAttribute('title', '158 posts');
    expect(screen.getByText('158')).toBeInTheDocument();
    expect(screen.queryByText('158 posts')).not.toBeInTheDocument();
  });

  it('preserves the post button and keyboard focus when standings reorder', () => {
    const { rerender } = render(
      <ArenaFloor ideas={ideas} selectedId="b:2" onSelect={vi.fn()} isList={false} metric="tags" />,
    );
    const post = screen.getByRole('button', { name: /Rank 1, Jules/ });
    post.focus();
    rerender(
      <ArenaFloor
        ideas={rankArenaIdeas(ideas, 'replies')}
        selectedId="b:2"
        onSelect={vi.fn()}
        isList={false}
        metric="replies"
      />,
    );
    expect(screen.getByRole('button', { name: /Rank 2, Jules/ })).toBe(post);
    expect(post).toHaveFocus();
  });

  it('shows repost counts when ranking by reposts and position labels for Most recent', () => {
    const { rerender } = render(
      <ArenaFloor
        ideas={rankArenaIdeas(ideas, 'reposts')}
        selectedId="a:1"
        onSelect={vi.fn()}
        isList={false}
        metric="reposts"
      />,
    );
    expect(screen.getByLabelText('7 reposts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rank 1, Jules/ })).toContainElement(screen.getByLabelText('Rank 1'));
    rerender(
      <ArenaFloor
        ideas={rankArenaIdeas(ideas, 'newest')}
        selectedId="a:1"
        onSelect={vi.fn()}
        isList={false}
        metric="newest"
      />,
    );
    expect(screen.getByRole('button', { name: /Position 1, Jules/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Position 2, Mira/ })).toBeInTheDocument();
  });
});
