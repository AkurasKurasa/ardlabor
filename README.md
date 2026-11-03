# ARdlabor

An Android AR app (plus a Spectacles Lens for the hackathon) that scans a broken cabinet, works out what's wrong, draws the fix on the real hinge, and
rescans after every quarter turn to check the gap actually closed.

## What's in here so far

| Path | What it is |
|---|---|
| `CAPTURE.md` | Tonight's shot list and ruler measurements for the real cabinet |
| `devpost/api-check.md` | 30-minute check of which Spectacles APIs work in the Lens Studio preview |
| `devpost/clad-prompt-wire-core.md` | Prompt for CLAD to build the Lens components on top of the core |
| `scan/truth.json` | Your ruler measurements (fill in first) |
| `scan/photos/` | Your cabinet photos (see CAPTURE.md for file names) |
| `tools/scan_bake/` | PC tool: photos → `scan/scan_session.json` (gap measurement in mm, optional Gemini hinge/screw detection) |
| `core/CabinetCore.ts` | Diagnosis rules, fix planning and the rescan Verifier. Pure TypeScript, shared by the app and the Lens. |
| `core/gapscan.ts` | Gap measurement in TypeScript (same method as the Python tool), runs on the phone |
| `app/` | **Android app** (Expo + ViroReact): scan the door in AR, measure, diagnose, fix, rescan. See `app/README.md`. |

## Run it

```bash
pip install -r tools/scan_bake/requirements.txt
python tools/scan_bake/bake.py scan          # click the 4 door corners on each door photo, Enter to confirm
python tools/scan_bake/bake.py scan --vlm    # also detect hinge screws (set GEMINI_API_KEY first)
```

It prints each gap next to your ruler value, so you can see how accurate the photo measurement is, and
saves annotated copies in `scan/annotated/`.

Tests (Node 22+, Python 3.10+):

```bash
npm test          # core logic tests
npm run test:py   # gap measurement on synthetic cabinet photos
```

## How the scan works

1. **Geometry:** the 4 door corners plus the real door size flatten the door face to a known scale.
2. **Gaps:** brightness profiles across each door edge find the dark gap band and measure its width in mm.
3. **Visual:** hinge close-ups go to a vision model for the hinge type and screw positions.
4. **Motion:** (Lens, Saturday) hand tracking while the door swings gives the hinge axis and wobble.
5. **Verify:** after each turn, only the affected value is re-measured. The screw direction is never assumed:
   it starts clockwise and reverses when the gap gets worse.

## Safety scope

Adjusting and tightening with a hand screwdriver only. No power tools, no glass doors, support heavy doors
before loosening mounting screws, and cracked frames are referred to a carpenter.

## Disclosures

- Inspired by PhysAg3D (arXiv:2610.39924): parts, joints and actions, action completion, bounded refinement.
- The scan bake tool and `core/CabinetCore.ts` were written with Claude (Anthropic). Lens components are built
  through CLAD and the Lens Studio MCP.
- Hinge and screw detection uses Google Gemini when `--vlm` is used.
- The Lens Studio preview demo replays a recorded scan of a real cabinet; see `scan/`.
