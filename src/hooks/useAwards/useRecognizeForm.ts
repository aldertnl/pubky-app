'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useAwards } from './useAwards';
import { recognitionDefaults, recognitionSchema, type RecognizeFormValues } from './useRecognizeForm.types';

export function useRecognizeForm(postId: string, enabled: boolean) {
  const user = useAuthStore((state) => state.currentUserPubky);
  const awards = useAwards(user ?? undefined, enabled);
  const form = useForm<RecognizeFormValues>({
    resolver: zodResolver(recognitionSchema),
    defaultValues: recognitionDefaults,
  });
  async function submit(): Promise<boolean> {
    let success = false;
    await form.handleSubmit(
      async (recognition) => {
        if (awards.state?.issued.some((award) => award.postId === postId && award.badge === recognition.badge)) {
          form.setError('badge', {
            message: 'You already gave this award to this contribution. Choose a different award.',
          });
          return;
        }
        success = await awards.commit({
          version: 1,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          action: 'recognize',
          postId,
          recognition,
        });
        if (success) form.reset(recognitionDefaults);
      },
      (errors) => {
        const message = errors.reason?.message ?? errors.artifact?.message ?? errors.badge?.message;
        if (message) toast({ variant: 'error', description: message });
      },
    )();
    return success;
  }
  return { form, submit, awards };
}
