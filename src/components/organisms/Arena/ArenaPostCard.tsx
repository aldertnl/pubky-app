'use client';

import { Trophy } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import type { UserWithAvatar } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars.types';
import { useRelativeTime } from '@/hooks/useRelativeTime/useRelativeTime';
import {
  type ArenaMetric,
  type ArenaTopicFilter,
  getArenaPopularityScore,
  getArenaPreviewLabel,
  type RankedArenaIdea,
} from '@/libs/arena/arena';
import { arenaPostRankingStats, arenaPostStats } from '@/libs/arena/stats';
import { cn } from '@/libs/utils/utils';
import { PostHeaderTimestamp } from '@/molecules/PostHeaderTimestamp/PostHeaderTimestamp';
import {
  AVATAR_SIZE_BY_HEADER_SIZE,
  GAP_CLASS_BY_HEADER_SIZE,
  USERNAME_CLASS_BY_HEADER_SIZE,
} from '@/molecules/PostHeaderUserInfo/PostHeaderUserInfo.utils';
import { POST_BODY_TYPOGRAPHY_CLASS } from '@/molecules/PostText/PostText.constants';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { AwardTrophy } from '@/organisms/Awards/AwardTrophy';
import styles from './Arena.module.css';
import { ArenaPostPreview } from './ArenaPostPreview';
import { ArenaRank, ArenaStat } from './ArenaStats';
import type { ArenaPostImage } from './useArenaPostImages';

/** The same mini post card in the Arena floor, grid, and graph inspectors. */
export function ArenaPostCard({
  idea,
  metric,
  user,
  image,
  lead = '',
  onOpen,
  onAwards,
  presentation = 'floor',
  className,
  style,
  children,
}: {
  idea: RankedArenaIdea;
  metric: ArenaMetric;
  user?: UserWithAvatar;
  image?: ArenaPostImage;
  topic?: ArenaTopicFilter;
  contentLabel?: string;
  lead?: string;
  onOpen: (id: string) => void;
  onAwards?: (user: string, postId?: string) => void;
  presentation?: 'floor' | 'popup';
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const { formatRelativeTime } = useRelativeTime();
  const name = user?.name || `${idea.author.slice(0, 6)}…`;
  const leading = metric !== 'newest' && idea.rank === 1 && idea.score > 0;
  const popularityScore = getArenaPopularityScore(idea);
  const showAllStats = metric !== 'newest';
  const indexedAt = Number.isFinite(idea.indexedAt) ? new Date(idea.indexedAt) : null;
  const stats = presentation === 'popup' ? arenaPostRankingStats(idea, metric) : arenaPostStats(idea, metric);
  return (
    <Card
      data-arena-post={idea.id}
      style={style}
      className={cn(
        'min-w-0 gap-0 rounded-md py-0 shadow-2xl shadow-black/60',
        styles.ideaCard,
        leading && styles.leader,
        presentation === 'popup' && styles.popupPost,
        className,
      )}
    >
      {children}
      <Button
        overrideDefaults
        type="button"
        className={styles.idea}
        onClick={() => onOpen(idea.id)}
        aria-haspopup="dialog"
        title="See full post"
        aria-label={`${metric === 'newest' ? 'Position' : 'Rank'} ${idea.rank}, ${name}: ${getArenaPreviewLabel(idea.preview)}. ${idea.tags} tags, ${idea.replies} replies${showAllStats ? `, ${idea.reposts} reposts, ${popularityScore} popularity points` : ''}${leading && lead ? `. ${lead}` : ''}`}
      >
        <span className={cn(styles.ideaHeader, GAP_CLASS_BY_HEADER_SIZE.normal)}>
          <span className={cn('relative size-8 shrink-0', styles.postAvatar)}>
            <AvatarWithFallback
              name={name}
              fallbackSeed={idea.author}
              avatarUrl={user?.avatarUrl}
              size={AVATAR_SIZE_BY_HEADER_SIZE.normal}
              className="size-full"
            />
          </span>
          <div className={cn('min-w-0 flex-1', styles.ideaAuthor)}>
            <Typography
              as="span"
              overrideDefaults
              className={cn('block truncate font-bold text-foreground', USERNAME_CLASS_BY_HEADER_SIZE.normal)}
            >
              {name}
            </Typography>
            <span className={styles.stats}>
              <ArenaRank rank={idea.rank} announce={leading} />
              {metric === 'newest' && indexedAt && (
                <span className={styles.recentTimestamp}>
                  <PostHeaderTimestamp timeAgo={formatRelativeTime(indexedAt)} indexedAt={indexedAt} />
                </span>
              )}
              {stats.map((stat) => (
                <ArenaStat key={stat.kind} {...stat} />
              ))}
            </span>
          </div>
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
            <Trophy className="size-3 shrink-0" aria-hidden="true" />
            <span>{lead}</span>
          </Typography>
        )}
      </Button>
      {presentation === 'floor' && (
        <AwardTrophy
          onActivate={onAwards ? () => onAwards(idea.author, idea.id) : undefined}
          user={idea.author}
          postId={idea.id}
          className={cn(styles.awardIcon, styles.postAward)}
        />
      )}
    </Card>
  );
}
