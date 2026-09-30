// Adapted from SHAcollision/pubky-app Graph Explorer, e148641. See docs/graph-attribution.md.
import type { ArenaStatKind } from '@/libs/arena/stats';
import type { GraphPosition, NexusGraphNode } from '@/libs/graph/graph.types';
import type { GraphRelationship, GraphTier, SocialGraphVisualEdge, VisualGraphNode } from '@/libs/graph/graph.utils';

export type GraphStatKind = ArenaStatKind | 'time' | 'active';

export interface GraphNodeAnnotation {
  rank: number;
  title: string;
  metric: string;
  stats?: { kind: GraphStatKind; value: string }[];
}

/** Imperative camera and physics controls exposed to the page overlays. */
export interface SocialGraphHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  /** Screen position of a node inside the canvas container, null when unknown */
  screenPositionOf: (nodeId: string) => { x: number; y: number } | null;
  /** Screen position of the midpoint between two nodes (edge chips) */
  screenMidpointOf: (aId: string, bId: string) => { x: number; y: number } | null;
  /** Fly the camera to a node id in two phases (no-op when unknown). */
  centerOn: (nodeId: string) => void;
  /** Freeze/unfreeze the simulation without stopping rendering. */
  setPaused: (paused: boolean) => void;
  /** Release every drag-pinned node back to the simulation. */
  releasePins: () => void;
  /** Visible node ids grouped by kind (QA / debug surface). */
  nodeIds: () => Record<'user' | 'post' | 'tag' | 'profile_tag', string[]>;
  /** Ids of drag-pinned nodes (QA / debug surface). */
  pinnedIds: () => string[];
  /** True once the simulation has cooled down after the last data change. */
  isSettled: () => boolean;
  /** Current camera zoom, null before the engine mounts (QA / debug surface). */
  zoomLevel: () => number | null;
  /** Node id the engine currently resolves under the pointer (QA / debug surface). */
  hoveredId: () => string | null;
}

export interface SocialGraphProps {
  /** Per-Arena position cache, retained across ranking and layout changes. */
  positions?: Map<string, GraphPosition>;
  /** Arena standings are supplied by the existing ranking pipeline. */
  annotations?: Map<string, GraphNodeAnnotation>;
  emphasizedEdgeType?: SocialGraphVisualEdge['type'];
  nodes: VisualGraphNode[];
  edges: SocialGraphVisualEdge[];
  /** Prefixed id of the user relationships are derived against */
  focusId: string | null;
  selectedId: string | null;
  /** Canonical tag label -> rank in the selected timeframe's top ten. */
  tagRanks?: Map<string, number>;
  relationships: Map<string, GraphRelationship>;
  /** Focus-anchored cluster opacity tier per node (path mode: all 'center') */
  opacityTiers: Map<string, GraphTier>;
  /** Signed-in-anchored avatar size tier per node */
  sizeTiers: Map<string, GraphTier>;
  /** Node carrying the lime focus ring; defaults to focusId (path mode: the target) */
  ringId?: string | null;
  /** When set, everything outside this node-id set dims (advanced legend hover, social proof) */
  spotlight: Set<string> | null;
  /** When set, links outside this edge-key set dim (legend edge-row hover); see edgeKey in useSocialGraph.utils */
  spotlightEdges?: Set<string> | null;
  /** Path-ordered node ids of a traced shortest path; its edges paint lime */
  pathIds: string[] | null;
  /** nodeId -> community index; communities paint soft halos behind users (advanced) */
  communities: Map<string, number> | null;
  /** community index -> caption (dominant tag label) */
  communityLabels: Map<number, string>;
  /** Advanced lens: edge labels, count chips, curvature, arrowheads, and edge popover interactivity */
  edgeChipsOn?: boolean;
  /** Single click / tap on a node */
  onNodeClick: (id: string) => void;
  /** Double click / double tap on a node */
  onNodeExpand: (id: string) => void;
  onBackgroundClick: () => void;
  /** Click on an edge (used for aggregated tag-edge popovers; advanced lens only) */
  onLinkClick?: (edge: SocialGraphVisualEdge, screen: { x: number; y: number }) => void;
  /** Hover intent on a user node: node + its current screen position, or null on leave */
  onUserHover?: (node: NexusGraphNode | null, screen: { x: number; y: number } | null) => void;
  className?: string;
}
