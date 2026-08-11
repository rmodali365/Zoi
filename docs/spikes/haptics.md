# Spike: Haptics (Apple) for Zoi

**Status:** exploration complete — ready to implement
**Date:** 2026-08-02
**Scope:** iOS-first. Which Apple haptics API to use, how it surfaces in Expo, and where
to wire it into Zoi.

## TL;DR / Recommendation

Use **`expo-haptics`** for v1. It wraps Apple's high-level `UIFeedbackGenerator`, ships in
Expo Go (no dev build / no native config), and covers ~90% of Zoi's needs. Hide it behind a
thin `src/lib/haptics.ts` wrapper (per the "screens never touch platform APIs directly"
convention) so a later swap to Core Haptics is a one-file change.

Only reach for **Core Haptics** (custom `.ahap` patterns, via `expo-ahap` or
`react-native-haptic-feedback`) if we decide a specific moment — e.g. "rank locked in" —
deserves a bespoke signature buzz. That path requires a **dev build + a physical device**.

## Current project state (verified)

- Stack: Expo SDK 54, RN 0.81, TypeScript strict, iOS-first.
- **No haptics dependency installed.** `package.json` has none; `app.json` has no haptics
  config. Clean slate.
- Data-layer convention: screens never call platform/native APIs directly — everything goes
  through `src/lib/`. The haptics wrapper must follow this.

## The Apple haptics landscape (two tiers)

### Tier 1 — `UIFeedbackGenerator` (UIKit), high-level
System-tuned, canned feedback. Three generators:
- `UIImpactFeedbackGenerator` — impacts. Styles: `light / medium / heavy / soft / rigid`
- `UINotificationFeedbackGenerator` — outcomes: `success / warning / error`
- `UISelectionFeedbackGenerator` — light "tick" for selection changes (picker/segmented)

### Tier 2 — Core Haptics (`CHHapticEngine`), low-level
Custom patterns: transient + continuous events, each with `intensity` + `sharpness`,
optionally synced to audio, authored as **.ahap** files. This is how you build a *signature*
haptic. Constraints:
- iPhone 8+ only. Check `CHHapticEngine.capabilitiesForHardware().supportsHaptics`.
- **Does NOT fire in the iOS Simulator** — physical device required.
- Suppressed by Low Power Mode, active Camera, or dictation.

## How it maps into Expo/RN

| Need | Package | Notes |
|---|---|---|
| The 3 canned generators | **`expo-haptics`** | Wraps `UIFeedbackGenerator` only. In Expo Go, no dev build. This is the 90% solution. |
| Custom `.ahap` patterns | **`expo-ahap`** (Evan Bacon) or **`react-native-haptic-feedback`** | Both expose Core Haptics. `react-native-haptic-feedback` (rewritten on `CHHapticEngine`) offers `triggerPattern(events)` + `playAHAP(file)`. Needs dev build + device. |

**Important:** `expo-haptics` does NOT expose Core Haptics custom patterns — only the canned
three. The decision is binary: *canned feel* (expo-haptics, trivial) vs *signature feel*
(expo-ahap, dev build + device testing).

### `expo-haptics` API surface
- `Haptics.impactAsync(style?)` — default `Medium`. `ImpactFeedbackStyle`: `Light / Medium / Heavy / Rigid / Soft`
- `Haptics.notificationAsync(type?)` — default `Success`. `NotificationFeedbackType`: `Success / Warning / Error`
- `Haptics.selectionAsync()` — selection tick
- `Haptics.performAndroidHapticsAsync(type)` — Android-only (ignore for iOS-first)

All methods are async and **no-op silently on the Simulator** and when the Taptic Engine is
unavailable (Low Power Mode, etc.), so calls are safe to fire unconditionally.

## Where haptics belong in Zoi (mapping to real flows)

From the log/rank loop and social layer in `CLAUDE.md`:

| Moment | Screen / file | Call |
|---|---|---|
| Binary comparison pick ("which did you enjoy more?") — the signature moment | `screens/log/RankExperience` | `impactAsync(Medium)` |
| Sentiment pick (Loved/Liked/Fine `SegmentedControl`) | `RankExperience` / `components/ui/SegmentedControl` | `selectionAsync()` |
| Rank locked in / experience saved | end of rank flow (`insertRankedExperience` / `graduatePlannedStop` / `rerankExperience`) | `notificationAsync(Success)` |
| Save to Wishlist / follow / copy stop | `saves.ts` callers, `UserRow` follow, `copyStopToTrip` | `impactAsync(Light)` |
| OTP wrong / handle taken (error) | `VerifyOtp`, `SetupProfile` / `EditProfile` handle validation | `notificationAsync(Error)` |

## Proposed implementation (v1, expo-haptics)

1. Install (auto-resolves the SDK 54-compatible version; ships in Expo Go):
   ```sh
   npx expo install expo-haptics
   ```

2. Add `src/lib/haptics.ts` — semantic wrapper (named by *intent*, not by generator, so the
   Core Haptics swap later is one file):
   ```ts
   import * as Haptics from 'expo-haptics';

   // Named by intent so call sites read as UX, and the impl can swap to Core Haptics later.
   export const haptics = {
     compareTap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
     select:     () => Haptics.selectionAsync(),                 // sentiment / segmented
     success:    () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
     error:      () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
     lightTap:   () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), // save/follow/copy
   };
   ```
   (All calls are fire-and-forget; no need to `await` in handlers.)

3. Wire the five moments in the table above via `haptics.*`. Keep screens thin — just call
   the wrapper from the existing tap/mutation handlers.

4. Gates before "done": `npm run typecheck` and `npm run lint` clean.

## Testing notes

- **Physical iOS device required** to feel anything — Simulator no-ops for both tiers.
- expo-haptics works in **Expo Go** (no dev build). Core Haptics does NOT — it needs a
  custom dev build.
- Nothing fires in Low Power Mode / with Camera or dictation active — expected, don't treat
  as a bug.

## If we later want a signature pattern (Core Haptics)

- Author an `.ahap` file (Apple's AHAP JSON format; can use Apple's Haptrix-style tooling or
  hand-write intensity/sharpness curves).
- Load via `expo-ahap` or `react-native-haptic-feedback`'s `playAHAP()`.
- Requires: `npx expo prebuild` / dev build, physical device, and a hardware-capability
  guard. Budget on-device iteration time — you can't tune feel in the Simulator.

## Sources

- Expo Haptics docs — https://docs.expo.dev/versions/latest/sdk/haptics/
- expo-ahap — https://github.com/EvanBacon/expo-ahap
- react-native-haptic-feedback — https://github.com/mkuczera/react-native-haptic-feedback
