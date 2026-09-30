'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/atoms/Button/Button';
import { useArenaIdeas } from '@/hooks/useArenaIdeas/useArenaIdeas';
import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import {
  ARENA_PAGE_SIZE,
  ARENA_TIMEFRAME_PAGE_SIZE,
  getArenaCandidateStreamId,
  getArenaVisibleIdeas,
  rankArenaIdeasForTimeframe,
  type RankedArenaIdea,
  shouldLoadMoreArenaCandidates,
} from '@/libs/arena/arena';
import { CONTENT } from '@/stores/home/home.types';
import { TIMEFRAME, type TimeframeType } from '@/stores/hot/hot.types';
import { ArenaPostCard } from './ArenaPostCard';
import { useArenaPostImages } from './useArenaPostImages';

/** Load the clicked topic without changing the graph's filters or camera. */
export function ArenaGraphTagPosts({
  label,
  postWindow,
  onViewPost,
}: {
  label: string;
  postWindow?: { timeframe: TimeframeType; now: number };
  onViewPost: (idea: RankedArenaIdea) => void;
}) {
  const [openedAt] = useState(Date.now);
  const { timeframe, now } = postWindow ?? { timeframe: TIMEFRAME.ALL_TIME, now: openedAt };
  const streamId = getArenaCandidateStreamId(label, 'popular', timeframe, CONTENT.ALL);
  const bounded = timeframe !== TIMEFRAME.ALL_TIME;
  const stream = useStreamPagination({
    streamId,
    limit: bounded ? ARENA_TIMEFRAME_PAGE_SIZE : ARENA_PAGE_SIZE,
    includeMuted: true,
  });
  const { loading, loadingMore, hasMore, loadMore } = stream;
  const projection = useArenaIdeas(stream.postIds, { includeMuted: true });
  const { isMuted } = useMutedUsers();
  const ranked = rankArenaIdeasForTimeframe(
    projection.ideas.filter((idea) => !isMuted(idea.author)),
    'popular',
    timeframe,
    now,
  );
  const visible = getArenaVisibleIdeas(ranked);
  const needsMore =
    stream.postIds.length > 0 &&
    (bounded
      ? projection.ideas.length === 0 || shouldLoadMoreArenaCandidates(projection.ideas, timeframe, now, CONTENT.ALL)
      : ranked.length < ARENA_PAGE_SIZE);
  const error = stream.error || projection.error;
  const preparingCandidates = loading || loadingMore || projection.loading || (hasMore && needsMore);
  useEffect(() => {
    if (!loading && !loadingMore && !projection.loading && !error && hasMore && needsMore) {
      void loadMore();
    }
  }, [loading, loadingMore, hasMore, loadMore, projection.loading, error, needsMore]);
  const { usersMap } = useBulkUserAvatars(visible.map((idea) => idea.author));
  const images = useArenaPostImages(visible);

  if (error)
    return (
      <div role="alert" className="text-sm text-muted-foreground">
        Could not load posts.{' '}
        <Button variant="ghost" onClick={() => void stream.refresh()}>
          Retry
        </Button>
      </div>
    );
  if (preparingCandidates) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading posts…
      </p>
    );
  }
  if (!visible.length) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        No posts found for this tag in this timeframe.
      </p>
    );
  }
  return (
    <>
      <ol aria-label="Matching posts" className="space-y-3">
        {visible.map((idea) => (
          <li key={idea.id}>
            <ArenaPostCard
              idea={idea}
              metric="popular"
              user={usersMap.get(idea.author)}
              image={images.get(idea.id)}
              presentation="popup"
              onOpen={() => onViewPost(idea)}
            />
          </li>
        ))}
      </ol>
      {stream.loadingMore && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading more posts…
        </p>
      )}
    </>
  );
}
