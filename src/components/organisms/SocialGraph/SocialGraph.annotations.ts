import { graphTextWidth, statIconSprite } from './SocialGraph.sprites';
import type { GraphNodeAnnotation } from './SocialGraph.types';

const RANK_FONT = '700 12px "Inter Tight", sans-serif';
const STAT_FONT = RANK_FONT;
const FALLBACK_FONT = '500 12px "Inter Tight", sans-serif';
const ICON_SIZE = 12;
const ICON_GAP = 2;
const STAT_GAP = 8;
export const ANNOTATION_TITLE_FONT = '600 12px "Inter Tight", sans-serif';
export const ANNOTATION_LINE_HEIGHT = 16;
const POST_TITLE_WIDTH = 112;
const TITLE_GAP = 15;

function postTitleLines(title: string): string[] {
  let remaining = Array.from(title.replace(/\s+/g, ' ').trim());
  const lines: string[] = [];
  for (let line = 0; line < 2 && remaining.length; line++) {
    const text = remaining.join('');
    if (graphTextWidth(ANNOTATION_TITLE_FONT, text) <= POST_TITLE_WIDTH) {
      lines.push(text);
      break;
    }
    const suffix = line === 1 ? '…' : '';
    let end = 0;
    while (
      end < remaining.length &&
      graphTextWidth(ANNOTATION_TITLE_FONT, remaining.slice(0, end + 1).join('') + suffix) <= POST_TITLE_WIDTH
    ) {
      end++;
    }
    end = Math.max(1, end);
    if (line === 0) {
      const space = remaining.slice(0, end + 1).lastIndexOf(' ');
      if (space > 0) end = space;
    }
    lines.push(remaining.slice(0, end).join('').trimEnd() + suffix);
    remaining = remaining.slice(end);
    if (remaining[0] === ' ') remaining.shift();
  }
  return lines.length ? lines : [''];
}

/** Keep painting, hit targets, collision spacing, and camera bounds aligned. */
export function annotationLayout(annotation: GraphNodeAnnotation, post: boolean, radius: number) {
  const titleLines = post
    ? postTitleLines(annotation.title)
    : [annotation.title.length > 21 ? `${annotation.title.slice(0, 20)}…` : annotation.title];
  const titleY = post ? -radius - TITLE_GAP - (titleLines.length - 1) * ANNOTATION_LINE_HEIGHT : radius + TITLE_GAP;
  const titleWidth = Math.max(...titleLines.map((line) => graphTextWidth(ANNOTATION_TITLE_FONT, line)));
  const statsY = radius + TITLE_GAP + (post ? 0 : ANNOTATION_LINE_HEIGHT);
  const statsWidth = annotationRowWidth(annotation);
  return {
    titleLines,
    titleY,
    titleWidth,
    statsY,
    statsWidth,
    width: Math.max(titleWidth, statsWidth),
    top: Math.max(radius, -titleY + ANNOTATION_LINE_HEIGHT / 2),
    bottom: statsY + ANNOTATION_LINE_HEIGHT / 2,
  };
}

/** Shared geometry for visible stats, collision spacing, and pointer targets. */
export function annotationRowWidth(annotation: GraphNodeAnnotation): number {
  const rankWidth = graphTextWidth(RANK_FONT, `#${annotation.rank}`);
  if (!annotation.stats) {
    return rankWidth + graphTextWidth(FALLBACK_FONT, ` | ${annotation.metric}`);
  }
  return (
    rankWidth +
    annotation.stats.reduce(
      (width, stat) => width + STAT_GAP + ICON_SIZE + ICON_GAP + graphTextWidth(STAT_FONT, stat.value),
      0,
    )
  );
}

export function paintAnnotationStats(
  ctx: CanvasRenderingContext2D,
  annotation: GraphNodeAnnotation,
  x: number,
  y: number,
  rankColor: string,
  statColor: string,
) {
  let left = x - annotationRowWidth(annotation) / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const rank = `#${annotation.rank}`;
  ctx.font = RANK_FONT;
  ctx.fillStyle = rankColor;
  ctx.fillText(rank, left, y);
  left += graphTextWidth(RANK_FONT, rank);
  ctx.fillStyle = statColor;
  if (!annotation.stats) {
    ctx.font = FALLBACK_FONT;
    ctx.fillText(` | ${annotation.metric}`, left, y);
    return;
  }
  ctx.font = STAT_FONT;
  for (const stat of annotation.stats) {
    left += STAT_GAP;
    const icon = statIconSprite(stat.kind, statColor);
    if (icon) ctx.drawImage(icon, left, y - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
    left += ICON_SIZE + ICON_GAP;
    ctx.fillText(stat.value, left, y);
    left += graphTextWidth(STAT_FONT, stat.value);
  }
}
