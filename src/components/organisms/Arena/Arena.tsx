'use client';
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import {
  Activity,
  Calendar,
  CalendarRange,
  Clock,
  Eye,
  EyeOff,
  Flame,
  Info,
  Layers,
  LayoutDashboard,
  type LucideIcon,
  MessageCircle,
  Orbit,
  Repeat,
  RotateCcw,
  Star,
  StickyNote,
  Tag as TagIcon,
  UsersRound,
  Waypoints,
} from 'lucide-react';
import { ToggleGroup } from 'radix-ui';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { useArenaHistory } from '@/hooks/useArenaHistory/useArenaHistory';
import type { ArenaHistoryState } from '@/hooks/useArenaHistory/useArenaHistory.types';
import { useArenaIdeas } from '@/hooks/useArenaIdeas/useArenaIdeas';
import { useArenaPeople } from '@/hooks/useArenaPeople/useArenaPeople';
import { useArenaRecentPeople } from '@/hooks/useArenaRecentPeople/useArenaRecentPeople';
import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { useProfileStats } from '@/hooks/useProfileStats/useProfileStats';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import {
  ARENA_PAGE_SIZE,
  ARENA_TIMEFRAME_PAGE_SIZE,
  ARENA_TOPIC_LIMIT,
  type ArenaMetric,
  type ArenaTopicFilter,
  filterArenaIdeasByContent,
  getArenaCandidateStreamId,
  rankArenaIdeas,
  rankArenaIdeasForTimeframe,
  shouldLoadMoreArenaCandidates,
} from '@/libs/arena/arena';
import { ARENA_PEOPLE, type ArenaPeopleMetric } from '@/libs/arena/people';
import { scrollToArenaTarget } from '@/libs/arena/scrollToArenaTarget';
import type { GraphPosition } from '@/libs/graph/graph.types';
import { cn, formatPublicKey, generateRandomColor, hexToRgba } from '@/libs/utils/utils';
import { AvatarGroup } from '@/molecules/AvatarGroup/AvatarGroup';
import { CONTENT_FILTER_OPTIONS } from '@/molecules/Filters/FilterContent/FilterContent.constants';
import { REACH_FILTER_META } from '@/molecules/Filters/FilterReach/FilterReach';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { AwardsEntry } from '@/organisms/Awards/AwardsEntry';
import { type NexusHotTag, UserStreamReach } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { CONTENT, type ContentType, REACH, type ReachType } from '@/stores/home/home.types';
import { useHotStore } from '@/stores/hot/hot.store';
import { TIMEFRAME, type TimeframeType } from '@/stores/hot/hot.types';
import { ARENA_PLACEMENTS } from './Arena.constants';
import styles from './Arena.module.css';
import { ArenaAwardsSection } from './ArenaAwardsSection';
import { ArenaFilterMenu } from './ArenaFilterMenu';
import { ArenaFloor, ArenaFloorSkeleton } from './ArenaFloor';
import { ArenaGraphLoading } from './ArenaGraphLoading';
import { ArenaParticles } from './ArenaParticles';
import { ArenaPeopleFloor } from './ArenaPeopleFloor';
import { ArenaPersonConversation } from './ArenaPersonConversation';
import { ArenaFullscreenLayer, ArenaPostDialog } from './ArenaPostDialog';
import { ArenaStandings } from './ArenaStandings';
import { ArenaTagConnectors } from './ArenaTagConnectors';
import { ArenaTagPicker } from './ArenaTagPicker';

const ArenaPostGraph = dynamic(() => import('./ArenaGraph').then((module) => module.ArenaPostGraph), {
  ssr: false,
  loading: ArenaGraphLoading,
});
const ArenaPeopleGraph = dynamic(() => import('./ArenaGraph').then((module) => module.ArenaPeopleGraph), {
  ssr: false,
  loading: ArenaGraphLoading,
});
const ArenaTagsGraph = dynamic(() => import('./ArenaGraph').then((module) => module.ArenaTagsGraph), {
  ssr: false,
  loading: ArenaGraphLoading,
});

const WINDOWS = [
  { value: TIMEFRAME.TODAY, label: 'Today', contextLabel: 'Today', icon: Star },
  { value: TIMEFRAME.THIS_WEEK, label: 'This week', contextLabel: 'This week', icon: CalendarRange },
  { value: TIMEFRAME.THIS_MONTH, label: 'This month', contextLabel: 'This month', icon: Calendar },
  { value: TIMEFRAME.ALL_TIME, label: 'All time', contextLabel: 'All time', icon: Clock },
];

const REACH_OPTIONS = [
  { value: REACH.ALL, hotReach: undefined },
  { value: REACH.NETWORK, hotReach: UserStreamReach.WOT },
  { value: REACH.FOLLOWING, hotReach: UserStreamReach.FOLLOWING },
  { value: REACH.FRIENDS, hotReach: UserStreamReach.FRIENDS },
];

