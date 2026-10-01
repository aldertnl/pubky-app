'use client';

import { type ComponentType, useState } from 'react';
import { ChevronDown, Radio } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { SidebarButton } from '@/atoms/SidebarButton/SidebarButton';
import { Typography } from '@/atoms/Typography/Typography';
import { useRadiogroupKeyboard } from '@/hooks/useRadiogroupKeyboard/useRadiogroupKeyboard';
import { cn } from '@/libs/utils/utils';
import { REACH_FILTER_META } from '@/molecules/Filters/FilterReach/FilterReach';
import { REACH, type ReachType } from '@/stores/home/home.types';

const REACH_RINGS = [
  { value: REACH.ALL, radius: 89.5, size: 'size-45' },
  { value: REACH.NETWORK, radius: 75.5, size: 'size-38' },
  { value: REACH.FOLLOWING, radius: 61.5, size: 'size-31' },
  { value: REACH.FRIENDS, radius: 47.5, size: 'size-24' },
];

interface ArenaReachPickerProps {
  value: ReachType;
  options: { value: ReachType; label: string; icon: ComponentType<{ className?: string }> }[];
  onChange: (value: ReachType) => void;
}

/** Reach rings adapted from pubky-app's visual reach selector experiment (#2261). */
export function ArenaReachPicker({ value, options, onChange }: ArenaReachPickerProps) {
  const [open, setOpen] = useState(false);
  const active = options.find((option) => option.value === value) ?? options[0];

  function selectReach(reach: ReachType) {
    setOpen(false);
    if (reach !== value) onChange(reach);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SidebarButton
          icon={active.icon}
          className="w-auto focus-visible:border-border focus-visible:ring-0"
          aria-label={`Reach: ${active.label}`}
        >
          <Typography as="span" overrideDefaults>
            {active.label.toLowerCase()}
          </Typography>
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </SidebarButton>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="mx-0 w-fit bg-background shadow-xl" aria-label="Reach">
        <Typography
          as="h3"
          overrideDefaults
          className="mb-4 flex items-center gap-2 text-base font-medium text-muted-foreground"
        >
          <Radio className="size-4 shrink-0" aria-hidden="true" />
          Reach
        </Typography>
        <ReachRings value={value} options={options} onSelect={selectReach} />
      </PopoverContent>
    </Popover>
  );
}

function ReachRings({
  value,
  options,
  onSelect,
}: Omit<ArenaReachPickerProps, 'onChange'> & { onSelect: (value: ReachType) => void }) {
  const [hovered, setHovered] = useState<ReachType>();
  const [focused, setFocused] = useState<ReachType>();
  const rings = REACH_RINGS.filter((ring) => options.some((option) => option.value === ring.value));
  const visibleValue = hovered ?? focused ?? value;
  const previewing = visibleValue !== value;
  const { listRef, handleKeyDown } = useRadiogroupKeyboard({ items: rings, onSelect: (ring) => onSelect(ring.value) });

  return (
    <div ref={listRef} role="radiogroup" aria-label="Reach" className="relative mx-auto size-45 shrink-0">
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 180 180">
        {rings.map((ring) => (
          <circle
            key={ring.value}
            cx="90"
            cy="90"
            r={ring.radius}
            data-reach-ring={ring.value}
            className={cn(
              'transition-colors',
              ring.value === value && !previewing ? 'fill-brand/10' : 'fill-transparent',
              ring.value === value
                ? previewing
                  ? 'stroke-brand/32'
                  : 'stroke-brand'
                : ring.value === visibleValue
                  ? 'stroke-foreground'
                  : 'stroke-border',
            )}
          />
        ))}
      </svg>
      {/* Smaller hit areas follow larger ones so each exposed ring remains clickable. */}
      {rings.map((ring, index) => (
        <Button
          key={ring.value}
          overrideDefaults
          type="button"
          role="radio"
          aria-label={ring.value === REACH.ALL ? 'Everyone' : REACH_FILTER_META[ring.value].label}
          aria-checked={value === ring.value}
          tabIndex={value === ring.value ? 0 : -1}
          className={cn(
            'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-transparent p-0 outline-none focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-foreground',
            ring.size,
          )}
          onClick={() => onSelect(ring.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          onMouseEnter={() => setHovered(ring.value)}
          onMouseLeave={() => setHovered(undefined)}
          onFocus={() => setFocused(ring.value)}
          onBlur={() => setFocused(undefined)}
        />
      ))}
      <Typography
        as="span"
        overrideDefaults
        data-testid="reach-ring-label"
        className={cn(
          'pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs leading-4 font-medium tracking-wider uppercase transition-colors select-none',
          previewing ? 'text-foreground' : 'text-brand',
        )}
      >
        {visibleValue === REACH.ALL ? 'Everyone' : REACH_FILTER_META[visibleValue].label}
      </Typography>
    </div>
  );
}
