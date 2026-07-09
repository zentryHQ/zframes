import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { DashboardSpec, FrameRegistry } from "@zframes/core";
import { useReducedMotion } from "@zframes/unicorn";
import { AGENTS_LIST_ROUTE, ASK_ROUTE } from "@zframes/spec/routes";
import { OrbCanvas } from "./unicorn/orb-scene";
import { useScreenSnapshot } from "./screen-context";
import { MarkdownAnswer } from "./markdown-answer";
import { suggestionsFor } from "./orb-suggestions";
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

// Animation speed of the orb's effect layer: gentle at rest, a small bump on
// hover (anticipation — it "leans in" before you click), fast while thinking
// (mirrors Nexus's AIAvatar "normal" preset: 1 idle, 5 loading).
const SPEED_IDLE = 1;
const SPEED_HOVER = 2;
const SPEED_BUSY = 5;
const EFFECT_LAYER_ID = "effect2";

// Keep the floating history bounded — it's an ambient readout, not a transcript.
const MAX_MESSAGES = 8;

// Rotating placeholder suggestions cycle while the input is empty and idle so
// the orb keeps hinting at what zAI can answer, instead of one static prompt.
// The list itself is derived from the frames on the dashboard (see
// ./orb-suggestions) so the hints reflect what the user is actually looking at.
//
// Each suggestion holds, then cross-fades to the next; the fade window is how
// long it sits invisible mid-swap (matches the CSS opacity transition).
const PLACEHOLDER_HOLD_MS = 3600;
const PLACEHOLDER_FADE_MS = 320;

// Idle attention nudge: how long the orb sits untouched (closed + idle, thread
// still empty) before it floats a single tailored suggestion beside itself, and
// how long that hint holds before fading. Re-arms while idle; only while no
// question has been asked yet, so it reads as a first-run affordance, not a nag.
const NUDGE_IDLE_MS = 38000;
const NUDGE_VISIBLE_MS = 7200;

// Streaming heartbeat: minimum gap between orb pulses while answer tokens stream,
// so the orb beats a few times a second (visibly "talking") rather than once per
// token in a flood.
const BEAT_THROTTLE_MS = 130;

interface Agent {
  id: string;
  label: string;
}
interface Message {
  role: "user" | "zai";
  text: string;
  error?: boolean;
}

// The orb's chips are user-facing, so a transport failure should read as plain
// language, not a raw "request failed (HTTP 500)". The server's own { error }
// messages (e.g. "no agent CLI found") are preferred over these when present;
// this is the fallback when all we have is a status code.
function friendlyError(status: number): string {
  if (status === 503)
    return "No assistant is set up to answer yet — install Claude, Codex, or Kimi.";
  if (status === 413) return "That question was too long — try a shorter one.";
  if (status >= 500)
    return "zAI ran into a problem answering — give it another try.";
  // A 200 we couldn't read as a stream usually means the server is older than
  // the page (a dev server that wasn't restarted after an update).
  if (status === 200)
    return "zAI sent back an unexpected response. If you just updated zframes, restart the server.";
  return `zAI couldn't answer right now (error ${status}).`;
}

