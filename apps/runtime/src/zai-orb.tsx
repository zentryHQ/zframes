import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { AGENTS_LIST_ROUTE, ASK_ROUTE } from "@zframes/core/routes";
import { OrbCanvas } from "./unicorn/orb-scene";
import type { UnicornSceneType } from "./unicorn/types";

// The zAI orb — host chrome (not a frame), pinned bottom-right above the ticker
// tape. Clicking the orb expands a text input to its left; the conversation
// floats above the input as standalone chips rather than a bordered panel.
//
// It talks to the runtime's keyless agent bridge: GET /__zframes/agents to see
// which local agent CLIs (claude / codex / kimi) are installed, POST
// /__zframes/ask to run a question through one. If none are installed the orb
// renders nothing, so the default dashboard is unchanged.
//
// The orb itself is Nexus's WebGL zAI scene (lifted into ./unicorn — Zentry IP),
// rendered into the button and sped up while thinking. If the SDK/scene fails
// to load it falls back to the CSS orb baked into the button below.

// Idle vs thinking animation speed of the orb's effect layer (mirrors Nexus's
// AIAvatar "normal" preset: 1 idle, 5 loading).
const SPEED_IDLE = 1;
const SPEED_BUSY = 5;
const EFFECT_LAYER_ID = "effect2";

// Keep the floating history bounded — it's an ambient readout, not a transcript.
const MAX_MESSAGES = 8;

interface Agent {
  id: string;
  label: string;
}
interface Message {
  role: "user" | "zai";
  text: string;
  error?: boolean;
}

const ORB_CSS = `
.zai-dock {
  position: fixed;
  right: 18px;
  bottom: 50px;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-dmsans, system-ui, sans-serif);
}
.zai-panel {
  display: flex;
  align-items: center;
  width: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    width 0.34s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    opacity 0.22s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.zai-dock[data-open="true"] .zai-panel {
  width: 330px;
  opacity: 1;
}
.zai-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 330px;
  padding: 9px 10px 9px 14px;
  border-radius: 9999px;
  background: rgba(12, 13, 20, 0.72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid hsla(263, 80%, 72%, 0.24);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
}
.zai-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  outline: 0;
  color: #e7e9f3;
  font-size: 13px;
}
.zai-input::placeholder { color: rgba(255, 255, 255, 0.4); }
.zai-agent {
  flex: none;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: hsla(263, 85%, 82%, 0.95);
  background: hsla(263, 80%, 60%, 0.16);
  border-radius: 7px;
  padding: 4px 7px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: background 0.15s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.zai-agent:hover { background: hsla(263, 80%, 60%, 0.28); }

/* The WebGL orb scene IS the orb — clipped to a circle and faded in once ready.
   The button is just a transparent container; nothing is drawn behind the orb. */
.zai-orb-canvas {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  overflow: hidden;
  opacity: 0;
  transition: opacity 0.45s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
  pointer-events: none;
}
.zai-orb[data-webgl="true"] .zai-orb-canvas { opacity: 1; }
.zai-orb-canvas canvas {
  width: 100% !important;
  height: 100% !important;
  display: block;
}

.zai-orb {
  position: relative;
  width: 60px;
  height: 60px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  cursor: pointer;
  background: transparent;
  transition: transform 0.2s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.zai-orb:hover { transform: scale(1.06); }
.zai-orb:active { transform: scale(0.97); }
/* Minimal fallback gradient, shown only if the WebGL scene fails to load, so
   the orb stays visible + clickable instead of being an invisible button. */
.zai-orb[data-fallback="true"] {
  background:
    radial-gradient(circle at 34% 28%, hsla(263, 95%, 86%, 0.95), transparent 45%),
    radial-gradient(circle at 62% 70%, #7a17e0 0%, #4a0a92 55%, #2c0560 100%);
}

.zai-history {
  position: absolute;
  right: 70px;
  bottom: 72px;
  width: 344px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 8px;
  max-height: 52vh;
  overflow: hidden;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 16%);
  mask-image: linear-gradient(180deg, transparent, #000 16%);
}
.zai-msg {
  width: fit-content;
  max-width: 100%;
  padding: 8px 12px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  animation: zai-rise 0.28s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)) both;
}
.zai-msg-user {
  align-self: flex-end;
  background: hsla(263, 70%, 55%, 0.28);
  border: 1px solid hsla(263, 80%, 75%, 0.3);
  color: #f0ecff;
}
.zai-msg-zai {
  align-self: flex-start;
  background: rgba(12, 13, 20, 0.66);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #dfe3ef;
}
.zai-msg-error {
  color: #ffb4bd;
  border-color: rgba(255, 107, 129, 0.4);
}
@keyframes zai-rise {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .zai-msg { animation: none; }
  .zai-panel { transition: none; }
}
`;

