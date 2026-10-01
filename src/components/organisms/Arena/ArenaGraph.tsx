'use client';

import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, CircleHelp, Maximize, Minimize, SquareUserRound, X, ZoomIn, ZoomOut } from 'lucide-react';
import { getUserProfileUrl } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Link } from '@/atoms/Link/Link';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@/atoms/Tooltip/Tooltip';
import { Typography } from '@/atoms/Typography/Typography';
import { useArenaGraphMetadata } from '@/hooks/useArenaGraphMetadata/useArenaGraphMetadata';
import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import { useFullscreenToggle } from '@/hooks/useFullscreenToggle/useFullscreenToggle';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { useRelativeTime } from '@/hooks/useRelativeTime/useRelativeTime';
import { useResolvedMentions } from '@/hooks/useResolvedMentions/useResolvedMentions';
import { useTrackedPoint } from '@/hooks/useTrackedPoint/useTrackedPoint';
import type { UserStreamUser } from '@/hooks/useUserStream/useUserStream.types';
import {
  ARENA_TOPIC_LIMIT,
  ARENA_VISIBLE_IDEAS,
  type ArenaMetric,
  getArenaLead,
  getArenaPreviewLabel,
  getArenaVisibleIdeas,
  type RankedArenaIdea,
} from '@/libs/arena/arena';
import { arenaPeopleToGraph, arenaPersonAnnotation, arenaPostsToGraph } from '@/libs/arena/graph';
import { ARENA_PEOPLE_LIMIT, type ArenaPeopleMetric } from '@/libs/arena/people';
import { arenaPostRankingStats } from '@/libs/arena/stats';
import type { GraphPosition, NexusGraph, NexusGraphNode, NexusGraphUserNode } from '@/libs/graph/graph.types';
import type { GraphTier } from '@/libs/graph/graph.utils';
import { canonicalizeTagLabel, cn, formatPublicKey, generateRandomColor } from '@/libs/utils/utils';
import { CanvasAnchoredPopover } from '@/molecules/CanvasAnchoredPopover/CanvasAnchoredPopover';
import { UserInfoPopoverContent } from '@/molecules/UserInfoPopover/components/UserInfoPopoverContent/UserInfoPopoverContent';
import { UserInfoPopoverHeader } from '@/molecules/UserInfoPopover/components/UserInfoPopoverHeader/UserInfoPopoverHeader';
import { UserInfoPopover } from '@/molecules/UserInfoPopover/UserInfoPopover';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { SocialGraph } from '@/organisms/SocialGraph/SocialGraph';
import type { GraphNodeAnnotation, SocialGraphHandle } from '@/organisms/SocialGraph/SocialGraph.types';
import type { NexusHotTag } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { TimeframeType } from '@/stores/hot/hot.types';
import styles from './Arena.module.css';
import { ArenaGraphConnection } from './ArenaGraphConnection';
import { ArenaGraphLoading } from './ArenaGraphLoading';
import { ArenaGraphProfileTags } from './ArenaGraphProfileTags';
import { ArenaGraphTagPosts } from './ArenaGraphTagPosts';
import { ArenaPostCard } from './ArenaPostCard';
import { ArenaPostDialog } from './ArenaPostDialog';
import { ArenaRankedTag } from './ArenaRankedTag';
import { ARENA_STAT_ICONS, ArenaRank } from './ArenaStats';
import { useArenaGraphConnection } from './useArenaGraphConnection';
import { useArenaGraphHeight } from './useArenaGraphHeight';
import { useArenaPostImages } from './useArenaPostImages';

const CONTENDERS_MENU_LIMIT = ARENA_VISIBLE_IDEAS;
const GRAPH_STACK_VISIBLE_COUNT = 3;

