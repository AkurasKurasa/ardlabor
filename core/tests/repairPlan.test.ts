import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlan, parseCheck, buildPlanPrompt, toNormBox, fromNorm, headline, extractJson, safetyStop } from "../repairPlan.ts";

const good = {
  object: "kitchen cabinet door", problem: "door sags on the handle side", confidence: 0.82,
  safety: { level: "ok", reason: "" }, tools: ["Phillips screwdriver"],
  steps: [
    { text: "Open the door to 90 degrees.", action: "pull", point: [400, 600] },
    { text: "Turn the side screw on the top hinge a quarter turn.", action: "turn_cw", point: [180, 220] },
  ],
  special_tool: "cabinet_gap",
};

test("parses a normal plan", () => {
  const p = parsePlan(good);
  assert.equal(p.steps.length, 2);
  assert.deepEqual(p.steps[1].point, [180, 220]);
  assert.equal(p.steps[1].action, "turn_cw");
  assert.equal(p.specialTool, "cabinet_gap");
  assert.equal(headline(p), "Kitchen cabinet door: door sags on the handle side");
});

test("reads JSON wrapped in fences or chatter", () => {
  const p = parsePlan("Sure! ```json\n" + JSON.stringify(good) + "\n```");
  assert.equal(p.object, "kitchen cabinet door");
  assert.throws(() => extractJson("no json here"));
});

test("cleans bad fields", () => {
  const p = parsePlan({ ...good, confidence: "7", steps: [
    { text: "x".repeat(300), action: "dance", point: [2000, 5] },
    { text: "", action: "pull", point: [1, 1] },
    ...Array(10).fill({ text: "Tighten it.", action: "tighten", point: null }),
  ] });
  assert.equal(p.confidence, 1);
  assert.equal(p.steps[0].action, "other");
  assert.equal(p.steps[0].point, null);
  assert.ok(p.steps[0].text.length <= 120);
  assert.ok(p.steps.length <= 6);
});

test("our safety limits override the model", () => {
  const p = parsePlan({ ...good, object: "wall outlet", problem: "loose outlet wiring", safety: { level: "ok", reason: "" } });
  assert.equal(p.safety.level, "stop");
  assert.equal(p.steps.length, 0);
  assert.match(p.safety.reason, /electrician/);
  assert.match(headline(p), /not a DIY job/);
  assert.equal(safetyStop("tighten the cabinet knob"), null);
  assert.ok(safetyStop("check the gas valve"));
  assert.ok(safetyStop("replace the capacitor inside the microwave"));
});

test("model's own stop clears steps", () => {
  const p = parsePlan({ ...good, safety: { level: "stop", reason: "Call a plumber." } });
  assert.equal(p.steps.length, 0);
});

test("low confidence headline asks for a closer look", () => {
  assert.match(headline(parsePlan({ ...good, confidence: 0.2 })), /can’t tell/);
});

test("check result", () => {
  assert.deepEqual(parseCheck({ fixed: true, confidence: 0.9, feedback: "Gap is even now.", point: null }),
    { fixed: true, confidence: 0.9, feedback: "Gap is even now.", point: null });
  assert.equal(parseCheck('{"fixed": "yes"}').fixed, false);
});

test("coordinates round trip", () => {
  const b = toNormBox(100, 200, 300, 600, 400, 800);
  assert.deepEqual(b, [250, 250, 750, 750]);
  assert.deepEqual(fromNorm([500, 250], 1080, 2400), [270, 1200]);
});

test("prompt mentions the box and the request", () => {
  const s = buildPlanPrompt('my "fan" wobbles', [100, 200, 300, 400]);
  assert.match(s, /\[100, 200, 300, 400\]/);
  assert.match(s, /my 'fan' wobbles/);
});
