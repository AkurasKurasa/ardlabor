import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Image, PixelRatio, Pressable, StyleSheet, Text, TextInput, View,
  type GestureResponderEvent, type LayoutChangeEvent,
} from "react-native";
import * as Haptics from "expo-haptics";
import { ViroARSceneNavigator } from "@reactvision/react-viro";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CabinetScene from "@/components/CabinetScene";
import CornerEditor from "@/components/CornerEditor";
import { Body, Btn, C, IconBtn, LinkBtn, Notice, Progress, Reticle, Row, Sheet, Small, Title, Toggle } from "@/components/ui";
import { DoorGapDiagram, HingeDiagram, TurnBadge } from "@/components/Diagrams";
import { cameraPosition, hitTest, sceneStore, useSceneState, type GapLabel, type V3 } from "@/lib/store";
import { doorPoint, doorSizeMm, orderWorldCorners } from "@/lib/geom";
import { measureShot, mergeMeasurements, fileUri } from "@/lib/measure";
import { MEASUREMENTS, readingAnchorMm, type HingeSide, type Pt } from "@core/gapscan";
import {
  deriveMetrics, diagnose, planFix, needsCloserLook, FixVerifier, RULES,
  type Finding, type FixStep, type Measurement, type ScanSession, type Verdict,
} from "@core/CabinetCore";

type Step = "corners" | "door" | "capture" | "adjust" | "measuring" | "results" | "prepare" | "locate" | "turn" | "done";

const STEP_INDEX: Record<Step, number> = {
  corners: 0, door: 0, capture: 1, adjust: 1, measuring: 1, results: 2, prepare: 3, locate: 3, turn: 3, done: 4,
};
const SCREW_NAME: Record<FixStep["screw"], string> = {
  side: "side screw", depth: "depth screw", height: "mounting plate screws", mounting: "mounting screws",
};