function useArenaStackHeight(contentRef: RefObject<HTMLElement | null>, enabled: boolean, selector: string) {
  useLayoutEffect(() => {
    if (!enabled) return;
    const content = contentRef.current;
    const scroller = content?.parentElement;
    if (!content || !scroller) return;
    const measure = () => {
      const rows = Array.from(content.querySelectorAll<HTMLElement>(selector))
        .slice(0, GRAPH_STACK_VISIBLE_COUNT)
        .map((item) => item.closest('li') ?? item);
      for (const row of rows) resize.observe(row);
      const last = rows.at(-1);
      if (!last) {
        scroller.style.removeProperty('--arena-stack-height');
        return;
      }
      const padding = getComputedStyle(scroller);
      const height =
        last.offsetTop +
        last.offsetHeight +
        parseFloat(padding.paddingTop) +
        parseFloat(padding.paddingBottom) +
        parseFloat(padding.borderTopWidth) +
        parseFloat(padding.borderBottomWidth);
      scroller.style.setProperty('--arena-stack-height', `${Math.ceil(height)}px`);
    };
    const resize = new ResizeObserver(measure);
    resize.observe(content);
    const mutation = new MutationObserver(measure);
    mutation.observe(content, { childList: true, subtree: true });
    measure();
    return () => {
      resize.disconnect();
      mutation.disconnect();
      scroller.style.removeProperty('--arena-stack-height');
    };
  }, [contentRef, enabled, selector]);
}

function ArenaGraphStandings({ children, showTagRanks }: { children: ReactNode; showTagRanks: boolean }) {
  return (
    <div className={cn('overflow-y-auto', styles.graphStandings)}>
      <ol aria-label="Graph standings" className={cn('relative', showTagRanks ? 'space-y-2' : 'space-y-1.5')}>
        {children}
      </ol>
    </div>
  );
}

type SharedProps = {
  renderLimit?: number;
  graphInfo?: { details: ReactNode };
  contentLabel?: string;
  topTags?: NexusHotTag[];
  positions?: Map<string, GraphPosition>;
  postWindow?: { timeframe: TimeframeType; now: number };
  topic: string | null;
  selectedId?: string;
  onSelect: (id: string) => void;
  onTopic: (topic: string | null) => void;
};

export function ArenaPostGraph({
  ideas,
  metric,
  ...props
}: SharedProps & { ideas: RankedArenaIdea[]; metric: ArenaMetric }) {
  const visible = getArenaVisibleIdeas(ideas.slice(0, props.renderLimit), props.selectedId);
  const resolvedMentions = useResolvedMentions(visible.map((idea) => idea.preview));
  const metadata = useArenaGraphMetadata(
    visible.map((idea) => idea.id),
    visible.map((idea) => idea.author),
    false,
  );
  const graph = arenaPostsToGraph(visible, metadata.metadata, props.topic);
  const { formatRelativeTime } = useRelativeTime();
  const annotations = new Map(
    visible.map((idea) => [
      `post:${idea.id}`,
      {
        rank: idea.rank,
        title: (resolvedMentions.get(idea.preview) ?? idea.preview).replace(/\s+/g, ' ').trim(),
        stats: [
          ...(metric === 'newest'
            ? [{ kind: 'time' as const, value: formatRelativeTime(new Date(idea.indexedAt)) }]
            : []),
          ...arenaPostRankingStats(idea, metric).map(({ kind, count }) => ({
            kind,
            value: count?.toLocaleString('en-US') ?? '…',
          })),
        ],
        metric:
          metric === 'newest'
            ? `${formatRelativeTime(new Date(idea.indexedAt))} ago`
            : `${idea.score.toLocaleString('en-US')} ${metric === 'popular' ? 'points' : metric}`,
      },
    ]),
  );
  if (metadata.loading) return <ArenaGraphLoading />;
  return (
    <ArenaGraph
      {...props}
      graph={graph}
      annotations={annotations}
      metric={metric}
      selectedNodeId={props.selectedId ? `post:${props.selectedId}` : null}
      ideas={visible}
      users={[]}
      lead={getArenaLead(visible, metric)}
      connectionStatus={metadata}
    />
  );
}

