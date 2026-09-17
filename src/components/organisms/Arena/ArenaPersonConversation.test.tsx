import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useArenaPersonPost } from '@/hooks/useArenaPersonPost/useArenaPersonPost';
import { PostAwards } from '@/organisms/Awards/PostAwards';
import { TIMEFRAME } from '@/stores/hot/hot.types';
import { ArenaConversation } from './ArenaConversation';
import { ArenaPersonConversation } from './ArenaPersonConversation';

vi.mock('@/hooks/useArenaPersonPost/useArenaPersonPost', () => ({ useArenaPersonPost: vi.fn() }));
vi.mock('./ArenaConversation', () => ({ ArenaConversation: vi.fn(() => <div>Post and leading reply</div>) }));
vi.mock('@/organisms/Awards/PostAwards', () => ({ PostAwards: vi.fn(() => <div>User awards</div>) }));
const props = { author: 'person', authorName: 'Pav', postWindow: { timeframe: TIMEFRAME.THIS_MONTH, now: Date.now() } };
const retry = vi.fn(async () => {});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useArenaPersonPost).mockReturnValue({ post: undefined, loading: false, error: null, retry });
});

describe('person conversation', () => {
  it('reuses the existing post and leading reply conversation for the winning post', () => {
    vi.mocked(useArenaPersonPost).mockReturnValue({
      post: {
        id: 'person:popular',
        author: 'person',
        preview: 'Popular',
        kind: 'short',
        indexedAt: Date.now(),
        tags: 1,
        replies: 1,
        reposts: 0,
        replyTo: null,
        rank: 1,
        score: 5,
      },
      loading: false,
      error: null,
      retry,
    });
    render(<ArenaPersonConversation {...props} />);
    expect(ArenaConversation).toHaveBeenCalledWith(
      {
        awardsUser: 'person',
        awardsScrollRequest: undefined,
        eager: false,
        rootId: 'person:popular',
        selectedId: 'person:popular',
        postWindow: props.postWindow,
        postLabel: 'POPULAR POST BY PAV',
      },
      undefined,
    );
  });

  it('replaces the conversation with a loading state when selection changes', () => {
    const { rerender } = render(<ArenaPersonConversation {...props} />);
    expect(screen.getByText('This person has no posts in this timeframe.')).toBeInTheDocument();
    vi.mocked(useArenaPersonPost).mockReturnValue({ post: undefined, loading: true, error: null, retry });
    rerender(<ArenaPersonConversation {...props} author="another" />);
    expect(screen.getByRole('status', { name: 'Finding most popular post' })).toBeInTheDocument();
    expect(screen.queryByText('Post and leading reply')).not.toBeInTheDocument();
  });

  it('keeps user awards and the trophy scroll target when no post matches', () => {
    render(<ArenaPersonConversation {...props} awardsScrollRequest={2} />);
    expect(screen.getByText('User awards')).toBeInTheDocument();
    expect(PostAwards).toHaveBeenCalledWith({ user: 'person', scrollRequest: 2 }, undefined);
    expect(ArenaConversation).not.toHaveBeenCalled();
  });

  it('offers retry after a loading failure', () => {
    vi.mocked(useArenaPersonPost).mockReturnValue({ post: undefined, loading: false, error: 'Failed', retry });
    render(<ArenaPersonConversation {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry post' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
