'use client';
import { Check, CircleUserRound, EyeOff } from 'lucide-react';
import { Label } from '@/atoms/Label/Label';
import { badgeById, type BadgeId } from '@/libs/awards/awards';
import { AwardArt } from './AwardArt';
import styles from './Awards.module.css';

function AwardStatusIndicator({ status }: { status: 'new' | 'worn' | 'hidden' | 'visible' }) {
  const label = { new: 'New award', worn: 'Wearing', hidden: 'Hidden', visible: 'Visible award' }[status];
  return (
    <span
      className={`absolute top-2 right-2 flex size-4 items-center justify-center ${status === 'hidden' ? 'text-muted-foreground' : 'text-brand'}`}
      title={label}
      aria-label={label}
    >
      {status === 'new' ? (
        <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
      ) : status === 'worn' ? (
        <CircleUserRound className="size-3" aria-hidden="true" />
      ) : status === 'visible' ? (
        <Check className="size-3" aria-hidden="true" />
      ) : (
        <EyeOff className="size-3" aria-hidden="true" />
      )}
    </span>
  );
}

export function AwardCard({
  badge,
  status,
  showStatus = false,
  onClick,
  children,
}: {
  badge: BadgeId;
  status?: 'new' | 'worn' | 'hidden' | 'visible';
  showStatus?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  const definition = badgeById(badge);
  return (
    <button type="button" aria-label={definition.name} className={styles.card} onClick={onClick}>
      {status && <AwardStatusIndicator status={status} />}
      <AwardArt badge={badge} />
      <span className="text-center text-base font-semibold">{definition.name}</span>
      {children}
      {showStatus && status && (
        <Label asChild className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span>{status === 'worn' ? 'wearing' : status}</span>
        </Label>
      )}
    </button>
  );
}
