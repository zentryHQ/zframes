import { AssetLogo } from "./asset-logo";
import { changeColor, formatChangePct, formatPrice } from "./format";

/**
 * One asset row — logo · ticker · price · 24h change — shared by top-movers,
 * coin-movers and price-ticker so the same semantic element reads identically
 * everywhere (one label weight, one price/change treatment, one color source).
 * `price`/`changePct` may be undefined (price-ticker streams them in), rendering
 * quiet placeholders instead of a layout shift.
 */
export function MoverRow({
  symbol,
  label,
  price,
  changePct,
  logoSize = 16,
  gap = "gap-2",
}: {
  symbol: string;
  /** Resolved display label (e.g. `tickerOf(symbol)` or the raw symbol). */
  label: string;
  price?: number;
  changePct?: number;
  logoSize?: number;
  /** Tailwind gap utility — price-ticker runs a touch roomier (`gap-3`). */
  gap?: string;
}) {
  return (
    <div
      className={`grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center ${gap}`}
      title={
        price !== undefined ? `${label} · ${formatPrice(price)}` : label
      }
    >
      <AssetLogo symbol={symbol} size={logoSize} />
      <span className="body-sm truncate font-bold text-strong">{label}</span>
      <span className="caption text-soft text-right tabular-nums">
        {price !== undefined ? formatPrice(price) : "—"}
      </span>
      <span
        className={`caption text-right font-bold tabular-nums${
          changePct === undefined ? " text-disabled" : ""
        }`}
        style={
          changePct !== undefined ? { color: changeColor(changePct) } : undefined
        }
      >
        {changePct !== undefined ? formatChangePct(changePct) : "…"}
      </span>
    </div>
  );
}
