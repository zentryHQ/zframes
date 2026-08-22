import { Search } from "lucide-react";
import { createContext, useContext } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
  ColorCosmeticKey,
  Cosmetics,
  CosmeticValues,
  NumericCosmeticKey,
} from "./editor-cosmetics";

/**
 * The rail's shared search box.
 *
 * There were two of these — one over the frame palette, one over the Cosmetics
 * settings — and they had drifted apart in four ways: icon size (13 vs 14),
 * input type (`search` vs `text`), what Escape did (`stopPropagation` vs
 * `preventDefault`), and whether a clear button existed at all (only the palette
 * had one). None of that was a decision; it was two copies aging separately.
 *
 * Escape calls `stopPropagation`, which is the half that does real work: a
 * document-level Escape listener (the frame config dialog's) would otherwise see
 * the keystroke that was meant for this box. `preventDefault` was the other
 * copy's guess and cancels nothing worth cancelling here — the input's own
 * Escape behaviour (revert to the default value) is moot when the handler is
 * already clearing the value itself. Escape only fires either when there is a
 * query to clear, so an empty box still lets Escape through to whatever owns it.
 */
export function RailSearch({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  /** Accessible name — also what a test queries the box by. */
  label: string;
}) {
  return (
    <div className="zf-palette-search">
      <Search size={14} className="zf-palette-search-icon" aria-hidden="true" />
      <input
        className="zf-palette-search-input"
        // `search`, not `text`: it is what gives the field `role="searchbox"`.
        // The native clear button WebKit adds for this type is suppressed in
        // `editor.css`, since the box renders its own.
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
          }
        }}
      />
      {value && (
        <button
          type="button"
          className="zf-palette-search-clear"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * One collapsible Cosmetics section. Mirrors the frame palette's category
 * accordion (same chevron, same aria-expanded header button) so the rail's two
 * tabs behave identically rather than each inventing a disclosure.
 */
export function RailSection({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={open ? "zf-theme is-open" : "zf-theme"}>
      <button
        type="button"
        className="zf-theme-header"
        aria-expanded={open}
        onClick={onToggle}
      >
        <svg
          className="zf-theme-chevron"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path
            d="M6 4l4 4-4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="zf-theme-header-label">{label}</span>
      </button>
      {open && <div className="zf-theme-body">{children}</div>}
    </section>
  );
}

/**
 * The live cosmetics every `Rail.*` control reads.
 *
 * A control is addressed by the cosmetic FIELD it edits and nothing else — it
 * pulls the value, the schema default, and the setter out of here. That is what
 * collapses the 22 hand-written `value !== SPEC_DEFAULTS.x.y` reset checks into
 * one, and it is why adding a knob is one line rather than a 25-line block that
 * can quietly compare against the wrong default.
 */
const CosmeticsContext = createContext<Cosmetics | null>(null);

export function CosmeticsProvider({
  cosmetics,
  children,
}: {
  cosmetics: Cosmetics;
  children: ReactNode;
}) {
  return (
    <CosmeticsContext.Provider value={cosmetics}>
      {children}
    </CosmeticsContext.Provider>
  );
}

export function useRailCosmetics(): Cosmetics {
  const cosmetics = useContext(CosmeticsContext);
  if (!cosmetics) {
    throw new Error("Rail controls must render inside <CosmeticsRail>");
  }
  return cosmetics;
}

/** How a slider renders its own value. */
type SliderFormat =
  /** `18px` — a pixel length. */
  | "px"
  /** `160°` — an angle. */
  | "deg"
  /** `0.85` → `85%` — a 0–1 ratio shown as a percentage. */
  | "ratio"
  /** `90` → `90%` — an already-percentage value. */
  | "percent"
  /** `1.5` → `1.5×` — a multiplier. */
  | "times"
  /** `12` — a bare count. */
  | "count";

function formatSliderValue(value: number, format: SliderFormat): string {
  switch (format) {
    case "px":
      return `${value}px`;
    case "deg":
      return `${value}°`;
    case "ratio":
      return `${Math.round(value * 100)}%`;
    case "percent":
      return `${value}%`;
    case "times":
      return `${value.toFixed(1)}×`;
    default:
      return `${value}`;
  }
}

/**
 * Round a fractional slider to its step's own precision.
 *
 * A range input reports floats like `0.30000000000000004`, which would land in
 * the saved `dashboard.json` verbatim. Every fractional slider used to carry its
 * own hand-written `Math.round(v * 100) / 100`, and the one on a 0.1 step used
 * `* 10` instead — so the precision was a property of the step all along.
 */
function roundToStep(value: number, step: number | undefined): number {
  if (!step || step >= 1) return value;
  const factor = step >= 0.1 ? 10 : 100;
  return Math.round(value * factor) / factor;
}

/**
 * A labelled slider: label, an optional Reset, the live readout, and the range.
 *
 * This block was retyped 16 times across the rail — ~420 lines whose only real
 * variation is four numbers and a unit.
 */
function RailSlider({
  field,
  label,
  ariaLabel,
  min,
  max,
  step,
  format = "count",
  flush,
}: {
  field: NumericCosmeticKey;
  label: string;
  /** Accessible name, when the visible label is too terse on its own
   *  ("Saturation" → "Accent saturation"). Defaults to `label`. */
  ariaLabel?: string;
  min: number;
  max: number;
  step?: number;
  format?: SliderFormat;
  /** Drop the 13px top gap — for the first control under a section header, or
   *  one that follows a block already carrying its own spacing. */
  flush?: boolean;
}) {
  const { values, set, isDefault } = useRailCosmetics();
  const value = values[field];
  return (
    <>
      <div
        className="zf-theme-row"
        style={flush ? undefined : { marginTop: 13 }}
      >
        <span className="zf-theme-val">{label}</span>
        <span className="zf-theme-knob-end">
          {!isDefault(field) && <RailReset field={field} />}
          <span className="zf-theme-val">
            {formatSliderValue(value, format)}
          </span>
        </span>
      </div>
      <input
        type="range"
        className="zf-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel ?? label}
        onChange={(e) => set(field, roundToStep(Number(e.target.value), step))}
      />
    </>
  );
}

/** The Reset link. One implementation, 22 call sites. */
function RailReset({ field }: { field: keyof CosmeticValues }) {
  const { reset } = useRailCosmetics();
  return (
    <button
      type="button"
      className="zf-theme-reset"
      onClick={() => reset(field)}
    >
      Reset
    </button>
  );
}

/**
 * A 0–360 hue slider with its own swatch — the accent hue and the card-surface
 * tint. Distinct from `Rail.Slider` because the readout is fused into the label
 * ("Hue 242°") and the track is the rainbow gradient, not a plain range.
 */
function RailHue({
  field,
  label,
  ariaLabel,
  swatchStyle,
}: {
  field: NumericCosmeticKey;
  label: string;
  ariaLabel: string;
  swatchStyle?: CSSProperties;
}) {
  const { values, set, isDefault } = useRailCosmetics();
  const value = values[field];
  return (
    <>
      <div className="zf-theme-row" style={{ margin: "10px 0 0" }}>
        <span className="zf-theme-val">
          <span className="zf-theme-swatch" style={swatchStyle} />
          {label} {value}°
        </span>
        {!isDefault(field) && <RailReset field={field} />}
      </div>
      <input
        type="range"
        className="zf-hue-slider"
        min={0}
        max={360}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => set(field, Number(e.target.value))}
      />
    </>
  );
}

/** A native colour swatch with the hex spelled out beside it. */
function RailColor({
  field,
  label,
  ariaLabel,
  rowStyle,
  resettable = true,
}: {
  field: ColorCosmeticKey | "bgGradFrom" | "bgGradTo";
  /** Prefix before the hex ("Up #16c784"); omit for the hex alone. */
  label?: string;
  ariaLabel: string;
  rowStyle?: CSSProperties;
  /** The custom gradient's two stops have no meaningful "default" to go back
   *  to — the schema pair only means anything together. */
  resettable?: boolean;
}) {
  const { values, set, isDefault } = useRailCosmetics();
  const value = values[field];
  return (
    <div className="zf-theme-row" style={rowStyle}>
      <label className="zf-theme-val">
        <input
          type="color"
          className="zf-color"
          value={value}
          aria-label={ariaLabel}
          onChange={(e) => set(field, e.target.value)}
        />
        {label ? `${label} ${value}` : value}
      </label>
      {resettable && !isDefault(field) && <RailReset field={field} />}
    </div>
  );
}

/** One option in a segmented control. */
export type RailSegmentOption<T> = {
  value: T;
  label: ReactNode;
  /** Per-button style, for a control that previews what it selects (the font
   *  family buttons render their own face). */
  style?: CSSProperties;
};

/** A segmented control over one enum-valued cosmetic. */
function RailSegment<K extends keyof CosmeticValues>({
  field,
  ariaLabel,
  options,
  className = "zf-seg",
  buttonClassName = "zf-seg-btn",
  style,
  onSelect,
}: {
  field: K;
  ariaLabel: string;
  options: readonly RailSegmentOption<CosmeticValues[K]>[];
  className?: string;
  buttonClassName?: string;
  style?: CSSProperties;
  /** Route the pick somewhere other than a plain `set` — the layout direction
   *  has to tear the GridStack down and rebuild it, not just record a value. */
  onSelect?: (value: CosmeticValues[K]) => void;
}) {
  const { values, set } = useRailCosmetics();
  return (
    <div
      className={className}
      role="group"
      aria-label={ariaLabel}
      style={style}
    >
      {options.map((option) => {
        const active = values[field] === option.value;
        return (
          <button
            key={String(option.value)}
            type="button"
            className={
              active ? `${buttonClassName} is-active` : buttonClassName
            }
            aria-pressed={active}
            style={option.style}
            onClick={() =>
              onSelect ? onSelect(option.value) : set(field, option.value)
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A bare label row, for a control whose own widget carries no label. */
function RailLabel({
  children,
  rowStyle,
}: {
  children: ReactNode;
  /**
   * Per-row spacing, same escape hatch the other controls take. A label that
   * opens a new group inside a section needs the ~13px of air the hand-written
   * rows had; one that follows its own control does not, so this stays opt-in
   * rather than becoming a default the caller has to cancel.
   */
  rowStyle?: CSSProperties;
}) {
  return (
    <div className="zf-theme-row" style={rowStyle}>
      <span className="zf-theme-val">{children}</span>
    </div>
  );
}

/**
 * The rail's control vocabulary. Every member reads the one cosmetics context,
 * so a control is declared by naming the field it edits.
 */
export const Rail = {
  Slider: RailSlider,
  Hue: RailHue,
  Color: RailColor,
  Segment: RailSegment,
  Label: RailLabel,
  Reset: RailReset,
};
