import type { CSSProperties } from 'react';

// Contenders follow the ellipse clockwise, starting with #1 at the upper left.
export const ARENA_PLACEMENTS = [
  { x: 29, y: 22, rotation: 0 },
  { x: 57, y: 12, rotation: -3 },
  { x: 81, y: 23, rotation: 2.4 },
  { x: 88, y: 46, rotation: -2 },
  { x: 82, y: 70, rotation: 3 },
  { x: 63, y: 87, rotation: -1.6 },
  { x: 39, y: 89, rotation: 2 },
  { x: 21, y: 81, rotation: -2.5 },
  { x: 12, y: 64, rotation: 1.8 },
  { x: 8, y: 46, rotation: -2.2 },
] as const;

/** Rotate the standings clockwise on phones, keeping their contents upright. */
export function getArenaPlacementStyle(
  { x, y }: { x: number; y: number },
  index = 0,
  count: number = ARENA_PLACEMENTS.length,
): CSSProperties {
  const compact =
    count <= 3
      ? [
          { x: 50, y: 18 },
          { x: 27, y: 82 },
          { x: 73, y: 99 },
        ][index]
      : undefined;
  return {
    left: `var(--arena-responsive-x, ${x}%)`,
    top: `var(--arena-responsive-y, ${y}%)`,
    // Compress the horizontal radius so cards stay inside the narrow viewport.
    '--arena-mobile-x': `${compact?.x ?? Math.max(27, Math.min(73, 100 - y))}%`,
    '--arena-mobile-y': `${compact?.y ?? x}%`,
  } as CSSProperties;
}
