/**
 * Gap measurement, ported from tools/scan_bake/gapscan.py so it runs on the phone.
 *
 * Instead of warping the whole photo, it maps door coordinates in millimetres straight to
 * photo pixels with a homography and samples only the thin strips across each door edge.
 */

export interface Gray {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray | Float32Array;
}
export type Pt = [number, number];
export type HingeSide = "left" | "right";
export interface GapReading {
  mm: number | null;
  spread_mm: number | null;
  n: number;
}

export const PX_PER_MM = 4.0;
export const SEARCH_OUT_MM = 14.0;
export const INSIDE_MM = 4.0;
export const BAND_MM = 6.0;
export const MIN_CONTRAST = 12.0;

export const MEASUREMENTS: Record<string, ["top" | "bottom" | "handle", [number, number]]> = {
  gap_top_hinge: ["top", [0.06, 0.2]],
  gap_top_handle: ["top", [0.8, 0.94]],
  gap_side_top: ["handle", [0.06, 0.2]],
  gap_side_bottom: ["handle", [0.8, 0.94]],
  gap_bottom_hinge: ["bottom", [0.06, 0.2]],
  gap_bottom_handle: ["bottom", [0.8, 0.94]],
};

// ---------- geometry ----------

/** Top-left, top-right, bottom-right, bottom-left (same rule as the Python tool). */
export function orderCorners(pts: Pt[]): Pt[] {
  if (pts.length !== 4) throw new Error("need 4 corners");
  const s = pts.map((p) => p[0] + p[1]);
  const d = pts.map((p) => p[1] - p[0]);
  const argmin = (a: number[]) => a.indexOf(Math.min(...a));
  const argmax = (a: number[]) => a.indexOf(Math.max(...a));
  return [pts[argmin(s)], pts[argmin(d)], pts[argmax(s)], pts[argmax(d)]];
}

/** 3x3 homography (row-major, h33 = 1) mapping src[i] -> dst[i]. */
export function homography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  return [...h, 1];
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error("corners are degenerate");
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

