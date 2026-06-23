import { defineFrame } from "@zframes/core";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { GAME_HUD, accentColor, drawScore } from "./game-ui";
import { snakeMeta } from "./schemas";

// Classic grid snake on canvas. The board fills the frame; cell count is derived
// from the frame size, so it scales with the grid item. No external assets.

const CELL = 18;
// The snake advances one cell every STEP_FRAMES animation frames — the lower the
// number, the faster the game.
const STEP_FRAMES = 14;
const GROUND = 0;

// Gameplay-art colors only; the snake body + score use the dashboard accent
// (see accentColor) and HUD text + game-over come from GAME_HUD.
const COLORS = {
  snakeHead: "rgba(255, 255, 255, 0.95)",
  food: "hsla(347, 100%, 62%, 1)",
};

interface Cell {
  x: number;
  y: number;
}

interface SnakeData {
  snake: Cell[];
  dir: Cell;
  pendingDir: Cell;
  food: Cell;
  cols: number;
  rows: number;
  originX: number;
  originY: number;
  stepCounter: number;
}

type GameState = "idle" | "playing" | "gameover";

function fillCell(
  ctx: CanvasRenderingContext2D,
  d: SnakeData,
  cell: Cell,
  color: string,
  inset: number,
) {
  ctx.fillStyle = color;
  ctx.fillRect(
    d.originX + cell.x * CELL + inset,
    d.originY + cell.y * CELL + inset,
    CELL - inset * 2,
    CELL - inset * 2,
  );
}

function drawPlay(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  d: SnakeData,
  score: number,
  highScore: number,
  accent: string,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  fillCell(ctx, d, d.food, COLORS.food, 3);
  d.snake.forEach((seg, i) =>
    fillCell(ctx, d, seg, i === 0 ? COLORS.snakeHead : accent, 2),
  );
  drawScore(canvas, ctx, score, highScore, accent);
}

function drawStatic(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  gameState: Exclude<GameState, "playing">,
  score: number,
  highScore: number,
  accent: string,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  if (gameState === "idle") {
    ctx.fillStyle = GAME_HUD.text;
    ctx.font = 'bold 14px "DM Sans", sans-serif';
    ctx.fillText(
      "Arrow keys or swipe to start",
      canvas.width / 2,
      canvas.height / 2,
    );
  } else {
    ctx.fillStyle = GAME_HUD.gameOver;
    ctx.font = 'bold 20px "DM Sans", sans-serif';
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 30);
    ctx.fillStyle = GAME_HUD.text;
    ctx.font = 'bold 14px "DM Sans", sans-serif';
    ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = GAME_HUD.textSoft;
    ctx.fillText(
      "Press an arrow or tap to play again",
      canvas.width / 2,
      canvas.height / 2 + 28,
    );
  }
  ctx.textAlign = "left";
  drawScore(canvas, ctx, score, highScore, accent);
}

