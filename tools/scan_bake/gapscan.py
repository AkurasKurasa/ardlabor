"""Measure the gaps around a cabinet door from one straight-on photo.

The door's 4 corners (clicked once per photo) and its real size in mm let us
flatten the door face to a known scale. Gaps show up as a dark band right next
to a door edge, so we read brightness profiles across each edge and measure the
width of that band in millimetres.
"""
from __future__ import annotations

import cv2
import numpy as np

PX_PER_MM = 4.0      # resolution of the flattened image
MARGIN_MM = 20.0     # how far outside the door we keep
SEARCH_OUT_MM = 14.0 # gaps wider than this are treated as "no neighbour"
INSIDE_MM = 4.0      # how far into the door face the profile starts
BAND_MM = 6.0        # width of the strip averaged into one profile
MIN_CONTRAST = 12.0  # gray levels the gap must be darker than its surroundings

# Each measurement: which edge, and where along it (0 = hinge/top end, 1 = handle/bottom end).
MEASUREMENTS = {
    "gap_top_hinge":    ("top",    (0.06, 0.20)),
    "gap_top_handle":   ("top",    (0.80, 0.94)),
    "gap_side_top":     ("handle", (0.06, 0.20)),
    "gap_side_bottom":  ("handle", (0.80, 0.94)),
    "gap_bottom_hinge": ("bottom", (0.06, 0.20)),
    "gap_bottom_handle":("bottom", (0.80, 0.94)),
}


def order_corners(pts) -> np.ndarray:
    """Return corners as top-left, top-right, bottom-right, bottom-left."""
    p = np.asarray(pts, dtype=np.float32).reshape(4, 2)
    s = p.sum(axis=1)
    d = np.diff(p, axis=1).ravel()
    return np.array([p[np.argmin(s)], p[np.argmin(d)], p[np.argmax(s)], p[np.argmax(d)]], dtype=np.float32)


def rectify(img, corners, w_mm: float, h_mm: float):
    """Warp the photo so the door face is a w_mm x h_mm rectangle at PX_PER_MM, with a margin."""
    c = order_corners(corners)
    m = MARGIN_MM * PX_PER_MM
    dst = np.array([[m, m], [m + w_mm * PX_PER_MM, m],
                    [m + w_mm * PX_PER_MM, m + h_mm * PX_PER_MM], [m, m + h_mm * PX_PER_MM]], dtype=np.float32)
    H = cv2.getPerspectiveTransform(c, dst)
    size = (int(round((w_mm + 2 * MARGIN_MM) * PX_PER_MM)), int(round((h_mm + 2 * MARGIN_MM) * PX_PER_MM)))
    gray = img if img.ndim == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    flat = cv2.warpPerspective(gray, H, size, flags=cv2.INTER_LINEAR, borderValue=0)
    return flat.astype(np.float32), H


def _profile(flat, edge: str, along_mm: float, w_mm: float, h_mm: float, hinge_side: str):
    """Brightness profile starting INSIDE_MM inside the door and running outward across the edge."""
    s, m = PX_PER_MM, MARGIN_MM
    n_in, n_out = int(INSIDE_MM * s), int(SEARCH_OUT_MM * s)
    half = int(BAND_MM * s / 2)
    handle_right = hinge_side == "left"
    if edge in ("top", "bottom"):
        x_mm = along_mm if hinge_side == "left" else w_mm - along_mm
        cx = int(round((m + x_mm) * s))
        if edge == "top":
            e = int(round(m * s))
            strip = flat[e - n_out:e + n_in, cx - half:cx + half].mean(axis=1)[::-1]
        else:
            e = int(round((m + h_mm) * s))
            strip = flat[e - n_in:e + n_out, cx - half:cx + half].mean(axis=1)
    else:  # handle side edge
        cy = int(round((m + along_mm) * s))
        if handle_right:
            e = int(round((m + w_mm) * s))
            strip = flat[cy - half:cy + half, e - n_in:e + n_out].mean(axis=0)
        else:
            e = int(round(m * s))
            strip = flat[cy - half:cy + half, e - n_out:e + n_in].mean(axis=0)[::-1]
    return strip, n_in


