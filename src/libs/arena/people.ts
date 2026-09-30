import type { UserStreamUser } from '@/hooks/useUserStream/useUserStream.types';
import { type UserStreamId, UserStreamTypes } from '@/models/stream/user/userStream.types';
import { REACH, type ReachType } from '@/stores/home/home.types';
import type { TimeframeType } from '@/stores/hot/hot.types';

export const ARENA_PEOPLE = 'people' as const;
export const ARENA_PEOPLE_LIMIT = 10;
export const ARENA_PEOPLE_PAGE_SIZE = 20;
export type ArenaPeopleMetric = 'active' | 'popular' | 'tags' | 'posts' | 'replies' | 'newest';

export function getArenaPeopleStreamId(
  timeframe: TimeframeType,
  reach: ReachType,
  metric: ArenaPeopleMetric = 'active',
): UserStreamId {
  if (metric === 'popular' && reach === REACH.ALL) return UserStreamTypes.MOST_FOLLOWED;
  return `influencers:${timeframe}:${reach === REACH.NETWORK ? 'wot' : reach}` as UserStreamId;
}

/** Preserve Nexus's active-user order for activity and ties; counts match the homepage. */
export function rankArenaPeople(
  users: UserStreamUser[],
  metric: Exclude<ArenaPeopleMetric, 'newest'>,
): UserStreamUser[] {
  if (metric === 'active') return users;
  const count = metric === 'popular' ? 'followers' : metric;
  return [...users].sort((a, b) => (b.counts?.[count] ?? 0) - (a.counts?.[count] ?? 0));
}
