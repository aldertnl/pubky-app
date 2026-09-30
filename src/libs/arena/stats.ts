import type { UserStreamUserCounts } from '@/hooks/useUserStream/useUserStream.types';
import { type ArenaIdea, type ArenaMetric, getArenaPopularityScore } from './arena';
import type { ArenaPeopleMetric } from './people';

export type ArenaStatKind = 'popular' | 'tags' | 'replies' | 'reposts' | 'posts' | 'followers';
export type ArenaStatValue = { kind: ArenaStatKind; count?: number };

export function arenaPostRankingStats(
  idea: Pick<ArenaIdea, 'tags' | 'replies' | 'reposts'>,
  metric: ArenaMetric,
): ArenaStatValue[] {
  if (metric === 'newest') return [];
  return [{ kind: metric, count: metric === 'popular' ? getArenaPopularityScore(idea) : idea[metric] }];
}

export function arenaPostStats(
  idea: Pick<ArenaIdea, 'tags' | 'replies' | 'reposts'>,
  metric: ArenaMetric,
): ArenaStatValue[] {
  const stats: ArenaStatValue[] = [
    { kind: 'tags', count: idea.tags },
    { kind: 'replies', count: idea.replies },
  ];
  if (metric !== 'newest') {
    stats.unshift({ kind: 'popular', count: getArenaPopularityScore(idea) });
    stats.push({ kind: 'reposts', count: idea.reposts });
  }
  return stats;
}

export function arenaPeopleStats(
  counts: UserStreamUserCounts | undefined,
  metric: ArenaPeopleMetric,
): ArenaStatValue[] {
  return [
    { kind: 'tags', count: counts?.tags },
    { kind: 'posts', count: counts?.posts },
    metric === 'replies'
      ? { kind: 'replies', count: counts?.replies }
      : { kind: 'followers', count: counts?.followers },
  ];
}
