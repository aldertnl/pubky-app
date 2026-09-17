'use client';
import { useEffect, useRef, useState } from 'react';
import { AwardController } from '@/controllers/award/award';
import { type AwardCommand, type AwardReceipt, type AwardSnapshot, pubkySchema } from '@/libs/awards/awards';
import { isAwardNew } from '@/libs/awards/visibility';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';

const requests = new Map<string, Promise<AwardSnapshot>>();
const automaticCheckAttempts = new Map<string, number>();
const syncs = new Map<string, Promise<AwardSnapshot>>();
const syncFailures = new Map<string, number>();
const syncAttempts = new Map<string, number>();
function syncAwards(user: string, action: () => Promise<AwardSnapshot>) {
  const existing = syncs.get(user);
  if (existing) return existing;
  syncAttempts.set(user, Date.now());
  const request = Promise.resolve()
    .then(action)
    .then((state) => {
      syncFailures.delete(user);
      return state;
    })
    .catch((error) => {
      const failures = (syncFailures.get(user) ?? 0) + 1;
      syncFailures.set(user, failures);
      if (failures === 3 && useAuthStore.getState().currentUserPubky === user)
        toast({
          variant: 'warning',
          description: 'Your award updates are taking longer to sync. We’ll keep trying automatically.',
        });
      throw error;
    })
    .finally(() => {
      syncs.delete(user);
      window.dispatchEvent(new Event('arena-awards-changed'));
    });
  syncs.set(user, request);
  window.dispatchEvent(new Event('arena-awards-changed'));
  return request;
}
const CHECK_INTERVAL = 15 * 60_000;
function fetchAwards(user: string) {
  let request = requests.get(user);
  if (!request) {
    request = AwardController.fetch(user).finally(() => requests.delete(user));
    requests.set(user, request);
  }
  return request;
}
export function useAwards(user?: string, enabled = true, autoCheck = false) {
  const currentUser = useAuthStore((state) => state.currentUserPubky);
  const session = useAuthStore((state) => state.session);
  const [result, setResult] = useState<{ user: string; state: AwardSnapshot }>();
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [choiceLoading, setChoiceLoading] = useState<{ id: string; action: string }>();
  const lock = useRef(false);
  const state = result && result.user === user ? result.state : undefined;
  useEffect(() => {
    if (!user || !enabled || !pubkySchema.safeParse(user).success) return;
    let active = true;
    const update = (state: AwardSnapshot) => {
      if (active) setResult({ user, state });
    };
    void AwardController.get(user)
      .then((cached) => {
        if (cached && active) setResult((previous) => (previous?.user === user ? previous : { user, state: cached }));
      })
      .catch(() => {});
    async function refresh() {
      if (active) {
        setNow(Date.now());
        setBusy(syncs.has(user!));
      }
      try {
        let snapshot = await fetchAwards(user!);
        const auth = useAuthStore.getState();
        if (active && auth.currentUserPubky === user && auth.session && !document.hidden) {
          const running = syncs.get(user!);
          if (running) {
            try {
              snapshot = await running;
            } catch {
              /* Keep the last confirmed collection. */
            }
          }
          const queued = await AwardController.pending(user!);
          const checkedAt = Math.max(snapshot.checkedAt ?? 0, automaticCheckAttempts.get(user!) ?? 0);
          if (queued && !running && Date.now() - (syncAttempts.get(user!) ?? 0) >= 60_000) {
            try {
              snapshot = await syncAwards(user!, () => AwardController.retry(user!));
            } catch {
              /* Retain the request for the next automatic or manual retry. */
            }
          } else if (autoCheck && !queued && !running && Date.now() - checkedAt >= CHECK_INTERVAL) {
            automaticCheckAttempts.set(user!, Date.now());
            try {
              snapshot = await syncAwards(user!, () =>
                AwardController.commitCreate(user!, {
                  version: 1,
                  id: crypto.randomUUID(),
                  createdAt: Date.now(),
                  action: 'check',
                }),
              );
              window.dispatchEvent(new Event('arena-awards-changed'));
            } catch {
              // Retain the cached awards and queued request; background checks never toast.
            }
          }
        }
        update(snapshot);
        if (active) setError('');
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load awards.');
      }
      if (user === currentUser) {
        const queued = await AwardController.pending(user!).catch(() => undefined);
        if (active) {
          setPending(!!queued && !syncs.has(user!));
          setBusy(syncs.has(user!));
        }
      }
    }
    void refresh();
    const interval = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 60_000);
    window.addEventListener('arena-awards-changed', refresh);
    window.addEventListener('online', refresh);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('arena-awards-changed', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [user, currentUser, session, enabled, autoCheck]);
  async function run(action: () => Promise<AwardSnapshot>, silent = false) {
    if (!user || user !== useAuthStore.getState().currentUserPubky || lock.current || syncs.has(user)) return false;
    lock.current = true;
    setBusy(true);
    try {
      const updated = await syncAwards(user, action);
      setResult({ user, state: updated });
      setError('');
      setPending(false);
      window.dispatchEvent(new Event('arena-awards-changed'));
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save this award.';
      setError(message);
      const queued = await AwardController.pending(user).catch(() => undefined);
      setPending(!!queued);
      if (!silent && !queued) toast({ variant: 'error', description: message });
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function commit(command: AwardCommand) {
    if (!user || pending) return false;
    return run(() => AwardController.commitCreate(user, command));
  }
  async function choose(award: AwardReceipt, action: 'show' | 'wear' | 'hide' | 'remove') {
    if (!state || !user) return false;
    let worn = state.worn.filter((id) => id !== award.id);
    if (action === 'wear') {
      worn = worn.filter((id) => state.awards.find((a) => a.id === id)?.badge !== award.badge);
      if (worn.length >= 3) {
        toast({ description: 'Remove a worn badge first. You can wear up to three.' });
        return false;
      }
      worn.push(award.id);
    }
    if (action === 'show') worn = state.worn;
    if (busy || pending || lock.current) return false;
    setChoiceLoading({ id: award.id, action });
    try {
      return await commit({
        version: 1,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        action: 'choose',
        revision: state.revision,
        awardId: award.id,
        status: action === 'hide' ? 'hidden' : 'visible',
        worn,
      });
    } finally {
      setChoiceLoading(undefined);
    }
  }
  return {
    state,
    dismissNotification: (award: AwardReceipt) =>
      commit({
        version: 1,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        action: 'dismiss-notification',
        awardId: award.id,
      }),
    markSeen: async (ids: string[]) => {
      if (!user || !state || pending || syncs.has(user) || !useAuthStore.getState().session) return false;
      const awardIds = ids.filter((id) => !(state.seen ?? []).includes(id)).slice(0, 5);
      if (!awardIds.length) return true;
      return run(
        () =>
          AwardController.commitCreate(user, {
            version: 1,
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            action: 'seen',
            awardIds,
          }),
        true,
      );
    },
    choiceLoading,
    canCheck: !state?.checkedAt || now - state.checkedAt >= 900000,
    error,
    busy,
    pending,
    isOwn: !!user && user === currentUser,
    choose,
    commit,
    check: () => commit({ version: 1, id: crypto.randomUUID(), createdAt: Date.now(), action: 'check' }),
    retry: () => run(() => AwardController.retry(user!)),
    discard: () => run(() => AwardController.discard(user!)),
  };
}

export function useAwardNotificationCount() {
  const user = useAuthStore((state) => state.currentUserPubky);
  const awards = useAwards(user ?? undefined, true, true);
  return awards.state?.awards.filter((award) => isAwardNew(award, awards.state)).length ?? 0;
}
