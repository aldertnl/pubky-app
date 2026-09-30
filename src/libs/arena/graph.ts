import type { UserStreamUser } from '@/hooks/useUserStream/useUserStream.types';
import type { NexusGraph } from '@/libs/graph/graph.types';
import { streamToGraph } from '@/libs/graph/streamToGraph';
import { canonicalizeTagLabel } from '@/libs/utils/utils';
import type { GraphNodeAnnotation } from '@/organisms/SocialGraph/SocialGraph.types';
import type { RankedArenaIdea } from './arena';
import type { ArenaPeopleMetric } from './people';

export interface ArenaGraphMetadata {
  authors: Map<string, { name: string; image: string | null }>;
  postTags: Map<string, string[]>;
  reposts: Map<string, string | null>;
  profileTags: Map<string, string[]>;
}

export function arenaPostsToGraph(
  ideas: RankedArenaIdea[],
  metadata: ArenaGraphMetadata,
  topic: string | null,
): NexusGraph {
  return streamToGraph(
    ideas.map((idea) => ({
      compositeId: idea.id,
      // Arena's preview already respects content warnings. Never copy raw post text to canvas.
      details: { content: idea.preview, kind: idea.kind, indexed_at: idea.indexedAt, author: idea.author },
      repliedUri: idea.replyTo ? postUri(idea.replyTo) : null,
      repostedUri: metadata.reposts.get(idea.id) ?? null,
      tagLabels: [...(metadata.postTags.get(idea.id) ?? []), ...(topic === null ? [] : [topic])],
    })),
    metadata.authors,
    { includeOutsideParents: false, pinnedTag: topic, minTagCount: 2 },
  );
}

function postUri(id: string) {
  const separator = id.indexOf(':');
  return `pubky://${id.slice(0, separator)}/pub/pubky.app/posts/${id.slice(separator + 1)}`;
}

export function arenaPeopleToGraph(
  users: UserStreamUser[],
  metadata: ArenaGraphMetadata,
  topic: string | null,
): NexusGraph {
  const graph: NexusGraph = {
    nodes: users.map((user) => ({
      kind: 'user',
      id: `user:${user.id}`,
      pubky: user.id,
      name: user.name,
      image: user.image,
    })),
    edges: [],
  };
  const members = new Map<string, string[]>();
  const selectedTag = topic === null ? null : canonicalizeTagLabel(topic);
  for (const user of users) {
    const labels = new Set(
      [...(metadata.profileTags.get(user.id) ?? user.tags ?? []), ...(topic === null ? [] : [topic])]
        .map(canonicalizeTagLabel)
        .filter(Boolean),
    );
    for (const label of labels) members.set(label, [...(members.get(label) ?? []), user.id]);
  }
  const hubs = [...members]
    .filter(([label, ids]) => label === selectedTag || ids.length > 1)
    .sort(
      (a, b) =>
        Number(b[0] === selectedTag) - Number(a[0] === selectedTag) ||
        b[1].length - a[1].length ||
        a[0].localeCompare(b[0]),
    )
    .slice(0, 8);
  for (const [label, ids] of hubs) {
    const id = `tag:${label}`;
    graph.nodes.push({ kind: 'tag', id, label, count: ids.length });
    for (const userId of ids) graph.edges.push({ source: id, target: `user:${userId}`, type: 'TAGGED', label });
  }
  return graph;
}

export function arenaPersonAnnotation(
  user: UserStreamUser,
  index: number,
  metric: ArenaPeopleMetric,
): GraphNodeAnnotation {
  const rank = index + 1;
  const kind = metric === 'popular' ? 'followers' : metric;
  const labels = { followers: 'followers', posts: 'posts', replies: 'replies written', tags: 'tags applied' };
  const value = kind === 'active' || kind === 'newest' ? undefined : user.counts?.[kind];
  return {
    rank,
    title: user.name || user.id.slice(0, 8),
    stats: [
      {
        kind: kind === 'newest' ? 'time' : kind,
        value:
          kind === 'active'
            ? 'Most active'
            : kind === 'newest'
              ? 'Most recent'
              : (value?.toLocaleString('en-US') ?? '…'),
      },
    ],
    metric:
      kind === 'active'
        ? 'Most active'
        : kind === 'newest'
          ? 'Most recent'
          : `${value?.toLocaleString('en-US') ?? '…'} ${labels[kind]}`,
  };
}
