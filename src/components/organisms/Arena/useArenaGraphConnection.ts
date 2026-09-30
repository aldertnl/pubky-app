'use client';

import { useEffect, useState } from 'react';
import { GraphController } from '@/controllers/graph/graph';
import { isAppError } from '@/libs/error/error';
import { isNotFound } from '@/libs/error/error.utils';
import type { NexusGraph } from '@/libs/graph/graph.types';

type ConnectionResult = {
  key: string;
  graph: NexusGraph | null;
  status: 'loading' | 'ready' | 'empty' | 'error';
};

/** Fetch only on demand; late responses cannot replace a newer selection. */
export function useArenaGraphConnection(from: string | null, to: string | null, enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const key = JSON.stringify([from, to, attempt]);
  useEffect(() => {
    if (!enabled || !from || !to || from === to) return;
    let cancelled = false;
    setResult({ key, graph: null, status: 'loading' });
    void GraphController.fetchPath({ from, to }).then(
      (graph) => {
        if (cancelled) return;
        const valid =
          graph.nodes.length > 1 &&
          graph.nodes.length <= 5 &&
          graph.nodes[0].id === `user:${from}` &&
          graph.nodes.at(-1)?.id === `user:${to}` &&
          graph.nodes.every((node) => node.kind === 'user') &&
          graph.nodes
            .slice(1)
            .every((node, index) =>
              graph.edges.some(
                (edge) =>
                  edge.type === 'FOLLOWS' &&
                  ((edge.source === graph.nodes[index].id && edge.target === node.id) ||
                    (edge.target === graph.nodes[index].id && edge.source === node.id)),
              ),
            );
        setResult({
          key,
          graph: valid ? graph : null,
          status: valid ? 'ready' : graph.nodes.length ? 'error' : 'empty',
        });
      },
      (error: unknown) => {
        if (!cancelled)
          setResult({ key, graph: null, status: isAppError(error) && isNotFound(error) ? 'empty' : 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [from, to, enabled, key]);
  const current = enabled && result?.key === key ? result : null;
  return {
    graph: current?.graph ?? null,
    loading: enabled && (!current || current.status === 'loading'),
    empty: current?.status === 'empty',
    error: current?.status === 'error',
    retry: () => setAttempt((value) => value + 1),
  };
}