export function ArenaPeopleGraph({
  users,
  metric,
  ...props
}: SharedProps & { users: UserStreamUser[]; metric: ArenaPeopleMetric }) {
  const visible = users.slice(0, props.renderLimit ?? ARENA_PEOPLE_LIMIT);
  const metadata = useArenaGraphMetadata(
    [],
    visible.map((user) => user.id),
    true,
  );
  const graph = arenaPeopleToGraph(visible, metadata.metadata, props.topic);
  const annotations = new Map(
    visible.map((user, index) => [`user:${user.id}`, arenaPersonAnnotation(user, index, metric)]),
  );
  if (metadata.loading) return <ArenaGraphLoading />;
  return (
    <ArenaGraph
      {...props}
      graph={graph}
      annotations={annotations}
      metric={metric}
      selectedNodeId={props.selectedId ? `user:${props.selectedId}` : null}
      contentLabel="People"
      ideas={[]}
      users={visible}
      lead=""
      connectionStatus={metadata}
    />
  );
}

export function ArenaTagsGraph({ topics, ...props }: SharedProps & { topics: NexusHotTag[] }) {
  const visible = topics.slice(0, props.renderLimit ?? ARENA_TOPIC_LIMIT);
  const { isMuted } = useMutedUsers();
  const taggers = visible.map((tag) => [...new Set(tag.taggers_id)].filter((id) => !isMuted(id)).slice(0, 3));
  const ids = [...new Set(taggers.flat())];
  const { usersMap } = useBulkUserAvatars(ids);
  const graph: NexusGraph = {
    nodes: [
      ...visible.map((tag) => ({
        kind: 'tag' as const,
        id: `tag:${tag.label}`,
        label: tag.label,
        count: tag.tagged_count,
      })),
      ...ids.map((id) => ({
        kind: 'user' as const,
        id: `user:${id}`,
        pubky: id,
        name: usersMap.get(id)?.name ?? '',
        image: usersMap.get(id)?.avatarUrl ?? null,
      })),
    ],
    edges: visible.flatMap((tag, index) =>
      taggers[index].map((id) => ({
        source: `tag:${tag.label}`,
        target: `user:${id}`,
        type: 'TAGGED' as const,
        label: tag.label,
      })),
    ),
  };
  const annotations = new Map<string, GraphNodeAnnotation>(
    visible.map((tag, index) => [
      `tag:${tag.label}`,
      {
        rank: index + 1,
        title: tag.label,
        metric: `${tag.tagged_count.toLocaleString('en-US')} posts`,
        stats: [{ kind: 'posts' as const, value: tag.tagged_count.toLocaleString('en-US') }],
      },
    ]),
  );
  return (
    <ArenaGraph
      {...props}
      topTags={topics}
      showTagRanks
      contentLabel="Tags"
      graph={graph}
      annotations={annotations}
      metric="popular"
      selectedNodeId={props.selectedId ? `tag:${props.selectedId}` : null}
      ideas={[]}
      users={[]}
      lead=""
    />
  );
}

