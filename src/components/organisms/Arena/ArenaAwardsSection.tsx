'use client';
import { scrollToArenaTarget } from '@/libs/arena/scrollToArenaTarget';
import { useEffect, useRef } from 'react';
import { AwardsContent } from '@/organisms/Awards/AwardsDialog';

export function ArenaAwardsSection({ user, postId, request }: { user: string; postId?: string; request: number }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    return scrollToArenaTarget(ref.current);
  }, [request]);
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label={postId ? 'Awards for this post' : 'User awards'}
      className="mt-6 min-h-[50vh] scroll-mt-[calc(var(--header-height-mobile)+16px)] outline-none lg:scroll-mt-[calc(var(--header-height)+16px)]"
    >
      <h3 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {postId ? 'Awards for this post' : 'User awards'}
      </h3>
      <AwardsContent key={`${user}:${postId ?? ''}`} open embedded showcase user={user} postId={postId} />
    </section>
  );
}
