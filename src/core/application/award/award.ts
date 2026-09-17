import { type AwardCommand } from '@/libs/awards/awards';
import { ClientErrorCode, DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { AwardModel } from '@/models/award/award';
import { AwardService } from '@/services/award/award';

export class AwardApplication {
  static get(user: string) {
    return AwardModel.get(user);
  }
  static pending(user: string) {
    return AwardModel.pending(user);
  }
  static async fetch(user: string) {
    const state = await AwardService.fetch(user);
    await AwardModel.save(user, state);
    return state;
  }
  static async commit(user: string, command: AwardCommand) {
    try {
      await AwardModel.claim({ user, command, stage: 'command' });
    } catch (error) {
      if ((error as { name?: string }).name === 'ConstraintError')
        throw Err.client(ClientErrorCode.CONFLICT, 'Another award update is still syncing. Please try again shortly.', {
          service: ErrorService.Local,
          operation: 'queueAward',
        });
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Could not save your award request locally.', {
        service: ErrorService.Local,
        operation: 'queueAward',
        cause: error,
      });
    }
    return this.retry(user);
  }
  static async retry(user: string) {
    const pending = await AwardModel.pending(user);
    if (!pending) return this.fetch(user);
    let state = pending.snapshot;
    if (pending.stage === 'command') {
      try {
        state = await AwardService.publish(user, pending.command);
      } catch (error) {
        const rejection = error as { operation?: string; context?: { statusCode?: number } };
        // A ledger conflict rejects the transaction. Replaying the same stale
        // intent cannot succeed; release the queue so the user can try again.
        // Ambiguous network failures and failed receipt mirrors stay queued.
        if (rejection?.operation === 'awardRequest' && rejection.context?.statusCode === 409)
          await AwardModel.done(user);
        throw error;
      }
      await AwardModel.save(user, state);
      await AwardModel.queue({ ...pending, stage: 'mirror', snapshot: state });
    }
    if (state) {
      state = await this.fetch(user);
      await AwardService.mirror(user, state, pending.command);
      await AwardModel.done(user);
      return state;
    }
    return this.fetch(user);
  }
  static async discard(user: string) {
    await AwardModel.done(user);
    return this.fetch(user);
  }
}