export function ZaiOrb() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [webglReady, setWebglReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sceneRef = useRef<UnicornSceneType | null>(null);

  // Drive the orb scene's effect-layer speed: gentle when idle, fast while the
  // agent is thinking. Mirrors Nexus's AIAvatar isLoading behaviour.
  const applySpeed = useCallback(
    (scene: UnicornSceneType, thinking: boolean) => {
      const layer = scene.layers?.find(
        (l) => l.id === EFFECT_LAYER_ID && l.layerType === "effect",
      );
      if (layer && layer.layerType === "effect")
        layer.speed = thinking ? SPEED_BUSY : SPEED_IDLE;
    },
    [],
  );

  const handleScene = useCallback(
    (scene: UnicornSceneType | null) => {
      sceneRef.current = scene;
      if (scene) {
        applySpeed(scene, false);
        setWebglFailed(false);
        setWebglReady(true);
      } else {
        setWebglReady(false);
      }
    },
    [applySpeed],
  );

  const handleSceneError = useCallback(() => {
    setWebglReady(false);
    setWebglFailed(true);
  }, []);

  // Re-tune the orb whenever the thinking state flips.
  useEffect(() => {
    if (sceneRef.current) applySpeed(sceneRef.current, busy);
  }, [busy, applySpeed]);

  // Detect installed runners once. No runner → the orb stays hidden.
  useEffect(() => {
    let cancelled = false;
    fetch(AGENTS_LIST_ROUTE, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { agents: [] }))
      .then((json: { agents?: Agent[] }) => {
        if (cancelled) return;
        const list = json.agents ?? [];
        setAgents(list);
        setActiveAgent(list[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Focus the input as it expands.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const push = (msg: Message) =>
    setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES));

  async function ask() {
    const question = value.trim();
    if (!question || busy) return;
    push({ role: "user", text: question });
    setValue("");
    setBusy(true);
    try {
      const res = await fetch(ASK_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, agent: activeAgent }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        answer?: string;
        error?: string;
      };
      if (res.ok && json.ok && json.answer) {
        push({ role: "zai", text: json.answer });
      } else {
        push({
          role: "zai",
          text: json.error ?? `request failed (HTTP ${res.status})`,
          error: true,
        });
      }
    } catch (error) {
      push({ role: "zai", text: String(error), error: true });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void ask();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function cycleAgent() {
    if (!agents || agents.length < 2 || !activeAgent) return;
    const i = agents.findIndex((a) => a.id === activeAgent);
    setActiveAgent(agents[(i + 1) % agents.length].id);
  }

  // null = still detecting; [] = none installed → render nothing.
  if (!agents || agents.length === 0) return null;

  const activeLabel =
    agents.find((a) => a.id === activeAgent)?.label ?? agents[0].label;

  return (
    <>
      <style>{ORB_CSS}</style>
      <div className="zai-dock" data-open={open} data-busy={busy}>
        {open && messages.length > 0 && (
          <div className="zai-history" aria-live="polite">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "zai-msg zai-msg-user"
                    : `zai-msg zai-msg-zai${m.error ? " zai-msg-error" : ""}`
                }
              >
                {m.text}
              </div>
            ))}
          </div>
        )}
        <div className="zai-panel">
          <div className="zai-input-wrap">
            <input
              ref={inputRef}
              className="zai-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={busy ? "thinking…" : "what's going on?"}
              disabled={busy}
              aria-label="Ask zAI"
            />
            <span
              className="zai-agent"
              onClick={cycleAgent}
              title={
                agents.length > 1
                  ? "Click to switch agent"
                  : `Answered by ${activeLabel}`
              }
            >
              {activeLabel}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="zai-orb"
          data-webgl={webglReady}
          data-fallback={webglFailed}
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close zAI" : "Ask zAI"}
          aria-expanded={open}
        >
          <OrbCanvas
            className="zai-orb-canvas"
            onScene={handleScene}
            onError={handleSceneError}
          />
        </button>
      </div>
    </>
  );
}
