import { defineFrame } from "@zframes/core";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flappyBirdMeta } from "./schemas";

// Flappy-bird style game on canvas. Bird holds a fixed x; tap / SPACE flaps it
// up against gravity through gaps in scrolling pipes. No external assets.

const GRAVITY = 0.45;
const FLAP = -7.2;
const PIPE_WIDTH = 52;
const PIPE_GAP = 132;
const PIPE_SPACING = 210;
const SPEED = 2.6;
const BIRD_X = 64;
const BIRD_R = 12;
const GROUND_HEIGHT = 28;
const PIPE_MARGIN = 28;

const COLORS = {
  bird: "rgba(255, 255, 255, 0.95)",
  eye: "rgba(0, 0, 0, 0.8)",
  wing: "hsla(246, 100%, 70%, 1)",
  pipe: "hsla(160, 64%, 40%, 0.9)",
  ground: "rgba(255, 255, 255, 0.1)",
  text: "rgba(255, 255, 255, 0.85)",
  textSoft: "rgba(255, 255, 255, 0.6)",
  score: "hsla(246, 100%, 70%, 1)",
  gameOver: "hsla(347, 100%, 62%, 1)",
};

interface Pipe {
  x: number;
  gapY: number;
  passed: boolean;
}

type GameState = "idle" | "playing" | "gameover";

function drawBird(ctx: CanvasRenderingContext2D, y: number, vel: number) {
  ctx.save();
  ctx.translate(BIRD_X, y);
  ctx.rotate(Math.max(-0.5, Math.min(0.9, vel * 0.06)));
  ctx.fillStyle = COLORS.bird;
  ctx.beginPath();
  ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.wing;
  ctx.fillRect(-BIRD_R + 2, 0, 10, 5);
  ctx.fillStyle = COLORS.eye;
  ctx.beginPath();
  ctx.arc(5, -4, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawScore(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  score: number,
  highScore: number,
) {
  ctx.font = 'bold 12px "DM Sans", monospace';
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.textSoft;
  ctx.fillText("HI", 10, 22);
  ctx.fillStyle = COLORS.score;
  ctx.fillText(String(highScore).padStart(4, "0"), 30, 22);
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.text;
  ctx.fillText(String(score).padStart(4, "0"), canvas.width - 10, 22);
}

function drawStatic(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  gameState: Exclude<GameState, "playing">,
  score: number,
  highScore: number,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const groundY = canvas.height - GROUND_HEIGHT;
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, groundY, canvas.width, 2);
  drawBird(ctx, canvas.height / 2, 0);

  ctx.textAlign = "center";
  if (gameState === "idle") {
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 14px "DM Sans", sans-serif';
    ctx.fillText(
      "Press SPACE or tap to fly",
      canvas.width / 2,
      canvas.height / 2 - 40,
    );
  } else {
    ctx.fillStyle = COLORS.gameOver;
    ctx.font = 'bold 20px "DM Sans", sans-serif';
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 50);
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 14px "DM Sans", sans-serif';
    ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 - 22);
    ctx.fillStyle = COLORS.textSoft;
    ctx.fillText(
      "Press SPACE or tap to retry",
      canvas.width / 2,
      canvas.height / 2 + 6,
    );
  }
  ctx.textAlign = "left";
  drawScore(canvas, ctx, score, highScore);
}

