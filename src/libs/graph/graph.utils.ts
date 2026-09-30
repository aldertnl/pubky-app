// Adapted from SHAcollision/pubky-app Graph Explorer, e148641. See docs/graph-attribution.md.
import type { Pubky } from '@/models/models.types';
import type { NexusGraphEdge, NexusGraphNode } from './graph.types';

/** How a user node relates to the focused user. */
export type GraphRelationship = 'self' | 'friend' | 'following' | 'follower' | 'extended';

/** Opacity/size tier of a user cluster relative to an anchor user. */
export type GraphTier = 'center' | 'direct' | 'other';

/** Visual edge model: mutual FOLLOWS pairs collapse into a single FRIEND edge. */
export type SocialGraphVisualEdge = Omit<NexusGraphEdge, 'type'> & {
  type: NexusGraphEdge['type'] | 'FRIEND' | 'HAS_TAG';
  /** All tag labels carried by an aggregated user-to-user TAGGED edge */
  labels?: string[];
};

/**
 * Client-derived per-user profile-tag chip. Never stored in the accumulated
 * graph state: satellites are re-derived from local tag data each recompute
 * and keep object identity through a per-hook cache so the simulation never
 * resets their positions.
 */
export type SatelliteTagNode = {
  kind: 'profile_tag';
  /** `ptag:{pubky}:{label}` */
  id: string;
  pubky: Pubky;
  label: string;
  count: number;
};

/** Everything the canvas can be handed as a node. */
export type VisualGraphNode = NexusGraphNode | SatelliteTagNode;

/** Canonical identity of an edge, shared by merge dedup and edge spotlights. */
export const edgeKey = (edge: { source: string; target: string; type: string; label?: string }) =>
  `${edge.source}|${edge.type}|${edge.target}|${edge.label ?? ''}`;

export function isFragmented(nodes: { id: string }[], edges: Pick<NexusGraphEdge, 'source' | 'target'>[]): boolean {
  if (nodes.length < 2) return false;
  const parent = new Map<string, string>(nodes.map((node) => [node.id, node.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression keeps repeated lookups flat on wide stars
    let walk = id;
    while (parent.get(walk) !== root) {
      const next = parent.get(walk)!;
      parent.set(walk, root);
      walk = next;
    }
    return root;
  };
  let components = nodes.length;
  for (const edge of edges) {
    // Edges can point at nodes pruned from the canvas; they join nothing
    if (!parent.has(edge.source) || !parent.has(edge.target)) continue;
    const a = find(edge.source);
    const b = find(edge.target);
    if (a === b) continue;
    parent.set(a, b);
    components--;
  }
  return components > 1;
}

export function adjacencyOf(nodeId: string, edges: Pick<NexusGraphEdge, 'source' | 'target'>[]): Set<string> {
  const neighbors = new Set<string>();
  for (const edge of edges) {
    if (edge.source === nodeId) neighbors.add(edge.target);
    if (edge.target === nodeId) neighbors.add(edge.source);
  }
  return neighbors;
}
