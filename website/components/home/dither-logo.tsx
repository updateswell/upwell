'use client';

import { useEffect, useRef } from 'react';

/** 8×8 Bayer matrix, normalized to 0–1 thresholds. */
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
  52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7,
  39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);

interface Particle {
  x: number;
  y: number;
  vy: number;
  life: number;
  size: number;
}

/**
 * The Upwell mark as ordered-dither pixels: the shape is shaded with a soft light from the top
 * left and a halo of dust, and pixels drift up out of the stack. Drawn in the current text color.
 */
export function DitherLogo({ cell = 3, className }: { cell?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cols = 0;
    let rows = 0;
    let shape: Float32Array = new Float32Array(0); // 0–1 coverage of the mark per cell
    let halo: Float32Array = new Float32Array(0); // blurred coverage, for the dust around it
    let noise: Float32Array = new Float32Array(0);
    let particles: Particle[] = [];
    let raf = 0;
    let visible = true;
    let last = 0;
    let disposed = false;

    const img = new Image();
    img.src = '/logo.svg';

    function sample(width: number, height: number, blur: number): Float32Array {
      const off = document.createElement('canvas');
      off.width = cols;
      off.height = rows;
      const o = off.getContext('2d', { willReadFrequently: true })!;
      o.filter = blur ? `blur(${blur}px)` : 'none';
      o.drawImage(img, (cols - width) / 2, (rows - height) / 2, width, height);
      const data = o.getImageData(0, 0, cols, rows).data;
      const out = new Float32Array(cols * rows);
      for (let i = 0; i < out.length; i++) out[i] = data[i * 4 + 3]! / 255;
      return out;
    }

    function layout() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(rect.width * dpr);
      canvas!.height = Math.round(rect.height * dpr);
      cols = Math.max(1, Math.floor(rect.width / cell));
      rows = Math.max(1, Math.floor(rect.height / cell));
      // Fit the mark (484×742) into ~88% of the height.
      const h = rows * 0.88;
      const w = (h * 484) / 742;
      shape = sample(w, h, 0);
      halo = sample(w, h, Math.max(2, cols / 40));
      noise = new Float32Array(cols * rows);
      for (let i = 0; i < noise.length; i++) noise[i] = Math.random();
      particles = [];
    }

    function spawn(): Particle {
      // Out of the top layer of the stack, around the middle of the mark.
      const cx = cols / 2 + (Math.random() - 0.5) * cols * 0.18;
      const cy = rows * (0.5 + Math.random() * 0.12);
      return { x: cx, y: cy, vy: 0.15 + Math.random() * 0.35, life: 1, size: Math.random() < 0.3 ? 2 : 1 };
    }

    function draw(t: number) {
      const dpr = canvas!.width / Math.max(1, cols * cell);
      ctx!.setTransform(1, 0, 0, 1, 0, 0);
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx!.fillStyle = getComputedStyle(canvas!).color;
      const px = cell * dpr;
      const dot = Math.max(1, px - Math.max(1, dpr * 0.75));
      const wave = t / 1400;

      for (let y = 0; y < rows; y++) {
        // Light from the top: lighter rows dither more sparsely, plus a slow upward shimmer.
        const light = 0.8 + 0.22 * (y / rows) + 0.06 * Math.sin(y / 6 + wave);
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const s = shape[i]!;
          const hl = halo[i]!;
          let v: number;
          if (s > 0.5) v = light + 0.12 * (noise[i]! - 0.5) - 0.1 * (x / cols);
          else v = hl * hl * 0.35 * noise[i]!; // sparse dust around the mark
          if (v > BAYER[(y % 8) * 8 + (x % 8)]!) ctx!.fillRect(x * px, y * px, dot, dot);
        }
      }

      for (const p of particles) {
        if (p.life * 0.9 > BAYER[(Math.floor(p.y) % 8) * 8 + (Math.floor(p.x) % 8)]!) {
          ctx!.fillRect(Math.floor(p.x) * px, Math.floor(p.y) * px, dot * p.size, dot * p.size);
        }
      }
    }

    function step(t: number) {
      raf = requestAnimationFrame(step);
      if (!visible || t - last < 50) return; // ~20 fps is plenty for pixels
      last = t;
      if (particles.length < cols * 0.35 && Math.random() < 0.6) particles.push(spawn());
      for (const p of particles) {
        p.y -= p.vy;
        p.x += (Math.random() - 0.5) * 0.3;
        p.life -= 0.006 + p.vy * 0.01;
      }
      particles = particles.filter((p) => p.life > 0 && p.y > 0);
      draw(t);
    }

    const resize = new ResizeObserver(() => {
      if (!img.complete) return;
      layout();
      draw(performance.now());
    });
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
    });
    // Redraw when the theme (text color) changes.
    const themeObserver = new MutationObserver(() => draw(performance.now()));

    img.onload = () => {
      if (disposed) return;
      layout();
      draw(0);
      resize.observe(canvas);
      io.observe(canvas);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      if (!reduceMotion) raf = requestAnimationFrame(step);
    };

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      io.disconnect();
      themeObserver.disconnect();
    };
  }, [cell]);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
