// Browser mock factories must keep their import order (see the feed VRT harness).
/* eslint-disable simple-import-sort/imports */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { renderForVRT, matchVrtFrameScreenshot } from '@/test-utils/vrt';
import { ArenaPostGraph, ArenaPeopleGraph, ArenaTagsGraph } from './ArenaGraph';
import { rankArenaIdeas } from '@/libs/arena/arena';
import { createRef, type ComponentType } from 'react';
import { SocialGraph } from '@/organisms/SocialGraph/SocialGraph';
import type { SocialGraphHandle } from '@/organisms/SocialGraph/SocialGraph.types';
import type { GraphPosition } from '@/libs/graph/graph.types';

const realNow = Date.now;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/arena',
  useSearchParams: () => new URLSearchParams(),
}));
const realMatchMedia = window.matchMedia.bind(window);
beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const media = realMatchMedia(query);
    if (query === '(prefers-reduced-motion: reduce)') Object.defineProperty(media, 'matches', { value: true });
    return media;
  });
});
afterEach(() => {
  Date.now = realNow;
  vi.restoreAllMocks();
});

// Pin fixture coordinates so engine/import timing cannot change the pixel baseline.
// Real unpinned placement is checked in the live browser; canvas and popup rendering
// still use the actual Graph Explorer renderer in these tests.
function fixturePositions(entries: [string, number, number][]) {
  return new Map<string, GraphPosition>(entries.map(([id, x, y]) => [id, { x, y, fx: x, fy: y }]));
}

// Vite does not apply Next's App Router dynamic-import transform. Preserve the
// forwarded canvas ref with React.lazy, as the App Router does in production.
vi.mock('next/dynamic', async () => {
  const { lazy, Suspense } = await import('react');
  return {
    __esModule: true,
    default: (load: () => Promise<{ default: ComponentType<Record<string, unknown>> }>) => {
      const Component = lazy(load);
      return function Dynamic(props: Record<string, unknown>) {
        return (
          <Suspense fallback={null}>
            <Component {...props} />
          </Suspense>
        );
      };
    },
  };
});

