"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const GAME_WIDTH = 480;
const GAME_HEIGHT = 800;
const STAGE_SECONDS = 90;
const TURTLE_COUNT = 10;

type Phase = "intro" | "countdown" | "playing" | "result";
type ObstacleKind = "rock" | "log" | "crab";

type Turtle = {
  id: number;
  x: number;
  y: number;
  speed: number;
  angle: number;
  stun: number;
  invulnerable: number;
  state: "active" | "lost" | "rescued";
  bob: number;
  lastHits: Set<number>;
};

type Obstacle = {
  id: number;
  kind: ObstacleKind;
  x: number;
  y: number;
  radius: number;
  width: number;
  height: number;
  phase: number;
  hit: boolean;
  passed: boolean;
  swept: boolean;
};

type GameState = {
  phase: Phase;
  countdown: number;
  elapsed: number;
  lastTime: number;
  lightX: number;
  lightY: number;
  targetX: number;
  targetY: number;
  turtles: Turtle[];
  obstacles: Obstacle[];
  nextObstacleId: number;
  nextSpawnAt: number;
  charge: number;
  perfectDodges: number;
  wavesUsed: number;
  waveTime: number;
  flashTime: number;
  message: string;
  messageTime: number;
  resultSettled: boolean;
};

type Hud = {
  active: number;
  rescued: number;
  lost: number;
  charge: number;
  distance: number;
  time: number;
  perfectDodges: number;
  wavesUsed: number;
};

const initialHud: Hud = {
  active: TURTLE_COUNT,
  rescued: 0,
  lost: 0,
  charge: 0,
  distance: 100,
  time: STAGE_SECONDS,
  perfectDodges: 0,
  wavesUsed: 0,
};

function makeTurtles(): Turtle[] {
  return Array.from({ length: TURTLE_COUNT }, (_, index) => {
    const column = index % 5;
    const row = Math.floor(index / 5);
    return {
      id: index,
      x: 160 + column * 40 + (row ? 10 : 0),
      y: 645 + row * 42 + Math.random() * 8,
      speed: 0.9 + Math.random() * 0.2,
      angle: -Math.PI / 2,
      stun: 0,
      invulnerable: 0,
      state: "active",
      bob: Math.random() * Math.PI * 2,
      lastHits: new Set<number>(),
    };
  });
}

