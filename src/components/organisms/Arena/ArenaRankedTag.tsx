'use client';

import type { CSSProperties } from 'react';
import { cn, generateRandomColor } from '@/libs/utils/utils';
import { PostTag } from '@/molecules/PostTag/PostTag';
import styles from './Arena.module.css';

const TOPIC_ROTATIONS = [1.8, -1.4, 0.9, -1.7, 1.2, -1.5, 1.6, -0.8, 1.3, -1] as const;

export function ArenaRankedTag({
  label,
  count,
  rank,
  selected = false,
  onClick,
}: {
  label: string;
  count: number;
  rank: number;
  selected?: boolean;
  onClick: () => void;
}) {
  const index = rank - 1;
  const tagColor = generateRandomColor(label);
  return (
    <div
      className={styles.topicControl}
      style={
        {
          '--arena-tag-scale': 1.1 - index * 0.02,
          '--arena-tag-rotation': `${TOPIC_ROTATIONS[index] ?? 0}deg`,
          '--arena-tag-opacity': selected ? 1 : Math.max(0.55, (21 - rank) / 20),
          '--arena-topic-pill-color': tagColor,
          '--arena-topic-pill-glow': 'transparent',
        } as CSSProperties
      }
    >
      <div
        className={cn(styles.topicTagGroup, selected && styles.selectedTopicControl)}
        data-arena-selected-topic={selected || undefined}
      >
        <span className={styles.topicRank} aria-hidden="true">
          #{rank}
        </span>
        <div className={styles.topicLabel}>
          <PostTag
            label={label}
            maxLabelLength={14}
            className={cn('max-w-none shrink-0', styles.topicTag)}
            selectedStyle={{ borderColor: tagColor, boxShadow: `inset 0 0 8px 0 ${tagColor}` }}
            count={count}
            selected={selected}
            onClick={onClick}
          />
        </div>
      </div>
    </div>
  );
}