export function applyH(H: number[], x: number, y: number): Pt {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

function bilinear(img: Gray, x: number, y: number): number {
  const { width: W, height: H, data } = img;
  if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return NaN; // off the photo: profile is skipped
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
  const fx = x - x0, fy = y - y0;
  const a = data[y0 * W + x0], b = data[y0 * W + x1], c = data[y1 * W + x0], d = data[y1 * W + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/** Maps door millimetres (0,0 = top-left of the door face) to photo pixels. */
export function doorToImage(corners: Pt[], wMm: number, hMm: number): number[] {
  return homography([[0, 0], [wMm, 0], [wMm, hMm], [0, hMm]], orderCorners(corners));
}

// ---------- profiles ----------

/** Brightness profile from INSIDE_MM inside the door, running outward across one edge. */
export function edgeProfile(img: Gray, H: number[], edge: "top" | "bottom" | "handle", alongMm: number,
  wMm: number, hMm: number, side: HingeSide): { p: Float32Array; nIn: number } {
  const step = 1 / PX_PER_MM;
  const nIn = Math.round(INSIDE_MM * PX_PER_MM);
  const nOut = Math.round(SEARCH_OUT_MM * PX_PER_MM);
  const half = Math.round((BAND_MM * PX_PER_MM) / 2);
  const p = new Float32Array(nIn + nOut);
  // position i: offset (mm) from the edge, negative = inside the door
  for (let i = 0; i < nIn + nOut; i++) {
    const off = (i - nIn + 0.5) * step;
    let acc = 0;
    for (let j = -half; j < half; j++) {
      const t = (j + 0.5) * step;
      let u: number, v: number;
      if (edge === "top" || edge === "bottom") {
        u = (side === "left" ? alongMm : wMm - alongMm) + t;
        v = edge === "top" ? -off : hMm + off;
      } else {
        v = alongMm + t;
        u = side === "left" ? wMm + off : -off;
      }
      const [x, y] = applyH(H, u, v);
      acc += bilinear(img, x - 0.5, y - 0.5);
    }
    p[i] = acc / (2 * half);
  }
  return { p, nIn };
}

function median(a: number[] | Float32Array): number {
  const s = Array.from(a).sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function blur3(p: Float32Array): Float32Array {
  // OpenCV GaussianBlur with ksize 3 => sigma 0.8, reflect-101 borders
  const s = 0.8;
  const w0 = 1, w1 = Math.exp(-1 / (2 * s * s));
  const n = w0 + 2 * w1;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) {
    const l = p[i === 0 ? 1 : i - 1], r = p[i === p.length - 1 ? p.length - 2 : i + 1];
    out[i] = (p[i] * w0 + (l + r) * w1) / n;
  }
  return out;
}

/** Width in mm of the dark band nearest the door edge, or null if there is no clear gap. */
export function gapFromProfile(raw: Float32Array, nIn: number): number | null {
  if (raw.length < nIn + 8) return null;
  const p = blur3(raw);
  const insideRef = median(p.subarray(0, Math.max(2, nIn - Math.round(PX_PER_MM))));
  const outsideRef = median(p.subarray(p.length - Math.round(3 * PX_PER_MM)));
  const lo = Math.max(0, nIn - Math.round(2 * PX_PER_MM));
  let iMin = lo;
  for (let i = lo; i < p.length; i++) if (p[i] < p[iMin]) iMin = i;
  const mn = p[iMin];
  const ref = Math.min(insideRef, outsideRef);
  if (ref - mn < MIN_CONTRAST) return null;
  const t = mn + 0.5 * (ref - mn);
  let a = iMin, b = iMin;
  while (a > 0 && p[a - 1] < t) a--;
  while (b < p.length - 1 && p[b + 1] < t) b++;
  if (b >= p.length - 2) return null;
  const left = a > 0 && p[a - 1] !== p[a] ? a - 1 + (p[a - 1] - t) / (p[a - 1] - p[a]) : a;
  const right = p[b] !== p[b + 1] ? b + (p[b] - t) / (p[b] - p[b + 1]) : b;
  return (right - left) / PX_PER_MM;
}

// ---------- main ----------

export function measureGaps(img: Gray, corners: Pt[], wMm: number, hMm: number,
  side: HingeSide = "left", samples = 7): Record<string, GapReading> {
  const H = doorToImage(corners, wMm, hMm);
  const out: Record<string, GapReading> = {};
  for (const [id, [edge, [f0, f1]]] of Object.entries(MEASUREMENTS)) {
    const length = edge === "handle" ? hMm : wMm;
    const vals: number[] = [];
    for (let k = 0; k < samples; k++) {
      const f = f0 + ((f1 - f0) * k) / (samples - 1);
      const { p, nIn } = edgeProfile(img, H, edge, f * length, wMm, hMm, side);
      if (p.some((x) => Number.isNaN(x))) continue; // this stretch of edge is outside the photo
      const g = gapFromProfile(p, nIn);
      if (g !== null) vals.push(g);
    }
    if (vals.length >= Math.max(2, Math.floor(samples / 2))) {
      out[id] = { mm: Math.round(median(vals) * 100) / 100,
        spread_mm: Math.round((Math.max(...vals) - Math.min(...vals)) * 100) / 100, n: vals.length };
    } else {
      out[id] = { mm: null, spread_mm: null, n: vals.length };
    }
  }
  return out;
}

/** Where to draw each reading: the midpoint of its stretch of edge, in door millimetres. */
export function readingAnchorMm(id: string, wMm: number, hMm: number, side: HingeSide): Pt {
  const [edge, [f0, f1]] = MEASUREMENTS[id];
  const f = (f0 + f1) / 2;
  if (edge === "handle") return [side === "left" ? wMm : 0, f * hMm];
  const x = side === "left" ? f * wMm : wMm - f * wMm;
  return [x, edge === "top" ? 0 : hMm];
}

/** RGBA (or RGB) bytes to luminance, optionally downscaled by an integer factor. */
export function toGray(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, channels = 4, factor = 1): Gray {
  const W = Math.floor(width / factor), H = Math.floor(height / factor);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * width + (x * factor + dx)) * channels;
          acc += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
        }
      }
      out[y * W + x] = acc / (factor * factor);
    }
  }
  return { width: W, height: H, data: out };
}
