import { Check, ChevronDown, ChevronUp, Plus, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type {
  CurrencyCode,
  EventMarker,
  FrameInstance,
  FrameStyle,
} from "@zframes/spec/spec";
import { CurrencyPicker } from "./currency-picker";
import type { FrameCategory, FrameRegistry } from "@zframes/spec/frame";
import {
  assetLogoUrl,
  configFields,
  defaultForShape,
  detectSymbolControl,
  formatBriefChange,
  formatBriefPrice,
  humanizeKey,
  isObject,
  isObjectArray,
  isStringArray,
  isType,
  objectArrayFields,
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

/** Trailing window before a typed draft is validated and pushed to the card.
 *  Short enough to still read as live, long enough that a burst of keystrokes
 *  costs one schema parse and one frame re-render instead of a dozen. */
const CONFIG_PARSE_DEBOUNCE_MS = 150;

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
  boardCurrency,
  inherited,
  onApply,
  onClose,
}: {
  instance: FrameInstance;
  registry: FrameRegistry;
  instancesRef: RefObject<Map<string, FrameInstance>>;
  symbolUniverse: SymbolUniverse;
  accentHue: number;
  /** The dashboard-wide display currency this card inherits unless it pins its
   *  own — shown on the "Inherit board" row so the default names its effect. */
  boardCurrency: CurrencyCode;
  /** The live dashboard-level cosmetic values this card inherits when a per-frame
   *  `style` override is unset. Enabling an override seeds it with the matching
   *  inherited value, so switching a field from Default → override is a visual
   *  no-op until the user drags it. */
  inherited: Required<FrameStyle>;
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

  /**
   * Which field each validation issue belongs to, keyed by the issue path's FIRST
   * segment — the top-level config key the generated control corresponds to.
   *
   * The dialog used to show only a single blob of `path: message` lines at the
   * bottom, so on a frame with a dozen controls you had to map a Zod path back to
   * a control yourself. Nesting is flattened to the owning field on purpose:
   * `fills.0.price` is reported on the Fills row editor, which is the control the
   * user has to go fix.
   */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /**
   * Validate a draft and push it to the shared instance, returning the error text
   * it produced (null when it validated) so a caller that must act on validity
   * right now doesn't have to wait for the `error` state to land.
   */
  const applyConfig = useCallback(
    (next: Record<string, unknown>): string | null => {
      if (def) {
        const result = def.schema.safeParse(next);
        if (!result.success) {
          const message = result.error.issues
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("\n");
          setError(message);
          const byField: Record<string, string> = {};
          for (const issue of result.error.issues) {
            const owner = issue.path[0];
            if (typeof owner !== "string") continue;
            // Deeper paths keep their tail, so "row 1's price" is still findable
            // inside a long list.
            const where =
              issue.path.length > 1 ? `${issue.path.slice(1).join(".")}: ` : "";
            if (!byField[owner]) byField[owner] = `${where}${issue.message}`;
          }
          setFieldErrors(byField);
          return message;
        }
      }
      setError(null);
      setFieldErrors({});
      const current = instancesRef.current.get(instanceId);
      if (!current) return null;
      instancesRef.current.set(instanceId, { ...current, config: next });
      onApply(instanceId);
      return null;
    },
    [def, instanceId, instancesRef, onApply],
  );

  // The draft waiting to be validated + applied, and the trailing timer that will
  // do it. Typing is what makes this worth deferring: every keystroke re-parses
  // the whole schema and re-renders the card's React root, and only the last one
  // in a burst is a state anybody sees.
  const pendingConfigRef = useRef<Record<string, unknown> | null>(null);
  const parseTimerRef = useRef<number | null>(null);

  /**
   * Apply the deferred draft right now. Returns the error text of that apply, or
   * `undefined` when there was nothing pending — so a caller can distinguish
   * "just validated, and this is the result" from "nothing changed, use `error`".
   */
  const flushConfig = useCallback((): string | null | undefined => {
    if (parseTimerRef.current !== null) {
      clearTimeout(parseTimerRef.current);
      parseTimerRef.current = null;
    }
    const next = pendingConfigRef.current;
    pendingConfigRef.current = null;
    if (!next) return undefined;
    return applyConfig(next);
  }, [applyConfig]);

  const commit = useCallback(
    (next: Record<string, unknown>) => {
      // The draft itself is never deferred — the controls are its only source of
      // truth, so a delayed setConfig would drop keystrokes.
      setConfig(next);
      pendingConfigRef.current = next;
      if (parseTimerRef.current !== null) clearTimeout(parseTimerRef.current);
      parseTimerRef.current = window.setTimeout(() => {
        parseTimerRef.current = null;
        const pending = pendingConfigRef.current;
        pendingConfigRef.current = null;
        if (pending) applyConfig(pending);
      }, CONFIG_PARSE_DEBOUNCE_MS);
    },
    [applyConfig],
  );

  // Closing, saving and unmounting all end the dialog's life, so the last draft
  // has to be applied before it goes — a debounce that can lose the final
  // keystroke is a data-loss bug, not a perf win.
  const flushConfigRef = useRef(flushConfig);
  flushConfigRef.current = flushConfig;
  useEffect(
    () => () => {
      flushConfigRef.current();
    },
    [],
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

  // This card's event markers (spec: instance.events) — a third draft + commit
  // path beside config/title. Only time-axis charts draw them, so the panel
  // below is only offered to frames that can.
  const [events, setEvents] = useState<EventMarker[]>(() => [
    ...(instance.events ?? []),
  ]);
  const commitEvents = useCallback(
    (next: EventMarker[]) => {
      setEvents(next);
      const current = instancesRef.current.get(instanceId);
      if (!current) return;
      instancesRef.current.set(instanceId, {
        ...current,
        // An empty list drops the key entirely, so a card that never had
        // markers round-trips byte-identical.
        events: next.length > 0 ? next : undefined,
      });
      onApply(instanceId);
    },
    [instanceId, instancesRef, onApply],
  );

  // This card's display-currency override (spec: instance.currency — a bare
  // code beside config, not inside it). Three-state, and the third state is the
  // point: null means the key is ABSENT, which is what keeps the card following
  // the board. Writing the board's current code instead would look identical
  // today and stop tracking the moment the board changes.
  const [currency, setCurrency] = useState<CurrencyCode | null>(
    instance.currency ?? null,
  );
  const commitCurrency = useCallback(
    (next: CurrencyCode | null) => {
      setCurrency(next);
      const current = instancesRef.current.get(instanceId);
      if (!current) return;
      instancesRef.current.set(instanceId, {
        ...current,
        currency: next ?? undefined,
      });
      onApply(instanceId);
    },
    [instanceId, instancesRef, onApply],
  );

  // Per-frame cosmetic overrides (spec: instance.style) — a parallel draft +
  // commit path to config/title. Each field is optional: an absent field
  // inherits the dashboard theme/appearance. Writing prunes undefined keys, and
  // an empty override object drops `style` entirely (back to pure inherit), so
  // the round-tripped spec stays clean and every default is a visual no-op.
  const [style, setStyle] = useState<FrameStyle>(() => ({
    ...(instance.style ?? {}),
  }));
  const commitStyle = useCallback(
    (next: FrameStyle) => {
      const cleaned = Object.fromEntries(
        Object.entries(next).filter(([, v]) => v !== undefined),
      ) as FrameStyle;
      setStyle(cleaned);
      const current = instancesRef.current.get(instanceId);
      if (!current) return;
      const hasAny = Object.keys(cleaned).length > 0;
      instancesRef.current.set(instanceId, {
        ...current,
        style: hasAny ? cleaned : undefined,
      });
      onApply(instanceId);
    },
    [instanceId, instancesRef, onApply],
  );

  /**
   * Put the draft back to the last config that actually validated — the one the
   * card is rendering and the one Save would write.
   *
   * This is the exit from an invalid draft. Without it, "invalid drafts stay
   * local" (which is right — inputs must never snap back mid-edit) has no
   * resolution: the only ways out were Done and Esc, both of which dropped the
   * typed value with no indication it was never applied.
   */
  const revertConfig = useCallback(() => {
    const current = instancesRef.current.get(instanceId);
    setConfig({ ...(current?.config ?? {}) });
    setError(null);
    setFieldErrors({});
  }, [instanceId, instancesRef]);

  // Esc closes the dialog — unless the draft is invalid, in which case closing
  // would silently discard it. Then Esc reverts to the last valid config instead,
  // which is a visible change (the fields snap back) rather than a silent loss.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A deferred draft is validated first, and its own verdict wins — `error`
      // is one debounce behind whatever was just typed.
      const flushed = flushConfig();
      if (flushed !== undefined ? flushed : error) revertConfig();
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, error, revertConfig, flushConfig]);

  /**
   * Focus management for a real modal: move focus in on open, keep Tab inside it,
   * and hand focus back to whatever opened it on close.
   *
   * The dialog already declared `aria-modal="true"`, which promises exactly this
   * — but Tab walked straight out into the dashboard behind the backdrop, so a
   * keyboard user could be typing into a card they couldn't see.
   */
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () => {
      const root = dialogRef.current;
      if (!root) return [] as HTMLElement[];
      // No visibility filter: every collapsible panel in this dialog is
      // conditionally RENDERED rather than CSS-hidden, so anything matching here
      // is genuinely reachable. An offsetParent check would be wrong twice over —
      // it is null for every element under jsdom, and null in real browsers for
      // any position:fixed element, which this dialog's backdrop is.
      return [
        ...root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ];
    };

    // Land on the first control in the BODY, not the header's ✕ — which is what
    // plain DOM order gives you, and would mean an immediate Enter closes the
    // dialog you just opened. The point of opening it is to edit something.
    const body = dialogRef.current?.querySelector(".zf-dialog-body");
    const firstInBody = body?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (firstInBody ?? focusables()[0])?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      // Wrap at both ends, and pull focus back in if it has escaped entirely
      // (a click on the backdrop leaves activeElement on <body>).
      if (
        e.shiftKey &&
        (active === firstEl || !dialogRef.current?.contains(active))
      ) {
        e.preventDefault();
        lastEl.focus();
      } else if (
        !e.shiftKey &&
        (active === lastEl || !dialogRef.current?.contains(active))
      ) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Returning focus is what makes the gear button a round trip rather than a
      // one-way door that dumps you at the top of the page.
      if (opener && document.body.contains(opener)) opener.focus();
    };
  }, []);

  const setField = (key: string, value: unknown) =>
    commit({ ...config, [key]: value });
  const frameLabel = def?.label ?? instance.frame.replace(/-/g, " ");

  return (
    <div
      className="zf-dialog-backdrop"
      style={{ ["--zf-accent-hue" as string]: accentHue }}
      onMouseDown={(e) => {
        // Backdrop click closes — but not over an invalid draft, which closing
        // would discard without saying so. See the Esc handler above.
        if (e.target !== e.currentTarget) return;
        const flushed = flushConfig();
        if (flushed !== undefined ? flushed : error) revertConfig();
        else onClose();
      }}
    >
      <div
        ref={dialogRef}
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
        {/* Leaving a control commits it immediately: the debounce is there to
            skip intermediate keystrokes, not to make a finished edit wait. */}
        <div className="zf-dialog-body" onBlur={() => flushConfig()}>
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
              error={fieldErrors[field.key]}
              onChange={(value) => setField(field.key, value)}
            />
          ))}
          {!symbolControl && fields.length === 0 && (
            <p className="zf-rail-empty">This frame has no settings.</p>
          )}
          {error && (
            <div className="zf-config-error" role="alert">
              <p className="zf-config-error-head">
                These settings aren&rsquo;t applied
              </p>
              <p className="zf-config-error-note">
                The card is still using its last valid settings, and
                that&rsquo;s what Save will write. Fix the field below, or
                revert.
              </p>
              <pre className="zf-config-error-detail">{error}</pre>
            </div>
          )}
          {def?.annotatable && (
            <FrameEventsPanel events={events} onChange={commitEvents} />
          )}
          <FrameCurrencyField
            value={currency}
            board={boardCurrency}
            /* The metals frames carry a `config.currency` that picks which
               published LBMA fix series to READ (USD/GBP/EUR are separate
               prints) — a data choice, rendered above among the config fields.
               When a frame has one, say so here, because two controls both
               labelled about currency on one card is exactly the confusion
               worth pre-empting. */
            hasConfigCurrency={fields.some((f) => f.key === "currency")}
            /* Frames that ignore the display currency say so on their meta, so
               the control can be honestly inert instead of promising a
               conversion that never happens. */
            usdOnly={def?.usdOnly === true}
            frameCategory={def?.category}
            onChange={commitCurrency}
          />
          <FrameStylePanel
            style={style}
            inherited={inherited}
            onChange={commitStyle}
          />
        </div>
        <footer className="zf-dialog-foot">
          {/* Done is blocked while the draft is invalid — leaving would drop the
              edit — but Revert always offers a one-click way out, so the dialog
              is never a trap. */}
          {error && (
            <button
              type="button"
              className="zf-btn zf-btn--ghost"
              onClick={revertConfig}
            >
              Revert
            </button>
          )}
          <button
            type="button"
            className="zf-btn zf-btn--primary"
            onClick={() => {
              // `disabled` can be one debounce stale, so the pending draft is
              // validated here too rather than closing over an unparsed edit.
              const flushed = flushConfig();
              if (flushed !== undefined ? flushed : error) return;
              onClose();
            }}
            disabled={Boolean(error)}
            title={
              error
                ? "Fix or revert the invalid settings first"
                : "Close this frame's settings"
            }
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * This card's display currency — the per-card half of the board-wide setting in
 * the Cosmetics rail.
 *
 * Default is an explicit "Inherit board (<CODE>)" row rather than a blank or a
 * pre-selected board code: choosing it writes NO `currency` key, so the card
 * keeps following the board. Pinning a code makes this one card quote it
 * regardless of what the board later becomes.
 *
 * On a frame whose meta declares `usdOnly` the control is shown but DISABLED,
 * with the reason in the hint. Disabled, not hidden: a control that vanishes on
 * some cards is indistinguishable from a feature that doesn't exist, and the
 * reason (an official series, a filed figure, a number you typed) is the useful
 * half of the answer.
 */