function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("zframes-snake-high-score");
      return saved ? parseInt(saved, 10) : 0;
    }
    return 0;
  });
  const [, setCanvasReady] = useState(false);

  const scoreRef = useRef(0);
  const highScoreRef = useRef(highScore);
  const gameStateRef = useRef<GameState>(gameState);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  // The dashboard accent, read off the live canvas once it's mounted so the
  // snake + score recolor with the theme. Refreshed on resize.
  const accentRef = useRef<string>(accentColor(null));

  useEffect(() => {
    highScoreRef.current = highScore;
    if (highScore > 0)
      localStorage.setItem("zframes-snake-high-score", String(highScore));
  }, [highScore]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const dataRef = useRef<SnakeData>({
    snake: [],
    dir: { x: 1, y: 0 },
    pendingDir: { x: 1, y: 0 },
    food: { x: 0, y: 0 },
    cols: 0,
    rows: 0,
    originX: 0,
    originY: 0,
    stepCounter: 0,
  });

  const placeFood = useCallback(() => {
    const d = dataRef.current;
    if (d.cols <= 0 || d.rows <= 0) return;
    let cell: Cell;
    let guard = 0;
    do {
      cell = {
        x: Math.floor(Math.random() * d.cols),
        y: Math.floor(Math.random() * d.rows),
      };
      guard++;
    } while (
      d.snake.some((s) => s.x === cell.x && s.y === cell.y) &&
      guard < 400
    );
    d.food = cell;
  }, []);

  const resetGame = useCallback(() => {
    const d = dataRef.current;
    const cx = Math.floor(d.cols / 2);
    const cy = Math.floor(d.rows / 2);
    d.snake = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ];
    d.dir = { x: 1, y: 0 };
    d.pendingDir = { x: 1, y: 0 };
    d.stepCounter = 0;
    placeFood();
    scoreRef.current = 0;
    setScore(0);
  }, [placeFood]);

  const start = useCallback(() => {
    if (dataRef.current.cols <= 0) return;
    resetGame();
    setGameState("playing");
  }, [resetGame]);

  const turn = useCallback((nx: number, ny: number) => {
    const d = dataRef.current;
    // Can't reverse straight back onto the neck.
    if (d.dir.x === -nx && d.dir.y === -ny) return;
    d.pendingDir = { x: nx, y: ny };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable
      )
        return;
      const playing = gameStateRef.current === "playing";
      let handled = true;
      switch (e.code) {
        case "ArrowUp":
        case "KeyW":
          if (playing) turn(0, -1);
          else start();
          break;
        case "ArrowDown":
        case "KeyS":
          if (playing) turn(0, 1);
          else start();
          break;
        case "ArrowLeft":
        case "KeyA":
          if (playing) turn(-1, 0);
          else start();
          break;
        case "ArrowRight":
        case "KeyD":
          if (playing) turn(1, 0);
          else start();
          break;
        case "Space":
          if (!playing) start();
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    };
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [turn, start]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight - GROUND;
        accentRef.current = accentColor(canvas);
        const d = dataRef.current;
        d.cols = Math.max(5, Math.floor(canvas.width / CELL));
        d.rows = Math.max(5, Math.floor(canvas.height / CELL));
        d.originX = Math.floor((canvas.width - d.cols * CELL) / 2);
        d.originY = Math.floor((canvas.height - d.rows * CELL) / 2);
        const ctx = canvas.getContext("2d");
        if (ctx && gameStateRef.current !== "playing")
          drawStatic(
            canvas,
            ctx,
            gameStateRef.current,
            scoreRef.current,
            highScoreRef.current,
            accentRef.current,
          );
        setCanvasReady((p) => !p);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (gameState !== "playing") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let raf: number;
    const endGame = () => {
      if (scoreRef.current > highScoreRef.current) {
        highScoreRef.current = scoreRef.current;
        setHighScore(scoreRef.current);
      }
      setGameState("gameover");
    };
    const loop = () => {
      const d = dataRef.current;
      d.stepCounter++;
      if (d.stepCounter >= STEP_FRAMES) {
        d.stepCounter = 0;
        d.dir = d.pendingDir;
        const head = d.snake[0];
        const nx = head.x + d.dir.x;
        const ny = head.y + d.dir.y;
        if (nx < 0 || ny < 0 || nx >= d.cols || ny >= d.rows) {
          endGame();
          return;
        }
        const eating = nx === d.food.x && ny === d.food.y;
        // The tail vacates this step unless we grow, so it's safe to enter.
        const body = eating ? d.snake : d.snake.slice(0, -1);
        if (body.some((s) => s.x === nx && s.y === ny)) {
          endGame();
          return;
        }
        d.snake.unshift({ x: nx, y: ny });
        if (eating) {
          scoreRef.current += 1;
          setScore(scoreRef.current);
          placeFood();
        } else {
          d.snake.pop();
        }
      }
      drawPlay(
        canvas,
        ctx,
        d,
        scoreRef.current,
        highScoreRef.current,
        accentRef.current,
      );
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // Loop reads score/highScore via refs; only gameState (re)starts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  useEffect(() => {
    if (gameState === "playing") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawStatic(canvas, ctx, gameState, score, highScore, accentRef.current);
  }, [gameState, score, highScore]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const from = touchStartRef.current;
    touchStartRef.current = null;
    const t = e.changedTouches[0];
    containerRef.current?.focus();
    if (gameStateRef.current !== "playing") {
      start();
      return;
    }
    if (!from || !t) return;
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
    if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0);
    else turn(0, dy > 0 ? 1 : -1);
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="relative h-full w-full cursor-pointer select-none overflow-hidden outline-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={() => containerRef.current?.focus()}
      role="application"
      aria-label="Snake game. Use the arrow keys or swipe to steer."
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

export const snakeFrame = defineFrame({
  ...snakeMeta,
  component: SnakeGame,
});
