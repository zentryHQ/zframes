import { defineFrame } from "@zframes/core";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { breathingMeta } from "./schemas";

const schema = breathingMeta.schema;
type Config = z.output<typeof schema>;

/** The four box-breathing phases: label, duration (s), and the scale the
 *  circle eases TO during that phase. */
function buildPhases(config: Config) {
  return [
    { name: "Breathe in", dur: config.inhale, scale: 1 },
    { name: "Hold", dur: config.hold, scale: 1 },
    { name: "Breathe out", dur: config.exhale, scale: 0.45 },
    { name: "Hold", dur: config.holdAfter, scale: 0.45 },
  ];
}

function Breathing({ config }: { config: Config }) {
  const phases = buildPhases(config);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [config.inhale, config.hold, config.exhale, config.holdAfter]);

  useEffect(() => {
    const dur = Math.max(0, phases[idx].dur);
    const id = setTimeout(
      () => setIdx((i) => (i + 1) % phases.length),
      Math.max(300, dur * 1000),
    );
    return () => clearTimeout(id);
  }, [idx, config.inhale, config.hold, config.exhale, config.holdAfter]);

  const scale = phases[idx].scale;
  const transition = Math.max(0.3, phases[idx].dur);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <div
        className="aspect-square w-[55%] rounded-full"
        style={{
          background: "var(--color-highlight)",
          opacity: 0.25,
          transform: `scale(${scale})`,
          transition: `transform ${transition}s ease-in-out`,
        }}
      />
      <div className="caption text-soft absolute uppercase tracking-[0.2em]">
        {phases[idx].name}
      </div>
    </div>
  );
}

export const breathingFrame = defineFrame({
  ...breathingMeta,
  component: Breathing,
});
