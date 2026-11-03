import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  deriveMetrics, diagnose, planFix, FixVerifier, errorOf, needsCloserLook,
  type ScanSession, type Measurement,
} from "../CabinetCore.ts";

const door = { id: "d", width_mm: 400, height_mm: 700, hinge_side: "left" as const };
const ms = (o: Record<string, number>): Measurement[] =>
  Object.entries(o).map(([id, mm]) => ({ id, mm, spread_mm: 0.2, samples: 4 }));
const session = (o: Record<string, number>, extra: Partial<ScanSession> = {}): ScanSession =>
  ({ version: 1, door, measurements: ms(o), ...extra });

test("derived imbalance", () => {
  const m = deriveMetrics(ms({ gap_top_hinge: 2, gap_top_handle: 7 }));
  assert.equal(m.top_imbalance_mm, 5);
  assert.equal(m.top_imbalance_signed, 5);
});

test("sagging door -> top hinge side screw, pull toward hinge", () => {
  const f = diagnose(session({ gap_top_hinge: 2, gap_top_handle: 7, gap_side_top: 4, gap_side_bottom: 2 }));
  assert.equal(f[0].fault, "door_sag");
  assert.equal(f[0].hinge, "hinge_top");
  assert.equal(f[0].screw, "side");
  assert.match(f[0].goal, /toward the hinge/);
  assert.match(f[0].summary, /sags 5\.0 mm/);
  assert.ok(f[0].confidence > 0.8, `confidence ${f[0].confidence}`);
});

test("door tilted up -> push away", () => {
  const f = diagnose(session({ gap_top_hinge: 6, gap_top_handle: 2 }));
  assert.match(f[0].goal, /away from/);
});

test("level but too low -> height", () => {
  const f = diagnose(session({ gap_top_hinge: 5, gap_top_handle: 5.4 }));
  assert.equal(f[0].fault, "door_height");
  assert.match(f[0].goal, /Raise/);
});

test("good door -> no findings", () => {
  assert.equal(diagnose(session({ gap_top_hinge: 2.4, gap_top_handle: 2.8, gap_side_top: 2.5, gap_side_bottom: 2.6, flush_top_handle: 0.5 })).length, 0);
});

test("not flush -> depth screw on top hinge", () => {
  const f = diagnose(session({ gap_top_hinge: 2.5, gap_top_handle: 2.5, flush_top_handle: 4 }));
  assert.equal(f[0].fault, "not_flush");
  assert.equal(f[0].screw, "depth");
  assert.equal(f[0].hinge, "hinge_top");
});

test("loose hinge comes before sag", () => {
  const f = diagnose(session({ gap_top_hinge: 2, gap_top_handle: 7 }, { observed: { axis_wobble_mm: 4, wobble_hinge: "hinge_bottom" } }));
  assert.equal(f[0].fault, "loose_hinge");
  assert.equal(f[0].hinge, "hinge_bottom");
  assert.equal(f[1].fault, "door_sag");
});

test("noisy evidence lowers confidence", () => {
  const s = session({ gap_top_hinge: 2, gap_top_handle: 3.8 });
  s.measurements.forEach((m) => (m.spread_mm = 2.5));
  const f = diagnose(s)[0];
  assert.ok(needsCloserLook(f), `confidence ${f.confidence}`);
});

test("fix plan ends with a measured step", () => {
  const f = diagnose(session({ gap_top_hinge: 2, gap_top_handle: 7 }))[0];
  const steps = planFix(f);
  const last = steps[steps.length - 1];
  assert.equal(last.recheck, "top_imbalance_mm");
  assert.equal(last.turn, "cw");
});

test("verifier: improving run reaches pass", () => {
  const v = new FixVerifier(5, [0, 1]);
  assert.equal(v.check(3.2).verdict, "improved");
  assert.equal(v.check(1.6).verdict, "improved");
  const r = v.check(0.7);
  assert.equal(r.verdict, "pass");
  assert.match(r.message, /Fixed/);
});

test("verifier: wrong direction flips the arrow", () => {
  const v = new FixVerifier(5, [0, 1]);
  const r = v.check(6.4);
  assert.equal(r.verdict, "worse");
  assert.equal(r.turn, "ccw");
  assert.equal(r.quarterTurns, 2);
  assert.equal(v.check(3.5).verdict, "improved");
  assert.equal(v.currentTurn, "ccw");
});

test("verifier: gives up after 3 misses", () => {
  const v = new FixVerifier(5, [0, 1]);
  v.check(5.1);
  v.check(5.0);
  const r = v.check(5.05);
  assert.equal(r.verdict, "give_up");
  assert.match(r.message, /carpenter/);
});

test("errorOf", () => {
  assert.equal(errorOf(2.5, [2, 3]), 0);
  assert.equal(errorOf(1, [2, 3]), 1);
  assert.equal(errorOf(4.5, [2, 3]), 1.5);
});

const fake = process.env.ARDLABOR_SESSION;
test("real bake output diagnoses", { skip: !fake || !existsSync(fake) }, () => {
  const s = JSON.parse(readFileSync(fake!, "utf8")) as ScanSession;
  const f = diagnose(s);
  assert.equal(f[0].fault, "door_sag");
  const v = new FixVerifier(deriveMetrics(s.measurements)[f[0].recheck], f[0].recheckTarget);
  const rs = (s as any).rescans[0].gaps;
  const after = Math.abs(rs.gap_top_handle - rs.gap_top_hinge);
  console.log("bake ->", f[0].summary, "|", v.check(after).message);
});
