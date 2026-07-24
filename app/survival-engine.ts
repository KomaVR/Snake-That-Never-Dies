export const GRID_SIZE = 12;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;

export type Point = { x: number; y: number };
export type GameStatus = "running" | "won" | "dead";
export type ActionKind = "CYCLE" | "SHORTCUT" | "DEEP_SHORTCUT";

export type Candidate = {
  point: Point;
  advance: number;
  eats: boolean;
  reachable: number;
  tailReachable: boolean;
  kind: ActionKind;
  score: number;
};

export type Decision = {
  action: ActionKind;
  advance: number;
  options: number;
  confidence: number;
  reason: string;
  explored: boolean;
  learnedValue: number;
};

export type GameState = {
  snake: Point[];
  food: Point;
  score: number;
  steps: number;
  generation: number;
  status: GameStatus;
  lastDecision: Decision;
};

export type Brain = {
  q: Record<string, Partial<Record<ActionKind, number>>>;
  epsilon: number;
  trainingSteps: number;
  meals: number;
  deaths: number;
  wins: number;
  bestScore: number;
  averageReward: number;
};

export type World = {
  game: GameState;
  brain: Brain;
};

const DIRECTIONS: Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

const pointKey = (point: Point) => `${point.x},${point.y}`;
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

export function buildHamiltonianCycle(size = GRID_SIZE): Point[] {
  if (size < 2 || size % 2 !== 0) {
    throw new Error("The survival cycle requires an even grid size.");
  }

  const cycle: Point[] = [];

  for (let x = 0; x < size; x += 1) cycle.push({ x, y: 0 });

  for (let y = 1; y < size; y += 1) {
    if (y % 2 === 1) {
      for (let x = size - 1; x >= 1; x -= 1) cycle.push({ x, y });
    } else {
      for (let x = 1; x < size; x += 1) cycle.push({ x, y });
    }
  }

  cycle.push({ x: 0, y: size - 1 });
  for (let y = size - 2; y >= 1; y -= 1) cycle.push({ x: 0, y });

  return cycle;
}

export const HAMILTONIAN_CYCLE = buildHamiltonianCycle();
const CYCLE_INDEX = new Map(
  HAMILTONIAN_CYCLE.map((point, index) => [pointKey(point), index]),
);

export function cycleIndexOf(point: Point) {
  const index = CYCLE_INDEX.get(pointKey(point));
  if (index === undefined) throw new Error("Point is outside the survival cycle.");
  return index;
}

function cycleDistance(from: number, to: number) {
  return (to - from + CELL_COUNT) % CELL_COUNT;
}

export function createSeededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function createBrain(): Brain {
  return {
    q: {},
    epsilon: 0.16,
    trainingSteps: 0,
    meals: 0,
    deaths: 0,
    wins: 0,
    bestScore: 0,
    averageReward: 0,
  };
}

export function restoreBrain(value: unknown): Brain {
  const fallback = createBrain();
  if (!value || typeof value !== "object") return fallback;

  const source = value as Partial<Brain>;
  const q: Brain["q"] = {};

  if (source.q && typeof source.q === "object") {
    Object.entries(source.q)
      .slice(0, 500)
      .forEach(([state, actions]) => {
        if (!actions || typeof actions !== "object") return;
        const clean: Partial<Record<ActionKind, number>> = {};
        (["CYCLE", "SHORTCUT", "DEEP_SHORTCUT"] as const).forEach((action) => {
          const candidate = actions[action];
          if (typeof candidate === "number" && Number.isFinite(candidate)) {
            clean[action] = Math.max(-250, Math.min(250, candidate));
          }
        });
        q[state] = clean;
      });
  }

  const finite = (candidate: unknown, defaultValue: number) =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? candidate
      : defaultValue;

  return {
    q,
    epsilon: Math.max(0.012, Math.min(0.25, finite(source.epsilon, 0.16))),
    trainingSteps: Math.max(0, finite(source.trainingSteps, 0)),
    meals: Math.max(0, finite(source.meals, 0)),
    deaths: Math.max(0, finite(source.deaths, 0)),
    wins: Math.max(0, finite(source.wins, 0)),
    bestScore: Math.max(0, finite(source.bestScore, 0)),
    averageReward: finite(source.averageReward, 0),
  };
}

