/**
 * The label rendered inside every treemap tile (TVL, DEX volume, protocol TVL,
 * protocol fees, market cap). One shrink-threshold pair + one type/color
 * treatment so the five treemaps read as one family. Frames pass the already-
 * formatted `secondary` string (a `$` magnitude via `formatCompactUsd`) so the
 * number style is identical across all of them.
 */
export function TreemapLeaf({
  width,
  height,
  label,
  secondary,
  title,
}: {
  width: number;
  height: number;
  label: string;
  /** Formatted secondary line (e.g. `$1.23B`); hidden on small tiles. */
  secondary?: string;
  title?: string;
}) {
  // Tiny leaves render clipped fragments — better to show nothing and let
  // size + hover carry the information.
  if (width < 48 || height < 30) return null;
  const compact = width < 70 || height < 44;
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center overflow-hidden p-1 text-center"
      title={title}
    >
      <span className="body-sm truncate font-bold text-strong">{label}</span>
      {!compact && secondary && (
        <span className="caption text-soft">{secondary}</span>
      )}
    </div>
  );
}
