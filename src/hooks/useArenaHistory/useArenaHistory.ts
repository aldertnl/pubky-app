'use client';

import { useEffect, useEffectEvent } from 'react';
import { APP_ROUTES } from '@/app/routes';
import { ARENA_PEOPLE } from '@/libs/arena/people';
import type { ReachType } from '@/stores/home/home.types';
import { CONTENT, REACH } from '@/stores/home/home.types';
import { TIMEFRAME } from '@/stores/hot/hot.types';
import type { ArenaHistoryState } from './useArenaHistory.types';

const OPTIONS = {
  view: ['arena', 'list', 'graph'],
  metric: ['popular', 'active', 'posts', 'tags', 'replies', 'reposts', 'newest'],
  content: [...Object.values(CONTENT), ARENA_PEOPLE, 'arena-tags'],
  reach: Object.values(REACH),
  timeframe: Object.values(TIMEFRAME),
};
const PARAMS = { view: 'view', metric: 'ranking', content: 'content', reach: 'reach', timeframe: 'timeframe' } as const;

function normalizeTimeframe(state: ArenaHistoryState): ArenaHistoryState {
  return state.content === ARENA_PEOPLE && state.metric === 'popular'
    ? { ...state, timeframe: TIMEFRAME.ALL_TIME }
    : state;
}

function readUrl(fallback: ArenaHistoryState): ArenaHistoryState | null {
  const params = new URLSearchParams(window.location.search);
  if (![...Object.values(PARAMS), 'tag'].some((key) => params.has(key))) return null;
  const next = { ...fallback };
  for (const key of Object.keys(PARAMS) as (keyof typeof PARAMS)[]) {
    const value = params.get(PARAMS[key]);
    if (value !== null && (OPTIONS[key] as readonly string[]).includes(value)) {
      Object.assign(next, { [key]: value });
    }
  }
  if ((OPTIONS.reach as readonly string[]).includes(params.get('reach') ?? '')) next.defaultReach = false;
  next.topic = params.has('tag') ? params.get('tag') || null : undefined;
  if (next.content === 'arena-tags') next.metric = 'popular';
  else if (next.metric === 'active' || next.metric === 'posts') next.content = ARENA_PEOPLE;
  else if (next.content === ARENA_PEOPLE && next.metric === 'reposts') next.metric = 'popular';
  return normalizeTimeframe(next);
}

function stateUrl(state: ArenaHistoryState, displayedReach: ReachType) {
  const url = new URL(window.location.href);
  for (const key of Object.keys(PARAMS) as (keyof typeof PARAMS)[]) {
    url.searchParams.set(PARAMS[key], key === 'reach' ? displayedReach : state[key]);
  }
  // Missing means automatic selection; an empty tag explicitly means no filter.
  if (state.topic === undefined) url.searchParams.delete('tag');
  else url.searchParams.set('tag', state.topic ?? '');
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Record deliberate filter/layout changes, never data arrival or hover events. */
export function useArenaHistory(
  state: ArenaHistoryState,
  restore: (state: ArenaHistoryState) => void,
  displayedReach: (state: ArenaHistoryState) => ReachType,
) {
  const restoreLocation = useEffectEvent(() => {
    if (window.location.pathname !== APP_ROUTES.ARENA) return;
    const next: ArenaHistoryState | null = window.history.state?.arenaState ?? readUrl(state);
    if (next) {
      const normalized = normalizeTimeframe(next);
      const url = stateUrl(normalized, displayedReach(normalized));
      if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.history.replaceState({ arenaState: normalized }, '', url);
      }
      restore(normalized);
    }
  });

  useEffect(() => {
    restoreLocation();
    window.addEventListener('popstate', restoreLocation);
    return () => window.removeEventListener('popstate', restoreLocation);
  }, []);

  return (changes: Partial<ArenaHistoryState>) => {
    const next = normalizeTimeframe({ ...state, ...changes });
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    // Next copies its router state into these entries. Do not pass its internal
    // keys back to pushState: that bypasses Next's native-history integration.
    window.history.replaceState({ arenaState: state }, '', stateUrl(state, displayedReach(state)));
    window.history.pushState({ arenaState: next }, '', stateUrl(next, displayedReach(next)));
    restore(next);
  };
}
