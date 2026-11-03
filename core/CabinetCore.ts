/**
 * ARdlabor core logic: no Lens Studio APIs in here, so it runs the same in the Lens and in Node tests.
 *
 *   measurements (from scan_session.json or live scanners)
 *     -> deriveMetrics()  e.g. top_imbalance_mm
 *     -> diagnose()       Finding[] with confidence + evidence
 *     -> planFix()        FixStep[] (one screw, one direction, what to re-measure)
 *     -> FixVerifier      after each "Check": pass / repeat / reverse / give up
 */

// ---------- types ----------

export type Range = [number, number];

export interface Measurement {
  id: string;
  mm: number | null;
  target?: Range;
  by?: "gap" | "geometry" | "ruler" | "motion";
  samples?: number;
  spread_mm?: number;
}

export interface ScanSession {
  version: number;
  door: { id: string; width_mm: number; height_mm: number; hinge_side: "left" | "right" };
  measurements: Measurement[];
  hinges?: { id: string; frames: { hinge_type?: string; confidence?: number }[] }[];
  observed?: { axis_wobble_mm?: number; wobble_hinge?: string };
}

export type FaultKind = "door_sag" | "door_height" | "not_flush" | "loose_hinge";

export interface Finding {
  fault: FaultKind;
  summary: string;
  evidence: string[];
  confidence: number;
  hinge: "hinge_top" | "hinge_bottom";
  screw: "side" | "depth" | "height" | "mounting";
  /** Which way the door should move, in plain words, shown on the card. */
  goal: string;
  recheck: string;
  recheckTarget: Range;
}

export interface FixStep {
  id: string;
  text: string;
  hinge: Finding["hinge"];
  screw: Finding["screw"];
  turn?: "cw" | "ccw";
  quarterTurns?: number;
  safety?: boolean;
  confirmOnly?: boolean;
  recheck?: string;
  recheckTarget?: Range;
}

// ---------- settings ----------

export const RULES = {
  sagImbalanceMm: 1.5,   // top gap differs end-to-end by more than this -> sag
  sideImbalanceMm: 1.5,  // handle-side gap differs top-to-bottom by more than this -> sag
  imbalanceTarget: [0, 1.0] as Range,
  gapTarget: [2.0, 3.0] as Range,
  flushMaxMm: 1.5,
  flushTarget: [0, 1.0] as Range,
  wobbleMaxMm: 2.0,
  noiseMm: 0.3,          // changes smaller than this count as "no change"
  maxMisses: 3,
  maxTurns: 8,
  lowConfidence: 0.6,
};

// ---------- metrics ----------

export function byId(ms: Measurement[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of ms) if (m.mm !== null && m.mm !== undefined && isFinite(m.mm)) out[m.id] = m.mm;
  return out;
}

export function spreadOf(ms: Measurement[], id: string): number {
  const m = ms.find((x) => x.id === id);
  return m && typeof m.spread_mm === "number" ? m.spread_mm : 0;
}

