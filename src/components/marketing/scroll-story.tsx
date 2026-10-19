'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * "From idea to insight": a sticky 3D particle object that morphs as the visitor scrolls
 * through the steps (idea → calendar → paper plane → chat bubble → bar chart).
 *
 * All shapes are sampled once into point clouds; the vertex shader blends between the two
 * shapes around the current scroll position and scatters the particles mid-transition.
 * three.js loads on demand, rendering pauses off-screen, reduced motion turns off the idle
 * drift (the morph still follows the scroll), and without WebGL the steps read on their own.
 */

export interface StoryStep {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
}

type Three = typeof import('three');

/** Concatenates the triangles of several geometries into one flat position array. */
function triangles(geos: InstanceType<Three['BufferGeometry']>[]) {
  const parts = geos.map((g) => ((g.index ? g.toNonIndexed() : g).getAttribute('position') as InstanceType<Three['BufferAttribute']>).array as Float32Array);
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Area-weighted random points on a triangle soup, centred on the origin. */
function sample(tri: Float32Array, n: number, rand: () => number) {
  const count = tri.length / 9;
  const cum = new Float64Array(count);
  let total = 0;
  for (let t = 0; t < count; t++) {
    const i = t * 9;
    const ax = tri[i + 3]! - tri[i]!, ay = tri[i + 4]! - tri[i + 1]!, az = tri[i + 5]! - tri[i + 2]!;
    const bx = tri[i + 6]! - tri[i]!, by = tri[i + 7]! - tri[i + 1]!, bz = tri[i + 8]! - tri[i + 2]!;
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    total += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
    cum[t] = total;
  }
  const out = new Float32Array(n * 3);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < n; k++) {
    const r = rand() * total;
    let lo = 0, hi = count - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! < r) lo = mid + 1;
      else hi = mid;
    }
    let u = rand(), v = rand();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const i = lo * 9;
    for (let d = 0; d < 3; d++) {
      const p = tri[i + d]! + u * (tri[i + 3 + d]! - tri[i + d]!) + v * (tri[i + 6 + d]! - tri[i + d]!);
      out[k * 3 + d] = p;
      min[d] = Math.min(min[d]!, p);
      max[d] = Math.max(max[d]!, p);
    }
  }
  for (let k = 0; k < n; k++) for (let d = 0; d < 3; d++) out[k * 3 + d]! -= (min[d]! + max[d]!) / 2;
  return out;
}

/** The five shapes, as triangle soups. */
function shapes(THREE: Three) {
  const sphere = triangles([new THREE.IcosahedronGeometry(1.55, 12)]);

  const cal: InstanceType<Three['BufferGeometry']>[] = [new THREE.BoxGeometry(3.3, 0.5, 0.14).translate(0, 1.35, 0)];
  for (const x of [-0.9, 0.9]) cal.push(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 10).translate(x, 1.68, 0.06));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) cal.push(new THREE.BoxGeometry(0.36, 0.36, 0.1).translate(-1.36 + c * 0.453, 0.72 - r * 0.47, 0));
  const calendar = triangles(cal);

  // Paper plane: two wings and a keel meeting at the nose.
  const nose = [2, 0.2, 0], lw = [-1.6, 0.35, 1.5], rw = [-1.6, 0.35, -1.5], mid = [-1.25, 0.05, 0], keel = [-1.6, -0.75, 0];
  const plane = new Float32Array([...nose, ...mid, ...lw, ...nose, ...rw, ...mid, ...nose, ...keel, ...mid, ...nose, ...mid, ...keel]);

  const s = new THREE.Shape();
  const x = -1.6, y = -0.85, w = 3.2, h = 2.1, r = 0.55;
  s.moveTo(x + r, y);
  s.lineTo(x + 0.75, y);
  s.lineTo(x + 0.35, y - 0.65);
  s.lineTo(x + 1.25, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const bubble = triangles([
    new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 10 }),
    ...[-0.75, 0, 0.75].map((dx) => new THREE.SphereGeometry(0.17, 12, 8).translate(dx, 0.2, 0.45)),
  ]);

  const bars: InstanceType<Three['BufferGeometry']>[] = [new THREE.BoxGeometry(3.4, 0.08, 0.5).translate(0, -1.3, 0)];
  [0.8, 1.35, 1.05, 1.9, 2.55].forEach((hh, i) => bars.push(new THREE.BoxGeometry(0.46, hh, 0.46).translate(-1.36 + i * 0.68, -1.26 + hh / 2, 0)));
  const chart = triangles(bars);

  return [sphere, calendar, plane, bubble, chart];
}

const COLORS = ['#9be27a', '#5fd3b0', '#7cc4ff', '#b49bff', '#c8f07a'];

