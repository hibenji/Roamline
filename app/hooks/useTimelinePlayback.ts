import { useEffect, type MutableRefObject } from 'react';

type UseTimelinePlaybackOptions = {
  isPlaying: boolean;
  playbackProgress: number;
  prefersReducedMotionRef: MutableRefObject<boolean>;
  progressRef: MutableRefObject<number>;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlaybackProgress: (progress: number) => void;
  speed: number;
};

export function useTimelinePlayback({
  isPlaying,
  playbackProgress,
  prefersReducedMotionRef,
  progressRef,
  setIsPlaying,
  setPlaybackProgress,
  speed,
}: UseTimelinePlaybackOptions) {
  useEffect(() => {
    progressRef.current = playbackProgress;
  }, [playbackProgress, progressRef]);

  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    let last = performance.now();
    const totalDuration = prefersReducedMotionRef.current ? 56000 : 44000;

    const tick = (now: number) => {
      const delta = Math.max(0, now - last);
      last = now;
      const next = progressRef.current + (delta / totalDuration) * speed;
      if (next >= 1) {
        progressRef.current = 1;
        setPlaybackProgress(1);
        setIsPlaying(false);
        return;
      }
      progressRef.current = next;
      setPlaybackProgress(next);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, prefersReducedMotionRef, progressRef, setIsPlaying, setPlaybackProgress, speed]);
}
