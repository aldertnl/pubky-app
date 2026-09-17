'use client';
import { Label } from '@/atoms/Label/Label';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';

export function AwardRecipient({ user }: { user: string }) {
  const { profile } = useUserProfile(user);
  return (
    <Label asChild className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      <span>To {profile?.name || `${user.slice(0, 8)}…`}</span>
    </Label>
  );
}
