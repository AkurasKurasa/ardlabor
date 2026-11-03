import { File } from "expo-file-system";
import * as jpeg from "jpeg-js";
import { measureGaps, toGray, type Gray, type HingeSide, type Pt } from "@core/gapscan";
import type { Measurement } from "@core/CabinetCore";
import { RULES } from "@core/CabinetCore";

export function fileUri(path: string): string {
  return path.startsWith("file://") ? path : `file://${path}`;
}

export async function loadGray(path: string): Promise<Gray> {
  const bytes = await new File(fileUri(path)).bytes();
  const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 40, maxMemoryUsageInMB: 512 });
  return toGray(img.data, img.width, img.height, 4, 1);
}

/** Measure all gaps in one AR screenshot. Corners are in screenshot pixels. */
export async function measureShot(path: string, corners: Pt[], wMm: number, hMm: number, side: HingeSide) {
  const gray = await loadGray(path);
  const readings = measureGaps(gray, corners, wMm, hMm, side);
  const measurements: Measurement[] = Object.entries(readings).map(([id, r]) => ({
    id, mm: r.mm, target: RULES.gapTarget, by: "gap", samples: r.n, spread_mm: r.spread_mm ?? undefined,
  }));
  return { readings, measurements, size: { width: gray.width, height: gray.height } };
}

/** Keep the newest value for each gap; a close-up shot may only see some of the edges. */
export function mergeMeasurements(old: Measurement[], fresh: Measurement[]): Measurement[] {
  const map = new Map(old.map((m) => [m.id, m]));
  for (const m of fresh) if (m.mm !== null) map.set(m.id, m);
  return [...map.values()];
}
