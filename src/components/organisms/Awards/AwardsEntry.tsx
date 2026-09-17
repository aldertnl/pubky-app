'use client';
import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { useAwards } from '@/hooks/useAwards/useAwards';
import { isAwardNew } from '@/libs/awards/visibility';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AwardsDialog } from './AwardsDialog';

export function AwardsEntry() {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((state) => state.currentUserPubky);
  const awards = useAwards(user ?? undefined, true, true);
  const count = awards.state?.awards.filter((award) => isAwardNew(award, awards.state)).length ?? 0;
  return (
    <>
      <Button variant="secondary" size="sm" className="shrink-0 gap-2" onClick={() => setOpen(true)}>
        <Trophy className="size-4" />
        <span>Awards</span>
        {count > 0 && (
          <Badge
            asChild
            variant="secondary"
            className="size-5 rounded-full bg-brand p-0 text-[10px] font-semibold text-black"
          >
            <span aria-label={`${count} new awards`}>{count > 99 ? '99+' : count}</span>
          </Badge>
        )}
      </Button>
      {open && <AwardsDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}
