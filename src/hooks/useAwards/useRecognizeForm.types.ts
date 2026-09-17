import { type Recognition, recognitionSchema } from '@/libs/awards/awards';

export { recognitionSchema };
export type RecognizeFormValues = Recognition;
export const recognitionDefaults: RecognizeFormValues = { badge: 'made-it-click', reason: '', artifact: '' };
