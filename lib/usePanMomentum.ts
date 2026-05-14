'use client';

import { useCallback, useEffect, useRef } from 'react';

const FRICTION = 0.92;
const MIN_VELOCITY = 0.05;
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

    const vx = (last.coords[0] - first.coords[0]) / dtSec;
    const vy = (last.coords[1] - first.coords[1]) / dtSec;
    let vxFrame = vx / 60;
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
