'use client';

import { Tag } from '@/atoms/Tag/Tag';
import { useTagged } from '@/hooks/useTagged/useTagged';

export function ArenaGraphProfileTags({ userId }: { userId: string }) {
  const { tags } = useTagged(userId, { enablePagination: false, enableStats: false });
  const topTags = tags
    .filter((tag) => tag.taggers_count > 0)
    .sort((a, b) => b.taggers_count - a.taggers_count)
    .slice(0, 3);

  if (topTags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" aria-label="Top profile tags">
      {topTags.map((tag) => (
        <Tag key={tag.label} name={tag.label} count={tag.taggers_count} className="cursor-default shadow-none!" />
      ))}
    </div>
  );
}
