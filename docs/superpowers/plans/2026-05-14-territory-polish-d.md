# Territory Polish-D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a smooth 300ms camera animation when drilling into/out of a country (with 200ms cross-fade fallback for the US's Albers projection), and pan momentum with velocity-decay inertia after release. Both halves respect `prefers-reduced-motion: reduce`.

**Architecture:** Two new hooks in `lib/`. `useCameraAnimation` owns `center`+`zoom` state plus an RAF-driven `animateTo(target, duration, onComplete)`. `usePanMomentum` returns `onMoveStart`/`onMove`/`onMoveEnd` handlers that record velocity samples and drive a friction-decay RAF on release. Both map views consume both hooks. `TerritoryApp` owns a parent-side `transitionState` machine that orchestrates which view is mounted and feeds `cameraTarget` props during the entering/exiting phases.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `react-simple-maps` v3 (wraps d3-zoom), Tailwind v4. No test framework — verification is `npx tsc --noEmit && npm run lint && npm run build`.

**Spec:** `docs/superpowers/specs/2026-05-14-territory-polish-d-design.md`.

---

## File Structure

**New:**
- `lib/useCameraAnimation.ts` — RAF-driven camera state hook (~60 lines).
- `lib/usePanMomentum.ts` — Pan momentum hook (~70 lines).

**Modified:**
- `components/territory/TerritoryApp.tsx` — `transitionState` machine; render-layer switch including cross-fade path for US.
- `components/territory/map/WorldMapView.tsx` — swap local `useState` for `useCameraAnimation`; accept `cameraTarget` + `onCameraSettled` + `className` props; wire `usePanMomentum` into `ZoomableGroup`.
- `components/territory/map/DrillDownMapView.tsx` — same set of changes; preserve the existing country-change re-derivation by calling the hook's imperative `setCenter`/`setZoom` from a fitFeatures effect.

No new dependencies. No slice changes.

---

## Task 1: `useCameraAnimation` hook

**Files:**
- Create: `lib/useCameraAnimation.ts`

- [ ] **Step 1: Create the file**

Write `lib/useCameraAnimation.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface CameraAnimationTarget {
  center: [number, number];
  zoom: number;
}

export interface CameraAnimationResult {
  center: [number, number];
  zoom: number;
  setCenter: (c: [number, number]) => void;
  setZoom: (z: number) => void;
  animateTo: (
    target: CameraAnimationTarget,
    durationMs: number,
    onComplete?: () => void,
  ) => void;
  cancelAnimation: () => void;
}

export function useCameraAnimation(
  initialCenter: [number, number],
  initialZoom: number,
): CameraAnimationResult {
  const [center, setCenterState] = useState<[number, number]>(initialCenter);
  const [zoom, setZoomState] = useState<number>(initialZoom);
  const rafIdRef = useRef<number | null>(null);

  const cancelAnimation = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const setCenter = useCallback((c: [number, number]) => {
    cancelAnimation();
    setCenterState(c);
  }, [cancelAnimation]);

  const setZoom = useCallback((z: number) => {
    cancelAnimation();
    setZoomState(z);
  }, [cancelAnimation]);

  const animateTo = useCallback((
    target: CameraAnimationTarget,
    durationMs: number,
    onComplete?: () => void,
  ) => {
    cancelAnimation();
    if (prefersReducedMotion() || durationMs <= 0) {
      setCenterState(target.center);
      setZoomState(target.zoom);
      if (onComplete) queueMicrotask(onComplete);
      return;
    }
    // Read latest values via state setter callbacks to capture start state.
    let startCenter: [number, number] = [0, 0];
    let startZoom = 1;
    setCenterState((c) => { startCenter = c; return c; });
    setZoomState((z) => { startZoom = z; return z; });
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const e = easeInOut(t);
      const nextCenter: [number, number] = [
        startCenter[0] + (target.center[0] - startCenter[0]) * e,
        startCenter[1] + (target.center[1] - startCenter[1]) * e,
      ];
      const nextZoom = startZoom + (target.zoom - startZoom) * e;
      setCenterState(nextCenter);
      setZoomState(nextZoom);
      if (t < 1) {
        rafIdRef.current = requestAnimationFrame(tick);
      } else {
        rafIdRef.current = null;
        if (onComplete) onComplete();
      }
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }, [cancelAnimation]);

  useEffect(() => () => { cancelAnimation(); }, [cancelAnimation]);

  return { center, zoom, setCenter, setZoom, animateTo, cancelAnimation };
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add lib/useCameraAnimation.ts
git commit -m "feat(territory): useCameraAnimation hook (RAF + cubic ease-in-out)"
```