function newGameState(): GameState {
  return {
    phase: "intro",
    countdown: 3,
    elapsed: 0,
    lastTime: 0,
    lightX: GAME_WIDTH / 2,
    lightY: 390,
    targetX: GAME_WIDTH / 2,
    targetY: 390,
    turtles: makeTurtles(),
    obstacles: [],
    nextObstacleId: 1,
    nextSpawnAt: 5,
    charge: 0,
    perfectDodges: 0,
    wavesUsed: 0,
    waveTime: 0,
    flashTime: 0,
    message: "",
    messageTime: 0,
    resultSettled: false,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawTurtle(
  ctx: CanvasRenderingContext2D,
  turtle: Turtle,
  time: number,
) {
  if (turtle.state !== "active") return;

  ctx.save();
  ctx.translate(turtle.x, turtle.y);
  ctx.rotate(turtle.angle + Math.PI / 2);

  if (turtle.invulnerable > 0) {
    ctx.shadowColor = "#9af7e6";
    ctx.shadowBlur = 16;
  }

  const wobble = Math.sin(time * 6 + turtle.bob) * 0.16;
  ctx.fillStyle = turtle.stun > 0 ? "#a58d67" : "#547e5b";

  ctx.save();
  ctx.rotate(wobble);
  ctx.beginPath();
  ctx.ellipse(-9, -1, 7, 4, -0.5, 0, Math.PI * 2);
  ctx.ellipse(9, -1, 7, 4, 0.5, 0, Math.PI * 2);
  ctx.ellipse(-7, 10, 5, 3, 0.45, 0, Math.PI * 2);
  ctx.ellipse(7, 10, 5, 3, -0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = turtle.stun > 0 ? "#806e54" : "#315940";
  ctx.beginPath();
  ctx.ellipse(0, 3, 11, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = turtle.stun > 0 ? "#bda983" : "#739979";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, 3, 7, 11, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(6, 0);
  ctx.moveTo(-5, 6);
  ctx.lineTo(5, 6);
  ctx.stroke();

  ctx.fillStyle = turtle.stun > 0 ? "#a58d67" : "#6d956c";
  ctx.beginPath();
  ctx.arc(0, -13, 5.5, 0, Math.PI * 2);
  ctx.fill();

  if (turtle.stun > 0) {
    ctx.fillStyle = "#fff3ba";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("✦", 13, -14);
  }
  ctx.restore();
}

function drawObstacle(
  ctx: CanvasRenderingContext2D,
  obstacle: Obstacle,
  time: number,
) {
  if (obstacle.swept) return;
  ctx.save();
  ctx.translate(obstacle.x, obstacle.y);

  if (obstacle.kind === "rock") {
    ctx.fillStyle = "#5b5f5b";
    ctx.strokeStyle = "#7b8179";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-obstacle.radius, 10);
    ctx.quadraticCurveTo(-obstacle.radius * 0.75, -obstacle.radius, -4, -obstacle.radius);
    ctx.quadraticCurveTo(obstacle.radius * 0.8, -obstacle.radius * 0.8, obstacle.radius, 8);
    ctx.quadraticCurveTo(4, obstacle.radius, -obstacle.radius, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.beginPath();
    ctx.ellipse(-7, -10, 9, 4, -0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  if (obstacle.kind === "log") {
    ctx.rotate(-0.12);
    ctx.fillStyle = "#6a4b34";
    roundedRect(
      ctx,
      -obstacle.width / 2,
      -obstacle.height / 2,
      obstacle.width,
      obstacle.height,
      10,
    );
    ctx.fill();
    ctx.strokeStyle = "#8d6849";
    ctx.lineWidth = 2;
    for (let offset = -obstacle.width / 2 + 18; offset < obstacle.width / 2; offset += 28) {
      ctx.beginPath();
      ctx.moveTo(offset, -obstacle.height / 2 + 4);
      ctx.lineTo(offset + 8, obstacle.height / 2 - 4);
      ctx.stroke();
    }
  }

  if (obstacle.kind === "crab") {
    const pinch = Math.sin(time * 6 + obstacle.phase) * 3;
    ctx.strokeStyle = "#d1785e";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 8, 2);
      ctx.lineTo(side * 18, 8 + pinch);
      ctx.lineTo(side * 24, 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(side * 8, 7);
      ctx.lineTo(side * 17, 15 - pinch);
      ctx.stroke();
    }
    ctx.fillStyle = "#c9654f";
    ctx.beginPath();
    ctx.ellipse(0, 3, 14, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ece8d2";
    ctx.beginPath();
    ctx.arc(-5, -4, 2.5, 0, Math.PI * 2);
    ctx.arc(5, -4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#27312f";
    ctx.beginPath();
    ctx.arc(-5, -4, 1.1, 0, Math.PI * 2);
    ctx.arc(5, -4, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function obstacleCollision(turtle: Turtle, obstacle: Obstacle) {
  if (obstacle.swept) return false;
  if (obstacle.kind === "log") {
    return (
      Math.abs(turtle.x - obstacle.x) < obstacle.width / 2 + 9 &&
      Math.abs(turtle.y - obstacle.y) < obstacle.height / 2 + 11
    );
  }
  const dx = turtle.x - obstacle.x;
  const dy = turtle.y - obstacle.y;
  return Math.hypot(dx, dy) < obstacle.radius + 10;
}

function spawnObstacle(game: GameState) {
  const progress = game.elapsed / STAGE_SECONDS;
  const roll = Math.random();
  let kind: ObstacleKind = "rock";
  if (progress > 0.18 && roll > 0.58) kind = "crab";
  if (progress > 0.42 && roll > 0.78) kind = "log";

  const obstacle: Obstacle = {
    id: game.nextObstacleId++,
    kind,
    x: 70 + Math.random() * (GAME_WIDTH - 140),
    y: -55,
    radius: kind === "rock" ? 26 + Math.random() * 12 : 23,
    width: kind === "log" ? 125 + Math.random() * 55 : 46,
    height: kind === "log" ? 28 : 46,
    phase: Math.random() * Math.PI * 2,
    hit: false,
    passed: false,
    swept: false,
  };
  game.obstacles.push(obstacle);

  const pacing = progress < 0.25 ? 6.8 : progress < 0.65 ? 5.4 : 4.4;
  game.nextSpawnAt = game.elapsed + pacing + Math.random() * 1.8;
}

function drawGame(ctx: CanvasRenderingContext2D, game: GameState) {
  const t = game.elapsed;
  const progress = clamp(t / STAGE_SECONDS, 0, 1);

  const sand = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  sand.addColorStop(0, "#928566");
  sand.addColorStop(0.55, "#b0a17d");
  sand.addColorStop(1, "#776e57");
  ctx.fillStyle = sand;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.globalAlpha = 0.13;
  ctx.fillStyle = "#f3e8bf";
  const scrollOffset = (t * 36) % 74;
  for (let y = -74 + scrollOffset; y < GAME_HEIGHT + 74; y += 74) {
    for (let x = 18; x < GAME_WIDTH; x += 54) {
      const nudge = Math.sin(x * 0.07 + y * 0.03) * 8;
      ctx.beginPath();
      ctx.arc(x + nudge, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(24, 37, 43, .12)";
  ctx.fillRect(0, 0, 28, GAME_HEIGHT);
  ctx.fillRect(GAME_WIDTH - 28, 0, 28, GAME_HEIGHT);

  const dangerGradient = ctx.createLinearGradient(0, GAME_HEIGHT - 95, 0, GAME_HEIGHT);
  dangerGradient.addColorStop(0, "rgba(25, 28, 29, 0)");
  dangerGradient.addColorStop(1, "rgba(19, 22, 23, .72)");
  ctx.fillStyle = dangerGradient;
  ctx.fillRect(0, GAME_HEIGHT - 100, GAME_WIDTH, 100);

  if (progress > 0.91) {
    const seaDepth = clamp((progress - 0.91) / 0.09, 0, 1) * (GAME_HEIGHT + 80);
    const seaY = -80 + seaDepth;
    const seaGradient = ctx.createLinearGradient(0, -20, 0, seaY);
    seaGradient.addColorStop(0, "#173f4c");
    seaGradient.addColorStop(1, "#2b7180");
    ctx.fillStyle = seaGradient;
    ctx.fillRect(0, 0, GAME_WIDTH, seaY);

    ctx.strokeStyle = "rgba(223, 252, 240, .88)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let x = 0; x <= GAME_WIDTH; x += 10) {
      const y = seaY + Math.sin(x * 0.035 + t * 4.5) * 7;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  for (const obstacle of game.obstacles) drawObstacle(ctx, obstacle, t);

  const lightGradient = ctx.createRadialGradient(
    game.lightX,
    game.lightY,
    4,
    game.lightX,
    game.lightY,
    92,
  );
  lightGradient.addColorStop(0, "rgba(255, 249, 202, .50)");
  lightGradient.addColorStop(0.38, "rgba(255, 246, 191, .25)");
  lightGradient.addColorStop(1, "rgba(255, 247, 205, 0)");
  ctx.fillStyle = lightGradient;
  ctx.beginPath();
  ctx.arc(game.lightX, game.lightY, 92, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 250, 217, .52)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(game.lightX, game.lightY, 48 + Math.sin(t * 2.8) * 3, 0, Math.PI * 2);
  ctx.stroke();

  for (const turtle of game.turtles) drawTurtle(ctx, turtle, t);

  if (game.waveTime > 0) {
    const waveProgress = 1 - game.waveTime / 1.6;
    const waveY = GAME_HEIGHT + 100 - waveProgress * (GAME_HEIGHT + 220);
    ctx.strokeStyle = `rgba(202, 250, 244, ${0.75 - waveProgress * 0.35})`;
    ctx.lineWidth = 28;
    ctx.beginPath();
    for (let x = -20; x <= GAME_WIDTH + 20; x += 14) {
      const y = waveY + Math.sin(x * 0.04 + t * 8) * 12;
      if (x === -20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  if (game.flashTime > 0) {
    ctx.fillStyle = `rgba(193, 249, 239, ${game.flashTime * 0.25})`;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  if (game.messageTime > 0) {
    ctx.font = "700 17px var(--font-geist-sans), sans-serif";
    ctx.textAlign = "center";
    const width = ctx.measureText(game.message).width + 34;
    ctx.fillStyle = "rgba(18, 30, 34, .78)";
    roundedRect(ctx, GAME_WIDTH / 2 - width / 2, 92, width, 38, 19);
    ctx.fill();
    ctx.fillStyle = "#f5edcf";
    ctx.fillText(game.message, GAME_WIDTH / 2, 117);
  }
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<GameState>(newGameState());
  const [phase, setPhase] = useState<Phase>("intro");
  const [hud, setHud] = useState<Hud>(initialHud);

  const startGame = useCallback(() => {
    const fresh = newGameState();
    fresh.phase = "countdown";
    fresh.countdown = 3;
    fresh.lastTime = 0;
    gameRef.current = fresh;
    setHud(initialHud);
    setPhase("countdown");
  }, []);

  const triggerWave = useCallback(() => {
    const game = gameRef.current;
    if (game.phase !== "playing" || game.charge < 3 || game.waveTime > 0) return;
    game.charge = 0;
    game.waveTime = 1.6;
    game.flashTime = 0.45;
    game.wavesUsed += 1;
    game.message = "파도가 길을 열어요";
    game.messageTime = 1.4;
    for (const turtle of game.turtles) {
      if (turtle.state !== "active") continue;
      turtle.y -= 62;
      turtle.invulnerable = 1.6;
      turtle.stun = 0;
    }
    for (const obstacle of game.obstacles) {
      if (obstacle.kind === "crab") obstacle.swept = true;
      if (obstacle.kind === "log") obstacle.x += obstacle.x < GAME_WIDTH / 2 ? -46 : 46;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const game = gameRef.current;
      game.targetX = clamp(((event.clientX - rect.left) / rect.width) * GAME_WIDTH, 36, GAME_WIDTH - 36);
      game.targetY = clamp(((event.clientY - rect.top) / rect.height) * GAME_HEIGHT, 105, GAME_HEIGHT - 105);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        triggerWave();
      }
      if (event.code === "Escape" && gameRef.current.phase === "playing") {
        gameRef.current.phase = "intro";
        setPhase("intro");
      }
    };

    canvas.addEventListener("pointermove", onPointerMove);
    window.addEventListener("keydown", onKeyDown);

    let animationFrame = 0;
    let hudAccumulator = 0;

    const loop = (timestamp: number) => {
      const game = gameRef.current;
      const rawDelta = game.lastTime ? (timestamp - game.lastTime) / 1000 : 0;
      const dt = Math.min(rawDelta, 0.034);
      game.lastTime = timestamp;

      if (game.phase === "countdown") {
        game.countdown -= dt;
        if (game.countdown <= 0) {
          game.phase = "playing";
          game.lastTime = timestamp;
          setPhase("playing");
        }
      }

      if (game.phase === "playing") {
        game.elapsed += dt;
        game.waveTime = Math.max(0, game.waveTime - dt);
        game.flashTime = Math.max(0, game.flashTime - dt);
        game.messageTime = Math.max(0, game.messageTime - dt);

        const progress = clamp(game.elapsed / STAGE_SECONDS, 0, 1);
        const scrollSpeed = lerp(49, 72, progress);
        game.lightX = lerp(game.lightX, game.targetX, 1 - Math.pow(0.002, dt));
        game.lightY = lerp(game.lightY, game.targetY, 1 - Math.pow(0.002, dt));

        if (game.elapsed >= game.nextSpawnAt && progress < 0.88) {
          spawnObstacle(game);
        }

        for (const obstacle of game.obstacles) {
          if (obstacle.swept) continue;
          obstacle.y += scrollSpeed * dt;
          if (obstacle.kind === "crab") {
            obstacle.x += Math.sin(game.elapsed * 2.2 + obstacle.phase) * 26 * dt;
            obstacle.x = clamp(obstacle.x, 48, GAME_WIDTH - 48);
          }
          if (!obstacle.passed && obstacle.y > GAME_HEIGHT + 60) {
            obstacle.passed = true;
            if (!obstacle.hit) {
              game.charge = Math.min(3, game.charge + 1);
              game.perfectDodges += 1;
              game.message = game.charge === 3 ? "파도 준비 완료!" : "완벽한 회피";
              game.messageTime = 1.1;
            }
          }
        }

        for (const turtle of game.turtles) {
          if (turtle.state !== "active") continue;
          turtle.stun = Math.max(0, turtle.stun - dt);
          turtle.invulnerable = Math.max(0, turtle.invulnerable - dt);

          if (turtle.stun > 0) {
            turtle.y += scrollSpeed * 0.34 * dt;
            const distanceToLight = Math.hypot(game.lightX - turtle.x, game.lightY - turtle.y);
            if (distanceToLight < 68) turtle.stun = Math.max(0, turtle.stun - dt * 1.7);
          } else {
            const dx = game.lightX - turtle.x;
            const dy = game.lightY - turtle.y;
            const distance = Math.max(1, Math.hypot(dx, dy));
            const inLight = distance < 98;
            const guideStrength = inLight ? 52 : 11;

            let moveX = (dx / distance) * guideStrength;
            let moveY = -22 + (dy / distance) * guideStrength;

            for (const other of game.turtles) {
              if (other.id === turtle.id || other.state !== "active") continue;
              const sx = turtle.x - other.x;
              const sy = turtle.y - other.y;
              const sd = Math.max(1, Math.hypot(sx, sy));
              if (sd < 28) {
                moveX += (sx / sd) * (28 - sd) * 1.25;
                moveY += (sy / sd) * (28 - sd) * 0.55;
              }
            }

            const magnitude = Math.max(1, Math.hypot(moveX, moveY));
            const velocity = (inLight ? 49 : 28) * turtle.speed;
            turtle.x += (moveX / magnitude) * velocity * dt;
            turtle.y += (moveY / magnitude) * velocity * dt;
            turtle.y += scrollSpeed * 0.16 * dt;
            turtle.angle = Math.atan2(moveY, moveX);
          }

          turtle.x = clamp(turtle.x, 38, GAME_WIDTH - 38);
          turtle.y = Math.max(88, turtle.y);

          for (const obstacle of game.obstacles) {
            if (
              turtle.invulnerable <= 0 &&
              !turtle.lastHits.has(obstacle.id) &&
              obstacleCollision(turtle, obstacle)
            ) {
              turtle.lastHits.add(obstacle.id);
              turtle.stun = 1.2;
              turtle.y += 22;
              obstacle.hit = true;
              game.message = "달빛으로 일으켜 주세요";
              game.messageTime = 1.25;
            }
          }

          if (turtle.y > GAME_HEIGHT + 22) {
            turtle.state = "lost";
          }

          if (progress > 0.91) {
            const seaY = -80 + clamp((progress - 0.91) / 0.09, 0, 1) * (GAME_HEIGHT + 80);
            if (turtle.y < seaY - 4) turtle.state = "rescued";
          }
        }

        game.obstacles = game.obstacles.filter(
          (obstacle) => !obstacle.passed && !obstacle.swept,
        );

        const active = game.turtles.filter((turtle) => turtle.state === "active").length;
        const rescued = game.turtles.filter((turtle) => turtle.state === "rescued").length;

        if (
          !game.resultSettled &&
          ((game.elapsed >= STAGE_SECONDS && active === 0) ||
            (active === 0 && rescued === 0) ||
            game.elapsed >= STAGE_SECONDS + 2)
        ) {
          game.resultSettled = true;
          game.phase = "result";
          setPhase("result");
        }

        hudAccumulator += dt;
        if (hudAccumulator > 0.1) {
          hudAccumulator = 0;
          setHud({
            active,
            rescued,
            lost: TURTLE_COUNT - active - rescued,
            charge: game.charge,
            distance: Math.max(0, Math.ceil((1 - progress) * 100)),
            time: Math.max(0, Math.ceil(STAGE_SECONDS - game.elapsed)),
            perfectDodges: game.perfectDodges,
            wavesUsed: game.wavesUsed,
          });
        }
      }

      drawGame(ctx, game);
      animationFrame = requestAnimationFrame(loop);
    };

    animationFrame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animationFrame);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [triggerWave]);

  const stars = hud.rescued === 10 ? 3 : hud.rescued >= 5 ? 2 : hud.rescued >= 1 ? 1 : 0;

  return (
    <main className="game-page">
      <section className="story-panel" aria-label="게임 소개">
        <div>
          <p className="eyebrow">FIRST NIGHT · 01</p>
          <h1>바다까지</h1>
          <p className="tagline">
            달빛으로 작은 발걸음을 이끌어 주세요.
          </p>
        </div>

        <div className="story-rule">
          <span className="rule-number">01</span>
          <div>
            <strong>달빛을 옮겨요</strong>
            <p>마우스를 천천히 움직여 무리가 흩어지지 않게 이끄세요.</p>
          </div>
        </div>
        <div className="story-rule">
          <span className="rule-number">02</span>
          <div>
            <strong>완벽하게 피해요</strong>
            <p>장애물을 피해 없이 통과할 때마다 파도가 충전됩니다.</p>
          </div>
        </div>
        <div className="story-rule">
          <span className="rule-number">03</span>
          <div>
            <strong>파도를 불러요</strong>
            <p>세 칸이 차면 Space를 눌러 위기를 벗어나세요.</p>
          </div>
        </div>

        <p className="night-note">작은 발자국, 긴 밤, 하나의 바다.</p>
      </section>

      <section className="game-shell" aria-label="바다까지 게임">
        <header className="game-hud">
          <div className="hud-block">
            <span className="hud-label">바다까지</span>
            <strong>{hud.distance}%</strong>
          </div>
          <div className="distance-track" aria-label={`남은 거리 ${hud.distance}%`}>
            <span style={{ width: `${100 - hud.distance}%` }} />
          </div>
          <div className="hud-block hud-time">
            <span className="hud-label">남은 시간</span>
            <strong>{String(Math.floor(hud.time / 60)).padStart(2, "0")}:{String(hud.time % 60).padStart(2, "0")}</strong>
          </div>
        </header>

        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            aria-label="마우스로 달빛을 움직여 바다거북을 바다까지 안내하는 게임 화면"
          />

          {phase === "intro" && (
            <div className="game-overlay">
              <p className="overlay-kicker">THE FIRST JOURNEY</p>
              <h2>달빛은 바다를<br />가리킵니다.</h2>
              <p>작은 발걸음을 바다까지 이끌어 주세요.</p>
              <button type="button" onClick={startGame} data-testid="start-game">
                첫 번째 밤 시작
                <span aria-hidden="true">→</span>
              </button>
              <small>마우스 이동 · Space 파도</small>
            </div>
          )}

          {phase === "countdown" && (
            <div className="countdown" aria-live="polite">
              <span>{Math.max(1, Math.ceil(gameRef.current.countdown))}</span>
              <p>달빛을 준비하세요</p>
            </div>
          )}

          {phase === "result" && (
            <div className="game-overlay result-overlay">
              <p className="overlay-kicker">THE NIGHT IS OVER</p>
              <h2>{hud.rescued > 0 ? "바다에 닿았어요" : "다시 길을 비춰주세요"}</h2>
              <div className="stars" aria-label={`별 ${stars}개`}>
                {[0, 1, 2].map((star) => (
                  <span key={star} className={star < stars ? "earned" : ""}>★</span>
                ))}
              </div>
              <div className="result-numbers">
                <div><strong>{hud.rescued}</strong><span>구조</span></div>
                <div><strong>{hud.perfectDodges}</strong><span>완벽 회피</span></div>
                <div><strong>{hud.wavesUsed}</strong><span>파도</span></div>
              </div>
              <button type="button" onClick={startGame} data-testid="retry-game">
                다시 도전
                <span aria-hidden="true">↻</span>
              </button>
            </div>
          )}
        </div>

        <footer className="status-bar">
          <div className="turtle-status">
            <span className="tiny-turtle" aria-hidden="true">●</span>
            <strong>{hud.active + hud.rescued}</strong>
            <span>/ {TURTLE_COUNT}</span>
            <small>함께 가는 중</small>
          </div>
          <button
            type="button"
            className={`wave-control ${hud.charge === 3 ? "ready" : ""}`}
            onClick={triggerWave}
            disabled={hud.charge < 3 || phase !== "playing"}
            aria-label={`파도 게이지 ${hud.charge}/3. Space 키로 사용`}
          >
            <span className="wave-key">SPACE</span>
            <span className="wave-label">파도</span>
            <span className="charge-cells" aria-hidden="true">
              {[0, 1, 2].map((cell) => (
                <i key={cell} className={cell < hud.charge ? "filled" : ""} />
              ))}
            </span>
          </button>
        </footer>
      </section>

      <aside className="journey-panel" aria-label="진행 상황">
        <div className="journey-card">
          <span className="moon-mark" aria-hidden="true">◔</span>
          <p>달빛 안에서는<br />더 힘차게 걸어요</p>
        </div>

        <div className="mini-map">
          <span className="map-label">오늘의 길</span>
          <div className="map-line">
            <span className="map-sea">바다</span>
            <i className="map-progress" style={{ height: `${100 - hud.distance}%` }} />
            <span className="map-turtle" style={{ bottom: `${Math.max(3, 100 - hud.distance)}%` }}>●</span>
            <span className="map-start">둥지</span>
          </div>
        </div>

        <div className="rescue-card">
          <span>구조</span>
          <strong>{String(hud.rescued).padStart(2, "0")}</strong>
          <small>바다에 도착한 친구</small>
        </div>
      </aside>
    </main>
  );
}
