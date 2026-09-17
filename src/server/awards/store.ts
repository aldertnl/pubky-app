import type { AwardCommand, AwardReceipt, AwardSnapshot } from '@/libs/awards/awards';
import { isAwardVisible, normalizeChoices } from '@/libs/awards/visibility';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export interface AwardStore {
  readonly issuer: string;
  snapshot(user: string, now?: number): AwardSnapshot | Promise<AwardSnapshot>;
  completed(user: string, id: string): boolean | Promise<boolean>;
  commit(
    user: string,
    command: AwardCommand,
    receipts: AwardReceipt[],
    now?: number,
  ): AwardSnapshot | Promise<AwardSnapshot>;
}

export function awardConflict(message: string) {
  return Err.client(ClientErrorCode.CONFLICT, message, {
    service: ErrorService.Local,
    operation: 'awards',
    context: { statusCode: 409 },
  });
}

export function validateAwardChoice(state: AwardSnapshot, command: Extract<AwardCommand, { action: 'choose' }>) {
  if (state.revision !== command.revision) throw awardConflict('Your collection changed. Refresh and try again.');
  if (!state.awards.some((award) => award.id === command.awardId))
    throw awardConflict('This award does not belong to you.');
  const choices = normalizeChoices({ ...state.choices, [command.awardId]: command.status });
  if (
    command.worn.length > 3 ||
    new Set(command.worn).size !== command.worn.length ||
    command.worn.some((id) => !isAwardVisible(choices[id]) || !state.awards.some((a) => a.id === id))
  )
    throw awardConflict('Choose up to three visible awards.');
  if (new Set(command.worn.map((id) => state.awards.find((a) => a.id === id)!.badge)).size !== command.worn.length)
    throw awardConflict('Wear each badge design only once.');
  return choices;
}

export function validateSeen(state: AwardSnapshot, ids: string[]) {
  if (ids.some((id) => !state.awards.some((award) => award.id === id)))
    throw awardConflict('This award does not belong to you.');
  return [...new Set([...(state.seen ?? []), ...ids])];
}