---

## Task 2: `usePanMomentum` hook

**Files:**
- Create: `lib/usePanMomentum.ts`

- [ ] **Step 1: Create the file**

Write `lib/usePanMomentum.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef } from 'react';

const FRICTION = 0.92;
const MIN_VELOCITY = 0.05;     // mercator-units per frame
const SAMPLE_WINDOW_MS = 80;
const MAX_SAMPLES = 8;

interface Sample {
  coords: [number, number];
  t: number;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface UsePanMomentumOpts {
  setCenter: (c: [number, number]) => void;
  getCenter: () => [number, number];
}

export interface PanMomentumHandlers {
  onMoveStart: () => void;
  onMove: (e: { coordinates: [number, number] }) => void;
  onMoveEnd: (e: { coordinates: [number, number]; zoom: number }) => void;
}

export function usePanMomentum(opts: UsePanMomentumOpts): PanMomentumHandlers {
  const { setCenter, getCenter } = opts;
  const samplesRef = useRef<Sample[]>([]);
  const rafIdRef = useRef<number | null>(null);

  const cancelRaf = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  useEffect(() => () => { cancelRaf(); }, [cancelRaf]);

  const onMoveStart = useCallback(() => {
    samplesRef.current = [];
    cancelRaf();
  }, [cancelRaf]);

  const onMove = useCallback((e: { coordinates: [number, number] }) => {
    const now = performance.now();
    const samples = samplesRef.current;
    samples.push({ coords: e.coordinates, t: now });
    if (samples.length > MAX_SAMPLES) samples.shift();
  }, []);

  const onMoveEnd = useCallback((e: { coordinates: [number, number]; zoom: number }) => {
    // Always commit the final coords first.
    setCenter(e.coordinates);

    if (prefersReducedMotion()) {
      samplesRef.current = [];
      return;
    }

    const now = performance.now();
    const samples = samplesRef.current.filter((s) => now - s.t <= SAMPLE_WINDOW_MS);
    samplesRef.current = [];
    if (samples.length < 2) return;

    const first = samples[0];
    const last = samples[samples.length - 1];
    const dtSec = (last.t - first.t) / 1000;
    if (dtSec <= 0) return;

    const vx = (last.coords[0] - first.coords[0]) / dtSec; // units/sec
    const vy = (last.coords[1] - first.coords[1]) / dtSec;
    let vxFrame = vx / 60; // units/frame at 60fps
    let vyFrame = vy / 60;

    const initialSpeed = Math.hypot(vxFrame, vyFrame);
    if (initialSpeed < MIN_VELOCITY) return;

    const tick = () => {
      const cur = getCenter();
      const next: [number, number] = [cur[0] + vxFrame, cur[1] + vyFrame];
      setCenter(next);
      vxFrame *= FRICTION;
      vyFrame *= FRICTION;
      if (Math.hypot(vxFrame, vyFrame) < MIN_VELOCITY) {
        rafIdRef.current = null;
        return;
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }, [setCenter, getCenter]);

  return { onMoveStart, onMove, onMoveEnd };
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add lib/usePanMomentum.ts
git commit -m "feat(territory): usePanMomentum hook (velocity-decay inertia after pan)"
```

---

## Task 3: Wire `useCameraAnimation` into `WorldMapView`

**Files:**
- Modify: `components/territory/map/WorldMapView.tsx`

- [ ] **Step 1: Add import + accept new props**

