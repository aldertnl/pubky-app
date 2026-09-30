import { describe, expect, it } from 'vitest';
import type { UserStreamUser } from '@/hooks/useUserStream/useUserStream.types';
import { type ArenaIdea, getArenaVisibleIdeas, rankArenaIdeas } from './arena';
import { type ArenaGraphMetadata, arenaPeopleToGraph, arenaPersonAnnotation, arenaPostsToGraph } from './graph';

const metadata = (): ArenaGraphMetadata => ({
  authors: new Map(),
  postTags: new Map(),
  reposts: new Map(),
  profileTags: new Map(),
});
const post = (id: string, overrides: Partial<ArenaIdea> = {}): ArenaIdea => ({
  id,
  author: id.split(':')[0],
  preview: 'Safe preview',
  kind: 'short',
  indexedAt: 1234,
  tags: 3,
  replies: 2,
  reposts: 1,
  replyTo: null,
  ...overrides,
});
const person = (id: string): UserStreamUser => ({
  id,
  name: id,
  bio: '',
  image: null,
  avatarUrl: null,
  status: null,
  counts: { followers: 55, posts: 12, tags: 400, replies: 9, following: 3 },
});

describe('Arena graph projection', () => {
  it('preserves the ranked ten and sanitized previews without adding outside reply/repost parents', () => {
    const ranked = rankArenaIdeas(
      Array.from({ length: 12 }, (_, index) =>
        post(`a:p${index}`, {
          tags: 20 - index,
          replyTo: 'outside:root',
          preview: index === 0 ? 'Content warning' : 'Safe preview',
        }),
      ),
      'popular',
    );
    const visible = getArenaVisibleIdeas(ranked);
    const input = metadata();
    input.reposts.set('a:p0', 'pubky://outside/pub/pubky.app/posts/original');
    const before = structuredClone(visible);
    const graph = arenaPostsToGraph(visible, input, null);
    expect(graph.nodes.filter((node) => node.kind === 'post').map((node) => node.id)).toEqual(
      visible.map((idea) => `post:${idea.id}`),
    );
    expect(graph.nodes.find((node) => node.id === 'post:a:p0')).toMatchObject({ content: 'Content warning' });
    expect(graph.nodes.some((node) => node.id.includes('outside'))).toBe(false);
    expect(graph.edges.every((edge) => edge.type === 'AUTHORED')).toBe(true);
    expect(visible).toEqual(before);
  });

  it('draws reply/repost lineage only between included contenders regardless of order', () => {
    const input = metadata();
    input.reposts.set('b:child', 'pubky://a/pub/pubky.app/posts/root');
    const graph = arenaPostsToGraph(
      rankArenaIdeas([post('b:child', { replyTo: 'a:root', tags: 20 }), post('a:root')], 'tags'),
      input,
      null,
    );
    expect(graph.edges.filter((edge) => edge.type === 'REPLIED' || edge.type === 'REPOSTED')).toEqual([
      expect.objectContaining({ source: 'post:b:child', target: 'post:a:root', type: 'REPLIED' }),
      expect.objectContaining({ source: 'post:b:child', target: 'post:a:root', type: 'REPOSTED' }),
    ]);
  });

  it('counts distinct matching contenders, retains literal selected tags, and caps hubs', () => {
    const input = metadata();
    const labels = Array.from({ length: 12 }, (_, index) => `shared${index}`);
    input.postTags.set('a:p', [...labels, 'shared0', 'unique']);
    input.postTags.set('b:p', labels);
    const graph = arenaPostsToGraph(rankArenaIdeas([post('a:p'), post('b:p')], 'popular'), input, 'all:literal');
    const tags = graph.nodes.filter((node) => node.kind === 'tag');
    expect(tags).toHaveLength(8);
    expect(tags[0]).toMatchObject({ id: 'tag:all:literal', count: 2 });
    expect(tags.every((tag) => tag.count === 2)).toBe(true);
    expect(tags.some((tag) => tag.label === 'unique')).toBe(false);
  });

  it('keeps disconnected people visible without inventing follows or ranking them by profile tags', () => {
    const users = [person('a'), person('b'), person('c')];
    const input = metadata();
    input.profileTags.set('a', ['bitcoin']);
    input.profileTags.set('b', ['bitcoin']);
    const graph = arenaPeopleToGraph(users, input, null);
    expect(graph.nodes.filter((node) => node.kind === 'user')).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges.every((edge) => edge.type === 'TAGGED')).toBe(true);
    expect(arenaPersonAnnotation(users[0], 0, 'tags')).toMatchObject({
      rank: 1,
      metric: '400 tags applied',
      stats: [{ kind: 'tags', value: '400' }],
    });
    expect(arenaPersonAnnotation(users[0], 0, 'posts').stats).toEqual([{ kind: 'posts', value: '12' }]);
    expect(arenaPersonAnnotation(users[0], 0, 'popular').metric).toBe('55 followers');
    expect(arenaPersonAnnotation(users[0], 0, 'replies').metric).toBe('9 replies written');
    expect(arenaPersonAnnotation(users[0], 0, 'newest').metric).toBe('Most recent');
  });

  it('merges tag casing and whitespace and counts each post only once', () => {
    const input = metadata();
    input.postTags.set('a:p', ['Pubky', ' pubky ', '', '   ']);
    input.postTags.set('b:p', ['PUBKY']);
    const ranked = rankArenaIdeas([post('a:p'), post('b:p')], 'popular');
    const graph = arenaPostsToGraph([ranked[0], ranked[0], ranked[1]], input, null);
    expect(graph.nodes.filter((node) => node.kind === 'tag')).toEqual([
      { kind: 'tag', id: 'tag:pubky', label: 'pubky', count: 2 },
    ]);
    expect(graph.edges.filter((edge) => edge.type === 'TAGGED')).toHaveLength(2);
  });

  it('merges canonical profile tags without duplicating people connections', () => {
    const input = metadata();
    input.profileTags.set('a', ['Pubky', ' pubky ', '']);
    input.profileTags.set('b', ['PUBKY']);
    const graph = arenaPeopleToGraph([person('a'), person('b')], input, 'pubky');
    expect(graph.nodes.filter((node) => node.kind === 'tag')).toEqual([
      { kind: 'tag', id: 'tag:pubky', label: 'pubky', count: 2 },
    ]);
    expect(graph.edges).toHaveLength(2);
  });
});