const REACH_MENU_LABELS: Record<ReachType, string> = {
  [REACH.ALL]: 'From everyone',
  [REACH.NETWORK]: 'From my network',
  [REACH.FOLLOWING]: 'From people I follow',
  [REACH.FRIENDS]: 'From friends',
  [REACH.ME]: 'From me',
};
const REACH_MENU_OPTIONS = REACH_OPTIONS.map(({ value }) => ({
  value,
  ...REACH_FILTER_META[value],
  label: REACH_MENU_LABELS[value],
}));
const POST_CONTENT_OPTIONS = CONTENT_FILTER_OPTIONS.map(({ key, label, icon }) => ({
  value: key,
  label: key === CONTENT.ALL ? 'Content' : label,
  icon,
}));
const ARENA_TAGS = 'arena-tags';
const CONTENT_OPTIONS: { value: ArenaContent; label: string; icon: LucideIcon; nested?: boolean }[] = [
  { value: ARENA_TAGS, label: 'Tags', icon: TagIcon },
  { value: ARENA_PEOPLE, label: 'People', icon: UsersRound },
  ...POST_CONTENT_OPTIONS.map((option) => ({ ...option, nested: option.value !== CONTENT.ALL })),
];
type ArenaContent = ContentType | typeof ARENA_PEOPLE | typeof ARENA_TAGS;
type ArenaRanking = ArenaMetric | ArenaPeopleMetric;

const PEOPLE_RANKING_INFO: Partial<Record<ArenaRanking, string>> = {
  active: 'Shows the most active people for your selected time and audience.',
  popular: 'Ranks people by total follower count, highest first. This is an all-time statistic.',
  tags: 'Ranks people by tags on their profiles, most first.',
  posts: 'Ranks people by posts they’ve written, most first.',
  replies: 'Ranks people by replies they’ve written, most first.',
  newest: 'Ranks people by their latest post, newest first.',
};

const CONTENT_RANKING_INFO: Partial<Record<ArenaRanking, string>> = {
  popular: 'Posts earn 1 point per unique tag, 4 per reply and 3 per repost, resulting in a popularity score.',
  tags: 'Ranks posts by the number of different tags they’ve received, most first.',
  replies: 'Ranks posts by direct replies received, most first.',
  reposts: 'Ranks posts by repost count, highest first.',
  newest: 'Shows the most recent posts first.',
};

const VIEW_OPTIONS = [
  { value: 'arena' as const, label: 'In arena', icon: Orbit },
  { value: 'list' as const, label: 'Cards', icon: LayoutDashboard },
  { value: 'graph' as const, label: 'In graph', icon: Waypoints },
];
const TOPIC_AVATAR_LIMIT = 3;
const SMALL_NETWORK_MAX_CONNECTIONS = 2;
const CONTENT_INDICATOR = { label: 'Content', icon: Layers };
const PEOPLE_INDICATOR = { label: 'People', icon: UsersRound };

const RANK_OPTIONS = [
  {
    value: 'popular',
    label: 'Most popular',
    icon: Flame,
    indicators: [CONTENT_INDICATOR, PEOPLE_INDICATOR, { label: 'Tags', icon: TagIcon }],
  },
  { value: 'active', label: 'Most active', icon: Activity, indicators: [PEOPLE_INDICATOR] },
  { value: 'replies', label: 'Most replied', icon: MessageCircle, indicators: [CONTENT_INDICATOR, PEOPLE_INDICATOR] },
  { value: 'tags', label: 'Most tagged', icon: TagIcon, indicators: [CONTENT_INDICATOR, PEOPLE_INDICATOR] },
  { value: 'posts', label: 'Most posted', icon: StickyNote, indicators: [PEOPLE_INDICATOR] },
  { value: 'reposts', label: 'Most reposted', icon: Repeat, indicators: [CONTENT_INDICATOR] },
  { value: 'newest', label: 'Most recent', icon: Clock, indicators: [CONTENT_INDICATOR, PEOPLE_INDICATOR] },
] satisfies {
  value: ArenaRanking;
  label: string;
  icon: LucideIcon;
  indicators: { label: string; icon: LucideIcon }[];
}[];

type PostWindow = { timeframe: TimeframeType; now: number };

type StageProps = {
  graphInfo?: { details: ReactNode };
  graphPositions: Map<string, GraphPosition>;
  muteControlTarget: HTMLDivElement | null;
  topics: NexusHotTag[];
  postWindow: PostWindow;
  topic: ArenaTopicFilter;
  onTopic: (topic: ArenaTopicFilter) => void;
  isList: boolean;
  isGraph: boolean;
  metric: ArenaRanking;
  content: ArenaContent;
};

