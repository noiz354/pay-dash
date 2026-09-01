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
  const [isClient, setIsClient] = React.useState(false);

  React.useEffect(() => {
    setIsClient(true);
    // Check WebGL support — fallback to placeholder if unavailable (headless, test)
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) setHasError(true);
    } catch {
      setHasError(true);
    }
  }, []);

  if (hasError || !isClient) {
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
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        style={{ background: "white", width: "100%", height: "100%", display: "block" }}
        onCreated={({ gl }) => {
          gl.setClearColor("#ffffff", 1);
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
        <OrbitControls enableZoom={false} enablePan={false} enableRotate={true} autoRotate autoRotateSpeed={0.5} />
      </Canvas>
    </div>
  );
}
