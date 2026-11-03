/**
 * Understands what the user asked for ("computah, help me fix this cabinet door, it sags"),
 * offline and without an AI call. Covers English and common Taglish phrasing.
 */

export type Target = "cabinet_door" | "drawer" | "unknown";
export type Symptom = "sag" | "height" | "not_flush" | "loose" | "wont_close" | "unknown";

export interface Request {
  target: Target;
  symptom: Symptom;
  /** What the assistant says back. */
  reply: string;
  supported: boolean;
}

const has = (t: string, words: string[]) => words.some((w) => new RegExp(`\\b${w}`, "i").test(t));

export function parseRequest(raw: string): Request {
  const t = raw.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
  let target: Target = "unknown";
  if (has(t, ["drawer", "drawers", "kahon", "lalagyan"])) target = "drawer";
  if (has(t, ["cabinet", "cupboard", "aparador", "kabinet", "door", "pinto", "pintuan", "hinge", "bisagra", "wardrobe"])) target = "cabinet_door";

  let symptom: Symptom = "unknown";
  if (has(t, ["sag", "sags", "sagging", "droop", "crooked", "tilt", "uneven", "baluktot", "tabingi", "nakalaylay", "lowered"])) symptom = "sag";
  else if (has(t, ["too low", "too high", "rub", "rubs", "scrape", "kumikiskis"])) symptom = "height";
  else if (has(t, ["sticks out", "stick out", "not flush", "flush", "protrud", "nakausli"])) symptom = "not_flush";
  else if (has(t, ["loose", "wobbl", "wiggl", "maluwag", "umuuga"])) symptom = "loose";
  else if (has(t, ["won t close", "wont close", "doesn t close", "not closing", "hindi sumasara", "ayaw sumara"])) symptom = "wont_close";

  const SYMPTOM_TEXT: Record<Symptom, string> = {
    sag: "it sags", height: "it rubs or sits too high or low", not_flush: "it sticks out",
    loose: "the hinge feels loose", wont_close: "it won’t close properly", unknown: "",
  };

  if (target === "drawer") {
    return { target, symptom, supported: false,
      reply: "Drawers are coming soon. Right now I can fix cabinet doors. Is there a door you want to fix?" };
  }
  if (target === "unknown") {
    return { target: "cabinet_door", symptom, supported: true,
      reply: "I’ll treat this as a cabinet door. Draw a box around it." };
  }
  const heard = symptom === "unknown" ? "" : ` You said ${SYMPTOM_TEXT[symptom]}, so I’ll check that first.`;
  return { target, symptom, supported: true, reply: `Cabinet door, got it.${heard}` };
}

/** After measuring: does what we found agree with what the user said? */
export function compareWithSymptom(symptom: Symptom, faults: string[]): string | null {
  if (symptom === "unknown") return null;
  const expect: Record<Exclude<Symptom, "unknown">, string[]> = {
    sag: ["door_sag"], height: ["door_height", "door_sag"], not_flush: ["not_flush"], loose: ["loose_hinge"],
    wont_close: ["not_flush", "door_sag", "door_height"],
  };
  if (faults.some((f) => expect[symptom].includes(f))) return null;
  if (faults.length === 0) {
    return symptom === "loose"
      ? "The gaps look even. A loose hinge shows when the door moves: open and close it and see if it wobbles."
      : "You described a problem, but the gaps measure even. Try a closer capture of the edge that bothers you.";
  }
  return "I found something different from what you described. I’ll start with what I measured.";
}
