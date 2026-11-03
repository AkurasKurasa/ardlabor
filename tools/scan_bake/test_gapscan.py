import unittest

from gapscan import measure_gaps
from synth import make


class GapScanTest(unittest.TestCase):
    def check(self, hinge_side, seed, gaps=None, tol=0.6):
        photo, corners, truth = make(gaps=gaps, hinge_side=hinge_side, seed=seed)
        got = measure_gaps(photo, corners, 400, 700, hinge_side)
        for k, v in truth.items():
            self.assertIsNotNone(got[k]["mm"], f"{k} not found (seed {seed})")
            self.assertAlmostEqual(got[k]["mm"], v, delta=tol, msg=f"{k} seed {seed}: {got[k]}")

    def test_sagging_door_left_hinge(self):
        for seed in range(4):
            self.check("left", seed)

    def test_right_hinge(self):
        for seed in range(4, 7):
            self.check("right", seed, {"gap_top_hinge": 2.5, "gap_top_handle": 8.0})

    def test_even_door(self):
        even = {k: 2.5 for k in ["gap_top_hinge", "gap_top_handle", "gap_side_top",
                                  "gap_side_bottom", "gap_bottom_hinge", "gap_bottom_handle"]}
        self.check("left", 9, even)


if __name__ == "__main__":
    unittest.main()
