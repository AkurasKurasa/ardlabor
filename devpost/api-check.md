# API check (30 minutes max)

Fill this in tonight in Lens Studio, Spectacles project, Preview panel. The answers decide how much of
the demo is live and how much replays the recorded scan.

| # | Test | Works in preview? | Notes |
|---|---|---|---|
| 1 | **World Query hit test**: add the World Query sample/script, click in the preview, does a marker land on a surface with a normal? | ☐ yes ☐ no | |
| 2 | **Camera Module**: request camera frames (`CameraModule.createCameraRequest`), does `onNewFrame` fire? What does the frame show (simulated room, webcam, black)? | ☐ yes ☐ no | |
| 3 | **Depth Module** (Experimental APIs on): does `createDepthFrameSession` deliver frames? | ☐ yes ☐ no | |
| 4 | **Remote Service Gateway**: one text call to Gemini or OpenAI, does it answer? | ☐ yes ☐ no | |
| 5 | **Gateway + camera together**: does #4 still work while #2 is active? | ☐ yes ☐ no | Depth Module docs: camera access disables open internet unless extended permissions |
| 6 | **Hand tracking**: does the SIK simulated hand give a fingertip position you can log? | ☐ yes ☐ no | |
| 7 | Do you have access to real Spectacles this week? | ☐ yes ☐ no | |

## Decision
- 2 = no → demo uses **Recorded** scan source (default in the plan).
- 4 or 5 = no → vision results come from `tools/scan_bake/bake.py --vlm` on your PC.
- 1 = yes → Simulated source uses real World Query hits against the Blender cabinet.
