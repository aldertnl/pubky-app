import { AWARD_ROOT, type AwardCommand, type AwardSnapshot } from '@/libs/awards/awards';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { HomeserverService } from '@/services/homeserver/homeserver';

export class AwardService {
  private static async request(user: string, id?: string): Promise<AwardSnapshot> {
    const response = await fetch(
      `/api/awards${id ? '' : `?user=${encodeURIComponent(user)}`}`,
      id
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user, id }),
            signal: AbortSignal.timeout(180000),
          }
        : { cache: 'no-store', signal: AbortSignal.timeout(15000) },
    );
    const result = await response.json();
    if (!response.ok)
      throw Err.client(ClientErrorCode.BAD_REQUEST, result.error ?? 'Could not load awards.', {
        service: ErrorService.Local,
        operation: 'awardRequest',
        context: { statusCode: response.status },
      });
    return result;
  }
  static fetch(user: string) {
    return this.request(user);
  }
  static async publish(user: string, command: AwardCommand) {
    await HomeserverService.request({
      method: HttpMethod.PUT,
      url: `pubky://${user}${AWARD_ROOT}/commands/${command.id}.json`,
      // Preserve command identity and intent across retries; renew only its publication time.
      // The server returns an already-completed command before checking expiration.
      bodyJson: { ...command, createdAt: Date.now() },
    });
    return this.request(user, command.id);
  }
  static async mirror(user: string, state: AwardSnapshot, command: AwardCommand) {
    for (const receipt of state.issued.filter((award) => command.action === 'recognize' && award.id === command.id)) {
      await HomeserverService.request({
        method: HttpMethod.PUT,
        url: `pubky://${user}${AWARD_ROOT}/issued/${receipt.id}.json`,
        bodyJson: { ...receipt },
      });
    }
    // These are copies of service-verified receipts, never a source of authority.
    for (const receipt of state.awards.filter((award) =>
      command.action === 'choose'
        ? award.id === command.awardId
        : command.action === 'check' && award.source === 'arena',
    )) {
      await HomeserverService.request({
        method: HttpMethod.PUT,
        url: `pubky://${user}${AWARD_ROOT}/received/${receipt.id}.json`,
        bodyJson: { ...receipt },
      });
    }
    if (command.action === 'dismiss-notification') {
      await HomeserverService.request({
        method: HttpMethod.PUT,
        url: `pubky://${user}${AWARD_ROOT}/notifications/${command.id}.json`,
        bodyJson: { version: 1, awardId: command.awardId, dismissed: true },
      });
    }
    if (command.action === 'seen') {
      await HomeserverService.request({
        method: HttpMethod.PUT,
        url: `pubky://${user}${AWARD_ROOT}/seen/${command.id}.json`,
        bodyJson: { version: 1, awardIds: command.awardIds },
      });
    }
    if (command.action !== 'choose') return;
    await HomeserverService.request({
      method: HttpMethod.PUT,
      url: `pubky://${user}${AWARD_ROOT}/responses/${String(state.revision).padStart(12, '0')}.json`,
      bodyJson: { version: 1, revision: state.revision, choices: state.choices, worn: state.worn },
    });
    await HomeserverService.request({
      method: HttpMethod.PUT,
      url: `pubky://${user}${AWARD_ROOT}/display.json`,
      bodyJson: { version: 1, revision: state.revision, choices: state.choices, worn: state.worn },
    });
  }
}
