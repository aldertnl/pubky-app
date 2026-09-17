'use client';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { useAwards } from '@/hooks/useAwards/useAwards';
import type { AwardReceipt } from '@/libs/awards/awards';
import { AwardDetails } from './AwardDetails';

export function AwardGivenDetails({ award, back }: { award: AwardReceipt; back: () => void }) {
  const awards = useAwards(award.recipient);
  if (!awards.state)
    return (
      <div className="space-y-4">
        <p role={awards.error ? 'alert' : 'status'} className="text-sm text-muted-foreground">
          {awards.error || 'Loading award…'}
        </p>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={back}>
            <ArrowLeft className="size-4" aria-hidden="true" /> All awards
          </Button>
        </div>
      </div>
    );
  return (
    <AwardDetails badge={award.badge} award={award} awards={{ ...awards, isOwn: false }} back={back} showRecipient />
  );
}