function ArenaGraph({
  graphInfo,
  renderLimit = CONTENDERS_MENU_LIMIT,
  contentLabel = 'Content',
  topTags,
  showTagRanks = false,
  graph,
  positions,
  annotations,
  metric,
  topic,
  selectedNodeId,
  onSelect,
  ideas,
  users,
  lead,
  connectionStatus,
  postWindow,
}: {
  graph: NexusGraph;
  annotations: Map<string, GraphNodeAnnotation>;
  metric: ArenaMetric | ArenaPeopleMetric;
  selectedNodeId: string | null;
  ideas: RankedArenaIdea[];
  users: UserStreamUser[];
  lead: string;
  showTagRanks?: boolean;
  connectionStatus?: { loading: boolean; error: boolean; retry: () => void };
} & SharedProps) {
  const isPhone = useIsMobile({ breakpoint: 'sm' });
  const contendersLabel = `Top ${renderLimit}`;
  const renderer = useRef<SocialGraphHandle>(null);
  const tagRanks = new Map(
    showTagRanks
      ? topTags?.slice(0, ARENA_TOPIC_LIMIT).map((tag, index) => [canonicalizeTagLabel(tag.label), index + 1] as const)
      : [],
  );
  const container = useRef<HTMLElement>(null);
  const [canvasBoundary, setCanvasBoundary] = useState<HTMLElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const contenderTrigger = useRef<HTMLButtonElement>(null);
  const [openPanel, setOpenPanel] = useState<'contenders' | 'info' | 'connection' | null>(null);
  const [popupId, setPopupId] = useState<string | null>(null);
  const [userSelection, setUserSelection] = useState<{ scope: string; node: NexusGraphUserNode } | null>(null);
  const viewer = useAuthStore((state) => (state.session ? state.currentUserPubky : null));
  const selectionScope = JSON.stringify([topic, graph.nodes.map((item) => item.id)]);
  const selectedUser = userSelection?.scope === selectionScope ? userSelection.node : null;
  const canConnect = !!viewer && !!selectedUser && viewer !== selectedUser.pubky;
  const connectionOpen = openPanel === 'connection' && canConnect;
  const connection = useArenaGraphConnection(viewer, selectedUser?.pubky ?? null, connectionOpen);
  const displayedGraph = connection.graph ?? graph;
  const pathIds = connection.graph?.nodes.map((item) => item.id) ?? null;
  const [viewedPost, setViewedPost] = useState<RankedArenaIdea | null>(null);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const { isFullscreen, toggleFullscreen } = useFullscreenToggle(() => renderer.current?.fit());
  const height = useArenaGraphHeight(container, isFullscreen);
  const [readyLayout, setReadyLayout] = useState<string | null>(null);
  const layoutKey = JSON.stringify([displayedGraph.nodes.map((item) => item.id), displayedGraph.edges]);
  const layoutReady = readyLayout === layoutKey && !connection.loading;
  useEffect(() => {
    let frame = 0;
    const waitForLayout = () => {
      if (renderer.current?.isSettled()) {
        setReadyLayout(layoutKey);
        if (connection.graph) renderer.current.fit();
      } else frame = requestAnimationFrame(waitForLayout);
    };
    frame = requestAnimationFrame(waitForLayout);
    return () => cancelAnimationFrame(frame);
  }, [layoutKey, connection.graph]);

  const node = displayedGraph.nodes.find((item) => item.id === popupId);
  const position = useTrackedPoint(
    node ? () => renderer.current?.screenPositionOf(node.id) ?? null : null,
    node?.id ?? null,
  );
  const tiers = new Map(displayedGraph.nodes.map((item) => [item.id, 'center' as GraphTier]));
  const sizes = new Map(
    displayedGraph.nodes.map((item) => [
      item.id,
      (annotations.has(item.id) || pathIds ? 'center' : 'direct') as GraphTier,
    ]),
  );
  const contenders = [...annotations];
  const primary = new Set(contenders.map(([id]) => id));
  const connected = node
    ? new Set([
        node.id,
        ...displayedGraph.edges.flatMap((edge) =>
          edge.source === node.id ? [edge.target] : edge.target === node.id ? [edge.source] : [],
        ),
      ])
    : null;
  const emphasizedEdgeType = users.length
    ? undefined
    : metric === 'tags'
      ? 'TAGGED'
      : metric === 'replies'
        ? 'REPLIED'
        : metric === 'reposts'
          ? 'REPOSTED'
          : undefined;
  function closePopup() {
    setPopupId(null);
    setUserSelection(null);
    if (openPanel === 'connection') setOpenPanel(null);
    returnFocus.current?.focus({ preventScroll: true });
  }
  function selectNode(id: string, trigger?: HTMLElement) {
    returnFocus.current = trigger ?? null;
    const selected = displayedGraph.nodes.find((item) => item.id === id);
    setUserSelection(selected?.kind === 'user' ? { scope: selectionScope, node: selected } : null);
    setOpenPanel(null);
    setPopupId(id);
    if (primary.has(id) && !(showTagRanks && id.startsWith('tag:'))) onSelect(id.slice(id.indexOf(':') + 1));
  }
  function togglePanel(panel: 'contenders' | 'info' | 'connection', open: boolean) {
    if (open) setPopupId(null);
    setOpenPanel(open ? panel : null);
  }
  const canvas = (
    <section
      ref={(element) => {
        container.current = element;
        setCanvasBoundary(element);
      }}
      style={isFullscreen ? undefined : { height }}
      aria-label="Arena graph"
      aria-busy={!layoutReady}
      data-arena-graph
      className={cn(
        'flex h-[650px] flex-col overflow-hidden rounded-xl border border-border bg-background font-medium',
        !isFullscreen && 'lg:rounded-br-[2.5rem]',
        isFullscreen && 'fixed inset-3 z-50 m-0 flex h-auto flex-col shadow-2xl',
      )}
    >
      <div className={cn('flex flex-wrap items-center justify-between gap-3 px-4 py-3', styles.graphHover)}>
        <div className="flex flex-wrap items-center gap-1">
          <Popover open={openPanel === 'contenders'} onOpenChange={(open) => togglePanel('contenders', open)}>
            <PopoverTrigger asChild>
              <Button
                ref={contenderTrigger}
                variant="ghost"
                size="sm"
                className="text-xs"
                aria-description={contentLabel}
                data-arena-no-grow
              >
                {contendersLabel}
                <ChevronDown aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="bottom"
              sideOffset={8}
              collisionBoundary={canvasBoundary}
              collisionPadding={16}
              aria-label={contendersLabel}
              style={
                { '--arena-topic-color': topic === null ? 'var(--brand)' : generateRandomColor(topic) } as CSSProperties
              }
              className={cn(
                '@container/grid mx-0 max-h-(--radix-popover-content-available-height) w-80 max-w-[calc(100vw-16px)] overflow-hidden rounded-xl p-3 text-xs font-medium lg:p-4',
                styles.graphSurface,
                styles.graphPopup,
              )}
              onCloseAutoFocus={(event) => {
                if (popupId) event.preventDefault();
              }}
              onEscapeKeyDown={(event) => {
                event.preventDefault();
                setOpenPanel(null);
              }}
            >
              <ArenaGraphStandings showTagRanks={showTagRanks}>
                {contenders.slice(0, renderLimit).map(([id, annotation]) => {
                  const tag = showTagRanks ? topTags?.find((tag) => `tag:${tag.label}` === id) : undefined;
                  if (tag) {
                    return (
                      <li key={id} className="py-1" aria-label={`Rank ${annotation.rank}: ${tag.label}`}>
                        <ArenaRankedTag
                          label={tag.label}
                          count={tag.tagged_count}
                          rank={annotation.rank}
                          selected={id === selectedNodeId}
                          onClick={() => {
                            setOpenPanel(null);
                            selectNode(id, contenderTrigger.current ?? undefined);
                          }}
                        />
                      </li>
                    );
                  }
                  const user = users.find((user) => `user:${user.id}` === id);
                  const name = user ? user.name || formatPublicKey({ key: user.id }) : annotation.title;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        data-arena-no-grow
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md bg-card text-left hover:bg-secondary focus-visible:outline-2 focus-visible:outline-brand',
                          styles.graphCard,
                        )}
                        aria-label={`Rank ${annotation.rank}, ${getArenaPreviewLabel(annotation.title)}, ${annotation.metric}`}
                        aria-pressed={id === selectedNodeId}
                        onClick={() => {
                          setOpenPanel(null);
                          const idea = ideas.find((idea) => `post:${idea.id}` === id);
                          if (isPhone && idea) {
                            setPopupId(null);
                            setUserSelection(null);
                            onSelect(idea.id);
                            setViewedPost(idea);
                            setPostDialogOpen(true);
                          } else selectNode(id, contenderTrigger.current ?? undefined);
                        }}
                      >
                        {user && (
                          <span inert aria-hidden="true" className="shrink-0">
                            <AvatarWithFallback
                              avatarUrl={user.avatarUrl ?? undefined}
                              name={name}
                              fallbackSeed={user.id}
                              size="md"
                            />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <Typography
                            as="span"
                            overrideDefaults
                            className={cn(
                              'block text-sm leading-5 font-bold text-foreground',
                              user ? 'truncate' : 'line-clamp-2 wrap-anywhere',
                            )}
                          >
                            {name}
                          </Typography>
                          <ArenaGraphStats annotation={annotation} className="mt-0.5" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ArenaGraphStandings>
            </PopoverContent>
          </Popover>
          {viewer && selectedUser && canConnect && (
            <ArenaGraphConnection
              viewer={viewer}
              target={selectedUser}
              connection={connection}
              open={connectionOpen}
              onOpenChange={(open) => togglePanel('connection', open)}
            />
          )}
          {(isFullscreen || !graphInfo) && (
            <Popover open={openPanel === 'info'} onOpenChange={(open) => togglePanel('info', open)}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground"
                      aria-label="Ranking summary"
                    >
                      <CircleHelp aria-hidden="true" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipPortal>
                  <TooltipContent variant="accent">Ranking summary</TooltipContent>
                </TooltipPortal>
              </Tooltip>
              <PopoverContent
                align="start"
                sideOffset={8}
                aria-label="Ranking summary"
                className={cn(
                  'mx-0 max-h-96 w-80 space-y-2 overflow-y-auto text-xs font-medium text-muted-foreground',
                  styles.graphSurface,
                )}
                onEscapeKeyDown={(event) => {
                  event.preventDefault();
                  setOpenPanel(null);
                }}
              >
                {graphInfo?.details ?? (
                  <>
                    <h3 className="text-sm font-semibold text-foreground">Ranking summary</h3>
                    <p>Ranks follow the selected sorting option.</p>
                  </>
                )}
              </PopoverContent>
            </Popover>
          )}
          {connectionStatus?.error && (
            <div role="status" className="flex items-center gap-1 text-xs text-muted-foreground">
              Some connections unavailable.
              <Button variant="ghost" size="sm" onClick={connectionStatus.retry}>
                Retry connections
              </Button>
            </div>
          )}
        </div>
        <div className="flex gap-1" role="group" aria-label="Graph controls">
          <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => renderer.current?.zoomOut()}>
            <ZoomOut />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => renderer.current?.zoomIn()}>
            <ZoomIn />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize /> : <Maximize />}
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <SocialGraph
          className={layoutReady ? undefined : 'pointer-events-none opacity-0'}
          tagRanks={tagRanks}
          positions={positions}
          ref={renderer}
          nodes={displayedGraph.nodes}
          edges={displayedGraph.edges}
          annotations={annotations}
          emphasizedEdgeType={emphasizedEdgeType}
          focusId={pathIds?.[0] ?? (topic === null ? null : `tag:${topic}`)}
          selectedId={popupId}
          ringId={pathIds?.at(-1) ?? popupId}
          relationships={new Map()}
          opacityTiers={tiers}
          sizeTiers={sizes}
          spotlight={pathIds ? null : connected}
          pathIds={pathIds}
          communities={null}
          communityLabels={new Map()}
          onNodeClick={selectNode}
          onNodeExpand={selectNode}
          onBackgroundClick={closePopup}
        />
        {!layoutReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
            <Spinner aria-label={connection.loading ? 'Finding connection' : 'Updating graph'} />
          </div>
        )}
        {layoutReady && node && position && (
          <CanvasAnchoredPopover
            x={position.x}
            y={position.y}
            offset={40}
            className={cn(
              'max-h-[calc(100%-16px)] w-80 max-w-[calc(100%-16px)] overflow-auto p-3 lg:p-4',
              styles.graphSurface,
              node.kind === 'tag' && styles.graphTagStack,
            )}
          >
            <ArenaGraphPopup
              key={node.id}
              node={node}
              loadTagPosts={showTagRanks}
              postWindow={postWindow}
              annotation={annotations.get(node.id)}
              ideas={ideas.filter((idea) =>
                node.kind === 'tag' ? connected?.has(`post:${idea.id}`) : `post:${idea.id}` === node.id,
              )}
              users={users.filter((user) =>
                node.kind === 'tag' ? connected?.has(`user:${user.id}`) : `user:${user.id}` === node.id,
              )}
              annotations={annotations}
              lead={lead}
              metric={metric}
              topic={topic}
              onClose={closePopup}
              onViewPost={(idea) => {
                setViewedPost(idea);
                setPostDialogOpen(true);
              }}
            />
          </CanvasAnchoredPopover>
        )}
      </div>
      {viewedPost && (
        <ArenaPostDialog
          idea={viewedPost}
          open={postDialogOpen}
          onOpenChange={(open) => {
            setPostDialogOpen(open);
            if (!open && !popupId) {
              // Restore focus after the dialog's own close-focus handler runs.
              requestAnimationFrame(() => contenderTrigger.current?.focus({ preventScroll: true }));
            }
          }}
          postWindow={postWindow}
        />
      )}
    </section>
  );
  return isFullscreen ? createPortal(canvas, document.body) : canvas;
}

