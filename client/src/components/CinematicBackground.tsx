import React, { useEffect, useRef } from 'react';

/**
 * CinematicBackground
 * Premium, continuously animated cinematic backdrop for SynTube.
 * Features:
 *  - Slowly moving breathing energy waves (radial & volumetric)
 *  - Cinematic diagonal and vertical light beams
 *  - Layered floating particles & twinkling sparkles
 *  - Flowing orbital ribbons hugging viewport corners
 *  - Subtle ambient radial pulses
 *  - Layered mouse parallax on desktop / autonomous motion on mobile
 *  - High-performance, GPU-friendly HTML5 Canvas with tab visibility auto-pause
 *  - Full prefers-reduced-motion compliance
 */

interface Particle {
  x: number;
  y: number;
  z: number; // depth 0.2 to 1.0
  radius: number;
  vx: number;
  vy: number;
  baseAlpha: number;
  pulseSpeed: number;
  pulsePhase: number;
  colorType: 'gold' | 'cyan' | 'purple' | 'white';
}

interface Sparkle {
  x: number;
  y: number;
  size: number;
  age: number;
  lifespan: number;
  maxAlpha: number;
}

interface LightBeam {
  x: number;
  y: number;
  angle: number; // radians
  width: number;
  length: number;
  speed: number;
  alpha: number;
  targetAlpha: number;
  fadeIn: boolean;
  color: string;
}

interface AmbientPulse {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  speed: number;
  color: string;
}

