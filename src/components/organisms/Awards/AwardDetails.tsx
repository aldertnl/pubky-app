'use client';
import { useState } from 'react';
import { ArrowLeft, CircleUserRound, ExternalLink, Eye, EyeOff, Loader2 } from 'lucide-react';
import { POST_ROUTES, PROFILE_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Label } from '@/atoms/Label/Label';
import { Link } from '@/atoms/Link/Link';
import { useAwards } from '@/hooks/useAwards/useAwards';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { type AwardReceipt, badgeById, type BadgeId } from '@/libs/awards/awards';
import { isAwardVisible } from '@/libs/awards/visibility';
import type { Pubky } from '@/models/models.types';
import { AwardArt } from './AwardArt';
import styles from './Awards.module.css';

export function AwardIssuer({ award }: { award: AwardReceipt }) {
  // The automatic issuer is this Arena service, not an endorsed Pubky identity.
  return award.source === 'arena' ? <span>Pubky Arena</span> : <UserIssuer user={award.issuer} />;
}
function UserIssuer({ user }: { user: string }) {
  const { profile } = useUserProfile(user as Pubky);
  return (
    <Link href={`${PROFILE_ROUTES.PROFILE}/${user}`} className="text-[length:inherit] no-underline">
      {profile?.name || `${user.slice(0, 8)}…`}
    </Link>
  );
}
export function AwardActions({
  award,
  awards,
  back,
  details,
}: {
  award: AwardReceipt;
  awards: ReturnType<typeof useAwards>;
  back?: () => void;
  details?: () => void;
}) {
  const [confirmHide, setConfirmHide] = useState(false);
  if (!awards.isOwn && !back) return null;
  const status = awards.state?.choices[award.id];
  const worn = awards.state?.worn.includes(award.id);
  const loadingAction = awards.choiceLoading?.id === award.id ? awards.choiceLoading.action : undefined;
  const wearingLoading = loadingAction === 'wear' || loadingAction === 'remove';
  const hidingLoading = loadingAction === 'hide' || loadingAction === 'show';
  const disabled = awards.busy || awards.pending || !!loadingAction;
  return (
    <div
      className={details ? 'flex flex-wrap items-center gap-2' : 'flex flex-wrap items-center justify-between gap-3'}
    >
      {details && (
        <Button size="sm" variant="secondary" onClick={details}>
          <Eye className="size-4" aria-hidden="true" /> Details
        </Button>
      )}
      {awards.isOwn && (
        <div className={details ? 'contents' : 'flex flex-wrap gap-2'}>
          {isAwardVisible(status) && (
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled}
              aria-busy={wearingLoading}
              className="disabled:text-muted-foreground"
              onClick={() => void awards.choose(award, worn ? 'remove' : 'wear')}
            >
              <CircleUserRound className="size-4" aria-hidden="true" />
              {worn ? 'Unwear' : 'Wear'}
              {wearingLoading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            </Button>
          )}
          <Button
            size="sm"
            variant={isAwardVisible(status) ? 'ghost' : 'secondary'}
            disabled={disabled}
            aria-busy={hidingLoading}
            className="disabled:text-muted-foreground"
            onClick={() => {
              if (isAwardVisible(status)) setConfirmHide(true);
              else void awards.choose(award, 'show');
            }}
          >
            {isAwardVisible(status) ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
            {isAwardVisible(status) ? 'Hide' : 'Show in awards'}
            {hidingLoading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          </Button>
        </div>
      )}
      <div className={details ? 'contents' : 'ml-auto flex flex-wrap gap-2'}>
        {back && (
          <Button variant="ghost" size="sm" onClick={back}>
            <ArrowLeft className="size-4" aria-hidden="true" /> All awards
          </Button>
        )}
      </div>
      <Dialog open={confirmHide} onOpenChange={setConfirmHide}>
        <DialogContent className="w-xl" hiddenTitle="Hide award?">
          <DialogHeader>
            <DialogTitle>Hide ‘{badgeById(award.badge).name}’?</DialogTitle>
          </DialogHeader>
          <p className="text-base text-muted-foreground">
            This removes it from your public awards and profile across the platform. You can later choose to make it
            visible again.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmHide(false)}>
              Cancel
            </Button>
            <Button
              disabled={disabled}
              onClick={() => {
                setConfirmHide(false);
                void awards.choose(award, 'hide');
              }}
            >
              Hide
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function AwardDetails({
  badge,
  award,
  awards,
  back,
  showRecipient = false,
}: {
  badge: BadgeId;
  award?: AwardReceipt;
  awards: ReturnType<typeof useAwards>;
  back: () => void;
  showRecipient?: boolean;
}) {
  const definition = badgeById(badge);
  return (
    <div className="space-y-4">
      <Card className="items-center gap-0 rounded-md px-6 text-center">
        <AwardArt badge={badge} size={220} className={`${styles.detailArt} size-44 sm:size-52`} />
        <h3 className="mt-2 text-2xl font-semibold">{definition.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{definition.description}</p>
      </Card>
      <Container display="grid" className="gap-4">
        {!award && (
          <div className="min-w-0 text-sm wrap-break-word">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">HOW IT’S EARNED</p>
            {definition.criteria}
          </div>
        )}
        {award && (
          <div className="flex min-w-0 flex-col gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <Label asChild className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <dt>Date</dt>
              </Label>
              <dd>{new Date(award.issuedAt).toLocaleDateString()}</dd>
              <Label asChild className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <dt>Status</dt>
              </Label>
              <dd className="flex items-center gap-2 capitalize">
                {awards.state?.worn.includes(award.id)
                  ? 'Wearing'
                  : isAwardVisible(awards.state?.choices[award.id])
                    ? 'Received'
                    : 'Hidden'}
                {!isAwardVisible(awards.state?.choices[award.id]) && <EyeOff className="size-3" aria-hidden="true" />}
              </dd>
              <Label asChild className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <dt>Awarded by</dt>
              </Label>
              <dd>
                <AwardIssuer award={award} />
              </dd>
              {showRecipient && (
                <>
                  <Label asChild className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <dt>Awarded to</dt>
                  </Label>
                  <dd>
                    <UserIssuer user={award.recipient} />
                  </dd>
                </>
              )}
              <Label
                asChild
                className="self-start pt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                <dt>Why</dt>
              </Label>
              <dd className="min-w-0 wrap-break-word">
                {award.source === 'arena' ? definition.achievement : award.reason}
              </dd>
              {award.postId && (
                <>
                  <Label asChild className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <dt>Source</dt>
                  </Label>
                  <dd>
                    <Link
                      className="text-[length:inherit] no-underline"
                      href={`${POST_ROUTES.POST}/${award.postId.replace(':', '/')}`}
                    >
                      See contribution
                    </Link>
                  </dd>
                </>
              )}
            </dl>
            <div className="flex flex-wrap gap-4 text-sm empty:hidden">
              {award.artifact && (
                <Link
                  className="inline-flex items-center gap-1 text-[length:inherit] no-underline"
                  href={award.artifact}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  What they made <ExternalLink className="size-3" />
                </Link>
              )}
            </div>
          </div>
        )}
      </Container>
      {award ? (
        <div className="pt-4">
          <AwardActions award={award} awards={awards} back={back} />
        </div>
      ) : (
        <div className="flex justify-end pt-4">
          <Button variant="ghost" size="sm" onClick={back}>
            <ArrowLeft className="size-4" aria-hidden="true" /> All awards
          </Button>
        </div>
      )}
    </div>
  );
}