const ORB_CSS = `
/* Focus scrim: opening the orb blurs + dims the dashboard behind so attention
   lands on the conversation. Sits below the orb dock (z 40) and above the
   ticker tape (z 30), so the orb + chat stay sharp while everything else
   recedes. Clicking it dismisses the orb (click-away-to-close).

   Two stacked gradients give the open state ATMOSPHERE rather than a flat dim:
   (1) a warm violet glow spilling from the orb's corner — the room reads as lit
   by zAI, a glowing source, not just darkened; (2) a deeper, warmer dim toward
   the far corner — a violet-plum near-black (not the old cold blue-black) so the
   room genuinely recedes. The near-orb corner stays clear so the conversation
   sits in the light while everything else falls away. */
.zai-scrim {
  position: fixed;
  inset: 0;
  z-index: 35;
  opacity: 0;
  pointer-events: none;
  background:
    radial-gradient(
      88% 82% at 100% 100%,
      hsla(268, 82%, 44%, 0.22),
      transparent 56%
    ),
    radial-gradient(
      150% 150% at 100% 100%,
      hsla(266, 44%, 7%, 0.12),
      hsla(263, 52%, 4%, 0.74) 78%
    );
  backdrop-filter: blur(0px) saturate(1);
  -webkit-backdrop-filter: blur(0px) saturate(1);
  transition:
    opacity 0.46s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    backdrop-filter 0.46s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    -webkit-backdrop-filter 0.46s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.zai-scrim[data-open="true"] {
  opacity: 1;
  pointer-events: auto;
  backdrop-filter: blur(2.5px) saturate(1.12);
  -webkit-backdrop-filter: blur(2.5px) saturate(1.12);
}
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
  /* Negative spread keeps the drop shadow hugging the pill instead of bleeding
     a wide dark halo into the blurred scrim behind it. */
  box-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.45);
}
/* The input and its animated placeholder share one box: the placeholder is an
   absolutely-positioned layer behind the (transparent) input, so the real
   caret/text sit on top while the hint cross-fades underneath. */
.zai-input-field {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}
.zai-input {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  outline: 0;
  color: #e7e9f3;
  font-size: 13px;
}
.zai-ph {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  pointer-events: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  transform: translateY(-50%) translateY(5px);
  transition:
    opacity ${PLACEHOLDER_FADE_MS}ms var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    transform ${PLACEHOLDER_FADE_MS}ms var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.zai-ph[data-show="true"] {
  opacity: 1;
  transform: translateY(-50%) translateY(0);
}
/* While thinking, the hint shimmers instead of cycling (overrides opacity). */
.zai-ph-busy {
  animation: zai-ph-pulse 1.5s ease-in-out infinite;
}
@keyframes zai-ph-pulse {
  0%, 100% { opacity: 0.34; }
  50% { opacity: 0.7; }
}
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

/* Idle attention nudge: after a stretch of inactivity the orb floats a single
   tailored suggestion beside itself ("here's something you could ask"), then
   fades it away and re-arms while idle. Clicking it opens the orb prefilled with
   that question. Always in the DOM (so the fade transition plays) and revealed
   by data-nudge on the dock; cleared the moment you hover the orb or open it. */
.zai-nudge {
  position: absolute;
  right: 72px;
  bottom: 14px;
  max-width: 244px;
  margin: 0;
  padding: 9px 13px;
  border-radius: 14px 14px 4px 14px;
  background: rgba(12, 13, 20, 0.82);
  border: 1px solid hsla(263, 80%, 72%, 0.28);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 8px 22px -10px rgba(0, 0, 0, 0.55);
  color: #e7e9f3;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  opacity: 0;
  transform: translateX(10px) scale(0.96);
  transform-origin: bottom right;
  pointer-events: none;
  transition:
    opacity 0.32s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 0.32s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.zai-dock[data-nudge="true"] .zai-nudge {
  opacity: 1;
  transform: translateX(0) scale(1);
  pointer-events: auto;
}
.zai-nudge:hover { border-color: hsla(263, 85%, 78%, 0.45); }

/* The WebGL orb scene IS the orb — clipped to a circle and faded in once ready.
   The button is just a transparent container; nothing is drawn behind the orb. */
.zai-orb-canvas {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  overflow: hidden;
  opacity: 0;
  transform: scale(0.82);
  transition:
    opacity 0.45s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 0.45s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
  pointer-events: none;
}
/* Wake-in bloom: the first time the WebGL orb is ready it scales up from small
   with a slight overshoot and fades in, so it "boots" into the dock instead of
   just appearing. One-shot (fill: both) — once it settles the orb rests at
   scale 1, where the breathing halo (below) takes over. */
.zai-orb[data-webgl="true"] .zai-orb-canvas {
  opacity: 1;
  transform: scale(1);
  animation: zai-orb-wake 0.7s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1))
    both;
}
@keyframes zai-orb-wake {
  0% { opacity: 0; transform: scale(0.7); }
  60% { opacity: 1; transform: scale(1.06); }
  100% { opacity: 1; transform: scale(1); }
}
/* Streaming heartbeat: each burst of answer tokens fires a quick expanding ring
   from the orb, so it visibly "pulses" as it talks. Keyed on a beat counter in
   JS (throttled), so each increment remounts the element and replays the
   one-shot ring. */
.zai-orb-beat {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  border: 2px solid hsla(263, 92%, 80%, 0.6);
  pointer-events: none;
  animation: zai-orb-beat 0.52s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1))
    forwards;
}
@keyframes zai-orb-beat {
  from { opacity: 0.65; transform: scale(0.92); }
  to { opacity: 0; transform: scale(1.55); }
}
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
/* Breathing halo: a soft violet aura ringing the resting orb, slowly pulsing so
   the idle orb reads as alive (a slow breath) rather than a static button. It's
   a ::before behind the canvas, inset negative so only the glow ring past the
   orb edge shows. Boosted on hover, faster + brighter while thinking. */
.zai-orb::before {
  content: "";
  position: absolute;
  inset: -7px;
  border-radius: 9999px;
  background: radial-gradient(
    circle,
    hsla(263, 92%, 72%, 0.55),
    hsla(263, 90%, 60%, 0.12) 60%,
    transparent 72%
  );
  filter: blur(7px);
  opacity: 0;
  z-index: -1;
  pointer-events: none;
  transition:
    opacity 0.3s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 0.3s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.zai-orb[data-webgl="true"]::before,
.zai-orb[data-fallback="true"]::before {
  animation: zai-orb-breathe 4.5s ease-in-out infinite;
}
@keyframes zai-orb-breathe {
  0%, 100% { opacity: 0.28; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(1.12); }
}
/* Hover anticipation: the aura firms up + brightens (the scene also speeds up,
   handled in JS) so the orb "leans in" before you click. */
.zai-orb:hover::before {
  animation: none;
  opacity: 0.72;
  transform: scale(1.16);
}
/* While zAI is thinking the halo pulses faster + brighter — the orb visibly
   works, matching the sped-up scene and the background coming alive. Placed
   after the hover rule so it wins when both apply. */
.zai-dock[data-busy="true"] .zai-orb::before {
  animation: zai-orb-breathe 1.4s ease-in-out infinite;
  background: radial-gradient(
    circle,
    hsla(263, 95%, 76%, 0.72),
    hsla(263, 92%, 62%, 0.16) 60%,
    transparent 72%
  );
}
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
  gap: 8px;
  max-height: 52vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  pointer-events: auto;
  scrollbar-width: none;
}
.zai-history::-webkit-scrollbar {
  display: none;
}
/* The top fade is a "more above" affordance — only painted once the thread has
   scrolled up off the top. Applying it unconditionally clipped the top edge of
   even a single short chip, so it's gated on scroll position (see onScroll). */
.zai-history[data-masked="true"] {
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 16%);
  mask-image: linear-gradient(180deg, transparent, #000 16%);
}
/* Bottom-pin short threads (the conversation floats just above the input):
   margin-top:auto on the first chip pushes the group down while there's slack,
   then yields to scrolling once the thread outgrows max-height — so a long
   answer scrolls up instead of hard-clipping the oldest message off the top. */
.zai-history > :first-child {
  margin-top: auto;
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
/* Markdown-rendered zAI answers. The chip's own pre-wrap is meant for plain
   text; inside .zai-md we let block elements control layout instead, and trim
   the outer margins so the bubble hugs its content. */
.zai-md {
  white-space: normal;
}
.zai-md > :first-child {
  margin-top: 0;
}
.zai-md > :last-child {
  margin-bottom: 0;
}
.zai-md p {
  margin: 0 0 0.5em;
}
.zai-md a {
  color: hsla(263, 85%, 82%, 0.95);
  text-decoration: underline;
  text-underline-offset: 2px;
  word-break: break-word;
  transition: color 0.15s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.zai-md a:hover {
  color: #fff;
}
.zai-md ul,
.zai-md ol {
  margin: 0.35em 0;
  padding-left: 1.2em;
}
.zai-md li {
  margin: 0.15em 0;
}
.zai-md code {
  font-family: var(--font-mono, ui-monospace, "SF Mono", monospace);
  font-size: 0.92em;
  background: rgba(255, 255, 255, 0.1);
  padding: 0.1em 0.35em;
  border-radius: 5px;
}
.zai-md strong {
  font-weight: 600;
  color: #f0ecff;
}
@keyframes zai-rise {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .zai-msg { animation: none; }
  .zai-panel { transition: none; }
  .zai-ph { transition: opacity 0.15s linear; transform: translateY(-50%); }
  .zai-ph[data-show="true"] { transform: translateY(-50%); }
  .zai-ph-busy { animation: none; opacity: 0.5; }
  .zai-scrim { transition: opacity 0.2s linear; }
  /* Orb aliveness: keep the presence (a static glow, the nudge chip) but drop
     the motion — no breathing, wake bloom, hover lean, or heartbeat ring. */
  .zai-orb::before,
  .zai-orb[data-webgl="true"]::before,
  .zai-orb[data-fallback="true"]::before,
  .zai-dock[data-busy="true"] .zai-orb::before { animation: none; opacity: 0.4; transform: none; }
  .zai-orb:hover::before { opacity: 0.55; transform: none; }
  .zai-orb[data-webgl="true"] .zai-orb-canvas { animation: none; transform: none; }
  .zai-orb-beat { display: none; }
  .zai-nudge { transition: opacity 0.15s linear; transform: none; }
  .zai-dock[data-nudge="true"] .zai-nudge { transform: none; }
}
`;

