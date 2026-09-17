'use client';
import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@/atoms/Tooltip/Tooltip';
import { useAwards } from '@/hooks/useAwards/useAwards';
import { type AwardReceipt, badgeById } from '@/libs/awards/awards';
import { isAwardVisible } from '@/libs/awards/visibility';
import { AwardArt } from './AwardArt';
import { AwardsDialog } from './AwardsDialog';

export function ProfileAwards({ user }: { user: string }) {
  const awards = useAwards(user, true, true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AwardReceipt>();
  const worn =
    awards.state?.worn.flatMap((id) => {
      const award = awards.state?.awards.find((a) => a.id === id);
      return award && isAwardVisible(awards.state?.choices[award.id]) ? [award] : [];
    }) ?? [];
  if (!worn.length) return null;
  return (
    <div className="flex shrink-0 items-center gap-1 lg:gap-3" aria-label="Worn awards">
      {worn.map((award) => (
        <Tooltip key={award.id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="rounded-lg outline-none focus-visible:bg-accent"
              aria-label={`${badgeById(award.badge).name}, view award`}
              onClick={() => {
                setSelected(award);
                setOpen(true);
              }}
            >
              <AwardArt badge={award.badge} size={64} className="size-8 lg:size-16" />
            </button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent className="bg-accent font-medium text-foreground [&_svg]:fill-accent">
              {badgeById(award.badge).name}
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      ))}
      {open && <AwardsDialog open={open} onOpenChange={setOpen} user={user} initialAward={selected} />}
    </div>
  );
}