function placeFood(snake: Point[], random: () => number): Point {
  const occupied = new Set(snake.map(pointKey));
  const open = HAMILTONIAN_CYCLE.filter((point) => !occupied.has(pointKey(point)));
  return open[Math.floor(random() * open.length)] ?? { x: 0, y: 0 };
}

export function createInitialGame(
  generation = 1,
  random: () => number = Math.random,
): GameState {
  const headIndex = 8;
  const snake = Array.from({ length: 4 }, (_, offset) => {
    const index = (headIndex - offset + CELL_COUNT) % CELL_COUNT;
    return HAMILTONIAN_CYCLE[index];
  });

  return {
    snake,
    food: placeFood(snake, random),
    score: 0,
    steps: 0,
    generation,
    status: "running",
    lastDecision: {
      action: "CYCLE",
      advance: 1,
      options: 1,
      confidence: 100,
      reason: "Booting the collision-proof survival cycle",
      explored: false,
      learnedValue: 0,
    },
  };
}

function floodReachable(start: Point, snake: Point[]) {
  const blocked = new Set(snake.slice(1).map(pointKey));
  const visited = new Set([pointKey(start)]);
  const queue = [start];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    DIRECTIONS.forEach((direction) => {
      const next = {
        x: current.x + direction.x,
        y: current.y + direction.y,
      };
      const key = pointKey(next);
      if (
        next.x < 0 ||
        next.x >= GRID_SIZE ||
        next.y < 0 ||
        next.y >= GRID_SIZE ||
        blocked.has(key) ||
        visited.has(key)
      ) {
        return;
      }
      visited.add(key);
      queue.push(next);
    });
  }

  return visited.size;
}

function canReachTail(start: Point, snake: Point[]) {
  const tail = snake[snake.length - 1];
  if (samePoint(start, tail)) return true;

  const blocked = new Set(snake.slice(1, -1).map(pointKey));
  const visited = new Set([pointKey(start)]);
  const queue = [start];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const direction of DIRECTIONS) {
      const next = {
        x: current.x + direction.x,
        y: current.y + direction.y,
      };
      const key = pointKey(next);
      if (
        next.x < 0 ||
        next.x >= GRID_SIZE ||
        next.y < 0 ||
        next.y >= GRID_SIZE ||
        blocked.has(key) ||
        visited.has(key)
      ) {
        continue;
      }
      if (samePoint(next, tail)) return true;
      visited.add(key);
      queue.push(next);
    }
  }

  return false;
}

function classifyAdvance(advance: number): ActionKind {
  if (advance === 1) return "CYCLE";
  if (advance <= GRID_SIZE) return "SHORTCUT";
  return "DEEP_SHORTCUT";
}

function simulateSnake(state: GameState, point: Point, eats: boolean) {
  return eats
    ? [point, ...state.snake]
    : [point, ...state.snake.slice(0, -1)];
}

