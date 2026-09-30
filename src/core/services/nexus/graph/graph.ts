// Adapted from SHAcollision/pubky-app Graph Explorer, e148641. See docs/graph-attribution.md.
import type { NexusGraph } from '@/libs/graph/graph.types';
import { buildNexusUrl, encodePathSegment, fetchNexus } from '@/services/nexus/nexus.utils';

export type GraphPathParams = { from: string; to: string };

export class NexusGraphService {
  /** Shortest follow path, bounded by Nexus to four hops; nodes arrive in path order. */
  static async path({ from, to }: GraphPathParams): Promise<NexusGraph> {
    const url = buildNexusUrl(`v0/graph/path/${encodePathSegment(from)}/${encodePathSegment(to)}`);
    return await fetchNexus<NexusGraph>({ url });
  }
}
