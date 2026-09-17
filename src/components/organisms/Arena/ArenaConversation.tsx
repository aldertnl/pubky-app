'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/atoms/Button/Button';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { useArenaIdeas } from '@/hooks/useArenaIdeas/useArenaIdeas';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import {
  ARENA_PAGE_SIZE,
  filterArenaIdeasByTimeframe,
  getArenaPopularityScore,
  rankArenaIdeas,
} from '@/libs/arena/arena';
import { cn, isPostDeleted } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { buildPostReplyStreamId } from '@/models/stream/post/postStream.types';
import { AwardPostContext } from '@/organisms/Awards/AwardPostContext';
import { PostAwards } from '@/organisms/Awards/PostAwards';
import { PostMain } from '@/organisms/PostMain/PostMain';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { QuickReply } from '@/organisms/QuickReply/QuickReply';
import { TIMEFRAME, type TimeframeType } from '@/stores/hot/hot.types';
import styles from './Arena.module.css';
import { ArenaConversationConnectors } from './ArenaConversationConnectors';
import { ArenaStat } from './ArenaStats';

interface ArenaConversationProps {
  postWindow: { timeframe: TimeframeType; now: number };
  rootId: string;
  selectedId: string;
  showMuted?: boolean;
  postLabel?: string;
  eager?: boolean;
  awardsUser?: string;
  awardsScrollRequest?: number;
}

export function ArenaConversation(props: ArenaConversationProps) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const placeholder = placeholderRef.current;
    if (!placeholder || ready || props.eager) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(placeholder);
    return () => observer.disconnect();
  }, [ready, props.eager]);
  if (ready || props.eager) return <ArenaConversationContent {...props} />;
  return (
    <div ref={placeholderRef} className={styles.dock}>
      <div className={styles.reader} role="status" aria-label="Loading conversation">
        <Skeleton className="h-64 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    </div>
  );
}

