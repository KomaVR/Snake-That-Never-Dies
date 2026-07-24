"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CELL_COUNT,
  createBrain,
  createInitialGame,
  createSeededRandom,
  cycleIndexOf,
  GRID_SIZE,
  HAMILTONIAN_CYCLE,
  restoreBrain,
  startNextRun,
  stepWorld,
  type Brain,
  type GameState,
  type World,
} from "./survival-engine";

const STORAGE_KEY = "survival-loop-brain-v1";
const SPEEDS = [
  { label: "Observe", delay: 180 },
  { label: "Learn", delay: 92 },
  { label: "Evolve", delay: 42 },
];

function initialWorld(): World {
  return {
    brain: createBrain(),
    game: createInitialGame(1, createSeededRandom(20260724)),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function learnedStateCount(brain: Brain) {
  return Object.keys(brain.q).length;
}

function actionLabel(action: GameState["lastDecision"]["action"]) {
  if (action === "DEEP_SHORTCUT") return "Deep shortcut";
  if (action === "SHORTCUT") return "Safe shortcut";
  return "Guardian cycle";
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
}

function drawGame(canvas: HTMLCanvasElement, game: GameState) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const size = canvas.width;
  const cell = size / GRID_SIZE;
  const inset = Math.max(2, cell * 0.09);

  context.clearRect(0, 0, size, size);
  context.fillStyle = "#090d0b";
  context.fillRect(0, 0, size, size);

  const glow = context.createRadialGradient(
    size * 0.62,
    size * 0.35,
    0,
    size * 0.62,
    size * 0.35,
    size * 0.72,
  );
  glow.addColorStop(0, "rgba(189, 255, 73, 0.055)");
  glow.addColorStop(0.55, "rgba(103, 232, 249, 0.022)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, size, size);

  context.strokeStyle = "rgba(230, 255, 236, 0.065)";
  context.lineWidth = 1;
  for (let line = 0; line <= GRID_SIZE; line += 1) {
    const position = Math.round(line * cell) + 0.5;
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, size);
    context.stroke();
    context.beginPath();
    context.moveTo(0, position);
    context.lineTo(size, position);
    context.stroke();
  }

  const headIndex = cycleIndexOf(game.snake[0]);
  const foodIndex = cycleIndexOf(game.food);
  const foodDistance = (foodIndex - headIndex + CELL_COUNT) % CELL_COUNT;
  const routeLength = Math.min(foodDistance, 20);
  context.fillStyle = "rgba(103, 232, 249, 0.24)";
  for (let offset = 1; offset <= routeLength; offset += 1) {
    const point = HAMILTONIAN_CYCLE[(headIndex + offset) % CELL_COUNT];
    context.beginPath();
    context.arc(
      (point.x + 0.5) * cell,
      (point.y + 0.5) * cell,
      Math.max(1.2, cell * 0.038),
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  const foodPulse = 0.88 + Math.sin(Date.now() / 180) * 0.08;
  const foodSize = (cell - inset * 2) * foodPulse;
  const foodOffset = (cell - foodSize) / 2;
  context.save();
  context.shadowColor = "#ff876c";
  context.shadowBlur = cell * 0.34;
  context.fillStyle = "#ff876c";
  drawRoundedRect(
    context,
    game.food.x * cell + foodOffset,
    game.food.y * cell + foodOffset,
    foodSize,
    foodSize,
    cell * 0.24,
  );
  context.fill();
  context.restore();

  [...game.snake].reverse().forEach((segment, reverseIndex) => {
    const index = game.snake.length - reverseIndex - 1;
    const isHead = index === 0;
    const alpha = 0.48 + (1 - index / Math.max(1, game.snake.length)) * 0.52;
    context.save();
    context.globalAlpha = alpha;
    context.shadowColor = isHead ? "#d9ff79" : "#a7ee3d";
    context.shadowBlur = isHead ? cell * 0.34 : cell * 0.12;
    context.fillStyle = isHead ? "#dcff86" : "#baf34b";
    drawRoundedRect(
      context,
      segment.x * cell + inset,
      segment.y * cell + inset,
      cell - inset * 2,
      cell - inset * 2,
      cell * 0.23,
    );
    context.fill();

    if (isHead) {
      context.fillStyle = "#10170f";
      context.shadowBlur = 0;
      const eyeRadius = Math.max(1.5, cell * 0.045);
      context.beginPath();
      context.arc(
        segment.x * cell + cell * 0.38,
        segment.y * cell + cell * 0.36,
        eyeRadius,
        0,
        Math.PI * 2,
      );
      context.arc(
        segment.x * cell + cell * 0.65,
        segment.y * cell + cell * 0.36,
        eyeRadius,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    context.restore();
  });

  if (game.status !== "running") {
    context.fillStyle = "rgba(5, 8, 6, 0.76)";
    context.fillRect(0, 0, size, size);
    context.textAlign = "center";
    context.fillStyle = game.status === "won" ? "#dcff86" : "#ff876c";
    context.font = `700 ${Math.round(size * 0.065)}px ui-monospace, monospace`;
    context.fillText(
      game.status === "won" ? "BOARD MASTERED" : "RECOVERY MODE",
      size / 2,
      size / 2,
    );
    context.fillStyle = "rgba(239, 246, 237, 0.72)";
    context.font = `500 ${Math.round(size * 0.025)}px ui-monospace, monospace`;
    context.fillText(
      "The learned policy stays in memory",
      size / 2,
      size / 2 + size * 0.06,
    );
  }
}

function tone(audioContext: AudioContext, start: number, end: number) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(start, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    end,
    audioContext.currentTime + 0.12,
  );
  gain.gain.setValueAtTime(0.11, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.14);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.15);
}

export function SurvivalLab() {
  const [world, setWorld] = useState<World>(initialWorld);
  const [paused, setPaused] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [soundOn, setSoundOn] = useState(false);
  const [memoryReady, setMemoryReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousScore = useRef(0);
  const previousStatus = useRef<GameState["status"]>("running");
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    let brain = createBrain();
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) brain = restoreBrain(JSON.parse(stored));
    } catch {
      brain = createBrain();
    }

    setWorld({
      brain,
      game: createInitialGame(1, Math.random),
    });
    setMemoryReady(true);
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setWorld((current) => stepWorld(current, Math.random));
    }, SPEEDS[speedIndex].delay);
    return () => window.clearInterval(timer);
  }, [paused, speedIndex]);

  useEffect(() => {
    if (world.game.status === "running") return;
    const timer = window.setTimeout(() => {
      setWorld((current) => startNextRun(current, Math.random));
    }, world.game.status === "won" ? 1800 : 900);
    return () => window.clearTimeout(timer);
  }, [world.game.status, world.game.generation]);

  useEffect(() => {
    if (!memoryReady) return;
    if (
      world.brain.trainingSteps % 40 !== 0 &&
      world.game.status === "running"
    ) {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(world.brain));
    } catch {
      // Private browsing may decline storage; the live policy still learns.
    }
  }, [
    memoryReady,
    world.brain,
    world.brain.trainingSteps,
    world.game.status,
  ]);

  useEffect(() => {
    if (canvasRef.current) drawGame(canvasRef.current, world.game);
  }, [world.game]);

  useEffect(() => {
    if (!soundOn) {
      previousScore.current = world.game.score;
      previousStatus.current = world.game.status;
      return;
    }

    if (!audioRef.current) audioRef.current = new AudioContext();
    const audio = audioRef.current;
    void audio.resume();

    if (world.game.score > previousScore.current) {
      tone(audio, 360, 720);
    } else if (
      world.game.status === "won" &&
      previousStatus.current !== "won"
    ) {
      tone(audio, 440, 980);
    }

    previousScore.current = world.game.score;
    previousStatus.current = world.game.status;
  }, [soundOn, world.game.score, world.game.status]);

  const fullness = (world.game.snake.length / CELL_COUNT) * 100;
  const learnedStates = learnedStateCount(world.brain);
  const statusLabel =
    world.game.status === "running"
      ? paused
        ? "Holding"
        : "Alive"
      : world.game.status === "won"
        ? "Mastered"
        : "Recovering";
  const memoryLabel = memoryReady
    ? world.brain.trainingSteps > 0
      ? "Long-term memory online"
      : "Fresh policy initialized"
    : "Restoring memory";

  const activeSpeed = SPEEDS[speedIndex];
  const objectiveRows = useMemo(
    () => [
      {
        index: "01",
        title: "Stay alive",
        detail: "Reject every move that crosses the forward tail boundary.",
      },
      {
        index: "02",
        title: "Find food",
        detail: "Take learned shortcuts only when they cannot skip a meal.",
      },
      {
        index: "03",
        title: "Remember",
        detail: "Carry useful action values into the next run and visit.",
      },
    ],
    [],
  );

  function resetRun() {
    setWorld((current) => startNextRun(current, Math.random));
  }

  function forgetLearning() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // The reset still applies to in-memory learning.
    }
    const brain = createBrain();
    setWorld({ brain, game: createInitialGame(1, Math.random) });
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#game" aria-label="Survival Loop home">
          <span className="brand-mark" aria-hidden="true">
            SL
          </span>
          <span>Survival Loop</span>
        </a>
        <div className="topbar-status" aria-live="polite">
          <span className="live-dot" />
          Autonomous agent · {statusLabel}
        </div>
      </header>

      <section className="hero" id="game">
        <div className="hero-copy">
          <p className="eyebrow">
            <span>Experiment 07</span>
            <span className="eyebrow-rule" />
            <span>Self-preserving AI</span>
          </p>
          <h1>
            The snake that
            <br />
            <em>refuses to die.</em>
          </h1>
          <p className="hero-intro">
            This agent learns which shortcuts pay off, but a mathematical safety
            rail vetoes any move that could trap it. Watch memory turn into
            instinct.
          </p>

          <div className="objective-list" aria-label="Agent objectives">
            {objectiveRows.map((objective) => (
              <div className="objective" key={objective.index}>
                <span>{objective.index}</span>
                <div>
                  <h2>{objective.title}</h2>
                  <p>{objective.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="game-column">
          <div className="game-frame">
            <div className="frame-bar">
              <span>Live cognition map</span>
              <span>
                {GRID_SIZE}×{GRID_SIZE} habitat
              </span>
            </div>
            <div className="canvas-wrap">
              <canvas
                ref={canvasRef}
                width={720}
                height={720}
                data-testid="survival-canvas"
                role="img"
                aria-label={`Autonomous snake with ${world.game.snake.length} segments, score ${world.game.score}, currently ${statusLabel.toLowerCase()}`}
              />
              <div className="canvas-badge">
                <span className="pulse-dot" />
                {statusLabel}
              </div>
            </div>
            <div className="frame-footer">
              <span>Food</span>
              <strong>{String(world.game.score).padStart(2, "0")}</strong>
              <span>Body</span>
              <strong>
                {world.game.snake.length}/{CELL_COUNT}
              </strong>
              <span>Run</span>
              <strong>#{String(world.game.generation).padStart(2, "0")}</strong>
            </div>
          </div>

          <div className="controls" aria-label="Simulation controls">
            <button
              className="primary-control"
              type="button"
              onClick={() => setPaused((value) => !value)}
            >
              <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
              {paused ? "Resume agent" : "Pause agent"}
            </button>
            <div className="speed-control">
              <span>Tempo</span>
              <div>
                {SPEEDS.map((speed, index) => (
                  <button
                    type="button"
                    key={speed.label}
                    className={index === speedIndex ? "active" : ""}
                    aria-pressed={index === speedIndex}
                    onClick={() => setSpeedIndex(index)}
                  >
                    {speed.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              className="icon-control"
              type="button"
              aria-label={soundOn ? "Mute sounds" : "Enable sounds"}
              aria-pressed={soundOn}
              onClick={() => setSoundOn((value) => !value)}
            >
              {soundOn ? "Sound on" : "Sound off"}
            </button>
          </div>
        </div>

        <aside className="mind-panel" aria-label="AI telemetry">
          <div className="panel-heading">
            <span>Agent mind</span>
            <span className="memory-status">{memoryLabel}</span>
          </div>

          <div className="decision-card">
            <p>Current thought</p>
            <h2>{actionLabel(world.game.lastDecision.action)}</h2>
            <p className="decision-reason">{world.game.lastDecision.reason}</p>
            <div className="confidence">
              <span>Survival confidence</span>
              <strong>{world.game.lastDecision.confidence.toFixed(1)}%</strong>
            </div>
            <div className="confidence-track">
              <span
                style={{ width: `${world.game.lastDecision.confidence}%` }}
              />
            </div>
          </div>

          <dl className="stats">
            <div>
              <dt>Safe options</dt>
              <dd>{world.game.lastDecision.options}</dd>
            </div>
            <div>
              <dt>Cells advanced</dt>
              <dd>+{world.game.lastDecision.advance}</dd>
            </div>
            <div>
              <dt>Learned states</dt>
              <dd>{learnedStates}</dd>
            </div>
            <div>
              <dt>Training steps</dt>
              <dd>{formatNumber(world.brain.trainingSteps)}</dd>
            </div>
            <div>
              <dt>Lifetime meals</dt>
              <dd>{formatNumber(world.brain.meals)}</dd>
            </div>
            <div>
              <dt>Best run</dt>
              <dd>{world.brain.bestScore}</dd>
            </div>
          </dl>

          <div className="learning-meter">
            <div>
              <span>Exploration</span>
              <strong>{(world.brain.epsilon * 100).toFixed(1)}%</strong>
            </div>
            <div className="meter-track">
              <span style={{ width: `${world.brain.epsilon * 400}%` }} />
            </div>
            <p>
              Exploration fades as reliable choices accumulate. Unsafe actions
              are never explored.
            </p>
          </div>

          <div className="panel-actions">
            <button type="button" onClick={resetRun}>
              New run
            </button>
            <button type="button" onClick={forgetLearning}>
              Forget learning
            </button>
          </div>
        </aside>
      </section>

      <section className="proof-strip" aria-label="Survival architecture">
        <div>
          <p>Why it survives</p>
          <h2>A learner inside a guardian.</h2>
        </div>
        <div className="proof-item">
          <span>Invariant</span>
          <strong>Tail boundary locked</strong>
          <p>Every accepted move remains ahead of the head and behind the tail.</p>
        </div>
        <div className="proof-item">
          <span>Fallback</span>
          <strong>Hamiltonian cycle</strong>
          <p>A complete route visits every cell without self-intersection.</p>
        </div>
        <div className="proof-item">
          <span>Memory</span>
          <strong>Persistent Q-values</strong>
          <p>Useful shortcuts are reinforced and saved on this device.</p>
        </div>
        <div className="proof-progress">
          <span style={{ width: `${fullness}%` }} />
        </div>
      </section>

      <footer>
        <span>Survival Loop / autonomous systems study</span>
        <span>
          {activeSpeed.label} tempo · reward avg{" "}
          {world.brain.averageReward.toFixed(2)}
        </span>
      </footer>
    </main>
  );
}
