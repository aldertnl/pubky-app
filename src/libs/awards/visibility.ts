import type { AwardReceipt, AwardSnapshot } from './awards';

export function isAwardVisible(status: string | undefined) {
  return status !== 'hidden' && status !== 'dismissed';
}
export function normalizeChoices(choices: AwardSnapshot['choices']): AwardSnapshot['choices'] {
  return Object.fromEntries(
    Object.entries(choices).map(([id, status]) => [id, isAwardVisible(status) ? 'visible' : 'hidden']),
  );
}
export function isAwardNew(award: AwardReceipt, state?: AwardSnapshot) {
  return isNotificationVisible(award, state) && !(state?.seen ?? []).includes(award.id);
}
export function awardCardStatus(award: AwardReceipt, state?: AwardSnapshot) {
  if (!isAwardVisible(state?.choices[award.id])) return 'hidden' as const;
  if (state?.worn.includes(award.id)) return 'worn' as const;
  return isAwardNew(award, state) ? ('new' as const) : ('visible' as const);
}

export function isNotificationVisible(award: AwardReceipt, state?: AwardSnapshot) {
  return isAwardVisible(state?.choices[award.id]) && !(state?.dismissedNotifications ?? []).includes(award.id);
}
