import {
  GridStack,
  type GridItemHTMLElement,
  type GridStackNode,
} from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import "./editor.css";
import type { AnyFrameDefinition, FrameRegistry } from "./frame";
import { FRAME_CSS, FrameContent } from "./frame-content";
import { FramesProvider, useProviders } from "./hooks";
import type { DashboardSpec, FrameInstance } from "./spec";

/**
 * Interactive, in-browser dashboard editor — a drag/resize/add/delete
 * "customise mode" on a GridStack 12-column grid.
 *
 * Edits round-trip the human-editable dashboard.json: `onSave` receives the
 * full updated spec, and the host writes it back to disk (dev) or downloads
 * it. The artifact the agent generates and the one a human drags around stay
 * the same file.
 *
 * GridStack owns the DOM of each grid item, so every frame renders into its
 * own React root mounted in the item's content node. The roots reuse the
 * host's shared provider instances via FramesProvider (no duplicate WebSocket
 * connections).
 */
export function DashboardEditor({
  spec,
  registry,
  onSave,
}: {
  spec: DashboardSpec;
  registry: FrameRegistry;
  /** Persist the edited spec. If omitted, Save downloads a dashboard.json. */
  onSave?: (next: DashboardSpec) => void | Promise<void>;
}) {
  const providers = useProviders();

  const gridRef = useRef<HTMLDivElement>(null);
  const gridInstanceRef = useRef<GridStack | null>(null);
  const gridReadyRef = useRef(false);
  // Authoritative per-instance data (frame/title/config/featured). GridStack
  // owns position; we merge the two at save time.
  const instancesRef = useRef<Map<string, FrameInstance>>(new Map());
  const rootsRef = useRef<Map<string, Root>>(new Map());
  const contentRef = useRef<Map<string, HTMLElement>>(new Map());
  const snapshotRef = useRef<FrameInstance[]>([]);
  const counterRef = useRef(0);

  const [editing, setEditing] = useState(false);
  const [count, setCount] = useState(spec.frames.length);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  // Stable closures for the GridStack callbacks captured by the mount effect.
  const providersRef = useRef(providers);
  providersRef.current = providers;
  const registryRef = useRef(registry);
  registryRef.current = registry;

  const paletteFrames = useMemo(
    () => [...registry.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [registry],
  );

  const defaultConfig = useCallback(
    (def?: AnyFrameDefinition): Record<string, unknown> => {
      if (!def) return {};
      const parsed = def.schema.safeParse({});
      return parsed.success ? (parsed.data as Record<string, unknown>) : {};
    },
    [],
  );

  const uniqueId = useCallback((frame: string): string => {
    let id = `${frame}-${++counterRef.current}`;
    while (instancesRef.current.has(id))
      id = `${frame}-${++counterRef.current}`;
    return id;
  }, []);

  const renderInstance = useCallback((id: string) => {
    const content = contentRef.current.get(id);
    const instance = instancesRef.current.get(id);
    if (!content || !instance) return;
    let root = rootsRef.current.get(id);
    if (!root) {
      content.innerHTML = "";
      root = createRoot(content);
      rootsRef.current.set(id, root);
    }
    root.render(
      <FramesProvider providers={providersRef.current}>
        <FrameContent
          instance={instance}
          registry={registryRef.current}
          className="zf-fill"
        />
      </FramesProvider>,
    );
  }, []);

  const deleteItem = useCallback((el: GridItemHTMLElement) => {
    const grid = gridInstanceRef.current;
    if (!grid) return;
    const id = el.getAttribute("gs-id");
    if (id) {
      rootsRef.current.get(id)?.unmount();
      rootsRef.current.delete(id);
      contentRef.current.delete(id);
      instancesRef.current.delete(id);
      if (selectedIdRef.current === id) setSelectedId(null);
    }
    grid.removeWidget(el, true);
    setCount(grid.getGridItems().length);
  }, []);

  // Adds the customise-mode affordances (delete button + click-to-select) to a
  // grid item. Idempotent — guarded so repeated calls don't stack listeners.
  const decorateItem = useCallback(
    (el: GridItemHTMLElement) => {
      if (!el.querySelector(".zf-del-btn")) {
        const btn = document.createElement("button");
        btn.className = "zf-del-btn";
        btn.type = "button";
        btn.title = "Remove frame";
        btn.innerHTML = "&times;";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteItem(el);
        });
        el.appendChild(btn);
      }
      if (!el.dataset.zfSelectable) {
        el.dataset.zfSelectable = "1";
        el.addEventListener("mousedown", () => {
          const id = el.getAttribute("gs-id");
          if (id) setSelectedId(id);
        });
      }
    },
    [deleteItem],
  );

  const undecorateItem = useCallback((el: GridItemHTMLElement) => {
    el.querySelector(".zf-del-btn")?.remove();
  }, []);

  // Builds the GridStack item DOM for an instance and registers its content
  // node + data. Does not render React (caller calls renderInstance).
  const buildItemEl = useCallback(
    (instance: FrameInstance): GridItemHTMLElement => {
      const def = registryRef.current.get(instance.frame);
      const layout = def?.layout;
      const el = document.createElement("div") as GridItemHTMLElement;
      el.className = "grid-stack-item";
      el.setAttribute("gs-id", instance.id);
      el.setAttribute("data-frame", instance.frame);
      el.setAttribute("gs-x", String(instance.position.x));
      el.setAttribute("gs-y", String(instance.position.y));
      el.setAttribute("gs-w", String(instance.position.w));
      el.setAttribute("gs-h", String(instance.position.h));
      if (layout?.minW) el.setAttribute("gs-min-w", String(layout.minW));
      if (layout?.minH) el.setAttribute("gs-min-h", String(layout.minH));
      if (layout?.maxW) el.setAttribute("gs-max-w", String(layout.maxW));
      if (layout?.maxH) el.setAttribute("gs-max-h", String(layout.maxH));
      const content = document.createElement("div");
      content.className = "grid-stack-item-content";
      el.appendChild(content);
      contentRef.current.set(instance.id, content);
      return el;
    },
    [],
  );

  // Tears down all items + roots and rebuilds the grid from a frame list.
  const restore = useCallback(
    (frames: FrameInstance[]) => {
      const grid = gridInstanceRef.current;
      if (!grid) return;
      rootsRef.current.forEach((root) => root.unmount());
      rootsRef.current.clear();
      contentRef.current.clear();
      instancesRef.current = new Map(frames.map((f) => [f.id, f]));

      grid.removeAll(true);
      grid.el
        .querySelectorAll(".grid-stack-item")
        .forEach((node) => node.remove());

      grid.batchUpdate();
      for (const f of frames) {
        const el = buildItemEl(f);
        grid.el.appendChild(el);
        grid.makeWidget(el);
        renderInstance(f.id);
      }
      grid.batchUpdate(false);
      setCount(frames.length);
    },
    [buildItemEl, renderInstance],
  );

  // Mount once: init GridStack, render the spec, wire drag-in drops.
  useEffect(() => {
    if (!gridRef.current || gridReadyRef.current) return;
    gridReadyRef.current = true;

    const grid = GridStack.init(
      {
        column: spec.grid.columns,
        cellHeight: spec.grid.rowHeight,
        margin: spec.grid.gap / 2,
        float: false,
        animate: true,
        acceptWidgets: true,
        disableDrag: true,
        disableResize: true,
      },
      gridRef.current,
    );
    gridInstanceRef.current = grid;
    restore(spec.frames);

    // A palette card dropped onto the grid: GridStack created the item, we
    // attach the frame (default config) and render it.
    grid.on("dropped", (_event, _prev, node?: GridStackNode) => {
      const el = node?.el as GridItemHTMLElement | undefined;
      if (!el) return;
      const content = el.querySelector(
        ".grid-stack-item-content",
      ) as HTMLElement | null;
      const frame = el.getAttribute("data-frame");
      if (!content || !frame) return;

      const id = el.getAttribute("gs-id") || uniqueId(frame);
      el.setAttribute("gs-id", id);
      const def = registryRef.current.get(frame);
      const instance: FrameInstance = {
        id,
        frame,
        position: {
          x: node?.x ?? 0,
          y: node?.y ?? 0,
          w: node?.w ?? def?.layout?.w ?? 4,
          h: node?.h ?? def?.layout?.h ?? 3,
        },
        config: defaultConfig(def),
        featured: false,
      };
      instancesRef.current.set(id, instance);
      contentRef.current.set(id, content);
      renderInstance(id);
      decorateItem(el);
      setCount(grid.getGridItems().length);
      setSelectedId(id);
    });

    grid.on("removed", () => setCount(grid.getGridItems().length));

    return () => {
      grid.off("dropped");
      grid.off("removed");
      rootsRef.current.forEach((root) => root.unmount());
      rootsRef.current.clear();
      contentRef.current.clear();
      grid.destroy(false);
      gridInstanceRef.current = null;
      gridReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enter/leave customise mode: toggle drag+resize and the per-item affordances.
  useEffect(() => {
    const grid = gridInstanceRef.current;
    if (!grid) return;
    grid.enableMove(editing);
    grid.enableResize(editing);
    if (editing) {
      grid.getGridItems().forEach(decorateItem);
    } else {
      grid.getGridItems().forEach(undecorateItem);
    }
  }, [editing, decorateItem, undecorateItem]);

  // Register palette cards as GridStack drag sources while customising.
  useEffect(() => {
    if (!editing || !gridInstanceRef.current) return;
    GridStack.setupDragIn(".zf-newwidget", {
      appendTo: "body",
      helper: (el: HTMLElement) => {
        const card = (el.closest(".zf-newwidget") as HTMLElement) ?? el;
        const frame = card.dataset.frame ?? "";
        const def = registryRef.current.get(frame);
        const layout = def?.layout;
        const helper = document.createElement("div");
        helper.className = "grid-stack-item";
        helper.setAttribute("data-frame", frame);
        helper.setAttribute("gs-w", String(layout?.w ?? 4));
        helper.setAttribute("gs-h", String(layout?.h ?? 3));
        if (layout?.minW) helper.setAttribute("gs-min-w", String(layout.minW));
        if (layout?.minH) helper.setAttribute("gs-min-h", String(layout.minH));
        if (layout?.maxW) helper.setAttribute("gs-max-w", String(layout.maxW));
        if (layout?.maxH) helper.setAttribute("gs-max-h", String(layout.maxH));
        helper.innerHTML = `<div class="grid-stack-item-content" data-frame="${frame}"></div>`;
        return helper;
      },
    });
  }, [editing, paletteFrames]);

  // Reflect the current selection as a class on the grid items (for the outline).
  useEffect(() => {
    const grid = gridInstanceRef.current;
    if (!grid) return;
    grid.getGridItems().forEach((el) => {
      el.classList.toggle(
        "zf-selected",
        el.getAttribute("gs-id") === selectedId,
      );
    });
  }, [selectedId, count]);

  const collectSpec = useCallback((): DashboardSpec => {
    const grid = gridInstanceRef.current;
    const frames: FrameInstance[] = [];
    if (grid) {
      for (const el of grid.getGridItems()) {
        const id = el.getAttribute("gs-id");
        if (!id) continue;
        const inst = instancesRef.current.get(id);
        if (!inst) continue;
        const node = el.gridstackNode;
        frames.push({
          ...inst,
          position: {
            x: node?.x ?? inst.position.x,
            y: node?.y ?? inst.position.y,
            w: node?.w ?? inst.position.w,
            h: node?.h ?? inst.position.h,
          },
        });
      }
    }
    // Reading order keeps the written file diff-friendly.
    frames.sort(
      (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
    );
    return { ...spec, frames };
  }, [spec]);

  const download = useCallback((next: DashboardSpec) => {
    const blob = new Blob([`${JSON.stringify(next, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dashboard.json";
    a.click();
    // Defer revoke so the click's download isn't cancelled in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, []);

  const startCustomise = useCallback(() => {
    snapshotRef.current = collectSpec().frames;
    setEditing(true);
  }, [collectSpec]);

  const cancel = useCallback(() => {
    restore(snapshotRef.current);
    setSelectedId(null);
    setEditing(false);
  }, [restore]);

  const clearAll = useCallback(() => {
    if (!window.confirm("Remove all frames from the dashboard?")) return;
    restore([]);
    setSelectedId(null);
  }, [restore]);

  const save = useCallback(async () => {
    const next = collectSpec();
    setEditing(false);
    setSelectedId(null);
    if (onSave) await onSave(next);
    else download(next);
  }, [collectSpec, onSave, download]);

  return (
    <>
      <style>{FRAME_CSS}</style>
      <div className={editing ? "zf-editor zf-customise" : "zf-editor"}>
        <div className="zf-editor-bar">
          {editing && (
            <span className="zf-editor-hint">
              drag to move · drag a corner to resize · hover to delete
            </span>
          )}
          <div className="zf-editor-bar-spacer" />
          {!editing ? (
            <>
              <button
                type="button"
                className="zf-btn"
                onClick={() => download(collectSpec())}
              >
                Export JSON
              </button>
              <button
                type="button"
                className="zf-btn zf-btn--primary"
                onClick={startCustomise}
              >
                Customise
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="zf-btn zf-btn--danger"
                onClick={clearAll}
              >
                Clear
              </button>
              <button
                type="button"
                className="zf-btn zf-btn--ghost"
                onClick={cancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="zf-btn zf-btn--primary"
                onClick={save}
              >
                Save
              </button>
            </>
          )}
        </div>

        <div className="zf-editor-main">
          <div className="zf-editor-grid">
            <div ref={gridRef} className="grid-stack" />
          </div>

          {editing && (
            <aside className="zf-rail">
              <ConfigPanel
                key={selectedId ?? "none"}
                selectedId={selectedId}
                registry={registry}
                instancesRef={instancesRef}
                onApply={(id) => renderInstance(id)}
              />

              <section>
                <h3 className="zf-rail-title">Add a frame</h3>
                <div className="zf-palette">
                  {paletteFrames.map((def) => (
                    <div
                      key={def.name}
                      className="zf-newwidget"
                      data-frame={def.name}
                    >
                      <div className="zf-newwidget-name">
                        {def.name.replace(/-/g, " ")}
                      </div>
                      <div className="zf-newwidget-desc">{def.description}</div>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * The selected frame's editor: title, featured flag, and its config as JSON
 * validated against the frame's own schema. Mutates the shared instancesRef
 * and asks the parent to re-render that frame's root on apply.
 */
function ConfigPanel({
  selectedId,
  registry,
  instancesRef,
  onApply,
}: {
  selectedId: string | null;
  registry: FrameRegistry;
  instancesRef: React.RefObject<Map<string, FrameInstance>>;
  onApply: (id: string) => void;
}) {
  const instance = selectedId
    ? instancesRef.current.get(selectedId)
    : undefined;
  const def = instance ? registry.get(instance.frame) : undefined;

  const [title, setTitle] = useState(instance?.title ?? "");
  const [featured, setFeatured] = useState(instance?.featured ?? false);
  const [configText, setConfigText] = useState(
    instance ? JSON.stringify(instance.config ?? {}, null, 2) : "{}",
  );
  const [error, setError] = useState<string | null>(null);

  if (!instance) {
    return (
      <section>
        <h3 className="zf-rail-title">Configure</h3>
        <p className="zf-rail-empty">
          Select a frame on the grid to edit its title and settings.
        </p>
      </section>
    );
  }

  const apply = () => {
    let parsed: unknown;
    try {
      parsed = configText.trim() === "" ? {} : JSON.parse(configText);
    } catch (e) {
      setError(`Invalid JSON: ${String(e)}`);
      return;
    }
    if (def) {
      const result = def.schema.safeParse(parsed);
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
    const current = instancesRef.current.get(instance.id);
    if (current) {
      instancesRef.current.set(instance.id, {
        ...current,
        title: title.trim() === "" ? undefined : title,
        featured,
        config: parsed as Record<string, unknown>,
      });
      onApply(instance.id);
    }
  };

  return (
    <section>
      <h3 className="zf-rail-title">
        Configure · {instance.frame.replace(/-/g, " ")}
      </h3>
      <div className="zf-field">
        <label htmlFor="zf-title">Title</label>
        <input
          id="zf-title"
          className="zf-input"
          value={title}
          placeholder={instance.frame.replace(/-/g, " ")}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <label className="zf-checkbox">
        <input
          type="checkbox"
          checked={featured}
          onChange={(e) => setFeatured(e.target.checked)}
        />
        Featured (hero frame)
      </label>
      <div className="zf-field">
        <label htmlFor="zf-config">Config (JSON)</label>
        <textarea
          id="zf-config"
          className="zf-textarea"
          spellCheck={false}
          value={configText}
          onChange={(e) => setConfigText(e.target.value)}
        />
      </div>
      {error && <div className="zf-config-error">{error}</div>}
      <button type="button" className="zf-btn zf-btn--primary" onClick={apply}>
        Apply
      </button>
    </section>
  );
}
