import type { ArenaMetric, ArenaTopicFilter } from '@/libs/arena/arena';
import type { ARENA_PEOPLE, ArenaPeopleMetric } from '@/libs/arena/people';
import type { ContentType, ReachType } from '@/stores/home/home.types';
import type { TimeframeType } from '@/stores/hot/hot.types';

export interface ArenaHistoryState {
  view: 'arena' | 'list' | 'graph';
  metric: ArenaMetric | ArenaPeopleMetric;
  content: ContentType | typeof ARENA_PEOPLE | 'arena-tags';
  reach: ReachType;
  timeframe: TimeframeType;
  topic: ArenaTopicFilter | undefined;
  defaultReach: boolean;
}
