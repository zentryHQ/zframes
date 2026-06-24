import { defineFrame } from "@zframes/core";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { interactiveSurface } from "./content-shared";
import { pomodoroMeta } from "./schemas";

const schema = pomodoroMeta.schema;
type Config = z.output<typeof schema>;

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Pomodoro({ config }: { config: Config }) {
  const workSec = Math.max(1, Math.round(config.workMin * 60));
  const breakSec = Math.max(1, Math.round(config.breakMin * 60));
  const [phase, setPhase] = useState<"work" | "break">("work");
  const [remaining, setRemaining] = useState(workSec);
  const [running, setRunning] = useState(false);
  const [cycle, setCycle] = useState(1);

  // Reset whenever the configured durations change.
  useEffect(() => {
    setPhase("work");
    setRemaining(workSec);
    setRunning(false);
    setCycle(1);
  }, [workSec, breakSec]);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const cycleRef = useRef(cycle);
  cycleRef.current = cycle;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r > 1) return r - 1;
        if (phaseRef.current === "work") {
          setPhase("break");
          return breakSec;
        }
        setPhase("work");
        setCycle((c) => (cycleRef.current >= config.cycles ? 1 : c + 1));
        return workSec;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, workSec, breakSec, config.cycles]);

  const reset = () => {
    setRunning(false);
    setPhase("work");
    setRemaining(workSec);
    setCycle(1);
  };

  const label = config.label.trim();
  const accent = phase === "work" ? "var(--color-highlight)" : undefined;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1">
      {label && (
        <div className="caption text-soft uppercase tracking-[0.12em]">{label}</div>
      )}
      <div className="caption text-soft uppercase tracking-[0.18em]">
        {phase} · {cycle}/{config.cycles}
      </div>
      <div className="metric-xl text-strong" style={{ color: accent }}>
        {fmt(remaining)}
      </div>
      <div className="mt-1 flex gap-1">
        <button
          type="button"
          onClick={() => setRunning((v) => !v)}
          className={`caption text-normal px-3 py-1 ${interactiveSurface}`}
        >
          {running ? "Pause" : "Start"}
        </button>
        <button
          type="button"
          onClick={reset}
          className={`caption text-soft px-3 py-1 ${interactiveSurface}`}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export const pomodoroFrame = defineFrame({
  ...pomodoroMeta,
  component: Pomodoro,
});
