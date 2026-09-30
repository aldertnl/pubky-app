'use client';

import { useRef } from 'react';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { useArenaGraphHeight } from './useArenaGraphHeight';

export function ArenaGraphLoading() {
  const container = useRef<HTMLDivElement>(null);
  const height = useArenaGraphHeight(container);
  return (
    <div
      ref={container}
      style={{ height }}
      className="flex h-[650px] items-center justify-center rounded-xl border border-border bg-background lg:rounded-br-[2.5rem]"
      aria-busy="true"
    >
      <Spinner aria-label="Loading graph" />
    </div>
  );
}
