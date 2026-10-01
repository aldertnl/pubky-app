'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Card } from '@/atoms/Card/Card';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import {
  type ArenaMetric,
  type ArenaTopicFilter,
  getArenaLead,
  getArenaVisibleIdeas,
  type RankedArenaIdea,
} from '@/libs/arena/arena';
import { arenaPostStats } from '@/libs/arena/stats';
import { cn, generateRandomColor } from '@/libs/utils/utils';
import { GAP_CLASS_BY_HEADER_SIZE } from '@/molecules/PostHeaderUserInfo/PostHeaderUserInfo.utils';
import { ARENA_PLACEMENTS, getArenaPlacementStyle } from './Arena.constants';
import styles from './Arena.module.css';
import { ArenaPostCard } from './ArenaPostCard';
import { ArenaStandings } from './ArenaStandings';
import { useArenaPostImages } from './useArenaPostImages';

const ARENA_GRID_IDEAS = 12;
// Keep all post cards slightly inside the orbit.
const ARENA_POST_PLACEMENTS = ARENA_PLACEMENTS.map((placement) => ({
  ...placement,
  x: 50 + (placement.x - 50) * 0.96,
  y: 50 + (placement.y - 50) * 0.96,
}));

export function ArenaFloorSkeleton({ isList = false, renderLimit }: { isList?: boolean; renderLimit?: number }) {
  const count = renderLimit ?? (isList ? ARENA_GRID_IDEAS : ARENA_POST_PLACEMENTS.length);
  const stats = arenaPostStats({ tags: 0, replies: 0, reposts: 0 }, 'popular');
  return (
    <ArenaStandings
      isList={isList}
      itemIds={Array.from({ length: count }, (_, index) => `post-skeleton-${index}`)}
      className={styles.skeletonFloor}
      aria-hidden="true"
      data-arena-visible-count={count}
    >
      {Array.from({ length: count }, (_, index) => {
        const placement = ARENA_POST_PLACEMENTS[index % ARENA_POST_PLACEMENTS.length];
        return (
          <li
            key={index}
            className={styles.contender}
            data-position={index}
            style={
              isList
                ? undefined
                : { ...getArenaPlacementStyle(placement, index, count), zIndex: ARENA_PLACEMENTS.length - index }
            }
          >
            <Card
              style={
                {
                  '--arena-post-scale': Math.max(0.55, (20 - index) / 20),
                  '--arena-post-rotation': `${placement.rotation}deg`,
                } as CSSProperties
              }
              className={cn('min-w-0 gap-0 rounded-md py-0 shadow-2xl shadow-black/60', styles.ideaCard)}
            >
              <div className={cn(styles.idea, styles.skeletonCard)}>
                <div className={cn(styles.ideaHeader, GAP_CLASS_BY_HEADER_SIZE.normal)}>
                  <span className={cn('relative size-8 shrink-0', styles.postAvatar)}>
                    <Skeleton className="size-full rounded-full" />
                  </span>
                  <div className={cn('min-w-0 flex-1', styles.ideaAuthor)}>
                    <Skeleton className="h-5 w-2/3" />
                    <span className={styles.stats}>
                      <Skeleton className="h-3.5 w-5" />
                      {stats.map((stat) => (
                        <Skeleton key={stat.kind} className="h-3.5 w-7" />
                      ))}
                    </span>
                  </div>
                </div>
                <div className="space-y-1 py-0.5">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className={cn('h-4', index % 3 === 0 ? 'w-3/5' : index % 3 === 1 ? 'w-4/5' : 'w-2/3')} />
                </div>
              </div>
            </Card>
          </li>
        );
      })}
    </ArenaStandings>
  );
}

