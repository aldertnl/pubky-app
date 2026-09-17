import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { cn } from '@/libs/utils/utils';
import { PostActionsBarSkeleton } from '../PostActionsBar/PostActionsBar.skeleton';

// Tag-chip placeholder widths (varying) + the trailing "+" add button (square).
const TAG_CHIP_WIDTHS = ['w-24', 'w-20'];

/**
 * Placeholder for `PostInlineTagsActions` — a tags-chip row plus the actions bar.
 *
 * Tags and actions stay stacked and left-aligned at every width.
 */
export function PostInlineTagsActionsSkeleton() {
  return (
    <Container className="flex-col items-start gap-3 @max-xl/grid:mt-auto">
      <Container overrideDefaults className="flex flex-wrap items-center gap-2">
        {TAG_CHIP_WIDTHS.map((width, i) => (
          <Skeleton key={`post-tag-skeleton-${i}`} className={cn('h-8 rounded-md', width)} />
        ))}
        <Skeleton className="h-8 w-8 rounded-md" />
      </Container>
      <PostActionsBarSkeleton className="w-full shrink-0 justify-start" />
    </Container>
  );
}
