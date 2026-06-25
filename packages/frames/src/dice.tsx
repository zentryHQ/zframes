import { defineFrame } from "@zframes/core";
import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";
import { interactiveSurface } from "./content-shared";
import { diceMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = diceMeta.schema;
type Config = z.output<typeof schema>;
type Mode = Config["mode"];

const accent = "var(--color-highlight)";

const MODE_LABEL: Record<Mode, string> = {
  coin: "Coin flip",
  dice: "Dice roll",
  list: "Random pick",
};

// Pip positions on a 3×3 grid for a die face (true = filled dot).
const PIP_FACES: Record<number, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
};

function pick(mode: Mode, options: string[]): string {
  if (mode === "coin") return Math.random() < 0.5 ? "Heads" : "Tails";
  if (mode === "dice") return String(Math.floor(Math.random() * 6) + 1);
  if (options.length === 0) return "";
  return options[Math.floor(Math.random() * options.length)] ?? "";
}

function Pips({ value }: { value: number }) {
  const face = PIP_FACES[value];
  if (!face) return null;
  return (
    <div className="grid grid-cols-3 gap-1" aria-hidden>
      {face.map((on, i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: on ? accent : "transparent" }}
        />
      ))}
    </div>
  );
}

function Dice({ config }: { config: Config }) {
  const { mode, options, label } = config;
  const empty = mode === "list" && options.length === 0;

  const [result, setResult] = useState(() => pick(mode, options));
  const [rolling, setRolling] = useState(false);

  // Re-roll a fresh value whenever the mode or options change via the rail.
  useEffect(() => {
    setResult(pick(mode, options));
  }, [mode, options]);

  // Brief shuffle animation: cycle a few random values, then settle.
  useEffect(() => {
    if (!rolling) return;
    let ticks = 0;
    const id = window.setInterval(() => {
      setResult(pick(mode, options));
      ticks += 1;
      if (ticks >= 6) {
        window.clearInterval(id);
        setRolling(false);
      }
    }, 60);
    return () => window.clearInterval(id);
  }, [rolling, mode, options]);

  const reroll = useCallback(() => {
    if (empty) return;
    setRolling(true);
  }, [empty]);

  if (empty) {
    return <FrameStatus>add options to decide</FrameStatus>;
  }

  const resultClass = mode === "list" ? "metric-lg" : "metric-xl";

  return (
    <button
      type="button"
      onClick={reroll}
      aria-label={`${MODE_LABEL[mode]} — roll again`}
      className={`flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 px-3 py-2 ${interactiveSurface}`}
    >
      <span className="caption text-soft uppercase tracking-[0.12em]">
        {MODE_LABEL[mode]}
      </span>

      <span
        aria-live="polite"
        className={`${resultClass} max-w-full break-words text-center leading-none transition-transform`}
        style={{
          color: accent,
          transform: rolling ? "scale(1.08)" : undefined,
        }}
      >
        {result}
      </span>

      {mode === "dice" && <Pips value={Number(result)} />}

      {label.trim() && (
        <span className="caption text-soft max-w-full text-center">
          {label.trim()}
        </span>
      )}

      <span className="caption text-disabled uppercase tracking-[0.12em]">
        click to roll
      </span>
    </button>
  );
}

export const diceFrame = defineFrame({
  ...diceMeta,
  component: Dice,
});
