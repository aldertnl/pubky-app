let cancelActiveScroll: (() => void) | undefined;

/** Scroll Arena click targets consistently, respecting their sticky-header offset. */
export function scrollToArenaTarget(target: HTMLElement | null) {
  cancelActiveScroll?.();
  if (!target) return;
  target.focus({ preventScroll: true });
  const from = window.scrollY;
  const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const to = Math.max(0, from + target.getBoundingClientRect().top - margin);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.scrollTo({ top: to, behavior: 'instant' });
    return;
  }
  const started = performance.now();
  let frame: number;
  const cancel = () => {
    cancelAnimationFrame(frame);
    if (cancelActiveScroll === cancel) cancelActiveScroll = undefined;
  };
  const animate = (now: number) => {
    const progress = Math.min(1, (now - started) / 200);
    const eased = progress * progress * (3 - 2 * progress);
    window.scrollTo({ top: from + (to - from) * eased, behavior: 'instant' });
    if (progress < 1) frame = requestAnimationFrame(animate);
    else if (cancelActiveScroll === cancel) cancelActiveScroll = undefined;
  };
  frame = requestAnimationFrame(animate);
  cancelActiveScroll = cancel;
  return cancel;
}
