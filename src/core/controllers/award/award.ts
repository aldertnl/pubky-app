import { AwardApplication } from '@/application/award/award';
import { type AwardCommand, commandSchema, pubkySchema } from '@/libs/awards/awards';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { useAuthStore } from '@/stores/auth/auth.store';

function assertOwner(user: string) {
  const auth = useAuthStore.getState();
  if (auth.currentUserPubky !== user || !auth.session)
    throw Err.auth(AuthErrorCode.UNAUTHORIZED, 'Sign in again to save awards.', {
      service: ErrorService.Local,
      operation: 'awardCommit',
    });
}
export class AwardController {
  static get(user: string) {
    return AwardApplication.get(pubkySchema.parse(user));
  }
  static pending(user: string) {
    return AwardApplication.pending(pubkySchema.parse(user));
  }
  static fetch(user: string) {
    return AwardApplication.fetch(pubkySchema.parse(user));
  }
  static commitCreate(user: string, command: AwardCommand) {
    assertOwner(user);
    return AwardApplication.commit(pubkySchema.parse(user), commandSchema.parse(command));
  }
  static retry(user: string) {
    assertOwner(user);
    return AwardApplication.retry(pubkySchema.parse(user));
  }
  static discard(user: string) {
    assertOwner(user);
    return AwardApplication.discard(pubkySchema.parse(user));
  }
}
