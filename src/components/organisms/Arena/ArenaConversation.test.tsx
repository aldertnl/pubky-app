import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useArenaIdeas } from '@/hooks/useArenaIdeas/useArenaIdeas';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import type { ArenaIdea } from '@/libs/arena/arena';
import { TIMEFRAME } from '@/stores/hot/hot.types';
import { ArenaConversation } from './ArenaConversation';

vi.mock('@/hooks/useArenaIdeas/useArenaIdeas', () => ({ useArenaIdeas: vi.fn() }));
vi.mock('@/hooks/useStreamPagination/useStreamPagination', () => ({ useStreamPagination: vi.fn() }));
vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: () => ({ postDetails: { content: 'Original post' }, isLoading: false }),
}));
vi.mock('@/hooks/usePostCounts/usePostCounts', () => ({
  usePostCounts: () => ({ postCounts: { replies: 27 }, isLoading: false }),
}));
vi.mock('@/hooks/useMutedUsers/useMutedUsers', () => ({ useMutedUsers: vi.fn(() => ({ isMuted: () => false })) }));
vi.mock('@/hooks/usePostNavigation/usePostNavigation', () => ({
  usePostNavigation: () => ({ getPostHref: (id: string) => `/post/${id}` }),
}));
vi.mock('@/organisms/PostMain/PostMain', () => ({
  PostMain: ({ postId }: { postId: string }) => <article aria-label={postId}>{postId}</article>,
}));
vi.mock('@/organisms/QuickReply/QuickReply', () => ({
  QuickReply: ({ parentPostId, placeholder }: { parentPostId: string; placeholder?: string }) => (
    <textarea aria-label={`Reply to ${parentPostId}`} placeholder={placeholder} readOnly />
  ),
}));

const now = Date.UTC(2026, 8, 4);
const day = 24 * 60 * 60 * 1000;
const rootId = 'a:root';
const selectedId = 'b:selected';
const props = { rootId, selectedId, postWindow: { timeframe: TIMEFRAME.THIS_MONTH, now } };
let nearViewport = true;
let enterViewport: () => void;
afterEach(() => vi.unstubAllGlobals());

function idea(id: string, overrides: Partial<ArenaIdea> = {}): ArenaIdea {
  return {
    id,
    author: id.split(':')[0],
    preview: id,
    kind: 'short',
    indexedAt: now - day,
    tags: 0,
    replies: 0,
    reposts: 0,
    replyTo: rootId,
    ...overrides,
  };
}

let ideas: ArenaIdea[];
const loadMore = vi.fn(async () => {});
const refresh = vi.fn(async () => {});
function stream(overrides: Partial<ReturnType<typeof useStreamPagination>> = {}) {
  return {
    postIds: ideas.map(({ id }) => id),
    loading: false,
    loadingMore: false,
    error: null,
    hasMore: false,
    loadMore,
    refresh,
    prependPosts: vi.fn(async () => {}),
    prependOptimisticPosts: vi.fn(),
    removePosts: vi.fn(),
    removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  nearViewport = true;
  vi.mocked(useMutedUsers).mockReturnValue({
    isMuted: () => false,
    mutedUserIds: [],
    mutedUserIdSet: new Set(),
    isLoading: false,
  });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
      observe() {
        enterViewport = () => this.callback([{ isIntersecting: true }]);
        this.callback([{ isIntersecting: nearViewport }]);
      }
      disconnect() {}
      unobserve() {}
    },
  );
  ideas = [
    idea(rootId, { tags: 999, replyTo: null }),
    idea(selectedId, { tags: 11 }),
    idea('c:popular', { tags: 2, replies: 5, reposts: 5 }),
    idea('d:nested', { tags: 1000, replyTo: selectedId }),
  ];
  vi.mocked(useArenaIdeas).mockImplementation(() => ({ ideas, error: null, loading: false }));
  vi.mocked(useStreamPagination).mockReturnValue(stream());
});

