'use client';
import { useEffect, useState } from 'react';
import { AwardsContent } from '@/organisms/Awards/AwardsDialog';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';

export function ProfileAwardsPage() {
  const { pubky } = useProfileContext();
  const [overview, setOverview] = useState(0);
  useEffect(() => {
    const reset = () => setOverview((value) => value + 1);
    window.addEventListener('profile-awards-overview', reset);
    return () => window.removeEventListener('profile-awards-overview', reset);
  }, []);
  return <AwardsContent key={`${pubky}:${overview}`} open embedded user={pubky ?? undefined} />;
}
