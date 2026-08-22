import { createContext, useCallback, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { CurrencyPicker } from "./currency-picker";
import {
  Rail,
  RailSearch,
  RailSection,
  CosmeticsProvider,
  useRailCosmetics,
} from "./editor-rail";
import type { Cosmetics, LiveCosmetics } from "./editor-cosmetics";
import { BACKGROUND_SCENES, THEME_PRESETS } from "@zframes/spec/presets";
import {
  FONT_FAMILY_STACKS,
  NUMERIC_VARIANTS,
  type DashboardSpec,
} from "@zframes/spec/spec";

/**
 * The Cosmetics rail's sections, with the words that should find each one.
 *
 * The rail was nine non-collapsible sections — roughly 35 controls stacked in a
 * single 320px scroll column — so reaching "elevation" meant scrolling past every
 * background control. Sections now collapse, and searching matches these keywords
 * so a term auto-opens the section holding it. Keywords are the vocabulary a user
 * would actually type, not just the visible labels: "shadow" finds Appearance,
 * "font" finds Typography, "green" finds Gain / Loss.
 */
export const COSMETIC_SECTIONS = [
  { key: "presets", label: "Presets", words: "preset look theme style named" },
  { key: "mode", label: "Mode", words: "mode dark light daylight surface" },
  {
    key: "accent",
    label: "Accent",
    words: "accent hue saturation colour color",
  },
  { key: "surface", label: "Surface", words: "surface tint base hue card" },
  {
    key: "updown",
    label: "Gain / Loss",
    words: "gain loss up down green red profit semantic colourblind",
  },
  {
    key: "background",
    label: "Background",
    words:
      "background backdrop scene gradient image colour color opacity blur overlay unicorn",
  },
  {
    key: "layout",
    label: "Layout",
    words:
      "layout direction vertical horizontal gap padding columns rows grid geometry cell height",
  },
  {
    key: "appearance",
    label: "Appearance",
    words:
      "appearance radius corner border opacity density elevation shadow card",
  },
  {
    key: "typography",
    label: "Typography",
    words:
      "typography font family sans mono serif numbers tabular text size scale",
  },
  {
    key: "currency",
    label: "Currency",
    words:
      "currency money price fx code exchange rate convert denominate dollar usd euro eur pound gbp yen jpy baht thb franc rupee peso",
  },
] as const;

export type CosmeticSectionKey = (typeof COSMETIC_SECTIONS)[number]["key"];

/** Which cosmetic sections a query matches, or null when not searching. */
export function matchCosmeticSections(query: string): Set<string> | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const terms = q.split(/\s+/);
  return new Set(
    COSMETIC_SECTIONS.filter((s) => {
      const haystack = `${s.label} ${s.words}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    }).map((s) => s.key),
  );
}

/** Per-section disclosure, resolved once for the whole rail. */
type SectionState = {
  open: (key: string) => boolean;
  visible: (key: string) => boolean;
  toggle: (key: string) => void;
};

const SectionContext = createContext<SectionState | null>(null);

/**
 * One section of the rail, addressed by its key in `COSMETIC_SECTIONS` — so its
 * header label and the words that find it can never drift apart, and a typo is
 * a type error rather than a section nothing can search for.
 */
function CosmeticsSection({
  id,
  children,
}: {
  id: CosmeticSectionKey;
  children: ReactNode;
}) {
  const sections = useContext(SectionContext);
  if (!sections) {
    throw new Error("CosmeticsRail.Section must render inside <CosmeticsRail>");
  }
  if (!sections.visible(id)) return null;
  const label = COSMETIC_SECTIONS.find((s) => s.key === id)?.label ?? id;
  return (
    <RailSection
      label={label}
      open={sections.open(id)}
      onToggle={() => sections.toggle(id)}
    >
      {children}
    </RailSection>
  );
}

/** Named one-click looks. Pure data out of `@zframes/spec/presets`. */
function PresetChips() {
  const { applyPreset, activePresetKey } = useRailCosmetics();
  return (
    <div className="zf-presets">
      {THEME_PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          className={
            activePresetKey === p.key ? "zf-preset is-active" : "zf-preset"
          }
          title={p.description}
          aria-pressed={activePresetKey === p.key}
          onClick={() => applyPreset(p)}
        >
          <span
            className="zf-preset-swatch"
            style={{
              background: `linear-gradient(135deg, hsl(${p.theme.baseHue} ${p.theme.baseSat}% 16%) 0 52%, hsl(${p.theme.accentHue} ${p.theme.accentSat}% 62%) 52% 100%)`,
            }}
          />
          <span className="zf-preset-label">{p.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The curated Unicorn Studio backdrops, as swatch chips. */
function ScenePicker() {
  const { values, set } = useRailCosmetics();
  return (
    <div
      className="zf-presets"
      style={{ marginTop: 12 }}
      role="group"
      aria-label="Background scene"
    >
      {BACKGROUND_SCENES.map((s) => (
        <button
          key={s.key}
          type="button"
          className={
            values.bgProjectId === s.projectId
              ? "zf-preset is-active"
              : "zf-preset"
          }
          title={s.description}
          aria-pressed={values.bgProjectId === s.projectId}
          onClick={() => set("bgProjectId", s.projectId)}
        >
          <span className="zf-preset-swatch" style={{ background: s.swatch }} />
          <span className="zf-preset-label">{s.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The background-image URL field. The only free-text cosmetic. */
function ImageUrlField() {
  const { values, set } = useRailCosmetics();
  return (
    <div className="zf-field" style={{ marginTop: 12 }}>
      <label htmlFor="zf-bg-image-url">Image URL</label>
      <input
        id="zf-bg-image-url"
        className="zf-input"
        type="url"
        value={values.bgImageUrl}
        placeholder="https://… or /hero.png"
        spellCheck={false}
        autoComplete="off"
        aria-label="Background image URL"
        onChange={(e) => set("bgImageUrl", e.target.value)}
      />
      <p className="zf-field-hint">
        Full-bleed behind the dashboard, with a dark scrim for legibility.
      </p>
    </div>
  );
}

/** Board display currency — 146 codes, so a searchable picker, not a select. */
function CurrencySection() {
  const { values, set, reset, isDefault } = useRailCosmetics();
  return (
    <>
      <p className="zf-field-hint">
        Every money figure is converted from USD at the live ECB rate.
        Percentages and counts are unaffected, and US-macro series (Treasury
        yields, CPI, the national debt) stay in USD — a converted national debt
        is a figure nobody quotes.
      </p>
      <div className="zf-theme-row" style={{ margin: "10px 0 6px" }}>
        <span className="zf-theme-val">Board currency</span>
        {!isDefault("currencyCode") && <Rail.Reset field="currencyCode" />}
      </div>
      {/* 146 codes: a native select over that can only be used by someone who
          already knows the ISO code, so this searches code + symbol + name. */}
      <CurrencyPicker
        value={values.currencyCode}
        label="Display currency"
        onChange={(code) =>
          code == null
            ? reset("currencyCode")
            : set("currencyCode", code as DashboardSpec["currency"]["code"])
        }
      />
    </>
  );
}

/**
 * The dashboard-wide Cosmetics rail: ten collapsible sections over ~35
 * controls, searchable.
 *
 * Every control reads the one `Cosmetics` object through context and names only
 * the field it edits — so the rail is a *declaration* of which knobs exist,
 * where it used to be 1113 lines of hand-copied markup in which the same slider
 * block appeared 16 times and the same `!== SPEC_DEFAULTS.x.y` reset check 22
 * times. Nothing about a wrong default failed loudly there: the slider moved,
 * the board looked right, and "Reset" either never appeared or restored a value
 * the schema never chose.
 */
export function CosmeticsRail({
  cosmetics,
  query,
  onQuery,
  openSections,
  onToggleSection,
  onModeChange,
}: {
  cosmetics: Cosmetics;
  query: string;
  onQuery: (next: string) => void;
  /** Which sections the user has expanded. Owned by the editor so it survives a
   *  trip to the Frames tab and back. */
  openSections: Set<string>;
  onToggleSection: (key: string) => void;
  /** The layout direction can't be a plain `set`: the two modes are separate
   *  GridStack configs, so crossing between them means a rebuild. */
  onModeChange: (mode: LiveCosmetics["grid"]["mode"]) => void;
}) {
  const matches = useMemo(() => matchCosmeticSections(query), [query]);
  // While searching, a matching section is forced open — the point of the query
  // is to reveal the control, not to reveal a header you then have to click.
  const open = useCallback(
    (key: string) => (matches ? matches.has(key) : openSections.has(key)),
    [matches, openSections],
  );
  /** Hide a section entirely when a search excludes it. */
  const visible = useCallback(
    (key: string) => !matches || matches.has(key),
    [matches],
  );
  const sections = useMemo<SectionState>(
    () => ({ open, visible, toggle: onToggleSection }),
    [open, visible, onToggleSection],
  );

  const { values } = cosmetics;
  const isHorizontal = values.mode === "flow-horizontal";

  return (
    <CosmeticsProvider cosmetics={cosmetics}>
      <SectionContext.Provider value={sections}>
        {/* Same affordance the frame palette already offers. With ~35 controls
            behind ten headers, a header list alone still means knowing which
            family owns "elevation". */}
        <RailSearch
          value={query}
          onChange={onQuery}
          placeholder="Search settings…"
          label="Search settings"
        />
        {matches?.size === 0 && (
          <p className="zf-palette-empty">
            No settings match &ldquo;{query.trim()}&rdquo;.
          </p>
        )}

        <CosmeticsSection id="presets">
          <PresetChips />
        </CosmeticsSection>

        <CosmeticsSection id="mode">
          <Rail.Segment
            field="surface"
            ariaLabel="Surface mode"
            style={{ marginTop: 10 }}
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
          />
        </CosmeticsSection>

        <CosmeticsSection id="accent">
          <Rail.Hue field="accentHue" label="Hue" ariaLabel="Accent hue" />
          <Rail.Slider
            field="accentSat"
            label="Saturation"
            ariaLabel="Accent saturation"
            min={0}
            max={100}
            format="percent"
          />
        </CosmeticsSection>

        <CosmeticsSection id="surface">
          <Rail.Hue
            field="baseHue"
            label="Tint"
            ariaLabel="Surface tint hue"
            swatchStyle={{
              background: `hsl(${values.baseHue} ${values.baseSat}% 32%)`,
              boxShadow: "none",
            }}
          />
          <Rail.Slider
            field="baseSat"
            label="Tint strength"
            ariaLabel="Surface tint strength"
            min={0}
            max={100}
            format="percent"
          />
        </CosmeticsSection>

        <CosmeticsSection id="updown">
          <Rail.Color
            field="upColor"
            label="Up"
            ariaLabel="Gain (up) colour"
            rowStyle={{ margin: "10px 0 0" }}
          />
          <Rail.Color
            field="downColor"
            label="Down"
            ariaLabel="Loss (down) colour"
            rowStyle={{ marginTop: 9 }}
          />
        </CosmeticsSection>

        <CosmeticsSection id="background">
          <Rail.Segment
            field="bgType"
            ariaLabel="Background style"
            className="zf-bg-seg"
            options={[
              { value: "none", label: "Glow" },
              { value: "color", label: "Color" },
              { value: "gradient", label: "Gradient" },
              { value: "unicorn", label: "Scene" },
              { value: "image", label: "Image" },
            ]}
          />
          {values.bgType === "color" && (
            <Rail.Color
              field="bgColor"
              ariaLabel="Background colour"
              rowStyle={{ marginTop: 12 }}
            />
          )}
          {values.bgType === "gradient" && (
            <>
              <Rail.Color
                field="bgGradFrom"
                label="From"
                ariaLabel="Gradient start colour"
                rowStyle={{ marginTop: 12 }}
                resettable={false}
              />
              <Rail.Color
                field="bgGradTo"
                label="To"
                ariaLabel="Gradient end colour"
                rowStyle={{ marginTop: 9 }}
                resettable={false}
              />
              <Rail.Slider
                field="bgGradAngle"
                label="Angle"
                ariaLabel="Gradient angle"
                min={0}
                max={360}
                format="deg"
              />
            </>
          )}
          {values.bgType === "unicorn" && (
            <>
              <ScenePicker />
              <Rail.Slider
                field="bgOpacity"
                label="Opacity"
                ariaLabel="Background scene opacity"
                min={0}
                max={0.6}
                step={0.02}
                format="ratio"
              />
            </>
          )}
          {values.bgType === "image" && (
            <>
              <ImageUrlField />
              <Rail.Label>Fit</Rail.Label>
              <Rail.Segment
                field="bgImageFit"
                ariaLabel="Background image fit"
                options={[
                  { value: "cover", label: "Cover" },
                  { value: "contain", label: "Contain" },
                ]}
              />
              <Rail.Slider
                field="bgImageBlur"
                label="Blur"
                ariaLabel="Background image blur"
                min={0}
                max={40}
                format="px"
              />
              <Rail.Slider
                field="bgOverlayOpacity"
                label="Overlay"
                ariaLabel="Background image overlay opacity"
                min={0}
                max={1}
                step={0.05}
                format="ratio"
              />
            </>
          )}
        </CosmeticsSection>

        <CosmeticsSection id="layout">
          <Rail.Label>Direction</Rail.Label>
          <Rail.Segment
            field="mode"
            ariaLabel="Dashboard layout direction"
            className="zf-mode-seg"
            buttonClassName="zf-mode-seg-btn"
            onSelect={onModeChange}
            options={[
              { value: "flow-vertical", label: "Vertical" },
              { value: "flow-horizontal", label: "Horizontal" },
            ]}
          />
          {isHorizontal && (
            <p className="zf-mode-seg-hint">
              Rows fill the height; the board scrolls sideways. Arrange it
              freely — this layout is saved separately from Vertical.
            </p>
          )}
          <Rail.Slider
            field="gap"
            label="Frame gap"
            ariaLabel="Frame gap"
            min={0}
            max={12}
            format="px"
          />
          <Rail.Slider
            field="paddingX"
            label="Side padding"
            ariaLabel="Grid side padding"
            min={0}
            max={96}
            step={4}
            format="px"
          />
          {/* Geometry. Both apply live via GridStack's own setters — and both are
              hidden in flow-horizontal, where the column count comes from the
              frames and the cell height from the viewport, so neither is the
              user's to pick. */}
          {!isHorizontal && (
            <>
              <Rail.Slider
                field="columns"
                label="Columns"
                ariaLabel="Grid columns"
                min={4}
                max={24}
                step={1}
                flush
              />
              <Rail.Slider
                field="rowHeight"
                label="Row height"
                ariaLabel="Grid row height"
                min={40}
                max={200}
                step={2}
                format="px"
                flush
              />
            </>
          )}
        </CosmeticsSection>

        <CosmeticsSection id="appearance">
          <Rail.Slider
            field="radius"
            label="Corner radius"
            ariaLabel="Corner radius"
            min={0}
            max={32}
            format="px"
            flush
          />
          <Rail.Slider
            field="borderStrength"
            label="Border"
            ariaLabel="Border strength"
            min={0}
            max={1}
            step={0.01}
            format="ratio"
          />
          <Rail.Slider
            field="surfaceOpacity"
            label="Card opacity"
            ariaLabel="Card opacity"
            min={0.3}
            max={1}
            step={0.05}
            format="ratio"
          />
          <Rail.Slider
            field="density"
            label="Density"
            ariaLabel="Card density"
            min={0.6}
            max={1.4}
            step={0.05}
            format="ratio"
          />
          <Rail.Slider
            field="elevation"
            label="Elevation"
            ariaLabel="Card elevation"
            min={0}
            max={2}
            step={0.1}
            format="times"
          />
        </CosmeticsSection>

        <CosmeticsSection id="typography">
          <Rail.Label>Font</Rail.Label>
          <Rail.Segment
            field="fontFamily"
            ariaLabel="Font family"
            options={[
              {
                value: "sans",
                label: "Sans",
                style: { fontFamily: FONT_FAMILY_STACKS.sans },
              },
              {
                value: "mono",
                label: "Mono",
                style: { fontFamily: FONT_FAMILY_STACKS.mono },
              },
              {
                value: "serif",
                label: "Serif",
                style: { fontFamily: FONT_FAMILY_STACKS.serif },
              },
            ]}
          />
          <Rail.Label rowStyle={{ marginTop: 13 }}>Numbers</Rail.Label>
          <Rail.Segment
            field="numericStyle"
            ariaLabel="Numeric style"
            options={[
              {
                value: "proportional",
                label: (
                  <span
                    style={{
                      fontVariantNumeric: NUMERIC_VARIANTS.proportional,
                    }}
                  >
                    Normal 1,071
                  </span>
                ),
              },
              {
                value: "tabular",
                label: (
                  <span
                    style={{ fontVariantNumeric: NUMERIC_VARIANTS.tabular }}
                  >
                    Tabular 1,071
                  </span>
                ),
              },
            ]}
          />
          <Rail.Slider
            field="fontScale"
            label="Text size"
            ariaLabel="Text size"
            min={0.85}
            max={1.25}
            step={0.05}
            format="ratio"
          />
        </CosmeticsSection>

        <CosmeticsSection id="currency">
          <CurrencySection />
        </CosmeticsSection>
      </SectionContext.Provider>
    </CosmeticsProvider>
  );
}

CosmeticsRail.Section = CosmeticsSection;
