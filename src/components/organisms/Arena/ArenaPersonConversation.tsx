'use client';

import { Button } from '@/atoms/Button/Button';
import { useArenaPersonPost } from '@/hooks/useArenaPersonPost/useArenaPersonPost';
import { formatPublicKey } from '@/libs/utils/utils';
import { ArenaConversationSkeleton } from '@/organisms/ArenaConversationSkeleton/ArenaConversationSkeleton';
import { TIMEFRAME, type TimeframeType } from '@/stores/hot/hot.types';
import styles from './Arena.module.css';
import { ArenaConversation } from './ArenaConversation';

export function ArenaPersonConversation({
  author,
  authorName,
  postWindow,
  eager,
}: {
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
          <ArenaConversationSkeleton label="Finding most popular post" />
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
      </>
    );
  return (
    <ArenaConversation
      key={post.id}
      eager={eager}
      rootId={post.id}
      selectedId={post.id}
      postWindow={postWindow}
      postLabel={`POPULAR POST BY ${authorName || formatPublicKey({ key: author })}`.toUpperCase()}
    />
  );
}
