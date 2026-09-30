'use client';

// Adapted from SHAcollision/pubky-app Graph Explorer, e148641. See docs/graph-attribution.md.

import {
  forwardRef,
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import dynamic from 'next/dynamic';
import type { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-2d';
import { useResizeObserver } from 'usehooks-ts';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { COLORS } from '@/config/theme';
import { FileController } from '@/controllers/file/file';
import type { GraphPosition } from '@/libs/graph/graph.types';
import {
  adjacencyOf,
  edgeKey,
  isFragmented,
  type SocialGraphVisualEdge,
  type VisualGraphNode,
} from '@/libs/graph/graph.utils';
import { canonicalizeTagLabel, cn, generateRandomColor, hexToRgba } from '@/libs/utils/utils';
import {
  ANNOTATION_LINE_HEIGHT,
  ANNOTATION_TITLE_FONT,
  annotationLayout,
  paintAnnotationStats,
} from './SocialGraph.annotations';
import { fallbackAvatarSprite } from './SocialGraph.avatars';
import { fitGraphCamera, type GraphBounds } from './SocialGraph.camera';
import {
  chipMetrics,
  chipSprite,
  GRAPH_ASSET_READY,
  notifyGraphAssetReady,
  postGlyph,
  postIconSprite,
} from './SocialGraph.sprites';
import {
  AVATAR_RADIUS,
  CENTER_PULL,
  edgeRecencyColor,
  followAlphaFactors,
  GRAPH_EDGE_RGB,
  GRAPH_FALLBACK_COLORS,
  GRAPH_NODE_SURFACE,
  type GraphTheme,
  liftForDarkCanvas,
  POST_ICON_SIZE,
  POST_RADIUS,
  resolveGraphTheme,
  TAG_EDGE_ALPHA,
  tagEdgeLabel,
  TIER_ALPHA,
} from './SocialGraph.theme';
import type { SocialGraphHandle, SocialGraphProps } from './SocialGraph.types';
import { GRAPH_HOVER_SCALE, useGraphHoverMotion } from './useGraphHoverMotion';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-lg bg-white/5" />,
});

type CanvasNode = NodeObject &
  VisualGraphNode & {
    __bornAt?: number;
    __pinned?: boolean;
    fx?: number;
    fy?: number;
  };
type CanvasLink = LinkObject & SocialGraphVisualEdge;

function cachePositions(positions: Map<string, GraphPosition> | undefined, nodes: CanvasNode[]) {
  if (!positions) return;
  for (const node of nodes) {
    if (node.x === undefined || node.y === undefined) continue;
    positions.delete(node.id);
    positions.set(node.id, { x: node.x, y: node.y, fx: node.fx, fy: node.fy, __pinned: node.__pinned });
  }
  while (positions.size > 100) positions.delete(positions.keys().next().value!);
}

const DOUBLE_CLICK_MS = 350;
const DIM_ALPHA = 0.12;
const PULSE_MS = 900;
const HOVER_INTENT_MS = 350;
/** Hover lifts a cluster from its tier alpha to 1.0 over this ease-in. */
const HOVER_LIFT_MS = 150;
const MIN_GRAPH_FONT_SIZE = 12;
const tagRankWidth = (rank?: number) => (rank === undefined ? 0 : rank >= 10 ? 48 : 40);
const tagRankScale = (rank?: number) => (rank === undefined ? 1 : (30 - rank) / 20) * 0.75;

/** Minimum rendered text size after both camera zoom and ranked-chip scaling. */
const readableScale = (fontSize: number, zoom: number, shapeScale = 1) =>
  Math.max(1, MIN_GRAPH_FONT_SIZE / (fontSize * Math.max(zoom, 0.001) * shapeScale));
const edgeChipRadius = (count: number) => Math.max(9, String(count).length * 4 + 4);

// Avatar bitmaps are shared across renders and node instances; the canvas
// wakes on asset load, then rests once physics settles. Failed loads are
// remembered to avoid re-fetch storms.
const avatarCache = new Map<string, HTMLImageElement | 'error'>();
const AVATAR_CACHE_CAP = 200;

