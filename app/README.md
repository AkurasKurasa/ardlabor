# ARdlabor (Android app)

Point your phone at a broken cabinet door. The app finds the door in AR, measures every gap in
millimetres, draws the readings on the real door (green = OK, red = off), works out the cause, marks
the screw to turn, and rescans after each quarter turn to check it's actually fixed.

Built with Expo + ViroReact (ARCore). The gap measurement and diagnosis live in `../core` and are shared
with the Spectacles Lens.

## Your phone
It needs **ARCore** ("Google Play Services for AR"). Check your model on
https://developers.google.com/ar/devices, and install Google Play Services for AR from the Play Store.

## Build the APK on GitHub (free, no Expo account)

Move `ci/android-apk.yml` to `.github/workflows/android-apk.yml`, then push this whole folder to a GitHub
repo. The workflow builds the
APK on every push to `main` (or run it by hand from the Actions tab). When it finishes (about 15–25 min),
open the run, download **ardlabor-apk** under Artifacts, unzip it, and copy the `.apk` to the phone.

## Or build it with Expo EAS

```bash
cd app
npm install -g eas-cli
yarn install              # or: npm install
eas login                 # free Expo account: expo.dev/signup
eas build -p android --profile apk
```

When the build finishes (10–30 min on the free queue), EAS prints a link and a QR code. Open it on the
Android phone, download the APK, and allow "Install unknown apps" when it asks.

## Faster loop while developing (optional)
With Android Studio installed and the phone plugged in over USB with USB debugging on:
`npx expo run:android` builds and installs straight to the phone, and code changes reload live.
ViroReact can't run in Expo Go, so a build is always needed.

## How to use it
1. Aim the crosshair at each of the door's 4 corners and press **Add corner** (or tap the corner).
   AR measures the door size (you can correct it).
2. Pick the hinge side, then **Capture** straight-on so the gaps look like dark lines.
3. Drag the yellow crosses onto the exact corners, then **Measure gaps**.
4. Read the diagnosis, press **Fix this**, open the door, aim at the screw it names and press **Mark screw**.
5. Turn the amount shown, close the door, **Check**. It re-measures and tells you to keep going,
   reverse, or stop.
