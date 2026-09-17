import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/molecules/Toaster/toast';
import { useAwards } from './useAwards';

const mocks = vi.hoisted(() => ({
  auth: { currentUserPubky: 'a'.repeat(52), session: {} },
  fetch: vi.fn(),
  get: vi.fn(),
  pending: vi.fn(),
  commitCreate: vi.fn(),
  retry: vi.fn(),
}));
vi.mock('@/controllers/award/award', () => ({ AwardController: mocks }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign((select: (state: typeof mocks.auth) => unknown) => select(mocks.auth), {
    getState: () => mocks.auth,
  }),
}));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: vi.fn() }));
const snapshot = {
  awards: [],
  issued: [],
  choices: {},
  worn: [],
  checkedAt: null,
  revision: 0,
  remaining: 3,
  resetsAt: 0,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(undefined);
  mocks.retry.mockResolvedValue(snapshot);
  mocks.pending.mockResolvedValue(undefined);
  mocks.fetch.mockResolvedValue(snapshot);
  mocks.commitCreate.mockResolvedValue({ ...snapshot, checkedAt: Date.now() });
});
describe('automatic award checks', () => {
  it('checks the signed-in owner once across simultaneous consumers', async () => {
    mocks.auth.currentUserPubky = 'a'.repeat(52);
    renderHook(() => {
      useAwards(mocks.auth.currentUserPubky, true, true);
      useAwards(mocks.auth.currentUserPubky, true, true);
    });
    await waitFor(() => expect(mocks.commitCreate).toHaveBeenCalledTimes(1));
    expect(mocks.commitCreate).toHaveBeenCalledWith(
      mocks.auth.currentUserPubky,
      expect.objectContaining({ action: 'check' }),
    );
  });
  it('does not check again within fifteen minutes', async () => {
    mocks.auth.currentUserPubky = 'b'.repeat(52);
    mocks.fetch.mockResolvedValue({ ...snapshot, checkedAt: Date.now() });
    const { result } = renderHook(() => useAwards(mocks.auth.currentUserPubky, true, true));
    await waitFor(() => expect(result.current.state).toBeDefined());
    expect(mocks.commitCreate).not.toHaveBeenCalled();
  });
  it('does not check another user or overwrite a pending request', async () => {
    mocks.auth.currentUserPubky = 'c'.repeat(52);
    mocks.pending.mockResolvedValue({ action: 'choose' });
    const { result } = renderHook(() => {
      useAwards('d'.repeat(52), true, true);
      return useAwards(mocks.auth.currentUserPubky, true, true);
    });
    await waitFor(() => expect(result.current.state).toBeDefined());
    expect(mocks.commitCreate).not.toHaveBeenCalled();
  });
});

describe('automatic sync recovery', () => {
  it('shares a saved-request retry and hides the warning while it is running', async () => {
    mocks.auth.currentUserPubky = 'e'.repeat(52);
    mocks.pending.mockResolvedValue({ command: { action: 'choose' }, stage: 'mirror' });
    let complete!: (value: typeof snapshot) => void;
    mocks.retry.mockReturnValue(
      new Promise<typeof snapshot>((resolve) => {
        complete = resolve;
      }),
    );
    const { result } = renderHook(() => [
      useAwards(mocks.auth.currentUserPubky),
      useAwards(mocks.auth.currentUserPubky),
    ]);
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.every((awards) => awards.busy && !awards.pending)).toBe(true));
    mocks.pending.mockResolvedValue(undefined);
    await act(async () => {
      complete(snapshot);
    });
    await waitFor(() => expect(result.current.every((awards) => !awards.busy && !awards.pending)).toBe(true));
  });
  it('keeps failed changes recoverable without retrying on every refresh', async () => {
    mocks.auth.currentUserPubky = 'f'.repeat(52);
    mocks.pending.mockResolvedValue({ command: { action: 'recognize' }, stage: 'command' });
    mocks.retry.mockRejectedValue({ message: 'offline' });
    const { result } = renderHook(() => useAwards(mocks.auth.currentUserPubky));
    await waitFor(() => expect(result.current.pending).toBe(true));
    await act(async () => {
      window.dispatchEvent(new Event('arena-awards-changed'));
    });
    expect(mocks.retry).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);
  });
});

it('warns once after three failed sync attempts while continuing periodic retries', async () => {
  mocks.auth.currentUserPubky = 'g'.repeat(52);
  mocks.pending.mockResolvedValue({command: {action:'check'}, stage:'command'});
  mocks.retry.mockRejectedValue({message:'offline'});
  let now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  try {
    renderHook(() => useAwards(mocks.auth.currentUserPubky));
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledTimes(1));
    expect(toast).not.toHaveBeenCalled();
    for (let attempt = 2; attempt <= 4; attempt++) {
      now += 61_000;
      await act(async () => { window.dispatchEvent(new Event('arena-awards-changed')); });
      await waitFor(() => expect(mocks.retry).toHaveBeenCalledTimes(attempt));
      expect(toast).toHaveBeenCalledTimes(attempt < 3 ? 0 : 1);
    }
  } finally { clock.mockRestore(); }
});