export function ZaiOrb({
  onOpenChange,
  onThinkingChange,
  spec,
  registry,
}: {
  /** Notified whenever the orb expands/collapses, so host chrome (e.g. the
      dashboard background) can react to the orb being opened. */
  onOpenChange?: (open: boolean) => void;
  /** Notified whenever the agent starts/stops thinking (the `busy` flag), so the
      host can make the background come alive — cycle hue + breathe — while zAI is
      working, mirroring how the orb's own scene speeds up. */
  onThinkingChange?: (thinking: boolean) => void;
  /** The live dashboard spec + frame registry, snapshotted as grounding context
      and attached to every question (see ./screen-context). */
  spec: DashboardSpec;
  registry: FrameRegistry;
}) {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  // A transient activity label streamed from the server ("searching the web…")
  // shown in the input placeholder during the pre-answer gap, so a web lookup
  // reads as work rather than a hung "thinking…". Cleared once tokens arrive.
  const [status, setStatus] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [webglReady, setWebglReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [phIndex, setPhIndex] = useState(0);
  const [phShow, setPhShow] = useState(true);
  // True once the thread has scrolled up off its top edge — gates the top fade
  // mask so a short / top-aligned thread isn't faded at the top (see CSS).
  const [historyMasked, setHistoryMasked] = useState(false);
  // Aliveness state: hover drives the scene's anticipation speed-bump; nudge is
  // the idle attention hint (its text + visibility); beat is the streaming
  // heartbeat counter (each bump replays a one-shot pulse ring, keyed on it).
  const [hovered, setHovered] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [nudgeText, setNudgeText] = useState("");
  const [beat, setBeat] = useState(0);
  const lastBeat = useRef(0);
  const nudgeIx = useRef(0);
  // Every orb-aliveness animation self-disables under reduced motion: the scene
  // speed stays flat, the heartbeat is skipped, and the CSS motion is gated too.
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<UnicornSceneType | null>(null);
  // Snapshots what's on the dashboard right now — attached to every question so
  // zAI answers about the live screen, not in the abstract. Lazy: runs on ask.
  const captureContext = useScreenSnapshot(spec, registry);
  // Placeholder hints tailored to the frames on this dashboard; recomputed only
  // when the spec changes (a dashboard edit), never per render.
  const suggestions = useMemo(
    () => suggestionsFor(spec, registry),
    [spec, registry],
  );

  // Set the orb scene's effect-layer speed. Mirrors Nexus's AIAvatar knob, but
  // now driven by a computed tier (idle / hover / busy) rather than a bool.
  const setSceneSpeed = useCallback(
    (scene: UnicornSceneType, speed: number) => {
      const layer = scene.layers?.find(
        (l) => l.id === EFFECT_LAYER_ID && l.layerType === "effect",
      );
      if (layer && layer.layerType === "effect") layer.speed = speed;
    },
    [],
  );

  // The desired speed: fast while thinking, a small bump on hover (anticipation),
  // gentle at rest. Reduced motion pins it to idle so nothing accelerates.
  const sceneSpeed = reduceMotion
    ? SPEED_IDLE
    : busy
      ? SPEED_BUSY
      : hovered
        ? SPEED_HOVER
        : SPEED_IDLE;
  // Holds the latest desired speed so handleScene can apply it the instant the
  // scene loads — the effect below only fires on later changes (sceneRef is a
  // ref, so it wouldn't re-run merely because the scene arrived).
  const speedRef = useRef(sceneSpeed);

  const handleScene = useCallback(
    (scene: UnicornSceneType | null) => {
      sceneRef.current = scene;
      if (scene) {
        setSceneSpeed(scene, speedRef.current);
        setWebglFailed(false);
        setWebglReady(true);
      } else {
        setWebglReady(false);
      }
    },
    [setSceneSpeed],
  );

  const handleSceneError = useCallback(() => {
    setWebglReady(false);
    setWebglFailed(true);
  }, []);

  // Re-tune the orb whenever the desired speed changes (thinking / hover /
  // reduced-motion), and keep speedRef current so a scene loading later picks up
  // the right speed from the start.
  useEffect(() => {
    speedRef.current = sceneSpeed;
    if (sceneRef.current) setSceneSpeed(sceneRef.current, sceneSpeed);
  }, [sceneSpeed, setSceneSpeed]);

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

  // Esc closes the orb from anywhere while it's open. The input's own keydown
  // can't carry this alone — it's disabled while zAI is thinking (so no key
  // events fire there) and focus can drift to the agent tag or a citation link —
  // so a window-level listener guarantees Esc always dismisses.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Cmd/Ctrl+K opens (and toggles) the orb without reaching for the mouse — the
  // near-universal "open the command/AI surface" chord. Only wired once a runner
  // is installed (the orb is otherwise absent), and it toggles so the same chord
  // also closes it (Esc closes too). preventDefault so the browser's own K
  // binding doesn't also fire. Bare Cmd/Ctrl+K only — Shift/Alt variants are left
  // to the browser's dev-tools shortcuts.
  useEffect(() => {
    if (!agents || agents.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "k"
      ) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [agents]);

  // Keep the latest message in view: the thread is bottom-anchored, so a new
  // message (or reopening the orb) scrolls to the bottom rather than leaving
  // the older messages at the top showing. Re-derive the fade-mask state after
  // pinning (overflowing threads show it; short ones don't).
  useEffect(() => {
    const el = historyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setHistoryMasked(el.scrollTop > 1);
  }, [messages, open]);

  // Cycle the placeholder suggestions while the orb is open and idle: fade the
  // current hint out, swap the text mid-fade, fade the next one in. Paused while
  // busy (the input shows a shimmering "thinking…") and while closed (no timers
  // running behind a hidden panel).
  useEffect(() => {
    if (!open || busy) {
      setPhShow(true);
      return;
    }
    let fade: ReturnType<typeof setTimeout>;
    const cycle = setInterval(() => {
      setPhShow(false);
      fade = setTimeout(() => {
        // Increment unbounded; the render modulos by the current suggestion
        // count, so a dashboard edit that changes the list length mid-cycle
        // can never index out of range.
        setPhIndex((i) => i + 1);
        setPhShow(true);
      }, PLACEHOLDER_FADE_MS);
    }, PLACEHOLDER_HOLD_MS);
    return () => {
      clearInterval(cycle);
      clearTimeout(fade);
    };
  }, [open, busy]);

  // Idle attention nudge: while the orb sits closed + idle with an empty thread,
  // after NUDGE_IDLE_MS it floats one tailored suggestion beside itself, holds it
  // for NUDGE_VISIBLE_MS, then hides and re-arms. Suppressed once any question has
  // been asked (messages present) so it stays a first-run affordance, not a nag;
  // hovering or opening the orb clears it (the hover handler + this guard).
  useEffect(() => {
    if (open || busy || !webglReady || messages.length > 0) return;
    let showT: ReturnType<typeof setTimeout>;
    let hideT: ReturnType<typeof setTimeout>;
    const schedule = () => {
      showT = setTimeout(() => {
        if (suggestions.length) {
          setNudgeText(suggestions[nudgeIx.current % suggestions.length]);
          nudgeIx.current += 1;
          setNudge(true);
          hideT = setTimeout(() => {
            setNudge(false);
            schedule();
          }, NUDGE_VISIBLE_MS);
        } else {
          // No suggestions to show — wait another window and re-check.
          schedule();
        }
      }, NUDGE_IDLE_MS);
    };
    schedule();
    return () => {
      clearTimeout(showT);
      clearTimeout(hideT);
      setNudge(false);
    };
  }, [open, busy, webglReady, messages.length, suggestions]);

  // Surface the open/closed state to the host (App lifts it to the background).
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  // Surface the thinking state too, so the background can come alive while zAI
  // works (App lifts it to the background, same as open above).
  useEffect(() => {
    onThinkingChange?.(busy);
  }, [busy, onThinkingChange]);

  const push = (msg: Message) =>
    setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES));

  async function ask() {
    const question = value.trim();
    if (!question || busy) return;
    // Snapshot the thread BEFORE pushing the new turn — setState is async, so
    // `messages` here is still the prior history. Drop errored turns: a failed
    // answer is noise, not context. The server bounds + truncates it further.
    const history = messages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, text: m.text }));
    push({ role: "user", text: question });
    setValue("");
    setBusy(true);
    setStatus(null);

    // The zai reply is appended once (empty) on the first event, then grows in
    // place as deltas stream in. `replaceZai` rewrites that last zai bubble.
    let zaiOpen = false;
    let streamed = "";
    const openZai = () => {
      if (zaiOpen) return;
      zaiOpen = true;
      push({ role: "zai", text: "" });
    };
    const replaceZai = (text: string, error = false) =>
      setMessages((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === "zai") {
            next[i] = { ...next[i], text, error };
            break;
          }
        }
        return next;
      });

    try {
      // Grounding is best-effort: a null snapshot (no frames / capture failed)
      // is simply omitted, and the server falls back to its spec-only prompt.
      const context = await captureContext();
      const res = await fetch(ASK_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          agent: activeAgent,
          context: context ?? undefined,
          // The ephemeral thread so far, so follow-ups ("what about ETH?",
          // "why?") have context — the orb is otherwise stateless per ask.
          history: history.length ? history : undefined,
        }),
      });

      // A streamed answer comes back as NDJSON. Anything else is either a
      // pre-stream failure (bad request, no runner installed) or a server that
      // doesn't stream — including a stale dev server still on the old
      // single-JSON `{ answer }` contract. Parse the body once and react to its
      // shape, not just its status.
      const ctype = res.headers.get("content-type") ?? "";
      if (!res.body || !ctype.includes("application/x-ndjson")) {
        const json = (await res.json().catch(() => null)) as {
          error?: string;
          answer?: string;
        } | null;
        // A non-streaming server still answers with a single { answer } — show
        // it, so an older/stale build degrades to a working (un-streamed) reply
        // instead of a baffling "request failed (HTTP 200)".
        if (res.ok && typeof json?.answer === "string" && json.answer.trim()) {
          push({ role: "zai", text: json.answer.trim() });
          return;
        }
        push({
          role: "zai",
          text: json?.error ?? friendlyError(res.status),
          error: true,
        });
        return;
      }

      // Read NDJSON events line-by-line as they arrive: `delta` appends a token
      // chunk, `done` swaps in the canonical answer, `error` flags the bubble.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let evt: {
            type?: string;
            text?: string;
            answer?: string;
            error?: string;
          };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.type === "status" && typeof evt.text === "string") {
            // Tool activity (e.g. a web search) before/between answer tokens.
            setStatus(evt.text);
          } else if (evt.type === "delta" && typeof evt.text === "string") {
            openZai();
            setStatus(null); // answer tokens are flowing — drop the status label
            streamed += evt.text;
            replaceZai(streamed);
            // Streaming heartbeat: pulse the orb as tokens land, throttled so it
            // beats a few times a second rather than once per token. Skipped
            // under reduced motion (the ring is hidden there anyway).
            if (!reduceMotion) {
              const t = Date.now();
              if (t - lastBeat.current > BEAT_THROTTLE_MS) {
                lastBeat.current = t;
                setBeat((b) => b + 1);
              }
            }
          } else if (evt.type === "done") {
            openZai();
            replaceZai(evt.answer || streamed);
          } else if (evt.type === "error") {
            openZai();
            replaceZai(
              evt.error || "zAI couldn't finish that answer — try again.",
              true,
            );
          }
        }
      }
      // Stream closed without any event (rare) — leave a readable trace.
      if (!zaiOpen)
        push({
          role: "zai",
          text: "zAI didn't return anything — try again.",
          error: true,
        });
    } catch {
      // fetch/stream threw — server unreachable or the connection dropped.
      const msg =
        "zAI couldn't be reached — check that the zframes server is running.";
      if (zaiOpen) replaceZai(msg, true);
      else push({ role: "zai", text: msg, error: true });
    } finally {
      setBusy(false);
      setStatus(null);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void ask();
    } else if (e.key === "Tab" && !e.shiftKey && !busy && !value) {
      // Accept the currently-shown suggestion as the query (ghost-text style):
      // Tab fills the input with the hint the placeholder is cycling instead of
      // moving focus out of the orb. Only when the field is empty and idle —
      // once there's text (or while thinking) Tab falls back to normal focus
      // movement, and Shift+Tab always tabs back out for accessibility.
      const suggestion = suggestions[phIndex % suggestions.length];
      if (suggestion) {
        e.preventDefault();
        setValue(suggestion);
      }
    }
    // Escape is handled by a window-level listener (see effect above) so it
    // closes the orb even while thinking (input disabled) or when focus drifted.
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

  // Platform-aware glyph for the open shortcut, surfaced on the orb's hover
  // title so the Cmd/Ctrl+K binding is discoverable, not hidden.
  const shortcutHint =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
      ? "⌘K"
      : "Ctrl+K";

  return (
    <>
      <style>{ORB_CSS}</style>
      <div
        className="zai-scrim"
        data-open={open}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div className="zai-dock" data-open={open} data-busy={busy} data-nudge={nudge}>
        {open && messages.length > 0 && (
          <div
            className="zai-history"
            ref={historyRef}
            data-masked={historyMasked}
            onScroll={(e) => setHistoryMasked(e.currentTarget.scrollTop > 1)}
            aria-live="polite"
          >
            {messages.map((m, i) =>
              m.role === "zai" && !m.error ? (
                // zAI answers render as light markdown (clickable citations,
                // lists, emphasis); user turns + error notices stay plain text.
                <div key={i} className="zai-msg zai-msg-zai">
                  <MarkdownAnswer text={m.text} />
                </div>
              ) : (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "zai-msg zai-msg-user"
                      : "zai-msg zai-msg-zai zai-msg-error"
                  }
                >
                  {m.text}
                </div>
              ),
            )}
          </div>
        )}
        {/* Idle nudge: always mounted so its fade transition plays; shown via
            data-nudge on the dock. Clicking it opens the orb prefilled. */}
        <button
          type="button"
          className="zai-nudge"
          tabIndex={nudge ? 0 : -1}
          aria-hidden={!nudge}
          onClick={() => {
            setNudge(false);
            setValue(nudgeText);
            setOpen(true);
          }}
        >
          {nudgeText}
        </button>
        <div className="zai-panel">
          <div className="zai-input-wrap">
            <div className="zai-input-field">
              <input
                ref={inputRef}
                className="zai-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder=""
                disabled={busy}
                aria-label="Ask zAI"
              />
              <span
                className={`zai-ph${busy ? " zai-ph-busy" : ""}`}
                data-show={!value && (busy || phShow)}
                aria-hidden="true"
              >
                {busy
                  ? (status ?? "thinking…")
                  : (suggestions[phIndex % suggestions.length] ?? "")}
              </span>
            </div>
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
          onMouseEnter={() => {
            setHovered(true);
            setNudge(false);
          }}
          onMouseLeave={() => setHovered(false)}
          aria-label={open ? "Close zAI" : "Ask zAI"}
          title={open ? "Close zAI" : `Ask zAI · ${shortcutHint}`}
          aria-expanded={open}
        >
          <OrbCanvas
            className="zai-orb-canvas"
            onScene={handleScene}
            onError={handleSceneError}
          />
          {/* Streaming heartbeat ring — key on the beat counter so each pulse
              remounts + replays the one-shot animation. */}
          {beat > 0 && (
            <span className="zai-orb-beat" key={beat} aria-hidden="true" />
          )}
        </button>
      </div>
    </>
  );
}
