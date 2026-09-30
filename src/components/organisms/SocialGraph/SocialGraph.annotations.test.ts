import { beforeAll, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { ANNOTATION_LINE_HEIGHT, annotationLayout } from './SocialGraph.annotations';
import type { GraphNodeAnnotation } from './SocialGraph.types';

beforeAll(() => {
  // jsdom has no canvas. Keep layout logic real and provide deterministic text metrics.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    asOpaque<CanvasRenderingContext2D>({
      measureText: (text: string) => asOpaque<TextMetrics>({ width: Array.from(text).length * 6 }),
    }),
  );
});

const annotation: GraphNodeAnnotation = {
  rank: 4,
  title: 'The modem buzzes softly while connecting to your homeserver',
  metric: '39 points',
  stats: [{ kind: 'popular', value: '39' }],
};

describe('graph annotation layout', () => {
  it('fits a two-line compact post preview above the circle and includes it in painted bounds', () => {
    const radius = 18;
    const layout = annotationLayout(annotation, true, radius);
    expect(layout.titleLines).toHaveLength(2);
    expect(layout.titleLines[1]).toMatch(/…$/);
    expect(layout.titleWidth).toBeLessThanOrEqual(112);
    expect(layout.titleY + ANNOTATION_LINE_HEIGHT).toBeLessThan(-radius);
    expect(layout.statsY).toBeGreaterThan(radius);
    expect(-layout.top).toBeLessThanOrEqual(layout.titleY - ANNOTATION_LINE_HEIGHT / 2);
    expect(layout.bottom).toBeGreaterThanOrEqual(layout.statsY + ANNOTATION_LINE_HEIGHT / 2);
  });

  it('wraps an unbroken emoji preview without splitting a Unicode character', () => {
    const layout = annotationLayout({ ...annotation, title: '🦜'.repeat(45) }, true, 18);
    expect(layout.titleLines).toHaveLength(2);
    expect(layout.titleWidth).toBeLessThanOrEqual(112);
    expect(layout.titleLines.join('')).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
    );
  });

  it('keeps a person name below the avatar and the stats below the name', () => {
    const radius = 18;
    const layout = annotationLayout({ ...annotation, title: 'Severin Alex B' }, false, radius);
    expect(layout.titleLines).toEqual(['Severin Alex B']);
    expect(layout.titleY).toBeGreaterThan(radius);
    expect(layout.statsY).toBeGreaterThan(layout.titleY);
  });
});