function FrameCurrencyField({
  value,
  board,
  hasConfigCurrency,
  usdOnly,
  frameCategory,
  onChange,
}: {
  value: CurrencyCode | null;
  board: CurrencyCode;
  hasConfigCurrency: boolean;
  /** This frame's figures aren't convertible market money (frame meta). */
  usdOnly: boolean;
  /** Used only to word the `usdOnly` reason for the right family. */
  frameCategory?: FrameCategory;
  onChange: (next: CurrencyCode | null) => void;
}) {
  return (
    <div className="zf-field">
      <label
        htmlFor="zf-instance-currency"
        title={
          usdOnly
            ? "This frame's figures always read in USD."
            : "Currency this card's money figures are displayed in."
        }
      >
        Display currency
      </label>
      <CurrencyPicker
        triggerId="zf-instance-currency"
        value={value}
        inheritOf={board}
        label="Display currency for this card"
        disabled={usdOnly}
        onChange={onChange}
      />
      {usdOnly ? (
        <p className="zf-field-hint">
          <strong>Always USD on this frame.</strong>{" "}
          {usdOnlyReason(frameCategory)}
        </p>
      ) : (
        <p className="zf-field-hint">
          Converts this card&rsquo;s money figures only, from USD at the live
          ECB rate. Frames whose figures aren&rsquo;t convertible market money —
          US-macro series, SEC filing figures as reported, and numbers you type
          in yourself — stay in USD whatever this says.
          {hasConfigCurrency && (
            <>
              {" "}
              This is display only: the <strong>Currency</strong> setting above
              picks which published price series this frame reads, and changing
              it changes the data.
            </>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Why a `usdOnly` frame stays in dollars, worded for its family. The flag is a
 * boolean — the three families it covers are distinguishable from the frame's
 * category, and a generic "some frames don't convert" would leave the reader
 * guessing which kind of card they are looking at.
 */
function usdOnlyReason(category?: FrameCategory): string {
  if (category === "journal" || category === "tools")
    return "The amounts on this card are ones you type in yourself, so they read back exactly as entered.";
  if (category === "equities")
    return "These are SEC filing figures, shown exactly as the company reported them.";
  return "This is an official U.S. series, published in dollars — a converted national debt or Treasury rate is a figure nobody quotes.";
}

/**
 * The per-frame `style` overrides — one row per FrameStyle field, mirroring the
 * dashboard-wide Cosmetics rail but scoped to THIS card. Each row is a toggle:
 * off = inherit the dashboard default (field absent from `style`), on = override
 * with a slider. Enabling a field seeds it with the inherited value, so the
 * toggle itself is a visual no-op; the slider then drifts it. Collapsed by
 * default so it never crowds the frame's own settings.
 */
type StyleFieldSpec = {
  key: keyof FrameStyle;
  label: string;
  kind: "hue" | "range";
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
};

// Ranges/labels track the dashboard-wide Accent / Surface / Appearance rail so a
// per-card override reads the same as its global twin. `radius` has no schema
// max, so it's capped here at the same 32px the Appearance rail uses.
const STYLE_FIELDS: StyleFieldSpec[] = [
  {
    key: "accentHue",
    label: "Accent hue",
    kind: "hue",
    min: 0,
    max: 360,
    step: 1,
    format: (v) => `${Math.round(v)}°`,
  },
  {
    key: "accentSat",
    label: "Accent saturation",
    kind: "range",
    min: 0,
    max: 100,
    step: 1,
    format: (v) => `${Math.round(v)}%`,
  },
  {
    key: "baseHue",
    label: "Surface tint",
    kind: "hue",
    min: 0,
    max: 360,
    step: 1,
    format: (v) => `${Math.round(v)}°`,
  },
  {
    key: "baseSat",
    label: "Tint strength",
    kind: "range",
    min: 0,
    max: 100,
    step: 1,
    format: (v) => `${Math.round(v)}%`,
  },
  {
    key: "surfaceOpacity",
    label: "Card opacity",
    kind: "range",
    min: 0.3,
    max: 1,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "radius",
    label: "Corner radius",
    kind: "range",
    min: 0,
    max: 32,
    step: 1,
    format: (v) => `${Math.round(v)}px`,
  },
  {
    key: "borderStrength",
    label: "Border",
    kind: "range",
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "density",
    label: "Density",
    kind: "range",
    min: 0.6,
    max: 1.4,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "elevation",
    label: "Elevation",
    kind: "range",
    min: 0,
    max: 2,
    step: 0.1,
    format: (v) => `${v.toFixed(1)}×`,
  },
];

/** Swatch shown for a marker that hasn't picked its own colour. */
const DEFAULT_EVENT_COLOR = "#8b8df9";

/**
 * Swap the calendar day of an event date while keeping any time-of-day the
 * spec carried — the picker below only edits the day, and an intraday marker
 * shouldn't silently jump to midnight because someone fixed a typo.
 */
const withCalendarDay = (previous: string, day: string): string =>
  previous.length > 10 ? `${day}${previous.slice(10)}` : day;

const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * This card's event markers — dated annotations drawn on its time axis, so a
 * move can be read against what caused it. Offered only for frames whose meta
 * says `annotatable` (a marker on any other frame would parse fine and then
 * render nothing). Collapsed by default, like the Style panel beside it.
 *
 * Edits patch a marker in place rather than rebuilding it, so a field this
 * form doesn't expose (`url`, written by the agent or by hand) survives a
 * human fixing a date or a label.
 */
function FrameEventsPanel({
  events,
  onChange,
}: {
  events: EventMarker[];
  onChange: (next: EventMarker[]) => void;
}) {
  const [open, setOpen] = useState(events.length > 0);

  const patch = (index: number, fields: Partial<EventMarker>) =>
    onChange(events.map((e, i) => (i === index ? { ...e, ...fields } : e)));

  return (
    <section className={open ? "zf-style-panel is-open" : "zf-style-panel"}>
      <button
        type="button"
        className="zf-style-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="zf-style-chevron"
        />
        <span className="zf-style-head-label">Events</span>
        {events.length > 0 && (
          <span className="zf-style-count">{events.length}</span>
        )}
      </button>
      {open && (
        <div className="zf-style-body">
          <p className="zf-field-hint" style={{ margin: "0 0 8px" }}>
            Dated markers on this chart&rsquo;s time axis — hover a flag to read
            it. Markers outside the chart&rsquo;s window aren&rsquo;t drawn.
          </p>
          <div className="zf-events">
            {events.map((event, index) => (
              <div className="zf-event" key={`event-${index}`}>
                <div className="zf-event-head">
                  <input
                    type="date"
                    className="zf-input zf-event-date"
                    value={event.date.slice(0, 10)}
                    aria-label={`Event ${index + 1} date`}
                    onChange={(e) =>
                      patch(index, {
                        date: withCalendarDay(event.date, e.target.value),
                      })
                    }
                  />
                  <input
                    type="color"
                    className="zf-color"
                    value={event.color ?? DEFAULT_EVENT_COLOR}
                    aria-label={`Event ${index + 1} colour`}
                    onChange={(e) => patch(index, { color: e.target.value })}
                  />
                  <button
                    type="button"
                    className="zf-event-del"
                    aria-label={`Remove event ${index + 1}`}
                    onClick={() =>
                      onChange(events.filter((_, i) => i !== index))
                    }
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
                <input
                  className="zf-input"
                  value={event.label}
                  placeholder="What happened"
                  aria-label={`Event ${index + 1} label`}
                  onChange={(e) => patch(index, { label: e.target.value })}
                />
                <input
                  className="zf-input"
                  value={event.note ?? ""}
                  placeholder="Note (optional)"
                  aria-label={`Event ${index + 1} note`}
                  onChange={(e) =>
                    patch(index, { note: e.target.value || undefined })
                  }
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            className="zf-btn"
            style={{ width: "100%", marginTop: 10 }}
            onClick={() =>
              // Seeded with a label because the spec requires a non-empty one:
              // an unlabelled marker would fail validation on save.
              onChange([...events, { date: todayIso(), label: "New event" }])
            }
          >
            <Plus size={13} aria-hidden="true" /> Add event
          </button>
        </div>
      )}
    </section>
  );
}

function FrameStylePanel({
  style,
  inherited,
  onChange,
}: {
  style: FrameStyle;
  inherited: Required<FrameStyle>;
  onChange: (next: FrameStyle) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = Object.keys(style).length;

  const setField = (key: keyof FrameStyle, value: number) =>
    onChange({ ...style, [key]: value });
  const toggleField = (key: keyof FrameStyle, on: boolean) => {
    if (on) {
      onChange({ ...style, [key]: inherited[key] });
    } else {
      const next = { ...style };
      delete next[key];
      onChange(next);
    }
  };

  return (
    <section className={open ? "zf-style-panel is-open" : "zf-style-panel"}>
      <button
        type="button"
        className="zf-style-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="zf-style-chevron"
        />
        <span className="zf-style-head-label">Style</span>
        {activeCount > 0 && (
          <span className="zf-style-count">{activeCount}</span>
        )}
        {activeCount > 0 && (
          <span
            role="button"
            tabIndex={0}
            className="zf-style-clear"
            title="Reset every override to inherit"
            onClick={(e) => {
              e.stopPropagation();
              onChange({});
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onChange({});
              }
            }}
          >
            Reset all
          </span>
        )}
      </button>
      {open && (
        <div className="zf-style-body">
          <p className="zf-field-hint" style={{ marginBottom: 4 }}>
            Override the dashboard look for this card only. Off = inherit.
          </p>
          {STYLE_FIELDS.map((f) => {
            const raw = style[f.key];
            const enabled = raw !== undefined;
            const value = enabled ? (raw as number) : inherited[f.key];
            return (
              <div className="zf-style-field" key={f.key}>
                <div className="zf-theme-row" style={{ marginBottom: 0 }}>
                  <label className="zf-style-toggle">
                    <input
                      type="checkbox"
                      checked={enabled}
                      aria-label={`Override ${f.label}`}
                      onChange={(e) => toggleField(f.key, e.target.checked)}
                    />
                    <span className="zf-theme-val">{f.label}</span>
                  </label>
                  <span className="zf-theme-val">
                    {enabled ? f.format(value) : "Default"}
                  </span>
                </div>
                {enabled && (
                  <input
                    type="range"
                    className={f.kind === "hue" ? "zf-hue-slider" : "zf-range"}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={value}
                    aria-label={f.label}
                    onChange={(e) => setField(f.key, Number(e.target.value))}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * The schema's own `.describe()` text, rendered as visible help.
 *
 * Every frame schema field is required to carry a description (the catalogue the
 * generating agent reads is built from them), but the form only ever exposed them
 * as a `title=` tooltip — invisible on touch, invisible to keyboard users, and
 * invisible to anyone who doesn't happen to hover. All 352 config fields in the
 * registry have one, so this is the single highest-coverage change in the form.
 */
function FieldHint({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p className="zf-field-hint" id={id}>
      {text}
    </p>
  );
}

/** Dispatches a single config field to the right control by its JSON-Schema
 *  shape: checkbox (boolean), dropdown (enum), slider/number (number), tag list
 *  (string[]), row editor (object[]), color picker (hex string), or
 *  text/textarea (string). */
function ConfigField({
  field,
  value,
  error,
  onChange,
}: {
  field: ConfigFieldSchema;
  value: unknown;
  /** This field's validation message, if it's the one holding the draft back. */
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const { key, label, shape } = field;
  const id = `zf-cfg-${key}`;
  const tip = shape.description;
  const hintId = `${id}-hint`;
  // Wraps whichever control the dispatch below picks, so the message lands next
  // to the input that caused it rather than in a blob at the dialog's foot.
  const wrap = (control: React.ReactNode) => (
    <div className="zf-field-wrap" data-invalid={error ? "true" : undefined}>
      {control}
      {error && (
        <p className="zf-field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );

  if (isType(shape, "boolean")) {
    const checked = typeof value === "boolean" ? value : Boolean(shape.default);
    return wrap(
      <div className="zf-field">
        <label className="zf-checkbox">
          <input
            type="checkbox"
            checked={checked}
            aria-describedby={tip ? hintId : undefined}
            onChange={(e) => onChange(e.target.checked)}
          />
          {label}
        </label>
        <FieldHint id={hintId} text={tip} />
      </div>,
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
    return wrap(
      <div className="zf-field">
        <label htmlFor={id}>{label}</label>
        <select
          id={id}
          className="zf-select"
          value={current}
          aria-describedby={tip ? hintId : undefined}
          onChange={(e) => onChange(e.target.value)}
        >
          {enumValues.map((option) => (
            <option key={option} value={option}>
              {humanizeKey(option)}
            </option>
          ))}
        </select>
        <FieldHint id={hintId} text={tip} />
      </div>,
    );
  }

  if (isType(shape, "integer") || isType(shape, "number")) {
    return wrap(
      <NumberField id={id} field={field} value={value} onChange={onChange} />,
    );
  }

  if (isStringArray(shape)) {
    return wrap(
      <StringListField
        id={id}
        field={field}
        value={value}
        onChange={onChange}
      />,
    );
  }

  if (isObjectArray(shape)) {
    return wrap(
      <ObjectListField
        id={id}
        field={field}
        value={value}
        onChange={onChange}
      />,
    );
  }

  if (isType(shape, "string")) {
    return wrap(
      <StringField id={id} field={field} value={value} onChange={onChange} />,
    );
  }

  // Anything left is a shape the form has no honest control for — today that's
  // only `checklist.checked` (a boolean[] the frame writes itself as you tick
  // items). Show it read-only rather than offering a text input that could never
  // produce a valid value: the old fallback let you type into a field whose edit
  // was then silently discarded.
  return <ReadOnlyField id={id} field={field} value={value} />;
}

/** A field the generated form can't author: shown, labelled and explained, but
 *  not editable — so it's neither lost nor a dead end. */
function ReadOnlyField({
  id,
  field,
  value,
}: {
  id: string;
  field: ConfigFieldSchema;
  value: unknown;
}) {
  const { label, shape } = field;
  const hintId = `${id}-hint`;
  const shown =
    value === undefined || value === null ? "—" : JSON.stringify(value);
  return (
    <div className="zf-field">
      <div className="zf-field-row">
        <label htmlFor={id}>{label}</label>
        <span className="zf-field-managed">managed by the frame</span>
      </div>
      <output id={id} className="zf-readonly" aria-describedby={hintId}>
        {shown.length > 120 ? `${shown.slice(0, 120)}…` : shown}
      </output>
      <FieldHint id={hintId} text={shape.description} />
    </div>
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
  const hintId = `${id}-hint`;
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
          <label htmlFor={id}>{label}</label>
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
          aria-describedby={tip ? hintId : undefined}
          onChange={(e) =>
            onChange(
              isInt
                ? Math.round(Number(e.target.value))
                : Number(e.target.value),
            )
          }
        />
        <FieldHint id={hintId} text={tip} />
      </div>
    );
  }

  return (
    <div className="zf-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        className="zf-input"
        min={min}
        max={max}
        step={step}
        value={value === undefined || value === null ? "" : String(value)}
        aria-describedby={tip ? hintId : undefined}
        onChange={(e) =>
          onChange(e.target.value === "" ? "" : Number(e.target.value))
        }
      />
      <FieldHint id={hintId} text={tip} />
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
  const hintId = `${id}-hint`;
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
        <label htmlFor={id}>{label}</label>
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
            aria-describedby={tip ? hintId : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        <FieldHint id={hintId} text={tip} />
      </div>
    );
  }

  if (key === "text") {
    return (
      <div className="zf-field">
        <label htmlFor={id}>{label}</label>
        <textarea
          id={id}
          className="zf-textarea zf-textarea--prose"
          value={str}
          placeholder={placeholder}
          aria-describedby={tip ? hintId : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <FieldHint id={hintId} text={tip} />
      </div>
    );
  }

  return (
    <div className="zf-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="zf-input"
        value={str}
        placeholder={placeholder}
        spellCheck={false}
        aria-describedby={tip ? hintId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldHint id={hintId} text={tip} />
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
    // Preserved exactly as typed. This used to force-uppercase every token,
    // which is right for a ticker but wrong for 8 of the 11 string-array fields
    // in the registry: DeFiLlama protocol slugs must be lowercase-hyphenated
    // ("uniswap"), btc-fees tiers are camelCase enum members ("halfHour"), and
    // quote/rules-card/checklist items are prose sentences. Uppercasing silently
    // broke the data fetch or the copy. The genuinely ticker-shaped fields are
    // owned by the symbol picker, not this control.
    const token = raw.trim();
    setDraft("");
    if (!token || items.includes(token) || maxReached) return;
    onChange([...items, token]);
  };

  return (
    <div className="zf-field">
      <label htmlFor={id}>{label}</label>
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
        aria-describedby={tip ? `${id}-hint` : undefined}
        placeholder={
          maxReached ? "Maximum reached" : "Type a value, Enter to add"
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
      <FieldHint id={`${id}-hint`} text={tip} />
    </div>
  );
}

/**
 * A row editor for an array of flat objects — `image-gallery.images`,
 * `link-grid.links`, `macro-calendar.events`, `breakeven.fills`.
 *
 * These four were the only fields in the registry the generated form couldn't
 * author: they fell through to a plain text input, so typing anything produced a
 * string where an array of objects was required, the draft never validated, and
 * the frame could only be configured by hand-editing dashboard.json. Columns come
 * straight from the item schema, so a new object-array field is covered with no
 * change here.
 *
 * `minItems` is honoured on delete (image-gallery and link-grid both require at
 * least one row), so the editor can't walk the config into an invalid state that
 * then blocks Done.
 */
function ObjectListField({
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
  const hintId = `${id}-hint`;
  const columns = useMemo(() => objectArrayFields(shape), [shape]);
  const rows = Array.isArray(value) ? value.filter(isObject) : [];
  const minItems = typeof shape.minItems === "number" ? shape.minItems : 0;
  const maxItems =
    typeof shape.maxItems === "number" ? shape.maxItems : undefined;
  const atMin = rows.length <= minItems;
  const atMax = maxItems !== undefined && rows.length >= maxItems;
  // Singular-ish noun for the add button, so it reads "Add link" not "Add links".
  const itemNoun = label.replace(/s$/i, "").toLowerCase() || "item";

  const write = (next: Record<string, unknown>[]) => onChange(next);
  const patchRow = (index: number, key: string, next: unknown) =>
    write(rows.map((r, i) => (i === index ? { ...r, [key]: next } : r)));
  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[index], next[to]] = [next[to], next[index]];
    write(next);
  };

  return (
    <div className="zf-field">
      <div className="zf-field-row">
        <label htmlFor={id}>{label}</label>
        <span className="zf-field-num">
          {rows.length}
          {maxItems !== undefined ? `/${maxItems}` : ""}
        </span>
      </div>
      <FieldHint id={hintId} text={tip} />
      <div
        className="zf-rows"
        id={id}
        role="group"
        aria-label={label}
        aria-describedby={tip ? hintId : undefined}
      >
        {rows.map((row, index) => (
          // Index-keyed deliberately: rows have no stable identity of their own
          // and reordering swaps positions, which is exactly what the index
          // expresses here.
          <div className="zf-row" key={index}>
            <div className="zf-row-head">
              <span className="zf-row-index">{index + 1}</span>
              <div className="zf-row-actions">
                <button
                  type="button"
                  className="zf-row-btn"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${itemNoun} ${index + 1} up`}
                  title="Move up"
                >
                  <ChevronUp size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="zf-row-btn"
                  onClick={() => move(index, 1)}
                  disabled={index === rows.length - 1}
                  aria-label={`Move ${itemNoun} ${index + 1} down`}
                  title="Move down"
                >
                  <ChevronDown size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="zf-row-btn zf-row-btn--del"
                  onClick={() => write(rows.filter((_, i) => i !== index))}
                  disabled={atMin}
                  aria-label={`Remove ${itemNoun} ${index + 1}`}
                  title={
                    atMin
                      ? `At least ${minItems} required`
                      : `Remove ${itemNoun}`
                  }
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="zf-row-cells">
              {columns.map((col) => (
                <ObjectRowCell
                  key={col.key}
                  rowId={`${id}-${index}-${col.key}`}
                  column={col}
                  value={row[col.key]}
                  onChange={(next) => patchRow(index, col.key, next)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="zf-row-add"
        disabled={atMax}
        onClick={() => {
          // Seeded from the item schema's own required fields, so a fresh row
          // validates on arrival instead of immediately erroring the draft.
          const seeded = defaultForShape(
            shape.items ?? {},
            itemNoun,
            rows.length,
          );
          write([...rows, isObject(seeded) ? seeded : {}]);
        }}
      >
        <Plus size={13} aria-hidden="true" />
        Add {itemNoun}
      </button>
    </div>
  );
}

/** One cell in an object-array row — a scalar control chosen from the item
 *  schema's property shape. Kept narrow on purpose: these live three levels deep
 *  in a 440px dialog, so a cell is a label + one compact control. */
function ObjectRowCell({
  rowId,
  column,
  value,
  onChange,
}: {
  rowId: string;
  column: ConfigFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { key, label, shape } = column;
  const enumValues =
    Array.isArray(shape.enum) && shape.enum.every((v) => typeof v === "string")
      ? (shape.enum as string[])
      : null;

  if (isType(shape, "boolean")) {
    return (
      <label className="zf-checkbox zf-row-cell">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </label>
    );
  }

  if (enumValues && enumValues.length > 0) {
    return (
      <div className="zf-row-cell">
        <label htmlFor={rowId}>{label}</label>
        <select
          id={rowId}
          className="zf-select"
          value={typeof value === "string" ? value : enumValues[0]}
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

  if (isType(shape, "number") || isType(shape, "integer")) {
    return (
      <div className="zf-row-cell">
        <label htmlFor={rowId}>{label}</label>
        <input
          id={rowId}
          type="number"
          className="zf-input"
          step={isType(shape, "integer") ? 1 : "any"}
          value={typeof value === "number" ? String(value) : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
        />
      </div>
    );
  }

  // A `date` property means ISO YYYY-MM-DD (macro-calendar.events), which the
  // native picker both enforces and localises — the same choice the card's
  // Events panel makes for its own date field.
  const inputType = key === "date" ? "date" : "text";
  // A URL or a prose column is unreadable in a ~118px cell; give it the full row.
  const wide = key === "url" || key === "text" || key === "note";
  return (
    <div className="zf-row-cell" data-wide={wide ? "true" : undefined}>
      <label htmlFor={rowId}>{label}</label>
      <input
        id={rowId}
        type={inputType}
        className="zf-input"
        spellCheck={false}
        placeholder={typeof shape.default === "string" ? shape.default : ""}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
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
                {/* Editable. This was a read-only "x {amount}" label with the
                    value hardcoded to 1 on add, which made a portfolio frame
                    impossible to configure through the UI at all — the whole
                    point of a holdings list is how much of each you hold. */}
                <label className="zf-holding-amount">
                  <span className="zf-holding-amount-x">×</span>
                  <input
                    type="number"
                    className="zf-holding-input"
                    min={0}
                    step="any"
                    value={
                      typeof holding.amount === "number"
                        ? String(holding.amount)
                        : ""
                    }
                    aria-label={`Amount of ${symbol || "holding"}`}
                    onChange={(e) => {
                      const raw = e.target.value;
                      onChangeHoldings(
                        holdings.map((h, i) =>
                          i === index
                            ? { ...h, amount: raw === "" ? "" : Number(raw) }
                            : h,
                        ),
                      );
                    }}
                  />
                </label>
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
