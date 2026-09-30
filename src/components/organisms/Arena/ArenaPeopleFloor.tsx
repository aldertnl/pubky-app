'use client';

import { type CSSProperties } from 'react';
import { StickyNote } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import type { UserStreamUser } from '@/hooks/useUserStream/useUserStream.types';
import { ARENA_PEOPLE_LIMIT, type ArenaPeopleMetric } from '@/libs/arena/people';
import { arenaPeopleStats } from '@/libs/arena/stats';
import { cn, formatPublicKey } from '@/libs/utils/utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { AwardTrophy } from '@/organisms/Awards/AwardTrophy';
import { ARENA_PLACEMENTS } from './Arena.constants';
import styles from './Arena.module.css';
import { ArenaStandings } from './ArenaStandings';
import { ArenaRank, ArenaStat } from './ArenaStats';

export function ArenaPeopleFloor({
  users,
  isList,
  metric,
  loading = false,
  selectedId,
  onSelect,
  onExpand,
}: {
  users: UserStreamUser[];
  isList: boolean;
  metric: ArenaPeopleMetric;
  loading?: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  onExpand: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const visible = loading ? Array.from<undefined>({ length: ARENA_PEOPLE_LIMIT }) : users;
  const PersonContainer = isList ? Card : 'div';
  return (
    <ArenaStandings
      isList={isList}
      itemIds={visible.map((user, index) => user?.id ?? `person-skeleton-${index}`)}
      className={styles.peopleFloor}
      aria-label={
        loading ? (metric === 'newest' ? 'Loading recent people' : 'Loading active people') : 'People standings'
      }
      aria-busy={loading}
      data-arena-floor
    >
      {visible.map((user, index) => {
        const placement = ARENA_PLACEMENTS[index];
        const name = user?.name || (user ? formatPublicKey({ key: user.id }) : '');
        return (
          <motion.li
            key={user?.id ?? index}
            className={styles.contender}
            data-position={index}
            style={
              {
                ...(!isList && { left: `${placement.x}%`, top: `${placement.y}%`, zIndex: visible.length - index }),
                '--arena-person-scale': Math.max(0.72, 1 - index * 0.03),
                '--arena-person-opacity': (100 - index * 5) / 100,
              } as CSSProperties
            }
            layout={reduceMotion ? false : 'position'}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <PersonContainer
              className={cn(
                styles.personNode,
                isList && styles.personCard,
                isList && 'min-w-0 gap-0 rounded-md py-0 shadow-2xl shadow-black/60',
              )}
            >
              {user ? (
                <>
                  <Button
                    overrideDefaults
                    type="button"
                    onClick={() => onSelect(user.id)}
                    className={styles.person}
                    data-arena-person={user.id}
                    aria-pressed={user.id === selectedId}
                    aria-label={`Rank ${index + 1}, ${name}. Show most popular post`}
                  >
                    <span className={styles.personPortrait} data-arena-person-portrait>
                      <AvatarWithFallback
                        name={name}
                        fallbackSeed={user.id}
                        avatarUrl={user.avatarUrl ?? undefined}
                        size="xl"
                        className={styles.personAvatar}
                      />
                    </span>
                    <span className={styles.personName}>{name}</span>
                    <span className={styles.personStats}>
                      <ArenaRank rank={index + 1} />
                      {arenaPeopleStats(user.counts, metric).map((stat) => (
                        <ArenaStat key={stat.kind} {...stat} />
                      ))}
                    </span>
                  </Button>
                  {user.id === selectedId && (
                    <AwardTrophy user={user.id} className={cn(styles.awardIcon, styles.personAwardsButton)} />
                  )}
                  {user.id === selectedId && (
                    <Button
                      overrideDefaults
                      type="button"
                      className={cn(styles.awardIcon, styles.personPost)}
                      aria-label="Open most popular post"
                      title="See most popular post"
                      onClick={onExpand}
                    >
                      <StickyNote className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </>
              ) : (
                <div className={styles.person} aria-hidden="true">
                  <Skeleton className={cn(styles.personAvatar, 'rounded-full')} />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-28" />
                </div>
              )}
            </PersonContainer>
          </motion.li>
        );
      })}
    </ArenaStandings>
  );
}
