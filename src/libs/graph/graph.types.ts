// Adapted from SHAcollision/pubky-app Graph Explorer, e148641. See docs/graph-attribution.md.
import type { Pubky } from '@/models/models.types';

/**
 * Graph Neighborhood API types
 *
 * Mirrors the Nexus `GET /v0/graph/{kind}/{id}` response: a typed node-link
 * graph around a center entity. Node ids are kind-prefixed and globally
 * unique: `user:{pubky}`, `post:{author}:{post_id}`, `tag:{label}`.
 */

export type GraphNodeKind = 'user' | 'post' | 'tag';

export type GraphPosition = { x: number; y: number; fx?: number; fy?: number; __pinned?: boolean };

export type NexusGraphUserNode = {
  kind: 'user';
  id: string;
  pubky: Pubky;
  name: string;
  image: string | null;
};

export type NexusGraphPostNode = {
  kind: 'post';
  id: string;
  author_id: Pubky;
  post_id: string;
  content: string;
  post_kind: string;
  /** Replies to a post outside the neighborhood carry no REPLIED edge, so the flag travels with the node */
  is_reply: boolean;
  indexed_at: number;
};

export type NexusGraphTagNode = {
  kind: 'tag';
  id: string;
  label: string;
  count: number;
};

export type NexusGraphNode = NexusGraphUserNode | NexusGraphPostNode | NexusGraphTagNode;

export type NexusGraphEdgeType = 'FOLLOWS' | 'AUTHORED' | 'TAGGED' | 'REPLIED' | 'REPOSTED' | 'MENTIONED';

export type NexusGraphEdge = {
  source: string;
  target: string;
  type: NexusGraphEdgeType;
  /** Present only on TAGGED edges */
  label?: string;
  /** When the relationship was indexed; drives the client time filters */
  indexed_at?: number;
};

export type NexusGraph = {
  nodes: NexusGraphNode[];
  edges: NexusGraphEdge[];
};
