'use client';

import { useEffect, useState } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { MobileHeader } from '@/molecules/MobileHeader/MobileHeader';
import { Arena } from '@/organisms/Arena/Arena';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';

export function Hot() {
  const isPhone = useIsMobile({ breakpoint: 'sm' });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  useEffect(() => {
    if (!isPhone) setMobileFiltersOpen(false);
  }, [isPhone]);
  return (
    <>
      <MobileHeader
        showLeftButton={isPhone}
        showRightButton={false}
        onLeftIconClick={() => setMobileFiltersOpen(true)}
      />
      <ContentLayout
        renderMobileHeader={false}
        showLeftSidebar={false}
        showRightSidebar={false}
        showLeftMobileButton={false}
        showRightMobileButton={false}
        className="overflow-visible pb-24 has-[[data-arena-graph]]:pb-6 lg:pb-12"
        classNameWrapperContent="gap-0 lg:overflow-visible"
        disableWideShellLayout
      >
        <Arena mobileFiltersOpen={mobileFiltersOpen} onMobileFiltersOpenChange={setMobileFiltersOpen} />
      </ContentLayout>
    </>
  );
}
