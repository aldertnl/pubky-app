'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { useAwards } from '@/hooks/useAwards/useAwards';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { PubkyIcon } from '@/icons';
import { type AwardReceipt, badgeById } from '@/libs/awards/awards';
import { isAwardNew, isNotificationVisible } from '@/libs/awards/visibility';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AwardArt } from './AwardArt';
import { AwardActions, AwardIssuer } from './AwardDetails';
import { AwardsDialog } from './AwardsDialog';
import { AwardSeen } from './AwardSeen';

function AwardUserAvatar({ user }: { user: string }) {
  const { profile } = useUserProfile(user);
  return (
    <AvatarWithFallback
      avatarUrl={profile?.avatarUrl}
      name={profile?.name || user}
      fallbackSeed={user}
      size="sm"
      className="size-8 shrink-0"
    />
  );
}

export function AwardNotifications() {
  const user = useAuthStore((state) => state.currentUserPubky);
  const awards = useAwards(user ?? undefined);
  const [selected, setSelected] = useState<AwardReceipt>();
  const pending = awards.state?.awards.filter((award) => isNotificationVisible(award, awards.state)) ?? [];
  if (!user || (!pending.length && !awards.pending)) return null;
  return (
    <section className="space-y-3" aria-label="Award notifications">
      {pending.map((award) => (
        <AwardSeen key={award.id} id={award.id} awards={awards}>
          <article className="relative grid grid-cols-[2rem_minmax(0,1fr)_5rem] items-start gap-2 rounded-md bg-card p-6 sm:grid-cols-[2rem_minmax(0,1fr)_9rem]">
            <Button
              overrideDefaults
              aria-label={`Close ${badgeById(award.badge).name} notification`}
              title="Close notification"
              disabled={awards.busy || awards.pending}
              onClick={() => void awards.dismissNotification(award)}
              className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-5" aria-hidden="true" />
            </Button>
            {award.source === 'arena' ? (
              <div
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary"
                aria-hidden="true"
              >
                <PubkyIcon size={20} />
              </div>
            ) : (
              <AwardUserAvatar user={award.issuer} />
            )}
            <div className="min-w-0 flex-1">
              <p className="min-h-8 content-center text-sm leading-normal font-medium lg:text-base">
                You received award <strong>{badgeById(award.badge).name}</strong> from <AwardIssuer award={award} />.
                {isAwardNew(award, awards.state) && <span className="ml-2 text-xs text-brand">New</span>}
              </p>
              <p className="line-clamp-2 text-base leading-6 text-muted-foreground">
                {award.source === 'arena' ? badgeById(award.badge).achievement : award.reason}
              </p>
            </div>
            <button
              className="relative col-start-3 row-start-1 w-20 self-stretch rounded-lg outline-none focus-visible:bg-accent sm:row-span-2 sm:w-36"
              onClick={() => setSelected(award)}
              aria-label={`View ${badgeById(award.badge).name}`}
            >
              <AwardArt badge={award.badge} size={144} className="absolute inset-0 size-full" />
            </button>
            <div className="col-span-3 row-start-2 mt-1 min-w-0 sm:col-span-1 sm:col-start-2">
              <AwardActions award={award} awards={awards} details={() => setSelected(award)} />
            </div>
          </article>
        </AwardSeen>
      ))}
      {selected && (
        <AwardsDialog open onOpenChange={() => setSelected(undefined)} user={user} initialAward={selected} />
      )}
    </section>
  );
}
