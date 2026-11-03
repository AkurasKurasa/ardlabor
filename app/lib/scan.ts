import type { GapReading, Pt } from "@core/gapscan";
import type { Measurement, Range } from "@core/CabinetCore";

// Only type imports from @core here, so core/tests can load this file straight from node.

/** Phone photos are 12 MP and up; measuring at ~2000 px keeps the gaps several pixels wide but stays fast in a browser. */
export const MAX_SIDE_PX = 2000;

/** Door sizes the app accepts, in mm. Below 50 the gap search would run off the door; above 3000 it isn't a cabinet. */
export const DOOR_MM: Range = [50, 3000];

export function fitSize(width: number, height: number, maxSide = MAX_SIDE_PX): { width: number; height: number } {
  if (!(width > 0 && height > 0)) throw new Error(`bad image size ${width}×${height}`);
  const s = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * s), height: Math.round(height * s) };
}

/** Starting crosses for a fresh photo: a rectangle inset from the edges, ready to be dragged onto the door. */
export function defaultCorners(width: number, height: number, inset = 0.2): Pt[] {
  const x0 = width * inset, x1 = width * (1 - inset), y0 = height * inset, y1 = height * (1 - inset);
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

export function validDoorMm(mm: number): boolean {
  return Number.isFinite(mm) && mm >= DOOR_MM[0] && mm <= DOOR_MM[1];
}

export function toMeasurements(readings: Record<string, GapReading>, target: Range): Measurement[] {
  return Object.entries(readings).map(([id, r]) => ({
    id, mm: r.mm, target, by: "gap", samples: r.n, spread_mm: r.spread_mm ?? undefined,
  }));
}

/** Keep the newest value for each gap; a close-up shot may only see some of the edges. */
export function mergeMeasurements(old: Measurement[], fresh: Measurement[]): Measurement[] {
  const map = new Map(old.map((m) => [m.id, m]));
  for (const m of fresh) if (m.mm !== null) map.set(m.id, m);
  return [...map.values()];
}
