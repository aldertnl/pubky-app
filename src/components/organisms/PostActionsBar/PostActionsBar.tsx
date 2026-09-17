'use client';

import { useState } from 'react';
import { cva } from 'class-variance-authority';
import { Ellipsis, MessageCircle, Repeat, Tag, Trophy } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { cn } from '@/libs/utils/utils';
import { RecognizeDialog } from '@/organisms/Awards/RecognizeDialog';
import { useAuthStore } from '@/stores/auth/auth.store';
import { PostMenuActions } from '../PostMenuActions/PostMenuActions';
import { PostSavePicker } from '../PostSavePicker/PostSavePicker';
import { POST_ACTION_COUNT_TYPOGRAPHY_CLASS } from './PostActionsBar.constants';
import { PostActionsBarSkeleton } from './PostActionsBar.skeleton';
import type { ActionButtonConfig, PostActionsBarProps } from './PostActionsBar.types';
import { usePostTagCountMode } from './PostTagCountContext';

const postActionsButtonVariants = cva('', {
  variants: {
    variant: {
      default: 'border-none shadow-xs',
      visual: 'border-white/10 bg-black/40 text-white shadow-none hover:border-white/30 hover:bg-black/70',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});
const postActionsCountVariants = cva(POST_ACTION_COUNT_TYPOGRAPHY_CLASS, {
  variants: {
    variant: {
      default: 'text-muted-foreground',
      visual: 'text-white/80',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});
export function PostActionsBar({
  postId,
  onTagClick,
  onReplyClick,
  onRepostClick,
  className,
  variant = 'default',
}: PostActionsBarProps) {
  const [recognizeOpen, setRecognizeOpen] = useState(false);
  const currentUser = useAuthStore((state) => state.currentUserPubky);
  const isOwnPost = postId.split(':')[0] === currentUser;
  const { postCounts, isLoading: isCountsLoading } = usePostCounts(postId);
  const tagCountMode = usePostTagCountMode();
  const { postDetails } = usePostDetails(postId);
  const { requireAuth } = useRequireAuth();
  const buttonClassName = postActionsButtonVariants({
    variant,
  });
  const countClassName = postActionsCountVariants({
    variant,
  });
  if (isCountsLoading || !postCounts) {
    return <PostActionsBarSkeleton className={className} />;
  }
  const commonButtonProps = {
    variant: 'secondary' as const,
    size: 'sm' as const,
    className: buttonClassName,
  };
  const tagCount = (tagCountMode === 'applications' ? postCounts.tags : postCounts.unique_tags) ?? 0;
  const isCollection = postDetails?.kind === 'collection';
  const actionButtons: ActionButtonConfig[] = [
    {
      id: 'tag',
      icon: Tag,
      count: tagCount,
      onClick: () => onTagClick?.(),
      ariaLabel: `Tag post (${tagCount})`,
    },
    {
      id: 'reply',
      icon: MessageCircle,
      count: postCounts.replies,
      onClick: () => requireAuth(() => onReplyClick?.()),
      ariaLabel: `Reply to post (${postCounts.replies})`,
    },
    {
      id: 'repost',
      icon: Repeat,
      count: postCounts.reposts,
      onClick: () => requireAuth(() => onRepostClick?.()),
      ariaLabel: `Repost (${postCounts.reposts})`,
    },
  ];
  const moreButton = (
    <Button {...commonButtonProps} aria-label="More options" data-cy="post-more-btn">
      <Ellipsis />
    </Button>
  );
  return (
    <Container overrideDefaults className={cn('flex flex-wrap gap-2', className)}>
      {actionButtons.map(
        ({ id, icon: Icon, count, onClick, ariaLabel, className: btnClassName, iconProps, disabled }) => (
          <Button
            key={id}
            data-cy={`post-${id}-btn`}
            {...commonButtonProps}
            onClick={onClick}
            disabled={disabled}
            className={cn(commonButtonProps.className, btnClassName)}
            aria-label={ariaLabel}
          >
            <Icon {...iconProps} />
            {count !== undefined && (
              <Typography as="span" overrideDefaults className={countClassName}>
                {count}
              </Typography>
            )}
          </Button>
        ),
      )}
      {!isCollection && <PostSavePicker postId={postId} buttonClassName={buttonClassName} />}
      {!isOwnPost && (
        <Button
          {...commonButtonProps}
          aria-label="Recognize contribution"
          title="Recognize contribution"
          onClick={(event) => {
            event.stopPropagation();
            requireAuth(() => setRecognizeOpen(true));
          }}
        >
          <Trophy />
        </Button>
      )}
      <PostMenuActions postId={postId} trigger={moreButton} />
      {recognizeOpen && <RecognizeDialog postId={postId} open onOpenChange={setRecognizeOpen} />}
    </Container>
  );
}
