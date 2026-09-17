'use client';

import { PostAwards } from '@/organisms/Awards/PostAwards';
import { Button } from '@/atoms/Button/Button';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { useArenaPersonPost } from '@/hooks/useArenaPersonPost/useArenaPersonPost';
import { formatPublicKey } from '@/libs/utils/utils';
import { TIMEFRAME, type TimeframeType } from '@/stores/hot/hot.types';
import styles from './Arena.module.css';
import { ArenaConversation } from './ArenaConversation';

export function ArenaPersonConversation({
  author,
  authorName,
  postWindow,
  awardsScrollRequest,
  eager,
}: {
  awardsScrollRequest?: number;
  eager?: boolean;
  author: string;
  authorName?: string;
  postWindow: { timeframe: TimeframeType; now: number };
}) {
  const { post, loading, error, retry } = useArenaPersonPost(author, postWindow);
  if (loading || error || !post)
    return (
      <>
        {loading ? (
          <div className={styles.dock} role="status" aria-label="Finding most popular post">
            <div className={styles.reader}>
              <Skeleton className="h-64 w-full rounded-md" />
              <Skeleton className="h-48 w-full rounded-md" />
            </div>
          </div>
        ) : error ? (
          <div className={styles.status} role="alert">
            Could not load this person’s most popular post.{' '}
            <Button variant="ghost" onClick={() => void retry()}>
              Retry post
            </Button>
          </div>
        ) : (
          <div className={styles.status} role="status">
            {postWindow.timeframe === TIMEFRAME.ALL_TIME
              ? 'This person has no posts yet.'
              : 'This person has no posts in this timeframe.'}
          </div>
        )}
        <PostAwards user={author} scrollRequest={awardsScrollRequest} />
      </>
    );
  return (
    <ArenaConversation
      key={post.id}
      awardsUser={author}
      awardsScrollRequest={awardsScrollRequest}
      eager={eager || !!awardsScrollRequest}
      rootId={post.id}
      selectedId={post.id}
      postWindow={postWindow}
      postLabel={`POPULAR POST BY ${authorName || formatPublicKey({ key: author })}`.toUpperCase()}
    />
  );
}
