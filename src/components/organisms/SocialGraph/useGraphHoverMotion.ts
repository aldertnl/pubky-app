'use client';

import { useEffect, useRef, useState } from 'react';

export const GRAPH_HOVER_SCALE = 1.06;
const HOVER_DURATION_MS = 180;

/** Animate only while entering or leaving a target; the settled canvas stays idle. */
export function useGraphHoverMotion(nodeId: string | null, linkId: string | null, reducedMotion: boolean) {
  const current = useRef(new Map<string, number>());
  const [amounts, setAmounts] = useState(() => new Map<string, number>());

  useEffect(() => {
    if (reducedMotion) {
      current.current = new Map();
      setAmounts(current.current);
      return;
    }
    const targets = new Set([nodeId, linkId].filter((id): id is string => id !== null));
    const starts = new Map(current.current);
    const ids = new Set([...starts.keys(), ...targets]);
    if (ids.size === 0) return;
    const startedAt = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / HOVER_DURATION_MS);
      const eased = 1 - (1 - progress) ** 3;
      const next = new Map<string, number>();
      for (const id of ids) {
        const start = starts.get(id) ?? 0;
        const target = targets.has(id) ? 1 : 0;
        const amount = start + (target - start) * eased;
        if (amount > 0) next.set(id, amount);
      }
      current.current = next;
      setAmounts(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [nodeId, linkId, reducedMotion]);

  return amounts;
}
