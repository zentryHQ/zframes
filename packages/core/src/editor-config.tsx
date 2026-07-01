import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import type { FrameInstance } from "./spec";
import type { FrameRegistry } from "./frame";
import {
  assetLogoUrl,
  configFields,
  detectSymbolControl,
  formatBriefChange,
  formatBriefPrice,
  humanizeKey,
  isObject,
  isStringArray,
  isType,
  normaliseSymbolInput,
  optionFor,
  symbolKind,
  symbolsFromConfig,
  tickerOf,
  type ConfigFieldSchema,
  type SymbolControl,
  type SymbolOption,
  type SymbolUniverse,
} from "./editor-symbols";

/**
 * The per-frame settings dialog — a modal that edits ONE frame. Each grid item
 * carries its own gear button (see decorateItem); clicking it opens this over a
 * dimmed backdrop. It renders a generated form control for every config field
 * (plus the richer ticker picker for symbol fields), validated live against the
 * frame's own schema: a valid draft is pushed to the shared instance and
 * re-renders that frame; an invalid one surfaces an error and stays local, so
 * inputs never snap back mid-edit. A card-title field sits above the config
 * controls; it edits the instance `title` directly (not `config`) and clears
 * to the frame's default when blank.
 *
 * Portaled to <body> (outside .zf-editor), so it re-establishes --zf-accent-hue
 * / --zf-accent from the live hue and is keyed by frame id by the caller, which
 * resets the draft per frame.
 */
