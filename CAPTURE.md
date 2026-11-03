# Tonight: capture the broken cabinet

Do this **before you fix anything**. You can't get the "before" footage back.

## Gear
- Phone camera (landscape, no zoom, no portrait/beauty mode, flash off)
- Ruler or tape measure (mm)
- Good, even light: turn on the room light, avoid a lamp shining straight into the gap

## Measure with the ruler first (ground truth)
Write these into `scan/truth.json` (template is already there):

| Key | What to measure |
|---|---|
| `door_width_mm` | Width of the problem door's front face |
| `door_height_mm` | Height of the door's front face |
| `gap_top_hinge` | Gap above the door, at the hinge-side end |
| `gap_top_handle` | Gap above the door, at the handle-side end |
| `gap_side_top` | Gap on the handle side, near the top |
| `gap_side_bottom` | Gap on the handle side, near the bottom |
| `flush_top_handle` | How far the top handle-side corner sticks out (0 if flush) |

A thin card or feeler (a stack of paper) slid into the gap is easier than reading a ruler at 2 mm.

## Photos (put them in `scan/photos/`, name them exactly like this)

| File | Shot |
|---|---|
| `door_front_1.jpg` … `door_front_4.jpg` | The whole door plus a little of the frame around it, straight on, from about 1 m. Take 4, moving slightly between them. **All 4 door corners must be visible.** |
| `hinge_top_1.jpg`, `hinge_top_2.jpg` | Door open about 90°, close-up of the top hinge (screws clearly visible), two angles |
| `hinge_bottom_1.jpg`, `hinge_bottom_2.jpg` | Same for the bottom hinge |
| `gap_top_1.jpg` … `gap_side_2.jpg` | Close-ups along the top edge and handle-side edge |
| `swing.mp4` | Open and close the door slowly, phone held still, whole door in frame |

## While fixing (Friday)
After each quarter turn of a screw, take one new `door_front` photo and name it
`rescan_01.jpg`, `rescan_02.jpg`, … and write down which screw you turned and which way in
`scan/fix_log.md`. These become the real "rescan" frames in the demo.
