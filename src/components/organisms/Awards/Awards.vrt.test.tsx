import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { type AwardSnapshot } from '@/libs/awards/awards';
import { ProfilePageHeader } from '@/organisms/ProfilePageHeader/ProfilePageHeader';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { AwardNotifications } from './AwardNotifications';
import { AwardsDialog } from './AwardsDialog';
import { RecognizeDialog } from './RecognizeDialog';

const data = vi.hoisted(() => {
  const user = 'a'.repeat(52);
  return {
    user,
    state: {
      awards: ['contender', 'explorer', 'good-sport'].map((badge, index) => ({
        version: 1,
        id: `award${index}`,
        badge,
        source: index === 2 ? 'user' : 'arena',
        method: index === 2 ? 'user' : 'automatic',
        issuer: index === 2 ? 'b'.repeat(52) : 'arena:fixture',
        recipient: user,
        reason: 'A contribution worth keeping.',
        issuedAt: 1700000000000,
        definitionVersion: 1,
      })),
      issued: [],
      choices: { award0: 'accepted', award1: 'accepted', award2: 'accepted' },
      worn: ['award0', 'award1', 'award2'],
      revision: 1,
      remaining: 1,
      resetsAt: 1800000000000,
      checkedAt: null,
    } as AwardSnapshot,
  };
});
vi.mock('@/hooks/useAwards/useAwards', () => ({
  useAwards: () => ({
    state: data.state,
    error: '',
    pending: false,
    busy: false,
    isOwn: true,
    canCheck: true,
    dismissNotification: vi.fn(),
    markSeen: vi.fn(),
    choose: vi.fn(),
    commit: vi.fn(),
    check: vi.fn(),
  }),
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: data.user }),
}));
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({ useRequireAuth: () => ({ requireAuth: vi.fn() }) }));
vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({ useUserProfile: () => ({ profile: { name: 'Alex' } }) }));
vi.mock('@/hooks/useTtlSubscription/useTtlSubscription', () => ({ useTtlSubscription: () => ({ ref: null }) }));
vi.mock('@/organisms/ProfileMenuActions/ProfileMenuActions', () => ({
  ProfileMenuActions: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
vi.mock('@/molecules/PostText/PostText', () => ({ PostText: ({ content }: { content: string }) => <p>{content}</p> }));
vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: ({ className }: { className: string }) => (
    <div
      className={`${className} flex items-center justify-center rounded-full bg-[#c8ff00] text-3xl font-bold text-black`}
    >
      A
    </div>
  ),
}));
describe('Arena awards visual integration', () => {
  for (const [name, viewport] of [
    ['desktop', VRT_VIEWPORT_DESKTOP],
    ['mobile', VRT_VIEWPORT_MOBILE],
  ] as const) {
    it(`notifications ${name}`, async () => {
      const choices = data.state.choices;
      const worn = data.state.worn;
      data.state.choices = {};
      data.state.worn = [];
      try {
        await renderForVRT(
          <div className="mx-auto max-w-3xl p-4">
            <AwardNotifications />
          </div>,
          { viewport },
        );
        await expect.element(page.getByRole('region', { name: 'Award notifications' })).toBeVisible();
        await matchVrtFrameScreenshot(`awards-notifications-${name}`);
        await page.getByRole('button', { name: 'Hide', exact: true }).first().click();
        await expect.element(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
        await matchVrtFrameScreenshot(`awards-hide-confirmation-${name}`);
      } finally {
        data.state.choices = choices;
        data.state.worn = worn;
      }
    });
    it(`hidden collection ${name}`, async () => {
      const choices = data.state.choices;
      const worn = data.state.worn;
      data.state.choices = { award0: 'hidden' };
      data.state.worn = [];
      try {
        await renderForVRT(<AwardsDialog open onOpenChange={() => {}} />, { viewport });
        await page.getByRole('button', { name: 'My awards (2)', exact: true }).click();
        await expect.element(page.getByText('HIDDEN', { exact: true })).toBeVisible();
        await matchVrtFrameScreenshot(`awards-hidden-${name}`);
      } finally {
        data.state.choices = choices;
        data.state.worn = worn;
      }
    });
    it(`gallery ${name}`, async () => {
      await renderForVRT(<AwardsDialog open onOpenChange={() => {}} />, { viewport });
      await expect.element(page.getByRole('button', { name: 'Contender', exact: true })).toBeVisible();
      await matchVrtFrameScreenshot(`awards-gallery-${name}`);
    });
    it(`recognition ${name}`, async () => {
      await renderForVRT(<RecognizeDialog open postId={`${'b'.repeat(52)}:post1`} onOpenChange={() => {}} />, {
        viewport,
      });
      await expect.element(page.getByRole('button', { name: 'Send Award' })).toBeVisible();
      await matchVrtFrameScreenshot(`awards-recognize-${name}`);
    });
    it(`profile with three badges ${name}`, async () => {
      await renderForVRT(
        <div className="p-5 lg:p-12">
          <ProfilePageHeader
            userId={data.user}
            isOwnProfile={false}
            profile={{
              name: 'Alex',
              publicKey: data.user,
              emoji: '🌴',
              status: '🌴 Exploring',
              bio: 'Curious minds make good company.',
              link: '',
            }}
            actions={{ onCopyLink: () => {}, followLoadingAction: null }}
          />
        </div>,
        { viewport },
      );
      const badges = document.querySelector('[aria-label="Worn awards"]')!;
      const status = document.querySelector('[aria-label$=" status"]')!;
      expect(badges.getBoundingClientRect().left).toBeGreaterThan(status.getBoundingClientRect().right);
      expect(
        Math.abs(
          badges.getBoundingClientRect().top +
            badges.getBoundingClientRect().height / 2 -
            status.getBoundingClientRect().top -
            status.getBoundingClientRect().height / 2,
        ),
      ).toBeLessThan(2);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(viewport.width);
      await matchVrtFrameScreenshot(`awards-profile-${name}`);
    });
  }
});

it('updates the optional artifact field when selecting Built on This', async () => {
  await renderForVRT(<RecognizeDialog open postId={`${'b'.repeat(52)}:post1`} onOpenChange={() => {}} />, {
    viewport: VRT_VIEWPORT_DESKTOP,
  });
  await page.getByText('Built on This', { exact: true }).click();
  await expect.element(page.getByLabelText('Link (optional)')).toBeVisible();
});