function FlappyBird() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("zframes-flappy-bird-high-score");
      return saved ? parseInt(saved, 10) : 0;
    }
    return 0;
  });
  const [, setCanvasReady] = useState(false);

  const scoreRef = useRef(0);
  const highScoreRef = useRef(highScore);
  const gameStateRef = useRef<GameState>(gameState);

  useEffect(() => {
    highScoreRef.current = highScore;
    if (highScore > 0)
      localStorage.setItem("zframes-flappy-bird-high-score", String(highScore));
  }, [highScore]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const dataRef = useRef({
    birdY: 0,
    birdVel: 0,
    pipes: [] as Pipe[],
    frameCount: 0,
  });

  const newGap = useCallback((canvas: HTMLCanvasElement) => {
    const groundY = canvas.height - GROUND_HEIGHT;
    const min = PIPE_MARGIN;
    const max = groundY - PIPE_MARGIN - PIPE_GAP;
    return min + Math.random() * Math.max(0, max - min);
  }, []);

  const resetGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    dataRef.current = {
      birdY: canvas.height / 2,
      birdVel: 0,
      pipes: [{ x: canvas.width + 60, gapY: newGap(canvas), passed: false }],
      frameCount: 0,
    };
    scoreRef.current = 0;
    setScore(0);
  }, [newGap]);

  const flap = useCallback(() => {
    if (gameStateRef.current !== "playing") {
      resetGame();
      setGameState("playing");
      return;
    }
    dataRef.current.birdVel = FLAP;
  }, [resetGame]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable
      )
        return;
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flap]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        const ctx = canvas.getContext("2d");
        if (gameStateRef.current !== "playing") {
          dataRef.current.birdY = canvas.height / 2;
          if (ctx)
            drawStatic(
              canvas,
              ctx,
              gameStateRef.current,
              scoreRef.current,
              highScoreRef.current,
            );
        }
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
    const groundY = canvas.height - GROUND_HEIGHT;
    const endGame = () => {
      if (scoreRef.current > highScoreRef.current) {
        highScoreRef.current = scoreRef.current;
        setHighScore(scoreRef.current);
      }
      setGameState("gameover");
    };

    const loop = () => {
      const d = dataRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      d.birdVel += GRAVITY;
      d.birdY += d.birdVel;

      d.pipes = d.pipes.filter((p) => p.x > -PIPE_WIDTH);
      d.pipes.forEach((p) => (p.x -= SPEED));
      const last = d.pipes[d.pipes.length - 1];
      if (!last || last.x < canvas.width - PIPE_SPACING)
        d.pipes.push({ x: canvas.width, gapY: newGap(canvas), passed: false });

      // Ceiling / ground.
      if (d.birdY - BIRD_R <= 0 || d.birdY + BIRD_R >= groundY) {
        endGame();
        return;
      }
      // Pipes.
      for (const p of d.pipes) {
        const overlapX =
          BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_WIDTH;
        if (
          overlapX &&
          (d.birdY - BIRD_R < p.gapY || d.birdY + BIRD_R > p.gapY + PIPE_GAP)
        ) {
          endGame();
          return;
        }
        if (!p.passed && p.x + PIPE_WIDTH < BIRD_X) {
          p.passed = true;
          scoreRef.current += 1;
          setScore(scoreRef.current);
        }
      }

      // Draw pipes.
      ctx.fillStyle = COLORS.pipe;
      for (const p of d.pipes) {
        ctx.fillRect(p.x, 0, PIPE_WIDTH, p.gapY);
        ctx.fillRect(
          p.x,
          p.gapY + PIPE_GAP,
          PIPE_WIDTH,
          groundY - (p.gapY + PIPE_GAP),
        );
      }
      // Ground.
      ctx.fillStyle = COLORS.ground;
      ctx.fillRect(0, groundY, canvas.width, 2);

      drawBird(ctx, d.birdY, d.birdVel);
      drawScore(canvas, ctx, scoreRef.current, highScoreRef.current);

      d.frameCount++;
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
    drawStatic(canvas, ctx, gameState, score, highScore);
  }, [gameState, score, highScore]);

  return (
    <div
      className="relative h-full w-full cursor-pointer select-none overflow-hidden"
      onClick={flap}
      onTouchStart={flap}
      role="application"
      aria-label="Flappy bird game. Press space or tap to flap."
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

export const flappyBirdFrame = defineFrame({
  ...flappyBirdMeta,
  component: FlappyBird,
});
