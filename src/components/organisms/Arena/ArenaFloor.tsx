'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Image } from '@/atoms/Image/Image';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import { useRelativeTime } from '@/hooks/useRelativeTime/useRelativeTime';
import {
  type ArenaMetric,
  type ArenaTopicFilter,
  getArenaLead,
  getArenaPopularityScore,
  getArenaVisibleIdeas,
  type RankedArenaIdea,
} from '@/libs/arena/arena';
import { cn, generateRandomColor } from '@/libs/utils/utils';
import { PostHeaderTimestamp } from '@/molecules/PostHeaderTimestamp/PostHeaderTimestamp';
import {
  AVATAR_SIZE_BY_HEADER_SIZE,
  GAP_CLASS_BY_HEADER_SIZE,
  USERNAME_CLASS_BY_HEADER_SIZE,
} from '@/molecules/PostHeaderUserInfo/PostHeaderUserInfo.utils';
import { POST_BODY_TYPOGRAPHY_CLASS } from '@/molecules/PostText/PostText.constants';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { AwardTrophy } from '@/organisms/Awards/AwardTrophy';
import { ARENA_PLACEMENTS } from './Arena.constants';
import styles from './Arena.module.css';
import { ArenaPostPreview } from './ArenaPostPreview';
import { ArenaStat } from './ArenaStats';
import { useArenaPostImages } from './useArenaPostImages';

const ARENA_GRID_IDEAS = 9;

