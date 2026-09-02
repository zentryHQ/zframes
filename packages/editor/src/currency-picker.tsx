import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { currencySymbol, useEscapeLayer } from "@zframes/core";
import { CURRENCY_CODES, type CurrencyCode } from "@zframes/spec/spec";
import { useActiveRow } from "./editor-listbox";

/**
 * The searchable currency control, shared by the board-wide Cosmetics rail and
 * the per-card config dialog.
 *
 * `CURRENCY_CODES` carries 146 codes. A native `<select>` over that is a
 * 146-row scroll with nothing but ISO codes in it — you cannot find the baht
 * unless you already know it is spelled THB. So this matches on three things at
 * once: the code, the symbol, and the currency's English name, both from `Intl`
 * (no hand-kept table to drift). "baht", "THB", "฿" and "thai" all land on the
 * same row.
 */

/**
 * `Intl.DisplayNames` for currencies, built once. Constructing it can throw on
 * an environment without the currency display-names data, in which case names
 * are simply absent and search falls back to code + symbol.
 */
const currencyDisplayNames: Intl.DisplayNames | null = (() => {
  try {
    return new Intl.DisplayNames(["en"], {
      type: "currency",
      fallback: "none",
    });
  } catch {
    return null;
  }
})();

const nameCache = new Map<string, string>();

/**
 * English display name of a code — "Thai Baht", "US Dollar" — or `""` when Intl
 * has no name for it.
 *
 * `fallback: "none"` makes an unknown code return `undefined` rather than
 * echoing the code back, so a nameless row shows just its code instead of
 * "XPF · XPF". Wrapped because `of()` throws a RangeError on a malformed code,
 * and this list is data the spec may widen at any time.
 */
export function currencyName(code: string): string {
  const hit = nameCache.get(code);
  if (hit !== undefined) return hit;
  let name: string;
  try {
    name = currencyDisplayNames?.of(code) ?? "";
  } catch {
    name = "";
  }
  // Belt-and-braces against a runtime that ignores `fallback: "none"`.
  if (name === code) name = "";
  nameCache.set(code, name);
  return name;
}

export interface CurrencyOption {
  code: CurrencyCode;
  /** Prefix glyph, e.g. "฿" or "CHF " — from the same memo frames format with. */
  symbol: string;
  /** English name, or "" when Intl has none. */
  name: string;
}

/**
 * The codes offered first on an empty query.
 *
 * Codes are otherwise alphabetical, which would open the menu on AED — a
 * defensible sort and a useless first screen. These are the currencies a board
 * is actually denominated in: the ECB majors, plus THB (the one non-USD venue
 * the fleet quotes natively, via Bitkub). Everything else is one keystroke away.
 */
const MAJOR_CODES: readonly CurrencyCode[] = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "CHF",
  "AUD",
  "CAD",
  "INR",
  "THB",
];

let optionCache: CurrencyOption[] | null = null;

/**
 * Every code as a searchable row, built on first use and reused after.
 *
 * Lazy on purpose: each symbol costs an `Intl.NumberFormat` construction
 * (~75 µs, see core's `money.ts`), so eagerly resolving all 146 at module load
 * would put ~11 ms on the editor's mount for a menu most sessions never open.
 */
export function currencyOptions(): CurrencyOption[] {
  if (optionCache) return optionCache;
  optionCache = CURRENCY_CODES.map((code) => ({
    code,
    symbol: currencySymbol(code),
    name: currencyName(code),
  }));
  return optionCache;
}

/**
 * Rank a row against a lower-cased query. Lower sorts first.
 *
 * Ordering matters more here than in the frame palette, because Enter picks the
 * top row: typing "usd" must not land on "AUD" just because it also contains
 * the substring.
 */
