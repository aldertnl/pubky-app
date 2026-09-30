import type { ArenaTopicFilter } from '@/libs/arena/arena';
import type { NexusHotTag } from '@/services/nexus/nexus.types';

export interface ArenaTagPickerProps {
  topic?: ArenaTopicFilter;
  topics: NexusHotTag[];
  timeframeLabel: string;
  onTopic: (topic: ArenaTopicFilter) => void;
}
