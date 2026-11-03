/**
 * General repair planning: what to ask the vision model, and how to read and police its answer.
 * No network or Lens/React code here, so it is unit-tested in Node.
 */

export type Norm = [number, number]; // [y, x] normalised 0-1000, Gemini's convention
export type NormBox = [number, number, number, number]; // [ymin, xmin, ymax, xmax]

export type Action =
  | "turn_cw" | "turn_ccw" | "tighten" | "loosen" | "pull" | "push" | "lift" | "press"
  | "remove" | "attach" | "clean" | "align" | "inspect" | "other";

export interface PlanStep {
  text: string;
  action: Action;
  point: Norm | null;
}

export interface RepairPlan {
  object: string;
  problem: string;
  confidence: number;
  safety: { level: "ok" | "caution" | "stop"; reason: string };
  tools: string[];
  steps: PlanStep[];
  specialTool: "cabinet_gap" | null;
}

export interface CheckResult {
  fixed: boolean;
  confidence: number;
  feedback: string;
  point: Norm | null;
}

export const MAX_STEPS = 6;

const ACTIONS: Action[] = ["turn_cw", "turn_ccw", "tighten", "loosen", "pull", "push", "lift", "press",
  "remove", "attach", "clean", "align", "inspect", "other"];

/** Jobs the app never walks someone through, whatever the model says. */
const STOP_PATTERNS: [RegExp, string][] = [
  [/\bgas\b|propane|lpg\b|butane/i, "Anything involving gas needs a licensed technician."],
  [/breaker|fuse ?box|electrical panel|mains|live wire|in.?wall wiring|outlet wiring|rewir/i, "Wiring inside walls, outlets or panels needs a licensed electrician."],
  [/magnetron|capacitor|high voltage|\bcrt\b|inside the (microwave|tv|monitor|power supply)/i, "The inside of this appliance stores dangerous voltage even when unplugged."],
  [/brake|airbag|fuel (line|tank)|steering/i, "Safety-critical vehicle parts need a mechanic."],
  [/asbestos|load.?bearing|structural|\broof(ing)?\b/i, "This is structural or hazardous work for a professional."],
  [/refrigerant|compressor|pressuri[sz]ed/i, "Sealed pressurised systems need a technician."],
];

export function buildPlanPrompt(request: string, box: NormBox | null): string {
  const where = box
    ? `The user drew a box around the thing at [ymin, xmin, ymax, xmax] = [${box.map((v) => Math.round(v)).join(", ")}] (normalised 0-1000).`
    : "The user did not draw a box; use the most prominent object in the centre.";
  return `You are ARdlabor, an AR repair assistant for ordinary household fixes.
The user said: "${request.replace(/"/g, "'")}".
${where}

Look at the camera image. Identify the object in the box, the most likely problem (use what the user said),
and a short owner-level repair plan that a beginner can do with common hand tools.

Rules:
- At most ${MAX_STEPS} steps. Each step is ONE short imperative sentence (max 14 words), plain words.
- For each step give "point": [y, x] normalised 0-1000 on THIS image, exactly on the part the user must touch
  (a screw, latch, hinge, knob...). Use null if that part is not visible.
- "action" is one of: ${ACTIONS.join(", ")}.
- Put any unplugging / switching off / supporting weight as the FIRST step.
- safety.level: "stop" if the job involves gas, wiring inside walls/outlets/panels, the inside of microwaves/TVs/power
  supplies, refrigerant, vehicle brakes/airbags/fuel, structural work, roofs, or needs a professional; "caution" if it
  needs unplugging, a sharp tool or lifting; otherwise "ok". If "stop", steps must be [] and reason must say who to call.
- If the image does not show something you can identify, set confidence below 0.4 and ask for a closer look in "problem".
- special_tool: "cabinet_gap" only if this is a cabinet/wardrobe door that sags, is uneven or will not close flush
  (concealed hinges); otherwise null.

Answer with JSON only:
{"object": string, "problem": string, "confidence": number,
 "safety": {"level": "ok"|"caution"|"stop", "reason": string},
 "tools": [string], "steps": [{"text": string, "action": string, "point": [y, x] | null}],
 "special_tool": "cabinet_gap" | null}`;
}

