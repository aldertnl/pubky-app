'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { useArenaIdeas } from '@/hooks/useArenaIdeas/useArenaIdeas';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import { ARENA_PAGE_SIZE, filterArenaIdeasByTimeframe, rankArenaIdeas } from '@/libs/arena/arena';
import { isArticleContent } from '@/libs/post/articleContent';
import { cn, isPostDeleted } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { buildPostReplyStreamId } from '@/models/stream/post/postStream.types';
import { ArenaConversationSkeleton } from '@/organisms/ArenaConversationSkeleton/ArenaConversationSkeleton';
import { AwardPostContext } from '@/organisms/Awards/AwardPostContext';
import { PostAwards } from '@/organisms/Awards/PostAwards';
import { PostArticleDetail } from '@/organisms/PostArticleDetail/PostArticleDetail';
import { PostMain } from '@/organisms/PostMain/PostMain';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { QuickReply } from '@/organisms/QuickReply/QuickReply';
import { TIMEFRAME, type TimeframeType } from '@/stores/hot/hot.types';
import styles from './Arena.module.css';

interface ArenaConversationProps {
  postWindow: { timeframe: TimeframeType; now: number };
  rootId: string;
  selectedId: string;
  showMuted?: boolean;
  postLabel?: string;
  eager?: boolean;
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
    <div ref={placeholderRef}>
      <ArenaConversationSkeleton />
    </div>
  );
}

function ArenaConversationContent({
  rootId,
  selectedId,
  postWindow,
  showMuted = false,
  postLabel = 'Original Post',
}: ArenaConversationProps) {
  const [expandedReply, setExpandedReply] = useState<string | null>(null);
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
  const {
    ideas,
    loading: readingIdeas,
    error: ideasError,
  } = useArenaIdeas([rootId, selectedId, ...replyIds], {
    includeMuted: true,
  });

  // Reply streams arrive by timestamp, not popularity. Check every page before
  // declaring a winner so a highly scored older reply is not missed.
  useEffect(() => {
    if (!loading && !loadingMore && !readingIdeas && !error && !ideasError && hasMore) void loadMore();
  }, [loading, loadingMore, readingIdeas, error, ideasError, hasMore, loadMore]);

  const replies = rankArenaIdeas(
    filterArenaIdeasByTimeframe(ideas, postWindow.timeframe, postWindow.now).filter(
      (idea) => idea.replyTo === rootId && (showMuted || !isMuted(idea.author)),
    ),
    'popular',
  );
  const leadingReply = replies[0];
  const showLeadingReply = !!leadingReply && expandedReply === leadingReply.id;
  const replyError = error || ideasError;
  const rankingLoading = !replyError && (loading || loadingMore || readingIdeas || hasMore);
  const { getPostHref } = usePostNavigation();
  const canReply = !!postDetails && !isPostDeleted(postDetails.content) && !rootIsMuted;

  return (
    <div className={styles.dock}>
      <AwardPostContext.Provider value={true}>
        <PostMainLayoutProvider tagsLayout="inline">
          <div className={cn(styles.reader, styles.conversationReader)}>
            <section
              aria-label={
                postDetails?.kind === 'long'
                  ? 'Article'
                  : ideas.find((idea) => idea.id === rootId)?.replyTo
                    ? 'Reply'
                    : postLabel
              }
            >
              {rootIsMuted ? (
                <p className="py-5 text-sm text-muted-foreground">Original hidden by your mute settings.</p>
              ) : (
                <div key={rootId} className={styles.readerContent}>
                  {postDetails?.kind === 'long' && isArticleContent(postDetails.content) ? (
                    <PostArticleDetail
                      postId={rootId}
                      content={postDetails.content}
                      attachments={postDetails.attachments}
                      isBlurred={postDetails.is_blurred}
                    />
                  ) : (
                    <PostMain postId={rootId} stackTagsAndActions showFullContent isNavigable={false} />
                  )}
                </div>
              )}
              {!rootIsMuted && <PostAwards postId={rootId} showHeading={false} />}
            </section>
            <section aria-label="Replies" aria-busy={rankingLoading} className={styles.readerReplies}>
              <div className={canReply ? styles.readerReplyBranch : undefined}>
                {rankingLoading ? (
                  <div role="status" aria-label="Finding most popular reply" className="ml-3">
                    <Skeleton className="h-8 w-44 max-w-full rounded-full" />
                    <span className="sr-only">Finding most popular reply…</span>
                  </div>
                ) : replyError ? (
                  <p role="alert" className="ml-3 py-3 text-sm text-muted-foreground">
                    Could not rank replies.{' '}
                    <Button size="sm" variant="ghost" onClick={() => void replyStream.refresh()}>
                      Retry replies
                    </Button>
                  </p>
                ) : showLeadingReply ? (
                  <div key={leadingReply.id} className={cn(styles.readerContent, styles.readerReplyContent)}>
                    <Typography
                      as="h3"
                      size="xs"
                      className="mb-3 ml-3 leading-4 tracking-widest whitespace-nowrap text-muted-foreground uppercase"
                    >
                      Leading Reply
                    </Typography>
                    <PostMain
                      postId={leadingReply.id}
                      isReply
                      isLastReply={!canReply}
                      stackTagsAndActions
                      showFullContent
                      isNavigable={false}
                    />
                  </div>
                ) : leadingReply ? (
                  <Button variant="ghost" size="sm" className="ml-3" onClick={() => setExpandedReply(leadingReply.id)}>
                    <MessageCircle aria-hidden="true" />
                    Show leading reply
                  </Button>
                ) : (
                  <p className="ml-3 py-5 text-sm font-medium text-muted-foreground">
                    {isLoading
                      ? 'Loading conversation…'
                      : postWindow.timeframe === TIMEFRAME.ALL_TIME
                        ? 'No replies yet. Start the conversation.'
                        : 'No replies in this timeframe.'}
                  </p>
                )}
                {showLeadingReply && !rankingLoading && !replyError && (
                  <div className="mt-3 ml-3">
                    <Button asChild variant="ghost">
                      <Link href={getPostHref(rootId)}>
                        Show all {postCounts ? `${postCounts.replies} ` : ''}replies
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
              {canReply && (
                <QuickReply
                  parentPostId={rootId}
                  placeholder="Join the battle"
                  showConnector
                  onReplySubmitted={(id) => void replyStream.prependPosts(id)}
                />
              )}
            </section>
          </div>
        </PostMainLayoutProvider>
      </AwardPostContext.Provider>
    </div>
  );
}