function avatarImage(pubky: string, image: string | null): HTMLImageElement | null {
  if (!image) return null;
  const key = `${pubky}:${image}`;
  const cached = avatarCache.get(key);
  if (cached === 'error') return null;
  if (cached) {
    avatarCache.delete(key);
    avatarCache.set(key, cached);
    return cached.complete && cached.naturalWidth > 0 ? cached : null;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = notifyGraphAssetReady;
  img.onerror = () => {
    if (avatarCache.get(key) === img) avatarCache.set(key, 'error');
  };
  img.src = FileController.getAvatarUrl(pubky);
  avatarCache.set(key, img);
  if (avatarCache.size > AVATAR_CACHE_CAP) avatarCache.delete(avatarCache.keys().next().value!);
  return null;
}

const endpointId = (end: string | number | NodeObject | undefined): string =>
  typeof end === 'object' && end !== null ? String(end.id) : String(end ?? '');

/** edgeKey over a materialized link (endpoints may be node objects). */
const linkKeyOf = (link: CanvasLink): string =>
  edgeKey({ source: endpointId(link.source), target: endpointId(link.target), type: link.type, label: link.label });

/** Deterministic tint per community: chart tokens first, generated colors after. */
const COMMUNITY_BASE = ['#4B48E5', '#31E581', '#4FD7E8', '#E24BCB', '#E5484B', '#E8A33D'];
const communityColor = (index: number): string => COMMUNITY_BASE[index] ?? generateRandomColor(`community-${index}`);

/** Hash color for a tag label, lifted so dark hues stay readable on canvas. */
const labelColor = (label: string): string => liftForDarkCanvas(generateRandomColor(label));

/**
 * SocialGraph
 *
 * The force-directed canvas: users as avatar discs ringed by their
 * relationship to the focused user, tags as colored pills, posts as muted
 * squares; birth pulses, spotlight dimming, path particles, and community
 * halos on top. The only module that imports react-force-graph-2d, so the
 * rendering engine stays swappable.
 */
export const SocialGraph = forwardRef<SocialGraphHandle, SocialGraphProps>(function SocialGraph(
  {
    nodes,
    edges,
    annotations,
    emphasizedEdgeType,
    positions,
    focusId,
    selectedId,
    tagRanks,
    relationships,
    opacityTiers,
    sizeTiers,
    ringId,
    spotlight,
    spotlightEdges = null,
    pathIds,
    communities,
    communityLabels,
    edgeChipsOn = false,
    onNodeClick,
    onNodeExpand,
    onBackgroundClick,
    onLinkClick,
    onUserHover,
    className,
  },
  ref,
) {
  // The reused imperative engine mutates simulation objects; retain its explicit memoization.
  'use no memo';
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const { width = 0, height = 0 } = useResizeObserver({
    ref: containerRef as React.RefObject<HTMLDivElement>,
    box: 'border-box',
  });
  const [theme, setTheme] = useState<GraphTheme>(GRAPH_FALLBACK_COLORS);
  const [assetVersion, setAssetVersion] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    const redraw = () => setAssetVersion((version) => version + 1);
    window.addEventListener(GRAPH_ASSET_READY, redraw);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener(GRAPH_ASSET_READY, redraw);
    };
  }, []);
  // Coarse PRIMARY pointers get fatter hit targets and no hover-intent
  // popover (the inspector panel is the touch affordance). Deliberately not
  // useIsTouchDevice: that reports true for mouse-driven touchscreen laptops
  // (maxTouchPoints > 0) and would disable the hover card there.
  const [coarsePointer] = useState(
    () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)')?.matches ?? false),
  );
  // Flips once the dynamically imported engine mounts and the ref is live;
  // effects keyed on it would otherwise fire against an empty ref
  const [engineReady, setEngineReady] = useState(false);
  useEffect(() => {
    const container = containerRef.current;
    if (!engineReady || !container) return;
    let visible = true;
    const update = () => {
      if (visible && !document.hidden) graphRef.current?.resumeAnimation();
      else graphRef.current?.pauseAnimation();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(container);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [engineReady]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverLinkId, setHoverLinkId] = useState<string | null>(null);
  const hoverAmounts = useGraphHoverMotion(hoverId, hoverLinkId, reducedMotion);
  const lastClick = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const didInitialFit = useRef(false);
  const focusPulseAt = useRef(0);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // centerOn sets this so the focus-change effect below does not re-arm the
  // settle-time zoomToFit and undo the directed camera flight (recenter flow)
  const suppressRefit = useRef(false);
  // True while the simulation is cooled down (QA surface via the handle)
  const settledRef = useRef(false);
  const hoverLiftAt = useRef(0);

  useEffect(() => {
    setTheme(resolveGraphTheme());
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (cameraTimer.current) clearTimeout(cameraTimer.current);
    };
  }, []);

  // Re-fit the camera when the view re-centers (full loads), and pulse the
  // new focus; recenter clicks fly the camera themselves and skip the re-fit
  useEffect(() => {
    focusPulseAt.current = Date.now();
    if (suppressRefit.current) {
      suppressRefit.current = false;
      return;
    }
    didInitialFit.current = false;
  }, [focusId]);

  // force-graph mutates link endpoints into node references, so it cannot be
  // handed the pipeline's edge objects directly. The copies are CACHED by
  // edge identity and reused across recomputes: the engine registers every
  // object it has never seen in a finite hit-test color registry (~262k
  // entries, then permanently full), so re-materializing ~1500 links on every
  // legend toggle or time-machine tick exhausts it within minutes and nodes
  // silently stop being clickable. Reuse keeps registrations near zero.
  // Node objects are passed by reference on purpose (the simulation stores
  // coordinates on them, which keeps layout across merges).
  // Not a React ref on purpose (refs must not be read during render); a
  // per-mount Map whose entries accumulate (bounded by distinct edges seen)
  const [linkCache] = useState(() => new Map<string, CanvasLink>());
  const [nodeCache] = useState(() => new Map<string, CanvasNode>());
  const [projectionCache] = useState<{ value: { nodes: CanvasNode[]; links: CanvasLink[] } | null }>(() => ({
    value: null,
  }));
  const graphData = useMemo(() => {
    // Retain positions and drag pins when cached metadata arrives or scores update.
    const currentIds = new Set(nodes.map((node) => node.id));
    for (const id of nodeCache.keys()) if (!currentIds.has(id)) nodeCache.delete(id);
    const materialized = nodes.map((node) => {
      const cached = nodeCache.get(node.id);
      const result = cached ? Object.assign(cached, node) : { ...positions?.get(node.id), ...node };
      nodeCache.set(node.id, result);
      return result;
    });
    // Object-identity set of the current nodes, to validate resolved endpoints
    const nodeSet = new Set<unknown>(materialized);
    const currentEdges = new Set(edges.map(edgeKey));
    for (const key of linkCache.keys()) if (!currentEdges.has(key)) linkCache.delete(key);
    const links = edges.map((edge) => {
      const key = edgeKey(edge);
      const cached = linkCache.get(key);
      if (cached) {
        // NEVER reset resolved endpoints on a cached link: the simulation
        // still holds these objects and mutating them mid-flight corrupts
        // the running layout (d3 then throws "node not found"). Reuse only
        // when both endpoints still belong to the current node set; a link
        // whose node was evicted and re-added gets a fresh copy instead.
        const sourceOk = typeof cached.source === 'object' ? nodeSet.has(cached.source) : cached.source === edge.source;
        const targetOk = typeof cached.target === 'object' ? nodeSet.has(cached.target) : cached.target === edge.target;
        if (sourceOk && targetOk) {
          cached.type = edge.type;
          cached.label = edge.label;
          cached.labels = edge.labels;
          cached.indexed_at = edge.indexed_at;
          return cached;
        }
      }
      const link = { ...edge } as CanvasLink;
      linkCache.set(key, link);
      return link;
    });
    const previous = projectionCache.value;
    if (
      previous &&
      previous.nodes.length === materialized.length &&
      previous.links.length === links.length &&
      materialized.every((node, index) => node === previous.nodes[index]) &&
      links.every((link, index) => link === previous.links[index])
    ) {
      return previous;
    }
    projectionCache.value = { nodes: materialized, links };
    return projectionCache.value;
  }, [nodes, edges, linkCache, nodeCache, projectionCache, positions]);

  useEffect(() => {
    settledRef.current = false;
    // Capture settled positions and pins before a filter/layout/fullscreen remount.
    return () => cachePositions(positions, graphData.nodes);
  }, [graphData, positions]);

  // Force tuning for design-px node sizes (avatars up to r32, chips ~100
  // wide): strong repulsion between user hubs, short leashes for satellites
  // so chips and posts orbit their owner, long rest length between users
  // (the design's ~3:1 user-to-user vs user-to-satellite spacing), and a
  // collision force so chips never stack over avatars.
  // Canvas tracking and live queries often supply new Maps with identical
  // values. Configure forces only when their actual geometry inputs change.
  const forceLayoutKey = JSON.stringify([
    [...(annotations ?? [])].sort(([a], [b]) => a.localeCompare(b)),
    [...sizeTiers].sort(([a], [b]) => a.localeCompare(b)),
    [...(tagRanks ?? [])].sort(([a], [b]) => a.localeCompare(b)),
  ]);
  const configureForces = useEffectEvent(() => {
    const fg = graphRef.current;
    if (!fg) return;
    const chargeOf = (nodeObj: NodeObject) => {
      const node = nodeObj as CanvasNode;
      // Hubs are ~100px chips shared by many posts; they need more room than a
      // post circle, less than a user
      return node.kind === 'user' ? -2000 : node.kind === 'tag' ? -600 : node.kind === 'profile_tag' ? -180 : -220;
    };
    (fg.d3Force('charge') as { strength?: (s: unknown) => void } | undefined)?.strength?.(chargeOf);
    const link = fg.d3Force('link') as
      | {
          distance?: (d: unknown) => void;
          strength?: (s: unknown) => void;
        }
      | undefined;
    link?.distance?.((linkObj: LinkObject) => {
      const l = linkObj as CanvasLink;
      if (l.type === 'HAS_TAG') return 105;
      if (l.type === 'AUTHORED') return 120;
      // A shared hub holds its posts on a short leash, else the star it makes
      // dwarfs the graph and the fit zooms everything to dust
      if (l.type === 'TAGGED') return 180;
      if (l.type === 'REPLIED' || l.type === 'REPOSTED' || l.type === 'MENTIONED') return 130;
      // Focus spokes are the constellation's skeleton; long rest length keeps
      // a dense first ring airy like the design
      const source = endpointId(l.source);
      const target = endpointId(l.target);
      if (focusId && (source === focusId || target === focusId)) return 480;
      return 340;
    });
    // A real neighborhood is a dense mesh; if every follow pulls with equal
    // force the layout collapses into a hairball. Satellites hold tight to
    // their owner, focus spokes shape the constellation, and neighbor-to-
    // neighbor follows barely tug (they render as faint texture anyway).
    link?.strength?.((linkObj: LinkObject) => {
      const l = linkObj as CanvasLink;
      if (l.type === 'HAS_TAG') return 0.9;
      if (l.type === 'AUTHORED' || l.type === 'REPLIED' || l.type === 'REPOSTED') return 0.7;
      if (l.type === 'TAGGED') return 0.55;
      const source = endpointId(l.source);
      const target = endpointId(l.target);
      if (focusId && (source === focusId || target === focusId)) return 0.25;
      return 0.02;
    });
    let cancelled = false;
    (async () => {
      try {
        const { forceCollide, forceX, forceY } = await import('d3-force-3d');
        if (cancelled) return;
        // A stream graph is many unrelated author stars with no edge between
        // them, so charge alone pushes the components apart until the engine
        // cools and the fit zooms out to dust. A weak pull toward the origin
        // holds them in one readable cloud; a neighborhood is a single
        // component and keeps its designed spacing untouched.
        const pull = isFragmented(graphData.nodes, edges) ? CENTER_PULL : 0;
        fg.d3Force('x', forceX(0).strength(annotations ? 0.015 : pull) as never);
        fg.d3Force('y', forceY(0).strength(annotations ? 0.12 : pull) as never);
        fg.d3Force(
          'collide',
          forceCollide((nodeObj: unknown) => {
            const node = nodeObj as CanvasNode;
            if (node.kind === 'tag' || node.kind === 'profile_tag') {
              const rank = node.kind === 'tag' ? tagRanks?.get(canonicalizeTagLabel(node.label)) : undefined;
              const { w, h } = chipMetrics(node.label, node.count, rank !== undefined);
              // Ranked chips can be wider than a post annotation. Include the
              // rank segment and hover growth so adjacent tags never overlap.
              return (Math.hypot(w + tagRankWidth(rank), h) * tagRankScale(rank) * 1.1) / 2 + 8;
            }
            const annotation = annotations?.get(node.id);
            if (annotation) {
              const radius = node.kind === 'user' ? AVATAR_RADIUS[sizeTiers.get(node.id) ?? 'other'] : POST_RADIUS;
              const layout = annotationLayout(annotation, node.kind === 'post', radius);
              return Math.max(85, layout.width / 2 + 12, layout.top + 12, layout.bottom + 12);
            }
            if (node.kind === 'user') return AVATAR_RADIUS[sizeTiers.get(node.id) ?? 'other'] + 8;
            return POST_RADIUS + 6;
          }) as never,
        );
      } catch {
        // Collision is a nicety; the layout still works from charge + distance
      }
    })();
    return () => {
      cancelled = true;
    };
  });
  useEffect(() => configureForces(), [graphData, engineReady, focusId, forceLayoutKey]);

  const hoverNeighbors = useMemo(() => (hoverId ? adjacencyOf(hoverId, edges).add(hoverId) : null), [hoverId, edges]);
  // Advanced dimming mechanism (legend hover / social proof); the hover-lift
  // cluster brightening below is the default-view behavior
  const highlightSet = spotlight ?? (edgeChipsOn ? hoverNeighbors : null);

  const nodeById = useMemo(() => new Map(graphData.nodes.map((n) => [n.id, n])), [graphData]);

  // A hovered or selected tag lends its color to the lines that connect it;
  // hover wins so pointing at a second chip retargets immediately
  const highlightedTag = useMemo(() => {
    for (const id of [hoverId, selectedId]) {
      const node = id ? nodeById.get(id) : undefined;
      if (node && (node.kind === 'tag' || node.kind === 'profile_tag')) return { id: node.id, label: node.label };
    }
    return null;
  }, [hoverId, selectedId, nodeById]);

  /** The user id whose cluster a node belongs to (chips/posts follow their owner). */
  const clusterAnchorOf = useCallback((node: CanvasNode): string => {
    if (node.kind === 'post') return `user:${node.author_id}`;
    if (node.kind === 'profile_tag') return `user:${node.pubky}`;
    return node.id;
  }, []);

  const hoverAnchor = useMemo(() => {
    if (!hoverId) return null;
    const node = nodeById.get(hoverId);
    return node ? clusterAnchorOf(node) : null;
  }, [hoverId, nodeById, clusterAnchorOf]);

  useEffect(() => {
    if (hoverAnchor) hoverLiftAt.current = Date.now();
  }, [hoverAnchor]);

  /**
   * Design opacity model: the whole cluster (avatar + chips + posts + their
   * spokes) paints at its tier alpha (1.0 / 0.6 / 0.4), the hovered cluster
   * eases up to 1.0, and an advanced spotlight overrides everything.
   */
  const nodeAlpha = useCallback(
    (node: CanvasNode): number => {
      if (highlightSet !== null) return highlightSet.has(node.id) ? 1 : annotations?.has(node.id) ? 0.55 : DIM_ALPHA;
      const anchor = clusterAnchorOf(node);
      let alpha = TIER_ALPHA[opacityTiers.get(anchor) ?? 'other'];
      // Explicitly added tag hubs have no owner cluster; keep them readable
      if (node.kind === 'tag') alpha = Math.max(alpha, TIER_ALPHA.direct);
      if (anchor === hoverAnchor) {
        const progress = Math.min(1, (Date.now() - hoverLiftAt.current) / HOVER_LIFT_MS);
        alpha = alpha + (1 - alpha) * progress;
      }
      return alpha;
    },
    [highlightSet, clusterAnchorOf, opacityTiers, hoverAnchor, annotations],
  );

  // Unordered "a|b" pair keys of the traced path, for the lime edge paint
  const pathPairs = useMemo(() => {
    if (!pathIds || pathIds.length < 2) return null;
    const pairs = new Set<string>();
    for (let i = 0; i < pathIds.length - 1; i++) {
      pairs.add([pathIds[i], pathIds[i + 1]].sort().join('|'));
    }
    return pairs;
  }, [pathIds]);

  const isPathLink = useCallback(
    (link: CanvasLink): boolean => {
      if (!pathPairs) return false;
      return pathPairs.has([endpointId(link.source), endpointId(link.target)].sort().join('|'));
    },
    [pathPairs],
  );

  const relationshipColor = useCallback(
    (nodeId: string): string => {
      switch (relationships.get(nodeId)) {
        case 'self':
          return theme.self;
        case 'friend':
          return theme.friend;
        case 'following':
          return theme.following;
        case 'follower':
          return theme.follower;
        default:
          return theme.extended;
      }
    },
    [relationships, theme],
  );

  // Design sizes: avatars 64/48/32px by signed-in-anchored tier, posts 36px
  const nodeRadius = useCallback(
    (node: CanvasNode): number => {
      if (node.kind === 'user') return AVATAR_RADIUS[sizeTiers.get(node.id) ?? 'other'];
      return POST_RADIUS;
    },
    [sizeTiers],
  );

  const nodeDisplayScale = useCallback(
    (node: CanvasNode, zoom: number) => {
      if (node.kind === 'tag' || node.kind === 'profile_tag') {
        const rank = node.kind === 'tag' ? tagRanks?.get(canonicalizeTagLabel(node.label)) : undefined;
        return readableScale(14, zoom, tagRankScale(rank));
      }
      if (annotations?.has(node.id)) return readableScale(MIN_GRAPH_FONT_SIZE, zoom);
      if (node.kind === 'user') return readableScale(Math.max(MIN_GRAPH_FONT_SIZE, nodeRadius(node)), zoom);
      return 1;
    },
    [annotations, tagRanks, nodeRadius],
  );

  // Exactly one node carries the lime focus ring (path mode: the target)
  const ringTarget = ringId !== undefined ? ringId : focusId;

  // Soft community halos, painted under everything else
  const paintCommunities = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!communities) return;
      for (const node of graphData.nodes) {
        const community = communities.get(node.id);
        if (community === undefined || node.x === undefined || node.y === undefined) continue;
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeRadius(node) + 7, 0, 2 * Math.PI);
        ctx.fillStyle = hexToRgba(communityColor(community), 0.13);
        ctx.fill();
      }
    },
    [communities, graphData, nodeRadius],
  );

  // Community captions at each community centroid, over the graph
  const paintCaptions = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (!communities || communityLabels.size === 0) return;
      const sums = new Map<number, { x: number; y: number; n: number }>();
      for (const node of graphData.nodes) {
        const community = communities.get(node.id);
        if (community === undefined || !communityLabels.has(community)) continue;
        if (node.x === undefined || node.y === undefined) continue;
        const sum = sums.get(community) ?? { x: 0, y: 0, n: 0 };
        sum.x += node.x;
        sum.y += node.y;
        sum.n += 1;
        sums.set(community, sum);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [community, sum] of sums) {
        const label = communityLabels.get(community)!;
        ctx.font = `600 ${Math.max(5, 13 / globalScale)}px "Inter Tight", sans-serif`;
        ctx.fillStyle = hexToRgba(communityColor(community), 0.75);
        ctx.fillText(`#${label}`, sum.x / sum.n, sum.y / sum.n);
      }
    },
    [communities, communityLabels, graphData],
  );

  const paintNode = useCallback(
    (nodeObj: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = nodeObj as CanvasNode;
      void assetVersion;
      // Metadata changes repaint cached node objects without reheating the layout.
      void nodes;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const alpha = nodeAlpha(node);
      ctx.save();
      ctx.globalAlpha = alpha;
      const displayScale = nodeDisplayScale(node, globalScale);
      ctx.translate(x, y);
      const selectedPost = node.kind === 'post' && node.id === selectedId;
      const hoverAmount = selectedPost ? 0 : (hoverAmounts.get(node.id) ?? 0);
      const hoverScale = 1 + (GRAPH_HOVER_SCALE - 1) * hoverAmount;
      ctx.scale(displayScale * hoverScale, displayScale * hoverScale);
      ctx.translate(-x, -y);

      // Birth / focus pulse: an expanding, fading ring
      const pulseStart = reducedMotion
        ? null
        : node.__bornAt && Date.now() - node.__bornAt < PULSE_MS
          ? node.__bornAt
          : node.id === focusId && Date.now() - focusPulseAt.current < PULSE_MS
            ? focusPulseAt.current
            : null;

      if (node.kind === 'user') {
        const r = nodeRadius(node);

        if (pulseStart) {
          const t = (Date.now() - pulseStart) / PULSE_MS;
          ctx.beginPath();
          ctx.arc(x, y, r + t * 24, 0, 2 * Math.PI);
          ctx.strokeStyle = hexToRgba(theme.halo, 0.5 * (1 - t));
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Uploaded avatar when loaded, otherwise the app's generated fallback face.
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fillStyle = GRAPH_NODE_SURFACE;
        ctx.fill();

        const img = avatarImage(node.pubky, node.image) ?? fallbackAvatarSprite(node.pubky, node.name);
        if (img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 2 * Math.PI);
          ctx.clip();
          ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `600 ${Math.max(MIN_GRAPH_FONT_SIZE, r)}px "Inter Tight", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText((node.name || node.pubky).charAt(0).toUpperCase(), x, y + 1);
        }

        // The design's single lime focus ring: 2px, flush inside the edge
        if (node.id === ringTarget) {
          ctx.beginPath();
          ctx.arc(x, y, r - 1, 0, 2 * Math.PI);
          ctx.strokeStyle = theme.halo;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else if (node.kind === 'profile_tag' || node.kind === 'tag') {
        // Tag chips: the app's PostTag recipe, pre-rasterized
        const count = node.count;
        const rank = node.kind === 'tag' ? tagRanks?.get(canonicalizeTagLabel(node.label)) : undefined;
        const { w, h } = chipMetrics(node.label, count, rank !== undefined);
        const rankWidth = tagRankWidth(rank);
        const left = x - (w + rankWidth) / 2;
        const accent = generateRandomColor(node.label);
        ctx.save();
        ctx.translate(x, y);
        const scale = tagRankScale(rank);
        ctx.scale(scale, scale);
        ctx.translate(-x, -y);
        if (pulseStart) {
          const t = (Date.now() - pulseStart) / PULSE_MS;
          ctx.globalAlpha = Math.min(1, t * 2) * alpha;
        }
        if (rank !== undefined) {
          ctx.beginPath();
          ctx.roundRect(left, y - h / 2, rankWidth, h, [6, 0, 0, 6]);
          ctx.fillStyle = hexToRgba(COLORS.background, 0.9);
          ctx.fill();
          ctx.fillStyle = hexToRgba(accent, 0.16);
          ctx.fill();
          // Keep the 1px border inside the same bounds as the tag sprite.
          ctx.beginPath();
          ctx.roundRect(left + 0.5, y - h / 2 + 0.5, rankWidth - 1, h - 1, [5.5, 0, 0, 5.5]);
          ctx.strokeStyle = hexToRgba(accent, 0.3);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = accent;
          ctx.font = '700 14px "Inter Tight", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`#${rank}`, left + rankWidth / 2, y + 0.5);
        }
        const sprite = chipSprite(node.label, count, accent, rank !== undefined);
        if (sprite) {
          ctx.drawImage(sprite.canvas, left + rankWidth, y - h / 2, w, h);
        } else {
          // Fonts still loading: paint the pill without text for this frame
          ctx.beginPath();
          ctx.roundRect(left + rankWidth, y - h / 2, w, h, rank === undefined ? 6 : [0, 6, 6, 0]);
          ctx.fillStyle = GRAPH_NODE_SURFACE;
          ctx.fill();
        }
        if (node.id === hoverId) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(left, y - h / 2, w + rankWidth, h, 6);
          ctx.clip();
          ctx.shadowColor = accent;
          ctx.shadowBlur = 8;
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }
        if (node.kind === 'tag' && node.id === selectedId) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(left, y - h / 2, w + rankWidth, h, 6);
          ctx.shadowColor = hexToRgba(accent, 0.32);
          ctx.shadowBlur = 32;
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.beginPath();
          ctx.roundRect(left + rankWidth, y - h / 2, w, h, rank === undefined ? 6 : [0, 6, 6, 0]);
          ctx.clip();
          ctx.shadowColor = accent;
          ctx.shadowBlur = 8;
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();

          if (rankWidth > 0) {
            ctx.beginPath();
            ctx.moveTo(left + rankWidth, y - h / 2);
            ctx.lineTo(left + rankWidth, y + h / 2);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
        ctx.restore();
      } else {
        // Post: fixed 36px circle with a smaller glyph and eased hover fill.
        const r = POST_RADIUS;
        if (pulseStart) {
          const t = (Date.now() - pulseStart) / PULSE_MS;
          ctx.globalAlpha = Math.min(1, t * 2) * alpha;
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fillStyle = GRAPH_NODE_SURFACE;
        ctx.fill();
        const fillHoverAmount = selectedPost ? 0 : reducedMotion ? Number(node.id === hoverId) : hoverAmount;
        if (fillHoverAmount > 0) {
          ctx.fillStyle = `rgba(255,255,255,${0.12 * fillHoverAmount})`;
          ctx.fill();
        }
        const icon = postIconSprite(postGlyph(node));
        if (icon) {
          const s = POST_ICON_SIZE;
          ctx.drawImage(icon, x - s / 2, y - s / 2, s, s);
        }
        if (node.id === selectedId) {
          ctx.beginPath();
          ctx.arc(x, y, r - 1, 0, 2 * Math.PI);
          ctx.strokeStyle = theme.halo;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      const annotation = annotations?.get(node.id);
      // Tag pills already display their rank, name, and count.
      if (annotation && node.kind !== 'tag' && node.kind !== 'profile_tag') {
        const layout = annotationLayout(annotation, node.kind === 'post', nodeRadius(node));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = ANNOTATION_TITLE_FONT;
        ctx.fillStyle = '#FFFFFF';
        layout.titleLines.forEach((line, index) => {
          ctx.fillText(line, x, y + layout.titleY + index * ANNOTATION_LINE_HEIGHT);
        });
        paintAnnotationStats(ctx, annotation, x, y + layout.statsY, theme.self, theme.extended);
      }
      ctx.restore();
    },
    [
      nodeAlpha,
      selectedId,
      hoverId,
      hoverAmounts,
      focusId,
      ringTarget,
      nodeRadius,
      nodeDisplayScale,
      theme,
      annotations,
      tagRanks,
      reducedMotion,
      assetVersion,
      nodes,
    ],
  );

  const paintPointerArea = useCallback(
    (nodeObj: NodeObject, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = nodeObj as CanvasNode;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const displayScale = nodeDisplayScale(node, globalScale);
      ctx.save();
      ctx.translate(x, y);
      // Include the full hover size so the painted edge remains clickable.
      ctx.scale(displayScale * GRAPH_HOVER_SCALE, displayScale * GRAPH_HOVER_SCALE);
      ctx.translate(-x, -y);
      if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true' && typeof window !== 'undefined') {
        // QA instrumentation: proves the shadow canvas actually paints every
        // node kind (hit-testing regressions historically hid here)
        const w = window as unknown as { __paintStats?: Record<string, number> };
        const stats = (w.__paintStats = w.__paintStats ?? {});
        stats[node.kind] = (stats[node.kind] ?? 0) + 1;
        stats.transform = (ctx.getTransform().a * 1000) | 0;
      }
      ctx.fillStyle = color;
      const pad = coarsePointer ? 6 : 4;
      // Pointer areas paint in graph units and shrink with the camera; keep a
      // minimum on-screen grab radius so drags land at overview zoom too
      // (capped so far-out zoom does not blanket neighbors)
      const minRadius = Math.min(20, (coarsePointer ? 14 : 11) / globalScale);
      if (node.kind === 'tag' || node.kind === 'profile_tag') {
        // Same geometry as the painted chip, so long labels stay clickable
        const rank = node.kind === 'tag' ? tagRanks?.get(canonicalizeTagLabel(node.label)) : undefined;
        const metrics = chipMetrics(node.label, node.count, rank !== undefined);
        const w = Math.max((metrics.w + tagRankWidth(rank)) * tagRankScale(rank) + pad * 2, minRadius * 2);
        const h = Math.max(metrics.h * tagRankScale(rank) + pad * 2, minRadius * 2);
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
        ctx.restore();
        return;
      }
      const r = Math.max(nodeRadius(node) + pad, minRadius);
      const annotation = annotations?.get(node.id);
      if (annotation) {
        const layout = annotationLayout(annotation, node.kind === 'post', nodeRadius(node));
        const titleWidth = layout.titleWidth + pad * 2;
        ctx.fillRect(
          x - titleWidth / 2,
          y + layout.titleY - ANNOTATION_LINE_HEIGHT / 2 - pad,
          titleWidth,
          layout.titleLines.length * ANNOTATION_LINE_HEIGHT + pad * 2,
        );
        const statsWidth = layout.statsWidth + pad * 2;
        ctx.fillRect(
          x - statsWidth / 2,
          y + layout.statsY - ANNOTATION_LINE_HEIGHT / 2 - pad,
          statsWidth,
          ANNOTATION_LINE_HEIGHT + pad * 2,
        );
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    },
    [nodeRadius, nodeDisplayScale, coarsePointer, annotations, tagRanks],
  );

  // Follow-edge alpha multipliers by density: spokes off the focus vs the mesh
  const followAlpha = useMemo(() => followAlphaFactors(edges, focusId), [edges, focusId]);

  // Timestamp range of follow edges, for the recency ramp normalization
  const followTimeRange = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const edge of edges) {
      if ((edge.type === 'FOLLOWS' || edge.type === 'FRIEND') && edge.indexed_at !== undefined) {
        min = Math.min(min, edge.indexed_at);
        max = Math.max(max, edge.indexed_at);
      }
    }
    return min < max ? { min, max } : null;
  }, [edges]);

  /** Resolve a link endpoint to its node object (engine may hold ids or objects). */
  const endpointNode = useCallback(
    (end: string | number | NodeObject | undefined): CanvasNode | null => {
      if (typeof end === 'object' && end !== null) return end as CanvasNode;
      return nodeById.get(String(end ?? '')) ?? null;
    },
    [nodeById],
  );

  // Tag connections use their chip's color at 32%, rising to 64% on hover; other edges are neutral
  // hairlines at their dimmer endpoint's alpha. Traced-path edges paint lime. The advanced
  // edge-details lens restores the old encodings (ego relationship colors,
  // community tints, recency ramp, tag hues).
  const linkColor = useCallback(
    (linkObj: LinkObject): string => {
      const link = linkObj as CanvasLink;
      if (isPathLink(link)) return hexToRgba(theme.halo, 0.95);
      const source = endpointId(link.source);
      const target = endpointId(link.target);
      // An explicit edge spotlight dims by edge identity; otherwise links dim
      // when either endpoint is outside the node spotlight
      const dimmed = spotlightEdges
        ? !spotlightEdges.has(linkKeyOf(link))
        : highlightSet !== null && !(highlightSet.has(source) && highlightSet.has(target));
      if (link.type === 'TAGGED' || link.type === 'HAS_TAG') {
        const a = endpointNode(link.source);
        const b = endpointNode(link.target);
        const tag = a?.kind === 'tag' || a?.kind === 'profile_tag' ? a : b;
        if (tag?.kind === 'tag' || tag?.kind === 'profile_tag') {
          return hexToRgba(generateRandomColor(tag.label), tag.id === hoverId ? 0.64 : dimmed ? 0.04 : 0.32);
        }
      }
      if (link.type === emphasizedEdgeType && !dimmed) return hexToRgba(theme.halo, 0.65);

      if (!edgeChipsOn) {
        if (dimmed) return `rgba(${GRAPH_EDGE_RGB}, 0.04)`;
        const a = endpointNode(link.source);
        const b = endpointNode(link.target);
        let alpha = Math.min(a ? nodeAlpha(a) : TIER_ALPHA.other, b ? nodeAlpha(b) : TIER_ALPHA.other);
        // Real neighborhoods are dense meshes (hundreds of neighbor-to-
        // neighbor follows); the design reads as hub-and-spoke, so edges not
        // touching the focus recede to a faint texture instead of stacking
        // into a bright web, and spokes dim more gently with the focus degree
        if (link.type === 'FOLLOWS' || link.type === 'FRIEND') {
          alpha *= source === focusId || target === focusId ? followAlpha.spoke : followAlpha.mesh;
        }
        const tagLabel = tagEdgeLabel(highlightedTag, link);
        if (tagLabel) return hexToRgba(labelColor(tagLabel), Math.max(alpha, TAG_EDGE_ALPHA));
        return `rgba(${GRAPH_EDGE_RGB}, ${Number(alpha.toFixed(3))})`;
      }

      const alpha = dimmed ? 0.04 : 0.5;
      switch (link.type) {
        case 'FRIEND':
        case 'FOLLOWS': {
          if (source === focusId || target === focusId) {
            if (link.type === 'FRIEND') return hexToRgba(theme.friend, dimmed ? 0.04 : 0.65);
            // Arrow points at the followed side; color by the far endpoint
            const far = source === focusId ? target : source;
            return hexToRgba(relationshipColor(far), alpha);
          }
          if (communities) {
            const a = communities.get(source);
            const b = communities.get(target);
            if (a !== undefined && b !== undefined) {
              if (a === b) return hexToRgba(communityColor(a), dimmed ? 0.04 : 0.45);
              // Bridges between communities are the structurally interesting
              // edges; they stay bright and neutral
              return dimmed ? 'rgba(245, 245, 255, 0.04)' : 'rgba(245, 245, 255, 0.6)';
            }
          }
          const t = followTimeRange
            ? link.indexed_at !== undefined
              ? (link.indexed_at - followTimeRange.min) / (followTimeRange.max - followTimeRange.min)
              : 0
            : 0.35;
          return edgeRecencyColor(t * t, dimmed);
        }
        case 'TAGGED':
          return hexToRgba(labelColor(link.label ?? ''), alpha);
        case 'HAS_TAG':
          return `rgba(${GRAPH_EDGE_RGB}, ${dimmed ? 0.04 : 0.5})`;
        default:
          return hexToRgba(theme.edgeMuted, dimmed ? 0.04 : 0.8);
      }
    },
    [
      highlightSet,
      spotlightEdges,
      isPathLink,
      edgeChipsOn,
      endpointNode,
      nodeAlpha,
      focusId,
      relationshipColor,
      theme,
      communities,
      followTimeRange,
      followAlpha,
      highlightedTag,
      hoverId,
      emphasizedEdgeType,
    ],
  );

  // Count chips on aggregated tag edges, drawn over the link line (advanced
  // edge-details lens only; the design's default edges carry no chrome)
  const paintLink = useCallback(
    (linkObj: LinkObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (!edgeChipsOn) return;
      const link = linkObj as CanvasLink;
      if (!link.labels || link.labels.length < 2) return;
      const source = link.source as NodeObject;
      const target = link.target as NodeObject;
      if (typeof source !== 'object' || typeof target !== 'object') return;
      if (source.x === undefined || target.x === undefined) return;
      const dimmed = spotlightEdges
        ? !spotlightEdges.has(linkKeyOf(link))
        : highlightSet !== null && !(highlightSet.has(String(source.id)) && highlightSet.has(String(target.id)));
      const x = (source.x + (target.x ?? 0)) / 2;
      const y = ((source.y ?? 0) + (target.y ?? 0)) / 2;
      // Chips on short edges inside dense clusters would stack over the nodes
      const dist = Math.hypot((target.x ?? 0) - source.x, (target.y ?? 0) - (source.y ?? 0));
      if (dist < 26 && globalScale < 2.2) return;
      const color = labelColor(link.label ?? '');
      const text = String(link.labels.length);
      const fontSize = MIN_GRAPH_FONT_SIZE;
      ctx.save();
      const hoverScale = 1 + (GRAPH_HOVER_SCALE - 1) * (hoverAmounts.get(`edge:${linkKeyOf(link)}`) ?? 0);
      ctx.translate(x, y);
      const displayScale = readableScale(fontSize, globalScale) * hoverScale;
      ctx.scale(displayScale, displayScale);
      ctx.translate(-x, -y);
      ctx.globalAlpha = dimmed ? DIM_ALPHA : 0.9;
      ctx.font = `700 ${fontSize}px "Inter Tight", sans-serif`;
      const r = edgeChipRadius(link.labels.length);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = '#101014';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 0.3);
      ctx.restore();
    },
    [edgeChipsOn, highlightSet, spotlightEdges, hoverAmounts],
  );

  // The visible edges are hairlines; the interactive surface is painted much
  // fatter, and the count chip gets a generous disc so it works as the button
  // it looks like (twice the size on touch screens). Advanced lens only:
  // default-view edges are non-interactive per the design.
  const linkPointerAreaPaint = useCallback(
    (linkObj: LinkObject, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (!edgeChipsOn) return;
      const link = linkObj as CanvasLink;
      const source = link.source as NodeObject;
      const target = link.target as NodeObject;
      if (typeof source !== 'object' || typeof target !== 'object') return;
      if (source.x === undefined || target.x === undefined) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.min(10, Math.max(coarsePointer ? 9 : 5, (coarsePointer ? 16 : 10) / globalScale));
      ctx.beginPath();
      ctx.moveTo(source.x, source.y ?? 0);
      ctx.lineTo(target.x, target.y ?? 0);
      ctx.stroke();
      if ((link.labels?.length ?? 0) > 1) {
        const x = (source.x + (target.x ?? 0)) / 2;
        const y = ((source.y ?? 0) + (target.y ?? 0)) / 2;
        ctx.beginPath();
        ctx.arc(
          x,
          y,
          edgeChipRadius(link.labels!.length) * readableScale(MIN_GRAPH_FONT_SIZE, globalScale) * GRAPH_HOVER_SCALE +
            (coarsePointer ? 6 : 4),
          0,
          2 * Math.PI,
        );
        ctx.fillStyle = color;
        ctx.fill();
      }
    },
    [edgeChipsOn, coarsePointer],
  );

  // Actionable edges advertise themselves with a pointer cursor
  const handleLinkHover = useCallback(
    (linkObj: LinkObject | null) => {
      const link = linkObj as CanvasLink | null;
      hoveredLinkRef.current = link !== null;
      setHoverLinkId(edgeChipsOn && link ? `edge:${linkKeyOf(link)}` : null);
      const canvas = containerRef.current?.querySelector('canvas');
      if (canvas) canvas.style.cursor = edgeChipsOn && link && link.type === 'TAGGED' ? 'pointer' : '';
    },
    [edgeChipsOn],
  );

  const screenPositionOf = useCallback((node: CanvasNode): { x: number; y: number } | null => {
    const fg = graphRef.current;
    if (!fg || node.x === undefined || node.y === undefined) return null;
    const pos = fg.graph2ScreenCoords(node.x, node.y);
    return { x: pos.x, y: pos.y };
  }, []);

  const handleNodeHover = useCallback(
    (nodeObj: NodeObject | null) => {
      const node = nodeObj as CanvasNode | null;
      hoveredNodeRef.current = node !== null;
      hoveredIdRef.current = node ? String(node.id) : null;
      setHoverId(node ? String(node.id) : null);
      if (!onUserHover || coarsePointer) return;
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (node && node.kind === 'user') {
        hoverTimer.current = setTimeout(() => {
          onUserHover(node, screenPositionOf(node));
        }, HOVER_INTENT_MS);
      } else {
        onUserHover(null, null);
      }
    },
    [onUserHover, coarsePointer, screenPositionOf],
  );

  // Stable accessors: force-graph re-materializes per-link state whenever an
  // accessor prop changes identity, so inline lambdas would reset it on every
  // hover-driven re-render. Design defaults: uniform 1px hairlines, straight,
  // no arrowheads; the advanced edge-details lens restores the old chrome.
  const linkWidth = useCallback(
    (link: LinkObject) => {
      const l = link as CanvasLink;
      if (isPathLink(l)) return 1.5;
      if (edgeChipsOn && l.type === 'FRIEND') return 1.8;
      // A colored hairline needs a touch more body to read as the tag's line
      if (tagEdgeLabel(highlightedTag, l)) return 1.5;
      return 1;
    },
    [isPathLink, edgeChipsOn, highlightedTag],
  );
  const linkCurvature = useCallback(
    (link: LinkObject) => (edgeChipsOn && (link as CanvasLink).type === 'TAGGED' ? 0.18 : 0),
    [edgeChipsOn],
  );
  const linkModeAfter = useCallback(() => 'after' as const, []);
  const arrowLength = useCallback(
    (link: LinkObject) => {
      const l = link as CanvasLink;
      if (annotations && (l.type === 'REPLIED' || l.type === 'REPOSTED')) return 6;
      if (!edgeChipsOn) return 0;
      if (l.type === 'FRIEND') return 0;
      // Aggregated tag edges have a canonicalized direction: no arrow
      if (l.type === 'TAGGED' && (l.labels?.length ?? 0) > 1) return 0;
      // Hub edges out of a tag pill read better without arrowheads
      if (l.type === 'TAGGED' && endpointId(l.source).startsWith('tag:')) return 0;
      return 6;
    },
    [edgeChipsOn, annotations],
  );

  const handleNodeClick = useCallback(
    (nodeObj: NodeObject) => {
      const id = String(nodeObj.id);
      const now = Date.now();
      if (lastClick.current.id === id && now - lastClick.current.at < DOUBLE_CLICK_MS) {
        lastClick.current = { id: '', at: 0 };
        onNodeExpand(id);
        return;
      }
      lastClick.current = { id, at: now };
      onNodeClick(id);
    },
    [onNodeClick, onNodeExpand],
  );

  // The engine's own hit canvas refreshes on an 800ms throttle, so during
  // simulation ticks and camera motion it lags what the eye sees; re-setting
  // the pointer painter forces the library to flush it (cheap at our scale)
  const flushHitCanvas = useCallback(() => {
    const fg = graphRef.current as unknown as { nodePointerAreaPaint?: (fn: unknown) => unknown } | undefined;
    fg?.nodePointerAreaPaint?.(paintPointerArea);
  }, [paintPointerArea]);

  // Background clicks are detected here instead of the engine: registering
  // onBackgroundClick with the library arms a zero-tolerance gesture guard
  // that suppresses EVERY click (nodes and chips included) after 1px of
  // mouse jitter between press and release
  const hoveredNodeRef = useRef(false);
  const hoveredLinkRef = useRef(false);
  const hoveredIdRef = useRef<string | null>(null);
  const pressPosRef = useRef<{ x: number; y: number } | null>(null);

  // Single background click deselects (forwarded to the page); a quick second
  // click zooms toward the clicked region, mirroring node double-click
  const lastBackgroundClick = useRef(0);
  const handleBackgroundClick = useCallback(
    (event: MouseEvent) => {
      const now = Date.now();
      if (now - lastBackgroundClick.current < DOUBLE_CLICK_MS) {
        lastBackgroundClick.current = 0;
        const fg = graphRef.current;
        if (fg) {
          const point = fg.screen2GraphCoords(event.offsetX, event.offsetY);
          // A directed zoom consumes any pending auto-fit
          didInitialFit.current = true;
          fg.centerAt(point.x, point.y, 350);
          fg.zoom(fg.zoom() * 1.7, 350);
        }
        return;
      }
      lastBackgroundClick.current = now;
      onBackgroundClick();
    },
    [onBackgroundClick],
  );

  const handleLinkClick = useCallback(
    (linkObj: LinkObject, event: MouseEvent) => {
      const link = linkObj as CanvasLink;
      onLinkClick?.(
        {
          source: endpointId(link.source),
          target: endpointId(link.target),
          type: link.type,
          label: link.label,
          labels: link.labels,
          indexed_at: link.indexed_at,
        },
        { x: event.offsetX, y: event.offsetY },
      );
    },
    [onLinkClick],
  );

  const markEngineReady = useCallback(() => {
    setEngineReady((ready) => (ready ? ready : true));
  }, []);

  const handleEngineTick = useCallback(() => {
    settledRef.current = false;
    markEngineReady();
    flushHitCanvas();
  }, [markEngineReady, flushHitCanvas]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onPointerDown = (event: PointerEvent) => {
      pressPosRef.current = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      const press = pressPosRef.current;
      pressPosRef.current = null;
      if (!press || event.button !== 0) return;
      // Same gesture tolerance the engine grants node clicks
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) return;
      if (hoveredNodeRef.current || hoveredLinkRef.current) return;
      lastClick.current = { id: '', at: 0 };
      const bounds = container.getBoundingClientRect();
      handleBackgroundClick({
        offsetX: event.clientX - bounds.left,
        offsetY: event.clientY - bounds.top,
      } as MouseEvent);
    };
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerup', onPointerUp);
    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointerup', onPointerUp);
    };
  }, [handleBackgroundClick]);

  function fitPaintedGraph() {
    const fg = graphRef.current;
    if (!fg) return;
    const camera = fitGraphCamera(width, height, (zoom) => {
      let bounds: GraphBounds | null = null;
      for (const node of graphData.nodes) {
        if (node.x === undefined || node.y === undefined) continue;
        let halfWidth = nodeRadius(node);
        let top = halfWidth;
        let bottom = halfWidth;
        if (node.kind === 'tag' || node.kind === 'profile_tag') {
          const rank = node.kind === 'tag' ? tagRanks?.get(canonicalizeTagLabel(node.label)) : undefined;
          const chip = chipMetrics(node.label, node.count, rank !== undefined);
          halfWidth = ((chip.w + tagRankWidth(rank)) * tagRankScale(rank)) / 2;
          top = bottom = (chip.h * tagRankScale(rank)) / 2;
        } else {
          const annotation = annotations?.get(node.id);
          if (annotation) {
            const layout = annotationLayout(annotation, node.kind === 'post', nodeRadius(node));
            halfWidth = Math.max(halfWidth, layout.width / 2);
            top = layout.top;
            bottom = layout.bottom;
          }
        }
        const scale = nodeDisplayScale(node, zoom) * GRAPH_HOVER_SCALE;
        const rect = {
          left: node.x - halfWidth * scale,
          right: node.x + halfWidth * scale,
          top: node.y - top * scale,
          bottom: node.y + bottom * scale,
        };
        bounds = bounds
          ? {
              left: Math.min(bounds.left, rect.left),
              right: Math.max(bounds.right, rect.right),
              top: Math.min(bounds.top, rect.top),
              bottom: Math.max(bounds.bottom, rect.bottom),
            }
          : rect;
      }
      return bounds;
    });
    if (!camera) return;
    const duration = reducedMotion ? 0 : 400;
    fg.centerAt(camera.x, camera.y, duration);
    fg.zoom(camera.zoom, duration);
  }

  const refitViewport = useEffectEvent(fitPaintedGraph);
  useEffect(() => {
    if (settledRef.current) refitViewport();
  }, [width, height]);

  useImperativeHandle(ref, (): SocialGraphHandle => ({
    zoomIn: () => graphRef.current?.zoom((graphRef.current?.zoom() ?? 1) * 1.4, reducedMotion ? 0 : 300),
    zoomOut: () => graphRef.current?.zoom((graphRef.current?.zoom() ?? 1) / 1.4, reducedMotion ? 0 : 300),
    fit: fitPaintedGraph,
    screenPositionOf: (nodeId: string) => {
      const node = graphData.nodes.find((n) => n.id === nodeId);
      const fg = graphRef.current;
      if (!node || !fg || node.x === undefined || node.y === undefined) return null;
      return fg.graph2ScreenCoords(node.x, node.y);
    },
    screenMidpointOf: (aId: string, bId: string) => {
      const a = graphData.nodes.find((n) => n.id === aId);
      const b = graphData.nodes.find((n) => n.id === bId);
      const fg = graphRef.current;
      if (!a || !b || !fg || a.x === undefined || b.x === undefined) return null;
      return fg.graph2ScreenCoords((a.x + b.x) / 2, ((a.y ?? 0) + (b.y ?? 0)) / 2);
    },
    centerOn: (nodeId: string) => {
      const node = graphData.nodes.find((n) => n.id === nodeId);
      const fg = graphRef.current;
      if (!node || !fg || node.x === undefined || node.y === undefined) return;
      // A directed fly consumes any pending auto-fit, which would otherwise
      // zoom back out when the simulation settles; the flag also stops the
      // focus-change effect from re-arming that fit (recenter clicks)
      didInitialFit.current = true;
      suppressRefit.current = true;
      // Two phases: ease out a little, then glide onto the target
      const current = fg.zoom();
      fg.zoom(Math.max(0.55, current * 0.85), 180);
      fg.centerAt(node.x, node.y, 450);
      if (cameraTimer.current) clearTimeout(cameraTimer.current);
      cameraTimer.current = setTimeout(() => fg.zoom(Math.max(current, 0.9), 320), 460);
    },
    setPaused: (paused: boolean) => {
      for (const node of graphData.nodes) {
        if (paused) {
          node.fx = node.x;
          node.fy = node.y;
        } else if (!node.__pinned) {
          node.fx = undefined;
          node.fy = undefined;
        }
      }
      if (!paused) graphRef.current?.d3ReheatSimulation();
    },
    releasePins: () => {
      for (const node of graphData.nodes) {
        if (node.__pinned) {
          node.__pinned = false;
          node.fx = undefined;
          node.fy = undefined;
        }
      }
      graphRef.current?.d3ReheatSimulation();
    },
    nodeIds: () => {
      const groups: Record<'user' | 'post' | 'tag' | 'profile_tag', string[]> = {
        user: [],
        post: [],
        tag: [],
        profile_tag: [],
      };
      for (const node of graphData.nodes) groups[node.kind].push(node.id);
      return groups;
    },
    pinnedIds: () => graphData.nodes.filter((n) => n.__pinned).map((n) => n.id),
    isSettled: () => settledRef.current,
    zoomLevel: () => graphRef.current?.zoom() ?? null,
    hoveredId: () => hoveredIdRef.current,
  }));

  return (
    <div ref={containerRef} className={cn('h-full w-full', className)} data-cy="social-graph">
      {width > 0 && height > 0 && (
        <ForceGraph2D
          ref={graphRef}
          width={width}
          height={height}
          graphData={graphData}
          backgroundColor="rgba(0,0,0,0)"
          autoPauseRedraw
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintPointerArea}
          nodeLabel={() => ''}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkCurvature={linkCurvature}
          linkCanvasObjectMode={linkModeAfter}
          linkCanvasObject={paintLink}
          linkPointerAreaPaint={linkPointerAreaPaint}
          linkDirectionalArrowLength={arrowLength}
          linkDirectionalArrowRelPos={0.92}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onLinkClick={handleLinkClick}
          onLinkHover={handleLinkHover}
          onNodeDragEnd={(nodeObj) => {
            const node = nodeObj as CanvasNode;
            node.fx = node.x;
            node.fy = node.y;
            node.__pinned = true;
            cachePositions(positions, graphData.nodes);
            flushHitCanvas();
          }}
          onZoom={flushHitCanvas}
          onEngineTick={handleEngineTick}
          onRenderFramePre={(ctx) => paintCommunities(ctx)}
          onRenderFramePost={(ctx, globalScale) => paintCaptions(ctx, globalScale)}
          onEngineStop={() => {
            markEngineReady();
            cachePositions(positions, graphData.nodes);
            settledRef.current = true;
            if (!didInitialFit.current) {
              didInitialFit.current = true;
              fitPaintedGraph();
            }
          }}
          warmupTicks={reducedMotion ? 120 : 0}
          cooldownTicks={reducedMotion ? 0 : 120}
        />
      )}
    </div>
  );
});
