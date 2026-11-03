"""Turn photos of the broken cabinet into scan_session.json for the Lens.

Usage (from the repo root):
    python tools/scan_bake/bake.py scan            # click corners, measure gaps, write the session
    python tools/scan_bake/bake.py scan --vlm      # also send hinge close-ups to Gemini (needs GEMINI_API_KEY)
    python tools/scan_bake/bake.py scan --reclick  # redo corner clicks

Reads   scan/truth.json, scan/photos/*.jpg
Writes  scan/corners.json, scan/scan_session.json, scan/annotated/*.jpg
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import sys
import urllib.request
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gapscan import annotate, measure_gaps, order_corners  # noqa: E402

GAP_TARGET = [2.0, 3.0]
IMG_EXT = {".jpg", ".jpeg", ".png"}


# ---------- corner clicking ----------

def click_corners(path: Path):
    img = cv2.imread(str(path))
    if img is None:
        raise SystemExit(f"Can't read {path}")
    scale = min(1.0, 1400 / img.shape[1], 900 / img.shape[0])
    view = cv2.resize(img, None, fx=scale, fy=scale)
    pts: list[tuple[float, float]] = []
    win = f"Click the 4 corners of the DOOR FACE ({path.name})  -  u = undo, Enter = done, Esc = skip"

    def on_mouse(ev, x, y, *_):
        if ev == cv2.EVENT_LBUTTONDOWN and len(pts) < 4:
            pts.append((x / scale, y / scale))

    cv2.namedWindow(win, cv2.WINDOW_AUTOSIZE)
    cv2.setMouseCallback(win, on_mouse)
    while True:
        v = view.copy()
        for i, (x, y) in enumerate(pts):
            cv2.circle(v, (int(x * scale), int(y * scale)), 6, (0, 255, 255), -1)
            cv2.putText(v, str(i + 1), (int(x * scale) + 8, int(y * scale) - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        if len(pts) == 4:
            cv2.polylines(v, [(order_corners(pts) * scale).astype(np.int32)], True, (0, 255, 0), 2)
        cv2.imshow(win, v)
        k = cv2.waitKey(20) & 0xFF
        if k == ord("u") and pts:
            pts.pop()
        elif k in (13, 10) and len(pts) == 4:
            break
        elif k == 27:
            pts = []
            break
    cv2.destroyWindow(win)
    return order_corners(pts).tolist() if len(pts) == 4 else None


# ---------- vision model ----------

VLM_PROMPT = """You are looking at a close-up of a kitchen/furniture cabinet hinge, door open.
Return JSON only:
{"hinge_type": "concealed_cup" | "surface" | "piano" | "other",
 "confidence": 0-1,
 "screws": [{"box_2d": [ymin, xmin, ymax, xmax], "role_guess": "side" | "depth" | "height" | "mounting" | "unknown",
             "role_confidence": 0-1}],
 "visible_damage": "short description or empty string"}
