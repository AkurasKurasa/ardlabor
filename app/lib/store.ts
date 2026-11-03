import { useSyncExternalStore } from "react";
import type { ViroARHitTestResult } from "@reactvision/react-viro";

export type V3 = [number, number, number];

export interface GapLabel {
  id: string;
  from: V3;
  to: V3;
  labelPos: V3;
  text: string;
  ok: boolean;
}

/** Everything the AR scene draws. The screen writes it; the scene only reads it. */
export interface SceneState {
  corners: V3[];
  outline: boolean;
  gaps: GapLabel[];
  screw: { pos: V3; turn: "cw" | "ccw"; label: string } | null;
  tracking: "normal" | "limited" | "unavailable";
}

let state: SceneState = { corners: [], outline: false, gaps: [], screw: null, tracking: "unavailable" };
const listeners = new Set<() => void>();

export const sceneStore = {
  get: () => state,
  set(patch: Partial<SceneState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useSceneState(): SceneState {
  return useSyncExternalStore(sceneStore.subscribe, sceneStore.get, sceneStore.get);
}

// The AR scene registers these when it mounts so the screen can call them.
type HitTester = (xPx: number, yPx: number) => Promise<ViroARHitTestResult[]>;
type CameraGetter = () => Promise<V3 | null>;
let hitTester: HitTester | null = null;
let cameraGetter: CameraGetter | null = null;

export function registerScene(h: HitTester | null, c: CameraGetter | null) {
  hitTester = h;
  cameraGetter = c;
}

/** Best surface hit under a screen pixel: depth and plane hits beat loose feature points. */
export async function hitTest(xPx: number, yPx: number): Promise<V3 | null> {
  if (!hitTester) return null;
  const rank: Record<string, number> = {
    ExistingPlaneUsingExtent: 0, DepthPoint: 1, ExistingPlane: 2, FeaturePoint: 3, EstimatedHorizontalPlane: 9,
  };
  const results = (await hitTester(xPx, yPx)) ?? [];
  const usable = results.filter((r) => r?.transform?.position && (rank[r.type] ?? 9) < 9);
  if (!usable.length) return null;
  usable.sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9));
  return usable[0].transform.position as V3;
}

export async function cameraPosition(): Promise<V3 | null> {
  return cameraGetter ? cameraGetter() : null;
}
