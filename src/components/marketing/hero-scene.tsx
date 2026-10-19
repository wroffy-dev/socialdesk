'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Hero 3D scene: a glossy, slowly morphing orb with the five platform tiles orbiting it, tilting
 * towards the pointer. three.js is loaded on demand so it never delays the first paint, rendering
 * pauses while the hero is off-screen or the tab is hidden, and visitors who prefer reduced
 * motion get a single still frame. Without WebGL the section simply shows its CSS backdrop.
 */

type Glyph = 'INSTAGRAM' | 'FACEBOOK' | 'X' | 'LINKEDIN' | 'YOUTUBE';

const TILES: { glyph: Glyph; color: string }[] = [
  { glyph: 'INSTAGRAM', color: '#d6287a' },
  { glyph: 'FACEBOOK', color: '#1877f2' },
  { glyph: 'X', color: '#151515' },
  { glyph: 'LINKEDIN', color: '#0a66c2' },
  { glyph: 'YOUTUBE', color: '#ff1f1f' },
];

/** Draws a white platform glyph on a transparent canvas, used as the tile's face texture. */
function drawGlyph(glyph: Glyph) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.strokeStyle = g.fillStyle = '#ffffff';
  g.lineWidth = 18;
  g.lineCap = g.lineJoin = 'round';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const font = (px: number) => `800 ${px}px "Inter Variable", Inter, Arial, sans-serif`;
  switch (glyph) {
    case 'INSTAGRAM':
      g.beginPath();
      g.roundRect(60, 60, 136, 136, 40);
      g.stroke();
      g.beginPath();
      g.arc(128, 128, 32, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(168, 88, 9, 0, Math.PI * 2);
      g.fill();
      break;
    case 'FACEBOOK':
      g.font = font(190);
      g.fillText('f', 136, 146);
      break;
    case 'X':
      g.font = font(160);
      g.fillText('X', 128, 136);
      break;
    case 'LINKEDIN':
      g.font = font(140);
      g.fillText('in', 128, 136);
      break;
    case 'YOUTUBE':
      g.beginPath();
      g.moveTo(100, 76);
      g.lineTo(184, 128);
      g.lineTo(100, 180);
      g.closePath();
      g.fill();
      break;
  }
  return c;
}

export function HeroScene({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import('three');
      const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
      const { RoundedBoxGeometry } = await import('three/examples/jsm/geometries/RoundedBoxGeometry.js');
      if (disposed) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      } catch {
        return; // No WebGL: keep the CSS backdrop.
      }
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 0.95;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
      scene.environment = envTex;

      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      camera.position.set(0, 0, 9);

      const rig = new THREE.Group();
      scene.add(rig);

      // The orb: a physical material whose vertices drift on a few sine fields.
      const uniforms = { uTime: { value: 0 } };
      const orbMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#58c934'),
        roughness: 0.12,
        metalness: 0.45,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        iridescence: 0.9,
        iridescenceIOR: 1.35,
        sheen: 0.6,
        sheenColor: new THREE.Color('#c9b8ff'),
      });
      orbMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uniforms.uTime;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float w = sin(position.x * 1.7 + uTime * 0.9) * sin(position.y * 2.1 + uTime * 1.1) * sin(position.z * 1.9 + uTime * 0.7);
            float w2 = sin(position.y * 3.3 - uTime * 0.6) * 0.5;
            transformed += normal * (w * 0.16 + w2 * 0.05);`,
          );
      };
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45, 48), orbMat);
      rig.add(orb);

      // A faint ring to give the orbit some structure.
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.75, 0.012, 8, 160),
        new THREE.MeshBasicMaterial({ color: '#b8e4a3', transparent: true, opacity: 0.35 }),
      );
      ring.rotation.x = Math.PI / 2.35;
      rig.add(ring);

      // Platform tiles orbiting the orb.
      const tileGeo = new RoundedBoxGeometry(0.78, 0.78, 0.22, 5, 0.16);
      const faceGeo = new THREE.PlaneGeometry(0.6, 0.6);
      const textures: InstanceType<typeof THREE.CanvasTexture>[] = [];
      const tiles = TILES.map((t, i) => {
        const group = new THREE.Group();
        const body = new THREE.Mesh(
          tileGeo,
          new THREE.MeshPhysicalMaterial({ color: new THREE.Color(t.color), roughness: 0.32, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
        );
        const tex = new THREE.CanvasTexture(drawGlyph(t.glyph));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        textures.push(tex);
        const face = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
        face.position.z = 0.112;
        group.add(body, face);
        rig.add(group);
        return { group, phase: (i / TILES.length) * Math.PI * 2, bob: Math.random() * Math.PI * 2 };
      });

      // Soft key + rim light on top of the environment.
      const key = new THREE.DirectionalLight('#ffffff', 1.4);
      key.position.set(3, 4, 5);
      const rim = new THREE.DirectionalLight('#a78bfa', 1.2);
      rim.position.set(-4, -2, -3);
      scene.add(key, rim, new THREE.AmbientLight('#ffffff', 0.25));

      const resize = () => {
        const w = el.clientWidth || 1;
        const h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // Pull back on narrow screens so the orbit always fits.
        camera.position.z = w / h < 1 ? 11.5 : 9;
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

      const start = performance.now();
      const xAxis = new THREE.Vector3(1, 0, 0);
      const ringTilt = Math.PI / 2.35 - Math.PI / 2;
      const frame = (t: number) => {
        uniforms.uTime.value = t;
        orb.rotation.y = t * 0.15;
        orb.rotation.x = Math.sin(t * 0.2) * 0.2;
        tiles.forEach((tile, i) => {
          // Orbit in the ring's plane; faces stay turned towards the viewer with a gentle wobble.
          const a = tile.phase + t * 0.32;
          tile.group.position.set(Math.cos(a) * 2.75, Math.sin(t * 0.9 + tile.bob) * 0.18, Math.sin(a) * 2.75).applyAxisAngle(xAxis, ringTilt);
          tile.group.rotation.set(Math.sin(t * 0.5 + i) * 0.25, Math.sin(t * 0.4 + i) * 0.45, Math.sin(t * 0.6 + i) * 0.12);
        });
        rig.rotation.y += (pointer.x * 0.35 - rig.rotation.y) * 0.04;
        rig.rotation.x += (pointer.y * 0.2 - rig.rotation.x) * 0.04;
        renderer.render(scene, camera);
      };

      let raf = 0;
      let visible = true;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (!visible || document.hidden) return;
        frame((performance.now() - start) / 1000);
      };
      if (reduceMotion) frame(1.2);
      else loop();

      const io = new IntersectionObserver(([entry]) => (visible = !!entry?.isIntersecting), { threshold: 0 });
      io.observe(el);
      setReady(true);

      cleanup = () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        ro.disconnect();
        window.removeEventListener('pointermove', onPointer);
        scene.traverse((o) => {
          const m = o as InstanceType<typeof THREE.Mesh>;
          if (m.isMesh) {
            m.geometry.dispose();
            (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose());
          }
        });
        textures.forEach((t) => t.dispose());
        envTex.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <div ref={host} aria-hidden className={cn('transition-opacity duration-1000', ready ? 'opacity-100' : 'opacity-0', className)} />;
}
