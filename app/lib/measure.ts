import { File } from "expo-file-system";
import * as jpeg from "jpeg-js";
import { measureGaps, toGray, type Gray, type HingeSide, type Pt } from "@core/gapscan";
import { RULES } from "@core/CabinetCore";
import { toMeasurements } from "./scan";

export { mergeMeasurements } from "./scan";

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
  const measurements = toMeasurements(readings, RULES.gapTarget);
  return { readings, measurements, size: { width: gray.width, height: gray.height } };
}