export const CinematicBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Detect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Parallax tracking
    let targetMouseX = 0;
    let targetMouseY = 0;
    let currentMouseX = 0;
    let currentMouseY = 0;
    let isDesktop = window.innerWidth >= 768;

    const handlePointerMove = (e: MouseEvent) => {
      if (!isDesktop) return;
      // Normalized between -1 and 1
      targetMouseX = (e.clientX / width - 0.5) * 2;
      targetMouseY = (e.clientY / height - 0.5) * 2;
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: true });

    // Handle Resize with DPR cap of 1.5 for optimal performance
    const handleResize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      isDesktop = width >= 768;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Initialize Particles Pool
    const particleCount = isDesktop ? 65 : 35;
    const particles: Particle[] = [];
    const colors = {
      gold: '255, 210, 31',
      cyan: '56, 189, 248',
      purple: '168, 85, 247',
      white: '245, 245, 250',
    };

    for (let i = 0; i < particleCount; i++) {
      const z = 0.2 + Math.random() * 0.8;
      const types: ('gold' | 'cyan' | 'purple' | 'white')[] = ['gold', 'cyan', 'purple', 'white', 'white'];
      const colorType = types[Math.floor(Math.random() * types.length)];
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        z,
        radius: (0.7 + Math.random() * 2.2) * z,
        vx: (Math.random() - 0.48) * 0.25 * z,
        vy: (-0.15 - Math.random() * 0.35) * z, // drift gently upwards
        baseAlpha: 0.15 + Math.random() * 0.55 * z,
        pulseSpeed: 0.001 + Math.random() * 0.002,
        pulsePhase: Math.random() * Math.PI * 2,
        colorType,
      });
    }

    // Sparkles Pool
    const sparkles: Sparkle[] = [];
    let lastSparkleTime = 0;

    // Cinematic Light Beams
    const beams: LightBeam[] = [
      {
        x: width * 0.2,
        y: -100,
        angle: Math.PI / 4.2, // ~42 degrees diagonal sweep
        width: 180,
        length: Math.max(width, height) * 1.6,
        speed: 0.18,
        alpha: 0.02,
        targetAlpha: 0.07,
        fadeIn: true,
        color: '56, 189, 248', // cyan beam
      },
      {
        x: width * 0.75,
        y: -100,
        angle: -Math.PI / 4.8, // opposite diagonal sweep
        width: 240,
        length: Math.max(width, height) * 1.6,
        speed: 0.14,
        alpha: 0.01,
        targetAlpha: 0.06,
        fadeIn: true,
        color: '255, 210, 31', // warm gold beam
      },
      {
        x: width * 0.45,
        y: -50,
        angle: Math.PI / 12, // subtle vertical tilt
        width: 140,
        length: height * 1.4,
        speed: 0.1,
        alpha: 0.01,
        targetAlpha: 0.045,
        fadeIn: true,
        color: '168, 85, 247', // cosmic purple beam
      },
    ];

    // Ambient Radial Pulses
    const pulses: AmbientPulse[] = [];
    let lastPulseTime = 0;

    let lastTime = performance.now();
    let isTabVisible = !document.hidden;

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) {
        lastTime = performance.now();
        animFrameId = requestAnimationFrame(render);
      } else {
        cancelAnimationFrame(animFrameId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ==========================================
    // MAIN RENDER LOOP
    // ==========================================
    const render = (now: number) => {
      const dt = Math.min(now - lastTime, 64);
      lastTime = now;

      // Parallax easing
      if (isDesktop) {
        currentMouseX += (targetMouseX - currentMouseX) * 0.035;
        currentMouseY += (targetMouseY - currentMouseY) * 0.035;
      } else {
        // Autonomous gentle pendulum swaying on mobile
        currentMouseX = Math.sin(now * 0.00035) * 0.35;
        currentMouseY = Math.cos(now * 0.00028) * 0.25;
      }

      // Base Deep Void Background
      ctx.fillStyle = '#07080d';
      ctx.fillRect(0, 0, width, height);

      // ----------------------------------------------------
      // 1. SLOWLY MOVING ENERGY WAVES (Breathing Volumetric)
      // ----------------------------------------------------
      const timeSec = now * 0.001;

      // Energy Wave 1: Top-Right Warm Gold & Amber (18s cycle)
      const wave1Breath = 1 + 0.16 * Math.sin(timeSec * (Math.PI * 2 / 18));
      const wave1X = width * 0.88 + Math.cos(timeSec * 0.12) * 60 + currentMouseX * 30;
      const wave1Y = height * 0.12 + Math.sin(timeSec * 0.15) * 45 + currentMouseY * 25;
      const wave1Radius = Math.max(width, height) * 0.52 * wave1Breath;

      const grad1 = ctx.createRadialGradient(wave1X, wave1Y, 0, wave1X, wave1Y, wave1Radius);
      grad1.addColorStop(0, 'rgba(255, 210, 31, 0.09)');
      grad1.addColorStop(0.35, 'rgba(245, 158, 11, 0.055)');
      grad1.addColorStop(0.7, 'rgba(217, 119, 6, 0.02)');
      grad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, width, height);

      // Energy Wave 2: Bottom-Left Electric Cyan & Teal (22s cycle)
      const wave2Breath = 1 + 0.18 * Math.sin(timeSec * (Math.PI * 2 / 22) + 1.2);
      const wave2X = width * 0.1 + Math.sin(timeSec * 0.1) * 70 - currentMouseX * 35;
      const wave2Y = height * 0.88 + Math.cos(timeSec * 0.13) * 55 - currentMouseY * 30;
      const wave2Radius = Math.max(width, height) * 0.58 * wave2Breath;

      const grad2 = ctx.createRadialGradient(wave2X, wave2Y, 0, wave2X, wave2Y, wave2Radius);
      grad2.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
      grad2.addColorStop(0.4, 'rgba(14, 165, 233, 0.045)');
      grad2.addColorStop(0.75, 'rgba(6, 182, 212, 0.018)');
      grad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, width, height);

      // Energy Wave 3: Top-Left Deep Cosmic Violet (16s cycle)
      const wave3Breath = 1 + 0.14 * Math.sin(timeSec * (Math.PI * 2 / 16) + 2.5);
      const wave3X = width * 0.15 + Math.cos(timeSec * 0.14) * 40 + currentMouseX * 20;
      const wave3Y = height * 0.18 + Math.sin(timeSec * 0.11) * 35 + currentMouseY * 20;
      const wave3Radius = Math.max(width, height) * 0.45 * wave3Breath;

      const grad3 = ctx.createRadialGradient(wave3X, wave3Y, 0, wave3X, wave3Y, wave3Radius);
      grad3.addColorStop(0, 'rgba(147, 51, 234, 0.065)');
      grad3.addColorStop(0.5, 'rgba(126, 34, 206, 0.03)');
      grad3.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad3;
      ctx.fillRect(0, 0, width, height);

      // Energy Wave 4: Bottom-Right Cinema Rose / Magenta Flame (24s cycle)
      const wave4Breath = 1 + 0.15 * Math.sin(timeSec * (Math.PI * 2 / 24) + 3.8);
      const wave4X = width * 0.85 + Math.sin(timeSec * 0.09) * 50 - currentMouseX * 25;
      const wave4Y = height * 0.82 + Math.cos(timeSec * 0.12) * 45 - currentMouseY * 25;
      const wave4Radius = Math.max(width, height) * 0.48 * wave4Breath;

      const grad4 = ctx.createRadialGradient(wave4X, wave4Y, 0, wave4X, wave4Y, wave4Radius);
      grad4.addColorStop(0, 'rgba(244, 63, 94, 0.05)');
      grad4.addColorStop(0.5, 'rgba(225, 29, 72, 0.025)');
      grad4.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad4;
      ctx.fillRect(0, 0, width, height);

      // ----------------------------------------------------
      // 2. CINEMATIC LIGHT BEAMS (Volumetric Diagonal Sweeps)
      // ----------------------------------------------------
      ctx.save();
      for (const beam of beams) {
        // Drift beam position slowly
        beam.x += beam.speed * (dt / 16.6);

        // Beam lifecycle fade in / fade out
        if (beam.fadeIn) {
          beam.alpha += 0.0004 * (dt / 16.6);
          if (beam.alpha >= beam.targetAlpha) beam.fadeIn = false;
        } else {
          beam.alpha -= 0.0003 * (dt / 16.6);
          if (beam.alpha <= 0.005) {
            beam.fadeIn = true;
            beam.targetAlpha = 0.035 + Math.random() * 0.04;
            // Wrap / reposition with variation
            beam.x = (beam.x > width + 200) ? -250 : beam.x;
          }
        }

        // Draw rotated volumetric linear gradient strip
        ctx.save();
        ctx.translate(beam.x + currentMouseX * 15, beam.y + currentMouseY * 15);
        ctx.rotate(beam.angle);

        const beamGrad = ctx.createLinearGradient(-beam.width / 2, 0, beam.width / 2, 0);
        beamGrad.addColorStop(0, `rgba(${beam.color}, 0)`);
        beamGrad.addColorStop(0.2, `rgba(${beam.color}, ${beam.alpha * 0.4})`);
        beamGrad.addColorStop(0.5, `rgba(${beam.color}, ${beam.alpha})`);
        beamGrad.addColorStop(0.8, `rgba(${beam.color}, ${beam.alpha * 0.4})`);
        beamGrad.addColorStop(1, `rgba(${beam.color}, 0)`);

        ctx.fillStyle = beamGrad;
        ctx.fillRect(-beam.width / 2, -beam.length * 0.2, beam.width, beam.length);
        ctx.restore();
      }
      ctx.restore();

      // ----------------------------------------------------
      // 3. FLOWING ORBITAL RIBBONS (Outer Viewport Margins)
      // ----------------------------------------------------
      ctx.save();
      ctx.lineWidth = 1.6;

      // Ribbon 1: Upper-Right sweeping curve
      ctx.beginPath();
      const r1Steps = 24;
      for (let i = 0; i <= r1Steps; i++) {
        const u = i / r1Steps;
        const angle = -Math.PI * 0.2 + u * Math.PI * 0.8;
        const radiusBase = Math.min(width, height) * 0.65;
        const wobble = Math.sin(timeSec * 0.6 + u * 4) * 26 + Math.cos(timeSec * 0.4 + u * 3) * 18;
        const rx = width * 0.82 + (radiusBase + wobble) * Math.cos(angle) + currentMouseX * 22;
        const ry = height * 0.18 + (radiusBase + wobble) * Math.sin(angle) + currentMouseY * 18;
        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      const ribbon1Grad = ctx.createLinearGradient(width * 0.5, 0, width, height * 0.6);
      ribbon1Grad.addColorStop(0, 'rgba(255, 210, 31, 0)');
      ribbon1Grad.addColorStop(0.4, 'rgba(255, 210, 31, 0.16)');
      ribbon1Grad.addColorStop(0.8, 'rgba(245, 158, 11, 0.1)');
      ribbon1Grad.addColorStop(1, 'rgba(255, 210, 31, 0)');
      ctx.strokeStyle = ribbon1Grad;
      ctx.stroke();

      // Ribbon 2: Lower-Left sweeping curve
      ctx.beginPath();
      const r2Steps = 24;
      for (let i = 0; i <= r2Steps; i++) {
        const u = i / r2Steps;
        const angle = Math.PI * 0.6 + u * Math.PI * 0.85;
        const radiusBase = Math.min(width, height) * 0.72;
        const wobble = Math.sin(timeSec * 0.5 + u * 3.5) * 30 + Math.cos(timeSec * 0.35 + u * 2.8) * 20;
        const rx = width * 0.18 + (radiusBase + wobble) * Math.cos(angle) - currentMouseX * 24;
        const ry = height * 0.82 + (radiusBase + wobble) * Math.sin(angle) - currentMouseY * 20;
        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      const ribbon2Grad = ctx.createLinearGradient(0, height * 0.4, width * 0.5, height);
      ribbon2Grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      ribbon2Grad.addColorStop(0.4, 'rgba(56, 189, 248, 0.15)');
      ribbon2Grad.addColorStop(0.75, 'rgba(14, 165, 233, 0.09)');
      ribbon2Grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.strokeStyle = ribbon2Grad;
      ctx.stroke();
      ctx.restore();

      // ----------------------------------------------------
      // 4. AMBIENT PULSES (Radial Expanding Glow Waves)
      // ----------------------------------------------------
      // Trigger new pulse every ~11-18s
      if (now - lastPulseTime > 12000 + Math.random() * 6000) {
        lastPulseTime = now;
        pulses.push({
          x: width * (0.3 + Math.random() * 0.4),
          y: height * (0.25 + Math.random() * 0.4),
          radius: 10,
          maxRadius: Math.max(width, height) * (0.55 + Math.random() * 0.25),
          alpha: 0.08,
          speed: 0.65 + Math.random() * 0.35,
          color: Math.random() > 0.5 ? '255, 210, 31' : '56, 189, 248',
        });
      }

      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.radius += p.speed * (dt / 16.6);
        const progress = p.radius / p.maxRadius;
        const currentAlpha = p.alpha * Math.pow(1 - progress, 1.8);

        if (progress >= 1) {
          pulses.splice(i, 1);
          continue;
        }

        const pulseGrad = ctx.createRadialGradient(p.x, p.y, Math.max(0, p.radius - 80), p.x, p.y, p.radius);
        pulseGrad.addColorStop(0, `rgba(${p.color}, 0)`);
        pulseGrad.addColorStop(0.7, `rgba(${p.color}, ${currentAlpha * 0.5})`);
        pulseGrad.addColorStop(1, `rgba(${p.color}, 0)`);

        ctx.fillStyle = pulseGrad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // ----------------------------------------------------
      // 5. FLOATING PARTICLES (Multi-Layer Depth & Parallax)
      // ----------------------------------------------------
      for (const pt of particles) {
        // Organic sinusoidal motion
        pt.x += pt.vx * (dt / 16.6) + Math.sin(timeSec * 0.6 + pt.pulsePhase) * 0.15;
        pt.y += pt.vy * (dt / 16.6);

        // Screen wrap
        if (pt.y < -20) {
          pt.y = height + 20;
          pt.x = Math.random() * width;
        }
        if (pt.x < -20) pt.x = width + 20;
        else if (pt.x > width + 20) pt.x = -20;

        // Depth parallax offset
        const parallaxX = pt.x + currentMouseX * 35 * pt.z;
        const parallaxY = pt.y + currentMouseY * 25 * pt.z;

        // Subtle twinkling alpha
        const alphaPulse = Math.sin(timeSec * 2 + pt.pulsePhase) * 0.25;
        const alpha = Math.max(0.04, Math.min(0.85, pt.baseAlpha + alphaPulse));
        const rgb = colors[pt.colorType];

        // Draw particle with gentle glow
        ctx.beginPath();
        ctx.arc(parallaxX, parallaxY, pt.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
        ctx.fill();

        // For larger foreground particles, add soft radial aura
        if (pt.z > 0.75 && pt.radius > 1.6) {
          ctx.beginPath();
          ctx.arc(parallaxX, parallaxY, pt.radius * 2.8, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${rgb}, ${alpha * 0.18})`;
          ctx.fill();
        }
      }

      // ----------------------------------------------------
      // 6. SPARKLES (Brief Twinkling Starlight)
      // ----------------------------------------------------
      if (now - lastSparkleTime > 1800 + Math.random() * 2200 && sparkles.length < 6) {
        lastSparkleTime = now;
        sparkles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: 1.5 + Math.random() * 2.5,
          age: 0,
          lifespan: 1200 + Math.random() * 1000,
          maxAlpha: 0.6 + Math.random() * 0.35,
        });
      }

      for (let i = sparkles.length - 1; i >= 0; i--) {
        const s = sparkles[i];
        s.age += dt;
        if (s.age >= s.lifespan) {
          sparkles.splice(i, 1);
          continue;
        }

        const lifeRatio = s.age / s.lifespan;
        // Bell curve alpha (fade in, peak, fade out)
        const sAlpha = Math.sin(lifeRatio * Math.PI) * s.maxAlpha;

        ctx.save();
        ctx.translate(s.x + currentMouseX * 18, s.y + currentMouseY * 14);

        // 4-point cross star flare
        ctx.strokeStyle = `rgba(255, 235, 180, ${sAlpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-s.size * 2.2, 0);
        ctx.lineTo(s.size * 2.2, 0);
        ctx.moveTo(0, -s.size * 2.2);
        ctx.lineTo(0, s.size * 2.2);
        ctx.stroke();

        // Core bright dot
        ctx.fillStyle = `rgba(255, 255, 255, ${sAlpha})`;
        ctx.beginPath();
        ctx.arc(0, 0, s.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Continue loop if active
      if (!prefersReducedMotion && isTabVisible) {
        animFrameId = requestAnimationFrame(render);
      }
    };

    // Initial render
    animFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <div className="cinematic-bg-container" aria-hidden="true">
      <canvas ref={canvasRef} className="cinematic-bg-canvas" />
    </div>
  );
};