/** Derived values the rules and the Verifier both use. Signed: + means the handle end/top is bigger. */
export function deriveMetrics(ms: Measurement[]): Record<string, number> {
  const v = byId(ms);
  const d: Record<string, number> = { ...v };
  if ("gap_top_handle" in v && "gap_top_hinge" in v) {
    d.top_imbalance_signed = v.gap_top_handle - v.gap_top_hinge;
    d.top_imbalance_mm = Math.abs(d.top_imbalance_signed);
    d.top_gap_mean = (v.gap_top_handle + v.gap_top_hinge) / 2;
  }
  if ("gap_side_top" in v && "gap_side_bottom" in v) {
    d.side_imbalance_signed = v.gap_side_top - v.gap_side_bottom;
    d.side_imbalance_mm = Math.abs(d.side_imbalance_signed);
  }
  const flush = Object.keys(v).filter((k) => k.startsWith("flush_"));
  if (flush.length) {
    const worst = flush.reduce((a, b) => (Math.abs(v[a]) >= Math.abs(v[b]) ? a : b));
    d.flush_worst_mm = Math.abs(v[worst]);
    d.flush_worst_is_top = worst.includes("top") ? 1 : 0;
  }
  return d;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** More confident the further past the threshold, less confident when samples disagree. */
function confidence(excessMm: number, spreadMm: number, nEvidence: number): number {
  return Math.round(clamp01(0.55 + 0.12 * excessMm - 0.15 * spreadMm + 0.05 * (nEvidence - 1)) * 100) / 100;
}

const fmt = (x: number) => (Math.round(x * 10) / 10).toFixed(1);

// ---------- diagnosis ----------

export function diagnose(session: ScanSession): Finding[] {
  const ms = session.measurements;
  const m = deriveMetrics(ms);
  const out: Finding[] = [];

  // Sag: the door has rotated in its own plane.
  const topSag = (m.top_imbalance_mm ?? 0) > RULES.sagImbalanceMm;
  const sideSag = (m.side_imbalance_mm ?? 0) > RULES.sideImbalanceMm;
  if (topSag || sideSag) {
    const evidence: string[] = [];
    let excess = 0;
    let spread = 0;
    if (topSag) {
      evidence.push("gap_top_handle", "gap_top_hinge");
      excess += m.top_imbalance_mm - RULES.sagImbalanceMm;
      spread = Math.max(spread, spreadOf(ms, "gap_top_handle"), spreadOf(ms, "gap_top_hinge"));
    }
    if (sideSag) {
      evidence.push("gap_side_top", "gap_side_bottom");
      excess += m.side_imbalance_mm - RULES.sideImbalanceMm;
      spread = Math.max(spread, spreadOf(ms, "gap_side_top"), spreadOf(ms, "gap_side_bottom"));
    }
    // Handle end dropped (top gap bigger at the handle end, or side gap opens at the top).
    const handleDropped = topSag ? m.top_imbalance_signed > 0 : m.side_imbalance_signed > 0;
    const useTop = topSag;
    const amount = useTop ? m.top_imbalance_mm : m.side_imbalance_mm;
    out.push({
      fault: "door_sag",
      summary: handleDropped
        ? `Door sags ${fmt(amount)} mm on the handle side.`
        : `Door tilts up ${fmt(amount)} mm on the handle side.`,
      evidence,
      confidence: confidence(excess, spread, evidence.length / 2),
      hinge: "hinge_top",
      screw: "side",
      goal: handleDropped ? "Pull the top of the door toward the hinge side." : "Push the top of the door away from the hinge side.",
      recheck: useTop ? "top_imbalance_mm" : "side_imbalance_mm",
      recheckTarget: RULES.imbalanceTarget,
    });
  } else if (m.top_gap_mean !== undefined) {
    // Level but the whole door sits too high or too low.
    const [lo, hi] = RULES.gapTarget;
    const g = m.top_gap_mean;
    if (g < lo - 0.5 || g > hi + 0.5) {
      out.push({
        fault: "door_height",
        summary: g > hi ? `Door sits ${fmt(g - hi)} mm too low.` : `Door sits ${fmt(lo - g)} mm too high.`,
        evidence: ["gap_top_handle", "gap_top_hinge"],
        confidence: confidence(Math.max(lo - g, g - hi), spreadOf(ms, "gap_top_handle"), 1),
        hinge: "hinge_top",
        screw: "height",
        goal: g > hi ? "Raise the door." : "Lower the door.",
        recheck: "top_gap_mean",
        recheckTarget: RULES.gapTarget,
      });
    }
  }

  if ((m.flush_worst_mm ?? 0) > RULES.flushMaxMm) {
    const top = m.flush_worst_is_top === 1;
    out.push({
      fault: "not_flush",
      summary: `A ${top ? "top" : "bottom"} corner sticks out ${fmt(m.flush_worst_mm)} mm.`,
      evidence: Object.keys(m).filter((k) => k.startsWith("flush_") && k !== "flush_worst_mm" && k !== "flush_worst_is_top"),
      confidence: confidence(m.flush_worst_mm - RULES.flushMaxMm, 0, 1),
      hinge: top ? "hinge_top" : "hinge_bottom",
      screw: "depth",
      goal: "Pull that corner in toward the cabinet.",
      recheck: "flush_worst_mm",
      recheckTarget: RULES.flushTarget,
    });
  }

  const wob = session.observed?.axis_wobble_mm;
  if (typeof wob === "number" && wob > RULES.wobbleMaxMm) {
    out.push({
      fault: "loose_hinge",
      summary: `The hinge moves ${fmt(wob)} mm while the door swings.`,
      evidence: ["axis_wobble_mm"],
      confidence: confidence(wob - RULES.wobbleMaxMm, 0, 1),
      hinge: session.observed?.wobble_hinge === "hinge_bottom" ? "hinge_bottom" : "hinge_top",
      screw: "mounting",
      goal: "Tighten the hinge to the cabinet.",
      recheck: "axis_wobble_mm",
      recheckTarget: [0, RULES.wobbleMaxMm],
    });
  }

  // Loose hinges first (adjusting a loose hinge is pointless), then the most confident.
  const order: Record<FaultKind, number> = { loose_hinge: 0, door_sag: 1, door_height: 2, not_flush: 3 };
  return out.sort((a, b) => order[a.fault] - order[b.fault] || b.confidence - a.confidence);
}

// ---------- fix planning ----------

const HINGE_NAME: Record<Finding["hinge"], string> = { hinge_top: "top hinge", hinge_bottom: "bottom hinge" };

export function planFix(f: Finding): FixStep[] {
  const steps: FixStep[] = [];
  if (f.fault === "loose_hinge") {
    steps.push({ id: "support", text: "Hold the door up with one hand so its weight is off the hinge.", hinge: f.hinge, screw: "mounting", safety: true, confirmOnly: true });
    steps.push({ id: "tighten", text: `Tighten the mounting screws on the ${HINGE_NAME[f.hinge]} until snug. Stop if a screw keeps spinning.`, hinge: f.hinge, screw: "mounting", turn: "cw", recheck: f.recheck, recheckTarget: f.recheckTarget });
    return steps;
  }
  steps.push({ id: "open", text: `Open the door to about 90° so you can reach the ${HINGE_NAME[f.hinge]}.`, hinge: f.hinge, screw: f.screw, confirmOnly: true });
  const name = f.screw === "side" ? "side-adjust screw" : f.screw === "depth" ? "depth screw" : "height adjuster";
  steps.push({
    id: "adjust",
    text: `${f.goal} Turn the ${name} a quarter turn, then close the door and press Check.`,
    hinge: f.hinge,
    screw: f.screw,
    turn: "cw", // first guess; the Verifier flips it if the rescan gets worse
    quarterTurns: 1,
    recheck: f.recheck,
    recheckTarget: f.recheckTarget,
  });
  return steps;
}

// ---------- verification ----------

export type Verdict = "pass" | "improved" | "no_change" | "worse" | "give_up";

export interface VerifyResult {
  verdict: Verdict;
  turn: "cw" | "ccw";
  quarterTurns: number;
  message: string;
  before: number;
  after: number;
  misses: number;
  turns: number;
}

/** How far a value is outside its target range (0 when inside). */
export function errorOf(v: number, t: Range): number {
  return v < t[0] ? t[0] - v : v > t[1] ? v - t[1] : 0;
}

/**
 * Decides what to do after each rescan. It never assumes which way a screw moves the door:
 * it starts clockwise and reverses as soon as a measurement gets worse.
 */
export class FixVerifier {
  readonly target: Range;
  /** Value before the first turn, for the final before/after. */
  readonly initial: number;
  private last: number;
  private turn: "cw" | "ccw";
  private misses = 0;
  private turns = 0;
  readonly history: { value: number; turn: "cw" | "ccw" }[] = [];

  constructor(initial: number, target: Range, firstTurn: "cw" | "ccw" = "cw") {
    this.last = initial;
    this.initial = initial;
    this.target = target;
    this.turn = firstTurn;
  }

  get currentTurn(): "cw" | "ccw" {
    return this.turn;
  }

  check(after: number): VerifyResult {
    const before = this.last;
    this.turns += 1;
    this.history.push({ value: after, turn: this.turn });
    this.last = after;
    const eBefore = errorOf(before, this.target);
    const eAfter = errorOf(after, this.target);
    const base = { before, after, misses: this.misses, turns: this.turns };
    const show = `${fmt(before)} → ${fmt(after)} mm (target ${this.target[0]}–${this.target[1]})`;

    if (eAfter === 0) {
      return { ...base, verdict: "pass", turn: this.turn, quarterTurns: 0, message: `Fixed: ${show}.` };
    }
    let verdict: Verdict;
    let qt = 1;
    let message: string;
    if (eBefore - eAfter > RULES.noiseMm) {
      verdict = "improved";
      // Big remaining error and a big step: suggest the same size again; near target: same quarter turn.
      message = `Better: ${show}. Same direction, another quarter turn.`;
    } else if (eAfter - eBefore > RULES.noiseMm) {
      verdict = "worse";
      this.misses += 1;
      this.turn = this.turn === "cw" ? "ccw" : "cw";
      qt = 2; // undo the wrong turn, then one in the right direction
      message = `That made it worse: ${show}. Turn the other way, half a turn.`;
    } else {
      verdict = "no_change";
      this.misses += 1;
      qt = 2;
      message = `No change: ${show}. Make sure the screwdriver is seated, then try half a turn.`;
    }
    if (this.misses >= RULES.maxMisses || this.turns >= RULES.maxTurns) {
      return { ...base, misses: this.misses, verdict: "give_up", turn: this.turn, quarterTurns: 0,
        message: `Still ${show} after ${this.turns} tries. The hinge may be worn or the wrong screw. A carpenter can check it.` };
    }
    return { ...base, misses: this.misses, verdict, turn: this.turn, quarterTurns: qt, message };
  }
}

/** Convenience: run a whole session through diagnosis. */
export function topFinding(session: ScanSession): Finding | null {
  const fs = diagnose(session);
  return fs.length ? fs[0] : null;
}

export function needsCloserLook(f: Finding): boolean {
  return f.confidence < RULES.lowConfidence;
}
