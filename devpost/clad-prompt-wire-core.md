# CLAD prompt: wire the core into the Lens

Paste this into Claude Code (with CLAD and the Lens Studio MCP connected) **after** plan-lens has written
`devpost/design-brief.md` and you've run the bake tool on your real photos.

```
Read devpost/design-brief.md and core/CabinetCore.ts. CabinetCore.ts is pure TypeScript with no Lens APIs:
deriveMetrics, diagnose, planFix and FixVerifier. Do not rewrite its logic; copy it into the Lens project's
Assets/Scripts/Core/ and import it from components.

Build these Lens components:
1. ScanSessionSource: loads scan/scan_session.json (import it as a text/JSON asset) and the door_front and
   rescan photos as textures. Recorded mode shows the current photo on a world-anchored quad about 0.8 m in front
   of the user, sized to the photo's aspect. "Next frame" advances; Check (below) advances to the next rescan_*.jpg.
2. GapOverlay: for the current frame, draw each gap from frame.gaps as a short thin line on the quad at the door
   edge (use corners_px to place it, same positions as tools/scan_bake/gapscan.py annotate()), green inside
   [2,3] mm, red outside, with a small mm label.
3. DiagnosisCard (SPECS UI Kit): calls diagnose(session) and shows the top finding's summary, confidence as a
   percentage, and its evidence ids. If needsCloserLook(f) is true, show "Look closer at the <hinge>" instead.
4. FixGuide: planFix(finding) steps. For the adjust step, place a glowing ring on the hinge photo at the screw box
   whose role_guess matches step.screw (from session.hinges; if none matches, ask the user to pinch the screw),
   with a curved arrow for step.turn and the step text. A big "Check" pinch button.
5. Check: re-measure step.recheck from the next rescan frame using deriveMetrics on that frame's gaps, call
   FixVerifier.check(value), show result.message and flip the arrow when result.turn changes. "pass" -> summary
   card; "give_up" -> carpenter card.
Use SIK and UI Kit components. Check the preview and logs after each change. Add a LEAF test that runs the
recorded session from diagnosis to "pass".
```