export default function ARdlabor() {
  const insets = useSafeAreaInsets();
  const nav = useRef<ViroARSceneNavigator>(null);
  const scene = useSceneState();
  const [step, setStep] = useState<Step>("corners");
  const [taps, setTaps] = useState<{ world: V3; screen: Pt }[]>([]);
  const [world, setWorld] = useState<V3[]>([]);
  const [door, setDoor] = useState({ w: 0, h: 0 });
  const [side, setSide] = useState<HingeSide>("left");
  const [viewPx, setViewPx] = useState({ w: 1, h: 1 });
  const [shot, setShot] = useState<{ uri: string; size: { width: number; height: number }; corners: Pt[] } | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [fix, setFix] = useState<{ finding: Finding; steps: FixStep[] } | null>(null);
  const [turn, setTurn] = useState<{ dir: "cw" | "ccw"; quarters: number }>({ dir: "cw", quarters: 1 });
  const [rescan, setRescan] = useState(false);
  const [result, setResult] = useState<{ verdict: Verdict; before: number; after: number; message: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [startValue, setStartValue] = useState<number | null>(null);
  const [editSize, setEditSize] = useState(false);
  const [showGaps, setShowGaps] = useState(false);
  const [showHinge, setShowHinge] = useState(false);
  const verifier = useRef<FixVerifier | null>(null);

  useEffect(() => () => sceneStore.set({ corners: [], outline: false, gaps: [], screw: null }), []);

  const onLayout = (e: LayoutChangeEvent) => {
    const r = PixelRatio.get();
    setViewPx({ w: e.nativeEvent.layout.width * r, h: e.nativeEvent.layout.height * r });
  };
  const center = (): Pt => [viewPx.w / 2, viewPx.h / 2];
  const tapPx = (e: GestureResponderEvent): Pt => [e.nativeEvent.locationX * PixelRatio.get(), e.nativeEvent.locationY * PixelRatio.get()];

  // ---------- 1. door corners ----------
  async function addCorner(screen: Pt) {
    if (busy) return;
    setBusy(true);
    const hit = await hitTest(screen[0], screen[1]);
    setBusy(false);
    if (!hit) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setMessage("No surface yet. Sweep the phone slowly across the door.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMessage(null);
    const next = [...taps, { world: hit, screen }];
    setTaps(next);
    sceneStore.set({ corners: next.map((t) => t.world) });
    if (next.length === 4) {
      const o = orderWorldCorners(next.map((t) => t.world), next.map((t) => t.screen));
      setWorld(o.world);
      setDoor(doorSizeMm(o.world));
      sceneStore.set({ corners: o.world, outline: true });
      setStep("door");
    }
  }

  function undoCorner() {
    const next = taps.slice(0, -1);
    setTaps(next);
    sceneStore.set({ corners: next.map((t) => t.world), outline: false });
  }

  function resetCorners() {
    setTaps([]);
    setWorld([]);
    sceneStore.set({ corners: [], outline: false, gaps: [], screw: null });
    setStep("corners");
  }

  // ---------- 2. capture ----------
  async function capture() {
    const n = nav.current?.arSceneNavigator;
    if (!n) return;
    setBusy(true);
    setMessage(null);
    try {
      const saved = sceneStore.get();
      sceneStore.set({ outline: false, gaps: [], corners: [], screw: null }); // keep our lines out of the photo
      await new Promise((r) => setTimeout(r, 250));
      const res = await n.takeScreenshot(`ardlabor_${Date.now()}`, false);
      sceneStore.set({ outline: saved.outline, gaps: saved.gaps, corners: saved.corners, screw: saved.screw });
      if (!res?.success || !res.url) throw new Error(`screenshot failed (${res?.errorCode})`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const uri = fileUri(res.url);
      const size = await new Promise<{ width: number; height: number }>((ok, bad) =>
        Image.getSize(uri, (width, height) => ok({ width, height }), bad));
      const sx = size.width / viewPx.w, sy = size.height / viewPx.h;
      const corners: Pt[] = [];
      for (const c of world) {
        const p = await n.project(c);
        const [x, y] = p?.screenPosition ?? [NaN, NaN];
        corners.push([x * sx, y * sy]);
      }
      setShot({ uri, size, corners });
      setStep("adjust");
    } catch (err) {
      setMessage(`Couldn’t capture the frame: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- 3. measure + diagnose ----------
  async function measure(corners: Pt[]) {
    if (!shot) return;
    setStep("measuring");
    try {
      const { readings, measurements: fresh } = await measureShot(shot.uri, corners, door.w, door.h, side);
      const merged = mergeMeasurements(rescan ? measurements : [], fresh);
      setMeasurements(merged);
      drawGaps(merged);
      const session: ScanSession = { version: 1, door: { id: "door", width_mm: door.w, height_mm: door.h, hinge_side: side }, measurements: merged };

      if (rescan && fix && verifier.current) {
        const value = deriveMetrics(fresh)[fix.finding.recheck] ?? deriveMetrics(merged)[fix.finding.recheck];
        if (value === undefined) {
          setMessage("That edge wasn’t in view. Step back and capture again.");
          setStep("capture");
          return;
        }
        const r = verifier.current.check(value);
        setResult({ verdict: r.verdict, before: r.before, after: r.after, message: r.message });
        Haptics.notificationAsync(r.verdict === "pass" ? Haptics.NotificationFeedbackType.Success
          : r.verdict === "improved" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
        if (r.verdict === "pass" || r.verdict === "give_up") {
          sceneStore.set({ screw: null });
          setStep("done");
        } else {
          setTurn({ dir: r.turn, quarters: r.quarterTurns });
          const sc = sceneStore.get().screw;
          if (sc) sceneStore.set({ screw: { ...sc, turn: r.turn, label: quarterLabel(r.quarterTurns) } });
          setStep("turn");
        }
        return;
      }
      const seen = Object.values(readings).filter((r) => r.mm !== null).length;
      setMessage(seen === 0 ? "No gaps found. Put the crosses exactly on the corners." : null);
      setFindings(diagnose(session));
      setStep("results");
    } catch (err) {
      setMessage(`Measurement failed: ${String(err)}`);
      setStep("capture");
    }
  }

  async function drawGaps(ms: Measurement[]) {
    const cam = await cameraPosition();
    const labels: GapLabel[] = [];
    for (const m of ms) {
      if (m.mm === null || !(m.id in MEASUREMENTS)) continue;
      const [edge] = MEASUREMENTS[m.id];
      const [u, v] = readingAnchorMm(m.id, door.w, door.h, side);
      const along: Pt = edge === "handle" ? [0, 15] : [15, 0];
      const outward: Pt = edge === "top" ? [0, -30] : edge === "bottom" ? [0, 30] : [side === "left" ? 40 : -40, 0];
      const P = (du: number, dv: number, out = 0.004) => doorPoint(world, u + du, v + dv, door.w, door.h, out, cam ?? undefined);
      const t = m.target ?? RULES.gapTarget;
      labels.push({
        id: m.id, from: P(-along[0], -along[1]), to: P(along[0], along[1]), labelPos: P(outward[0], outward[1], 0.01),
        text: `${m.mm.toFixed(1)} mm`, ok: m.mm >= t[0] && m.mm <= t[1],
      });
    }
    sceneStore.set({ gaps: labels });
  }

  // ---------- 4. fix ----------
  function startFix(f: Finding) {
    const steps = planFix(f);
    const adjust = steps[steps.length - 1];
    const start = deriveMetrics(measurements)[f.recheck] ?? 0;
    verifier.current = new FixVerifier(start, f.recheckTarget, adjust.turn ?? "cw");
    setStartValue(start);
    setFix({ finding: f, steps });
    setTurn({ dir: adjust.turn ?? "cw", quarters: adjust.quarterTurns ?? 1 });
    setResult(null);
    setMessage(null);
    setStep("prepare");
  }

  async function markScrew(screen: Pt) {
    if (busy || !fix) return;
    setBusy(true);
    const hit = await hitTest(screen[0], screen[1]);
    setBusy(false);
    if (!hit) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setMessage("Couldn’t mark that. Move a bit closer.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMessage(null);
    sceneStore.set({ screw: { pos: hit, turn: turn.dir, label: quarterLabel(turn.quarters) } });
    setStep("turn");
  }

  function check() {
    setRescan(true);
    setMessage(null);
    setStep("capture");
  }

  function restart() {
    verifier.current = null;
    setFix(null);
    setFindings([]);
    setMeasurements([]);
    setRescan(false);
    setResult(null);
    setShot(null);
    setMessage(null);
    resetCorners();
  }

  // ---------- render ----------
  if (step === "adjust" && shot) {
    return (
      <View style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <CornerEditor uri={shot.uri} imageSize={shot.size} corners={shot.corners} onConfirm={measure} onRetake={() => setStep("capture")} />
      </View>
    );
  }

  const adjust = fix?.steps[fix.steps.length - 1];
  const aiming = step === "corners" || step === "locate";
  const onTap = step === "corners" ? (e: GestureResponderEvent) => addCorner(tapPx(e))
    : step === "locate" ? (e: GestureResponderEvent) => markScrew(tapPx(e)) : null;
  const top = findings[0];
  const hingeWord = (h: FixStep["hinge"]) => (h === "hinge_top" ? "top" : "bottom");

  return (
    <View style={styles.fill} onLayout={onLayout}>
      <ViroARSceneNavigator ref={nav} initialScene={{ scene: CabinetScene }} style={styles.fill} depthEnabled />
      {onTap && <Pressable style={StyleSheet.absoluteFill} onPress={onTap} />}
      {aiming && <Reticle label={step === "corners" ? `Corner ${taps.length + 1} of 4` : undefined} />}

      <Progress current={STEP_INDEX[step]} top={insets.top + 10} />
      {scene.tracking !== "normal" && (
        <View style={[styles.tracking, { top: insets.top + 24 }]} pointerEvents="none">
          {scene.tracking === "unavailable" ? <ActivityIndicator color={C.accent} size="small" /> : null}
          <Text style={styles.trackingText}>{scene.tracking === "limited" ? "Move slowly" : "Starting AR…"}</Text>
        </View>
      )}

      <View style={styles.bottom} pointerEvents="box-none">
        <Sheet bottomInset={insets.bottom}>
          {message && <Notice>{message}</Notice>}

          {step === "corners" && (
            <>
              <Title>Aim at a door corner</Title>
              <Row>
                {taps.length > 0 && <IconBtn icon="undo" label="Undo" onPress={undoCorner} />}
                <Btn label={busy ? "…" : `Add corner ${taps.length + 1}/4`} onPress={() => addCorner(center())} disabled={busy} />
              </Row>
            </>
          )}

          {step === "door" && (
            <>
              <Row>
                <Title>{door.w} × {door.h} mm</Title>
                <View style={{ flex: 1 }} />
                <LinkBtn label="Edit" open={editSize} onPress={() => setEditSize(!editSize)} />
              </Row>
              {editSize && (
                <Row>
                  <NumField label="Width" value={door.w} onChange={(w) => setDoor({ ...door, w })} />
                  <NumField label="Height" value={door.h} onChange={(h) => setDoor({ ...door, h })} />
                </Row>
              )}
              <Row>
                <Small>Hinges</Small>
                <Toggle options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} value={side} onChange={setSide} />
              </Row>
              <Row>
                <IconBtn icon="restart" label="Redo corners" onPress={resetCorners} />
                <Btn label="Scan gaps" onPress={() => setStep("capture")} disabled={door.w < 50 || door.h < 50} />
              </Row>
            </>
          )}

          {step === "capture" && (
            <>
              <Title>{rescan ? "Close the door, then capture" : "Face the door straight on"}</Title>
              <Btn label={busy ? "Capturing…" : "Capture"} icon="camera" onPress={capture} disabled={busy} />
            </>
          )}

          {step === "measuring" && (
            <Row><ActivityIndicator color={C.accent} /><Body>Measuring…</Body></Row>
          )}

          {step === "results" && (
            <>
              {top ? (
                <>
                  <Title>{top.summary.replace(/\.$/, "")}</Title>
                  <Small>{hingeWord(top.hinge)} hinge · {SCREW_NAME[top.screw]} · {Math.round(top.confidence * 100)}% sure</Small>
                  {showGaps && <DoorGapDiagram measurements={measurements} side={side} />}
                  <LinkBtn label={showGaps ? "Hide gaps" : "See all gaps"} open={showGaps} onPress={() => setShowGaps(!showGaps)} />
                  {needsCloserLook(top)
                    ? <Btn label="Look closer" icon="magnify-plus" onPress={() => setStep("capture")} />
                    : <Btn label="Fix it" icon="screwdriver" onPress={() => startFix(top)} />}
                </>
              ) : (
                <>
                  <Title>Gaps look even</Title>
                  <Btn label="Scan again" icon="camera" kind="secondary" onPress={() => setStep("capture")} />
                </>
              )}
            </>
          )}

          {step === "prepare" && fix && (
            <>
              <Title>{fix.steps[0].text}</Title>
              <Btn label="Done" onPress={() => setStep("locate")} />
            </>
          )}

          {step === "locate" && adjust && (
            <>
              <Title>Aim at the {SCREW_NAME[adjust.screw]}, {hingeWord(adjust.hinge)} hinge</Title>
              {showHinge && <HingeDiagram screw={adjust.screw} />}
              <LinkBtn label="Which screw?" open={showHinge} onPress={() => setShowHinge(!showHinge)} />
              <Btn label={busy ? "…" : "Mark screw"} icon="target" onPress={() => markScrew(center())} disabled={busy} />
            </>
          )}

          {step === "turn" && adjust && fix && (
            <>
              <Row gap={14}>
                <TurnBadge dir={turn.dir} quarters={turn.quarters} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Title>{quarterLabel(turn.quarters)} {turn.dir === "cw" ? "clockwise" : "anticlockwise"}</Title>
                  {result && (
                    <Small color={result.verdict === "improved" ? C.ok : C.warn}>
                      {result.before.toFixed(1)} → {result.after.toFixed(1)} mm · {result.verdict === "improved" ? "better" : result.verdict === "worse" ? "worse, reversed" : "no change"}
                    </Small>
                  )}
                </View>
              </Row>
              <Row>
                <IconBtn icon="target" label="Re-mark screw" onPress={() => setStep("locate")} />
                <Btn label="Check" icon="check" onPress={check} />
              </Row>
            </>
          )}

          {step === "done" && (
            <>
              <Title>{result?.verdict === "pass" ? "Fixed" : "Time for a carpenter"}</Title>
              {result && <Small color={result.verdict === "pass" ? C.ok : C.warn}>{(startValue ?? result.before).toFixed(1)} → {result.after.toFixed(1)} mm</Small>}
              <Btn label="Scan another door" onPress={restart} />
            </>
          )}
        </Sheet>
      </View>
    </View>
  );
}

function quarterLabel(q: number) {
  return q >= 2 ? "½ turn" : "¼ turn";
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Small>{label}</Small>
      <TextInput style={styles.input} keyboardType="number-pad" defaultValue={String(value)} selectTextOnFocus
        onChangeText={(t) => { const n = parseInt(t, 10); if (!Number.isNaN(n)) onChange(n); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  tracking: { position: "absolute", alignSelf: "center", flexDirection: "row", gap: 8, alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  trackingText: { color: C.accent, fontSize: 13, fontWeight: "600" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  finding: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.05)" },
  findingTop: { borderLeftWidth: 3, borderLeftColor: C.bad },
  findingTitle: { color: C.text, fontSize: 17, fontWeight: "800", flex: 1 },
  input: { backgroundColor: "#2c2c2e", color: C.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 17,
    fontWeight: "700", fontVariant: ["tabular-nums"] },
});
