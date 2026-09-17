'use client';

import * as React from 'react';
import { Container } from '@/atoms/Container/Container';
import { FileController } from '@/controllers/file/file';
import { useAwardNotificationCount } from '@/hooks/useAwards/useAwards';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { SearchInput } from '@/organisms/SearchInput/SearchInput';
import { useNotificationStore } from '@/stores/notification/notification.store';
import { HeaderNavigationButtons } from '../Header/Header';

export const HeaderSignIn = ({ ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const { userDetails, currentUserPubky } = useCurrentUserProfile();
  const awardNotifications = useAwardNotificationCount();
  const unreadNotifications = useNotificationStore((state) => state.selectUnread()) + awardNotifications;

  return (
    <Container className="min-w-0 flex-1 flex-row items-center justify-end gap-3" {...props}>
      <SearchInput />
      <HeaderNavigationButtons
        avatarImage={
          currentUserPubky && userDetails?.image
            ? FileController.getAvatarUrl(currentUserPubky, userDetails.indexed_at)
            : undefined
        }
        avatarName={userDetails?.name}
        avatarSeed={currentUserPubky || userDetails?.name || 'user'}
        counter={unreadNotifications}
      />
    </Container>
  );
};
