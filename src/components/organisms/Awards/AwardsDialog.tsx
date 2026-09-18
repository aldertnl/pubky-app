'use client';
import { useState } from 'react';
import { Compass, Gift, Trophy } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Label } from '@/atoms/Label/Label';
import { useAwards } from '@/hooks/useAwards/useAwards';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { type AwardReceipt, type BadgeId, badges } from '@/libs/awards/awards';
import { awardCardStatus, isAwardVisible } from '@/libs/awards/visibility';
import { MobileTabBar } from '@/molecules/MobileTabBar/MobileTabBar';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AwardCard } from './AwardCard';
import { AwardDetails } from './AwardDetails';
import { AwardGivenDetails } from './AwardGivenDetails';
import { AwardRecipient } from './AwardRecipient';
import styles from './Awards.module.css';
import { AwardSeen } from './AwardSeen';

export function AwardsContent({
  open,
  user,
  initialAward,
  showcase = false,
  postId,
  embedded = false,
}: {
  embedded?: boolean;
  open: boolean;
  user?: string;
  initialAward?: AwardReceipt;
  showcase?: boolean;
  postId?: string;
}) {
  const currentUser = useAuthStore((state) => state.currentUserPubky);
  const owner = user ?? currentUser ?? undefined;
  const awards = useAwards(owner, open, !showcase);
  const { requireAuth } = useRequireAuth();
  const [tab, setTab] = useState<'all' | 'collection' | 'awarded'>(showcase || embedded ? 'collection' : 'all');
  const [selected, setSelected] = useState<{ badge: BadgeId; award?: AwardReceipt } | undefined>(
    initialAward ? { badge: initialAward.badge, award: initialAward } : undefined,
  );
  const visibleAwards =
    awards.state?.awards.filter((a) =>
      postId
        ? a.source === 'user' && a.postId === postId && isAwardVisible(awards.state?.choices[a.id])
        : showcase
          ? isAwardVisible(awards.state?.choices[a.id])
          : isAwardVisible(awards.state?.choices[a.id]),
    ) ?? [];
  const hiddenAwards =
    awards.isOwn && !showcase
      ? (awards.state?.awards.filter((a) => !isAwardVisible(awards.state?.choices[a.id])) ?? [])
      : [];
  const isEmptyGivenState = tab === 'awarded' && awards.state?.issued.length === 0;
  return (
    <div className="flex flex-col gap-4">
      {!embedded && (
        <div className="pr-6">
          <DialogTitle>{selected ? 'Award' : postId ? 'Awards for this post' : 'Awards'}</DialogTitle>
        </div>
      )}
      {selected ? (
        tab === 'awarded' && selected.award ? (
          <AwardGivenDetails award={selected.award} back={() => setSelected(undefined)} />
        ) : (
          <AwardSeen
            id={selected.award?.id ?? ''}
            awards={selected.award && !showcase ? awards : { ...awards, isOwn: false }}
          >
            <AwardDetails
              {...selected}
              awards={showcase ? { ...awards, isOwn: false } : awards}
              back={() => setSelected(undefined)}
            />
          </AwardSeen>
        )
      ) : (
        <>
          {!showcase && !embedded && (
            <MobileTabBar
              showLabels
              className="static z-auto bg-transparent after:hidden lg:block [&_button]:shadow-none [&_button]:ring-0 [&_button]:outline-none"
              items={[
                {
                  key: 'all',
                  icon: Compass,
                  label: `Discover (${badges.length})`,
                  isActive: tab === 'all',
                  onSelect: () => setTab('all'),
                },
                {
                  key: 'collection',
                  icon: Trophy,
                  label: `${awards.isOwn ? 'My awards' : 'Awards'} (${visibleAwards.length})`,
                  isActive: tab === 'collection',
                  onSelect: () => setTab('collection'),
                },
                {
                  key: 'awarded',
                  icon: Gift,
                  label: `Given (${awards.state?.issued.length ?? 0})`,
                  isActive: tab === 'awarded',
                  onSelect: () => setTab('awarded'),
                },
              ]}
            />
          )}
          <div className={embedded ? 'space-y-6' : 'space-y-6 pt-4'}>
            {tab === 'awarded' && (
              <>
                {!owner && (
                  <div className="py-8 text-center">
                    <Gift className="mx-auto mb-3 size-7 text-muted-foreground" />
                    <p className="text-sm">Recognize a contribution that mattered to you.</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Give someone an award and tell them why their contribution made a difference.
                    </p>
                    <Button variant="secondary" size="sm" className="mt-4" onClick={() => requireAuth(() => {})}>
                      Give awards
                    </Button>
                  </div>
                )}
                {owner && !awards.state && (
                  <p role="status" className="text-sm text-muted-foreground">
                    {awards.error || 'Loading awarded recognitions…'}
                  </p>
                )}
                {owner && awards.state && !awards.state.issued.length && (
                  <div className="py-8 text-center">
                    <Gift className="mx-auto mb-3 size-7 text-muted-foreground" />
                    <p className="text-base">No recognitions awarded yet.</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Give someone an award and tell them why their contribution made a difference.
                      <span className="mt-1 block">
                        You can hand out 3 recognition awards each week{' '}
                        <span className="text-foreground">({awards.state.remaining} remaining)</span>.
                      </span>
                    </p>
                  </div>
                )}
              </>
            )}
            {tab === 'collection' && !awards.state && owner && !awards.error && (
              <p role="status" className="py-8 text-center text-sm text-muted-foreground">
                Loading your awards…
              </p>
            )}
            {tab === 'collection' && (!owner || awards.state) && !visibleAwards.length && (
              <div className="py-8 text-center">
                <Trophy className="mx-auto mb-3 size-7 text-muted-foreground" />
                <p className="text-base">Your story starts with a contribution.</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Contribute to earn an activity badge or receive recognition from someone.
                </p>
                {!currentUser && !showcase && (
                  <Button variant="secondary" size="sm" className="mt-4" onClick={() => requireAuth(() => {})}>
                    Earn awards
                  </Button>
                )}
              </div>
            )}
            {(['arena', 'user'] as const).map((source) => {
              const items =
                tab === 'all'
                  ? badges
                      .filter((badge) => badge.source === source)
                      .map((badge) => ({
                        badge,
                        award: visibleAwards.find((award) => award.badge === badge.id),
                      }))
                  : (tab === 'awarded' ? (awards.state?.issued ?? []) : visibleAwards)
                      .filter((award) => award.source === source)
                      .map((award) => ({
                        badge: badges.find((badge) => badge.id === award.badge)!,
                        award,
                      }));
              const showEmptyRecognition =
                source === 'user' && tab === 'collection' && !showcase && !!awards.state && visibleAwards.length > 0;
              if (!items.length && !showEmptyRecognition) return null;
              return (
                <section key={source}>
                  <Label asChild className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <p>{source === 'arena' ? 'ACHIEVEMENTS' : 'RECOGNITION'}</p>
                  </Label>
                  {!items.length && <p className="text-sm text-muted-foreground">No recognition awards yet.</p>}
                  <div className={`${styles.gallery} ${source === 'user' && tab === 'all' ? styles.galleryUser : ''}`}>
                    {items.map(({ badge, award }) => (
                      <AwardSeen
                        key={award?.id ?? badge.id}
                        id={award && tab === 'collection' ? award.id : ''}
                        awards={award && tab === 'collection' ? awards : { ...awards, isOwn: false }}
                      >
                        <AwardCard
                          badge={badge.id}
                          status={award && tab !== 'awarded' ? awardCardStatus(award, awards.state) : undefined}
                          showStatus={tab === 'collection'}
                          onClick={() => setSelected({ badge: badge.id, award })}
                        >
                          {tab === 'awarded' && award && <AwardRecipient user={award.recipient} />}
                        </AwardCard>
                      </AwardSeen>
                    ))}
                  </div>
                </section>
              );
            })}
            {tab === 'collection' && hiddenAwards.length > 0 && (
              <section aria-label="Hidden awards">
                <Label asChild className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <p>HIDDEN</p>
                </Label>
                <div className={styles.gallery}>
                  {hiddenAwards.map((award) => (
                    <AwardSeen key={award.id} id={award.id} awards={awards}>
                      <AwardCard
                        badge={award.badge}
                        status="hidden"
                        onClick={() => setSelected({ badge: award.badge, award })}
                      />
                    </AwardSeen>
                  ))}
                </div>
              </section>
            )}
          </div>
          {!showcase &&
            tab !== 'all' &&
            !isEmptyGivenState &&
            (tab === 'awarded' ? !!currentUser : !awards.isOwn && !currentUser) && (
            <div className="pt-4 text-base leading-6 text-muted-foreground">
              {awards.isOwn ? (
                <p>
                  {tab !== 'collection' && (
                    <>
                      You can hand out 3 recognition awards each week
                      {awards.state && (
                        <>
                          {' '}
                          <span className="text-foreground">({awards.state.remaining} remaining)</span>
                        </>
                      )}
                      .
                    </>
                  )}
                </p>
              ) : (
                !currentUser &&
                owner &&
                (tab !== 'collection' || visibleAwards.length > 0) && (
                  <Button variant="secondary" size="sm" onClick={() => requireAuth(() => {})}>
                    Earn awards
                  </Button>
                )
              )}
              {!awards.isOwn && tab === 'awarded' && (
                <p className={!currentUser ? 'mt-2' : undefined}>You can hand out 3 recognition awards each week.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function AwardsDialog({
  onOpenChange,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: string;
  initialAward?: AwardReceipt;
  showcase?: boolean;
  postId?: string;
}) {
  return (
    <Dialog open={props.open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full gap-4 outline-none sm:w-[620px]" aria-describedby={undefined}>
        <AwardsContent {...props} />
      </DialogContent>
    </Dialog>
  );
}
