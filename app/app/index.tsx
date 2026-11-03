import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Keyboard, PixelRatio, Pressable, StyleSheet, Text, TextInput, View,
  type GestureResponderEvent, type LayoutChangeEvent,
} from "react-native";
import * as Haptics from "expo-haptics";
import { ViroARSceneNavigator } from "@reactvision/react-viro";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import CabinetScene from "@/components/CabinetScene";
import CabinetFlow from "@/components/CabinetFlow";
import BoxDraw, { type Box } from "@/components/BoxDraw";
import { T, Body, Btn, Bubble, C, IconBtn, LinkBtn, Notice, Row, Sheet, Small, Title } from "@/components/ui";
import { hitTest, sceneStore, useSceneState, type StepMarker } from "@/lib/store";
import { askGemini, GeminiError } from "@/lib/gemini";
import { getApiKey, setApiKey } from "@/lib/settings";
import {
  buildCheckPrompt, buildPlanPrompt, fromNorm, headline, parseCheck, parsePlan, toNormBox,
  type CheckResult, type RepairPlan,
} from "@core/repairPlan";

type Phase = "idle" | "box" | "key" | "looking" | "plan" | "step" | "check" | "result" | "cabinet";

const ACTION_WORD: Record<string, string> = {
  turn_cw: "↻", turn_ccw: "↺", tighten: "↻", loosen: "↺", pull: "←", push: "→", lift: "↑", press: "●",
};

