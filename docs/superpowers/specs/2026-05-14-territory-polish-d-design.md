# Territory Polish-D — animated drill transition + pan momentum

Date: 2026-05-14
Status: design

## Background

Last of four follow-up polish passes on territory sub-projects 3 & 4.

- Polish-A (shipped) — map selection chip + `/` / `g` shortcuts.
- Polish-B (shipped) — Geos sidebar multi-select.
- Polish-C (shipped) — universal undo/redo + tree animation.
- **Polish-D (this spec)** — animated world ↔ drill-down transition
  and pan momentum on the map.

Today, clicking a country flips `drillDownCountryCode` in the store
and `TerritoryApp` instantly swaps `<WorldMapView />` for
`<DrillDownMapView />`. Pan releases snap to a hard stop with no
inertia. Both transitions feel abrupt next to the rest of the
sub-project 3 polish.

## Goals

1. **Smooth camera animation** when drilling into a country (300ms
   ease-in-out zoom on the world map's center/zoom) and when
   returning to world (mirror in the drill-down view).
2. **Graceful US fallback** via 200ms cross-fade — the US drill-down
   uses `geoAlbersUsa` instead of `geoMercator`, so a continuous
   camera interpolation isn't possible across the projection
   change.
3. **Pan momentum** with friction-decay after release on both views.
4. **Reduced-motion respect** — `prefers-reduced-motion: reduce`
   users get the existing instant snap on both halves.

Non-goals: rubber-band edges (would require wrapping d3-zoom to
override its hard `translateExtent` clamping — substantial enough to
be its own future pass); animated breadcrumb chevron; native
iPad/Safari touch-gesture handling; per-country target zoom lookup.

## Design

### Part 1 — Animated drill transition

#### 1.1 Transition state lives in `TerritoryApp`

The parent component owns the orchestration:

```ts
type TransitionState =
  | { phase: 'idle' }
  | {
      phase: 'entering';
      targetIso: string;
      targetCenter: [number, number];
      targetZoom: number;
    }
  | { phase: 'exiting'; sourceIso: string };
```

The store's `drillDownCountryCode` continues to flip immediately on
click (consumed elsewhere — e.g. the breadcrumb in the Toolbar reads
it directly for instant feedback). `TerritoryApp` watches the store
value via `useEffect` and reacts:

- `null → 'XX'` (entering): set
  `{ phase: 'entering', targetIso: 'XX',
     targetCenter: COUNTRY_CENTROIDS['XX'] ?? [0, 20],
     targetZoom: 6 }`. Continue rendering `<WorldMapView>` with a
  `cameraTarget` prop driving its camera animation. After
  `onSettled`, set `{ phase: 'idle' }` (which now renders
  `<DrillDownMapView>` because `drillDownCountryCode` is set).
- `'XX' → null` (exiting): set `{ phase: 'exiting', sourceIso }`.
  Continue rendering `<DrillDownMapView>` with `cameraTarget` =
  `{ center: [0, 20], zoom: 1 }`. After `onSettled`, set
  `{ phase: 'idle' }` (renders `<WorldMapView>`).

For the US case (`iso2 === 'US'`), the parent skips the
camera-animation path entirely and uses cross-fade instead.

#### 1.2 Render layers per phase

```
phase: 'idle' + !drillDownCode      → <WorldMapView />
phase: 'idle' +  drillDownCode      → <DrillDownMapView />
phase: 'entering' (non-US)          → <WorldMapView cameraTarget onSettled />
phase: 'entering' (US, cross-fade)  → <WorldMapView className="...opacity-0...">
                                       <DrillDownMapView className="...opacity-100..." />
phase: 'exiting'  (non-US)          → <DrillDownMapView cameraTarget onSettled />
phase: 'exiting'  (US, cross-fade)  → mirror of entering
```

Cross-fade mounts both views absolutely-positioned within
TerritoryApp's `<main className="relative ...">` container. Both use
`motion-safe:transition-opacity motion-safe:duration-200`. Neither
view receives `cameraTarget` in the cross-fade path — each shows its
default camera (world default for `WorldMapView`, `fitFeatures`
result for `DrillDownMapView`). After 200ms (timer-based, not
transitionend — more reliable), the parent sets `{ phase: 'idle' }`
and the outgoing view unmounts.

#### 1.3 `useCameraAnimation` hook

New file `lib/useCameraAnimation.ts`:

```ts
export function useCameraAnimation(
  initialCenter: [number, number],
  initialZoom: number,
): {
  center: [number, number];
  zoom: number;
  setCenter: (c: [number, number]) => void;
  setZoom: (z: number) => void;
  animateTo: (
    target: { center: [number, number]; zoom: number },
    durationMs: number,
    onComplete?: () => void,
  ) => void;
  cancelAnimation: () => void;
};
```

Behavior:
- Owns `center` and `zoom` as state (replacing the views' existing
  `useState<[number, number]>` + `useState<number>` pair).
- `animateTo`: cancels any in-flight RAF, captures start values and
  target, schedules a RAF loop that interpolates over `durationMs`
  with cubic ease-in-out, calls `setCenter`/`setZoom` each frame,
  calls `onComplete` after the final frame.
- `cancelAnimation`: clears any active RAF id.
- Cleanup on unmount cancels any in-flight RAF.
- **Reduced motion**: if
  `window.matchMedia('(prefers-reduced-motion: reduce)').matches`,
  `animateTo` sets values immediately and calls `onComplete` on the
  next microtask. Matches today's snap behavior.

Easing function (cubic ease-in-out):
```ts
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
```

#### 1.4 Camera-target prop on the views

Both `WorldMapView` and `DrillDownMapView` accept a new optional
prop:

```ts
interface CameraTargetProp {
  cameraTarget?: {
    center: [number, number];
    zoom: number;
    durationMs: number;
  };
  onCameraSettled?: () => void;
}
```

When `cameraTarget` changes from `undefined` to a value, the view
calls `animateTo(target, durationMs, onCameraSettled)`. When it
changes back to `undefined`, no action (the next mutation will
either be another `animateTo` or the view unmounts).

The views also accept an optional `className` prop so TerritoryApp
can apply opacity classes during the cross-fade path.

#### 1.5 Target camera math

- Entering: `targetCenter = COUNTRY_CENTROIDS[iso2] ?? [0, 20]`;
  `targetZoom = 6` for all countries. A single value is sufficient
  because the drill-down view's existing `fitFeatures` recomputes
  the true fit the instant the view mounts — the camera ramp is
  purely visual.
- Exiting: `targetCenter = [0, 20]` (world default);
  `targetZoom = 1`.

#### 1.6 Toolbar breadcrumb behavior during transition

The Toolbar's breadcrumb reads `drillDownCountryCode` from the store
(already-existing). During a transition, the breadcrumb shows the
target country immediately (matching the store value). This is fine
— the user sees feedback the click registered even though the
camera is still ramping.

### Part 2 — Pan momentum

#### 2.1 `usePanMomentum` hook

New file `lib/usePanMomentum.ts`:

```ts
export function usePanMomentum(opts: {
  setCenter: (c: [number, number]) => void;
  getCenter: () => [number, number];
}): {
  onMoveStart: () => void;
  onMove: (e: { coordinates: [number, number] }) => void;
  onMoveEnd: (e: { coordinates: [number, number]; zoom: number }) => void;
};
```

Implementation:

```ts
const FRICTION = 0.92;            // per-frame velocity multiplier
const MIN_VELOCITY = 0.05;        // stop threshold (mercator units per frame)
const SAMPLE_WINDOW_MS = 80;      // how far back to look for velocity
const MAX_SAMPLES = 8;            // ring buffer cap

// Refs (not state) for samples + RAF id
// On onMoveStart: clear samples, cancel any RAF.
// On onMove: push {coords, t} onto samples, trim to last MAX_SAMPLES.
// On onMoveEnd:
//   - trim samples to last SAMPLE_WINDOW_MS
//   - if fewer than 2 remaining, no momentum
//   - velocity = (lastCoords - firstCoords) / dt
//   - if |velocity| < MIN_VELOCITY * 60 (per second), no momentum
//   - else kick off RAF loop:
//       at each frame:
//         dt = 1/60 (fixed)
//         center = getCenter() + velocity * dt
//         setCenter(center)
//         velocity *= FRICTION
//       stop when |velocity| < MIN_VELOCITY
//   - on unmount: cancel RAF
```

The hook gates itself on `prefers-reduced-motion: reduce` — when
set, `onMoveEnd` simply records the final coords (no momentum), and
`onMoveStart`/`onMove` no-op. Net effect: identical to today's
behavior for reduced-motion users.

#### 2.2 Wiring into the views

Both views currently have:

```tsx
<ZoomableGroup
  center={center}
  zoom={zoom}
  onMoveEnd={({ coordinates, zoom: z }) => {
    setCenter(coordinates as [number, number]);
    setZoom(z);
  }}
>
```

After Polish-D:

```tsx
<ZoomableGroup
  center={center}
  zoom={zoom}
  onMoveStart={momentum.onMoveStart}
  onMove={momentum.onMove}
  onMoveEnd={(e) => {
    setZoom(e.zoom);
    momentum.onMoveEnd(e);  // handles setCenter + decay
  }}
>
```

The momentum hook calls `setCenter` (provided to it from
`useCameraAnimation`); `setZoom` continues to fire synchronously in
`onMoveEnd` since we don't currently animate zoom inertia.

#### 2.3 Interaction with drill-down `translateExtent`

`DrillDownMapView` sets `translateExtent` on `ZoomableGroup`.
d3-zoom hard-clamps to that range. When momentum tries to push
`center` past the bound, `ZoomableGroup` clamps the rendered
position on the next frame. The hook's velocity then over-decays
naturally because the actual `center` no longer changes between
frames (`getCenter()` returns the clamped value), so velocity hits
zero quickly. Acceptable.

### Part 3 — Out of scope (deferred)

These were considered and explicitly deferred:

- **Rubber-band edges**. d3-zoom's `translateExtent` is hard-clamped;
  elastic overshoot requires a custom pan-interceptor layer that
  disables d3-zoom's drag handler during edge events. Future
  Polish-E if ever revived.
- **Touch/iPad pinch gesture refinement**. Existing
  `filterZoomEvent` allows wheel zoom which covers trackpad pinch.
  Native iPad/Safari multi-touch gestures aren't in scope.
- **Per-country target zoom lookup table**. The single zoom=6
  default works because the drill-down view's `fitFeatures` runs
  the instant it takes over.
- **Animated breadcrumb chevron** in the Toolbar. Cosmetic and out
  of scope.

## File touches

**New:**
- `lib/useCameraAnimation.ts` (~60 lines).
- `lib/usePanMomentum.ts` (~70 lines).

**Modified:**
- `components/territory/TerritoryApp.tsx` —
  `transitionState` machine, store-watch effect, render-layer
  switch including cross-fade for US.
- `components/territory/map/WorldMapView.tsx` —
  swap `useState` for camera with `useCameraAnimation`; accept
  `cameraTarget` + `onCameraSettled` + `className` props; wire
  `usePanMomentum` handlers.
- `components/territory/map/DrillDownMapView.tsx` — same set of
  changes as `WorldMapView.tsx`.

No new dependencies. No slice changes.

## Edge cases

- **User clicks a different country mid-zoom-in**: TerritoryApp's
  effect fires again with the new target. The view's
  `cameraTarget` prop changes; the hook's `cancelAnimation` runs
  before `animateTo`, so the new target supersedes the in-flight
  tween. The previous `onCameraSettled` callback never fires (it
  was attached to the cancelled animation).
- **User exits drill-down via the breadcrumb mid-momentum**: the
  drill-down view unmounts as part of the transition; the
  momentum hook's cleanup cancels its RAF. No leak.
- **Pan during a camera animation**: `onMoveStart` cancels both
  the momentum RAF AND any in-flight `animateTo` via the same
  `cancelAnimation` ref. The user takes manual control. The
  `onSettled` callback never fires, so TerritoryApp stays in the
  current phase until the next store change.
- **Zero-velocity release** (mouse-up without prior movement): the
  sample window has < 2 entries within `SAMPLE_WINDOW_MS`, so the
  hook short-circuits — no momentum.
- **Reduced-motion**: both halves silently skip animation. The
  cross-fade also gates its `transition-opacity` behind
  `motion-safe:`.
- **`COUNTRY_CENTROIDS` lookup miss**: the targetCenter falls back
  to `[0, 20]` — same as world default. The camera does a tiny
  drift; not great visually but rare (the centroids table covers
  every common country).

## Verification

- `npx tsc --noEmit` + `npm run lint` + `npm run build` clean.
- Manual smoke (user):
  1. Click a non-US country (e.g. Germany, Brazil) → world map's
     camera smoothly zooms toward the centroid over 300ms; on
     settle, the drill-down view takes over with state data.
  2. Click "World" in the breadcrumb from a drill-down → drill-down
     camera zooms out over 300ms; world view resumes.
  3. Click the US → world fades out / drill-down fades in over
     200ms (Albers projection cross-fade).
  4. Pan-flick the map with a fast drag-release → camera continues
     drifting with visible inertia for ~1s, decaying smoothly.
  5. Slow pan (release with near-zero velocity) → no momentum;
     instant stop as today.
  6. Two consecutive country clicks (entering A, then entering B
     mid-zoom) → the second click cancels A's animation and starts
     B's.
  7. With `prefers-reduced-motion: reduce` set → drill transitions
     are instant; no momentum decay.
  8. With drill-down active, pan-flick near an edge → momentum
     respects `translateExtent` (clamps cleanly, no jitter).