describe('Arena leading reply', () => {
  it('reveals muted originals and replies only while the temporary override is active', () => {
    vi.mocked(useMutedUsers).mockReturnValue({
      isMuted: () => true,
      mutedUserIds: [],
      mutedUserIdSet: new Set(),
      isLoading: false,
    });
    const { rerender } = render(<ArenaConversation {...props} />);
    expect(screen.getByText('Original hidden by your mute settings.')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    rerender(<ArenaConversation {...props} showMuted />);
    expect(screen.getByRole('article', { name: rootId })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'c:popular' })).toBeInTheDocument();
    expect(useStreamPagination).toHaveBeenLastCalledWith(expect.objectContaining({ includeMuted: true }));
    rerender(<ArenaConversation {...props} />);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
  it('defers reply loading until the conversation approaches the viewport', () => {
    nearViewport = false;
    render(<ArenaConversation {...props} />);
    expect(useStreamPagination).not.toHaveBeenCalled();
    expect(useArenaIdeas).not.toHaveBeenCalled();
    expect(screen.getByRole('status', { name: 'Loading conversation' })).toBeInTheDocument();
    act(() => enterViewport());
    expect(useStreamPagination).toHaveBeenCalled();
    expect(screen.getByRole('article', { name: 'c:popular' })).toBeInTheDocument();
  });
  it('shows the most popular direct reply instead of the clicked reply, without a rank number', () => {
    render(<ArenaConversation {...props} />);
    const replies = within(screen.getByRole('region', { name: 'Replies' }));
    expect(replies.getByRole('article', { name: 'c:popular' })).toBeInTheDocument();
    expect(replies.queryByRole('article', { name: selectedId })).not.toBeInTheDocument();
    expect(replies.queryByRole('article', { name: rootId })).not.toBeInTheDocument();
    expect(replies.queryByRole('article', { name: 'd:nested' })).not.toBeInTheDocument();
    expect(replies.getByRole('heading', { name: /^LEADING REPLY/ })).toBeInTheDocument();
    expect(screen.queryByText(/#\d/)).not.toBeInTheDocument();
  });

  it('links to all original-post replies before the separate original-post composer', () => {
    render(<ArenaConversation {...props} />);
    const reply = screen.getByRole('article', { name: 'c:popular' });
    const link = screen.getByRole('link', { name: 'Show all 27 replies' });
    const heading = screen.getByRole('heading', { name: 'JOIN THE BATTLE' });
    const composer = screen.getByRole('textbox', { name: `Reply to ${rootId}` });
    expect(link).toHaveAttribute('href', `/post/${rootId}`);
    expect(composer).toHaveAttribute('placeholder', 'Reply to original post');
    expect(reply.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(link.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the shared timeframe and reacts when popularity counts change', () => {
    ideas.push(idea('e:old', { tags: 9999, indexedAt: now - 31 * day }));
    const { rerender } = render(<ArenaConversation {...props} />);
    expect(screen.getByRole('article', { name: 'c:popular' })).toBeInTheDocument();
    ideas = ideas.map((post) => (post.id === selectedId ? { ...post, reposts: 20 } : post));
    rerender(<ArenaConversation {...props} />);
    expect(screen.getByRole('article', { name: selectedId })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'e:old' })).not.toBeInTheDocument();
  });

  it('checks subsequent pages before showing a winner and finds an older popular reply', () => {
    vi.mocked(useStreamPagination).mockReturnValue(stream({ hasMore: true }));
    const { rerender } = render(<ArenaConversation {...props} />);
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status', { name: 'Finding most popular reply' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'c:popular' })).not.toBeInTheDocument();

    vi.mocked(useStreamPagination).mockReturnValue(stream({ hasMore: true, loadingMore: true }));
    rerender(<ArenaConversation {...props} />);
    expect(loadMore).toHaveBeenCalledTimes(1);

    ideas.push(idea('f:older-winner', { tags: 50, indexedAt: now - 20 * day }));
    vi.mocked(useStreamPagination).mockReturnValue(stream());
    rerender(<ArenaConversation {...props} />);
    expect(screen.getByRole('article', { name: 'f:older-winner' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Finding most popular reply' })).not.toBeInTheDocument();
  });

  it('stops pagination on failure and offers retry without declaring a partial leader', () => {
    vi.mocked(useStreamPagination).mockReturnValue(stream({ hasMore: true, error: 'Offline' }));
    render(<ArenaConversation {...props} />);
    expect(loadMore).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not rank replies.');
    expect(screen.queryByRole('article', { name: 'c:popular' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry replies' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not invent a leading reply when none are in the timeframe', () => {
    ideas = [idea(rootId, { replyTo: null }), idea('b:old', { indexedAt: now - 31 * day })];
    render(<ArenaConversation {...props} />);
    const replies = within(screen.getByRole('region', { name: 'Replies' }));
    expect(replies.queryByRole('article')).not.toBeInTheDocument();
    expect(replies.getByText('No replies in this timeframe.')).toBeInTheDocument();
    expect(replies.getByRole('heading', { name: 'LEADING REPLY' })).toBeInTheDocument();
  });
});
