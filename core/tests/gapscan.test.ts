import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { measureGaps, homography, applyH, orderCorners, type Gray, type Pt } from "../gapscan.ts";

function readPgm(path: string): Gray {
  const buf = readFileSync(path);
  // P5\n<w> <h>\n<max>\n<bytes>
  let pos = 0;
  const tokens: string[] = [];
  while (tokens.length < 4) {
    while (/\s/.test(String.fromCharCode(buf[pos]))) pos++;
    let s = "";
    while (!/\s/.test(String.fromCharCode(buf[pos]))) s += String.fromCharCode(buf[pos++]);
    tokens.push(s);
  }
  pos++;
  const [, w, h] = tokens;
  return { width: +w, height: +h, data: new Uint8Array(buf.buffer, buf.byteOffset + pos, +w * +h) };
}

test("homography maps the 4 points", () => {
  const src: Pt[] = [[0, 0], [400, 0], [400, 700], [0, 700]];
  const dst: Pt[] = [[100, 120], [900, 90], [950, 1500], [80, 1450]];
  const H = homography(src, dst);
  for (let i = 0; i < 4; i++) {
    const [x, y] = applyH(H, src[i][0], src[i][1]);
    assert.ok(Math.abs(x - dst[i][0]) < 1e-6 && Math.abs(y - dst[i][1]) < 1e-6);
  }
});

test("orderCorners handles any click order", () => {
  const o = orderCorners([[950, 1500], [100, 120], [80, 1450], [900, 90]]);
  assert.deepEqual(o, [[100, 120], [900, 90], [950, 1500], [80, 1450]]);
});

const FIX = process.env.GAPSCAN_FIXTURES;
test("TypeScript port matches Python and the true gaps", { skip: !FIX || !existsSync(FIX) }, () => {
  const fx = JSON.parse(readFileSync(FIX!, "utf8"));
  for (const f of fx) {
    const img = readPgm(f.file);
    const got = measureGaps(img, f.corners, 400, 700, f.side);
    for (const k of Object.keys(f.truth)) {
      const ts = got[k].mm;
      assert.notEqual(ts, null, `${k} missing in ${f.file}`);
      assert.ok(Math.abs(ts! - f.python[k]) < 0.25, `${k}: ts ${ts} vs python ${f.python[k]} (${f.file})`);
      assert.ok(Math.abs(ts! - f.truth[k]) < 0.7, `${k}: ts ${ts} vs truth ${f.truth[k]} (${f.file})`);
    }
  }
});
