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
1. Open the app. You see the camera and "What should I help you with?". Tap it and type or speak
   (mic on the keyboard), e.g. "help me fix this wobbly chair".
2. Draw a box around the thing with your finger.
3. The first time, paste your free Gemini API key (aistudio.google.com/apikey). It's stored on the phone only.
4. ARdlabor looks at what you boxed, tells you what it thinks is wrong, and pins numbered steps on the real object.
5. Go through the steps (move a marker with the target button if it's off), then **Check my fix**.
6. Dangerous jobs (gas, wiring in walls/outlets, inside microwaves/TVs, car brakes, structural) are refused
   with who to call instead.
7. For a sagging or uneven cabinet door, "Measure the gaps precisely" opens the mm measuring tool.