export function Arena() {
  const { reach, setReach, applyDefaultReach, timeframe, setTimeframe, hasUserSetReach } = useHotStore();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { stats, isLoading: isLoadingProfileStats } = useProfileStats(currentUserPubky ?? '', {
    enabled: Boolean(currentUserPubky),
  });
  const hasSmallNetwork =
    stats.followers <= SMALL_NETWORK_MAX_CONNECTIONS && stats.following <= SMALL_NETWORK_MAX_CONNECTIONS;
  const effectiveReach =
    currentUserPubky && !hasUserSetReach && !isLoadingProfileStats && hasSmallNetwork && reach === REACH.NETWORK
      ? REACH.ALL
      : currentUserPubky
        ? reach
        : REACH.ALL;
  const { requireAuth } = useRequireAuth();
  const isPhone = useIsMobile({ breakpoint: 'sm' });
  const [view, setView] = useState<'arena' | 'list' | 'graph'>('arena');
  const [graphPositions] = useState(() => new Map<string, GraphPosition>());
  const [muteControlTarget, setMuteControlTarget] = useState<HTMLDivElement | null>(null);
  const displayAsGrid = isPhone || view === 'list';
  const displayAsGraph = !isPhone && view === 'graph';
  const [resetCount, setResetCount] = useState(0);
  const [metric, setMetric] = useState<ArenaRanking>('popular');
  const [content, setContent] = useState<ArenaContent>(CONTENT.ALL);
  const contentIndicator = POST_CONTENT_OPTIONS.find((option) => option.value === content) ?? CONTENT_INDICATOR;
  const rankOptions = RANK_OPTIONS.map((option) => ({
    ...option,
    disabled: content === ARENA_TAGS && option.value !== 'popular',
    indicators: option.indicators.map((indicator) => (indicator === CONTENT_INDICATOR ? contentIndicator : indicator)),
  }));
  const scope = `${effectiveReach}:${timeframe}:${currentUserPubky ?? 'guest'}`;
  const topics = useHotTags({
    reach: REACH_OPTIONS.find((option) => option.value === effectiveReach)?.hotReach,
    timeframe,
    limit: ARENA_TOPIC_LIMIT,
  });
  const [chosenTopic, setChosenTopic] = useState<{ scope: string; label: ArenaTopicFilter } | null>(null);
  const topic =
    chosenTopic?.label === null || chosenTopic?.scope === scope
      ? chosenTopic.label
      : (topics.rawTags[0]?.label ?? (content === ARENA_PEOPLE ? null : undefined));
  const navigateArena = useArenaHistory(
    { view, metric, content, reach, timeframe, topic, defaultReach: !hasUserSetReach },
    restoreFilters,
    resolveHistoryReach,
  );
  function resolveHistoryReach(next: ArenaHistoryState) {
    return !currentUserPubky
      ? REACH.ALL
      : next.defaultReach && !isLoadingProfileStats && hasSmallNetwork && next.reach === REACH.NETWORK
        ? REACH.ALL
        : next.reach;
  }
  function restoreFilters(next: ArenaHistoryState) {
    const nextReach = resolveHistoryReach(next);
    setChosenTopic(
      next.topic === undefined
        ? null
        : { scope: `${nextReach}:${next.timeframe}:${currentUserPubky ?? 'guest'}`, label: next.topic },
    );
    setView(next.view);
    setMetric(next.metric);
    setContent(next.content);
    setTimeframe(next.timeframe);
    if (next.defaultReach) applyDefaultReach(next.reach);
    else setReach(next.reach);
  }
  function changeReach(value: ReachType) {
    const applyReach = () =>
      navigateArena({ reach: value, defaultReach: false, topic: topic === null ? null : undefined });
    if (value === REACH.ALL) applyReach();
    else requireAuth(applyReach);
  }
  function changeMetric(value: ArenaRanking) {
    navigateArena({
      metric: value,
      content:
        value === 'active' || value === 'posts'
          ? ARENA_PEOPLE
          : content === ARENA_PEOPLE && value === 'reposts'
            ? CONTENT.ALL
            : content,
    });
  }
  function changeContent(value: ArenaContent) {
    navigateArena({
      content: value,
      metric:
        value === ARENA_TAGS
          ? 'popular'
          : value === ARENA_PEOPLE
            ? metric === 'reposts'
              ? 'active'
              : metric
            : metric === 'active' || metric === 'posts'
              ? 'popular'
              : metric,
    });
  }
  function resetFilters() {
    setResetCount((count) => count + 1);
    navigateArena({
      topic: undefined,
      timeframe: TIMEFRAME.THIS_MONTH,
      metric: 'popular',
      content: CONTENT.ALL,
      reach: currentUserPubky ? REACH.NETWORK : REACH.ALL,
      defaultReach: true,
      view: 'arena',
    });
  }
  const rankingDetails = (
    <div className="text-xs font-medium text-muted-foreground">
      <h3 className="text-sm font-semibold text-foreground">Ranking summary</h3>
      <div className="mt-2 max-w-2xl space-y-2 leading-relaxed">
        {content === ARENA_TAGS ? (
          <p>Ranks tags by how many posts use them in your selected time and audience, most used first.</p>
        ) : content === ARENA_PEOPLE ? (
          <p>
            {PEOPLE_RANKING_INFO[metric]}
            {topic !== null && ' Tag filters match tags on people’s profiles.'}
          </p>
        ) : (
          <p>
            {CONTENT_RANKING_INFO[metric]} Only loaded posts are ranked. The leading reply has the highest popularity
            score.
          </p>
        )}
      </div>
    </div>
  );
  return (
    <div className={styles.arena}>
      <div className={styles.toolbar}>
        <div className={cn(styles.filters, 'font-medium')} role="group" aria-label="Arena filters">
          <div className={styles.filterClause}>
            <ArenaFilterMenu label="Ranking" value={metric} options={rankOptions} onChange={changeMetric} />
          </div>{' '}
          <div className={styles.filterClause} hidden={content === ARENA_TAGS}>
            <ArenaTagPicker
              key={topic}
              topic={topic}
              topics={topics.rawTags}
              timeframeLabel={WINDOWS.find((window) => window.value === timeframe)?.contextLabel ?? timeframe}
              onTopic={(label) => navigateArena({ topic: label })}
            />
          </div>{' '}
          <div className={styles.filterClause}>
            <ArenaFilterMenu
              label="Content"
              value={content}
              options={CONTENT_OPTIONS}
              onChange={changeContent}
              lowercase
            />
          </div>{' '}
          <div className={styles.viewActions}>
            <div className={styles.filterClause}>
              <ArenaFilterMenu
                label="Reach"
                value={effectiveReach}
                options={
                  content === ARENA_PEOPLE
                    ? REACH_MENU_OPTIONS.map((option) => ({ ...option, label: option.label.replace(/^From /, '') }))
                    : REACH_MENU_OPTIONS
                }
                onChange={changeReach}
                lowercase
              />
            </div>{' '}
            <div className={styles.filterClause}>
              <ArenaFilterMenu
                label="Timeframe"
                value={timeframe}
                options={WINDOWS.map((window) => ({
                  ...window,
                  disabled: content === ARENA_PEOPLE && metric === 'popular' && window.value !== TIMEFRAME.ALL_TIME,
                }))}
                onChange={(value) => navigateArena({ timeframe: value })}
                lowercase
              />
            </div>{' '}
            <div className={cn(styles.filterClause, styles.mobileHidden)}>
              <ToggleGroup.Root
                type="single"
                value={view}
                onValueChange={(value) => {
                  if (value === 'arena' || value === 'list' || value === 'graph') navigateArena({ view: value });
                }}
                aria-label="Layout"
                className="mr-2 inline-flex h-8 items-stretch overflow-hidden rounded-full border border-border bg-secondary/30"
              >
                {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <ToggleGroup.Item key={value} value={value} asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={label}
                      title={label}
                      className="h-full rounded-none text-muted-foreground first:rounded-l-full last:rounded-r-full data-[state=on]:bg-secondary data-[state=on]:text-foreground"
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </Button>
                  </ToggleGroup.Item>
                ))}
              </ToggleGroup.Root>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    aria-label="Arena information"
                    title="Arena information"
                  >
                    <Info className="size-4" aria-hidden="true" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={8}
                  aria-label="Arena information"
                  className="max-h-96 w-80 space-y-2 overflow-y-auto rounded-xl text-xs font-medium text-muted-foreground"
                >
                  {rankingDetails}
                </PopoverContent>
              </Popover>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                aria-label="Reset filters"
                title="Reset filters"
                onClick={resetFilters}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
            <div className={styles.toolbarActions}>
              <div ref={setMuteControlTarget} />
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <AwardsEntry />
          </div>
        </div>
      </div>
      <ArenaTopics
        graphInfo={{ details: rankingDetails }}
        graphPositions={graphPositions}
        muteControlTarget={muteControlTarget}
        key={`${scope}:${resetCount}`}
        reach={effectiveReach}
        timeframe={timeframe}
        onReach={changeReach}
        data={topics}
        topic={topic}
        onTopic={(label) => {
          navigateArena({
            topic: label,
            ...(content === ARENA_TAGS ? { content: CONTENT.ALL, view: 'arena' } : {}),
          });
        }}
        isList={displayAsGrid}
        isGraph={displayAsGraph}
        metric={metric}
        content={content}
      />
    </div>
  );
}

