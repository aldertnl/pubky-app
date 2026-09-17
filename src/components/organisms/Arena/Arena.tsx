'use client';
import { scrollToArenaTarget } from '@/libs/arena/scrollToArenaTarget';
import { ArenaAwardsSection } from './ArenaAwardsSection';

import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  Calendar,
  CalendarRange,
  Clock,
  Eye,
  EyeOff,
  Flame,
  Grip,
  Layers,
  type LucideIcon,
  MessageCircle,
  Orbit,
  Repeat,
  RotateCcw,
  Star,
  StickyNote,
  Tag as TagIcon,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { useArenaIdeas } from '@/hooks/useArenaIdeas/useArenaIdeas';
import { useArenaPeople } from '@/hooks/useArenaPeople/useArenaPeople';
import { useArenaRecentPeople } from '@/hooks/useArenaRecentPeople/useArenaRecentPeople';
import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
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
import { cn, generateRandomColor, hexToRgba } from '@/libs/utils/utils';
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
import styles from './Arena.module.css';
import { ArenaConversation } from './ArenaConversation';
import { ArenaFilterMenu } from './ArenaFilterMenu';
import { ArenaFloor, ArenaFloorSkeleton } from './ArenaFloor';
import { ArenaParticles } from './ArenaParticles';
import { ArenaPeopleFloor } from './ArenaPeopleFloor';
import { ArenaPersonConversation } from './ArenaPersonConversation';
import { ArenaTagConnectors } from './ArenaTagConnectors';
import { ArenaTagPicker } from './ArenaTagPicker';

