import { DOWN_COLOR_HEX } from "./format";

/**
 * The dashboard accent as a canvas-ready hsla string, read from the live
 * `--zf-accent-hue` / `--zf-accent-sat` vars off a mounted element (the cascade
 * sets them on the dashboard container, not :root, so pass the canvas/its
 * parent — not document). Falls back to the zframes default (242 / 90%). This is
 * how the canvas games recolor with the theme instead of a baked-in indigo.
 */
export function accentColor(el: Element | null, light = 70, alpha = 1): string {
  let hue = "242";
  let sat = "90%";
  if (el) {
    const cs = getComputedStyle(el);
    hue = cs.getPropertyValue("--zf-accent-hue").trim() || "242";
    sat = cs.getPropertyValue("--zf-accent-sat").trim() || "90%";
  }
  return `hsla(${hue}, ${sat}, ${light}%, ${alpha})`;
}

/**
 * Static HUD colors shared by the canvas games (snake, flappy-bird, dino) so
 * their text and game-over readouts match. Gameplay-art colors (snake body,
 * pipes, cactus, bird) stay local to each game. `gameOver` is the semantic
 * down/red as a literal hex — canvas `fillStyle` can't resolve the `--zf-down`
 * var, so it uses the default and doesn't follow a custom downColor (v2 gap).
 */
export const GAME_HUD = {
  text: "rgba(255, 255, 255, 0.85)",
  textSoft: "rgba(255, 255, 255, 0.6)",
  gameOver: DOWN_COLOR_HEX,
} as const;

/**
 * The score readout shared by all three games — "HI" + high score (accent) at
 * the left, current score at the right. One pad width, one baseline, one font,
 * so the three HUDs line up identically (they had drifted to 4/4/5 pad and
 * 22/22/30 baselines).
 */
export function drawScore(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  score: number,
  highScore: number,
  accent: string,
) {
  ctx.font = 'bold 12px "DM Sans", monospace';
  ctx.textAlign = "left";
  ctx.fillStyle = GAME_HUD.textSoft;
  ctx.fillText("HI", 10, 22);
  ctx.fillStyle = accent;
  ctx.fillText(String(highScore).padStart(4, "0"), 30, 22);
  ctx.textAlign = "right";
  ctx.fillStyle = GAME_HUD.text;
  ctx.fillText(String(score).padStart(4, "0"), canvas.width - 10, 22);
}
