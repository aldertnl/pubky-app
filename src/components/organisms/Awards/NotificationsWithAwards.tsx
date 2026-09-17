'use client';
import { useAwards } from '@/hooks/useAwards/useAwards';
import { isNotificationVisible } from '@/libs/awards/visibility';
import { NotificationsContainer } from '@/organisms/NotificationsContainer/NotificationsContainer';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AwardNotifications } from './AwardNotifications';

export function NotificationsWithAwards() {
  const user = useAuthStore((state) => state.currentUserPubky);
  const awards = useAwards(user ?? undefined);
  const hasPending = awards.state?.awards.some((award) => isNotificationVisible(award, awards.state)) ?? false;
  return (
    <>
      <AwardNotifications />
      <NotificationsContainer hideEmpty={hasPending} />
    </>
  );
}