export function getSafeCandidates(state: GameState): Candidate[] {
  if (state.status !== "running") return [];

  const head = state.snake[0];
  const headIndex = cycleIndexOf(head);
  const tailIndex = cycleIndexOf(state.snake[state.snake.length - 1]);
  const appleIndex = cycleIndexOf(state.food);
  const appleGap = cycleDistance(headIndex, appleIndex);
  const tailGap =
    state.snake.length === 1 ? CELL_COUNT : cycleDistance(headIndex, tailIndex);
  const body = new Set(state.snake.map(pointKey));
  const tailKey = pointKey(state.snake[state.snake.length - 1]);

  return DIRECTIONS.flatMap((direction) => {
    const point = {
      x: head.x + direction.x,
      y: head.y + direction.y,
    };

    if (
      point.x < 0 ||
      point.x >= GRID_SIZE ||
      point.y < 0 ||
      point.y >= GRID_SIZE
    ) {
      return [];
    }

    const candidateIndex = cycleIndexOf(point);
    const advance = cycleDistance(headIndex, candidateIndex);
    const eats = samePoint(point, state.food);
    const hitsBody = body.has(pointKey(point));
    const tailWillMove = !eats && pointKey(point) === tailKey;

    if (advance === 0 || (hitsBody && !tailWillMove)) return [];

    // Any accepted move stays inside the free forward arc. That preserves the
    // non-crossing cycle order even when the learner takes a shortcut.
    const maximumAdvance = tailGap - (eats ? 1 : 0);
    if (advance > maximumAdvance) return [];

    // A forward move may approach a meal, but it may never leap over one.
    if (appleGap > 0 && advance > appleGap) return [];

    const nextSnake = simulateSnake(state, point, eats);
    return [
      {
        point,
        advance,
        eats,
        reachable: floodReachable(point, nextSnake),
        tailReachable: canReachTail(point, nextSnake),
        kind: classifyAdvance(advance),
        score: 0,
      },
    ];
  });
}

function stateKey(state: GameState, candidates: Candidate[]) {
  const headIndex = cycleIndexOf(state.snake[0]);
  const appleIndex = cycleIndexOf(state.food);
  const appleGap = cycleDistance(headIndex, appleIndex);
  const fullness = state.snake.length / CELL_COUNT;
  const lengthBand =
    fullness < 0.18
      ? "small"
      : fullness < 0.48
        ? "medium"
        : fullness < 0.78
          ? "large"
          : "full";
  const foodBand =
    appleGap <= 4 ? "near" : appleGap <= GRID_SIZE * 2 ? "mid" : "far";
  const optionBand = Math.min(3, candidates.length);
  return `${lengthBand}|${foodBand}|options:${optionBand}`;
}

function qValue(brain: Brain, key: string, action: ActionKind) {
  return brain.q[key]?.[action] ?? 0;
}

function scoreCandidates(
  state: GameState,
  brain: Brain,
  candidates: Candidate[],
) {
  const key = stateKey(state, candidates);
  const freeCells = Math.max(1, CELL_COUNT - state.snake.length);

  return candidates.map((candidate) => {
    const spaceRatio = Math.min(1, candidate.reachable / freeCells);
    const learned = qValue(brain, key, candidate.kind);
    const score =
      candidate.advance * 0.72 +
      spaceRatio * 4 +
      (candidate.tailReachable ? 3.5 : -2) +
      (candidate.eats ? 55 : 0) +
      learned * 7;
    return { ...candidate, score };
  });
}

function chooseCandidate(
  state: GameState,
  brain: Brain,
  candidates: Candidate[],
  random: () => number,
) {
  const scored = scoreCandidates(state, brain, candidates).sort(
    (a, b) => b.score - a.score,
  );
  const explored = scored.length > 1 && random() < brain.epsilon;
  const selected = explored
    ? scored[Math.floor(random() * scored.length)]
    : scored[0];

  return { selected, explored, key: stateKey(state, candidates) };
}

function reasonFor(candidate: Candidate, options: number) {
  if (candidate.eats) return "Meal secured without crossing the tail boundary";
  if (candidate.kind === "DEEP_SHORTCUT")
    return "Learned shortcut clears distance while the escape arc stays open";
  if (candidate.kind === "SHORTCUT")
    return "Safe shortcut improves food approach and preserves future space";
  if (options === 1)
    return "Guardian route engaged: the cycle is the only admissible move";
  return "Conservative cycle step keeps every future cell reachable";
}

