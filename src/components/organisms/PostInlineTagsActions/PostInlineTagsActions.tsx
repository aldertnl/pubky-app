'use client';

import { useState } from 'react';
import { TagKind } from '@/application/tag/tag.types';
import { Container } from '@/atoms/Container/Container';
import { POST_TAGS_MAX_LENGTH, POST_TAGS_MAX_TOTAL_CHARS } from '@/config/tags';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { cn } from '@/libs/utils/utils';
import { ClickableTagsList } from '../ClickableTagsList/ClickableTagsList';
import { PostActionsBar } from '../PostActionsBar/PostActionsBar';
import { PostTagsPanel } from '../PostTagsPanel/PostTagsPanel';

interface PostInlineTagsActionsProps {
  postId: string;
  savePostId?: string;
  onReplyClick: () => void;
  onRepostClick: () => void;
  className?: string;
  presentation?: 'default' | 'cards';
  actionsClassName?: string;
}

export function PostInlineTagsActions({
  postId,
  savePostId = postId,
  onReplyClick,
  onRepostClick,
  className,
  actionsClassName,
  presentation = 'default',
}: PostInlineTagsActionsProps) {
  const [tagsExpanded, setTagsExpanded] = useState(false);
  // The tag button only reveals the tags. On mobile it must not focus the input and pop the soft
  // keyboard: the `[+]` add control owns autofocus.
  const isMobile = useIsMobile();

  return (
    <Container
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'flex-col items-start gap-3',
        presentation !== 'cards' && '@max-xl/grid:mt-auto',
        className,
      )}
    >
      {tagsExpanded ? (
        <PostTagsPanel
          postId={postId}
          widthMode="fit"
          autoFocusInput={!isMobile}
          enableLoadingSkeleton={false}
          className="flex-1"
        />
      ) : (
        <ClickableTagsList
          taggedId={postId}
          taggedKind={TagKind.POST}
          maxTagLength={POST_TAGS_MAX_LENGTH}
          maxTotalChars={POST_TAGS_MAX_TOTAL_CHARS}
          showCount={true}
          showInput={false}
          showAddButton={presentation !== 'cards'}
          addMode={true}
        />
      )}
      <PostActionsBar
        postId={postId}
        savePostId={savePostId}
        onTagClick={() => setTagsExpanded((prev) => !prev)}
        onReplyClick={onReplyClick}
        onRepostClick={onRepostClick}
        className={actionsClassName}
      />
    </Container>
  );
}
