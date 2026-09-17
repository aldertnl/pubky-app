'use client';
import { Loader2 } from 'lucide-react';
import { Controller, useWatch } from 'react-hook-form';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/atoms/Tooltip/Tooltip';
import { useRecognizeForm } from '@/hooks/useAwards/useRecognizeForm';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { badges } from '@/libs/awards/awards';
import { parseCompositeId } from '@/models/models.utils';
import { AwardArt } from './AwardArt';
import styles from './Awards.module.css';

export function RecognizeDialog({
  postId,
  open,
  onOpenChange,
}: {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { form, submit, awards } = useRecognizeForm(postId, open);
  const { profile: authorProfile } = useUserProfile(parseCompositeId(postId).pubky);
  const selected = useWatch({ control: form.control, name: 'badge' });
  const submitting = awards.busy || form.formState.isSubmitting;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full outline-none sm:w-[620px]" avoidKeyboard aria-describedby={undefined}>
        <div className="pr-6">
          <DialogTitle>Recognize contribution</DialogTitle>
        </div>
        <form
          className="space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await submit()) onOpenChange(false);
          }}
        >
          <Controller
            control={form.control}
            name="badge"
            render={({ field }) => (
              <fieldset>
                <legend className="sr-only">Choose an award</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {badges
                    .filter((badge) => badge.source === 'user')
                    .map((badge) => (
                      <Tooltip key={badge.id}>
                        <TooltipTrigger asChild onFocus={(event) => event.preventDefault()}>
                          <label
                            className={`${styles.recognitionCard} flex h-full cursor-pointer flex-col items-center rounded-md border p-3 text-center text-xs transition-colors has-[:focus-visible]:border-ring ${field.value === badge.id ? 'border-brand/60 bg-brand/[0.16]' : 'border-transparent bg-card text-card-foreground hover:bg-accent'}`}
                          >
                            <input
                              className="sr-only"
                              type="radio"
                              aria-label={badge.name}
                              value={badge.id}
                              checked={field.value === badge.id}
                              onChange={() => field.onChange(badge.id)}
                              onBlur={field.onBlur}
                              name={field.name}
                            />
                            <AwardArt badge={badge.id} size={76} className="rounded-lg" />
                            <span className="mt-2 text-center text-base font-semibold">{badge.name}</span>
                          </label>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          className="max-w-64 bg-accent text-foreground [&_svg]:fill-accent"
                        >
                          {badge.giverDescription}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                </div>
                {form.formState.errors.badge && (
                  <p role="alert" className="mt-2 text-xs text-destructive">
                    {form.formState.errors.badge.message}
                  </p>
                )}
              </fieldset>
            )}
          />
          <Controller
            control={form.control}
            name="reason"
            render={({ field, fieldState }) => (
              <div>
                <Label
                  className="mb-2 block text-xs font-medium tracking-wide text-muted-foreground uppercase"
                  htmlFor="award-reason"
                >
                  Why it mattered
                </Label>
                <Textarea
                  {...field}
                  id="award-reason"
                  maxLength={500}
                  rows={3}
                  placeholder={`Tell ${authorProfile?.name || 'them'} how this contribution was of value to you`}
                  className="min-h-24 resize-y border-dashed p-3 text-sm"
                  aria-invalid={!!fieldState.error}
                  aria-describedby="award-reason-error"
                />
                <p id="award-reason-error" className="text-xs text-destructive">
                  {fieldState.error?.message}
                </p>
              </div>
            )}
          />
          {selected === 'built-on-this' && (
            <Controller
              control={form.control}
              name="artifact"
              render={({ field, fieldState }) => (
                <div>
                  <Label
                    className="mb-2 block text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    htmlFor="award-artifact"
                  >
                    Link (optional)
                  </Label>
                  <Input
                    {...field}
                    type="url"
                    id="award-artifact"
                    placeholder="https://…"
                    className="text-sm"
                    aria-invalid={!!fieldState.error}
                    aria-describedby="award-artifact-error"
                  />
                  <p id="award-artifact-error" className="text-xs text-destructive">
                    {fieldState.error?.message}
                  </p>
                </div>
              )}
            />
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            {authorProfile?.name || 'The recipient'} chooses whether to wear your award or hide it from their awards.{' '}
            {awards.state?.remaining === 0
              ? 'You’ve given all three recognition awards this week. Your allowance resets Monday at 00:00 UTC.'
              : 'You can hand out three recognition awards per week.'}{' '}
            Your award and reason are public.
          </p>
          <Button
            type="submit"
            className="w-full"
            aria-busy={submitting || !awards.state}
            aria-label={submitting ? 'Sending recognition' : 'Send Award'}
            disabled={submitting || awards.pending || !awards.state || awards.state.remaining === 0}
          >
            {submitting || !awards.state ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              'Send Award'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
