import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRequest, compareWithSymptom } from "../intent.ts";

test("cabinet door request", () => {
  const r = parseRequest("computah, help me fix this cabinet door");
  assert.equal(r.target, "cabinet_door");
  assert.equal(r.symptom, "unknown");
  assert.ok(r.supported);
});

test("symptom is picked up", () => {
  assert.equal(parseRequest("the cupboard door sags on one side").symptom, "sag");
  assert.equal(parseRequest("door won't close").symptom, "wont_close");
  assert.equal(parseRequest("hinge is loose and wobbly").symptom, "loose");
  assert.equal(parseRequest("the door sticks out at the top").symptom, "not_flush");
});

test("taglish", () => {
  const r = parseRequest("ayusin mo yung pinto ng aparador, tabingi");
  assert.equal(r.target, "cabinet_door");
  assert.equal(r.symptom, "sag");
});

test("drawer not supported yet", () => {
  const r = parseRequest("fix my drawer");
  assert.equal(r.target, "drawer");
  assert.equal(r.supported, false);
});

test("vague request falls back to door", () => {
  const r = parseRequest("help me fix this");
  assert.equal(r.target, "cabinet_door");
  assert.ok(r.supported);
});

test("symptom vs findings", () => {
  assert.equal(compareWithSymptom("sag", ["door_sag"]), null);
  assert.match(compareWithSymptom("sag", [])!, /measure even/);
  assert.match(compareWithSymptom("loose", [])!, /wobbles/);
  assert.match(compareWithSymptom("not_flush", ["door_sag"])!, /different/);
});
