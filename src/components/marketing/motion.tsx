'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Small motion helpers for the marketing pages. All of them are progressive: content is
 * fully visible without JavaScript, and `prefers-reduced-motion` turns the effects off (see
 * the `.sd-reveal` rules in globals.css).
 */

/** Fades and lifts its children in the first time they scroll into view. */
export function Reveal({ children, className, delay = 0, as: Tag = 'div' }: { children: React.ReactNode; className?: string; delay?: number; as?: 'div' | 'li' | 'section' }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.dataset.reveal = 'hidden';
    const io = new IntersectionObserver(
      ([entry]) => {
        // Also reveal anything the visitor has already scrolled past (fast scrolls, anchor jumps).
        if (entry?.isIntersecting || (entry && entry.boundingClientRect.top < 0)) {
          el.dataset.reveal = 'shown';
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as never} className={cn('sd-reveal', className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/** Tilts its child back in 3D and flattens it as the page scrolls it into view. */
export function ScrollTilt({ children, className, max = 24 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.75)));
      const e = 1 - Math.pow(1 - p, 3);
      el.style.setProperty('--tilt', `${(max * (1 - e)).toFixed(2)}deg`);
      el.style.setProperty('--tilt-scale', (0.9 + 0.1 * e).toFixed(3));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [max]);
  return (
    <div className={cn('[perspective:1600px]', className)}>
      <div ref={ref} className="origin-top transition-transform duration-100 ease-out will-change-transform [transform:rotateX(var(--tilt,0deg))_scale(var(--tilt-scale,1))]">
        {children}
      </div>
    </div>
  );
}

/** A card that tilts towards the pointer in 3D with a soft glare. */
export function TiltCard({ children, className, strength = 8 }: { children: React.ReactNode; className?: string; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce), (hover: none)').matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--rx', `${((0.5 - y) * strength).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((x - 0.5) * strength).toFixed(2)}deg`);
      el.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
      el.dataset.hover = 'true';
    };
    const leave = () => {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      delete el.dataset.hover;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [strength]);
  return (
    <div className="h-full [perspective:900px]">
      <div ref={ref} className={cn('sd-tilt relative h-full', className)}>
        {children}
        <span className="sd-tilt-glare pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden />
      </div>
    </div>
  );
}
