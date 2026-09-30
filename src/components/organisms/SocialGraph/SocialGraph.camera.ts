export type GraphBounds = { left: number; right: number; top: number; bottom: number };

/** Fit painted shapes, including labels that retain a minimum screen font size. */
export function fitGraphCamera(
  width: number,
  height: number,
  boundsAtZoom: (zoom: number) => GraphBounds | null,
  padding = 32,
) {
  if (width <= padding * 2 || height <= padding * 2) return null;
  let zoom = 1;
  for (let pass = 0; pass < 24; pass++) {
    const bounds = boundsAtZoom(zoom);
    if (!bounds) return null;
    const next = Math.min(
      4,
      (width - padding * 2) / Math.max(1, bounds.right - bounds.left),
      (height - padding * 2) / Math.max(1, bounds.bottom - bounds.top),
    );
    if (Math.abs(next - zoom) < 0.0001) {
      zoom = next;
      break;
    }
    zoom = next;
  }
  const bounds = boundsAtZoom(zoom);
  if (!bounds) return null;
  return { zoom, x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
}