function ArenaTagsView({ topics, postWindow, ...props }: StageProps) {
  return (
    <ArenaStage {...props} topics={[]} topic={null} isList={props.isList} isGraph={props.isGraph}>
      {props.isGraph ? (
        <ArenaTagsGraph
          graphInfo={props.graphInfo}
          postWindow={postWindow}
          positions={props.graphPositions}
          topics={topics}
          topic={null}
          onSelect={props.onTopic}
          onTopic={props.onTopic}
        />
      ) : (
        <ArenaTagsFloor topics={topics} onTopic={props.onTopic} isList={props.isList} />
      )}
    </ArenaStage>
  );
}

function ArenaTopics({
  reach,
  timeframe,
  data,
  topic,
  onTopic,
  onReach,
  ...display
}: {
  reach: ReachType;
  timeframe: TimeframeType;
  data: ReturnType<typeof useHotTags>;
  topic?: ArenaTopicFilter;
  onTopic: StageProps['onTopic'];
  onReach: (reach: ReachType) => void;
} & Pick<
  StageProps,
  'isList' | 'isGraph' | 'metric' | 'content' | 'muteControlTarget' | 'graphPositions' | 'graphInfo'
>) {
  // The parent remounts this scope when its shared timeframe changes.
  const [now] = useState(Date.now);
  const { rawTags, isLoading, error, refetch } = data;
  if (isLoading && (topic === undefined || display.content === ARENA_TAGS))
    return display.isGraph ? (
      <ArenaGraphLoading />
    ) : display.content === ARENA_TAGS ? (
      <div className={styles.status} role="status">
        Loading tags…
      </div>
    ) : (
      <ArenaLoading isList={display.isList} />
    );
  if (error && (topic === undefined || display.content === ARENA_TAGS))
    return (
      <div className={styles.status} role="alert">
        Could not load topics.{' '}
        <Button variant="ghost" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  if (display.content === ARENA_TAGS ? rawTags.length === 0 : topic === undefined)
    return (
      <div className={styles.status} role="status">
        <p>No topics in this window. Try a wider timeframe or reach.</p>
        {reach !== REACH.ALL && (
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => onReach(REACH.ALL)}>
            Show from everyone
          </Button>
        )}
      </div>
    );
  if (display.content === ARENA_TAGS) {
    return (
      <ArenaTagsView {...display} topics={rawTags} topic={null} onTopic={onTopic} postWindow={{ timeframe, now }} />
    );
  }
  if (topic === undefined) return null;
  if (display.content === ARENA_PEOPLE) {
    return (
      <ArenaPeople
        key={JSON.stringify([topic, display.metric])}
        {...display}
        postWindow={{ timeframe, now }}
        topics={rawTags}
        topic={topic}
        onTopic={onTopic}
        reach={reach}
      />
    );
  }
  return (
    <ArenaTopic
      key={JSON.stringify([topic, display.content, display.metric])}
      {...display}
      metric={display.metric as ArenaMetric}
      content={display.content}
      postWindow={{ timeframe, now }}
      topics={rawTags}
      topic={topic}
      onTopic={onTopic}
      reach={reach}
    />
  );
}