export function FrameConfigDialog({
  instance,
  registry,
  instancesRef,
  symbolUniverse,
  accentHue,
  onApply,
  onClose,
}: {
  instance: FrameInstance;
  registry: FrameRegistry;
  instancesRef: RefObject<Map<string, FrameInstance>>;
  symbolUniverse: SymbolUniverse;
  accentHue: number;
  onApply: (id: string) => void;
  onClose: () => void;
}) {
  const def = registry.get(instance.frame);
  const symbolControl = useMemo(
    () => (def ? detectSymbolControl(def) : null),
    [def],
  );
  const fields = useMemo(() => (def ? configFields(def) : []), [def]);

  // The working draft backing every control — the source of truth for what's
  // shown, so an in-progress edit never snaps back. Valid drafts are pushed to
  // the shared instance and re-render the frame; invalid ones surface an error
  // and stay local. The keyed remount (key={frame id}) resets it per frame.
  const [config, setConfig] = useState<Record<string, unknown>>(() => ({
    ...(instance.config ?? {}),
  }));
  const [error, setError] = useState<string | null>(null);
  // The card title lives on the instance, not in `config`, so it gets its own
  // draft + commit path parallel to the config one below. Blank clears it, so
  // the frame's default (its `label`, or a `titleContent` live title) rides.
  const [title, setTitle] = useState<string>(instance.title ?? "");
  const instanceId = instance.id;

  const commit = useCallback(
    (next: Record<string, unknown>) => {
      setConfig(next);
      if (def) {
        const result = def.schema.safeParse(next);
        if (!result.success) {
          setError(
            result.error.issues
              .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
              .join("\n"),
          );
          return;
        }
      }
      setError(null);
      const current = instancesRef.current.get(instanceId);
      if (!current) return;
      instancesRef.current.set(instanceId, { ...current, config: next });
      onApply(instanceId);
    },
    [def, instanceId, instancesRef, onApply],
  );

  const commitTitle = useCallback(
    (next: string) => {
      setTitle(next);
      const current = instancesRef.current.get(instanceId);
      if (!current) return;
      const trimmed = next.trim();
      instancesRef.current.set(instanceId, {
        ...current,
        title: trimmed === "" ? undefined : trimmed,
      });
      onApply(instanceId);
    },
    [instanceId, instancesRef, onApply],
  );

  // Esc closes the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setField = (key: string, value: unknown) =>
    commit({ ...config, [key]: value });
  const frameLabel = def?.label ?? instance.frame.replace(/-/g, " ");

  return (
    <div
      className="zf-dialog-backdrop"
      style={{ ["--zf-accent-hue" as string]: accentHue }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="zf-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Configure ${frameLabel}`}
      >
        <header className="zf-dialog-head">
          <h3 className="zf-dialog-title">Configure · {frameLabel}</h3>
          <button
            type="button"
            className="zf-dialog-close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="zf-dialog-body">
          {def?.chrome !== "bare" && (
            <div className="zf-field">
              <label
                htmlFor="zf-instance-title"
                title="Card title shown in the frame's chrome."
              >
                Title
              </label>
              <input
                id="zf-instance-title"
                className="zf-input"
                value={title}
                placeholder={def?.titleContent ? "Auto (live)" : frameLabel}
                spellCheck={false}
                onChange={(e) => commitTitle(e.target.value)}
              />
              <p className="zf-field-hint">
                Leave blank to use the frame&rsquo;s default.
              </p>
            </div>
          )}
          {symbolControl && (
            <TickerConfigEditor
              control={symbolControl}
              config={config}
              loading={symbolUniverse.loading}
              options={symbolUniverse.options}
              onChangeSymbol={(symbol) => commit({ ...config, symbol })}
              onChangeSymbols={(symbols) => commit({ ...config, symbols })}
              onChangeHoldings={(holdings) => commit({ ...config, holdings })}
            />
          )}
          {fields.map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              value={config[field.key]}
              onChange={(value) => setField(field.key, value)}
            />
          ))}
          {!symbolControl && fields.length === 0 && (
            <p className="zf-rail-empty">This frame has no settings.</p>
          )}
          {error && <div className="zf-config-error">{error}</div>}
        </div>
        <footer className="zf-dialog-foot">
          <button
            type="button"
            className="zf-btn zf-btn--primary"
            onClick={onClose}
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Dispatches a single config field to the right control by its JSON-Schema
 *  shape: checkbox (boolean), dropdown (enum), slider/number (number), tag list
 *  (string[]), color picker (hex string), or text/textarea (string). */
function ConfigField({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { key, label, shape } = field;
  const id = `zf-cfg-${key}`;
  const tip = shape.description;

  if (isType(shape, "boolean")) {
    const checked = typeof value === "boolean" ? value : Boolean(shape.default);
    return (
      <label className="zf-checkbox" title={tip}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </label>
    );
  }

  const enumValues =
    Array.isArray(shape.enum) && shape.enum.every((v) => typeof v === "string")
      ? (shape.enum as string[])
      : null;
  if (enumValues && enumValues.length > 0) {
    const fallback =
      typeof shape.default === "string" ? shape.default : enumValues[0];
    const current =
      typeof value === "string" && enumValues.includes(value)
        ? value
        : fallback;
    return (
      <div className="zf-field">
        <label htmlFor={id} title={tip}>
          {label}
        </label>
        <select
          id={id}
          className="zf-select"
          value={current}
          onChange={(e) => onChange(e.target.value)}
        >
          {enumValues.map((option) => (
            <option key={option} value={option}>
              {humanizeKey(option)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (isType(shape, "integer") || isType(shape, "number")) {
    return (
      <NumberField id={id} field={field} value={value} onChange={onChange} />
    );
  }

  if (isStringArray(shape)) {
    return (
      <StringListField
        id={id}
        field={field}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <StringField id={id} field={field} value={value} onChange={onChange} />
  );
}

function NumberField({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: ConfigFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { label, shape } = field;
  const tip = shape.description;
  const min = typeof shape.minimum === "number" ? shape.minimum : undefined;
  const max = typeof shape.maximum === "number" ? shape.maximum : undefined;
  const isInt = isType(shape, "integer");
  const step = isInt ? 1 : "any";
  const fallback =
    typeof shape.default === "number" ? shape.default : (min ?? 0);
  const numeric =
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

  // A fully-bounded range gets a slider + live value badge, mirroring the accent
  // hue control above it. Anything open-ended falls back to a number input.
  if (min !== undefined && max !== undefined) {
    const current = numeric ?? fallback;
    return (
      <div className="zf-field">
        <div className="zf-field-row">
          <label htmlFor={id} title={tip}>
            {label}
          </label>
          <span className="zf-field-num">{current}</span>
        </div>
        <input
          id={id}
          type="range"
          className="zf-range"
          min={min}
          max={max}
          step={step}
          value={current}
          onChange={(e) =>
            onChange(
              isInt
                ? Math.round(Number(e.target.value))
                : Number(e.target.value),
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="zf-field">
      <label htmlFor={id} title={tip}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        className="zf-input"
        min={min}
        max={max}
        step={step}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) =>
          onChange(e.target.value === "" ? "" : Number(e.target.value))
        }
      />
    </div>
  );
}

function StringField({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: ConfigFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { key, label, shape } = field;
  const tip = shape.description;
  const str = typeof value === "string" ? value : "";
  const placeholder = typeof shape.default === "string" ? shape.default : "";
  const colorDefault =
    typeof shape.default === "string" && /^#[0-9a-f]{6}$/i.test(shape.default)
      ? shape.default
      : null;

  if (key === "color" || colorDefault) {
    const swatch = /^#[0-9a-f]{6}$/i.test(str)
      ? str
      : (colorDefault ?? "#8b8df9");
    return (
      <div className="zf-field">
        <label htmlFor={id} title={tip}>
          {label}
        </label>
        <div className="zf-color-row">
          <input
            type="color"
            className="zf-color"
            value={swatch}
            aria-label={`${label} swatch`}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            id={id}
            className="zf-input"
            value={str}
            placeholder={placeholder}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (key === "text") {
    return (
      <div className="zf-field">
        <label htmlFor={id} title={tip}>
          {label}
        </label>
        <textarea
          id={id}
          className="zf-textarea zf-textarea--prose"
          value={str}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="zf-field">
      <label htmlFor={id} title={tip}>
        {label}
      </label>
      <input
        id={id}
        className="zf-input"
        value={str}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function StringListField({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: ConfigFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { label, shape } = field;
  const tip = shape.description;
  const items = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
  const [draft, setDraft] = useState("");
  const maxItems =
    typeof shape.maxItems === "number" ? shape.maxItems : undefined;
  const maxReached = maxItems !== undefined && items.length >= maxItems;

  const add = (raw: string) => {
    const token = raw.trim().toUpperCase();
    setDraft("");
    if (!token || items.includes(token) || maxReached) return;
    onChange([...items, token]);
  };

  return (
    <div className="zf-field">
      <label htmlFor={id} title={tip}>
        {label}
      </label>
      {items.length > 0 && (
        <div className="zf-taglist">
          {items.map((item) => (
            <span className="zf-tag" key={item}>
              {item}
              <button
                type="button"
                className="zf-symbol-remove"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((v) => v !== item))}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        className="zf-input"
        value={draft}
        disabled={maxReached}
        spellCheck={false}
        placeholder={
          maxReached ? "Maximum reached" : "Type a code, Enter to add"
        }
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => add(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (
            e.key === "Backspace" &&
            draft === "" &&
            items.length > 0
          ) {
            onChange(items.slice(0, -1));
          }
        }}
      />
    </div>
  );
}

function TickerConfigEditor({
  control,
  config,
  loading,
  options,
  onChangeSymbol,
  onChangeSymbols,
  onChangeHoldings,
}: {
  control: SymbolControl;
  config: Record<string, unknown>;
  loading: boolean;
  options: SymbolOption[];
  onChangeSymbol: (symbol: string) => void;
  onChangeSymbols: (symbols: string[]) => void;
  onChangeHoldings: (holdings: Record<string, unknown>[]) => void;
}) {
  const selected = symbolsFromConfig(control, config);

  if (control.kind === "single") {
    const symbol = selected[0] ?? "";
    return (
      <div className="zf-symbol-editor">
        <SymbolEditorHeader
          title="Ticker"
          detail={symbol ? tickerOf(symbol) : "None"}
          loading={loading}
        />
        {symbol ? (
          <SelectedTicker
            symbol={symbol}
            option={optionForSelected(symbol, options)}
          />
        ) : null}
        <SymbolCombobox
          loading={loading}
          options={options}
          selectedSymbols={symbol ? [symbol] : []}
          placeholder="Search TSLA, BTC..."
          onSelect={onChangeSymbol}
        />
      </div>
    );
  }

  if (control.kind === "symbols") {
    const maxReached =
      typeof control.maxItems === "number" &&
      selected.length >= control.maxItems;
    return (
      <div className="zf-symbol-editor">
        <SymbolEditorHeader
          title="Tickers"
          detail={tickerCountLabel(selected.length, control)}
          loading={loading}
        />
        <TickerChipList
          symbols={selected}
          options={options}
          onRemove={(symbol) =>
            onChangeSymbols(selected.filter((value) => value !== symbol))
          }
        />
        <SymbolCombobox
          disabled={maxReached}
          loading={loading}
          options={options}
          selectedSymbols={selected}
          placeholder={maxReached ? "Maximum tickers added" : "Add ticker"}
          keepOpenOnSelect
          onSelect={(symbol) => {
            if (selected.includes(symbol) || maxReached) return;
            onChangeSymbols([...selected, symbol]);
          }}
        />
      </div>
    );
  }

  const holdings = Array.isArray(config.holdings)
    ? config.holdings.filter(isObject)
    : [];
  const maxReached =
    typeof control.maxItems === "number" && holdings.length >= control.maxItems;

  return (
    <div className="zf-symbol-editor">
      <SymbolEditorHeader
        title="Holding tickers"
        detail={tickerCountLabel(holdings.length, control)}
        loading={loading}
      />
      <div className="zf-holding-list">
        {holdings.map((holding, index) => {
          const symbol =
            typeof holding.symbol === "string" ? holding.symbol : "";
          return (
            <div className="zf-holding-row" key={`${symbol}-${index}`}>
              <div className="zf-holding-main">
                {symbol ? (
                  <SelectedTicker
                    symbol={symbol}
                    option={optionForSelected(symbol, options)}
                    compact
                  />
                ) : (
                  <span className="zf-symbol-empty">No ticker</span>
                )}
                {typeof holding.amount === "number" && (
                  <span className="zf-holding-amount">x {holding.amount}</span>
                )}
              </div>
              <button
                type="button"
                className="zf-symbol-remove"
                aria-label={`Remove ${symbol || "holding"}`}
                onClick={() => {
                  onChangeHoldings(holdings.filter((_, i) => i !== index));
                }}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      <SymbolCombobox
        disabled={maxReached}
        loading={loading}
        options={options}
        selectedSymbols={selected}
        placeholder={maxReached ? "Maximum holdings added" : "Add holding"}
        keepOpenOnSelect
        onSelect={(symbol) => {
          if (maxReached) return;
          onChangeHoldings([...holdings, { symbol, amount: 1 }]);
        }}
      />
    </div>
  );
}

function SymbolEditorHeader({
  title,
  detail,
  loading,
}: {
  title: string;
  detail: string;
  loading: boolean;
}) {
  return (
    <div className="zf-symbol-head">
      <div>
        <div className="zf-symbol-label">{title}</div>
        <div className="zf-symbol-detail">{detail}</div>
      </div>
      <span
        className={loading ? "zf-symbol-source is-loading" : "zf-symbol-source"}
      >
        {loading ? "Loading" : "Live list"}
      </span>
    </div>
  );
}

function tickerCountLabel(count: number, control: SymbolControl): string {
  if (typeof control.maxItems === "number")
    return `${count}/${control.maxItems}`;
  if (typeof control.minItems === "number" && count < control.minItems)
    return `${count}/${control.minItems}+`;
  return String(count);
}

function optionForSelected(
  symbol: string,
  options: SymbolOption[],
): SymbolOption {
  return (
    options.find((option) => option.symbol === symbol) ?? optionFor(symbol)
  );
}

function TickerChipList({
  symbols,
  options,
  onRemove,
}: {
  symbols: string[];
  options: SymbolOption[];
  onRemove: (symbol: string) => void;
}) {
  if (symbols.length === 0)
    return <div className="zf-symbol-empty">No tickers selected</div>;

  return (
    <div className="zf-symbol-chips">
      {symbols.map((symbol) => (
        <span className="zf-symbol-chip" key={symbol}>
          <SelectedTicker
            symbol={symbol}
            option={optionForSelected(symbol, options)}
            compact
          />
          <button
            type="button"
            className="zf-symbol-remove"
            aria-label={`Remove ${symbol}`}
            onClick={() => onRemove(symbol)}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}

function SelectedTicker({
  symbol,
  option,
  compact = false,
}: {
  symbol: string;
  option: SymbolOption;
  compact?: boolean;
}) {
  return (
    <span
      className={
        compact ? "zf-selected-symbol is-compact" : "zf-selected-symbol"
      }
    >
      <SymbolAvatar symbol={symbol} />
      <span className="zf-selected-symbol-text">
        <strong>{tickerOf(symbol)}</strong>
        {!compact && <em>{symbol}</em>}
      </span>
      {!compact && option.markPx !== undefined && (
        <span className="zf-selected-symbol-price">
          {formatBriefPrice(option.markPx)}
        </span>
      )}
    </span>
  );
}

function SymbolCombobox({
  disabled = false,
  loading,
  options,
  selectedSymbols,
  placeholder,
  keepOpenOnSelect = false,
  onSelect,
}: {
  disabled?: boolean;
  loading: boolean;
  options: SymbolOption[];
  selectedSymbols: string[];
  placeholder: string;
  keepOpenOnSelect?: boolean;
  onSelect: (symbol: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(selectedSymbols), [selectedSymbols]);
  const known = useMemo(
    () => new Set(options.map((option) => option.symbol)),
    [options],
  );
  const normalized = normaliseSymbolInput(query);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? options.filter(
          (option) =>
            option.ticker.toLowerCase().includes(q) ||
            option.symbol.toLowerCase().includes(q),
        )
      : options.slice(0, 28);
    return filtered
      .slice()
      .sort((a, b) => scoreOption(a, q) - scoreOption(b, q))
      .slice(0, 36);
  }, [options, query]);

  const custom = useMemo(() => {
    if (!normalized) return [];
    const candidates = normalized.includes(":")
      ? [normalized]
      : [`xyz:${normalized}`, normalized];
    return candidates.filter(
      (symbol, index) =>
        candidates.indexOf(symbol) === index &&
        !known.has(symbol) &&
        !selected.has(symbol),
    );
  }, [known, normalized, selected]);

  const commit = (symbol: string) => {
    if (!symbol || (keepOpenOnSelect && selected.has(symbol))) return;
    onSelect(symbol);
    setQuery("");
    setOpen(keepOpenOnSelect);
  };

  return (
    <div
      className="zf-symbol-combo"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <div
        className={
          disabled ? "zf-symbol-search is-disabled" : "zf-symbol-search"
        }
      >
        <Search size={14} aria-hidden="true" />
        <input
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={open}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(visible[0]?.symbol ?? custom[0] ?? normalized);
            }
          }}
        />
        <ChevronDown size={14} aria-hidden="true" />
      </div>

      {open && !disabled && (
        <div className="zf-symbol-menu" role="listbox">
          {loading && (
            <div className="zf-symbol-menu-status">
              Loading live universe...
            </div>
          )}
          {visible.map((option) => {
            const isSelected = selected.has(option.symbol);
            return (
              <button
                type="button"
                key={option.symbol}
                className={
                  isSelected
                    ? "zf-symbol-option is-selected"
                    : "zf-symbol-option"
                }
                disabled={keepOpenOnSelect && isSelected}
                role="option"
                aria-selected={isSelected}
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(option.symbol);
                }}
                onClick={(event) => {
                  if (event.detail === 0) commit(option.symbol);
                }}
              >
                <SymbolAvatar symbol={option.symbol} />
                <span className="zf-symbol-option-main">
                  <strong>{option.ticker}</strong>
                  <em>{option.symbol}</em>
                </span>
                <span className="zf-symbol-option-meta">
                  <span>{formatBriefPrice(option.markPx) || option.kind}</span>
                  {option.changePct !== undefined && (
                    <span
                      className={
                        option.changePct >= 0
                          ? "zf-symbol-change is-up"
                          : "zf-symbol-change is-down"
                      }
                    >
                      {formatBriefChange(option.changePct)}
                    </span>
                  )}
                </span>
                {isSelected && <Check size={14} aria-hidden="true" />}
              </button>
            );
          })}
          {custom.map((symbol) => (
            <button
              type="button"
              key={symbol}
              className="zf-symbol-option zf-symbol-option--custom"
              onMouseDown={(event) => {
                event.preventDefault();
                commit(symbol);
              }}
              onClick={(event) => {
                if (event.detail === 0) commit(symbol);
              }}
            >
              <span className="zf-symbol-custom-icon">
                <Plus size={13} aria-hidden="true" />
              </span>
              <span className="zf-symbol-option-main">
                <strong>{tickerOf(symbol)}</strong>
                <em>{symbol}</em>
              </span>
              <span className="zf-symbol-option-meta">
                <span>{symbolKind(symbol)}</span>
              </span>
            </button>
          ))}
          {!loading && visible.length === 0 && custom.length === 0 && (
            <div className="zf-symbol-menu-status">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}

function scoreOption(option: SymbolOption, query: string): number {
  if (!query) return option.rank;
  const ticker = option.ticker.toLowerCase();
  const symbol = option.symbol.toLowerCase();
  if (ticker === query || symbol === query) return -40 + option.rank / 10_000;
  if (ticker.startsWith(query)) return -20 + option.rank / 10_000;
  if (symbol.startsWith(query)) return -10 + option.rank / 10_000;
  return option.rank;
}

function SymbolAvatar({ symbol }: { symbol: string }) {
  const kind = symbolKind(symbol).toLowerCase();
  // Show the real asset logo; fall back to the two-letter monogram chip when the
  // CDN 404s (indices, pre-IPO names, long-tail coins). A fresh symbol gets a
  // new shot at its logo since avatars are reused as watchlists change.
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [symbol]);

  if (failed) {
    return (
      <span className={`zf-symbol-avatar zf-symbol-avatar--${kind}`}>
        {tickerOf(symbol).slice(0, 2)}
      </span>
    );
  }
  return (
    <img
      className={`zf-symbol-avatar zf-symbol-avatar--logo zf-symbol-avatar--${kind}`}
      src={assetLogoUrl(symbol)}
      alt=""
      aria-hidden="true"
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
