import { defineFrame } from "@zframes/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { dinoGameMeta } from "./schemas";

// Ported from zTerminal's dino-game-widget. The CDN obstacle sprite is
// replaced with a drawn pixel cactus so the OSS build has no Zentry assets.

const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const GROUND_HEIGHT = 40;
const DINO_WIDTH = 40;
const DINO_HEIGHT = 44;
const OBSTACLE_WIDTH = 24;
const OBSTACLE_HEIGHT = 40;
const INITIAL_SPEED = 6;
const SPEED_INCREMENT = 0.001;

const COLORS = {
  ground: "rgba(255, 255, 255, 0.1)",
  groundTexture: "rgba(255, 255, 255, 0.06)",
  dino: "rgba(255, 255, 255, 1)",
  eye: "rgba(0, 0, 0, 0.8)",
  cactus: "#25A78D",
  text: "rgba(255, 255, 255, 0.85)",
  textSoft: "rgba(255, 255, 255, 0.6)",
  score: "hsla(246, 100%, 70%, 1)",
  gameOver: "hsla(347, 100%, 62%, 1)",
};

interface Obstacle {
  x: number;
  width: number;
  height: number;
}

function drawDinoSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  legFrame: number | null,
) {
  ctx.fillStyle = COLORS.dino;
  ctx.fillRect(x + 10, y + 10, 25, 24);
  ctx.fillRect(x + 20, y, 20, 16);
  ctx.fillStyle = COLORS.eye;
  ctx.fillRect(x + 32, y + 4, 4, 4);
  ctx.fillStyle = COLORS.dino;
  ctx.fillRect(x, y + 16, 14, 8);
  ctx.fillRect(x - 4, y + 12, 8, 8);
  if (legFrame === null) {
    ctx.fillRect(x + 12, y + 34, 6, 10);
    ctx.fillRect(x + 24, y + 34, 6, 10);
  } else {
    ctx.fillRect(x + 12, y + 34, 6, legFrame === 0 ? 10 : 6);
    ctx.fillRect(x + 24, y + 34, 6, legFrame === 1 ? 10 : 6);
  }
  ctx.fillRect(x + 30, y + 18, 4, 10);
}

function drawCactus(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  width: number,
  height: number,
) {
  const y = groundY - height;
  ctx.fillStyle = COLORS.cactus;
  // trunk
  ctx.fillRect(x + width / 2 - 4, y, 8, height);
  // arms
  ctx.fillRect(x, y + 10, 8, 6);
  ctx.fillRect(x, y + 10, 4, 14);
  ctx.fillRect(x + width - 8, y + 18, 8, 6);
  ctx.fillRect(x + width - 4, y + 18, 4, 12);
}

function DinoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<"idle" | "playing" | "gameover">("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("zframes-dino-high-score");
      return saved ? parseInt(saved, 10) : 0;
    }
    return 0;
  });
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    if (highScore > 0)
      localStorage.setItem("zframes-dino-high-score", String(highScore));
  }, [highScore]);

  const gameDataRef = useRef({
    dinoY: 0,
    dinoVelocity: 0,
    isJumping: false,
    obstacles: [] as Obstacle[],
    speed: INITIAL_SPEED,
    frameCount: 0,
    groundOffset: 0,
  });

  const resetGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    gameDataRef.current = {
      dinoY: canvas.height - GROUND_HEIGHT - DINO_HEIGHT,
      dinoVelocity: 0,
      isJumping: false,
      obstacles: [],
      speed: INITIAL_SPEED,
      frameCount: 0,
      groundOffset: 0,
    };
    setScore(0);
  }, []);

  const jump = useCallback(() => {
    if (gameState !== "playing") {
      resetGame();
      setGameState("playing");
      return;
    }
    const data = gameDataRef.current;
    if (!data.isJumping) {
      data.dinoVelocity = JUMP_FORCE;
      data.isJumping = true;
    }
  }, [gameState, resetGame]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      if (isTyping) return;
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [jump]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        gameDataRef.current.dinoY = canvas.height - GROUND_HEIGHT - DINO_HEIGHT;
        setCanvasReady((prev) => !prev);
      }
    };
    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas.parentElement!);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (gameState !== "playing") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let animationId: number;
    const groundY = canvas.height - GROUND_HEIGHT;

    const drawGround = () => {
      ctx.fillStyle = COLORS.ground;
      ctx.fillRect(0, groundY, canvas.width, 2);
      ctx.fillStyle = COLORS.groundTexture;
      const offset = gameDataRef.current.groundOffset % 30;
      for (let i = -offset; i < canvas.width; i += 30) {
        ctx.beginPath();
        ctx.arc(i, groundY + 12, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(i + 15, groundY + 20, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawScore = () => {
      ctx.font = 'bold 12px "DM Sans", monospace';
      ctx.textAlign = "left";
      ctx.fillStyle = COLORS.textSoft;
      ctx.fillText("HI", 10, 30);
      ctx.fillStyle = COLORS.score;
      ctx.fillText(String(highScore).padStart(5, "0"), 30, 30);
      ctx.textAlign = "right";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(String(score).padStart(5, "0"), canvas.width - 10, 30);
    };

    const checkCollision = (obstacle: Obstacle): boolean => {
      const dinoX = 50;
      const dinoY = gameDataRef.current.dinoY;
      return (
        dinoX + DINO_WIDTH - 5 > obstacle.x &&
        dinoX + 5 < obstacle.x + obstacle.width &&
        dinoY + DINO_HEIGHT > groundY - obstacle.height &&
        dinoY + 5 < groundY
      );
    };

    const gameLoop = () => {
      const data = gameDataRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      data.dinoVelocity += GRAVITY;
      data.dinoY += data.dinoVelocity;
      const maxY = groundY - DINO_HEIGHT;
      if (data.dinoY >= maxY) {
        data.dinoY = maxY;
        data.dinoVelocity = 0;
        data.isJumping = false;
      }

      data.obstacles = data.obstacles.filter((obs) => obs.x > -OBSTACLE_WIDTH);
      data.obstacles.forEach((obs) => {
        obs.x -= data.speed;
      });

      const lastObstacle = data.obstacles[data.obstacles.length - 1];
      const minGap = 300 + Math.random() * 200;
      if (!lastObstacle || lastObstacle.x < canvas.width - minGap) {
        if (Math.random() < 0.02) {
          data.obstacles.push({
            x: canvas.width,
            width: OBSTACLE_WIDTH,
            height: OBSTACLE_HEIGHT,
          });
        }
      }

      for (const obs of data.obstacles) {
        if (checkCollision(obs)) {
          setHighScore((prev) => Math.max(prev, score));
          setGameState("gameover");
          return;
        }
      }

      data.frameCount++;
      if (data.frameCount % 6 === 0) setScore((s) => s + 1);
      data.speed += SPEED_INCREMENT;
      data.groundOffset += data.speed;

      drawGround();
      drawDinoSprite(
        ctx,
        50,
        data.dinoY,
        data.isJumping ? null : Math.floor(data.frameCount / 5) % 2,
      );
      data.obstacles.forEach((obs) =>
        drawCactus(ctx, obs.x, groundY, obs.width, obs.height),
      );
      drawScore();

      animationId = requestAnimationFrame(gameLoop);
    };

    animationId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationId);
  }, [gameState, score, highScore]);

  useEffect(() => {
    if (gameState === "playing") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const groundY = canvas.height - GROUND_HEIGHT;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, groundY, canvas.width, 2);
    drawDinoSprite(ctx, 50, groundY - DINO_HEIGHT, null);

    ctx.textAlign = "center";
    if (gameState === "idle") {
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 14px "DM Sans", sans-serif';
      ctx.fillText("Press SPACE or tap to start", canvas.width / 2, canvas.height / 2 - 30);
    } else {
      ctx.fillStyle = COLORS.gameOver;
      ctx.font = 'bold 20px "DM Sans", sans-serif';
      ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 40);
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 14px "DM Sans", sans-serif';
      ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 - 10);
      ctx.fillStyle = COLORS.textSoft;
      ctx.fillText("Press SPACE or tap to restart", canvas.width / 2, canvas.height / 2 + 20);
    }

    ctx.textAlign = "left";
    ctx.font = 'bold 12px "DM Sans", monospace';
    ctx.fillStyle = COLORS.textSoft;
    ctx.fillText("HI", 10, 30);
    ctx.fillStyle = COLORS.score;
    ctx.fillText(String(highScore).padStart(5, "0"), 30, 30);
  }, [gameState, score, highScore, canvasReady]);

  return (
    <div
      className="relative h-full w-full cursor-pointer select-none overflow-hidden"
      onClick={jump}
      onTouchStart={jump}
      role="application"
      aria-label="Dino running game. Press space or tap to jump over obstacles."
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

export const dinoGameFrame = defineFrame({
  ...dinoGameMeta,
  component: DinoGame,
});