In `components/territory/map/WorldMapView.tsx`, add to the existing import block:

```ts
import { useCameraAnimation, type CameraAnimationTarget } from '@/lib/useCameraAnimation';
```

Find the `WorldMapViewProps` interface (around line 20):

```ts
interface WorldMapViewProps {
  onDrillDown: (iso2: string, name: string) => void;
}
```

Change to:

```ts
interface WorldMapViewProps {
  onDrillDown: (iso2: string, name: string) => void;
  cameraTarget?: CameraAnimationTarget & { durationMs: number };
  onCameraSettled?: () => void;
  className?: string;
}
```

Update the function signature destructure. Find:

```ts
export default function WorldMapView({ onDrillDown }: WorldMapViewProps) {
```

(The exact opening line may differ — find the `export default function WorldMapView(...)` and add the new props to the destructure.)

Change to:

```ts
export default function WorldMapView({ onDrillDown, cameraTarget, onCameraSettled, className }: WorldMapViewProps) {
```

- [ ] **Step 2: Replace local `useState` camera with the hook**

Find (around lines 112-117):

```ts
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const [center, setCenter] = useState<[number, number]>([0, 20]);
  const centerRef = useRef<[number, number]>(center);
  useEffect(() => { centerRef.current = center; }, [center]);
```

Replace with:

```ts
  const camera = useCameraAnimation([0, 20], 1);
  const { center, zoom, setCenter, setZoom } = camera;
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const centerRef = useRef<[number, number]>(center);
  useEffect(() => { centerRef.current = center; }, [center]);
```

