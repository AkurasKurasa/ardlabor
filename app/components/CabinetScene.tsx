import { useEffect, useRef } from "react";
import {
  ViroARScene,
  ViroAmbientLight,
  ViroMaterials,
  ViroNode,
  ViroPolyline,
  ViroSphere,
  ViroText,
  ViroTrackingStateConstants,
} from "@reactvision/react-viro";
import { registerScene, sceneStore, useSceneState, type V3 } from "@/lib/store";

ViroMaterials.createMaterials({
  arWhite: { diffuseColor: "#ffffff", lightingModel: "Constant" },
  arGreen: { diffuseColor: "#34c759", lightingModel: "Constant" },
  arRed: { diffuseColor: "#ff453a", lightingModel: "Constant" },
  arAmber: { diffuseColor: "#ff6b2c", lightingModel: "Constant" },
});

function circle(r: number, n = 28): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r, 0]);
  }
  return pts;
}
const RING = circle(0.012);
const RING2 = circle(0.018);
const RING_SMALL = circle(0.007);

/**
 * Draws on the real cabinet: tapped corners, the door outline, every gap reading
 * (green in range, red out of range) and the screw to turn.
 */
export default function CabinetScene() {
  const s = useSceneState();
  const ref = useRef<ViroARScene>(null);

  useEffect(() => {
    registerScene(
      async (x, y) => (ref.current ? ref.current.performARHitTestWithPoint(Math.round(x), Math.round(y)) : []),
      async () => {
        const p = await ref.current?.getCameraPositionAsync();
        return Array.isArray(p) && p.length === 3 ? (p as V3) : null;
      },
    );
    return () => registerScene(null, null);
  }, []);

  return (
    <ViroARScene
      ref={ref}
      anchorDetectionTypes={["PlanesVertical", "PlanesHorizontal"]}
      onTrackingUpdated={(state) => {
        sceneStore.set({
          tracking:
            state === ViroTrackingStateConstants.TRACKING_NORMAL
              ? "normal"
              : state === ViroTrackingStateConstants.TRACKING_LIMITED
                ? "limited"
                : "unavailable",
        });
      }}
    >
      <ViroAmbientLight color="#ffffff" intensity={300} />

      {s.corners.map((c, i) => (
        <ViroSphere key={`c${i}`} position={c} radius={0.006} materials={["arWhite"]} />
      ))}

      {s.outline && s.corners.length === 4 && (
        <ViroPolyline points={[...s.corners, s.corners[0]]} thickness={0.0015} materials={["arWhite"]} />
      )}

      {s.gaps.map((g) => (
        <ViroNode key={g.id}>
          <ViroPolyline points={[g.from, g.to]} thickness={0.004} materials={[g.ok ? "arGreen" : "arRed"]} />
          <ViroText
            text={g.text}
            position={g.labelPos}
            scale={[0.06, 0.06, 0.06]}
            transformBehaviors={["billboard"]}
            style={{ fontSize: 22, color: g.ok ? "#34c759" : "#ff453a", textAlign: "center" }}
            width={2}
            height={0.6}
          />
        </ViroNode>
      ))}

      {s.markers.map((m) => {
        const mat = m.state === "active" ? "arAmber" : m.state === "issue" ? "arRed" : "arWhite";
        const col = m.state === "active" ? "#ff6b2c" : m.state === "issue" ? "#ff453a" : "#ffffff";
        return (
          <ViroNode key={m.id} position={m.pos} transformBehaviors={["billboard"]}>
            <ViroPolyline points={m.state === "idle" ? RING_SMALL : RING} thickness={m.state === "idle" ? 0.0012 : 0.0022} materials={[mat]} />
            {m.state !== "idle" && <ViroPolyline points={RING2} thickness={0.0012} materials={[mat]} />}
            <ViroText
              text={m.label}
              position={[0, m.state === "idle" ? 0.018 : 0.034, 0]}
              scale={m.state === "idle" ? [0.04, 0.04, 0.04] : [0.06, 0.06, 0.06]}
              style={{ fontSize: 24, color: col, textAlign: "center" }}
              width={3}
              height={0.6}
            />
          </ViroNode>
        );
      })}

      {s.screw && (
        <ViroNode position={s.screw.pos} transformBehaviors={["billboard"]}>
          <ViroPolyline points={RING} thickness={0.002} materials={["arAmber"]} />
          <ViroPolyline points={RING2} thickness={0.0015} materials={["arAmber"]} />
          <ViroText
            text={`${s.screw.turn === "cw" ? "↻" : "↺"} ${s.screw.label}`}
            position={[0, 0.04, 0]}
            scale={[0.07, 0.07, 0.07]}
            style={{ fontSize: 24, color: "#ff6b2c", textAlign: "center" }}
            width={3}
            height={0.6}
          />
        </ViroNode>
      )}
    </ViroARScene>
  );
}
