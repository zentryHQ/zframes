import { useMoney } from "@zframes/core";
import { AssetLogo } from "./asset-logo";
import { changeColor, formatChangePct } from "./format";

/**
 * One asset row — logo · ticker · price · 24h change — shared by top-movers,
 * coin-movers and price-ticker so the same semantic element reads identically
 * everywhere (one label weight, one price/change treatment, one color source).
 * `price`/`changePct` may be undefined (price-ticker streams them in), rendering
 * quiet placeholders instead of a layout shift.
 *
 * `price` is a USD figure — the canonical unit every capability reports — and the
 * row converts it to the card's display currency itself, through `useMoney()`.
 *
 * That conversion is deliberately NOT a prop. It used to be an optional
 * `formatValue` defaulting to the USD `formatPrice`, and two of the three
 * consumers simply never passed it: on a baht board those cards quoted dollars
 * while every sibling converted, and no guard could see it — the `$` lived in
 * this file's default, not in theirs. An injectable formatter whose default is
 * wrong for most callers is a hole you can fall into by writing nothing, so the
 * row now owns the currency and there is nothing left to omit.
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
  /** Price in USD; rendered in the card's display currency. */
  price?: number;
  changePct?: number;
  logoSize?: number;
  /** Tailwind gap utility — price-ticker runs a touch roomier (`gap-3`). */
  gap?: string;
}) {
  const money = useMoney();
  const formatValue = money.price;
  return (
    <div
      className={`grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center ${gap}`}
      title={price !== undefined ? `${label} · ${formatValue(price)}` : label}
    >
      <AssetLogo symbol={symbol} size={logoSize} />
      <span className="body-sm truncate font-bold text-strong">{label}</span>
      <span className="caption text-soft text-right tabular-nums">
        {price !== undefined ? formatValue(price) : "—"}
      </span>
      <span
        className={`caption text-right font-bold tabular-nums${
          changePct === undefined ? " text-disabled" : ""
        }`}
        style={
          changePct !== undefined
            ? { color: changeColor(changePct) }
            : undefined
        }
      >
        {changePct !== undefined ? formatChangePct(changePct) : "…"}
      </span>
    </div>
  );
}