const WINDOWS = [
  { value: TIMEFRAME.TODAY, label: 'Today’s', contextLabel: 'Today', icon: Star },
  { value: TIMEFRAME.THIS_WEEK, label: 'This week’s', contextLabel: 'This week', icon: CalendarRange },
  { value: TIMEFRAME.THIS_MONTH, label: 'This month’s', contextLabel: 'This month', icon: Calendar },
  { value: TIMEFRAME.ALL_TIME, label: 'All-time', contextLabel: 'All time', icon: Clock },
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
const CONTENT_OPTIONS = [{ value: ARENA_PEOPLE, label: 'People', icon: UsersRound }, ...POST_CONTENT_OPTIONS];
type ArenaContent = ContentType | typeof ARENA_PEOPLE;
type ArenaRanking = ArenaMetric | ArenaPeopleMetric;

const VIEW_OPTIONS = [
  { value: 'arena' as const, label: 'In arena', icon: Orbit },
  { value: 'list' as const, label: 'In grid', icon: Grip },
];
const TOPIC_AVATAR_LIMIT = 3;
const CONTENT_INDICATOR = { label: 'Content', icon: Layers };
const PEOPLE_INDICATOR = { label: 'People', icon: UsersRound };

const RANK_OPTIONS = [
  { value: 'popular', label: 'Most popular', icon: Flame, indicators: [CONTENT_INDICATOR, PEOPLE_INDICATOR] },
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
  muteControlTarget: HTMLDivElement | null;
  topics: NexusHotTag[];
  postWindow: PostWindow;
  topic: ArenaTopicFilter;
  onTopic: (topic: ArenaTopicFilter) => void;
  isList: boolean;
  metric: ArenaRanking;
  content: ArenaContent;
};

export function Arena() {
  const { reach, setReach, timeframe, setTimeframe } = useHotStore();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const effectiveReach = currentUserPubky ? reach : REACH.ALL;
  const { requireAuth } = useRequireAuth();
  const isPhone = useIsMobile({ breakpoint: 'sm' });
  const [isList, setIsList] = useState(false);
  const [muteControlTarget, setMuteControlTarget] = useState<HTMLDivElement | null>(null);
  const displayAsGrid = isPhone || isList;
  const [resetCount, setResetCount] = useState(0);
  const [metric, setMetric] = useState<ArenaRanking>('popular');
  const [content, setContent] = useState<ArenaContent>(CONTENT.ALL);
  const contentIndicator = POST_CONTENT_OPTIONS.find((option) => option.value === content) ?? CONTENT_INDICATOR;
  const rankOptions = RANK_OPTIONS.map((option) => ({
    ...option,
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
  function changeReach(value: ReachType) {
    const applyReach = () => {
      setChosenTopic((previous) => (previous?.label === null ? previous : null));
      setReach(value);
    };
    if (value === REACH.ALL) applyReach();
    else requireAuth(applyReach);
  }
  function changeMetric(value: ArenaRanking) {
    setMetric(value);
    if (value === 'active' || value === 'posts') setContent(ARENA_PEOPLE);
    else if (content === ARENA_PEOPLE && value === 'reposts') setContent(CONTENT.ALL);
  }
  function changeContent(value: ArenaContent) {
    setContent(value);
    if (value === ARENA_PEOPLE) {
      if (metric === 'reposts') setMetric('active');
    } else if (metric === 'active' || metric === 'posts') setMetric('popular');
  }
  function resetFilters() {
    setResetCount((count) => count + 1);
    setChosenTopic(null);
    setTimeframe(TIMEFRAME.THIS_MONTH);
    setMetric('popular');
    setContent(CONTENT.ALL);
    setReach(currentUserPubky ? REACH.NETWORK : REACH.ALL);
    setIsList(false);
  }
  return (
    <div className={styles.arena}>
      <div className={styles.toolbar}>
        <div className={cn(styles.filters, 'font-medium')} role="group" aria-label="Arena filters">
          <div className={styles.filterClause}>
            <ArenaFilterMenu
              label="Timeframe"
              value={timeframe}
              options={WINDOWS}
              onChange={(value) => {
                // Preserve the displayed selection, including an initially defaulted top tag.
                setChosenTopic(
                  topic === undefined
                    ? null
                    : { scope: `${effectiveReach}:${value}:${currentUserPubky ?? 'guest'}`, label: topic },
                );
                setTimeframe(value);
              }}
            />
          </div>{' '}
          <div className={styles.filterClause}>
            <ArenaFilterMenu label="Ranking" value={metric} options={rankOptions} onChange={changeMetric} lowercase />
          </div>{' '}
          <div className={styles.filterClause}>
            <ArenaTagPicker
              key={topic}
              topic={topic}
              topics={topics.rawTags}
              timeframeLabel={WINDOWS.find((window) => window.value === timeframe)?.contextLabel ?? timeframe}
              onTopic={(label) => setChosenTopic({ scope, label })}
            />
          </div>{' '}
          <div className={styles.filterClause}>
            <ArenaFilterMenu
              label="Content"
              value={content}
              options={CONTENT_OPTIONS}
              separatorAfter={CONTENT.ALL}
              onChange={changeContent}
              lowercase
            />
          </div>{' '}
          <div className={styles.viewActions}>
            <div className={styles.filterClause}>
              <ArenaFilterMenu
                label="Reach"
                value={effectiveReach}
                options={REACH_MENU_OPTIONS}
                onChange={changeReach}
                lowercase
              />
            </div>{' '}
            <div className={cn(styles.filterClause, styles.mobileHidden)}>
              <ArenaFilterMenu
                label="View"
                value={isList ? 'list' : 'arena'}
                options={VIEW_OPTIONS}
                onChange={(value) => setIsList(value === 'list')}
                lowercase
              />
            </div>
            <div className={styles.toolbarActions}>
              <div ref={setMuteControlTarget} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={resetFilters}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                <span>Reset</span>
              </Button>
            </div>
          </div>
          <div className="ml-auto shrink-0">
            <AwardsEntry />
          </div>
        </div>
      </div>
      <ArenaTopics
        muteControlTarget={muteControlTarget}
        key={`${scope}:${resetCount}`}
        reach={effectiveReach}
        timeframe={timeframe}
        data={topics}
        topic={topic}
        onTopic={(label) => setChosenTopic({ scope, label })}
        isList={displayAsGrid}
        metric={metric}
        content={content}
      />
      <details className="mt-6 text-xs text-muted-foreground">
        <summary className="w-fit cursor-pointer text-xs leading-4 font-medium tracking-[0.075rem] uppercase">
          How ranking works
        </summary>
        <div className="mt-2 max-w-2xl space-y-2 leading-relaxed">
          {content === ARENA_PEOPLE ? (
            <>
              <p>
                Most recent shows people who posted most recently within your selected reach and timeframe, with each
                person appearing once. The other People rankings use the homepage’s active-user feed. Most active
                preserves its order. Most popular ranks those people by followers; Most tagged by tags they have
                applied; Most posted by post count; Most replied by replies written. These stats are lifetime totals and
                may be cached.
              </p>
              <p>
                A selected tag matches tags on people’s profiles. All removes that filter. The topic suggestions still
                come from trending post tags. Muted people are excluded. Up to ten people are shown. Selecting a person
                shows their most popular original post and its leading reply below, using the selected timeframe and the
                same post popularity score as Content. The profile tag does not filter these posts or replies.
              </p>
            </>
          ) : (
            <>
              <p>
                Topics follow Pubky’s trending-tag ranking for your selected reach and timeframe. A topic’s count is the
                number of posts carrying that tag. Reach filters the trending topics; posts competing under a selected
                tag currently come from everyone. Choose All to remove the tag filter and rank content from your
                selected reach, including posts without tags.
              </p>
              <p>
                Today, This week, and This month use rolling 24-hour, 7-day, and 30-day windows based on the timestamp
                shown on each post. All time has no age limit. Content includes all types; choosing a specific type
                limits the competing posts. The Posts filter includes short-form original posts and replies.
              </p>
              <p>
                Most popular adds distinct tag labels + (direct replies × 4) + (reposts × 3). Most tagged, Most replied,
                and Most reposted use only that count. These are lifetime counts, even when a timeframe is selected.
                Most recent orders posts by their displayed timestamp. Tags measure attention, not necessarily
                agreement. Counts may be cached.
              </p>
              <p>
                Standings compare the loaded posts that match your tag, timeframe, and content type. They may not cover
                every matching post, especially for All time. Arena shows up to ten posts and keeps your selection
                visible; Grid shows up to nine. Tied scores receive separate ranks in a consistent order. Muted authors
                and deleted posts are excluded.
              </p>
              <p>
                Selecting a reply shows the post it replies to in the conversation below. The leading reply always uses
                Most popular, regardless of the ranking selected above. Direct replies to the original are checked using
                the same timeframe and mute settings, without filtering by tag, content type, or reach. Show all replies
                opens the full thread.
              </p>
            </>
          )}
        </div>
      </details>
    </div>
  );
}

function ArenaTopics({
  reach,
  timeframe,
  data,
  topic,
  onTopic,
  ...display
}: {
  reach: ReachType;
  timeframe: TimeframeType;
  data: ReturnType<typeof useHotTags>;
  topic?: ArenaTopicFilter;
  onTopic: StageProps['onTopic'];
} & Pick<StageProps, 'isList' | 'metric' | 'content' | 'muteControlTarget'>) {
  // The parent remounts this scope when its shared timeframe changes.
  const [now] = useState(Date.now);
  const { rawTags, isLoading, error, refetch } = data;
  if (isLoading && topic === undefined) return <ArenaLoading isList={display.isList} />;
  if (error && topic === undefined)
    return (
      <div className={styles.status} role="alert">
        Could not load topics.{' '}
        <Button variant="ghost" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  if (topic === undefined)
    return (
      <div className={styles.status} role="status">
        No topics in this window. Try a wider timeframe.
      </div>
    );
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

function ArenaStage({
  topics,
  topic,
  onTopic,
  isList,
  metric,
  content,
  postWindow,
  children,
}: Pick<StageProps, 'topics' | 'topic' | 'onTopic' | 'isList' | 'metric' | 'content' | 'postWindow'> & {
  children: React.ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [tagRotations, setTagRotations] = useState<number[]>([]);
  const { isMuted } = useMutedUsers();
  const topicTaggers = isList
    ? []
    : topics.map((tag) => [...new Set(tag.taggers_id)].filter((id) => !isMuted(id)).slice(0, TOPIC_AVATAR_LIMIT));
  // Resolve only the visible faces; avoid fetching profiles for the rest of the taggers.
  const visibleTaggerIds = [...new Set(topicTaggers.flat())];
  const { getUsersWithAvatars } = useBulkUserAvatars(visibleTaggerIds);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let inView = true;
    const update = () => stage.toggleAttribute('data-arena-paused', !inView || document.hidden);
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
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setTagRotations(Array.from({ length: ARENA_TOPIC_LIMIT }, () => (Math.random() - 0.5) * 4));
    });
    return () => cancelAnimationFrame(frame);
  }, [topic, metric, content, isList, postWindow.timeframe]);

  return (
    <div
      ref={stageRef}
      className={cn(styles.stage, isList && styles.listStage)}
      style={{ '--arena-topic-color': topic === null ? 'var(--brand)' : generateRandomColor(topic) } as CSSProperties}
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
      {!isList && topic !== null && <ArenaTagConnectors key={topic} stageRef={stageRef} topic={topic} />}
      <div className={styles.topics} role="group" aria-label="Topic standings">
        {topics.map((tag, index) => {
          const rank = index + 1;
          const tagColor = generateRandomColor(tag.label);
          const selected = tag.label === topic;
          const taggers = topicTaggers[index];
          const hasTaggers = Boolean(taggers?.length);
          return (
            <div
              key={tag.label}
              className={cn(styles.topic, hasTaggers && styles.topicWithTaggers)}
              style={{ opacity: selected ? 1 : Math.max(0.55, (21 - rank) / 20) }}
              role="group"
              aria-label={`Rank ${rank}`}
            >
              <div
                className={styles.topicControl}
                style={
                  {
                    '--arena-tag-scale': (20 + ARENA_TOPIC_LIMIT - rank) / 20,
                    '--arena-tag-rotation': `${tagRotations[index] ?? 0}deg`,
                    '--arena-topic-pill-color': tagColor,
                    '--arena-topic-pill-glow': hexToRgba(tagColor, 0.32),
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
                      label={tag.label}
                      maxLabelLength={14}
                      className={cn('max-w-none shrink-0', styles.topicTag)}
                      selectedStyle={{
                        borderColor: tagColor,
                        boxShadow: `inset 0 0 8px 0 ${tagColor}`,
                      }}
                      count={tag.tagged_count}
                      selected={selected}
                      onClick={() => onTopic(tag.label)}
                    />
                    {hasTaggers && taggers && (
                      <div
                        className={styles.topicTaggers}
                        role="group"
                        aria-label={`${tag.label} topic taggers`}
                        title="People who added this topic tag"
                      >
                        <AvatarGroup
                          items={getUsersWithAvatars(taggers)}
                          totalCount={taggers.length}
                          maxAvatars={TOPIC_AVATAR_LIMIT}
                          className={styles.topicAvatars}
                          data-testid={`arena-topic-taggers-${tag.label}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
  const [awardTarget, setAwardTarget] = useState<{ user: string; postId?: string; request: number }>();
  const [personScrollRequest, setPersonScrollRequest] = useState(0);
  useLayoutEffect(() => {
    if (!personScrollRequest) return;
    return scrollToArenaTarget(conversationRef.current);
  }, [personScrollRequest]);
  const conversationRef = useRef<HTMLDivElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const metric = props.metric as ArenaPeopleMetric;
  const { users, loading, error, retry } = people;
  const selected = !loading && !error ? (users.find((user) => user.id === chosen) ?? users[0]) : undefined;
  return (
    <>
      <ArenaStage {...props}>
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
        ) : (
          <ArenaPeopleFloor
            onAwards={(user) => {
              setAwardTarget((previous) => ({ user, request: (previous?.request ?? 0) + 1 }));
            }}
            users={users}
            isList={props.isList}
            metric={metric}
            loading={loading}
            selectedId={selected?.id}
            onSelect={(id) => {
              setChosen(id);
              setPersonScrollRequest((request) => request + 1);
            }}
            onExpand={() => {
              const target = conversationRef.current;
              if (!target) return;
              scrollToArenaTarget(target);
            }}
          />
        )}
      </ArenaStage>
      {selected && (
        <div
          ref={conversationRef}
          className={styles.conversationTarget}
          tabIndex={-1}
          aria-label="Original post conversation"
        >
          <ArenaPersonConversation
            key={selected.id}
            awardsScrollRequest={awardTarget?.user === selected.id ? awardTarget.request : 0}
            eager={personScrollRequest > 0}
            author={selected.id}
            authorName={selected.name}
            postWindow={props.postWindow}
          />
        </div>
      )}
    </>
  );
}

function ArenaTopic(
  props: Omit<StageProps, 'metric' | 'content'> & { reach: ReachType; metric: ArenaMetric; content: ContentType },
) {
  const [awardTarget, setAwardTarget] = useState<{ user: string; postId?: string; request: number }>();
  const conversationRef = useRef<HTMLDivElement>(null);
  const [scrollRequest, setScrollRequest] = useState(0);
  useLayoutEffect(() => {
    if (!scrollRequest) return;
    const target = conversationRef.current;
    if (!target) return;
    return scrollToArenaTarget(target);
  }, [scrollRequest]);
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
  const { ideas, error } = useArenaIdeas(stream.postIds, { includeMuted: true });
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
  const needsMoreCandidates = isBoundedTimeframe
    ? shouldLoadMoreArenaCandidates(ideas, props.postWindow.timeframe, props.postWindow.now, props.content)
    : ideas.length > 0 && ranked.length < ARENA_PAGE_SIZE;
  const findingFirstMatch = !ranked.length && hasMore && needsMoreCandidates && !stream.error && !error;
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = ranked.find((idea) => idea.id === chosen) ?? ranked[0];
  const rootId = selected?.replyTo ?? selected?.id;
  useEffect(() => {
    if (
      !loading &&
      !loadingMore &&
      !stream.error &&
      !error &&
      hasMore &&
      ideas.length === postIds.length &&
      needsMoreCandidates
    ) {
      void loadMore();
    }
  }, [error, hasMore, ideas.length, loadMore, loading, loadingMore, needsMoreCandidates, postIds.length, stream.error]);
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
      <ArenaStage {...props}>
        {stream.loading || findingFirstMatch ? (
          <ArenaLoading compact isList={props.isList} />
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
            onSelect={(id) => {
              setChosen(id);
              setScrollRequest((request) => request + 1);
            }}
            isList={props.isList}
            metric={props.metric}
            topic={props.topic}
            contentLabel={CONTENT_OPTIONS.find((option) => option.value === props.content)?.label ?? 'Content'}
            rotationKey={`${props.topic}:${props.content}:${props.reach}:${props.postWindow.timeframe}`}
          />
        )}
      </ArenaStage>
      {rootId && selected && (
        <div
          ref={conversationRef}
          className={styles.conversationTarget}
          tabIndex={-1}
          aria-label="Original post conversation"
        >
          <ArenaConversation
            key={rootId}
            eager={scrollRequest > 0}
            postWindow={props.postWindow}
            rootId={rootId}
            selectedId={selected.id}
            showMuted={showMuted}
          />
        </div>
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
