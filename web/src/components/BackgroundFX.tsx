import React, { useEffect, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';

// Animated backdrop behind the feed.
//
// Runs on a canvas sized to CSS pixels (DPR capped at 1.5 — a phone at DPR 3
// would otherwise shade 9x the pixels for a decorative layer). The loop stops
// when the tab is hidden and never starts when Motion is Off or the OS asks
// for reduced motion, so it costs nothing for anyone who doesn't want it.

type Node = { x: number; y: number; vx: number; vy: number };

function readAccent(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  return v || '#B994FF';
}

export function BackgroundFX() {
  const { backgroundFx, motionLevel } = useSettings();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (backgroundFx !== 'constellation' && backgroundFx !== 'grid') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const speed = motionLevel === 'off' || reduced ? 0 : motionLevel === 'subtle' ? 0.22 : 0.5;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    let w = 0, h = 0, raf = 0, frame = 0, accent = readAccent();
    let nodes: Node[] = [];
    let scroll = 0;

    const seed = () => {
      const count = Math.max(22, Math.min(52, Math.round(w / 15)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
      }));
    };

    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const paintWash = () => {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.18, 0, w * 0.5, h * 0.18, Math.max(w, h) * 0.9);
      g.addColorStop(0, accent + '22');
      g.addColorStop(0.55, accent + '0d');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };

    const drawConstellation = () => {
      ctx.clearRect(0, 0, w, h);
      paintWash();
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      const LINK = 150;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const d = Math.hypot(dx, dy);
          if (d > LINK) continue;
          ctx.globalAlpha = (1 - d / LINK) * 0.55;
          ctx.strokeStyle = accent;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 8;
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    };

    const drawGrid = () => {
      ctx.clearRect(0, 0, w, h);
      paintWash();
      scroll = (scroll + speed * 0.6) % 46;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      for (let x = 0; x <= w; x += 46) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = -46 + scroll; y <= h; y += 46) {
        const fade = 0.12 + 0.3 * (y / h);           // denser toward the bottom
        ctx.globalAlpha = Math.max(0.08, fade);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const tick = () => {
      if (frame % 30 === 0) accent = readAccent();   // follows accent changes
      frame++;
      if (backgroundFx === 'grid') drawGrid(); else drawConstellation();
      raf = speed === 0 ? 0 : requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; }
      else if (!raf && speed > 0) raf = requestAnimationFrame(tick);
    };

    resize();
    tick();                                          // one frame even when static
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [backgroundFx, motionLevel]);

  if (backgroundFx === 'none') return null;

  if (backgroundFx === 'aurora') {
    // Pure CSS — three slow drifting blobs, cheaper than a canvas loop.
    return (
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div className="aurora-blob aurora-a" />
        <div className="aurora-blob aurora-b" />
        <div className="aurora-blob aurora-c" />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
    />
  );
}