function ArenaGraphProfileDetails({ userId }: { userId: string }) {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  return (
    <>
      <ArenaGraphProfileTags userId={userId} />
      <Button asChild variant="secondary" size="sm" className="w-full gap-2">
        <Link href={getUserProfileUrl(userId, currentUserPubky)} overrideDefaults>
          <SquareUserRound className="size-4" aria-hidden="true" />
          <Typography as="span" className="text-xs leading-4 font-bold" overrideDefaults>
            Profile details
          </Typography>
        </Link>
      </Button>
    </>
  );
}

function ArenaGraphStats({ annotation, className }: { annotation: GraphNodeAnnotation; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 text-xs font-bold text-muted-foreground [&_span]:text-xs', className)}>
      <ArenaRank rank={annotation.rank} />
      {annotation.stats?.map(({ kind, value }) => {
        const Icon = ARENA_STAT_ICONS[kind];
        return (
          <span key={kind} className="inline-flex items-center gap-0.5" aria-label={`${value} ${kind}`}>
            <Icon className="size-3 shrink-0" aria-hidden="true" />
            {value}
          </span>
        );
      })}
    </span>
  );
}

/** Graph positioning wraps the same cards and profile content used elsewhere in the app. */
function ArenaGraphPopup({
  node,
  loadTagPosts,
  postWindow,
  annotation,
  annotations,
  ideas,
  users,
  lead,
  metric,
  topic,
  onClose,
  onViewPost,
}: {
  node: NexusGraphNode;
  loadTagPosts: boolean;
  postWindow?: SharedProps['postWindow'];
  annotation?: GraphNodeAnnotation;
  annotations: Map<string, GraphNodeAnnotation>;
  ideas: RankedArenaIdea[];
  users: UserStreamUser[];
  lead: string;
  metric: ArenaMetric | ArenaPeopleMetric;
  topic: string | null;
  onClose: () => void;
  onViewPost: (idea: RankedArenaIdea) => void;
}) {
  const { usersMap } = useBulkUserAvatars(ideas.map((idea) => idea.author));
  const images = useArenaPostImages(ideas);
  const close = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  useArenaStackHeight(popup, node.kind === 'tag', '[data-arena-post]');
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Nested feed popovers own Escape while open.
      if (
        document.querySelector(
          '[data-slot="popover-content"][data-state="open"], [data-slot="dialog-content"][data-state="open"]',
        )
      )
        return;
      if (event.target instanceof Element && !close.current?.closest('[role="dialog"]')?.contains(event.target)) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [onClose]);
  const postMetric = metric === 'active' || metric === 'posts' ? 'popular' : metric;
  const peopleTagHeading =
    node.kind === 'tag' && !loadTagPosts && ideas.length === 0 && users.length > 0
      ? `People tagged '${node.label}'`
      : undefined;
  return (
    <div
      ref={popup}
      className={cn(
        '@container/grid relative font-medium',
        styles.graphPopup,
        node.kind === 'tag' && styles.graphTagPopup,
        node.kind === 'post' && styles.graphPostPopup,
      )}
      style={{ '--arena-topic-color': topic === null ? 'var(--brand)' : generateRandomColor(topic) } as CSSProperties}
      role="dialog"
      aria-label={
        peopleTagHeading ??
        (annotation ? `Rank ${annotation.rank} details` : node.kind === 'tag' ? `Tag ${node.label}` : 'Author details')
      }
    >
      <div
        className={
          node.kind === 'tag'
            ? 'pointer-events-none sticky top-0 z-10 flex items-center justify-between gap-3 pb-3'
            : 'mb-3 flex items-center justify-between gap-3'
        }
      >
        {node.kind === 'post' && (
          <h3 className="text-base font-bold text-foreground">{node.is_reply ? 'Reply' : 'Post'}</h3>
        )}
        {node.kind === 'user' && <h3 className="text-base font-bold text-foreground">Profile</h3>}
        {node.kind === 'tag' && (loadTagPosts || ideas.length > 0) && (
          <h3 className="text-base font-bold text-foreground">
            Top {ARENA_VISIBLE_IDEAS} posts for &apos;{node.label}&apos;
          </h3>
        )}
        {peopleTagHeading && <h3 className="text-base font-bold text-foreground">{peopleTagHeading}</h3>}
        <Button
          ref={close}
          size="icon"
          variant="ghost"
          className="pointer-events-auto ml-auto size-7 focus-visible:ring-0"
          aria-label="Close details"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      {node.kind === 'user' ? (
        <div className={cn('rounded-md bg-card', styles.graphCard, styles.graphProfileCard)}>
          <UserInfoPopoverContent
            userId={node.pubky}
            userName={node.name || formatPublicKey({ key: node.pubky })}
            formattedPublicKey={formatPublicKey({ key: node.pubky })}
            avatarUrl={users[0]?.avatarUrl ?? node.image ?? undefined}
            afterStats={<ArenaGraphProfileDetails key={node.pubky} userId={node.pubky} />}
          />
        </div>
      ) : (
        <div className={node.kind === 'tag' ? 'space-y-3' : undefined}>
          {node.kind === 'tag' && loadTagPosts && (
            <ArenaGraphTagPosts label={node.label} postWindow={postWindow} onViewPost={onViewPost} />
          )}
          {ideas.length > 0 && (
            <ol aria-label={node.kind === 'tag' ? 'Matching posts' : 'Post preview'} className="space-y-3">
              {ideas.map((idea) => (
                <li key={idea.id}>
                  <ArenaPostCard
                    idea={idea}
                    metric={postMetric}
                    user={usersMap.get(idea.author)}
                    image={images.get(idea.id)}
                    topic={topic}
                    lead={lead}
                    presentation="popup"
                    className={node.kind === 'post' ? 'rounded-md border-0 shadow-none' : undefined}
                    onOpen={() => onViewPost(idea)}
                  />
                </li>
              ))}
            </ol>
          )}
          {users.length > 0 && (
            <ol aria-label="Matching people" className="space-y-1.5">
              {users.map((user) => {
                const profileProps = {
                  userId: user.id,
                  userName: user.name || formatPublicKey({ key: user.id }),
                  formattedPublicKey: formatPublicKey({ key: user.id }),
                  avatarUrl: user.avatarUrl ?? undefined,
                };
                return (
                  <li key={user.id} className={cn('flex items-center gap-3 rounded-md bg-card', styles.graphCard)}>
                    <UserInfoPopover
                      {...profileProps}
                      afterStats={<ArenaGraphProfileDetails userId={user.id} />}
                      contentClassName={cn(
                        'font-medium',
                        styles.graphPopup,
                        styles.graphSurface,
                        styles.graphCard,
                        styles.graphProfileCard,
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <UserInfoPopoverHeader
                          {...profileProps}
                          showPublicKey={false}
                          beforePublicKey={
                            <ArenaGraphStats
                              annotation={annotations.get(`user:${user.id}`)!}
                              className="shrink-0 whitespace-nowrap"
                            />
                          }
                        />
                      </div>
                    </UserInfoPopover>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