function scoreCurrency(option: CurrencyOption, query: string): number {
  const code = option.code.toLowerCase();
  const name = option.name.toLowerCase();
  if (code === query) return 0;
  if (code.startsWith(query)) return 1;
  // A word-start hit in the name ("bah" → "Thai Baht") beats a mid-word one.
  if (name.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  if (option.symbol.toLowerCase().trim() === query) return 3;
  if (name.includes(query)) return 4;
  return 5;
}

/**
 * The rows a query should show, best match first. An empty query lists the
 * majors, then everything else alphabetically. Multi-word queries require every
 * token to match somewhere (same rule as the rail and palette searches).
 */
export function matchCurrencies(query: string): CurrencyOption[] {
  const options = currencyOptions();
  const q = query.trim().toLowerCase();
  if (!q) {
    const majors = MAJOR_CODES.map((code) =>
      options.find((o) => o.code === code)!,
    ).filter(Boolean);
    const rest = options.filter((o) => !MAJOR_CODES.includes(o.code));
    return [...majors, ...rest];
  }
  const terms = q.split(/\s+/);
  const hits = options.filter((option) => {
    const haystack =
      `${option.code} ${option.symbol} ${option.name}`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
  // Score on the first term only: it is the one the user is narrowing by, and
  // scoring a two-word query against each term would fight itself.
  return hits.sort(
    (a, b) =>
      scoreCurrency(a, terms[0]) - scoreCurrency(b, terms[0]) ||
      a.code.localeCompare(b.code),
  );
}

/** "฿ THB · Thai Baht" — the label a chosen currency reads as. */
export function currencyLabel(code: CurrencyCode): string {
  const name = currencyName(code);
  const symbol = currencySymbol(code).trim();
  const head = symbol && symbol !== code ? `${symbol} ${code}` : code;
  return name ? `${head} · ${name}` : head;
}

/**
 * A searchable currency picker: a trigger that reads as the current choice, and
 * a popover with a filter box over a listbox.
 *
 * Keyboard-complete, matching the modal dialog's idiom rather than inventing
 * one: opening moves focus into the filter, ↑/↓ move an active row
 * (`aria-activedescendant`, so focus stays where you are typing), Enter picks
 * it, and Escape closes and hands focus back to the trigger — the same
 * focus-returns-to-opener contract `FrameConfigDialog` implements.
 *
 * `inheritOf` turns the picker into a three-state control for a card: choosing
 * "Inherit board" reports `null`, which the caller writes as *no* `currency`
 * key. That is a different document from a card pinned to the board's current
 * code, and the only one that keeps following the board.
 */
export function CurrencyPicker({
  value,
  onChange,
  inheritOf,
  label,
  triggerId,
  disabled = false,
}: {
  /** The chosen code, or null when inheriting (only with `inheritOf`). */
  value: CurrencyCode | null;
  onChange: (code: CurrencyCode | null) => void;
  /** Board code to offer as an explicit "inherit" row. Omit for the board itself. */
  inheritOf?: CurrencyCode;
  /** Accessible name for the trigger and the filter box. */
  label: string;
  triggerId?: string;
  /**
   * Shown but inert — for a card whose frame ignores the display currency
   * (`usdOnly` frame meta). Disabled rather than hidden on purpose: a missing
   * control is indistinguishable from a missing feature, so the caller keeps the
   * row and explains it.
   */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const rows = useMemo(() => matchCurrencies(query), [query]);
  // The inherit row is a row like any other, so ↑/↓/Enter reach it too — it is
  // the default, and a default you can only click is not a default.
  const inheritRow = inheritOf !== undefined && !query.trim();
  const total = rows.length + (inheritRow ? 1 : 0);

  // ↑/↓ with wraparound, Home, End — the same model the symbol combobox in the
  // config dialog drives, so the two adjacent controls answer the same keys.
  const { active, setActive, onNavKeyDown } = useActiveRow(
    total,
    query,
    menuRef,
  );

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (returnFocus) triggerRef.current?.focus();
  };

  const pick = (code: CurrencyCode | null) => {
    onChange(code);
    close(true);
  };

  /** The row at an index, in rendered order (inherit first when shown). */
  const rowAt = (index: number): CurrencyCode | null | undefined => {
    if (inheritRow) return index === 0 ? null : rows[index - 1]?.code;
    return rows[index]?.code;
  };

  const rowId = (index: number) => `${baseId}-row-${index}`;

  // The open dropdown is its own Escape layer, so one press closes it and
  // nothing else: the rail's search box also clears on Escape and the config
  // dialog closes on it, and both sit BELOW this in the stack while it is open.
  // This replaces a `stopPropagation` in the key handler, which only worked
  // while the keystroke happened to be aimed at the filter box.
  useEscapeLayer(open && !disabled, () => close(true));

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (onNavKeyDown(event)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      const picked = rowAt(active);
      if (picked !== undefined) pick(picked);
    }
  };

  const triggerLabel =
    value === null
      ? `Inherit board${inheritOf ? ` (${inheritOf})` : ""}`
      : currencyLabel(value);

  return (
    <div
      className="zf-ccy"
      onBlur={(event) => {
        // Focus leaving the whole control closes it (a click elsewhere in the
        // rail), but moving between the filter and a row must not.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          close(false);
      }}
    >
      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        className="zf-ccy-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="zf-ccy-trigger-text">{triggerLabel}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>

      {open && !disabled && (
        <div className="zf-ccy-pop">
          <div className="zf-symbol-search">
            <Search size={13} aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              type="search"
              placeholder="Code, symbol or name…"
              aria-label={`${label} — search`}
              role="combobox"
              aria-expanded={true}
              aria-controls={`${baseId}-menu`}
              aria-activedescendant={total > 0 ? rowId(active) : undefined}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <div
            className="zf-ccy-menu"
            id={`${baseId}-menu`}
            role="listbox"
            aria-label={label}
            ref={menuRef}
          >
            {inheritRow && (
              <button
                type="button"
                tabIndex={-1}
                id={rowId(0)}
                data-active={active === 0}
                className={
                  value === null ? "zf-ccy-option is-selected" : "zf-ccy-option"
                }
                role="option"
                aria-selected={value === null}
                onMouseEnter={() => setActive(0)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(null)}
              >
                <span className="zf-ccy-code">↳</span>
                <span className="zf-ccy-name">Inherit board ({inheritOf})</span>
                {value === null && <Check size={13} aria-hidden="true" />}
              </button>
            )}
            {rows.map((option, i) => {
              const index = inheritRow ? i + 1 : i;
              const selected = value === option.code;
              return (
                <button
                  type="button"
                  key={option.code}
                  tabIndex={-1}
                  id={rowId(index)}
                  data-active={active === index}
                  className={
                    selected ? "zf-ccy-option is-selected" : "zf-ccy-option"
                  }
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(option.code)}
                >
                  <span className="zf-ccy-code">{option.code}</span>
                  <span className="zf-ccy-name">{option.name || "—"}</span>
                  <span className="zf-ccy-symbol">
                    {option.symbol.trim() || "—"}
                  </span>
                  {selected && <Check size={13} aria-hidden="true" />}
                </button>
              );
            })}
            {rows.length === 0 && (
              <div className="zf-symbol-menu-status">No currency matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
