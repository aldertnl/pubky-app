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
  it.each([false, true])(
    'selects a post and opens the large view without an eye button (isList: %s)',
    async (isList) => {
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
      expect(screen.queryByRole('button', { name: 'See full post' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Rank 1, Jules/ }));
      expect(onSelect).toHaveBeenCalledWith('b:2');
      await waitFor(() => expect(onExpand).toHaveBeenCalledOnce());
      fireEvent.click(screen.getByRole('button', { name: /Rank 2, Mira/ }));
      expect(onSelect).toHaveBeenLastCalledWith('a:1');
      await waitFor(() => expect(onExpand).toHaveBeenCalledTimes(2));
    },
  );

  it('shows the lead below the winning preview even when another post is selected', () => {
    const ranked = rankArenaIdeas(ideas, 'popular');
    render(
      <ArenaFloor ideas={ranked} selectedId="a:1" onSelect={vi.fn()} isList={false} metric="popular" topic="pubky" />,
    );
    const label = screen.getByText('leading by 12 points');
    const leader = screen.getByRole('button', { name: /Rank 1, Jules/ });
    expect(leader).toContainElement(label);
    expect(label.previousElementSibling).toHaveTextContent('Context matters.');
    expect(screen.getByRole('button', { name: /Rank 2, Mira/ })).not.toHaveTextContent('leading by');
  });

  it('renders an image attachment as a clipped full-width mini preview', () => {
    arenaImageMocks.use.mockReturnValue(new Map([['a:1', { src: 'https://example.com/image-feed.jpg', alt: 'Poster' }]]));
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

  it('labels the overall leader All and uses the brand accent without assigning a tag color', () => {
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
    expect(screen.getByRole('button', { name: /Rank 1, Jules/ })).toHaveTextContent('#1 All Posts');
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
      expect(screen.getByRole('button', { name: /Rank 2, Mira/ })).toHaveAttribute('aria-pressed', 'true');
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
    expect(screen.getByRole('button', { name: /Rank 1, Jules/ })).toHaveTextContent('#1 Content');
    rerender(
      <ArenaFloor ideas={rankArenaIdeas(ideas, 'replies')} onSelect={vi.fn()} isList={false} metric="replies" />,
    );
    expect(screen.getByLabelText('129 popularity points')).toBeInTheDocument();
    expect(screen.getByLabelText('7 reposts')).toBeInTheDocument();
  });

  it('makes the leading reply selectable and keeps selection distinct from rank', () => {
    const onSelect = vi.fn();
    render(<ArenaFloor ideas={ideas} selectedId="a:1" onSelect={onSelect} isList={false} metric="tags" />);
    const reply = screen.getByRole('button', { name: /Rank 1, Jules/ });
    expect(reply).toHaveAttribute('aria-pressed', 'false');
    const selected = screen.getByRole('button', { name: /Rank 2, Mira/ });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(selected.closest('[data-slot="card"]')).toHaveClass(styles.selected);
    expect(reply.closest('[data-slot="card"]')).not.toHaveClass(styles.selected);
    fireEvent.click(reply);
    expect(onSelect).toHaveBeenCalledWith('b:2');
    expect(screen.queryByText('Reply')).not.toBeInTheDocument();
  });
  it('shows icon plus number while retaining an accessible metric name', () => {
    render(<ArenaStat kind="posts" count={158} />);
    expect(screen.getByLabelText('158 posts')).toHaveAttribute('title', '158 posts');
    expect(screen.getByText('158')).toBeInTheDocument();
    expect(screen.queryByText('158 posts')).not.toBeInTheDocument();
  });

  it('preserves the selected button and keyboard focus when standings reorder', () => {
    const { rerender } = render(
      <ArenaFloor ideas={ideas} selectedId="b:2" onSelect={vi.fn()} isList={false} metric="tags" />,
    );
    const selected = screen.getByRole('button', { name: /Rank 1, Jules/ });
    selected.focus();
    rerender(
      <ArenaFloor
        ideas={rankArenaIdeas(ideas, 'replies')}
        selectedId="b:2"
        onSelect={vi.fn()}
        isList={false}
        metric="replies"
      />,
    );
    expect(screen.getByRole('button', { name: /Rank 2, Jules/ })).toBe(selected);
    expect(selected).toHaveFocus();
    expect(selected).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows repost counts when ranking by reposts and removes the trophy for Most recent', () => {
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
    expect(screen.getByRole('button', { name: /Rank 1, Jules/ })).toHaveTextContent('#1 Content');
    rerender(
      <ArenaFloor
        ideas={rankArenaIdeas(ideas, 'newest')}
        selectedId="a:1"
        onSelect={vi.fn()}
        isList={false}
        metric="newest"
      />,
    );
    expect(screen.queryByText('#1 Content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Position 1, Jules/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Position 2, Mira/ })).toHaveAttribute('aria-pressed', 'true');
  });
});
