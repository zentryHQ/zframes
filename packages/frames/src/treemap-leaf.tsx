import { useMoney, type Money } from "@zframes/core";

/**
 * The label rendered inside every treemap tile (TVL, DEX volume, protocol TVL,
 * protocol fees, market cap). One shrink-threshold pair + one type/color
 * treatment so the five treemaps read as one family. Frames pass the already-
 * formatted `secondary` string (a money magnitude via `useMoney()`) so the
 * number style is identical across all of them.
 *
 * Deliberately has no `title` prop. It used to take one and set it as an HTML
 * `title` attribute — the browser's own tooltip — which now double-prints on top
 * of the shared hover tooltip `TreeChart` renders. The hover reading belongs to
 * the chart's `formatTooltip`, where it can be structured rows instead of one
 * middot-joined string.
 */
export function TreemapLeaf({
  width,
  height,
  label,
  secondary,
}: {
  width: number;
  height: number;
  label: string;
  /** Formatted secondary line (e.g. `$1.23B`); hidden on small tiles. */
  secondary?: string;
}) {
  // Tiny leaves render clipped fragments — better to show nothing and let
  // size + hover carry the information.
  if (width < 48 || height < 30) return null;
  const compact = width < 70 || height < 44;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden p-1 text-center">
      <span className="body-sm block w-full min-w-0 truncate font-bold text-strong">
        {label}
      </span>
      {!compact && secondary && (
        <span className="caption block w-full min-w-0 truncate text-soft">
          {secondary}
        </span>
      )}
    </div>
  );
}

/**
 * Builds a treemap's `LeafComponent` from just the two things that vary.
 *
 * Twelve treemap frames declared an identical local `Leaf` whose entire body
 * was "call `useMoney()`, format one field, forward width/height/label to
 * `TreemapLeaf`" — about eighteen lines each of pure adapter, and nothing but
 * the field and its formatter differed:
 *
 *     const Leaf = treemapLeaf<TvlNode>(
 *       (d) => d.id,
 *       (d, money) => money.compact(d.tvl),
 *     );
 *
 * `secondary` receives `money` rather than resolving anything itself, so the
 * conversion stays visible in the frame that owns the reading — which is also
 * what keeps `tests/currency-coverage.test.ts`'s per-frame source scan able to
 * see it. A factory, not a compound component: `TreeChart` computes each tile's
 * geometry with `d3-hierarchy` and renders N instances of whatever component it
 * is handed, so per-tile `width`/`height` can only arrive as props.
 */
export function treemapLeaf<T>(
  label: (data: T) => string,
  secondary?: (data: T, money: Money) => string | undefined,
) {
  return function Leaf({
    width,
    height,
    data,
  }: {
    width: number;
    height: number;
    data: T;
  }) {
    // Unconditionally, before `TreemapLeaf`'s own size gate can bail: a hook
    // behind an early return is a hook that sometimes doesn't run.
    const money = useMoney();
    return (
      <TreemapLeaf
        width={width}
        height={height}
        label={label(data)}
        secondary={secondary?.(data, money)}
      />
    );
  };
}