export default function ARdlabor() {
  const insets = useSafeAreaInsets();
  const nav = useRef<ViroARSceneNavigator>(null);
  const scene = useSceneState();
  const [phase, setPhase] = useState<Phase>("idle");
  const [viewPx, setViewPx] = useState({ w: 1, h: 1 });
  const [request, setRequest] = useState("");
  const [box, setBox] = useState<Box | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [plan, setPlan] = useState<RepairPlan | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [reaim, setReaim] = useState(false);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [lookingFor, setLookingFor] = useState<"plan" | "check">("plan");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => sceneStore.set({ markers: [] }), []);

  const onLayout = (e: LayoutChangeEvent) => {
    const r = PixelRatio.get();
    setViewPx({ w: e.nativeEvent.layout.width * r, h: e.nativeEvent.layout.height * r });
  };

  // ---------- capture the camera view without our own drawings in it ----------
  async function captureFrame(): Promise<string> {
    const n = nav.current?.arSceneNavigator;
    if (!n) throw new Error("AR isn’t ready yet.");
    const saved = sceneStore.get();
    sceneStore.set({ markers: [], gaps: [], corners: [], outline: false, screw: null });
    await new Promise((r) => setTimeout(r, 200));
    const res = await n.takeScreenshot(`ardlabor_${Date.now()}`, false);
    sceneStore.set({ markers: saved.markers, gaps: saved.gaps, corners: saved.corners, outline: saved.outline, screw: saved.screw });
    if (!res?.success || !res.url) throw new Error("Couldn’t capture the camera view.");
    return res.url;
  }

  // ---------- 1. ask ----------
  function submitRequest() {
    const t = request.trim();
    if (!t) return;
    Keyboard.dismiss();
    setError(null);
    setPhase("box");
  }

  async function onBoxDrawn(b: Box) {
    setBox(b);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const key = await getApiKey();
    if (!key) {
      setPhase("key");
      return;
    }
    runPlan(b, key);
  }

  async function saveKey() {
    if (keyDraft.trim().length < 20) {
      setError("That doesn’t look like a full key. Copy the whole thing from AI Studio.");
      return;
    }
    await setApiKey(keyDraft);
    setKeyDraft("");
    setError(null);
    runPlan(box, keyDraft.trim());
  }

  // ---------- 2. look + plan ----------
  async function runPlan(b: Box | null, key?: string) {
    const apiKey = key ?? (await getApiKey());
    if (!apiKey) return setPhase("key");
    setLookingFor("plan");
    setPhase("looking");
    setError(null);
    try {
      const r = PixelRatio.get();
      const nbox = b ? toNormBox(b.x0 * r, b.y0 * r, b.x1 * r, b.y1 * r, viewPx.w, viewPx.h) : null;
      const shot = await captureFrame();
      const p = parsePlan(await askGemini(apiKey, shot, buildPlanPrompt(request, nbox)));
      setPlan(p);
      setStepIdx(0);
      await placeMarkers(p, 0);
      Haptics.notificationAsync(p.safety.level === "stop" ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
      setPhase("plan");
    } catch (e) {
      fail(e);
    }
  }

  function fail(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    setError(msg);
    if (e instanceof GeminiError && e.kind === "key") setPhase("key");
    else setPhase(plan ? "plan" : "box");
  }

  /** Pin every step that has a point onto the real object. */
  async function placeMarkers(p: RepairPlan, active: number) {
    const markers: StepMarker[] = [];
    for (let i = 0; i < p.steps.length; i++) {
      const pt = p.steps[i].point;
      if (!pt) continue;
      const [x, y] = fromNorm(pt, viewPx.w, viewPx.h);
      const hit = await hitTest(x, y);
      if (hit) markers.push({ id: `s${i}`, pos: hit, label: `${i + 1}`, state: i === active ? "active" : "idle" });
    }
    sceneStore.set({ markers });
  }

  function showStep(i: number) {
    setStepIdx(i);
    const action = plan?.steps[i]?.action ?? "";
    sceneStore.set({
      markers: sceneStore.get().markers.map((m) => {
        const n = Number(m.id.slice(1));
        return { ...m, state: n === i ? "active" : "idle", label: n === i ? `${n + 1} ${ACTION_WORD[action] ?? ""}`.trim() : `${n + 1}` };
      }),
    });
  }

  async function moveMarker(e: GestureResponderEvent) {
    const r = PixelRatio.get();
    const hit = await hitTest(e.nativeEvent.locationX * r, e.nativeEvent.locationY * r);
    setReaim(false);
    if (!hit) return setError("Couldn’t pin it there. Move a little closer and try again.");
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const others = sceneStore.get().markers.filter((m) => m.id !== `s${stepIdx}`);
    sceneStore.set({ markers: [...others, { id: `s${stepIdx}`, pos: hit, label: `${stepIdx + 1}`, state: "active" }] });
  }

  // ---------- 3. check the fix ----------
  async function runCheck() {
    const apiKey = await getApiKey();
    if (!apiKey || !plan) return setPhase("key");
    setLookingFor("check");
    setPhase("looking");
    try {
      const shot = await captureFrame();
      const c = parseCheck(await askGemini(apiKey, shot, buildCheckPrompt(plan)));
      setCheck(c);
      if (!c.fixed && c.point) {
        const [x, y] = fromNorm(c.point, viewPx.w, viewPx.h);
        const hit = await hitTest(x, y);
        sceneStore.set({ markers: hit ? [{ id: "issue", pos: hit, label: "!", state: "issue" }] : [] });
      } else {
        sceneStore.set({ markers: [] });
      }
      Haptics.notificationAsync(c.fixed ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("check");
    }
  }

  function reset() {
    sceneStore.set({ markers: [], gaps: [], corners: [], outline: false, screw: null });
    setPlan(null);
    setCheck(null);
    setBox(null);
    setRequest("");
    setError(null);
    setReaim(false);
    setPhase("idle");
  }

  // ---------- render ----------
  const step = plan?.steps[stepIdx];
  const hasMarker = scene.markers.some((m) => m.id === `s${stepIdx}`);

  return (
    <View style={styles.fill} onLayout={onLayout}>
      <ViroARSceneNavigator ref={nav} initialScene={{ scene: CabinetScene }} style={styles.fill} depthEnabled />

      {phase === "cabinet" ? (
        <CabinetFlow nav={nav} viewPx={viewPx} startBox={box} intro={plan ? headline(plan) + "." : undefined}
          onExit={() => { setPhase(plan ? "plan" : "idle"); }} />
      ) : (
        <>
          {phase === "box" && <BoxDraw box={null} onDraw={onBoxDrawn} hint="Draw a box around it" />}
          {reaim && <Pressable style={StyleSheet.absoluteFill} onPress={moveMarker} />}

          {phase === "idle" && (
            <View style={[styles.center, styles.dim]} pointerEvents="box-none">
              <TextInput
                style={styles.ask}
                value={request}
                onChangeText={setRequest}
                placeholder="What should I help you with?"
                placeholderTextColor="rgba(255,255,255,0.92)"
                multiline
                submitBehavior="blurAndSubmit"
                returnKeyType="send"
                onSubmitEditing={submitRequest}
                textAlign="center"
                selectionColor={C.signal}
              />
              {request.trim().length > 0 && <IconBtn label="Continue" onPress={submitRequest} />}
            </View>
          )}

          {phase !== "idle" && (
            <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0.5)", "rgba(0,0,0,0)"]} style={[styles.topFade, { height: insets.top + 96 }]} />
          )}
          {phase !== "idle" && (
            <View style={[styles.topBar, { top: insets.top + 14, left: insets.left + 28, right: insets.right + 20 }]} pointerEvents="box-none">
              <View style={{ flexShrink: 1, gap: 2 }} pointerEvents="none">
                <Text style={styles.requestText} numberOfLines={1}>{request}</Text>
                {scene.tracking === "limited" && <Text style={styles.trackingText}>Tracking is weak. Move the phone slowly.</Text>}
              </View>
              <IconBtn label="Start over" onPress={reset} />
            </View>
          )}

          {["key", "looking", "plan", "step", "check", "result"].includes(phase) || (phase === "box" && error) ? (
            <View style={[styles.bottom, { paddingLeft: insets.left, paddingRight: insets.right }]} pointerEvents="box-none">
              <Sheet bottomInset={insets.bottom}>
                {error && <Notice tone="bad">{error}</Notice>}

                {phase === "looking" && (
                  <Row gap={10}>
                    <ActivityIndicator color={C.text} size="small" />
                    <Body>{lookingFor === "plan" ? "Looking. Hold the phone still." : "Checking. Hold the phone still."}</Body>
                  </Row>
                )}

                {phase === "key" && (
                  <>
                    <Title>Add your Gemini key</Title>
                    <Small>Get a free key at aistudio.google.com/apikey. It is stored only on this phone.</Small>
                    <Row>
                      <TextInput style={styles.input} value={keyDraft} onChangeText={setKeyDraft} placeholder="Paste key"
                        placeholderTextColor={C.faint} autoCapitalize="none" autoCorrect={false} secureTextEntry selectionColor={C.signal} />
                      <Btn label="Save key" onPress={saveKey} />
                    </Row>
                  </>
                )}

                {phase === "plan" && plan && (
                  <>
                    <Bubble>{headline(plan)}</Bubble>
                    {plan.safety.level === "stop" ? (
                      <>
                        <Body>{plan.safety.reason}</Body>
                        <Row><Btn label="Ask something else" onPress={reset} /></Row>
                      </>
                    ) : plan.confidence < 0.4 || plan.steps.length === 0 ? (
                      <Row><Btn label="Try again closer" onPress={() => { setError(null); setPhase("box"); }} /></Row>
                    ) : (
                      <>
                        {plan.safety.level === "caution" && plan.safety.reason ? <Notice>{plan.safety.reason}</Notice> : null}
                        <Body>
                          {plan.steps.length} steps.{plan.tools.length > 0 ? ` You’ll need ${joinWords(plan.tools)}.` : ""}
                        </Body>
                        <Row>
                          <Btn label="Start" onPress={() => { showStep(0); setPhase("step"); }} />
                          {plan.specialTool === "cabinet_gap" && (
                            <LinkBtn label="Measure the gaps precisely" onPress={() => setPhase("cabinet")} />
                          )}
                        </Row>
                      </>
                    )}
                  </>
                )}

                {phase === "step" && plan && step && (
                  <>
                    <Small>Step {stepIdx + 1} of {plan.steps.length}</Small>
                    <Title>{step.text}</Title>
                    {!hasMarker && <Small>{reaim ? "Tap the spot on the screen." : "Not pinned yet. Choose Move marker, then tap the spot."}</Small>}
                    <Row>
                      <Btn label={stepIdx === plan.steps.length - 1 ? "Done" : "Next"}
                        onPress={() => (stepIdx === plan.steps.length - 1 ? setPhase("check") : showStep(stepIdx + 1))} />
                      <IconBtn label="Back" onPress={() => (stepIdx === 0 ? setPhase("plan") : showStep(stepIdx - 1))} />
                      <IconBtn label="Move marker" onPress={() => setReaim(true)} />
                    </Row>
                  </>
                )}

                {phase === "check" && (
                  <>
                    <Title>Point the camera at it, then check.</Title>
                    <Row>
                      <Btn label="Check my fix" onPress={runCheck} />
                      <IconBtn label="Back" onPress={() => setPhase("step")} />
                    </Row>
                  </>
                )}

                {phase === "result" && check && (
                  <>
                    <Bubble>{check.feedback}</Bubble>
                    {check.fixed ? (
                      <Row><Btn label="Fix something else" onPress={reset} /></Row>
                    ) : (
                      <Row>
                        <Btn label="Look again" onPress={() => runPlan(box)} />
                        <Btn label="Show steps again" kind="secondary" onPress={() => { if (plan) placeMarkers(plan, 0); showStep(0); setPhase("step"); }} />
                      </Row>
                    )}
                  </>
                )}
              </Sheet>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function joinWords(a: string[]) {
  const w = a.map((x) => x.charAt(0).toLowerCase() + x.slice(1));
  return w.length <= 1 ? w.join("") : `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}`;
}

const shadow = { textShadowColor: "rgba(0,0,0,0.55)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  center: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 8 },
  ask: { color: "#fff", ...T.display, textAlign: "center", width: "100%", maxWidth: 520, ...shadow },
  dim: { backgroundColor: "rgba(0,0,0,0.22)" },
  topFade: { position: "absolute", top: 0, left: 0, right: 0 },
  topBar: { position: "absolute", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  requestText: { color: C.sub, ...T.small, ...shadow, maxWidth: 460 },
  trackingText: { color: C.warn, ...T.small, ...shadow },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  input: { width: 300, height: 44, borderBottomWidth: 1, borderBottomColor: C.line, color: C.text, ...T.body, paddingHorizontal: 0 },
});
