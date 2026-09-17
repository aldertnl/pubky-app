'use client';
import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { useAwards } from '@/hooks/useAwards/useAwards';
import { isAwardVisible } from '@/libs/awards/visibility';
import { AwardsDialog } from './AwardsDialog';

/** Post and user trophies share recipient visibility rules. */
export function AwardTrophy({
  user,
  postId,
  className,
  showCount = false,
  onActivate,
}: {
  user: string;
  postId?: string;
  className?: string;
  showCount?: boolean;
  onActivate?: () => void;
}) {
  const awards = useAwards(user);
  const [open, setOpen] = useState(false);
  const matches =
    awards.state?.awards.filter(
      (award) =>
        isAwardVisible(awards.state?.choices[award.id]) &&
        (!postId || (award.source === 'user' && award.postId === postId)),
    ) ?? [];
  if (!matches.length) return null;
  const label = postId ? 'View recognition for this post' : 'View user awards';
  return (
    <>
      <Button
        overrideDefaults
        type="button"
        className={className}
        aria-label={label}
        title={label}
        onClick={(event) => {
          event.stopPropagation();
          if (onActivate) onActivate();
          else setOpen(true);
        }}
      >
        <Trophy
          className={
            showCount ? 'size-4 transition-colors group-hover:text-white group-focus-visible:text-white' : 'size-4'
          }
          aria-hidden="true"
        />
        {showCount && (
          <span className="text-xs leading-4 font-medium tracking-widest whitespace-nowrap text-muted-foreground transition-colors group-hover:text-white group-focus-visible:text-white">
            {matches.length}
          </span>
        )}
      </Button>
      {open && (
        <AwardsDialog
          open
          onOpenChange={setOpen}
          user={user}
          showcase
          postId={postId}
          initialAward={postId && matches.length === 1 ? matches[0] : undefined}
        />
      )}
    </>
  );
}