export function ArenaFloorSkeleton({ isList = false }: { isList?: boolean }) {
  return (
    <ol className={cn(styles.floor, styles.skeletonFloor, isList && styles.list)} aria-hidden="true">
      {ARENA_PLACEMENTS.map((placement, index) => (
        <li
          key={`${placement.x}:${placement.y}`}
          className={styles.contender}
          data-position={index}
          style={
            isList
              ? undefined
              : { left: `${placement.x}%`, top: `${placement.y}%`, zIndex: ARENA_PLACEMENTS.length - index }
          }
        >
          <Card
            style={
              {
                '--arena-post-scale': Math.max(0.55, (20 - index) / 20),
                '--arena-post-rotation': `${placement.rotation}deg`,
              } as CSSProperties
            }
            className={cn('min-w-0 gap-0 rounded-md py-0 shadow-2xl shadow-black/40', styles.ideaCard)}
          >
            <div className={styles.skeletonCard}>
              <span className={cn(styles.rank, styles.skeletonRank)}>
                <Skeleton className="h-5 w-10 rounded-full" />
              </span>
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <Skeleton className="size-6 shrink-0 rounded-full sm:size-8" />
                <div className="min-w-0 flex-1 sm:space-y-2">
                  <Skeleton className="hidden h-4 w-2/3 sm:block" />
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-3 w-8" />
                    <Skeleton className="h-3 w-7" />
                    <Skeleton className="h-3 w-6" />
                    <Skeleton className="h-3 w-7" />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className={cn('h-4', index % 3 === 0 ? 'w-3/5' : index % 3 === 1 ? 'w-4/5' : 'w-2/3')} />
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ol>
  );
}

export function ArenaFloor({
  ideas,
  selectedId,
  onSelect,
  onExpand,
  onAwards,
  isList,
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

  const visible = isList ? ideas.slice(0, ARENA_GRID_IDEAS) : getArenaVisibleIdeas(ideas, selectedId);
  const postImages = useArenaPostImages(visible);
  const shouldReduceMotion = useReducedMotion();
  const { formatRelativeTime } = useRelativeTime();
  const { usersMap } = useBulkUserAvatars(visible.map((idea) => idea.author));
  const topicColor = topic === null ? 'var(--brand)' : generateRandomColor(topic);
  const lead = getArenaLead(ideas, metric);
  return (
    <ol
      className={cn(styles.floor, isList && styles.list)}
      style={{ '--arena-topic-color': topicColor } as CSSProperties}
      aria-label="Idea standings"
      data-arena-floor
    >
      {visible.map((idea, index) => {
        const user = usersMap.get(idea.author);
        const name = user?.name || `${idea.author.slice(0, 6)}…`;
        const leading = metric !== 'newest' && idea.rank === 1 && idea.score > 0;
        const popularityScore = getArenaPopularityScore(idea);
        const showAllStats = metric !== 'newest';
        const indexedAt = Number.isFinite(idea.indexedAt) ? new Date(idea.indexedAt) : null;
        const placement = ARENA_PLACEMENTS[index] ?? ARENA_PLACEMENTS[0];
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
                    left: `${placement.x}%`,
                    top: `${placement.y}%`,
                    zIndex: spotlight ? visible.length + 1 : visible.length - index,
                  }
            }
            layout={shouldReduceMotion ? false : 'position'}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{
              opacity: isList || spotlight || selectedId === idea.id ? 1 : Math.max(0.55, (21 - idea.rank) / 20),
            }}
            transition={{
              layout: { type: 'spring', stiffness: 360, damping: 36, mass: 0.75 },
              opacity: {
                duration: shouldReduceMotion ? 0 : 0.24,
              },
            }}
          >
            <Card
              data-arena-post={idea.id}
              style={
                {
                  '--arena-post-scale': Math.max(0.55, (21 - idea.rank) / 20),
                  '--arena-post-rotation': `${placement.rotation + (rotationOffsets[index] ?? 0)}deg`,
                  '--arena-arrival-delay': `${420 + Math.min(index, 5) * 18}ms`,
                } as CSSProperties
              }
              className={cn(
                'min-w-0 gap-0 rounded-md py-0 shadow-2xl shadow-black/60',
                styles.ideaCard,
                leading && styles.leader,
                selectedId === idea.id && styles.selected,
                celebratingId === idea.id && styles.leaderCelebration,
              )}
            >
              {!isList && <span className={styles.arrivalGlow} aria-hidden="true" />}
              {celebratingId === idea.id && (
                <span className={styles.leaderPulse} aria-hidden="true" onAnimationEnd={() => setCelebratingId(null)} />
              )}
              <Button
                overrideDefaults
                type="button"
                className={styles.idea}
                onClick={() => {
                  onSelect(idea.id);
                  // Wait for the selected conversation to render before scrolling to it.
                  if (onExpand) requestAnimationFrame(() => onExpand());
                }}
                aria-pressed={selectedId === idea.id}
                aria-label={`${metric === 'newest' ? 'Position' : 'Rank'} ${idea.rank}, ${name}: ${idea.preview}. ${idea.tags} tags, ${idea.replies} replies${showAllStats ? `, ${idea.reposts} reposts, ${popularityScore} popularity points` : ''}${leading && lead ? `. ${lead}` : ''}`}
              >
                <span className={cn(styles.ideaHeader, GAP_CLASS_BY_HEADER_SIZE.normal)}>
                  <AvatarWithFallback
                    name={name}
                    fallbackSeed={idea.author}
                    avatarUrl={user?.avatarUrl}
                    size={AVATAR_SIZE_BY_HEADER_SIZE.normal}
                    className={cn('size-6 sm:size-8', styles.postAvatar)}
                  />
                  <div className={cn('min-w-0 flex-1', styles.ideaAuthor)}>
                    <Typography
                      as="span"
                      overrideDefaults
                      className={cn(
                        'hidden truncate font-bold text-foreground sm:block',
                        USERNAME_CLASS_BY_HEADER_SIZE.normal,
                      )}
                    >
                      {name}
                    </Typography>
                    <span className={styles.stats}>
                      {metric === 'newest' && indexedAt && (
                        <span className={styles.recentTimestamp}>
                          <PostHeaderTimestamp timeAgo={formatRelativeTime(indexedAt)} indexedAt={indexedAt} />
                        </span>
                      )}
                      {showAllStats && (
                        <ArenaStat kind="popular" count={popularityScore} active={metric === 'popular'} />
                      )}
                      <ArenaStat kind="tags" count={idea.tags} active={metric === 'tags'} />
                      <ArenaStat kind="replies" count={idea.replies} active={metric === 'replies'} />
                      {showAllStats && <ArenaStat kind="reposts" count={idea.reposts} active={metric === 'reposts'} />}
                    </span>
                  </div>
                  {leading ? (
                    <Badge
                      variant="outline"
                      className={cn(styles.rankPill, styles.rank, styles.leadingRank, 'uppercase')}
                      aria-live="polite"
                    >
                      #{idea.rank}
                      <span className="hidden sm:inline">{` ${topic === null ? 'All' : topic} ${contentLabel}`}</span>
                    </Badge>
                  ) : (
                    <Badge variant="outline" className={cn(styles.rankPill, styles.rank)}>
                      #{idea.rank}
                    </Badge>
                  )}
                </span>
                <Typography
                  as="span"
                  overrideDefaults
                  className={cn(
                    POST_BODY_TYPOGRAPHY_CLASS,
                    'text-secondary-foreground',
                    styles.preview,
                    leading && lead && styles.previewWithLead,
                  )}
                >
                  <ArenaPostPreview text={idea.preview} />
                </Typography>
                {image && (
                  <span className={styles.previewMedia} aria-hidden="true">
                    <Image src={image.src} alt="" fill className="object-cover object-center" />
                  </span>
                )}
                {leading && lead && (
                  <Typography as="span" overrideDefaults className={styles.leadMargin}>
                    {lead}
                  </Typography>
                )}
              </Button>
              <AwardTrophy
                onActivate={onAwards ? () => onAwards(idea.author, idea.id) : undefined}
                user={idea.author}
                postId={idea.id}
                className={cn(styles.awardIcon, styles.postAward)}
              />
            </Card>
          </motion.li>
        );
      })}
    </ol>
  );
}