def gap_from_profile(p: np.ndarray, n_in: int):
    """Width in mm of the dark band nearest the door edge, or None if there's no clear gap."""
    if p.size < n_in + 8:
        return None
    k = max(3, int(PX_PER_MM * 0.6) | 1)
    p = cv2.GaussianBlur(p.reshape(-1, 1).astype(np.float32), (1, k), 0).ravel()
    inside_ref = float(np.median(p[: max(2, n_in - int(PX_PER_MM))]))
    outside_ref = float(np.median(p[-int(3 * PX_PER_MM):]))
    lo = max(0, n_in - int(2 * PX_PER_MM))
    win = p[lo:]
    i_min = lo + int(np.argmin(win))
    mn = float(p[i_min])
    ref = min(inside_ref, outside_ref)
    if ref - mn < MIN_CONTRAST:
        return None
    t = mn + 0.5 * (ref - mn)
    a = i_min
    while a > 0 and p[a - 1] < t:
        a -= 1
    b = i_min
    while b < p.size - 1 and p[b + 1] < t:
        b += 1
    if b >= p.size - 2:  # band runs off the end: neighbour too far away
        return None
    # sub-pixel crossings
    left = a - 1 + (p[a - 1] - t) / (p[a - 1] - p[a]) if a > 0 and p[a - 1] != p[a] else float(a)
    right = b + (p[b] - t) / (p[b] - p[b + 1]) if p[b] != p[b + 1] else float(b)
    return float((right - left) / PX_PER_MM)


def measure_gaps(img, corners, w_mm: float, h_mm: float, hinge_side: str = "left", samples: int = 7):
    """Return {measurement_id: {"mm": float|None, "spread_mm": float, "n": int}}."""
    flat, _ = rectify(img, corners, w_mm, h_mm)
    out = {}
    for mid, (edge, (f0, f1)) in MEASUREMENTS.items():
        length = w_mm if edge in ("top", "bottom") else h_mm
        vals = []
        for f in np.linspace(f0, f1, samples):
            p, n_in = _profile(flat, edge, f * length, w_mm, h_mm, hinge_side)
            g = gap_from_profile(p, n_in)
            if g is not None:
                vals.append(g)
        if len(vals) >= max(2, samples // 2):
            out[mid] = {"mm": round(float(np.median(vals)), 2),
                        "spread_mm": round(float(np.ptp(vals)), 2), "n": len(vals)}
        else:
            out[mid] = {"mm": None, "spread_mm": None, "n": len(vals)}
    return out


def annotate(img, corners, w_mm, h_mm, gaps, hinge_side="left", target=(2.0, 3.0)):
    """Draw each gap reading on the original photo, green when in range, red when not."""
    vis = img.copy() if img.ndim == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    _, H = rectify(img, corners, w_mm, h_mm)
    Hinv = np.linalg.inv(H)
    s, m = PX_PER_MM, MARGIN_MM
    thick = max(2, vis.shape[1] // 500)
    cv2.polylines(vis, [order_corners(corners).astype(np.int32)], True, (255, 255, 255), thick)
    for mid, (edge, (f0, f1)) in MEASUREMENTS.items():
        g = gaps.get(mid, {}).get("mm")
        if g is None:
            continue
        fm = (f0 + f1) / 2
        if edge in ("top", "bottom"):
            x = fm * w_mm if hinge_side == "left" else w_mm - fm * w_mm
            y = 0 if edge == "top" else h_mm
            a, b = (x - 15, y), (x + 15, y)
        else:
            x = w_mm if hinge_side == "left" else 0
            y = fm * h_mm
            a, b = (x, y - 15), (x, y + 15)
        pts = np.array([[[(a[0] + m) * s, (a[1] + m) * s]], [[(b[0] + m) * s, (b[1] + m) * s]]], dtype=np.float32)
        P = cv2.perspectiveTransform(pts, Hinv).reshape(2, 2).astype(int)
        ok = target[0] <= g <= target[1]
        col = (60, 200, 60) if ok else (40, 40, 230)
        cv2.line(vis, tuple(P[0]), tuple(P[1]), col, thick * 3)
        cv2.putText(vis, f"{g:.1f} mm", tuple(P[1] + np.array([8, -8])), cv2.FONT_HERSHEY_SIMPLEX,
                    thick * 0.5, col, thick, cv2.LINE_AA)
    return vis
