export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function secondsLeft(startMs: number, totalSec: number, nowMs: number): number {
  return Math.max(0, totalSec - Math.floor((nowMs - startMs) / 1000));
}

export function ringOffset(leftSec: number, totalSec: number, circumference: number): number {
  return circumference * (1 - leftSec / Math.max(totalSec, 1));
}
