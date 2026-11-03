import type { V3 } from "./store";
import { orderCorners, type Pt } from "@core/gapscan";

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3) => Math.sqrt(dot(a, a));
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));

/**
 * Put world corners in door order (top-left, top-right, bottom-right, bottom-left) using where they
 * were tapped on screen, which is the same ordering rule the gap measurement uses.
 */
export function orderWorldCorners(world: V3[], screen: Pt[]): { world: V3[]; screen: Pt[] } {
  const ordered = orderCorners(screen);
  const idx = ordered.map((p) => screen.indexOf(p));
  return { world: idx.map((i) => world[i]), screen: ordered };
}

/** Door width and height in mm from ordered world corners (metres). */
export function doorSizeMm(c: V3[]): { w: number; h: number } {
  const w = (len(sub(c[1], c[0])) + len(sub(c[2], c[3]))) / 2;
  const h = (len(sub(c[3], c[0])) + len(sub(c[2], c[1]))) / 2;
  return { w: Math.round(w * 1000), h: Math.round(h * 1000) };
}

/** World point for door coordinates in mm (0,0 = top-left), interpolated across the 4 corners. */
export function doorPoint(c: V3[], uMm: number, vMm: number, wMm: number, hMm: number, outM = 0, toward?: V3): V3 {
  const u = uMm / wMm, v = vMm / hMm;
  const top = add(mul(c[0], 1 - u), mul(c[1], u));
  const bot = add(mul(c[3], 1 - u), mul(c[2], u));
  let p = add(mul(top, 1 - v), mul(bot, v));
  if (outM) {
    let n = norm(cross(sub(c[1], c[0]), sub(c[3], c[0])));
    if (toward && dot(n, sub(toward, p)) < 0) n = mul(n, -1);
    p = add(p, mul(n, outM));
  }
  return p;
}