export function buildCheckPrompt(plan: RepairPlan): string {
  return `You are ARdlabor. Earlier you saw: ${plan.object}, problem: ${plan.problem}.
The user followed these steps: ${plan.steps.map((s, i) => `${i + 1}. ${s.text}`).join(" ")}
This new camera image is after their repair. Judge only from what is visible.
Answer with JSON only:
{"fixed": boolean, "confidence": number, "feedback": string (one short sentence, what still looks wrong or that it looks fixed),
 "point": [y, x] normalised 0-1000 of what still looks wrong, or null}`;
}

// ---------- reading the model's answer ----------

function num(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function point(v: unknown): Norm | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const y = Number(v[0]), x = Number(v[1]);
  if (!Number.isFinite(y) || !Number.isFinite(x)) return null;
  if (y < 0 || y > 1000 || x < 0 || x > 1000) return null;
  return [y, x];
}

function text(v: unknown, max = 160): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** The model sometimes wraps JSON in ``` fences or adds a sentence; pull the object out. */
export function extractJson(raw: string): unknown {
  const s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new Error("The AI answer was not readable. Try again.");
  }
}

export function safetyStop(textToCheck: string): string | null {
  for (const [re, why] of STOP_PATTERNS) if (re.test(textToCheck)) return why;
  return null;
}

export function parsePlan(raw: unknown): RepairPlan {
  const o = (typeof raw === "string" ? extractJson(raw) : raw) as Record<string, any>;
  if (!o || typeof o !== "object") throw new Error("The AI answer was empty. Try again.");
  const level = ["ok", "caution", "stop"].includes(o.safety?.level) ? o.safety.level : "caution";
  const steps: PlanStep[] = Array.isArray(o.steps)
    ? o.steps.slice(0, MAX_STEPS).map((s: any) => ({
        text: text(s?.text, 120),
        action: ACTIONS.includes(s?.action) ? s.action : "other",
        point: point(s?.point),
      })).filter((s: PlanStep) => s.text.length > 0)
    : [];
  const plan: RepairPlan = {
    object: text(o.object, 60) || "this",
    problem: text(o.problem, 160),
    confidence: num(o.confidence, 0, 1, 0.5),
    safety: { level, reason: text(o.safety?.reason, 200) },
    tools: Array.isArray(o.tools) ? o.tools.map((t: unknown) => text(t, 40)).filter(Boolean).slice(0, 5) : [],
    steps,
    specialTool: o.special_tool === "cabinet_gap" ? "cabinet_gap" : null,
  };
  // Our own limits win over the model's judgement.
  const why = safetyStop([plan.object, plan.problem, ...plan.steps.map((s) => s.text)].join(" "));
  if (why) {
    plan.safety = { level: "stop", reason: why };
  }
  if (plan.safety.level === "stop") plan.steps = [];
  return plan;
}

export function parseCheck(raw: unknown): CheckResult {
  const o = (typeof raw === "string" ? extractJson(raw) : raw) as Record<string, any>;
  return {
    fixed: o?.fixed === true,
    confidence: num(o?.confidence, 0, 1, 0.5),
    feedback: text(o?.feedback, 160) || (o?.fixed ? "Looks fixed." : "It doesn’t look fixed yet."),
    point: point(o?.point),
  };
}

// ---------- coordinates ----------

/** Screen box (any units) to Gemini's normalised [ymin, xmin, ymax, xmax]. */
export function toNormBox(x0: number, y0: number, x1: number, y1: number, w: number, h: number): NormBox {
  const c = (v: number) => Math.max(0, Math.min(1000, v));
  return [c((y0 / h) * 1000), c((x0 / w) * 1000), c((y1 / h) * 1000), c((x1 / w) * 1000)];
}

/** Gemini's normalised [y, x] to pixels in an image/view of size w x h. Returns [x, y]. */
export function fromNorm(p: Norm, w: number, h: number): [number, number] {
  return [(p[1] / 1000) * w, (p[0] / 1000) * h];
}

/** One-line headline for the plan card. */
export function headline(p: RepairPlan): string {
  if (p.safety.level === "stop") return `${cap(p.object)}: not a DIY job`;
  if (p.confidence < 0.4) return "I can’t tell what this is yet";
  return `${cap(p.object)}: ${p.problem.replace(/\.$/, "")}`;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
