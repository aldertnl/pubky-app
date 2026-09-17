import Image from 'next/image';
import { badgeById, type BadgeId } from '@/libs/awards/awards';

export function AwardArt({ badge, size = 96, className = '' }: { badge: BadgeId; size?: number; className?: string }) {
  return (
    <Image
      src={`/images/awards/${badge}.png`}
      alt={badgeById(badge).name}
      width={size}
      height={size}
      className={`object-contain ${className}`}
    />
  );
}
