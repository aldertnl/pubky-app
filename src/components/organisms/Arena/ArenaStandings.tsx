'use client';

import type { HTMLAttributes } from 'react';
import { GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS } from '@/config/feed';
import { useCardsLayout } from '@/hooks/useCardsLayout/useCardsLayout';
import { cn } from '@/libs/utils/utils';
import styles from './Arena.module.css';

interface ArenaStandingsProps extends HTMLAttributes<HTMLOListElement> {
  isList?: boolean;
  itemIds: string[];
}

/** Shares Pubky dev's Cards placement while preserving Arena's ordered card content. */
export function ArenaStandings({ isList = false, itemIds, className, children, ...props }: ArenaStandingsProps) {
  const cardsRef = useCardsLayout(isList ? itemIds : [], false);

  return (
    <ol
      key={isList ? 'cards' : 'arena'}
      {...props}
      ref={isList ? cardsRef : undefined}
      className={cn(styles.floor, isList && [styles.list, GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS], className)}
    >
      {children}
    </ol>
  );
}
