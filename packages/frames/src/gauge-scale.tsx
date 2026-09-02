/**
 * Guards for the gauge family, whose whole job is one number.
 *
 * `RadialGauge` clamps the ARC into `[min, max]` and nothing else, so a reading
 * past the dial's ceiling drew a full ring under a figure well above it: the
 * most confident possible presentation of a number the dial cannot show. The
 * only hint was the ring's hover tooltip, which does not exist on touch. And a
 * non-finite reading (a ratio whose denominator came back zero) reached the
 * centre slot as the literal `NaN`.
 *
 * Both are answered here rather than in the chart: the arc clamp is correct —
 * an arc has nowhere to put an overflow — and it is the FRAME that knows what
 * its bounds mean and how its figure is written.
 */
import type { ReactNode } from "react";
import { GaugeCard } from "./chart-card";

/** Where a reading sits against the dial's declared bounds. */
export type GaugeScale = "in" | "over" | "under" | "absent";

/**
 * Classify a reading. `absent` covers `NaN` and both infinities — anything the
 * centre figure must not print as a number.
 */
export function gaugeScale(
  value: number,
  min: number,
  max: number,
): GaugeScale {
  if (!Number.isFinite(value)) return "absent";
  if (value > max) return "over";
  if (value < min) return "under";
  return "in";
}

/**
 * The value to hand the ring. Identical to `value` for anything finite; an
 * absent reading draws the empty ring (`min`) rather than feeding `NaN` into
 * d3's arc, which yields a path attribute of `NaN`s and paints nothing at all.
 */
export function gaugeRingValue(value: number, min: number): number {
  return Number.isFinite(value) ? value : min;
}

/**
 * The off-scale marker, for the line under the centre figure (the gauge's
 * regime word). Renders nothing while the reading is on the dial, so a gauge
 * composes it unconditionally.
 *
 * It names the BOUND rather than saying only "off scale": "above 40" tells the
 * reader how to re-read the ring, and it is real text, so it reaches a screen
 * reader without an aria dance. The arrow is decorative — the words carry it.
 *
 * Deliberately the default strong ink, not the loss colour: running off the
 * dial is a fact about the dial, not a direction the data moved, and three of
 * these gauges are already coloured by a regime ramp that the semantic pair
 * would fight.
 */
export function GaugeOffScale({
  scale,
  min,
  max,
  format,
}: {
  scale: GaugeScale;
  min: number;
  max: number;
  /** The gauge's own figure formatter, so the bound matches the centre. */
  format: (value: number) => string;
}): ReactNode {
  if (scale !== "over" && scale !== "under") return null;
  const over = scale === "over";
  return (
    <span className="text-strong ml-1 whitespace-nowrap">
      <span aria-hidden>· {over ? "▲" : "▼"} </span>
      {over ? "above" : "below"} {format(over ? max : min)}
    </span>
  );
}

/**
 * The centre figure when there is no reading. An em-dash in disabled ink is the
 * package's convention for an absent value (`CardHeader.Value`'s `absent`), and
 * the disabled ink is the part that matters: a placeholder inheriting the
 * figure's ink is indistinguishable from data at a glance.
 *
 * Sized with a plain `metric-xl` rather than `GaugeCard.Value`'s hole fit —
 * one narrow glyph cannot overrun a dial, so there is nothing to measure.
 */
export function GaugeAbsent(): ReactNode {
  return (
    <div className="metric-xl text-disabled leading-none">
      <span aria-hidden>—</span>
      <span className="sr-only">no reading</span>
    </div>
  );
}

/**
 * The whole centre slot of a `GaugeCard` gauge: the figure, the regime word
 * under it, and whichever of the two guards applies.
 *
 * One component rather than three props threaded through five frames, because
 * the branch is the same every time and the failure mode of getting it wrong is
 * silent — a gauge that forgot the guard looks exactly like a gauge whose
 * reading happens to be on the dial. Frames that lay out their own centre
 * (`metal-cot-gauge`) compose {@link GaugeOffScale} and {@link GaugeAbsent}
 * directly instead.
 *
 * `format` is the frame's own figure formatter and is used for the centre, the
 * named bound and — passed on as the gauge's `formatValue` by the caller — the
 * ring's hover tooltip, so all three agree on precision. Without it the tooltip
 * fell back to `String(v)` and printed a put/call ratio of `1.04` as
 * `1.0400000000000002` beside its own rounded centre figure.
 */
export function GaugeReading({
  value,
  min,
  max,
  format,
  tint,
  glow,
  label,
}: {
  value: number;
  min: number;
  max: number;
  format: (value: number) => string;
  tint?: string;
  /** Passed through to `GaugeCard.Value` — see its note on the bloom. */
  glow?: boolean | string;
  /** The regime word ("elevated", "put / call", "BTC dominance"). */
  label: ReactNode;
}): ReactNode {
  const scale = gaugeScale(value, min, max);
  if (scale === "absent")
    return (
      <>
        <GaugeAbsent />
        <GaugeCard.Label>no reading</GaugeCard.Label>
      </>
    );
  return (
    <>
      <GaugeCard.Value tint={tint} glow={glow}>
        {format(value)}
      </GaugeCard.Value>
      <GaugeCard.Label>
        {label}
        <GaugeOffScale scale={scale} min={min} max={max} format={format} />
      </GaugeCard.Label>
    </>
  );
}
