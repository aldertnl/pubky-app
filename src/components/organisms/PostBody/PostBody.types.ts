import type { PostDetailsModel } from '@/models/post/details/postDetails';
import type { AttachmentConstructed } from '../PostAttachments/PostAttachments.types';

export interface PostBodyProps {
  /** Body text — a normal post's `content`, or a lock teaser's `content.teaser_description`. */
  content: string;
  /** Render the entire body on surfaces that explicitly request it. */
  showFullContent?: boolean;
  attachments: PostDetailsModel['attachments'];
  localAttachments: AttachmentConstructed[] | undefined;
  textClassName?: string;
  /** Forwarded to `PostAttachments`. */
  mediaVariant?: 'default' | 'list' | 'cards';
}
