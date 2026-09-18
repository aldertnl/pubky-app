'use client';

import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileController } from '@/controllers/file/file';
import { getAttachmentPreviewUrl } from '@/libs/file/attachmentPreviewUrl';
import { Logger } from '@/libs/logger/logger';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { FileVariant } from '@/services/nexus/file/file.types';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';

export type ArenaPostImage = {
  src: string;
  alt: string;
};

type ArenaImageInput = {
  id: string;
  attachments?: string[];
};

type NormalizedArenaImageInput = {
  id: string;
  attachments: string[];
};

const EMPTY_IMAGES = new Map<string, ArenaPostImage>();

function imageFromLocalAttachment(attachment: AttachmentConstructed): ArenaPostImage | null {
  if (!attachment.type.startsWith('image')) return null;
  const src = getAttachmentPreviewUrl(attachment);
  return src ? { src, alt: attachment.name } : null;
}

export function useArenaPostImages(ideas: ArenaImageInput[]) {
  const localPostAttachments = useLocalFilesStore((state) => state.posts);
  const inputs = useMemo<NormalizedArenaImageInput[]>(
    () => ideas.map(({ id, attachments }) => ({ id, attachments: attachments ?? [] })),
    [ideas],
  );
  const inputsKey = useMemo(() => JSON.stringify(inputs), [inputs]);
  const result = useLiveQuery(
    async () => {
      const normalizedInputs: NormalizedArenaImageInput[] = JSON.parse(inputsKey);
      const remoteAttachmentUris = [
        ...new Set(
          normalizedInputs.flatMap(({ id, attachments }) =>
            localPostAttachments[id]?.some((attachment) => attachment.type.startsWith('image')) ? [] : attachments,
          ),
        ),
      ];
      const remoteFiles = remoteAttachmentUris.length
        ? await FileController.getMetadata({ fileAttachments: remoteAttachmentUris })
        : [];
      const remoteFilesById = new Map(remoteFiles.map((file) => [file.id, file]));
      const images = new Map<string, ArenaPostImage>();
      const missingFileUris = remoteAttachmentUris.filter((uri) => {
        const fileId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES });
        return fileId !== null && !remoteFilesById.has(fileId);
      });

      for (const { id, attachments } of normalizedInputs) {
        const localImage = localPostAttachments[id]
          ?.map(imageFromLocalAttachment)
          .find((image): image is ArenaPostImage => image !== null);
        if (localImage) {
          images.set(id, localImage);
          continue;
        }

        for (const uri of attachments) {
          const fileId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES });
          const file = fileId ? remoteFilesById.get(fileId) : undefined;
          if (!file?.content_type.startsWith('image')) continue;
          const attachment: AttachmentConstructed = {
            type: file.content_type,
            name: file.name,
            urls: {
              main: FileController.getFileUrl({ fileId: file.id, variant: FileVariant.MAIN }),
              feed: FileController.getFileUrl({ fileId: file.id, variant: FileVariant.FEED }),
            },
          };
          const image = imageFromLocalAttachment(attachment);
          if (image) images.set(id, image);
          break;
        }
      }

      return { images, missingFileUris };
    },
    [inputsKey, localPostAttachments],
    { images: EMPTY_IMAGES, missingFileUris: [] as string[] },
  );

  useEffect(() => {
    if (!result.missingFileUris.length) return;
    void FileController.fetchFiles({ fileUris: result.missingFileUris }).catch((error) => {
      Logger.error('[useArenaPostImages] Could not fetch contender attachments', {
        fileUris: result.missingFileUris,
        error,
      });
    });
  }, [result.missingFileUris]);

  return result.images;
}
