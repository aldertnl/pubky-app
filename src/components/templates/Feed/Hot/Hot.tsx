'use client';

import { Arena } from '@/organisms/Arena/Arena';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';

export function Hot() {
  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="overflow-visible pb-24 has-[[data-arena-graph]]:pb-6 lg:pb-12"
      classNameWrapperContent="gap-0 lg:overflow-visible"
      disableWideShellLayout
    >
      <Arena />
    </ContentLayout>
  );
}