function ArenaTagsFloor({ topics, onTopic, isList }: Pick<StageProps, 'topics' | 'onTopic' | 'isList'>) {
  const visible = topics.slice(0, ARENA_TOPIC_LIMIT);
  const { isMuted } = useMutedUsers();
  const previews = visible.map((tag) =>
    [...new Set(tag.taggers_id)].filter((id) => !isMuted(id)).slice(0, TOPIC_AVATAR_LIMIT),
  );
  const { getUsersWithAvatars } = useBulkUserAvatars([...new Set(previews.flat())]);
  return (
    <ArenaStandings
      isList={isList}
      itemIds={visible.map((tag) => tag.label)}
      className={styles.tagsFloor}
      aria-label="Tag standings"
      data-arena-floor
    >
      {visible.map((tag, index) => {
        const placement = ARENA_PLACEMENTS[index];
        const color = generateRandomColor(tag.label);
        const TagContainer = isList ? Card : 'div';
        return (
          <li
            key={tag.label}
            className={cn(styles.orbitTag, isList && styles.gridTagCard)}
            style={isList ? undefined : { left: `${placement.x}%`, top: `${placement.y}%` }}
            aria-label={`Rank ${index + 1}`}
          >
            <TagContainer className={isList ? styles.gridTagCardInner : undefined}>
              <div
                className={styles.topicControl}
                style={
                  {
                    '--arena-tag-scale': (29 - index) / 20,
                    '--arena-tag-rotation': `${placement.rotation * 2}deg`,
                    '--arena-tag-opacity': isList ? 1 - index / 18 : 1,
                    '--arena-topic-pill-color': color,
                  } as CSSProperties
                }
              >
                <div className={styles.topicTagGroup} data-arena-tag-node={tag.label}>
                  <span className={styles.topicRank} aria-hidden="true">
                    #{index + 1}
                  </span>
                  <div className={styles.topicLabel}>
                    <PostTag
                      label={tag.label}
                      maxLabelLength={14}
                      count={tag.tagged_count}
                      className={cn('max-w-none shrink-0', styles.topicTag)}
                      onClick={() => onTopic(tag.label)}
                    />
                    {previews[index].length > 0 && (
                      <div
                        className={styles.topicTaggers}
                        role="group"
                        aria-label={`${tag.label} post taggers`}
                        title="People who posted with this tag"
                      >
                        <AvatarGroup
                          items={getUsersWithAvatars(previews[index])}
                          totalCount={previews[index].length}
                          maxAvatars={TOPIC_AVATAR_LIMIT}
                          className={styles.topicAvatars}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TagContainer>
          </li>
        );
      })}
    </ArenaStandings>
  );
}

function ArenaStage({
  topics,
  topic,
  onTopic,
  isList,
  isGraph,
  metric,
  content,
  children,
  paused = false,
}: Pick<StageProps, 'topics' | 'topic' | 'onTopic' | 'isList' | 'isGraph' | 'metric' | 'content'> & {
  children: React.ReactNode;
  paused?: boolean;
}) {
  const rankingLabel = RANK_OPTIONS.find((option) => option.value === metric)?.label ?? 'Most popular';
  const typeLabel = CONTENT_OPTIONS.find((option) => option.value === content)?.label ?? 'Content';
  const stageRef = useRef<HTMLDivElement>(null);
  const { isMuted } = useMutedUsers();
  const selectedTagIndex = topics.findIndex((tag) => tag.label === topic);
  const selectedTag = topics[selectedTagIndex];
  const taggers =
    !isList && !isGraph && selectedTag
      ? [...new Set(selectedTag.taggers_id)].filter((id) => !isMuted(id)).slice(0, TOPIC_AVATAR_LIMIT)
      : [];
  const { getUsersWithAvatars } = useBulkUserAvatars(taggers);
  const tagColor = generateRandomColor(topic ?? 'pubky');
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let inView = true;
    const update = () => stage.toggleAttribute('data-arena-paused', paused || !inView || document.hidden);
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        update();
      },
      { rootMargin: '100px' },
    );
    observer.observe(stage);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [paused]);

  return (
    <div
      ref={stageRef}
      className={cn(styles.stage, (isList || isGraph) && styles.listStage)}
      style={{ '--arena-topic-color': tagColor } as CSSProperties}
      inert={paused}
      aria-hidden={paused || undefined}
      data-arena-paused={paused || undefined}
    >
      {/* Decorative rings and particles stay behind the interactive content. */}
      <div className={styles.bowl} aria-hidden="true" data-testid="arena-orbits">
        <div className={styles.orbitField}>
          <span className={styles.atmosphere} />
          <span className={cn(styles.orbit, styles.orbitFront)} data-orbit="front">
            <span className={styles.orbitParticle} />
          </span>
          <span className={cn(styles.orbit, styles.orbitCrossOne)} data-orbit="cross-one">
            <span className={styles.orbitParticle} />
          </span>
          <span className={cn(styles.orbit, styles.orbitCrossTwo)} data-orbit="cross-two">
            <span className={styles.orbitParticle} />
          </span>
        </div>
        <ArenaParticles />
      </div>
      {!isList && !isGraph && (
        <ArenaTagConnectors key={topic ?? 'all-topics'} stageRef={stageRef} topic={topic ?? 'pubky'} />
      )}
      {!isList && !isGraph && (
        <div className={styles.topics} role="group" aria-label={topic === null ? 'Selected ranking' : 'Selected tag'}>
          <div className={styles.topic}>
            <div
              className={cn(styles.topicControl, topic === null && 'pointer-events-none')}
              style={
                {
                  '--arena-tag-scale': 1.25,
                  '--arena-topic-pill-color': tagColor,
                  '--arena-topic-pill-glow': hexToRgba(tagColor, 0.32),
                } as CSSProperties
              }
            >
              {topic === null ? (
                <div className={cn(styles.topicTagGroup, styles.selectedTopicControl)} data-arena-selected-topic>
                  <div className={styles.topicLabel}>
                    <PostTag
                      label={`${rankingLabel} ${typeLabel.toLowerCase()}`}
                      color={tagColor}
                      className={cn('max-w-none shrink-0 rounded-md!', styles.topicTag)}
                      selectedStyle={{ borderColor: tagColor, boxShadow: `inset 0 0 8px 0 ${tagColor}` }}
                      selected
                      tabIndex={-1}
                    />
                  </div>
                </div>
              ) : (
                <div className={cn(styles.topicTagGroup, styles.selectedTopicControl)} data-arena-selected-topic>
                  {selectedTag && (
                    <span className={styles.topicRank} aria-hidden="true">
                      #{selectedTagIndex + 1}
                    </span>
                  )}
                  <div className={styles.topicLabel}>
                    <PostTag
                      label={topic}
                      maxLabelLength={14}
                      className={cn('max-w-none shrink-0', styles.topicTag)}
                      style={selectedTag ? undefined : { borderRadius: 6 }}
                      selectedStyle={{ borderColor: tagColor, boxShadow: `inset 0 0 8px 0 ${tagColor}` }}
                      count={selectedTag?.tagged_count}
                      selected
                      onClick={() => onTopic(topic)}
                    />
                    {taggers.length > 0 && (
                      <div className={styles.topicTaggers} role="group" aria-label={`${topic} topic taggers`}>
                        <AvatarGroup
                          items={getUsersWithAvatars(taggers)}
                          totalCount={taggers.length}
                          maxAvatars={TOPIC_AVATAR_LIMIT}
                          className={styles.topicAvatars}
                          data-testid={`arena-topic-taggers-${topic}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

function ArenaPeople(props: StageProps & { reach: ReachType }) {
  return props.metric === 'newest' ? <ArenaRecentPeople {...props} /> : <ArenaActivePeople {...props} />;
}

function ArenaRecentPeople(props: StageProps & { reach: ReachType }) {
  const people = useArenaRecentPeople({ ...props.postWindow, reach: props.reach, topic: props.topic });
  return <ArenaPeopleResults stage={props} people={people} />;
}

function ArenaActivePeople(props: StageProps & { reach: ReachType }) {
  const people = useArenaPeople({
    timeframe: props.postWindow.timeframe,
    reach: props.reach,
    topic: props.topic,
    metric: props.metric as Exclude<ArenaPeopleMetric, 'newest'>,
  });
  return <ArenaPeopleResults stage={props} people={people} />;
}

function ArenaPeopleResults({
  stage: props,
  people,
}: {
  stage: StageProps;
  people: ReturnType<typeof useArenaPeople>;
}) {
  const [conversationOpen, setConversationOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const metric = props.metric as ArenaPeopleMetric;
  const { users, loading, error, retry } = people;
  const selected = !loading && !error ? (users.find((user) => user.id === chosen) ?? users[0]) : undefined;
  return (
    <>
      <ArenaStage {...props} paused={conversationOpen}>
        {error ? (
          <div className={styles.status} role="alert">
            Could not load people.{' '}
            <Button variant="ghost" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : !loading && !users.length ? (
          <div className={styles.status} role="status">
            {props.topic === null
              ? metric === 'newest'
                ? 'No recent people found for these filters.'
                : 'No active people found for these filters.'
              : metric === 'newest'
                ? 'No recent people found with this profile tag.'
                : 'No active people found with this profile tag.'}
          </div>
        ) : props.isGraph ? (
          loading ? (
            <ArenaGraphLoading />
          ) : (
            <ArenaPeopleGraph
              postWindow={props.postWindow}
              graphInfo={props.graphInfo}
              topTags={props.topics}
              positions={props.graphPositions}
              users={users}
              metric={metric}
              topic={props.topic}
              onTopic={props.onTopic}
              selectedId={selected?.id}
              onSelect={setChosen}
            />
          )
        ) : (
          <ArenaPeopleFloor
            users={users}
            isList={props.isList}
            metric={metric}
            loading={loading}
            selectedId={selected?.id}
            onSelect={setChosen}
            onExpand={() => setConversationOpen(true)}
          />
        )}
      </ArenaStage>
      {selected && !props.isGraph && (
        <ArenaFullscreenLayer
          open={conversationOpen}
          onOpenChange={setConversationOpen}
          title={`Popular post by ${selected.name || formatPublicKey({ key: selected.id })}`}
        >
          <ArenaPersonConversation
            key={selected.id}
            eager
            author={selected.id}
            authorName={selected.name}
            postWindow={props.postWindow}
          />
        </ArenaFullscreenLayer>
      )}
    </>
  );
}

function ArenaTopic(
  props: Omit<StageProps, 'metric' | 'content'> & { reach: ReachType; metric: ArenaMetric; content: ContentType },
) {
  const [awardTarget, setAwardTarget] = useState<{ user: string; postId?: string; request: number }>();
  const [conversationOpen, setConversationOpen] = useState(false);
  const [showMuted, setShowMuted] = useState(false);
  const { isMuted } = useMutedUsers();
  const streamId = getArenaCandidateStreamId(
    props.topic,
    props.metric,
    props.postWindow.timeframe,
    props.content,
    props.reach,
  );
  const isBoundedTimeframe = props.postWindow.timeframe !== TIMEFRAME.ALL_TIME;
  const stream = useStreamPagination({
    streamId,
    limit: isBoundedTimeframe ? ARENA_TIMEFRAME_PAGE_SIZE : ARENA_PAGE_SIZE,
    includeMuted: true,
  });
  const { hasMore, loadMore, loading, loadingMore, postIds } = stream;
  // Retain muted candidates locally so the empty state can explain why posts are hidden.
  const { ideas, loading: readingIdeas, error } = useArenaIdeas(stream.postIds, { includeMuted: true });
  const matchingIdeas = filterArenaIdeasByContent(ideas, props.content);
  const allRanked = rankArenaIdeasForTimeframe(
    matchingIdeas,
    props.metric,
    props.postWindow.timeframe,
    props.postWindow.now,
  );
  const hiddenByMute = allRanked.some((idea) => isMuted(idea.author));
  const ranked = showMuted
    ? allRanked
    : rankArenaIdeas(
        allRanked.filter((idea) => !isMuted(idea.author)),
        props.metric,
      );
  const needsMoreCandidates =
    postIds.length > 0 &&
    (isBoundedTimeframe
      ? ideas.length === 0 ||
        shouldLoadMoreArenaCandidates(ideas, props.postWindow.timeframe, props.postWindow.now, props.content)
      : ranked.length < ARENA_PAGE_SIZE);
  // Mount standings once the candidate scan is complete. Intermediate pages
  // otherwise restart floor animations and graph simulations after each read.
  const preparingCandidates =
    !stream.error && !error && (loading || loadingMore || readingIdeas || (hasMore && needsMoreCandidates));
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = ranked.find((idea) => idea.id === chosen) ?? ranked[0];
  const rootId = selected?.replyTo ?? selected?.id;
  useEffect(() => {
    if (!loading && !loadingMore && !readingIdeas && !stream.error && !error && hasMore && needsMoreCandidates) {
      void loadMore();
    }
  }, [error, hasMore, loadMore, loading, loadingMore, needsMoreCandidates, readingIdeas, stream.error]);
  return (
    <>
      {showMuted &&
        props.muteControlTarget &&
        createPortal(
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-xs text-muted-foreground"
            aria-pressed={showMuted}
            onClick={() => setShowMuted(false)}
          >
            <EyeOff className="size-3.5" aria-hidden="true" />
            <span>Hide muted</span>
          </Button>,
          props.muteControlTarget,
        )}
      <ArenaStage {...props} paused={conversationOpen}>
        {preparingCandidates ? (
          props.isGraph ? (
            <ArenaGraphLoading />
          ) : (
            <ArenaLoading compact isList={props.isList} />
          )
        ) : stream.error || error ? (
          <div className={styles.status} role="alert">
            Could not load ideas.{' '}
            <Button onClick={() => void stream.refresh()} variant="ghost">
              Retry
            </Button>
          </div>
        ) : !ranked.length ? (
          <div className={styles.status} role="status">
            {hiddenByMute && !showMuted ? (
              <>
                <p>Posts are hidden by your mute settings.</p>
                <Button className="mt-4" variant="secondary" onClick={() => setShowMuted(true)}>
                  <Eye className="size-4" aria-hidden="true" />
                  <span>Muted</span>
                </Button>
              </>
            ) : props.topic === null ? (
              'No posts found for these filters.'
            ) : (
              'No posts found for this tag.'
            )}
          </div>
        ) : props.isGraph ? (
          <ArenaPostGraph
            contentLabel={CONTENT_OPTIONS.find((option) => option.value === props.content)?.label ?? 'Content'}
            postWindow={props.postWindow}
            graphInfo={props.graphInfo}
            topTags={props.topics}
            positions={props.graphPositions}
            ideas={ranked}
            metric={props.metric}
            topic={props.topic}
            onTopic={props.onTopic}
            selectedId={selected?.id}
            onSelect={setChosen}
          />
        ) : (
          <ArenaFloor
            onAwards={(user, postId) => {
              const existing = postId ? document.getElementById(`post-awards-${postId}`) : null;
              if (existing) {
                scrollToArenaTarget(existing);
                return;
              }
              setAwardTarget((previous) => ({ user, postId, request: (previous?.request ?? 0) + 1 }));
            }}
            ideas={ranked}
            selectedId={selected?.id}
            onSelect={setChosen}
            onExpand={() => setConversationOpen(true)}
            isList={props.isList}
            metric={props.metric}
            topic={props.topic}
            contentLabel={CONTENT_OPTIONS.find((option) => option.value === props.content)?.label ?? 'Content'}
            rotationKey={`${props.topic}:${props.content}:${props.reach}:${props.postWindow.timeframe}`}
          />
        )}
      </ArenaStage>
      {rootId && selected && !props.isGraph && (
        <ArenaPostDialog
          idea={selected}
          open={conversationOpen}
          onOpenChange={setConversationOpen}
          postWindow={props.postWindow}
          showMuted={showMuted}
        />
      )}
      {awardTarget && <ArenaAwardsSection {...awardTarget} />}
    </>
  );
}

function ArenaLoading({ compact = false, isList = false }: { compact?: boolean; isList?: boolean }) {
  return (
    <div
      className={cn(styles.arenaLoading, !compact && styles.initialArenaLoading)}
      role="status"
      aria-label="Loading Arena"
    >
      <ArenaFloorSkeleton isList={isList} />
      <span className="sr-only">Loading Arena…</span>
    </div>
  );
}
