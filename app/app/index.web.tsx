import { useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CornerEditor from "@/components/CornerEditor";
import { Body, Btn, C, Eyebrow, IconBtn, LinkBtn, Notice, Progress, Row, Sheet, Small, Title, Toggle } from "@/components/ui";
import { DoorGapDiagram, HingeDiagram, TurnBadge } from "@/components/Diagrams";
import { measureGaps, type HingeSide, type Pt } from "@core/gapscan";
import {
  deriveMetrics, diagnose, planFix, needsCloserLook, FixVerifier, RULES,
  type Finding, type FixStep, type Measurement, type ScanSession, type Verdict,
} from "@core/CabinetCore";
import { DOOR_MM, defaultCorners, mergeMeasurements, toMeasurements, validDoorMm } from "@/lib/scan";
import { loadPhoto, pickPhoto, type Photo } from "@/lib/webPhoto";

// Browsers have no ARCore/ARKit, so the web version works from a photo: the door size is typed in,
// the corners are dragged on by hand, and the screw is found from the hinge diagram instead of an AR marker.
// Everything after the corners (measuring, diagnosis, fix loop) is the same core code as the app.

type Step = "door" | "corners" | "measuring" | "results" | "prepare" | "locate" | "turn" | "done";

const STEP_INDEX: Record<Step, number> = {
  door: 0, corners: 1, measuring: 1, results: 2, prepare: 3, locate: 3, turn: 3, done: 4,
};
const SCREW_NAME: Record<FixStep["screw"], string> = {
  side: "side screw", depth: "depth screw", height: "mounting plate screws", mounting: "mounting screws",
};
const CORNER_HINT = "Drag each cross onto the exact corner of the door face.";

export default function ARdlaborWeb() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("door");
  const [door, setDoor] = useState({ w: NaN, h: NaN });
  const [side, setSide] = useState<HingeSide>("left");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [corners, setCorners] = useState<Pt[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [fix, setFix] = useState<{ finding: Finding; steps: FixStep[] } | null>(null);
  const [turn, setTurn] = useState<{ dir: "cw" | "ccw"; quarters: number }>({ dir: "cw", quarters: 1 });
  const [rescan, setRescan] = useState(false);
  const [result, setResult] = useState<{ verdict: Verdict; before: number; after: number; message: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [startValue, setStartValue] = useState<number | null>(null);
  const [showGaps, setShowGaps] = useState(false);
  const verifier = useRef<FixVerifier | null>(null);

  const sizeOk = validDoorMm(door.w) && validDoorMm(door.h);

  // ---------- 1. photo ----------
  async function choosePhoto(isRescan: boolean) {
    const file = await pickPhoto();
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const p = await loadPhoto(file);
      // a re-check photo is usually taken from the same spot, so start from the last corners when the frame matches
      const sameFrame = photo && corners.length === 4 && photo.size.width === p.size.width && photo.size.height === p.size.height;
      setCorners(sameFrame ? corners : defaultCorners(p.size.width, p.size.height));
      setPhoto(p);
      setRescan(isRescan);
      setStep("corners");
    } catch (err) {
      setMessage(`Couldn’t open that photo: ${errText(err)}.`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- 2. measure + diagnose ----------
  function measure(pts: Pt[]) {
    if (!photo) return;
    setCorners(pts);
    setMessage(null);
    setStep("measuring");
    // measureGaps is synchronous pixel work; yield first so the spinner paints
    setTimeout(() => runMeasure(photo, pts), 30);
  }

  function runMeasure(p: Photo, pts: Pt[]) {
    try {
      const fresh = toMeasurements(measureGaps(p.gray, pts, door.w, door.h, side), RULES.gapTarget);
      if (!fresh.some((m) => m.mm !== null)) {
        setMessage("No gaps found. Put the crosses exactly on the corners of the door face, or retake a sharper photo.");
        setStep("corners");
        return;
      }
      const merged = mergeMeasurements(rescan ? measurements : [], fresh);
      setMeasurements(merged);

      if (rescan && fix && verifier.current) {
        const value = deriveMetrics(fresh)[fix.finding.recheck] ?? deriveMetrics(merged)[fix.finding.recheck];
        if (value === undefined) {
          setMessage("That edge wasn’t in the photo. Step back so the whole door is in view and check again.");
          setStep("turn");
          return;
        }
        const r = verifier.current.check(value);
        setResult({ verdict: r.verdict, before: r.before, after: r.after, message: r.message });
        if (r.verdict === "pass" || r.verdict === "give_up") {
          setStep("done");
        } else {
          setTurn({ dir: r.turn, quarters: r.quarterTurns });
          setStep("turn");
        }
        return;
      }
      const session: ScanSession = { version: 1, door: { id: "door", width_mm: door.w, height_mm: door.h, hinge_side: side }, measurements: merged };
      setFindings(diagnose(session));
      setStep("results");
    } catch (err) {
      console.error("measure failed", err);
      setMessage(`Measurement failed: ${errText(err)}`);
      setStep("corners");
    }
  }

  // ---------- 3. fix ----------
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

  function restart() {
    verifier.current = null;
    setFix(null);
    setFindings([]);
    setMeasurements([]);
    setRescan(false);
    setResult(null);
    setPhoto(null);
    setCorners([]);
    setMessage(null);
    setStep("door");
  }

  // ---------- render ----------
  if (step === "corners" && photo) {
    return (
      <View style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <CornerEditor uri={photo.uri} imageSize={photo.size} corners={corners} onConfirm={measure}
          onRetake={() => choosePhoto(rescan)} hint={CORNER_HINT} notice={message} />
      </View>
    );
  }

  const adjust = fix?.steps[fix.steps.length - 1];
  const top = findings[0];
  const hingeWord = (h: FixStep["hinge"]) => (h === "hinge_top" ? "top" : "bottom");

  return (
    <View style={styles.fill}>
      {photo ? (
        <Image source={{ uri: photo.uri }} style={[StyleSheet.absoluteFill, styles.backdrop]} resizeMode="contain" />
      ) : (
        <View style={styles.intro}>
          <Eyebrow icon="door">ARdlabor</Eyebrow>
          <Title>Fix a crooked cabinet door</Title>
          <Body>Photograph the closed door and ARdlabor measures the gaps, finds the hinge screw to turn and checks your fix.</Body>
        </View>
      )}

      <Progress current={STEP_INDEX[step]} top={insets.top + 10} />

      <View style={styles.bottom} pointerEvents="box-none">
        <View style={styles.column}>
          <Sheet bottomInset={insets.bottom}>
            {message && <Notice>{message}</Notice>}

            {step === "door" && (
              <>
                <Title>Measure the door</Title>
                <Row>
                  <NumField label="Width (mm)" onChange={(w) => setDoor({ ...door, w })} />
                  <NumField label="Height (mm)" onChange={(h) => setDoor({ ...door, h })} />
                </Row>
                <Row>
                  <Small>Hinges</Small>
                  <Toggle options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} value={side} onChange={setSide} />
                </Row>
                <Small>Close the door and stand straight in front of it, with all four corners in the photo.</Small>
                {!sizeOk && (Number.isFinite(door.w) || Number.isFinite(door.h)) && (
                  <Small color={C.warn}>Width and height must be between {DOOR_MM[0]} and {DOOR_MM[1]} mm.</Small>
                )}
                <Btn label={busy ? "Opening…" : "Take or choose photo"} icon="camera" onPress={() => choosePhoto(false)} disabled={busy || !sizeOk} />
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
                      ? <Btn label={busy ? "Opening…" : "Take a closer photo"} icon="magnify-plus" onPress={() => choosePhoto(false)} disabled={busy} />
                      : <Btn label="Fix it" icon="screwdriver" onPress={() => startFix(top)} />}
                  </>
                ) : (
                  <>
                    <Title>Gaps look even</Title>
                    {showGaps && <DoorGapDiagram measurements={measurements} side={side} />}
                    <LinkBtn label={showGaps ? "Hide gaps" : "See all gaps"} open={showGaps} onPress={() => setShowGaps(!showGaps)} />
                    <Btn label="Scan another door" kind="secondary" onPress={restart} />
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
                <Title>Find the {SCREW_NAME[adjust.screw]} on the {hingeWord(adjust.hinge)} hinge</Title>
                <HingeDiagram screw={adjust.screw} />
                <Btn label="Found it" icon="target" onPress={() => setStep("turn")} />
              </>
            )}

            {step === "turn" && adjust && fix && (
              <>
                <Row gap={14}>
                  <TurnBadge dir={turn.dir} quarters={turn.quarters} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Title>{quarterLabel(turn.quarters)} {turn.dir === "cw" ? "clockwise" : "anticlockwise"}</Title>
                    <Small>{SCREW_NAME[adjust.screw]}, {hingeWord(adjust.hinge)} hinge</Small>
                    {result && (
                      <Small color={result.verdict === "improved" ? C.ok : C.warn}>
                        {result.before.toFixed(1)} → {result.after.toFixed(1)} mm · {result.verdict === "improved" ? "better" : result.verdict === "worse" ? "worse, reversed" : "no change"}
                      </Small>
                    )}
                  </View>
                </Row>
                <Small>Then close the door and take a new photo from the same spot.</Small>
                <Row>
                  <IconBtn icon="help-circle-outline" label="Which screw?" onPress={() => setStep("locate")} />
                  <Btn label={busy ? "Opening…" : "Check"} icon="check" onPress={() => choosePhoto(true)} disabled={busy} />
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
    </View>
  );
}

function quarterLabel(q: number) {
  return q >= 2 ? "½ turn" : "¼ turn";
}

function errText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function NumField({ label, onChange }: { label: string; onChange: (n: number) => void }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Small>{label}</Small>
      <TextInput style={styles.input} inputMode="numeric" placeholder="e.g. 400" placeholderTextColor={C.faint}
        onChangeText={(t) => onChange(t.trim() === "" ? NaN : Number(t))} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  backdrop: { opacity: 0.45 },
  intro: { flex: 1, maxWidth: 520, width: "100%", alignSelf: "center", justifyContent: "center", gap: 10, padding: 24, paddingBottom: 320 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  column: { width: "100%", maxWidth: 520, alignSelf: "center" },
  input: { backgroundColor: "#2c2c2e", color: C.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 17,
    fontWeight: "700", fontVariant: ["tabular-nums"] },
});
