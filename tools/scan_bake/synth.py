"""Make fake cabinet photos with known gaps, to test gapscan without a real cabinet."""
from __future__ import annotations

import cv2
import numpy as np

S = 5.0  # px per mm in the "flat" canvas before the camera warp


def make(w_mm=400, h_mm=700, gaps=None, hinge_side="left", seed=0, out_w=3000, out_h=4000, tilt=0.12):
    """Return (photo_bgr, door_corners_px). gaps = dict like gapscan.MEASUREMENTS ids -> mm."""
    g = {"gap_top_hinge": 2.0, "gap_top_handle": 6.0, "gap_side_top": 4.0, "gap_side_bottom": 2.0,
         "gap_bottom_hinge": 3.0, "gap_bottom_handle": 3.0}
    g.update(gaps or {})
    rng = np.random.default_rng(seed)
    m = 60.0
    W, H = int((w_mm + 2 * m) * S), int((h_mm + 2 * m) * S)
    canvas = np.full((H, W, 3), (150, 175, 195), np.uint8)  # neighbouring surface, light wood
    # wood-ish grain on the neighbour
    canvas = (canvas.astype(np.float32) * (1 + 0.04 * np.sin(np.arange(W) / 7.0))[None, :, None]).astype(np.uint8)
    hl = hinge_side == "left"

    def X(x):  # door x mm (0 at hinge side) -> canvas px
        xx = x if hl else w_mm - x
        return (m + xx) * S

    def Y(y):
        return (m + y) * S

    dark = (35, 35, 40)
    # top gap: linear from hinge end to handle end (values given at the 13% and 87% sample points)
    def lerp(a, b, f):
        return a + (b - a) * (f - 0.13) / (0.87 - 0.13)
    poly = []
    for f in np.linspace(0, 1, 50):
        poly.append((X(f * w_mm), Y(-lerp(g["gap_top_hinge"], g["gap_top_handle"], f))))
    poly += [(X(w_mm), Y(0)), (X(0), Y(0))]
    cv2.fillPoly(canvas, [np.int32(np.round(poly))], dark, lineType=cv2.LINE_AA)
    poly = []
    for f in np.linspace(0, 1, 50):
        poly.append((X(f * w_mm), Y(h_mm + lerp(g["gap_bottom_hinge"], g["gap_bottom_handle"], f))))
    poly += [(X(w_mm), Y(h_mm)), (X(0), Y(h_mm))]
    cv2.fillPoly(canvas, [np.int32(np.round(poly))], dark, lineType=cv2.LINE_AA)
    poly = []
    sgn = 1 if hl else -1
    for f in np.linspace(0, 1, 50):
        gw = lerp(g["gap_side_top"], g["gap_side_bottom"], f)
        poly.append((X(w_mm) + sgn * gw * S, Y(f * h_mm)))
    poly += [(X(w_mm), Y(h_mm)), (X(w_mm), Y(0))]
    cv2.fillPoly(canvas, [np.int32(np.round(poly))], dark, lineType=cv2.LINE_AA)
    # door face
    door = np.array([[X(0), Y(0)], [X(w_mm), Y(0)], [X(w_mm), Y(h_mm)], [X(0), Y(h_mm)]], np.float32)
    cv2.fillPoly(canvas, [np.int32(np.round(door))], (200, 215, 225), lineType=cv2.LINE_AA)
    # camera: random perspective
    src = np.array([[0, 0], [W, 0], [W, H], [0, H]], np.float32)
    jit = rng.uniform(-tilt, tilt, (4, 2)) * np.array([out_w, out_h]) * 0.5
    base = np.array([[0.12, 0.08], [0.88, 0.08], [0.88, 0.92], [0.12, 0.92]]) * np.array([out_w, out_h])
    dst = (base + jit * 0.5).astype(np.float32)
    Hm = cv2.getPerspectiveTransform(src, dst)
    photo = cv2.warpPerspective(canvas, Hm, (out_w, out_h), borderValue=(90, 90, 90))
    photo = cv2.GaussianBlur(photo, (5, 5), 1.2)
    photo = np.clip(photo.astype(np.float32) + rng.normal(0, 4, photo.shape), 0, 255).astype(np.uint8)
    corners = cv2.perspectiveTransform(door.reshape(-1, 1, 2), Hm).reshape(4, 2)
    corners += rng.normal(0, 2.0, corners.shape)  # simulate imperfect clicking
    return photo, corners.tolist(), g