vi.mock('@/hooks/useArenaGraphMetadata/useArenaGraphMetadata', () => ({
  useArenaGraphMetadata: () => ({
    loading: false,
    error: false,
    retry: vi.fn(),
    metadata: {
      authors: new Map([
        ['alice', { name: 'Alice', image: null }],
        ['bob', { name: 'Bob', image: null }],
      ]),
      postTags: new Map([
        ['alice:one', ['pubky', 'design']],
        ['bob:two', ['pubky', 'design']],
        ['alice:three', ['pubky']],
      ]),
      reposts: new Map(),
      profileTags: new Map([
        ['alice', ['design']],
        ['bob', ['design']],
      ]),
    },
  }),
}));
vi.mock('@/hooks/useBulkUserAvatars/useBulkUserAvatars', () => ({
  useBulkUserAvatars: () => ({
    usersMap: new Map([
      ['alice', { id: 'alice', name: 'Alice' }],
      ['bob', { id: 'bob', name: 'Bob' }],
    ]),
  }),
}));
vi.mock('./useArenaPostImages', () => ({ useArenaPostImages: () => new Map() }));
vi.mock('@/hooks/useStreamPagination/useStreamPagination', () => ({
  useStreamPagination: () => ({
    postIds: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    error: null,
    loadMore: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock('@/hooks/useArenaIdeas/useArenaIdeas', () => ({
  useArenaIdeas: () => ({ ideas, loading: false, error: null }),
}));
vi.mock('@/hooks/useUserInfoPopoverData/useUserInfoPopoverData', () => ({
  useUserInfoPopoverData: () => ({
    isCurrentUser: false,
    isLoading: false,
    profileBio: 'Building shared views of people, posts and ideas.',
    followers: [],
    following: [],
    followersCount: 90,
    followingCount: 12,
    statsFollowers: 90,
    statsFollowing: 12,
    isFollowing: false,
    isFollowingStatusLoading: false,
  }),
}));
vi.mock('@/hooks/useUserInfoPopoverActions/useUserInfoPopoverActions', () => ({
  useUserInfoPopoverActions: () => ({ isLoading: false, onEditClick: vi.fn(), onFollowClick: vi.fn() }),
}));

const ideas = rankArenaIdeas(
  [
    {
      id: 'alice:one',
      author: 'alice',
      preview: 'A shared view of ideas',
      kind: 'short',
      indexedAt: 1000,
      tags: 12,
      replies: 4,
      reposts: 2,
      replyTo: null,
    },
    {
      id: 'bob:two',
      author: 'bob',
      preview: 'Connections in context',
      kind: 'long',
      indexedAt: 2000,
      tags: 8,
      replies: 2,
      reposts: 1,
      replyTo: 'alice:one',
    },
    {
      id: 'alice:three',
      author: 'alice',
      preview: 'A different perspective',
      kind: 'image',
      indexedAt: 3000,
      tags: 3,
      replies: 0,
      reposts: 0,
      replyTo: null,
    },
  ],
  'popular',
);

describe('Arena graph', () => {
  it('renders ranked tags and opens matching posts without changing filters', async () => {
    const onTopic = vi.fn();
    const topics = ['pubky', 'self-custody', 'ai'].map((label, index) => ({
      label,
      tagged_count: 14 - index,
      taggers_count: 1,
      taggers_id: ['alice'],
    }));
    await renderForVRT(
      <div className="p-6">
        <ArenaTagsGraph
          topics={topics}
          positions={fixturePositions([
            ['tag:pubky', -210, -120],
            ['tag:self-custody', 190, -120],
            ['tag:ai', 0, 140],
            ['user:alice', 0, 0],
          ])}
          topic={null}
          onSelect={vi.fn()}
          onTopic={onTopic}
        />
      </div>,
      { viewport: { width: 1200, height: 850 } },
    );
    Date.now = realNow;
    await expect.poll(() => document.querySelector('canvas')?.width ?? 0).toBeGreaterThan(0);
    await expect.element(page.getByRole('region', { name: 'Arena graph' })).toHaveAttribute('aria-busy', 'false');
    // Painted labels must stay inside the canvas after the camera fits.
    // The old point-only fit clipped the long self-custody chip at the right edge.
    const canvas = document.querySelector('canvas')!;
    const context = canvas.getContext('2d')!;
    for (const x of [0, canvas.width - 4]) {
      const pixels = context.getImageData(x, 0, 4, canvas.height).data;
      expect(
        Array.from(pixels)
          .filter((_, index) => index % 4 === 3)
          .some((alpha) => alpha > 0),
      ).toBe(false);
    }
    await matchVrtFrameScreenshot('arena-graph-tags');
    await page.getByRole('button', { name: 'Top 10' }).click();
    await page.getByRole('button', { name: 'self-custody tag (13 posts)' }).click();
    expect(onTopic).not.toHaveBeenCalled();
    await expect.element(page.getByRole('dialog', { name: 'Rank 2 details' })).toBeVisible();
    await expect.element(page.getByRole('list', { name: 'Matching posts' })).toBeVisible();
  });

  it.each([false, true])('keeps a dragged tag pinned and clickable (reduced motion: %s)', async (reducedMotion) => {
    vi.mocked(window.matchMedia).mockImplementation((query) => {
      const media = realMatchMedia(query);
      if (query === '(prefers-reduced-motion: reduce)') {
        Object.defineProperty(media, 'matches', { value: reducedMotion });
      }
      return media;
    });
    const ref = createRef<SocialGraphHandle>();
    const clicked = vi.fn();
    const positions = fixturePositions([
      ['tag:pubky', -180, 0],
      ['user:alice', 180, 0],
    ]);
    await renderForVRT(
      <div className="h-[650px] p-6">
        <SocialGraph
          ref={ref}
          positions={positions}
          nodes={[
            { kind: 'tag', id: 'tag:pubky', label: 'pubky', count: 12 },
            { kind: 'user', id: 'user:alice', pubky: 'alice', name: 'Alice', image: null },
          ]}
          edges={[{ source: 'tag:pubky', target: 'user:alice', type: 'TAGGED', label: 'pubky' }]}
          focusId={null}
          selectedId={null}
          relationships={new Map()}
          opacityTiers={new Map()}
          sizeTiers={new Map()}
          spotlight={null}
          pathIds={null}
          communities={null}
          communityLabels={new Map()}
          onNodeClick={clicked}
          onNodeExpand={vi.fn()}
          onBackgroundClick={vi.fn()}
        />
      </div>,
      { viewport: { width: 1200, height: 850 } },
    );
    Date.now = realNow;
    await expect.poll(() => ref.current?.isSettled(), { timeout: 10_000 }).toBe(true);
    let previousPoint: { x: number; y: number } | null = null;
    let stableFrames = 0;
    await expect
      .poll(
        () => {
          const point = ref.current?.screenPositionOf('tag:pubky');
          if (!point) return false;
          stableFrames =
            previousPoint && Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) < 0.1
              ? stableFrames + 1
              : 0;
          previousPoint = point;
          return stableFrames >= 4;
        },
        { timeout: 5_000, interval: 100 },
      )
      .toBe(true);
    const canvas = page.elementLocator(document.querySelector('canvas')!);
    await expect
      .poll(async () => {
        const point = ref.current?.screenPositionOf('tag:pubky');
        if (!point) return null;
        await userEvent.hover(canvas, { position: point });
        return ref.current?.hoveredId();
      })
      .toBe('tag:pubky');
    const point = ref.current?.screenPositionOf('tag:pubky');
    if (!point) throw new Error('The graph tag did not render');
    const target = { x: point.x + 70, y: point.y + 70 };
    await userEvent.dragAndDrop(canvas, canvas, { sourcePosition: point, targetPosition: target });
    await expect.poll(() => ref.current?.pinnedIds()).toContain('tag:pubky');
    expect(positions.get('tag:pubky')?.__pinned).toBe(true);
    const moved = ref.current?.screenPositionOf('tag:pubky');
    if (!moved) throw new Error('The dragged tag disappeared');
    expect(Math.hypot(moved.x - point.x, moved.y - point.y)).toBeGreaterThan(50);
    await expect
      .poll(
        async () => {
          const current = ref.current?.screenPositionOf('tag:pubky');
          if (!current) return null;
          await userEvent.hover(canvas, { position: current });
          return ref.current?.hoveredId();
        },
        { timeout: 5_000 },
      )
      .toBe('tag:pubky');
    await userEvent.click(canvas, { position: ref.current!.screenPositionOf('tag:pubky')! });
    await expect.poll(() => clicked.mock.calls, { timeout: 5_000 }).toContainEqual(['tag:pubky']);
  });

  it('renders the reused canvas with ranks and an anchored popup', async () => {
    await renderForVRT(
      <div className="p-6">
        <ArenaPostGraph
          ideas={ideas}
          positions={fixturePositions([
            ['post:alice:one', -230, 0],
            ['post:bob:two', 230, 40],
            ['post:alice:three', -60, 170],
            ['user:alice', -200, -160],
            ['user:bob', 230, -170],
            ['tag:pubky', 0, -90],
            ['tag:design', 30, 50],
          ])}
          metric="popular"
          topic="pubky"
          selectedId="alice:one"
          onSelect={vi.fn()}
          onTopic={vi.fn()}
        />
      </div>,
      { viewport: { width: 1200, height: 850 } },
    );
    // Kapsule's debounced graph updates require an advancing clock. These fixtures
    // have no relative-time UI, so the standard VRT frozen clock is unnecessary.
    Date.now = realNow;
    await expect.poll(() => document.querySelector('canvas')?.width ?? 0).toBeGreaterThan(0);
    await expect.element(page.getByRole('region', { name: 'Arena graph' })).toHaveAttribute('aria-busy', 'false');
    await page.getByRole('button', { name: 'Top 10' }).click();
    await page.getByRole('button', { name: 'Rank 1, A shared view of ideas, 34 points' }).click();
    await expect.element(page.getByRole('dialog', { name: 'Rank 1 details' })).toBeVisible();
    await matchVrtFrameScreenshot('arena-graph-post-popup');
  });

  it('renders people with contextual tags and their existing scores', async () => {
    const users = ['alice', 'bob', 'carol'].map((id, index) => ({
      id,
      name: id,
      bio: '',
      image: null,
      avatarUrl: null,
      status: null,
      counts: { posts: 12, tags: 5, followers: 90 - index * 20, following: 2 },
    }));
    await renderForVRT(
      <div className="p-6">
        <ArenaPeopleGraph
          users={users}
          positions={fixturePositions([
            ['user:alice', 230, 20],
            ['user:bob', -230, 20],
            ['user:carol', -40, -170],
            ['tag:design', 0, 20],
          ])}
          metric="popular"
          topic={null}
          selectedId="alice"
          onSelect={vi.fn()}
          onTopic={vi.fn()}
        />
      </div>,
      { viewport: { width: 1200, height: 850 } },
    );
    Date.now = realNow;
    await expect.poll(() => document.querySelector('canvas')?.width ?? 0).toBeGreaterThan(0);
    await expect.element(page.getByRole('region', { name: 'Arena graph' })).toHaveAttribute('aria-busy', 'false');
    await page.getByRole('button', { name: 'Top 10' }).click();
    await page.getByRole('button', { name: 'Rank 1, alice, 90 followers' }).click();
    await expect.element(page.getByRole('dialog', { name: 'Rank 1 details' })).toBeVisible();
    await matchVrtFrameScreenshot('arena-graph-people');
  });
});
