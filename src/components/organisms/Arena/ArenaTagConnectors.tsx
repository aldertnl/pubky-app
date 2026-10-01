'use client';

import { type RefObject, useEffect, useId, useState } from 'react';
import { generateRandomColor } from '@/libs/utils/utils';
import styles from './Arena.module.css';

type Connection = {
  id: string;
  d: string;
  pulse: boolean;
  width: number;
  height: number;
  radius: number;
  transform: string;
};

export function ArenaTagConnectors({ stageRef, topic }: { stageRef: RefObject<HTMLDivElement | null>; topic: string }) {
  const [paths, setPaths] = useState<Connection[]>([]);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const maskId = useId();

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let frame = 0;
    let followUntil = 0;
    let initialPulseIds: Set<string> | null = null;
    const observed = new Set<HTMLElement>();
    const geometryStyles = new WeakMap<HTMLElement, string>();
    const dimensions = new WeakMap<HTMLElement, { width: number; height: number; radius: number }>();
    let tag: HTMLElement | null = null;
    let floor: HTMLElement | null = null;
    let cards: HTMLElement[] = [];
    const cardSelector = '[data-arena-post], [data-arena-person], [data-arena-tag-node]';
    const cardId = (card: HTMLElement) =>
      card.dataset.arenaPost ?? card.dataset.arenaPerson ?? card.dataset.arenaTagNode!;
    const geometryStyle = ({ style }: HTMLElement) =>
      [
        style.transform,
        style.translate,
        style.rotate,
        style.scale,
        style.zoom,
        style.left,
        style.top,
        style.width,
        style.height,
        style.getPropertyValue('--arena-post-scale'),
        style.getPropertyValue('--arena-post-rotation'),
        style.getPropertyValue('--arena-tag-scale'),
        style.getPropertyValue('--arena-tag-rotation'),
      ].join('|');
    const syncElements = () => {
      tag = stage.querySelector<HTMLElement>('[data-arena-selected-topic]');
      floor = stage.querySelector<HTMLElement>('[data-arena-floor]');
      cards = [...stage.querySelectorAll<HTMLElement>(cardSelector)];
      const elements = new Set<HTMLElement>([
        stage,
        ...cards,
        ...cards.map((card) => card.parentElement!),
        ...(floor ? [floor] : []),
        ...(tag ? [tag, tag.parentElement!] : []),
      ]);
      geometry.disconnect();
      for (const element of observed) {
        if (!elements.has(element)) {
          resize.unobserve(element);
          observed.delete(element);
        }
      }
      for (const element of elements) {
        if (!observed.has(element)) {
          resize.observe(element);
          observed.add(element);
        }
        geometryStyles.set(element, geometryStyle(element));
        geometry.observe(element, {
          attributes: true,
          attributeFilter: ['style', 'data-arena-spotlight', 'data-arena-paused'],
        });
      }
      updateSpotlight();
    };
    const updateSpotlight = () => {
      const card = stage.querySelector<HTMLElement>(
        '[data-arena-spotlight] [data-arena-post], [data-arena-spotlight] [data-arena-person]',
      );
      setSpotlightId(card ? cardId(card) : null);
    };

    const measure = () => {
      frame = 0;
      if (stage.hasAttribute('data-arena-paused')) return;
      const origin = stage.getBoundingClientRect();

      const next: Connection[] = [];
      // Tablet grids omit connections; phones use the vertical Arena.
      if (tag && floor && window.matchMedia('(min-width: 901px), (max-width: 639px)').matches) {
        const source = tag.getBoundingClientRect();
        const floorBox = floor.getBoundingClientRect();
        if (source.width && source.height && floorBox.width) {
          const x = source.left + source.width / 2;
          const y = source.top + source.height / 2;
          // The selected tag sits at the center of the Arena; connections radiate outward.
          const startX = x - origin.left;
          const startY = y - origin.top;
          if (!initialPulseIds && cards.length) {
            initialPulseIds = new Set(cards.map(cardId));
          }
          for (const card of cards) {
            const portrait = card.querySelector<HTMLElement>('[data-arena-person-portrait]');
            const target = (portrait ?? card).getBoundingClientRect();
            if (!target.width || !target.height) continue;
            const id = cardId(card);
            const centerX = target.left + target.width / 2 - origin.left;
            const centerY = target.top + target.height / 2 - origin.top;
            const computed = getComputedStyle(card);
            // People have transparent space around their portraits and stats. Only mask
            // the visible circle, using its rendered size (including the parent's scale).
            let size = portrait
              ? { width: target.width, height: target.height, radius: target.width / 2 }
              : dimensions.get(card);
            if (!size) {
              size = {
                width: parseFloat(computed.width),
                height: parseFloat(computed.height),
                radius: parseFloat(computed.borderTopLeftRadius),
              };
              dimensions.set(card, size);
            }
            const matrix = new DOMMatrixReadOnly(
              portrait || computed.transform === 'none' ? undefined : computed.transform,
            );
            next.push({
              id,
              d: `M ${startX} ${startY} L ${centerX} ${centerY}`,
              pulse: initialPulseIds?.has(id) ?? false,
              ...size,
              // Preserve the card's rotation and scale; its center also follows hover/layout translation.
              transform: `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${centerX} ${centerY})`,
            });
          }
        }
      }
      setPaths((previous) =>
        previous.length === next.length &&
        previous.every((path, index) =>
          (Object.keys(path) as (keyof Connection)[]).every((key) => path[key] === next[index][key]),
        )
          ? previous
          : next,
      );
      if (performance.now() < followUntil) frame = requestAnimationFrame(measure);
    };
    const schedule = (followMotion = false) => {
      if (stage.hasAttribute('data-arena-paused')) {
        cancelAnimationFrame(frame);
        frame = 0;
        followUntil = 0;
        return;
      }
      // Follow geometry transitions only; opacity, glow and SVG changes do not restart this window.
      if (followMotion) followUntil = performance.now() + 300;
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver((entries) => {
      for (const entry of entries) dimensions.delete(entry.target as HTMLElement);
      schedule();
    });
    const geometry = new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName === 'data-arena-spotlight') {
          updateSpotlight();
        } else if (record.attributeName === 'data-arena-paused') {
          schedule();
        } else {
          const element = record.target as HTMLElement;
          const next = geometryStyle(element);
          if (geometryStyles.get(element) !== next) {
            geometryStyles.set(element, next);
            dimensions.delete(element);
            schedule(true);
          }
        }
      }
    });
    const content = new MutationObserver((records) => {
      const selector = `${cardSelector}, [data-arena-floor], [data-arena-selected-topic]`;
      const changed = records.some((record) =>
        [...record.addedNodes, ...record.removedNodes].some(
          (node) => node instanceof HTMLElement && (node.matches(selector) || node.querySelector(selector)),
        ),
      );
      if (changed) {
        syncElements();
        schedule(true);
      }
    });
    content.observe(stage, { childList: true, subtree: true });
    const onTransition = (event: TransitionEvent) => {
      if (
        observed.has(event.target as HTMLElement) &&
        ['transform', 'translate', 'rotate', 'scale'].includes(event.propertyName)
      ) {
        schedule(true);
      }
    };
    const onResize = () => {
      for (const card of cards) dimensions.delete(card);
      schedule();
    };
    stage.addEventListener('transitionrun', onTransition);
    window.addEventListener('resize', onResize);
    syncElements();
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      geometry.disconnect();
      content.disconnect();
      stage.removeEventListener('transitionrun', onTransition);
      window.removeEventListener('resize', onResize);
    };
  }, [stageRef]);

  return (
    // The opaque mask keeps connections out of card surfaces, even at lower rank opacity.
    <svg
      className={styles.tagConnectors}
      aria-hidden="true"
      data-testid="arena-tag-connectors"
      style={{ color: generateRandomColor(topic) }}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
          <rect width="100%" height="100%" fill="white" />
          {paths.map(({ id, width, height, radius, transform }) => (
            <rect
              key={id}
              x={-width / 2}
              y={-height / 2}
              width={width}
              height={height}
              rx={radius}
              transform={transform}
              fill="black"
            />
          ))}
        </mask>
      </defs>
      <g mask={`url(#${maskId})`} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
        {paths.map(({ id, d, pulse }, index) => (
          <g key={id} data-arena-connection={id} data-spotlight={id === spotlightId || undefined}>
            <path className={styles.connectionLine} d={d} />
            {pulse && (
              <path
                className={styles.connectionPulse}
                d={d}
                pathLength="1"
                strokeDasharray="0.12 1"
                style={{ animationDelay: `${Math.min(index, 5) * 18}ms` }}
              />
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}
