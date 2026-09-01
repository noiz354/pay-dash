"use client";

import * as React from "react";
import { Canvas } from "@react-three/fiber";
import { Float, OrbitControls } from "@react-three/drei";

// 3D Hero — three + R3F + drei behind dynamic(ssr:false) (PHASE0_PLAN T9, NEXTJS #146 motion)
// Fix dark square: explicit background, alpha, error handling, ResizeObserver
function Box() {
  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh>
        <boxGeometry args={[1.5, 1.5, 1.5]} />
        <meshStandardMaterial color="#003fb1" />
      </mesh>
    </Float>
  );
}

export function Hero3D() {
  const [hasError, setHasError] = React.useState(false);
  const glRef = React.useRef<import("three").WebGLRenderer | null>(null);

  React.useEffect(() => {
    let mounted = true;
    // Check WebGL support — fallback to placeholder if unavailable (headless, test)
    // Note: three@0.185 Clock is deprecated in favor of Timer (three/addons/misc/Timer.js) — no Clock used here, Float uses internal Timer
    try {
      const canvas = document.createElement("canvas");
      const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as WebGLRenderingContext | null;
      if (!gl && mounted) setHasError(true);
      // Cleanup test canvas to avoid context leak
      canvas.remove();
    } catch {
      if (mounted) setHasError(true);
    }
    return () => {
      mounted = false;
    };
  }, []);

  // Cleanup WebGL on unmount / HMR — prevent Context Lost leak
  React.useEffect(() => {
    return () => {
      const gl = glRef.current;
      if (!gl) return;
      try {
        const canvas = gl.domElement as HTMLCanvasElement & { __onLost?: EventListener; __onRestored?: EventListener };
        const onLost = (gl as unknown as { __onLost?: EventListener }).__onLost;
        const onRestored = (gl as unknown as { __onRestored?: EventListener }).__onRestored;
        if (onLost) canvas.removeEventListener("webglcontextlost", onLost);
        if (onRestored) canvas.removeEventListener("webglcontextrestored", onRestored);
        gl.dispose();
        const maybeForceLoss = gl as unknown as { forceContextLoss?: () => void };
        if (typeof maybeForceLoss.forceContextLoss === "function") maybeForceLoss.forceContextLoss();
      } catch {}
    };
  }, []);

  if (hasError) {
    return (
      <div className="h-[200px] w-full rounded-lg border bg-white flex items-center justify-center" role="img" aria-label="3D hero placeholder">
        <div className="flex flex-col items-center gap-2 text-[var(--on-surface-variant)]">
          <span className="material-symbols-outlined text-[32px]" aria-hidden="true">
            view_in_ar
          </span>
          <span className="body-sm">3D Preview</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[200px] w-full rounded-lg border bg-white overflow-hidden">
      <Canvas
        camera={{ position: [0, 0, 4] }}
        dpr={[1, 2]}
        frameloop="demand"
        performance={{ min: 0.5 }}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        style={{ background: "white", width: "100%", height: "100%", display: "block" }}
        onCreated={({ gl }) => {
          glRef.current = gl as unknown as import("three").WebGLRenderer;
          gl.setClearColor("#ffffff", 1);
          const canvas = gl.domElement;
          const onLost = (e: Event) => {
            e.preventDefault();
            setHasError(true);
          };
          const onRestored = () => setHasError(false);
          canvas.addEventListener("webglcontextlost", onLost, false);
          canvas.addEventListener("webglcontextrestored", onRestored, false);
          // Store handlers for cleanup
          (gl as unknown as { __onLost?: EventListener; __onRestored?: EventListener }).__onLost = onLost;
          (gl as unknown as { __onRestored?: EventListener }).__onRestored = onRestored;
        }}
        fallback={
          <div className="h-full w-full flex items-center justify-center bg-white">
            <span className="material-symbols-outlined" aria-hidden="true">
              view_in_ar
            </span>
          </div>
        }
      >
        <color attach="background" args={["white"]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[2, 2, 2]} intensity={1} />
        <React.Suspense
          fallback={
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#e2e8f0" />
            </mesh>
          }
        >
          <Box />
        </React.Suspense>
        <OrbitControls enableZoom={false} enablePan={false} enableRotate={true} autoRotate autoRotateSpeed={0.5} enableDamping />
      </Canvas>
    </div>
  );
}

// Cleanup on unmount / HMR — prevent WebGL context leak
// Note: React Three Fiber will call gl.dispose() on unmount, but we also handle forced loss for HMR
if (typeof window !== "undefined") {
  // No top-level side effect; handled via onCreated + useEffect cleanup in component
}