(The component's existing `useState` import is preserved for other state. The `setCenter` and `setZoom` callers throughout the rest of the file continue to work — the destructured names match.)

- [ ] **Step 3: Run camera animation when `cameraTarget` arrives**

After the `camera`/`zoomRef`/`centerRef` block, add:

```ts
  useEffect(() => {
    if (!cameraTarget) return;
    camera.animateTo(
      { center: cameraTarget.center, zoom: cameraTarget.zoom },
      cameraTarget.durationMs,
      onCameraSettled,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraTarget, onCameraSettled]);
```

(`camera` is intentionally omitted from deps — including it would re-run on every render because the result object isn't memoized. The `cameraTarget` reference change is the actual trigger.)

- [ ] **Step 4: Apply optional `className` to the outer container**

Find the root wrapper `<div>` that hosts the map (search for the element whose props include `onMouseMove={(e) => { handleMouseMove(e); handleLassoMouseMove(e); }}` — typically the outermost wrapper before `<ComposableMap>`). Its current `className` likely contains the absolute-position classes for the map shell.

Change the className expression so it appends the optional prop. If the current line is:

```tsx
    <div
      className="absolute inset-0"
```

Change to:

```tsx
    <div
      className={`absolute inset-0 ${className ?? ''}`}
```

(If the existing className differs, preserve it verbatim and append ` ${className ?? ''}` at the end of the template literal.)

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add components/territory/map/WorldMapView.tsx
git commit -m "feat(territory): WorldMapView uses useCameraAnimation + accepts cameraTarget"
```

---

## Task 4: Wire `useCameraAnimation` into `DrillDownMapView`

**Files:**
- Modify: `components/territory/map/DrillDownMapView.tsx`

- [ ] **Step 1: Add import + accept new props**

Add to the existing import block:

```ts
import { useCameraAnimation, type CameraAnimationTarget } from '@/lib/useCameraAnimation';
```

Find the `DrillDownMapView` props type (around line 23):

```ts
interface DrillDownMapViewProps {
  countryIso2: string;
  countryName: string;
}
```

Change to:

```ts
interface DrillDownMapViewProps {
  countryIso2: string;
  countryName: string;
  cameraTarget?: CameraAnimationTarget & { durationMs: number };
  onCameraSettled?: () => void;
  className?: string;
}
```

Update the function destructure. Find:

```ts
export default function DrillDownMapView({ countryIso2, countryName }: DrillDownMapViewProps) {
```

Change to:

```ts
export default function DrillDownMapView({ countryIso2, countryName, cameraTarget, onCameraSettled, className }: DrillDownMapViewProps) {
```

- [ ] **Step 2: Replace the existing camera `useState`s with the hook**

Find (around lines 167-176):

```ts
  const [prevInitialZoom, setPrevInitialZoom] = useState(initialZoom);
  const [prevCenter, setPrevCenter] = useState(center);
  const [zoom, setZoom] = useState(initialZoom);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const [currentCenter, setCurrentCenter] = useState<[number, number]>(center);
```

Replace with:

```ts
  const [prevInitialZoom, setPrevInitialZoom] = useState(initialZoom);
  const [prevCenter, setPrevCenter] = useState(center);
  const camera = useCameraAnimation(center, initialZoom);
  const { center: currentCenter, zoom, setCenter: setCurrentCenter, setZoom } = camera;
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
```

Note the rename in the destructure: the hook's `center` is exposed locally as `currentCenter` and the hook's `setCenter` is exposed as `setCurrentCenter` to match the existing variable names in this file (which are used in many places below).

- [ ] **Step 3: Update the country-change re-derivation to call the hook's setters**

Find the block (around lines 182-187):

```ts
  if (prevInitialZoom !== initialZoom || prevCenter[0] !== center[0] || prevCenter[1] !== center[1]) {
    setPrevInitialZoom(initialZoom);
    setPrevCenter(center);
    setZoom(initialZoom);
    setCurrentCenter(center);
  }
```

No change needed — the destructured `setZoom` and `setCurrentCenter` are now from the hook, which cancels any in-flight animation when called imperatively. The country-change handler does the right thing automatically.

- [ ] **Step 4: Run camera animation when `cameraTarget` arrives**

Just after the country-change block, add:

```ts
  useEffect(() => {
    if (!cameraTarget) return;
    camera.animateTo(
      { center: cameraTarget.center, zoom: cameraTarget.zoom },
      cameraTarget.durationMs,
      onCameraSettled,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraTarget, onCameraSettled]);
```

- [ ] **Step 5: Apply optional `className` to the outer container**

Find the outer wrapping `<div>` (around line 370 or wherever the absolute-position class is set on the drill-down view's shell). If the current line is:

```tsx
      <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
```

Change to:

```tsx
      <div className={`absolute inset-0 overflow-y-auto overflow-x-hidden ${className ?? ''}`}>
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add components/territory/map/DrillDownMapView.tsx
git commit -m "feat(territory): DrillDownMapView uses useCameraAnimation + accepts cameraTarget"
```

---

## Task 5: Wire `usePanMomentum` into both views

**Files:**
- Modify: `components/territory/map/WorldMapView.tsx`
- Modify: `components/territory/map/DrillDownMapView.tsx`

- [ ] **Step 1: Add import + hook usage in `WorldMapView`**

In `components/territory/map/WorldMapView.tsx`, add to imports:

```ts
import { usePanMomentum } from '@/lib/usePanMomentum';
```

Just after the existing `camera` hook call (added in Task 3 Step 2), add:

```ts
  const momentum = usePanMomentum({
    setCenter: camera.setCenter,
    getCenter: () => centerRef.current,
  });
```

Find the existing `<ZoomableGroup>` opening (around lines 292-308):

```tsx
        <ZoomableGroup
          center={center}
          zoom={zoom}
          minZoom={1}
          maxZoom={8}
          // filterZoomEvent exists at runtime but is missing from the bundled types
          {...({ filterZoomEvent: (evt: Event) => {
            // Wheel events include trackpad pinch (delivered as wheel + ctrlKey). Always allow.
            if (evt.type === 'wheel') return true;
            if (evt.type === 'dblclick') return true;
            // Mousedown-drag pan only when zoomed in, to keep clicks at zoom 1 from being eaten by drag.
            return zoomRef.current > 1.05;
          }} as Record<string, unknown>)}
          onMoveEnd={({ coordinates, zoom: z }) => {
            setCenter(coordinates as [number, number]);
            setZoom(z);
          }}
        >
```

Change to:

```tsx
        <ZoomableGroup
          center={center}
          zoom={zoom}
          minZoom={1}
          maxZoom={8}
          onMoveStart={momentum.onMoveStart}
          onMove={momentum.onMove}
          // filterZoomEvent exists at runtime but is missing from the bundled types
          {...({ filterZoomEvent: (evt: Event) => {
            if (evt.type === 'wheel') return true;
            if (evt.type === 'dblclick') return true;
            return zoomRef.current > 1.05;
          }} as Record<string, unknown>)}
          onMoveEnd={(e) => {
            setZoom(e.zoom);
            momentum.onMoveEnd(e);
          }}
        >
```

The change: `onMoveStart` and `onMove` are new; the `onMoveEnd` body now hands `setCenter` over to the momentum hook (which also handles the final coords) and only commits `setZoom` directly.

- [ ] **Step 2: Add import + hook usage in `DrillDownMapView`**

In `components/territory/map/DrillDownMapView.tsx`, add to imports:

```ts
import { usePanMomentum } from '@/lib/usePanMomentum';
```

Just after the existing `camera` hook call (added in Task 4 Step 2), add:

```ts
  const centerRef = useRef<[number, number]>(currentCenter);
  useEffect(() => { centerRef.current = currentCenter; }, [currentCenter]);
  const momentum = usePanMomentum({
    setCenter: camera.setCenter,
    getCenter: () => centerRef.current,
  });
```

(The drill-down view didn't have a `centerRef` before — add one alongside the existing `zoomRef`.)

Find the existing `<ZoomableGroup>` opening (around lines 378-398):

```tsx
        <ZoomableGroup
          center={currentCenter}
          zoom={zoom}
          minZoom={initialZoom}
          maxZoom={80}
          translateExtent={[
          [-MAP_W, -mapHeight],
          [MAP_W * 2, mapHeight * 2]
          ]}
          // filterZoomEvent exists at runtime but is missing from the bundled types
          {...({ filterZoomEvent: (evt: Event) => {
            // Wheel events include trackpad pinch (delivered as wheel + ctrlKey). Always allow.
            if (evt.type === 'wheel') return true;
            if (evt.type === 'dblclick') return true;
            // Mousedown-drag pan only when zoomed in, to keep clicks at zoom 1 from being eaten by drag.
            return zoomRef.current > initialZoom * 1.05;
          }} as Record<string, unknown>)}
          onMoveEnd={({ coordinates, zoom: z }) => {
            setCurrentCenter(coordinates as [number, number]);
            setZoom(z);
          }}
        >
```

Change to:

```tsx
        <ZoomableGroup
          center={currentCenter}
          zoom={zoom}
          minZoom={initialZoom}
          maxZoom={80}
          translateExtent={[
          [-MAP_W, -mapHeight],
          [MAP_W * 2, mapHeight * 2]
          ]}
          onMoveStart={momentum.onMoveStart}
          onMove={momentum.onMove}
          // filterZoomEvent exists at runtime but is missing from the bundled types
          {...({ filterZoomEvent: (evt: Event) => {
            if (evt.type === 'wheel') return true;
            if (evt.type === 'dblclick') return true;
            return zoomRef.current > initialZoom * 1.05;
          }} as Record<string, unknown>)}
          onMoveEnd={(e) => {
            setZoom(e.zoom);
            momentum.onMoveEnd(e);
          }}
        >
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add components/territory/map/WorldMapView.tsx components/territory/map/DrillDownMapView.tsx
git commit -m "feat(territory): wire usePanMomentum into both map views"
```

---

## Task 6: `TerritoryApp` transition state machine

**Files:**
- Modify: `components/territory/TerritoryApp.tsx`

This is the largest task. It introduces the transition state, the store-change watcher, and the render-layer switch (including the US cross-fade path).

- [ ] **Step 1: Add imports**

In `components/territory/TerritoryApp.tsx`, add to imports:

```ts
import { useEffect, useRef, useState } from 'react';
import { COUNTRY_CENTROIDS } from '@/lib/countryCentroids';
```

(`useEffect` may already be imported — combine; `useRef` is new.)

- [ ] **Step 2: Add transition state type and initial state**

Inside the component, just after the existing state declarations (around line 21), add:

```ts
  type TransitionState =
    | { phase: 'idle' }
    | {
        phase: 'entering';
        targetIso: string;
        targetCenter: [number, number];
        targetZoom: number;
        crossFade: boolean;
      }
    | { phase: 'exiting'; sourceIso: string; crossFade: boolean };

  const [transition, setTransition] = useState<TransitionState>({ phase: 'idle' });
  const prevDrillRef = useRef<string | null>(drillDownCode);
```

- [ ] **Step 3: Add the drill-change effect**

Just after the state declarations, add:

```ts
  useEffect(() => {
    const prev = prevDrillRef.current;
    const curr = drillDownCode;
    prevDrillRef.current = curr;
    if (prev === curr) return;
    if (prev === null && curr !== null) {
      // Entering drill-down
      const crossFade = curr === 'US';
      const target = COUNTRY_CENTROIDS[curr] ?? [0, 20];
      setTransition({
        phase: 'entering',
        targetIso: curr,
        targetCenter: target,
        targetZoom: 6,
        crossFade,
      });
      if (crossFade) {
        const id = window.setTimeout(() => setTransition({ phase: 'idle' }), 200);
        return () => window.clearTimeout(id);
      }
    } else if (prev !== null && curr === null) {
      // Exiting drill-down
      const crossFade = prev === 'US';
      setTransition({ phase: 'exiting', sourceIso: prev, crossFade });
      if (crossFade) {
        const id = window.setTimeout(() => setTransition({ phase: 'idle' }), 200);
        return () => window.clearTimeout(id);
      }
    }
    // For the non-cross-fade paths, the child view will call onCameraSettled
    // to transition back to idle. No timer needed here.
  }, [drillDownCode]);
```

- [ ] **Step 4: Replace the existing render switch**

Find the existing render block:

```tsx
      <Toolbar drillDownCountryName={drillDownCode ? drillDownName : null} />
      <div className="flex flex-1 overflow-hidden">
        <TeamSidebar />
        <main className="relative flex flex-1 flex-col overflow-hidden">
          {activeView === 'map' ? (
            drillDownCode ? (
              <DrillDownMapView
                countryIso2={drillDownCode}
                countryName={drillDownName ?? drillDownCode}
              />
            ) : (
              <WorldMapView onDrillDown={handleDrillDown} />
            )
          ) : (
            <SpreadsheetView />
          )}
        </main>
      </div>
```

Replace the entire `{activeView === 'map' ? ... : <SpreadsheetView />}` expression with a helper-derived block. First add a small render helper just inside the component function (above the `return`):

```ts
  function renderMap() {
    if (transition.phase === 'entering' && !transition.crossFade) {
      // Mercator entering: keep showing world map with camera animating.
      return (
        <WorldMapView
          onDrillDown={handleDrillDown}
          cameraTarget={{
            center: transition.targetCenter,
            zoom: transition.targetZoom,
            durationMs: 300,
          }}
          onCameraSettled={() => setTransition({ phase: 'idle' })}
        />
      );
    }
    if (transition.phase === 'entering' && transition.crossFade) {
      // US cross-fade: mount both, opposing opacity.
      return (
        <>
          <WorldMapView
            onDrillDown={handleDrillDown}
            className="motion-safe:transition-opacity motion-safe:duration-200 opacity-0"
          />
          <DrillDownMapView
            countryIso2={transition.targetIso}
            countryName={drillDownName ?? transition.targetIso}
            className="motion-safe:transition-opacity motion-safe:duration-200 opacity-100"
          />
        </>
      );
    }
    if (transition.phase === 'exiting' && !transition.crossFade && drillDownCode === null) {
      // Mercator exiting: drill-down already cleared in the store, but we still want
      // to animate the drill-down camera back out before showing the world view.
      // Hold the previous drill code via transition.sourceIso for the duration.
      return (
        <DrillDownMapView
          countryIso2={transition.sourceIso}
          countryName={drillDownName ?? transition.sourceIso}
          cameraTarget={{
            center: [0, 20],
            zoom: 1,
            durationMs: 300,
          }}
          onCameraSettled={() => setTransition({ phase: 'idle' })}
        />
      );
    }
    if (transition.phase === 'exiting' && transition.crossFade) {
      return (
        <>
          <DrillDownMapView
            countryIso2={transition.sourceIso}
            countryName={drillDownName ?? transition.sourceIso}
            className="motion-safe:transition-opacity motion-safe:duration-200 opacity-0"
          />
          <WorldMapView
            onDrillDown={handleDrillDown}
            className="motion-safe:transition-opacity motion-safe:duration-200 opacity-100"
          />
        </>
      );
    }
    // phase: 'idle'
    if (drillDownCode) {
      return (
        <DrillDownMapView
          countryIso2={drillDownCode}
          countryName={drillDownName ?? drillDownCode}
        />
      );
    }
    return <WorldMapView onDrillDown={handleDrillDown} />;
  }
```

Then change the render block to:

```tsx
      <Toolbar drillDownCountryName={drillDownCode ? drillDownName : null} />
      <div className="flex flex-1 overflow-hidden">
        <TeamSidebar />
        <main className="relative flex flex-1 flex-col overflow-hidden">
          {activeView === 'map' ? renderMap() : <SpreadsheetView />}
        </main>
      </div>
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add components/territory/TerritoryApp.tsx
git commit -m "feat(territory): transition state machine for drill-down animation"
```

---

## Task 7: Verification + task-summary entry

**Files:**
- Modify: `.claude/docs/task-summary.md`

- [ ] **Step 1: Full verification**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

All three must exit clean.

- [ ] **Step 2: User manual smoke (ask the user; do not run yourself)**

Have the user run `npm run dev` and verify:

1. Click a non-US country (Germany, Brazil, India) → world map smoothly zooms toward the country over 300ms; drill-down view takes over with state data.
2. Click "World" breadcrumb from a drill-down → drill-down camera zooms out over 300ms; world view resumes.
3. Click the US → world fades out / drill-down fades in over 200ms.
4. Pan-flick (fast drag + release) → camera continues drifting with visible inertia ~1s, decaying smoothly.
5. Slow pan, release with near-zero velocity → no momentum; instant stop.
6. Two consecutive country clicks (mid-animation) → second click cancels first animation, starts new one.
7. `prefers-reduced-motion: reduce` → all transitions instant; no momentum decay.
8. Polish-A through Polish-C features still work: selection chip, `/` and `g` shortcuts, sidebar multi-select, bulk drag/delete, undo/redo, tree open/close animation.

- [ ] **Step 3: Append to `.claude/docs/task-summary.md`**

Append after the existing Polish-C section:

```markdown

---

## Shipped 2026-05-14 — Polish-D (animated drill transition + pan momentum)

Spec: `docs/superpowers/specs/2026-05-14-territory-polish-d-design.md`
Plan: `docs/superpowers/plans/2026-05-14-territory-polish-d.md`

Final follow-up polish pass on territory sub-projects 3 & 4. The
Polish-A through Polish-D backlog is closed.

### What shipped

- `lib/useCameraAnimation.ts` — RAF-driven center/zoom animation
  hook with cubic ease-in-out, `animateTo(target, durationMs,
  onComplete?)` imperative API, automatic cancellation on
  imperative `setCenter`/`setZoom` calls, and unmount cleanup.
  Respects `prefers-reduced-motion: reduce` (instant target +
  microtask `onComplete`).
- `lib/usePanMomentum.ts` — pan momentum handlers
  (`onMoveStart`/`onMove`/`onMoveEnd`) that record velocity samples
  during drag (last 80ms window, ring buffer of 8), compute release
  velocity, and run a friction-decay RAF (0.92 per frame) that
  drives `setCenter` until below the stop threshold. Respects
  `prefers-reduced-motion: reduce`.
- `components/territory/TerritoryApp.tsx` — owns a 3-phase
  `TransitionState` (`idle | entering | exiting`). Watches
  `drillDownCountryCode` via a `useRef`-tracked diff; on a `null →
  iso` transition kicks off a camera animation (Mercator) or
  cross-fade (US); on `iso → null` mirrors. Cross-fade path
  unmounts via a 200ms timer; Mercator path unmounts via the child
  view's `onCameraSettled` callback.
- `components/territory/map/WorldMapView.tsx` and
  `DrillDownMapView.tsx` — replaced their local
  `useState<[center, zoom]>` with `useCameraAnimation`; accept new
  optional props `cameraTarget`, `onCameraSettled`, `className`;
  wired `usePanMomentum` into `ZoomableGroup`'s
  `onMoveStart`/`onMove`/`onMoveEnd` (zoom committed synchronously
  in `onMoveEnd`, center handed off to the momentum hook). The
  drill-down view preserved its existing country-change
  re-derivation by calling the hook's imperative
  `setCenter`/`setZoom` from the same `prevInitialZoom`/`prevCenter`
  detection block (imperative calls cancel any in-flight tween).

### Out of scope (deferred)

- **Rubber-band edges.** d3-zoom's `translateExtent` is hard-clamped;
  elastic overshoot would require wrapping `ZoomableGroup` with a
  custom pan-interceptor that disables d3-zoom's drag during edge
  events. Substantial enough to be its own pass if revisited.
- **Per-country target zoom**. A single `zoom = 6` covers all
  countries because the drill-down view's `fitFeatures` recomputes
  the true fit the instant it mounts — the camera animation is
  visually directional, not precise.
- **Native iPad/Safari multi-touch gestures**. Existing
  `filterZoomEvent` handles wheel + trackpad pinch via the wheel
  event path.

### Verification

`npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.
Manual UI smoke checklist in plan Task 7 Step 2.
```

- [ ] **Step 4: Commit**

```bash
git add .claude/docs/task-summary.md
git commit -m "docs: log polish-D shipped (animated drill transition + pan momentum)"
```

---

## Self-Review Notes

**Spec coverage:**
- §1.1 transition state machine → T6 Step 2.
- §1.2 render layers per phase → T6 Step 4 (renderMap helper).
- §1.3 useCameraAnimation hook → T1.
- §1.4 cameraTarget/onCameraSettled props → T3 Step 1 (WorldMapView); T4 Step 1 (DrillDownMapView).
- §1.5 target camera math → T6 Step 3 (`targetCenter = COUNTRY_CENTROIDS[iso2] ?? [0, 20]`, `targetZoom = 6`, exit target `[0, 20] @ 1`).
- §1.6 toolbar breadcrumb behavior — unchanged; the breadcrumb already reads `drillDownCode` from the store directly.
- §2.1 usePanMomentum hook → T2.
- §2.2 wiring into views → T5.
- §2.3 translateExtent interaction — covered by reading `getCenter` from the live ref; velocity decays as expected when clamping kicks in (described in Task 5 setup; no new code needed).
- §3 out-of-scope items — explicit in task-summary entry.
- Verification + task-summary → T7.

**Placeholder scan:** clean.

**Type consistency:**
- `CameraAnimationTarget` defined in T1, consumed in T3 and T4 view props.
- `cameraTarget` prop shape `CameraAnimationTarget & { durationMs: number }` consistent across both views and the TerritoryApp helper (which constructs `{ center, zoom, durationMs: 300 }`).
- `usePanMomentum` opts (`setCenter: (c) => void; getCenter: () => [number, number]`) consistent in T2 definition and T5 call sites (both views pass `camera.setCenter` and `() => centerRef.current`).
- `TransitionState` shape only used inside `TerritoryApp` — no cross-file consistency concerns.
