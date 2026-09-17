import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type AwardCommand, type AwardSnapshot } from '@/libs/awards/awards';
import { AwardModel } from '@/models/award/award';
import { AwardService } from '@/services/award/award';
import { AwardApplication } from './award';

vi.mock('@/services/award/award', () => ({ AwardService: { fetch: vi.fn(), publish: vi.fn(), mirror: vi.fn() } }));
const user = 'a'.repeat(52);
const state: AwardSnapshot = {
  awards: [],
  issued: [],
  choices: {},
  worn: [],
  revision: 0,
  remaining: 1,
  resetsAt: 1,
  checkedAt: null,
};
const command = (): AwardCommand => ({ version: 1, action: 'check', id: crypto.randomUUID(), createdAt: Date.now() });
beforeEach(async () => {
  await AwardModel.done(user);
  vi.resetAllMocks();
  vi.mocked(AwardService.fetch).mockResolvedValue(state);
});
describe('local-first award recovery', () => {
  it('releases a definitively rejected ledger command so another action can proceed', async () => {
    const rejection = { operation: 'awardRequest', context: { statusCode: 409 }, message: 'Collection changed' };
    vi.mocked(AwardService.publish).mockRejectedValueOnce(rejection).mockResolvedValue(state);
    await expect(AwardApplication.commit(user, command())).rejects.toEqual(rejection);
    expect(await AwardModel.pending(user)).toBeUndefined();
    await expect(AwardApplication.commit(user, command())).resolves.toEqual(state);
  });
  it('retains a homeserver conflict because ledger completion is not confirmed', async () => {
    vi.mocked(AwardService.publish).mockRejectedValue({
      operation: 'homeserverRequest',
      context: { statusCode: 409 },
    });
    const intent = command();
    await expect(AwardApplication.commit(user, intent)).rejects.toBeDefined();
    expect((await AwardModel.pending(user))?.command.id).toBe(intent.id);
  });
  it('persists the command before network IO and retains it across a failed publication', async () => {
    const intent = command();
    vi.mocked(AwardService.publish).mockImplementation(async () => {
      expect((await AwardModel.pending(user))?.command).toEqual(intent);
      return Promise.reject({ message: 'offline' });
    });
    await expect(AwardApplication.commit(user, intent)).rejects.toBeDefined();
    expect((await AwardModel.pending(user))?.command.id).toBe(intent.id);
    vi.mocked(AwardService.publish).mockResolvedValue(state);
    await AwardApplication.retry(user);
    expect(vi.mocked(AwardService.publish).mock.calls[1][1].id).toBe(intent.id);
    expect(await AwardModel.pending(user)).toBeUndefined();
  });
  it('does not reissue after mirror failure and mirrors the latest recipient choices on retry', async () => {
    vi.mocked(AwardService.publish).mockResolvedValue(state);
    vi.mocked(AwardService.mirror).mockRejectedValueOnce({ message: 'homeserver offline' });
    await expect(AwardApplication.commit(user, command())).rejects.toBeDefined();
    expect((await AwardModel.pending(user))?.stage).toBe('mirror');
    const latest = { ...state, revision: 2 };
    vi.mocked(AwardService.fetch).mockResolvedValue(latest);
    await AwardApplication.retry(user);
    expect(AwardService.publish).toHaveBeenCalledTimes(1);
    expect(AwardService.mirror).toHaveBeenLastCalledWith(user, latest, expect.objectContaining({ action: 'check' }));
  });
  it('a second local request cannot overwrite an unsynced command', async () => {
    const first = command();
    await AwardModel.claim({ user, command: first, stage: 'command' });
    await expect(AwardApplication.commit(user, command())).rejects.toBeDefined();
    expect((await AwardModel.pending(user))?.command).toEqual(first);
    expect(AwardService.publish).not.toHaveBeenCalled();
  });
});
