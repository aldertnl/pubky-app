'use client';
import { useEffect, useRef, useState } from 'react';
import { Typography } from '@/atoms/Typography/Typography';
import { useAwards } from '@/hooks/useAwards/useAwards';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { scrollToArenaTarget } from '@/libs/arena/scrollToArenaTarget';
import type { AwardReceipt } from '@/libs/awards/awards';
import { awardCardStatus,isAwardVisible } from '@/libs/awards/visibility';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { AwardCard } from './AwardCard';
import styles from './Awards.module.css';
import { AwardsDialog } from './AwardsDialog';

export function PostAwards({
  postId,
  user: profileUser,
  scrollRequest = 0,
}: {
  scrollRequest?: number;
} & ({ postId: string; user?: string } | { postId?: string; user: string })) {
  const user = profileUser ?? parseCompositeId(postId!).pubky;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!scrollRequest) return;
    return scrollToArenaTarget(ref.current);
  }, [scrollRequest]);
  const awards = useAwards(user);
  const { profile } = useUserProfile(user as Pubky);
  const ownerName = profile?.name || `${user.slice(0, 8)}…`;
  const [selected, setSelected] = useState<AwardReceipt>();
  const visible =
    awards.state?.awards.filter(
      (award) =>
        (profileUser || (award.source === 'user' && award.postId === postId)) &&
        isAwardVisible(awards.state?.choices[award.id]),
    ) ?? [];
  if (awards.state && !awards.error && !visible.length && !profileUser) return null;

  return (
    <section
      ref={ref}
      id={profileUser ? `user-awards-${user}` : `post-awards-${postId}`}
      tabIndex={-1}
      aria-label={profileUser ? 'User awards' : 'Awards for this post'}
      className="mt-6 scroll-mt-[calc(var(--header-height-mobile)+16px)] outline-none lg:scroll-mt-[calc(var(--header-height)+16px)]"
    >
      <Typography
        as="h3"
        overrideDefaults
        className="mb-3 text-xs leading-4 font-medium tracking-[0.075rem] text-muted-foreground uppercase"
      >
        {profileUser ? `${ownerName}’S AWARDS` : 'POST AWARDS'}
      </Typography>
      <div className={`${styles.gallery} ${styles.galleryUser}`}>
        {visible.map((award) => (
          <AwardCard
            key={award.id}
            badge={award.badge}
            status={awardCardStatus(award, awards.state)}
            showStatus
            onClick={() => setSelected(award)}
          />
        ))}
      </div>
      {awards.error ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {awards.error}
        </p>
      ) : !awards.state ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading awards…
        </p>
      ) : null}
      {profileUser && awards.state && !awards.error && !visible.length && (
        <p className="text-sm text-muted-foreground">No awards yet.</p>
      )}
      {selected && (
        <AwardsDialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(undefined);
          }}
          user={user}
          postId={profileUser ? undefined : postId}
          showcase
          initialAward={selected}
        />
      )}
    </section>
  );
}
