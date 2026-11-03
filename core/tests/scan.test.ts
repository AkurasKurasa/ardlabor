import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultCorners, fitSize, mergeMeasurements, toMeasurements, validDoorMm, MAX_SIDE_PX } from "../../app/lib/scan.ts";
import { orderCorners } from "../gapscan.ts";

test("fitSize shrinks the long side to the cap and keeps the aspect ratio", () => {
  assert.deepEqual(fitSize(4000, 3000), { width: MAX_SIDE_PX, height: 1500 });
  assert.deepEqual(fitSize(3000, 4000), { width: 1500, height: MAX_SIDE_PX });
});

test("fitSize never upscales small photos", () => {
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
});

test("fitSize rejects empty or broken image sizes", () => {
  assert.throws(() => fitSize(0, 600));
  assert.throws(() => fitSize(800, NaN));
});

test("defaultCorners sit inside the photo and are already in TL, TR, BR, BL order", () => {
  const c = defaultCorners(1000, 2000);
  for (const [x, y] of c) assert.ok(x > 0 && x < 1000 && y > 0 && y < 2000);
  assert.deepEqual(orderCorners(c), c);
});

test("validDoorMm accepts cabinet sizes and rejects junk", () => {
  assert.ok(validDoorMm(400));
  assert.ok(validDoorMm(50));
  assert.ok(!validDoorMm(49));
  assert.ok(!validDoorMm(3001));
  assert.ok(!validDoorMm(NaN));
});

test("toMeasurements keeps unreadable gaps as null so the diagnosis can see they are missing", () => {
  const ms = toMeasurements({ top_l: { mm: 2.1, spread_mm: 0.3, n: 5 }, top_r: { mm: null, spread_mm: null, n: 1 } }, [1.5, 3]);
  assert.deepEqual(ms, [
    { id: "top_l", mm: 2.1, target: [1.5, 3], by: "gap", samples: 5, spread_mm: 0.3 },
    { id: "top_r", mm: null, target: [1.5, 3], by: "gap", samples: 1, spread_mm: undefined },
  ]);
});

test("toMeasurements on an empty scan gives no measurements", () => {
  assert.deepEqual(toMeasurements({}, [1.5, 3]), []);
});

test("mergeMeasurements keeps old values for gaps the new photo missed", () => {
  const merged = mergeMeasurements(
    [{ id: "a", mm: 1 }, { id: "b", mm: 2 }],
    [{ id: "a", mm: 3 }, { id: "b", mm: null }],
  );
  assert.deepEqual(merged, [{ id: "a", mm: 3 }, { id: "b", mm: 2 }]);
});
