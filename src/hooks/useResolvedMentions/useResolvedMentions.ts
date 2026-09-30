'use client';

import { useEffect, useState } from 'react';
import { resolvePubkyToNames } from '@/organisms/NotificationItem/NotificationItem.helpers';

/** Reuse notification mention resolution for plain-text surfaces such as canvas labels. */
export function useResolvedMentions(texts: string[]) {
  const sources = JSON.stringify([...new Set(texts)].sort());
  const [resolved, setResolved] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const current: string[] = JSON.parse(sources);
    void Promise.all(
      current.map(async (text): Promise<[string, string]> => [text, await resolvePubkyToNames(text).catch(() => text)]),
    ).then((entries) => {
      if (!cancelled) setResolved(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [sources]);

  return resolved;
}