function updateQ(
  brain: Brain,
  key: string,
  action: ActionKind,
  reward: number,
  nextKey: string,
  nextCandidates: Candidate[],
) {
  const alpha = 0.17;
  const gamma = 0.93;
  const current = qValue(brain, key, action);
  const future =
    nextCandidates.length === 0
      ? 0
      : Math.max(
          ...nextCandidates.map((candidate) =>
            qValue(brain, nextKey, candidate.kind),
          ),
        );
  const updated = current + alpha * (reward + gamma * future - current);

  return {
    ...brain.q,
    [key]: {
      ...brain.q[key],
      [action]: updated,
    },
  };
}

export function stepWorld(
  world: World,
  random: () => number = Math.random,
): World {
  const { game, brain } = world;
  if (game.status !== "running") return world;

  const candidates = getSafeCandidates(game);
  if (candidates.length === 0) {
    return {
      game: {
        ...game,
        status: "dead",
        lastDecision: {
          action: "CYCLE",
          advance: 0,
          options: 0,
          confidence: 0,
          reason: "No admissible route remained",
          explored: false,
          learnedValue: 0,
        },
      },
      brain: { ...brain, deaths: brain.deaths + 1 },
    };
  }

  const { selected, explored, key } = chooseCandidate(
    game,
    brain,
    candidates,
    random,
  );
  const nextSnake = simulateSnake(game, selected.point, selected.eats);
  const won = nextSnake.length === CELL_COUNT;
  const nextGame: GameState = {
    ...game,
    snake: nextSnake,
    food: selected.eats && !won ? placeFood(nextSnake, random) : game.food,
    score: game.score + (selected.eats ? 1 : 0),
    steps: game.steps + 1,
    status: won ? "won" : "running",
    lastDecision: {
      action: selected.kind,
      advance: selected.advance,
      options: candidates.length,
      confidence: Math.min(
        100,
        96 +
          Math.min(
            4,
            selected.reachable / Math.max(1, CELL_COUNT - nextSnake.length),
          ),
      ),
      reason: reasonFor(selected, candidates.length),
      explored,
      learnedValue: qValue(brain, key, selected.kind),
    },
  };

  const nextCandidates = won ? [] : getSafeCandidates(nextGame);
  const nextKey = won ? "terminal" : stateKey(nextGame, nextCandidates);
  const spaceRatio =
    selected.reachable / Math.max(1, CELL_COUNT - nextSnake.length);
  const reward =
    0.08 +
    selected.advance * 0.025 +
    Math.min(0.08, spaceRatio * 0.04) +
    (selected.eats ? 24 : 0) +
    (won ? 250 : 0);
  const q = updateQ(
    brain,
    key,
    selected.kind,
    reward,
    nextKey,
    nextCandidates,
  );
  const trainingSteps = brain.trainingSteps + 1;
  const averageReward =
    brain.averageReward +
    (reward - brain.averageReward) / Math.min(trainingSteps, 500);

  return {
    game: nextGame,
    brain: {
      ...brain,
      q,
      epsilon: Math.max(0.012, brain.epsilon * 0.9993),
      trainingSteps,
      meals: brain.meals + (selected.eats ? 1 : 0),
      wins: brain.wins + (won ? 1 : 0),
      bestScore: Math.max(brain.bestScore, nextGame.score),
      averageReward,
    },
  };
}

export function startNextRun(
  world: World,
  random: () => number = Math.random,
): World {
  return {
    brain: world.brain,
    game: createInitialGame(world.game.generation + 1, random),
  };
}

export function validateSurvivalInvariant(state: GameState) {
  const occupied = new Set<string>();

  for (let index = 0; index < state.snake.length; index += 1) {
    const point = state.snake[index];
    if (
      point.x < 0 ||
      point.x >= GRID_SIZE ||
      point.y < 0 ||
      point.y >= GRID_SIZE ||
      occupied.has(pointKey(point))
    ) {
      return false;
    }
    occupied.add(pointKey(point));

    if (index > 0) {
      const previous = state.snake[index - 1];
      if (Math.abs(previous.x - point.x) + Math.abs(previous.y - point.y) !== 1) {
        return false;
      }
    }
  }

  return true;
}