export function ArenaFloor({
  ideas,
  selectedId,
  onSelect,
  onExpand,
  onAwards,
  isList,
  renderLimit,
  metric,
  topic = '',
  contentLabel = 'Content',
  rotationKey = '',
}: {
  ideas: RankedArenaIdea[];
  selectedId?: string;
  onAwards?: (user: string, postId?: string) => void;
  onSelect: (id: string) => void;
  onExpand?: () => void;
  isList: boolean;
  renderLimit?: number;
  metric: ArenaMetric;
  topic?: ArenaTopicFilter;
  contentLabel?: string;
  rotationKey?: string;
}) {
  const [rotationOffsets, setRotationOffsets] = useState<number[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // The floor mounts once posts arrive. Later ranking updates do not celebrate a new leader.
  const [celebratingId, setCelebratingId] = useState<string | null>(
    () => (metric !== 'newest' && ideas.find((idea) => idea.rank === 1 && idea.score > 0)?.id) || null,
  );
  useEffect(() => {
    // Randomize only after hydration and a filter change, never on card selection
    // or live count updates.
    const frame = requestAnimationFrame(() => {
      setRotationOffsets(ARENA_PLACEMENTS.map(() => (Math.random() - 0.5) * 3));
    });
    return () => cancelAnimationFrame(frame);
  }, [rotationKey, metric, isList]);

  const visible = isList
    ? ideas.slice(0, ARENA_GRID_IDEAS)
    : getArenaVisibleIdeas(ideas.slice(0, renderLimit), selectedId);
  const postImages = useArenaPostImages(visible);
  const shouldReduceMotion = useReducedMotion();
  const { usersMap } = useBulkUserAvatars(visible.map((idea) => idea.author));
  const topicColor = topic === null ? 'var(--brand)' : generateRandomColor(topic);
  const lead = getArenaLead(ideas, metric);
  return (
    <ArenaStandings
      isList={isList}
      itemIds={visible.map((idea) => idea.id)}
      style={{ '--arena-topic-color': topicColor } as CSSProperties}
      aria-label="Idea standings"
      data-arena-floor
      data-arena-visible-count={visible.length}
    >
      {visible.map((idea, index) => {
        const user = usersMap.get(idea.author);
        const placement = ARENA_POST_PLACEMENTS[index] ?? ARENA_POST_PLACEMENTS[0];
        const image = postImages.get(idea.id);
        const spotlight = (hoveredId ?? focusedId) === idea.id;
        return (
          <motion.li
            key={idea.id}
            className={styles.contender}
            data-position={index}
            data-arena-spotlight={spotlight || undefined}
            onHoverStart={() => setHoveredId(idea.id)}
            onHoverEnd={() => setHoveredId(null)}
            onFocusCapture={(event) => {
              if (event.target.matches(':focus-visible')) setFocusedId(idea.id);
            }}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setFocusedId(null);
            }}
            // Rank layers remain inside the floor's isolated stacking context.
            style={
              isList
                ? undefined
                : {
                    ...getArenaPlacementStyle(placement, index, visible.length),
                    zIndex: spotlight ? visible.length + 1 : visible.length - index,
                  }
            }
            layout={shouldReduceMotion ? false : 'position'}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{
              opacity: isList || spotlight ? 1 : Math.max(0.55, (21 - idea.rank) / 20),
            }}
            transition={{
              layout: { type: 'spring', stiffness: 360, damping: 36, mass: 0.75 },
              opacity: {
                duration: shouldReduceMotion ? 0 : 0.24,
              },
            }}
          >
            <ArenaPostCard
              idea={idea}
              metric={metric}
              user={user}
              image={image}
              topic={topic}
              contentLabel={contentLabel}
              lead={lead}
              onOpen={(id) => {
                onSelect(id);
                onExpand?.();
              }}
              onAwards={onAwards}
              style={
                {
                  '--arena-post-scale': spotlight ? 1 : Math.max(0.55, (21 - idea.rank) / 20),
                  '--arena-post-rotation': `${placement.rotation + (rotationOffsets[index] ?? 0)}deg`,
                  '--arena-arrival-delay': `${420 + Math.min(index, 5) * 18}ms`,
                } as CSSProperties
              }
              className={cn(celebratingId === idea.id && styles.leaderCelebration)}
            >
              {!isList && <span className={styles.arrivalGlow} aria-hidden="true" />}
              {celebratingId === idea.id && (
                <span className={styles.leaderPulse} aria-hidden="true" onAnimationEnd={() => setCelebratingId(null)} />
              )}
            </ArenaPostCard>
          </motion.li>
        );
      })}
    </ArenaStandings>
  );
}
