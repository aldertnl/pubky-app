'use client';

import { ChevronRight } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import type { NexusGraphUserNode } from '@/libs/graph/graph.types';
import { cn, formatPublicKey } from '@/libs/utils/utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import styles from './Arena.module.css';
import type { useArenaGraphConnection } from './useArenaGraphConnection';

export function ArenaGraphConnection({
  viewer,
  target,
  connection,
  open,
  onOpenChange,
}: {
  viewer: string;
  target: NexusGraphUserNode;
  connection: ReturnType<typeof useArenaGraphConnection>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const path = connection.graph?.nodes.filter((node): node is NexusGraphUserNode => node.kind === 'user') ?? [];
  const { usersMap } = useBulkUserAvatars([viewer, target.pubky, ...path.map((node) => node.pubky)]);
  const name = target.name || usersMap.get(target.pubky)?.name || formatPublicKey({ key: target.pubky });
  const avatar = (id: string, label: string) => (
    <AvatarWithFallback
      name={label}
      fallbackSeed={id}
      avatarUrl={usersMap.get(id)?.avatarUrl}
      size="sm"
      className="size-6 shrink-0"
    />
  );
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="max-w-64 gap-2 px-2 text-xs"
          data-arena-no-grow
          aria-label={`Show your connection to ${name}`}
          aria-pressed={open}
        >
          {avatar(viewer, usersMap.get(viewer)?.name || 'You')}
          <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
          {avatar(target.pubky, name)}
          <span className="truncate">{name}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        aria-label="Your connection"
        className={cn('w-72 space-y-3 text-sm font-medium', styles.graphSurface)}
      >
        <h3 className="font-bold">Your connection</h3>
        {connection.loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Spinner size="sm" /> Finding connection…
          </div>
        )}
        {connection.empty && <p className="text-muted-foreground">No follow path found within 4 hops.</p>}
        {connection.error && (
          <div className="space-y-2">
            <p className="text-muted-foreground">Could not load your connection.</p>
            <Button variant="outline" size="sm" onClick={connection.retry}>
              Retry
            </Button>
          </div>
        )}
        {path.length > 0 && (
          <>
            <p className="text-muted-foreground">
              {path.length - 1} follow {path.length === 2 ? 'connection' : 'connections'}
            </p>
            <ol aria-label="Follow path" className="space-y-2">
              {path.map((node, index) => {
                const previous = path[index - 1];
                const forward = connection.graph?.edges.some(
                  (edge) => edge.source === previous?.id && edge.target === node.id && edge.type === 'FOLLOWS',
                );
                const label =
                  node.pubky === viewer
                    ? 'You'
                    : node.name || usersMap.get(node.pubky)?.name || formatPublicKey({ key: node.pubky });
                return (
                  <li key={node.id}>
                    {index > 0 && (
                      <p className="mb-2 pl-8 text-xs text-muted-foreground">
                        {forward ? 'follows ↓' : 'followed by ↓'}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      {avatar(node.pubky, label)}
                      <span className="min-w-0 truncate">{label}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
