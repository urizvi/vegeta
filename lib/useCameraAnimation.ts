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
