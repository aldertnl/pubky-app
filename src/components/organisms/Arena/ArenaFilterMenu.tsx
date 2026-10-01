'use client';

import { type ComponentType, Fragment, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/atoms/DropdownMenu/DropdownMenu';
import { SidebarButton } from '@/atoms/SidebarButton/SidebarButton';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';

interface ArenaFilterMenuProps<T extends string> {
  label: string;
  value: T;
  options: {
    value: T;
    label: string;
    icon: ComponentType<{ className?: string }>;
    disabled?: boolean;
    nested?: boolean;
    indicators?: { label: string; icon: ComponentType<{ className?: string }> }[];
  }[];
  onChange: (value: T) => void;
  separatorAfter?: T;
  lowercase?: boolean;
  className?: string;
}

/** Collection picker presentation, composed from the same native menu and button atoms. */
export function ArenaFilterMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  separatorAfter,
  lowercase = false,
  className = '',
}: ArenaFilterMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const active = options.find((option) => option.value === value) ?? options[0];
  const ActiveIcon = active.icon;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <SidebarButton
          icon={ActiveIcon}
          className={`w-auto focus-visible:border-border focus-visible:ring-0 ${className}`}
          aria-label={`${label}: ${active.label}`}
        >
          <Typography as="span" overrideDefaults>
            {lowercase ? active.label.toLowerCase() : active.label}
          </Typography>
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </SidebarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-70" aria-label={label}>
        <Container overrideDefaults className="flex w-full flex-col gap-3">
          {options.map(
            ({ value: optionValue, label: optionLabel, icon: Icon, indicators, disabled, nested }, index) => (
              <Fragment key={optionValue}>
                <DropdownMenuItem
                  disabled={disabled}
                  aria-current={optionValue === value ? 'true' : undefined}
                  aria-description={
                    indicators ? `Available for ${indicators.map(({ label }) => label).join(' and ')}` : undefined
                  }
                  className={cn(
                    'relative w-full gap-2 p-0 font-medium text-muted-foreground',
                    nested ? 'pl-6 text-sm' : 'text-base',
                  )}
                  onSelect={() => {
                    setOpen(false);
                    if (optionValue !== value) onChange(optionValue);
                  }}
                >
                  {nested && (
                    <>
                      <span
                        aria-hidden="true"
                        className={cn(
                          'pointer-events-none absolute left-2 border-l border-border',
                          options[index - 1]?.nested ? '-top-3' : '-top-4',
                          options[index + 1]?.nested ? 'bottom-0' : 'bottom-1/2',
                        )}
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1/2 left-2 w-3 border-t border-border"
                      />
                    </>
                  )}
                  <Icon className={cn('shrink-0', nested ? 'size-3.5' : 'size-4')} aria-hidden="true" />
                  <Typography as="span" overrideDefaults className="min-w-0 flex-1 truncate">
                    {optionLabel}
                  </Typography>
                  {indicators && (
                    <span
                      className="flex shrink-0 items-center gap-1 text-muted-foreground opacity-50"
                      aria-hidden="true"
                    >
                      {indicators.map(({ label, icon: IndicatorIcon }) => (
                        <span key={label} title={`Available for ${label}`}>
                          <IndicatorIcon className="size-3.5" />
                        </span>
                      ))}
                    </span>
                  )}
                  {(indicators || optionValue === value) && (
                    <span className={cn('shrink-0', nested ? 'size-3.5' : 'size-4')} aria-hidden="true">
                      {optionValue === value && <Check className={cn('text-brand', nested ? 'size-3.5' : 'size-4')} />}
                    </span>
                  )}
                </DropdownMenuItem>
                {optionValue === separatorAfter && <DropdownMenuSeparator className="m-0 bg-border" />}
              </Fragment>
            ),
          )}
        </Container>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