function ArenaConversationContent({
  rootId,
  selectedId,
  postWindow,
  showMuted = false,
  postLabel = 'Original post',
  awardsUser,
  awardsScrollRequest,
}: ArenaConversationProps) {
  const readerRef = useRef<HTMLDivElement>(null);
  const originalRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const { postDetails, isLoading } = usePostDetails(rootId);
  const { postCounts } = usePostCounts(rootId);
  const replyStream = useStreamPagination({
    streamId: buildPostReplyStreamId(rootId),
    limit: ARENA_PAGE_SIZE,
    includeMuted: true,
  });
  const { postIds: replyIds, loading, loadingMore, hasMore, error, loadMore } = replyStream;
  const { isMuted } = useMutedUsers();
  const rootIsMuted = !showMuted && isMuted(parseCompositeId(rootId).pubky);
  const { ideas, error: ideasError } = useArenaIdeas([selectedId, ...replyIds], { includeMuted: true });

  // Reply streams arrive by timestamp, not popularity. Check every page before
  // declaring a winner so a highly scored older reply is not missed.
  useEffect(() => {
    if (!loading && !loadingMore && !error && hasMore) void loadMore();
  }, [loading, loadingMore, error, hasMore, loadMore]);

  const replies = rankArenaIdeas(
    filterArenaIdeasByTimeframe(ideas, postWindow.timeframe, postWindow.now).filter(
      (idea) => idea.replyTo === rootId && (showMuted || !isMuted(idea.author)),
    ),
    'popular',
  );
  const leadingReply = replies[0];
  const originalPopularityScore = postCounts
    ? getArenaPopularityScore({
        tags: postCounts.unique_tags,
        replies: postCounts.replies,
        reposts: postCounts.reposts,
      })
    : null;
  const rankingLoading = loading || loadingMore || (hasMore && !error);
  const replyError = error || ideasError;
  const { getPostHref } = usePostNavigation();
  const canReply = !!postDetails && !isPostDeleted(postDetails.content) && !rootIsMuted;

  return (
    <div className={styles.dock}>
      <AwardPostContext.Provider value={true}>
        <PostMainLayoutProvider tagsLayout="inline">
          <div ref={readerRef} className={styles.reader}>
            {canReply && (
              <ArenaConversationConnectors
                key={`${rootId}:${leadingReply?.id ?? ''}:${rankingLoading}:${!!replyError}`}
                readerRef={readerRef}
                originalRef={originalRef}
                replyRef={replyRef}
                composerRef={composerRef}
              />
            )}
            <section aria-label={postLabel}>
              <Typography
                as="h3"
                overrideDefaults
                className={cn(
                  styles.readerHeading,
                  'text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground uppercase',
                )}
              >
                <span className="inline-flex items-center gap-2">
                  <span>{postLabel}</span>
                  {originalPopularityScore !== null && (
                    <ArenaStat kind="popular" count={originalPopularityScore} active />
                  )}
                </span>
              </Typography>
              {rootIsMuted ? (
                <p className="py-5 text-sm text-muted-foreground">Original hidden by your mute settings.</p>
              ) : (
                <div key={rootId} ref={originalRef} className={styles.readerContent}>
                  <PostMain postId={rootId} stackTagsAndActions />
                </div>
              )}
              {!rootIsMuted && (
                <PostAwards
                  key={`awards:${awardsUser ?? rootId}`}
                  postId={rootId}
                  user={awardsUser}
                  scrollRequest={awardsScrollRequest}
                />
              )}
            </section>
            <section aria-label="Replies" aria-busy={rankingLoading}>
              <Typography
                as="h3"
                overrideDefaults
                className={cn(
                  styles.readerHeading,
                  'text-xs leading-4 font-medium tracking-[0.075rem] text-muted-foreground uppercase',
                )}
              >
                <span className="inline-flex items-center gap-2">
                  <span title="Most popular direct reply in the selected timeframe, using lifetime tags + (replies × 4) + (reposts × 3)">
                    LEADING REPLY
                  </span>
                  {leadingReply && <ArenaStat kind="popular" count={leadingReply.score} active />}
                </span>
              </Typography>
              {rankingLoading ? (
                <div role="status" aria-label="Finding most popular reply">
                  <Skeleton className="h-48 w-full rounded-md" />
                  <span className="sr-only">Finding most popular reply…</span>
                </div>
              ) : replyError ? (
                <p role="alert" className="py-3 text-sm text-muted-foreground">
                  Could not rank replies.{' '}
                  <Button size="sm" variant="ghost" onClick={() => void replyStream.refresh()}>
                    Retry replies
                  </Button>
                </p>
              ) : leadingReply ? (
                <div key={leadingReply.id} ref={replyRef} className={styles.readerContent}>
                  <PostMain postId={leadingReply.id} isNavigable={false} stackTagsAndActions />
                </div>
              ) : (
                <p className="py-5 text-sm font-medium text-muted-foreground">
                  {isLoading
                    ? 'Loading conversation…'
                    : postWindow.timeframe === TIMEFRAME.ALL_TIME
                      ? 'No replies yet. Start the conversation.'
                      : 'No replies in this timeframe.'}
                </p>
              )}
              {leadingReply && (
                <div className="mt-3">
                  <Button asChild variant="secondary">
                    <Link href={getPostHref(rootId)}>Show all {postCounts ? `${postCounts.replies} ` : ''}replies</Link>
                  </Button>
                </div>
              )}
              {canReply && (
                <div className="mt-6">
                  <Typography
                    as="h3"
                    overrideDefaults
                    className={cn(
                      styles.readerHeading,
                      'text-xs leading-4 font-medium tracking-[0.075rem] text-muted-foreground uppercase',
                    )}
                  >
                    JOIN THE BATTLE
                  </Typography>
                  <div ref={composerRef}>
                    <QuickReply
                      parentPostId={rootId}
                      placeholder="Reply to original post"
                      showConnector={false}
                      onReplySubmitted={(id) => void replyStream.prependPosts(id)}
                    />
                  </div>
                </div>
              )}
            </section>
          </div>
        </PostMainLayoutProvider>
      </AwardPostContext.Provider>
    </div>
  );
}
