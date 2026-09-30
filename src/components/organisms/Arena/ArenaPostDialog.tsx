'use client';

import { type ReactNode, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { useArenaIdeas } from '@/hooks/useArenaIdeas/useArenaIdeas';
import type { ArenaIdea } from '@/libs/arena/arena';
import { cn } from '@/libs/utils/utils';
import { TIMEFRAME, type TimeframeType } from '@/stores/hot/hot.types';
import styles from './Arena.module.css';
import { ArenaConversation } from './ArenaConversation';

function ArenaPostHeading({ postId }: { postId: string }) {
  const { ideas } = useArenaIdeas([postId], { includeMuted: true });
  const idea = ideas.find((idea) => idea.id === postId);
  if (idea?.kind === 'long') return 'Article';
  return idea?.replyTo ? 'Reply' : 'Original Post';
}

export function ArenaFullscreenLayer({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
}) {
  const trigger = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overrideDefaults
        centered
        className={cn(
          'relative m-3 flex h-auto max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-[calc(var(--container-max-width)-2*var(--filter-bar-width)+2px)] flex-col overflow-hidden rounded-xl border border-border bg-background p-0 font-medium shadow-2xl sm:m-3',
          styles.fullscreenLayer,
        )}
        onOpenAutoFocus={() => {
          trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus({ preventScroll: true });
        }}
      >
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
          <DialogHeader className="pr-10">
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ArenaPostDialog({
  idea,
  open,
  onOpenChange,
  postWindow,
  showMuted,
}: {
  idea: ArenaIdea;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postWindow?: { timeframe: TimeframeType; now: number };
  showMuted?: boolean;
}) {
  const [openedAt] = useState(Date.now);
  const rootId = idea.replyTo ?? idea.id;
  return (
    <ArenaFullscreenLayer open={open} onOpenChange={onOpenChange} title={<ArenaPostHeading postId={rootId} />}>
      <ArenaConversation
        key={rootId}
        eager
        postWindow={postWindow ?? { timeframe: TIMEFRAME.ALL_TIME, now: openedAt }}
        rootId={rootId}
        selectedId={idea.id}
        showMuted={showMuted}
      />
    </ArenaFullscreenLayer>
  );
}
