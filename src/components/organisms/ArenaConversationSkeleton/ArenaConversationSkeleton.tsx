import { PostThreadConnector } from '@/atoms/PostThreadConnector/PostThreadConnector';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { cn } from '@/libs/utils/utils';
import styles from '@/organisms/Arena/Arena.module.css';
import { PostCardSkeleton } from '@/organisms/PostCardSkeleton/PostCardSkeleton';
import { PostHeaderSkeleton } from '@/organisms/PostHeader/PostHeader.skeleton';

export function ArenaConversationSkeleton({ label = 'Loading conversation' }: { label?: string }) {
  return (
    <div className={styles.dock} role="status" aria-label={label} aria-busy="true">
      <div className={cn(styles.reader, styles.conversationReader)} aria-hidden="true">
        <PostCardSkeleton />
        <div className={styles.readerReplies}>
          <div className={styles.readerReplyBranch}>
            <Skeleton className="ml-3 h-8 w-44 max-w-full rounded-full" />
          </div>
          <div className="relative flex min-w-0">
            <div className="w-3 shrink-0">
              <PostThreadConnector variant={POST_THREAD_CONNECTOR_VARIANTS.LAST} />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-md border border-dashed border-input p-6">
              <PostHeaderSkeleton showUserInfo={false} />
              <Skeleton className="h-4 w-40 max-w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
