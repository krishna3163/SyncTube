import confetti from 'canvas-confetti';

/**
 * Trigger celebratory watch-party confetti burst.
 * Respects prefers-reduced-motion and provides safe error boundaries.
 */
export function firePartyConfetti(options?: {
  particleCount?: number;
  spread?: number;
  origin?: { x: number; y: number };
}): void {
  if (typeof window === 'undefined') return;

  // Check prefers-reduced-motion
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  try {
    confetti({
      particleCount: options?.particleCount ?? 60,
      spread: options?.spread ?? 70,
      origin: options?.origin ?? { y: 0.65 },
      colors: ['#FFD21F', '#F05A28', '#38bdf8', '#34d399', '#a78bfa'],
      disableForReducedMotion: true,
      zIndex: 99999,
    });
  } catch {
    // Ignore canvas errors gracefully
  }
}

/**
 * Double cannon celebration burst for room creation and major milestones
 */
export function fireCelebrationMilestone(): void {
  if (typeof window === 'undefined') return;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  try {
    const end = Date.now() + 1000;
    const frame = () => {
      confetti({
        particleCount: 25,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#FFD21F', '#38bdf8', '#34d399'],
        zIndex: 99999,
      });
      confetti({
        particleCount: 25,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#F05A28', '#a78bfa', '#f472b6'],
        zIndex: 99999,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  } catch {}
}