box_2d is normalised to 0-1000. For a concealed (cup) hinge: "side" is the adjustment screw on the hinge arm
nearest the door edge, "depth" is the other screw on the arm, "mounting" screws hold the plate or cup to the wood.
Only include screws you can actually see."""


def ask_gemini(path: Path, model: str):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise SystemExit("Set GEMINI_API_KEY to use --vlm (get one at aistudio.google.com).")
    data = base64.b64encode(path.read_bytes()).decode()
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    body = {"contents": [{"parts": [{"inline_data": {"mime_type": mime, "data": data}}, {"text": VLM_PROMPT}]}],
            "generationConfig": {"response_mime_type": "application/json", "temperature": 0.1}}
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": key})
    with urllib.request.urlopen(req, timeout=90) as r:
        resp = json.load(r)
    text = resp["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)


def hinge_frame(path: Path, res: dict, out_dir: Path):
    img = cv2.imread(str(path))
    h, w = img.shape[:2]
    screws = []
    for s in res.get("screws", []):
        y0, x0, y1, x1 = s["box_2d"]
        box = [x0 * w / 1000, y0 * h / 1000, x1 * w / 1000, y1 * h / 1000]
        screws.append({"box_px": [round(v, 1) for v in box], "role_guess": s.get("role_guess", "unknown"),
                       "role_confidence": s.get("role_confidence", 0)})
        cv2.rectangle(img, (int(box[0]), int(box[1])), (int(box[2]), int(box[3])), (0, 200, 255), max(2, w // 400))
        cv2.putText(img, s.get("role_guess", "?"), (int(box[0]), int(box[1]) - 6), cv2.FONT_HERSHEY_SIMPLEX,
                    max(0.6, w / 1600), (0, 200, 255), max(2, w // 600))
    cv2.imwrite(str(out_dir / f"{path.stem}_vlm.jpg"), img)
    return {"file": path.name, "image_size": [w, h], "hinge_type": res.get("hinge_type"),
            "confidence": res.get("confidence"), "screws": screws, "visible_damage": res.get("visible_damage", "")}


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scan_dir", type=Path)
    ap.add_argument("--reclick", action="store_true")
    ap.add_argument("--vlm", action="store_true")
    ap.add_argument("--model", default="gemini-2.5-flash")
    a = ap.parse_args()

    sd = a.scan_dir
    truth = json.loads((sd / "truth.json").read_text())
    W, H = float(truth["door_width_mm"]), float(truth["door_height_mm"])
    side = truth.get("hinge_side", "left")
    if W <= 0 or H <= 0:
        raise SystemExit("Fill in door_width_mm and door_height_mm in scan/truth.json first (ruler).")
    photos = sorted(p for p in (sd / "photos").iterdir() if p.suffix.lower() in IMG_EXT)
    door_shots = [p for p in photos if p.stem.startswith(("door_front", "rescan"))]
    hinge_shots = [p for p in photos if p.stem.startswith("hinge_")]
    if not door_shots:
        raise SystemExit("No door_front_*.jpg photos in scan/photos (see CAPTURE.md).")

    cfile = sd / "corners.json"
    corners = json.loads(cfile.read_text()) if cfile.exists() and not a.reclick else {}
    for p in door_shots:
        if p.name not in corners:
            print(f"Click corners: {p.name}")
            c = click_corners(p)
            if c:
                corners[p.name] = c
                cfile.write_text(json.dumps(corners, indent=1))

    ann = sd / "annotated"
    ann.mkdir(exist_ok=True)
    frames, rescans = [], []
    for p in door_shots:
        if p.name not in corners:
            continue
        img = cv2.imread(str(p))
        gaps = measure_gaps(img, corners[p.name], W, H, side)
        cv2.imwrite(str(ann / f"{p.stem}_gaps.jpg"), annotate(img, corners[p.name], W, H, gaps, side, GAP_TARGET))
        fr = {"file": p.name, "image_size": [img.shape[1], img.shape[0]], "corners_px": corners[p.name],
              "gaps": {k: v["mm"] for k, v in gaps.items()}}
        (rescans if p.stem.startswith("rescan") else frames).append(fr)
        print(f"  {p.name}: " + ", ".join(f"{k}={v['mm']}" for k, v in gaps.items()))

    measurements = []
    for mid in frames[0]["gaps"] if frames else []:
        vals = [f["gaps"][mid] for f in frames if f["gaps"].get(mid) is not None]
        if vals:
            measurements.append({"id": mid, "mm": round(float(np.median(vals)), 2), "target": GAP_TARGET,
                                 "by": "gap", "samples": len(vals), "spread_mm": round(float(np.ptp(vals)), 2),
                                 "ruler_mm": truth.get(mid) or None})
    if truth.get("flush_top_handle") is not None:
        measurements.append({"id": "flush_top_handle", "mm": float(truth["flush_top_handle"]), "target": [0, 1],
                             "by": "ruler", "samples": 1, "spread_mm": 0})

    hinges = []
    if a.vlm:
        groups: dict[str, list] = {}
        for p in hinge_shots:
            hid = "_".join(p.stem.split("_")[:2])  # hinge_top / hinge_bottom
            print(f"Asking {a.model} about {p.name} ...")
            groups.setdefault(hid, []).append(hinge_frame(p, ask_gemini(p, a.model), ann))
        hinges = [{"id": k, "frames": v} for k, v in groups.items()]
    elif (sd / "scan_session.json").exists():
        hinges = json.loads((sd / "scan_session.json").read_text()).get("hinges", [])  # keep earlier VLM results

    session = {
        "version": 1,
        "captured": dt.date.today().isoformat(),
        "source": "recorded",
        "door": {"id": "door_main", "width_mm": W, "height_mm": H, "hinge_side": side},
        "frames": frames, "rescans": rescans, "hinges": hinges,
        "measurements": measurements, "truth": truth,
    }
    (sd / "scan_session.json").write_text(json.dumps(session, indent=1))
    print(f"\nWrote {sd / 'scan_session.json'}  ({len(frames)} frames, {len(rescans)} rescans, {len(hinges)} hinges)")
    for m in measurements:
        r = f"  ruler {m['ruler_mm']}" if m.get("ruler_mm") else ""
        print(f"  {m['id']:<18} {m['mm']} mm  (target {m['target'][0]}-{m['target'][1]}){r}")


if __name__ == "__main__":
    main()
