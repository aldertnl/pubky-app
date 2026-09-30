'use client';

import { useRef, useState } from 'react';
import { ChevronDown, RotateCcw, Tag as TagIcon } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Tag } from '@/atoms/Tag/Tag';
import { Typography } from '@/atoms/Typography/Typography';
import { ARENA_TOPIC_LIMIT } from '@/libs/arena/arena';
import { TagInput } from '@/molecules/TagInput/TagInput';
import type { TagInputHandle } from '@/molecules/TagInput/TagInput.types';
import { ArenaRankedTag } from './ArenaRankedTag';
import type { ArenaTagPickerProps } from './ArenaTagPicker.types';

const TOPIC_COLUMN_SIZE = Math.ceil(ARENA_TOPIC_LIMIT / 2);

export function ArenaTagPicker({ topic, topics, timeframeLabel, onTopic }: ArenaTagPickerProps) {
  const isAll = topic === null;
  const hasSelection = isAll || !!topic;
  const [open, setOpen] = useState(false);
  const inputRef = useRef<TagInputHandle>(null);
  const topTopics = topics.slice(0, ARENA_TOPIC_LIMIT);
  const topicColumns = [topTopics.slice(0, TOPIC_COLUMN_SIZE), topTopics.slice(TOPIC_COLUMN_SIZE)];

  function selectTag(tag: Parameters<ArenaTagPickerProps['onTopic']>[0]) {
    onTopic(tag);
    setOpen(false);
  }

  return (
    <span data-arena-tag-picker className="relative inline-flex align-middle">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            overrideDefaults={hasSelection}
            variant="secondary"
            size="sm"
            className={
              hasSelection
                ? 'relative h-8 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                : 'text-xs'
            }
            aria-label="Choose tag"
          >
            {isAll ? (
              <Tag name="all" className="pr-9" style={{ backgroundColor: '#000', border: '1px solid var(--border)' }} />
            ) : topic ? (
              <Tag name={topic} maxLabelLength={14} className="pr-9" />
            ) : (
              <>
                <TagIcon className="size-4" aria-hidden="true" />
                tag
              </>
            )}
            <ChevronDown
              className={hasSelection ? 'pointer-events-none absolute top-2.5 right-2.5 size-3.5' : 'size-3.5'}
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="mx-0 max-h-[calc(100vh-2rem)] w-fit max-w-[calc(100vw-2rem)] overflow-y-auto bg-background shadow-xl"
          aria-label="Choose tag"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <div className="mb-3 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Typography as="h3" overrideDefaults className="text-base leading-6 font-medium text-muted-foreground">
                Top #{ARENA_TOPIC_LIMIT} tags {timeframeLabel.toLowerCase()}
              </Typography>
            </div>
            <div className="grid w-fit max-w-full grid-cols-[max-content_max-content] gap-x-4 gap-y-6">
              {topicColumns.map((column, columnIndex) => (
                <ol
                  key={columnIndex}
                  start={columnIndex * TOPIC_COLUMN_SIZE + 1}
                  className="m-0 list-none space-y-2 p-0"
                  aria-label={`Top tags ${columnIndex + 1}`}
                >
                  {column.map((tag, rowIndex) => {
                    const index = columnIndex * TOPIC_COLUMN_SIZE + rowIndex;
                    const rank = index + 1;
                    const selected = tag.label === topic;
                    return (
                      <li key={tag.label} className="list-none" aria-label={`Rank ${rank}: ${tag.label}`}>
                        <ArenaRankedTag
                          label={tag.label}
                          count={tag.tagged_count}
                          rank={rank}
                          selected={selected}
                          onClick={() => selectTag(tag.label)}
                        />
                      </li>
                    );
                  })}
                </ol>
              ))}
              {/* Exclude the input's intrinsic width so the tags size this column. */}
              <div className="min-w-0 [contain:inline-size]">
                <TagInput
                  ref={inputRef}
                  aria-label="Tag"
                  onTagAdd={(tag) => selectTag(tag.trim().toLowerCase())}
                  placeholder="enter tag"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0 gap-2 self-center justify-self-end"
                aria-label="Reset tag filter to all"
                onClick={() => selectTag(null)}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Reset to &apos;all&apos;
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}
