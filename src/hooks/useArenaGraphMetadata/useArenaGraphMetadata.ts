'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PostController } from '@/controllers/post/post';
import { TagCacheController } from '@/controllers/tag/tag-cache';
import { UserController } from '@/controllers/user/user';
import type { ArenaGraphMetadata } from '@/libs/arena/graph';

const EMPTY: ArenaGraphMetadata = {
  authors: new Map(),
  postTags: new Map(),
  reposts: new Map(),
  profileTags: new Map(),
};

/** Enrich only visible contenders. Relationships never fetch or add other contenders. */
export function useArenaGraphMetadata(postIds: string[], userIds: string[], people: boolean) {
  // Re-ranking the same contenders must not refetch metadata or restart layout.
  const key = JSON.stringify([[...new Set(postIds)].sort(), [...new Set(userIds)].sort(), people]);
  const [attempt, setAttempt] = useState(0);
  const [hydration, setHydration] = useState({ key: '', failed: false });
  useEffect(() => {
    let cancelled = false;
    const [, ids, isPeople] = JSON.parse(key) as [string[], string[], boolean];
    // The controller caches missing profiles/tags. No graph-neighborhood API calls.
    void Promise.allSettled([
      ...ids.map((userId) => UserController.getOrFetchDetails({ userId })),
      ...(isPeople ? [UserController.getManyTagsOrFetch({ userIds: ids })] : []),
    ]).then((results) => {
      if (!cancelled) setHydration({ key, failed: results.some((result) => result.status === 'rejected') });
    });
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const result = useLiveQuery(async () => {
    const [posts, users, isPeople] = JSON.parse(key) as [string[], string[], boolean];
    try {
      const [authors, snapshots, tags, profileTags] = await Promise.all([
        UserController.getManyDetails({ userIds: users }),
        PostController.getManySnapshots({ compositeIds: posts }),
        Promise.all(
          posts.map(
            async (id) =>
              [id, (await TagCacheController.get({ kind: 'post', id }))?.tags.map((tag) => tag.label) ?? []] as const,
          ),
        ),
        Promise.all(
          (isPeople ? users : []).map(
            async (id) =>
              [id, (await TagCacheController.get({ kind: 'user', id }))?.tags.map((tag) => tag.label) ?? []] as const,
          ),
        ),
      ]);
      return {
        key,
        failed: false,
        metadata: {
          authors,
          postTags: new Map(tags),
          reposts: new Map([...snapshots].map(([id, snapshot]) => [id, snapshot.relationships?.reposted ?? null])),
          profileTags: new Map(profileTags),
        } satisfies ArenaGraphMetadata,
      };
    } catch {
      return { key, failed: true, metadata: EMPTY };
    }
  }, [key, attempt]);

  return {
    metadata: result?.key === key ? result.metadata : EMPTY,
    loading: result?.key !== key || hydration.key !== key,
    error: (result?.key === key && result.failed) || (hydration.key === key && hydration.failed),
    retry: () => setAttempt((value) => value + 1),
  };
}
