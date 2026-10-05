"use client";

import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";
import type { LangCode } from "@/lib/types";
import { THEMES } from "./themes";

export default function ShaderWash({ lang, className = "" }: { lang: LangCode; className?: string }) {
  const [c1, c2, c3] = THEMES[lang].wash;
  return (
    <ShaderGradientCanvas className={className} pixelDensity={1} pointerEvents="none" lazyLoad={false}>
      <ShaderGradient
        control="props"
        type="waterPlane"
        animate="on"
        uSpeed={0.08}
        uStrength={1.4}
        uDensity={1.2}
        uFrequency={4}
        uAmplitude={0}
        color1={c1}
        color2={c2}
        color3={c3}
        grain="off"
        lightType="3d"
        brightness={1.3}
        reflection={0.05}
        envPreset="dawn"
        cAzimuthAngle={180}
        cPolarAngle={90}
        cDistance={3.4}
        cameraZoom={1}
        positionX={0}
        positionY={0}
        positionZ={0}
        rotationX={0}
        rotationY={10}
        rotationZ={50}
      />
    </ShaderGradientCanvas>
  );
}
