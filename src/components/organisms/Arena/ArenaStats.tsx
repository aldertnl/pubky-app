import { Activity, Clock, Flame, Hash, MessageCircle, Repeat, StickyNote, Tag, UsersRound } from 'lucide-react';
import { Typography } from '@/atoms/Typography/Typography';
import type { ArenaStatValue } from '@/libs/arena/stats';
import { cn } from '@/libs/utils/utils';
import { POST_ACTION_COUNT_TYPOGRAPHY_CLASS } from '@/organisms/PostActionsBar/PostActionsBar.constants';
import styles from './Arena.module.css';

export const ARENA_STAT_ICONS = {
  active: Activity,
  time: Clock,
  followers: UsersRound,
  posts: StickyNote,
  tags: Tag,
  replies: MessageCircle,
  reposts: Repeat,
  popular: Flame,
};

const STAT_CLASS = cn(
  POST_ACTION_COUNT_TYPOGRAPHY_CLASS,
  'inline-flex items-center gap-0.5 text-[0.625rem] leading-3.5 tracking-normal normal-case tabular-nums',
);

export function ArenaRank({ rank, announce = false }: { rank: number; announce?: boolean }) {
  return (
    <Typography
      as="span"
      overrideDefaults
      className={cn(STAT_CLASS, styles.rankStat)}
      aria-label={`Rank ${rank}`}
      aria-live={announce ? 'polite' : undefined}
    >
      <Hash className="size-3 shrink-0" aria-hidden="true" />
      <span aria-hidden="true">{rank}</span>
    </Typography>
  );
}

export function ArenaStat({ kind, count }: ArenaStatValue) {
  const Icon = ARENA_STAT_ICONS[kind];
  const value = count?.toLocaleString('en-US');
  const label = `${value ?? 'Loading'} ${kind === 'popular' ? 'popularity points' : kind}`;
  return (
    <Typography
      as="span"
      overrideDefaults
      className={cn(STAT_CLASS, 'text-muted-foreground')}
      aria-label={label}
      title={kind === 'popular' ? `${label} · Tags + (replies × 4) + (reposts × 3)` : label}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span key={count} className={styles.statValue} aria-hidden="true">
        {value ?? '…'}
      </span>
    </Typography>
  );
}