export function ScrollStory({ steps }: { steps: StoryStep[] }) {
  const stage = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const progress = useRef(0);
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);

  // Scroll position → continuous step index (0 … steps.length - 1).
  useEffect(() => {
    const ol = list.current;
    if (!ol) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const items = [...ol.children] as HTMLElement[];
      const vc = window.innerHeight / 2;
      const centers = items.map((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      });
      let p = 0;
      if (vc <= centers[0]!) p = 0;
      else if (vc >= centers[centers.length - 1]!) p = centers.length - 1;
      else {
        const i = centers.findIndex((c, k) => vc >= c && vc < centers[k + 1]!);
        p = i + (vc - centers[i]!) / (centers[i + 1]! - centers[i]!);
      }
      progress.current = p;
      setActive(Math.round(p));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import('three');
      if (disposed) return;
      let renderer: InstanceType<Three['WebGLRenderer']>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
      } catch {
        return;
      }
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const small = window.innerWidth < 768;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      el.appendChild(renderer.domElement);
      Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      camera.position.set(0, 0, 9);

      // Seeded random so the cloud looks the same on every visit.
      let seed = 7;
      const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      const N = small ? 4200 : 7500;
      const geo = new THREE.BufferGeometry();
      const sets = shapes(THREE).map((tri) => sample(tri, N, rand));
      sets.forEach((pts, i) => geo.setAttribute(`aP${i}`, new THREE.BufferAttribute(pts, 3)));
      geo.setAttribute('position', new THREE.BufferAttribute(sets[0]!.slice(), 3));
      const rnd = new Float32Array(N * 4);
      for (let i = 0; i < rnd.length; i++) rnd[i] = rand() * 2 - 1;
      geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));

      const uniforms = {
        uMorph: { value: 0 },
        uTime: { value: 0 },
        uSize: { value: small ? 50 : 46 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uColors: { value: COLORS.map((c) => new THREE.Color(c)) },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute vec3 aP0; attribute vec3 aP1; attribute vec3 aP2; attribute vec3 aP3; attribute vec3 aP4;
          attribute vec4 aRand;
          uniform float uMorph; uniform float uTime; uniform float uSize; uniform float uPixelRatio;
          uniform vec3 uColors[5];
          varying vec3 vColor; varying float vAlpha;
          vec3 shapeAt(int i) {
            if (i == 0) return aP0; if (i == 1) return aP1; if (i == 2) return aP2; if (i == 3) return aP3; return aP4;
          }
          void main() {
            float m = clamp(uMorph, 0.0, 4.0);
            int i = int(min(floor(m), 3.0));
            float f = m - float(i);
            // Each particle leaves a little earlier or later than its neighbours.
            float t = smoothstep(0.0, 1.0, clamp(f * 1.35 - (aRand.w * 0.5 + 0.5) * 0.35, 0.0, 1.0));
            vec3 p = mix(shapeAt(i), shapeAt(i + 1), t);
            float burst = sin(t * 3.14159);
            p += aRand.xyz * burst * 1.1;
            p += 0.025 * vec3(sin(uTime * 0.9 + aRand.x * 9.0), cos(uTime * 0.7 + aRand.y * 9.0), sin(uTime * 0.8 + aRand.z * 9.0));
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uSize * uPixelRatio * (0.55 + 0.45 * abs(aRand.w)) / -mv.z;
            vColor = mix(uColors[i], uColors[i + 1], t);
            vAlpha = 0.55 + 0.45 * abs(aRand.z) - burst * 0.25;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vColor; varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vColor * (0.85 + a * 1.1), a * vAlpha);
          }`,
      });
      const points = new THREE.Points(geo, mat);
      const rig = new THREE.Group();
      rig.add(points);
      scene.add(rig);

      const resize = () => {
        const w = el.clientWidth || 1;
        const h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.position.z = w / h < 0.9 ? 11 : 9;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      const pointer = { x: 0, y: 0 };
      const onPointer = (e: PointerEvent) => {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      };
      window.addEventListener('pointermove', onPointer, { passive: true });

      let visible = false;
      const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting));
      io.observe(el);

      const start = performance.now();
      let morph = progress.current;
      let raf = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (!visible || document.hidden) return;
        const t = (performance.now() - start) / 1000;
        morph += (progress.current - morph) * 0.07;
        uniforms.uMorph.value = morph;
        uniforms.uTime.value = reduceMotion ? 0 : t;
        const spin = reduceMotion ? 0 : Math.sin(t * 0.25) * 0.35;
        rig.rotation.y += (spin + pointer.x * 0.4 - rig.rotation.y) * 0.05;
        rig.rotation.x += (0.12 + pointer.y * 0.2 - rig.rotation.x) * 0.05;
        renderer.render(scene, camera);
      };
      loop();
      setReady(true);

      cleanup = () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        ro.disconnect();
        window.removeEventListener('pointermove', onPointer);
        geo.dispose();
        mat.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div className="relative grid gap-6 lg:grid-cols-2 lg:gap-12">
      <div className="sticky top-16 z-0 h-[42vh] lg:top-20 lg:order-2 lg:h-[calc(100vh-7rem)]">
        <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(126_217_87/0.18),transparent_65%)]" />
        <div ref={stage} aria-hidden className={cn('relative size-full transition-opacity duration-700', ready ? 'opacity-100' : 'opacity-0')} />
        <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.title} className={cn('h-1.5 rounded-full transition-all duration-500', i === active ? 'w-6 bg-[#b8e4a3]' : 'w-1.5 bg-white/25')} />
          ))}
        </div>
      </div>
      <ol ref={list} className="relative z-10 lg:order-1">
        {steps.map((s, i) => (
          <li key={s.title} className="flex min-h-[62vh] items-center lg:min-h-[78vh]">
            <div className={cn('rounded-2xl border p-6 backdrop-blur-md transition-all duration-500 sm:p-8', i === active ? 'border-white/15 bg-white/[0.06] opacity-100' : 'border-white/5 bg-white/[0.02] opacity-45')}>
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[#b8e4a3]">
                {String(i + 1).padStart(2, '0')} · {s.eyebrow}
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{s.title}</h3>
              <p className="mt-3 text-[16px] leading-relaxed text-white/65">{s.body}</p>
              <ul className="mt-5 space-y-2 text-[14px] text-white/80">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#b8e4a3]" /> {p}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
