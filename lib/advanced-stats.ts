/**
 * Advanced (admin-only) stats engine.
 *
 * Everything in here is pure: the server ships a compact payload of every point
 * once, and the client recomputes derived stats whenever a control changes. That
 * keeps the admin screen instant without a round-trip per toggle.
 *
 * The two ideas that drive the whole file:
 *
 *  1. **Expectation.** A raw win rate is not a fair measure of a player, because
 *     O points convert far more often than D points and some games are simply
 *     harder than others. So every point carries an *expected* conversion, and a
 *     player is measured by how far above it they land (PAA — points above
 *     average).
 *
 *  2. **Tough games.** Game difficulty is scored from our own conversion rate in
 *     that game relative to the rest of the season (a z-score). `adjusted` mode
 *     sets each point's expectation from its own game, which neutralises
 *     difficulty entirely; `noOutliers` mode instead drops the statistical
 *     outliers. Admins can override the label or exclude a game outright.
 */

export type Difficulty = "EASY" | "EVEN" | "TOUGH" | "OUT_OF_REACH";

/** How tough games are folded into the numbers. */
export type Mode = "raw" | "adjusted" | "noOutliers";

export type DifficultyFilter = Difficulty | "ALL";

export type Role = "HANDLER" | "CUTTER" | "HYBRID";

export const ROLES: Role[] = ["HANDLER", "CUTTER", "HYBRID"];

export const ROLE_LABEL: Record<Role, string> = {
  HANDLER: "Handler",
  CUTTER: "Cutter",
  HYBRID: "Hybrid",
};

/** Single letter, for the dense table column and line-shape keys. */
export const ROLE_SHORT: Record<Role, string> = {
  HANDLER: "H",
  CUTTER: "C",
  HYBRID: "Y",
};

export const ROLE_TONE: Record<Role, string> = {
  HANDLER: "bg-blue-100 text-blue-800",
  CUTTER: "bg-green-100 text-green-800",
  HYBRID: "bg-purple-100 text-purple-800",
};

/**
 * Below this many *peers* (the player themselves excluded), a role-relative
 * number is marked provisional rather than hidden. A five-handler squad leaves
 * four peers, which is enough to be suggestive and not enough to be evidence.
 */
export const MIN_ROLE_PEERS = 5;

export type PayloadPlayer = {
  id: string;
  name: string;
  number: number | null;
  role: Role;
};

export type PayloadTournament = { id: string; name: string; date: string };

export type PayloadGame = {
  id: string;
  tournamentIndex: number;
  opponent: string;
  scoreUs: number;
  scoreThem: number;
  manualDifficulty: Difficulty | null;
  excluded: boolean;
};

/**
 * A point, packed as a flat number array to keep the payload small:
 * `[gameIndex, ourOffense, result, goalIndex, assistIndex, callahan,
 *   hockeyAssistIndex, ...onFieldPlayerIndexes]`
 *
 * Player indexes are positions in `StatsPayload.players`; `-1` means none.
 * Blocks and turnovers are stored separately since they are sparse.
 */
export type PackedPoint = number[];

export type StatsPayload = {
  players: PayloadPlayer[];
  tournaments: PayloadTournament[];
  games: PayloadGame[];
  points: PackedPoint[];
  /** `[pointIndex, playerIndex, blocks]` for every non-zero block tally. */
  blocks: number[][];
  /** `[pointIndex, playerIndex, turnovers]` for every non-zero giveaway tally. */
  turnovers: number[][];
};

export const RESULT_LOST = 0;
export const RESULT_WON = 1;
export const RESULT_UNDECIDED = -1;

const P_GAME = 0;
const P_OFFENSE = 1;
const P_RESULT = 2;
const P_GOAL = 3;
const P_ASSIST = 4;
const P_CALLAHAN = 5;
const P_HOCKEY_ASSIST = 6;
const P_PLAYERS = 7;

/** A game needs at least this many decided points before we judge its difficulty. */
export const MIN_GAME_POINTS_FOR_DIFFICULTY = 4;

/** z-score of our conversion below/above which a game reads as tough/easy. */
const TOUGH_Z = -0.6;
const EASY_Z = 0.6;

/** z-score beyond which a game counts as a statistical outlier. */
const OUTLIER_Z = 1.25;

/**
 * A loss is "out of reach" when we were beaten by this many goals *and* took no
 * more than this share of the points — 1-12 and 3-13 qualify, 8-11 and 5-13
 * don't. Both conditions matter: the margin catches the thrashing, the share
 * stops a long high-scoring loss from being mistaken for one.
 */
const OUT_OF_REACH_MARGIN = 5;
const OUT_OF_REACH_SHARE = 0.25;

/** Minimum sample before a pair's "without" split is trustworthy enough to show. */
export const MIN_WITHOUT_POINTS = 3;

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let total = 0;
  for (const x of xs) total += x;
  return total / xs.length;
}

function stdev(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  let total = 0;
  for (const x of xs) total += (x - m) * (x - m);
  return Math.sqrt(total / xs.length);
}

function ratio(num: number, denom: number): number | null {
  return denom > 0 ? num / denom : null;
}

export function pointGameIndex(pt: PackedPoint): number {
  return pt[P_GAME];
}

export function pointIsOffense(pt: PackedPoint): boolean {
  return pt[P_OFFENSE] === 1;
}

export function pointResult(pt: PackedPoint): number {
  return pt[P_RESULT];
}

export function pointPlayers(pt: PackedPoint): number[] {
  return pt.slice(P_PLAYERS);
}

// ---------------------------------------------------------------------------
// Game difficulty
// ---------------------------------------------------------------------------

export type GameAnalysis = {
  index: number;
  id: string;
  tournamentIndex: number;
  opponent: string;
  scoreUs: number;
  scoreThem: number;
  pointsPlayed: number;
  decided: number;
  wins: number;
  oDecided: number;
  oWins: number;
  dDecided: number;
  dWins: number;
  conversion: number | null;
  oConversion: number | null;
  dConversion: number | null;
  /** How far this game's conversion sits from the season mean, in standard deviations. */
  z: number | null;
  autoDifficulty: Difficulty | null;
  manualDifficulty: Difficulty | null;
  /** Manual override when set, otherwise the auto-detected label. */
  difficulty: Difficulty | null;
  isOutlier: boolean;
  excluded: boolean;
};

/**
 * Scores every game's difficulty from our own point conversion in it, measured
 * against the rest of the (non-excluded) games.
 *
 * Deliberately computed across *all* games regardless of the active filters, so
 * a game's label doesn't shift around as the admin changes the tournament
 * filter.
 */
export function analyzeGames(payload: StatsPayload): GameAnalysis[] {
  const analyses: GameAnalysis[] = payload.games.map(
    (g: PayloadGame, i: number) => ({
      index: i,
      id: g.id,
      tournamentIndex: g.tournamentIndex,
      opponent: g.opponent,
      scoreUs: g.scoreUs,
      scoreThem: g.scoreThem,
      pointsPlayed: 0,
      decided: 0,
      wins: 0,
      oDecided: 0,
      oWins: 0,
      dDecided: 0,
      dWins: 0,
      conversion: null,
      oConversion: null,
      dConversion: null,
      z: null,
      autoDifficulty: null,
      manualDifficulty: g.manualDifficulty,
      difficulty: g.manualDifficulty,
      isOutlier: false,
      excluded: g.excluded,
    }),
  );

  for (const pt of payload.points) {
    const game = analyses[pointGameIndex(pt)];
    if (!game) continue;
    game.pointsPlayed++;
    const result = pointResult(pt);
    if (result === RESULT_UNDECIDED) continue;
    const won = result === RESULT_WON;
    game.decided++;
    if (won) game.wins++;
    if (pointIsOffense(pt)) {
      game.oDecided++;
      if (won) game.oWins++;
    } else {
      game.dDecided++;
      if (won) game.dWins++;
    }
  }

  for (const g of analyses) {
    g.conversion = ratio(g.wins, g.decided);
    g.oConversion = ratio(g.oWins, g.oDecided);
    g.dConversion = ratio(g.dWins, g.dDecided);
  }

  const rated = analyses.filter(
    (g: GameAnalysis) =>
      !g.excluded &&
      g.decided >= MIN_GAME_POINTS_FOR_DIFFICULTY &&
      g.conversion !== null,
  );
  const conversions = rated.map((g: GameAnalysis) => g.conversion as number);
  const m = mean(conversions);
  const sd = stdev(conversions, m);

  for (const g of rated) {
    const z = sd > 0 ? ((g.conversion as number) - m) / sd : 0;
    g.z = z;
    g.autoDifficulty = z <= TOUGH_Z ? "TOUGH" : z >= EASY_Z ? "EASY" : "EVEN";
    g.isOutlier = Math.abs(z) >= OUTLIER_Z;
  }

  // Out of reach is judged on the scoreline rather than against the season, so
  // 3-13 reads the same way in a soft season and a brutal one. That also means
  // it applies to games with too few recorded points to have earned a z-score,
  // and it outranks the z-based label when both have an opinion.
  for (const g of analyses) {
    if (isOutOfReach(g)) g.autoDifficulty = "OUT_OF_REACH";
    // A manual label always wins; auto fills in when the admin hasn't spoken.
    g.difficulty = g.manualDifficulty ?? g.autoDifficulty;
  }

  return analyses;
}

/** True for lopsided *losses* only — a 13-3 win stays Easy. */
function isOutOfReach(g: GameAnalysis): boolean {
  // The final score is what a coach reads, so prefer it; fall back to the
  // recorded points when a game's score was never filled in.
  let us = g.scoreUs;
  let them = g.scoreThem;
  if (us + them === 0) {
    if (g.decided === 0) return false;
    us = g.wins;
    them = g.decided - g.wins;
  }
  const total = us + them;
  if (total === 0) return false;
  return them - us >= OUT_OF_REACH_MARGIN && us / total <= OUT_OF_REACH_SHARE;
}

// ---------------------------------------------------------------------------
// Point selection + expectation
// ---------------------------------------------------------------------------

export type StatsOptions = {
  /** `null` means every tournament. */
  tournamentId: string | null;
  /**
   * Hand-picked games. `null` means every game that passes the other filters —
   * which is not the same as listing them all, since a null set keeps following
   * the tournament and difficulty filters instead of freezing today's answer.
   */
  gameIds: string[] | null;
  mode: Mode;
  difficulty: DifficultyFilter;
  minPoints: number;
};

export const DEFAULT_OPTIONS: StatsOptions = {
  tournamentId: null,
  gameIds: null,
  mode: "adjusted",
  difficulty: "ALL",
  minPoints: 10,
};

/** Which games feed the numbers, given the active filters. */
export function selectGames(
  payload: StatsPayload,
  analyses: GameAnalysis[],
  opts: StatsOptions,
): boolean[] {
  const tournamentIndex =
    opts.tournamentId === null
      ? -1
      : payload.tournaments.findIndex(
          (t: PayloadTournament) => t.id === opts.tournamentId,
        );

  // An explicit pick is an extra gate, not a replacement for the others: a game
  // the admin excluded outright still stays out even if it's ticked.
  const picked = opts.gameIds === null ? null : new Set<string>(opts.gameIds);

  return analyses.map((g: GameAnalysis) => {
    if (g.excluded) return false;
    if (picked !== null && !picked.has(g.id)) return false;
    if (tournamentIndex >= 0 && g.tournamentIndex !== tournamentIndex) {
      return false;
    }
    if (opts.difficulty !== "ALL" && g.difficulty !== opts.difficulty) {
      return false;
    }
    if (opts.mode === "noOutliers" && g.isOutlier) return false;
    return true;
  });
}

/**
 * Expected conversion for a point, i.e. the bar a player has to clear on it.
 *
 * - `adjusted` uses the point's own game, so a tough game's lower conversion
 *   becomes the yardstick and difficulty cancels out.
 * - `raw` and `noOutliers` use one season-wide bar across the selected games.
 *
 * Both split O from D, since holding is a far easier job than breaking.
 */
function buildExpectation(
  payload: StatsPayload,
  analyses: GameAnalysis[],
  included: boolean[],
  mode: Mode,
): (pt: PackedPoint) => number {
  let oWins = 0;
  let oDecided = 0;
  let dWins = 0;
  let dDecided = 0;
  for (let i = 0; i < analyses.length; i++) {
    if (!included[i]) continue;
    oWins += analyses[i].oWins;
    oDecided += analyses[i].oDecided;
    dWins += analyses[i].dWins;
    dDecided += analyses[i].dDecided;
  }
  const globalO = ratio(oWins, oDecided);
  const globalD = ratio(dWins, dDecided);
  const globalAll = ratio(oWins + dWins, oDecided + dDecided) ?? 0.5;

  if (mode !== "adjusted") {
    return (pt: PackedPoint) =>
      (pointIsOffense(pt) ? globalO : globalD) ?? globalAll;
  }

  return (pt: PackedPoint) => {
    const g = analyses[pointGameIndex(pt)];
    if (!g) return globalAll;
    const perGame = pointIsOffense(pt) ? g.oConversion : g.dConversion;
    // Fall back through game-wide, then season-wide, when a split is empty.
    return (
      perGame ??
      g.conversion ??
      (pointIsOffense(pt) ? globalO : globalD) ??
      globalAll
    );
  };
}

// ---------------------------------------------------------------------------
// Player stats
// ---------------------------------------------------------------------------

/**
 * A player's metrics restated as a gap against peers in the same role, so a
 * handler's 8% involvement reads as strong instead of looking poor next to a
 * cutter's 25%. Each value is the player minus the mean of their peers, with
 * the player themselves left out of that mean — with peer groups this small,
 * including yourself drags every number toward zero.
 */
export type RoleRelative = {
  conversion: number | null;
  impact: number | null;
  paaPer10: number | null;
  holdPct: number | null;
  breakPct: number | null;
  involvement: number | null;
  /** Gap on giveaways per point. Unlike the rest, less is better here. */
  turnoverRate: number | null;
};

const EMPTY_ROLE_RELATIVE: RoleRelative = {
  conversion: null,
  impact: null,
  paaPer10: null,
  holdPct: null,
  breakPct: null,
  involvement: null,
  turnoverRate: null,
};

/** A stat-derived label, carrying the numbers that earned it. */
export type Archetype = {
  id: string;
  label: string;
  detail: string;
  /** Only the strongest label from each family is shown, to avoid synonyms. */
  family: ArchetypeFamily;
  tone: ArchetypeTone;
};

export type ArchetypeFamily =
  | "scoring"
  | "efficiency"
  | "conversion"
  | "line"
  | "load"
  | "situational"
  | "chemistry"
  | "consistency"
  | "trajectory"
  | "defence"
  /** Work in the scoring chain behind the assist. */
  | "chain"
  /** Care of the disc. */
  | "possession";

/** "watch" labels are diagnostic rather than complimentary. */
export type ArchetypeTone = "positive" | "neutral" | "watch";

export type PlayerAdvanced = {
  id: string;
  name: string;
  number: number | null;
  role: Role;
  /** Metrics as a gap against same-role peers. */
  roleRelative: RoleRelative;
  /** Peers in the same role that cleared the minimum-points bar. */
  rolePeers: number;
  /** True when the peer group is too thin to lean on. */
  roleProvisional: boolean;
  archetypes: Archetype[];
  gamesPlayed: number;
  pointsPlayed: number;
  oPoints: number;
  dPoints: number;
  decided: number;
  wins: number;
  losses: number;
  /** Team conversion with this player on the field. */
  conversion: number | null;
  holds: number;
  holdOpps: number;
  holdPct: number | null;
  breaks: number;
  breakOpps: number;
  breakPct: number | null;
  goals: number;
  assists: number;
  /** Passes thrown to the assist — the touch before the score. */
  hockeyAssists: number;
  blocks: number;
  turnovers: number;
  oTurnovers: number;
  dTurnovers: number;
  callahans: number;
  /** Blocks per D point — defensive work rate. */
  blocksPerDPoint: number | null;
  /** Giveaways per point played. Lower is better. */
  turnoverRate: number | null;
  /** Share of on-field points where this player scored or assisted. */
  involvement: number | null;
  /**
   * Involvement widened to include hockey assists: scoring-chain credits per
   * point played. A rate rather than a share — a give-and-go goal credits the
   * same player twice on one point.
   */
  chainInvolvement: number | null;
  /** Conversion when the game was tough or out of reach. */
  toughDecided: number;
  toughConversion: number | null;
  /** Conversion when the game was easy. */
  easyDecided: number;
  easyConversion: number | null;
  /** Spread of their per-game conversion — low means dependable. */
  consistency: number | null;
  /** Games with enough points for the spread to mean anything. */
  gamesWithSample: number;
  /** Later-half minus earlier-half conversion across the games they played. */
  trajectory: number | null;
  /** Mean chemistry across partners with a real sample apart. */
  avgSynergy: number | null;
  synergyPartners: number;
  /** Share of the points in their games that they were on the field for. */
  loadShare: number | null;
  /** Share of their points played on offence. */
  oShare: number | null;
  /** Points above average: total conversion earned over expectation. */
  paa: number;
  /** PAA scaled to a per-10-points rate, so sample size doesn't dominate. */
  paaPer10: number | null;
  /** Team conversion in the same games while this player sat. */
  offConversion: number | null;
  /**
   * On-field conversion minus off-field conversion, in percentage points.
   * Only counts games the player actually appeared in, which makes it
   * inherently robust to game difficulty.
   */
  impact: number | null;
  plusMinus: number;
};

type PlayerTally = {
  games: Set<number>;
  /** Per-game record, for the consistency spread and the trajectory split. */
  perGame: Map<number, { decided: number; wins: number; paa: number }>;
  toughDecided: number;
  toughWins: number;
  easyDecided: number;
  easyWins: number;
  pointsPlayed: number;
  oPoints: number;
  dPoints: number;
  decided: number;
  wins: number;
  losses: number;
  holds: number;
  holdOpps: number;
  breaks: number;
  breakOpps: number;
  goals: number;
  assists: number;
  hockeyAssists: number;
  blocks: number;
  turnovers: number;
  oTurnovers: number;
  dTurnovers: number;
  callahans: number;
  paa: number;
};

function emptyPlayerTally(): PlayerTally {
  return {
    games: new Set<number>(),
    perGame: new Map<number, { decided: number; wins: number; paa: number }>(),
    toughDecided: 0,
    toughWins: 0,
    easyDecided: 0,
    easyWins: 0,
    pointsPlayed: 0,
    oPoints: 0,
    dPoints: 0,
    decided: 0,
    wins: 0,
    losses: 0,
    holds: 0,
    holdOpps: 0,
    breaks: 0,
    breakOpps: 0,
    goals: 0,
    assists: 0,
    hockeyAssists: 0,
    blocks: 0,
    turnovers: 0,
    oTurnovers: 0,
    dTurnovers: 0,
    callahans: 0,
    paa: 0,
  };
}

/**
 * How a line performed given the role make-up on the field, rather than who
 * was on it. Answers "what shape of line works" instead of "who is good".
 */
export type ShapeStats = {
  key: string;
  handlers: number;
  cutters: number;
  hybrids: number;
  points: number;
  decided: number;
  wins: number;
  conversion: number | null;
  oDecided: number;
  oWins: number;
  oConversion: number | null;
  dDecided: number;
  dWins: number;
  dConversion: number | null;
};

export type ComputedStats = {
  players: PlayerAdvanced[];
  pairs: PairAdvanced[];
  analyses: GameAnalysis[];
  includedGames: boolean[];
  /** Full handler/cutter/hybrid make-ups, richest sample first. */
  shapes: ShapeStats[];
  /** The same points rolled up by handler count only, which stays legible. */
  handlerShapes: ShapeStats[];
  /** Games contributing to the numbers after filtering. */
  gameCount: number;
  pointCount: number;
  /** Season-wide conversion over the selected points, for context. */
  conversion: number | null;
};

export function computeStats(
  payload: StatsPayload,
  opts: StatsOptions,
  analyses: GameAnalysis[] = analyzeGames(payload),
): ComputedStats {
  const included = selectGames(payload, analyses, opts);
  const expectationFor = buildExpectation(payload, analyses, included, opts.mode);

  const playerCount = payload.players.length;
  const tallies: PlayerTally[] = payload.players.map(() => emptyPlayerTally());

  // Per-game team totals over the selected points, used for the on/off split.
  const gameDecided: number[] = analyses.map(() => 0);
  const gameWins: number[] = analyses.map(() => 0);
  const gamePoints: number[] = analyses.map(() => 0);

  // Pair tallies, keyed by the lower-triangle index of the two player indexes.
  const pairPoints = new Map<number, number>();
  const pairDecided = new Map<number, number>();
  const pairWins = new Map<number, number>();
  const pairPaa = new Map<number, number>();

  const pairKey = (a: number, b: number): number =>
    a < b ? a * playerCount + b : b * playerCount + a;

  const bump = (map: Map<number, number>, key: number, by: number): void => {
    map.set(key, (map.get(key) ?? 0) + by);
  };

  // Blocks and turnovers are sparse, so they arrive as side tables keyed by
  // point index.
  const byPoint = (entries: number[][]): Map<number, [number, number][]> => {
    const map = new Map<number, [number, number][]>();
    for (const entry of entries) {
      const [pointIndex, playerIndex, count] = entry;
      const list = map.get(pointIndex);
      if (list) list.push([playerIndex, count]);
      else map.set(pointIndex, [[playerIndex, count]]);
    }
    return map;
  };
  const blocksByPoint = byPoint(payload.blocks);
  const turnoversByPoint = byPoint(payload.turnovers);

  let totalPoints = 0;
  let totalDecided = 0;
  let totalWins = 0;

  const shapeTally = new Map<string, ShapeStats>();
  const roleOf: Role[] = payload.players.map((p: PayloadPlayer) => p.role);

  const ensureShape = (
    key: string,
    handlers: number,
    cutters: number,
    hybrids: number,
  ): ShapeStats => {
    let s = shapeTally.get(key);
    if (!s) {
      s = {
        key,
        handlers,
        cutters,
        hybrids,
        points: 0,
        decided: 0,
        wins: 0,
        conversion: null,
        oDecided: 0,
        oWins: 0,
        oConversion: null,
        dDecided: 0,
        dWins: 0,
        dConversion: null,
      };
      shapeTally.set(key, s);
    }
    return s;
  };

  for (let pi = 0; pi < payload.points.length; pi++) {
    const pt = payload.points[pi];
    const gameIndex = pointGameIndex(pt);
    if (!included[gameIndex]) continue;

    const result = pointResult(pt);
    const decided = result !== RESULT_UNDECIDED;
    const won = result === RESULT_WON;
    const offense = pointIsOffense(pt);
    const expected = expectationFor(pt);
    const value = decided ? (won ? 1 : 0) - expected : 0;
    const onField = pointPlayers(pt);

    totalPoints++;
    gamePoints[gameIndex]++;
    if (decided) {
      totalDecided++;
      gameDecided[gameIndex]++;
      if (won) {
        totalWins++;
        gameWins[gameIndex]++;
      }
    }

    // Out of reach sits at the hard end of the same scale, so it counts as tough.
    const gameDifficulty = analyses[gameIndex]?.difficulty ?? null;
    const isTough =
      gameDifficulty === "TOUGH" || gameDifficulty === "OUT_OF_REACH";
    const isEasy = gameDifficulty === "EASY";

    for (const playerIndex of onField) {
      const t = tallies[playerIndex];
      if (!t) continue;
      t.games.add(gameIndex);
      t.pointsPlayed++;
      if (offense) t.oPoints++;
      else t.dPoints++;
      if (!decided) continue;
      t.decided++;
      t.paa += value;
      if (won) t.wins++;
      else t.losses++;
      if (offense) {
        t.holdOpps++;
        if (won) t.holds++;
      } else {
        t.breakOpps++;
        if (won) t.breaks++;
      }
      if (isTough) {
        t.toughDecided++;
        if (won) t.toughWins++;
      } else if (isEasy) {
        t.easyDecided++;
        if (won) t.easyWins++;
      }
      let per = t.perGame.get(gameIndex);
      if (!per) {
        per = { decided: 0, wins: 0, paa: 0 };
        t.perGame.set(gameIndex, per);
      }
      per.decided++;
      per.paa += value;
      if (won) per.wins++;
    }

    const blocksHere = blocksByPoint.get(pi);
    if (blocksHere) {
      for (const [playerIndex, count] of blocksHere) {
        const t = tallies[playerIndex];
        if (t) t.blocks += count;
      }
    }

    const turnoversHere = turnoversByPoint.get(pi);
    if (turnoversHere) {
      for (const [playerIndex, count] of turnoversHere) {
        const t = tallies[playerIndex];
        if (!t) continue;
        t.turnovers += count;
        if (offense) t.oTurnovers += count;
        else t.dTurnovers += count;
      }
    }

    if (won) {
      const goalIndex = pt[P_GOAL];
      const assistIndex = pt[P_ASSIST];
      const hockeyAssistIndex = pt[P_HOCKEY_ASSIST];
      if (goalIndex >= 0 && tallies[goalIndex]) {
        tallies[goalIndex].goals++;
        if (pt[P_CALLAHAN] === 1) tallies[goalIndex].callahans++;
      }
      if (assistIndex >= 0 && tallies[assistIndex]) {
        tallies[assistIndex].assists++;
      }
      if (hockeyAssistIndex >= 0 && tallies[hockeyAssistIndex]) {
        tallies[hockeyAssistIndex].hockeyAssists++;
      }
    }

    // Line shape: the role make-up of the seven on the field for this point.
    let handlers = 0;
    let cutters = 0;
    let hybrids = 0;
    for (const playerIndex of onField) {
      const role = roleOf[playerIndex];
      if (role === "HANDLER") handlers++;
      else if (role === "CUTTER") cutters++;
      else if (role === "HYBRID") hybrids++;
    }
    const shapeTargets: ShapeStats[] = [
      ensureShape(
        `${handlers}${ROLE_SHORT.HANDLER}·${cutters}${ROLE_SHORT.CUTTER}·${hybrids}${ROLE_SHORT.HYBRID}`,
        handlers,
        cutters,
        hybrids,
      ),
      // The handler-count rollup reuses the same accumulator shape; -1 marks
      // the fields it deliberately doesn't track.
      ensureShape(`H${handlers}`, handlers, -1, -1),
    ];
    for (const s of shapeTargets) {
      s.points++;
      if (decided) {
        s.decided++;
        if (won) s.wins++;
        if (offense) {
          s.oDecided++;
          if (won) s.oWins++;
        } else {
          s.dDecided++;
          if (won) s.dWins++;
        }
      }
    }

    // Pair tallies: every unordered pair of the players on this point.
    for (let i = 0; i < onField.length; i++) {
      for (let j = i + 1; j < onField.length; j++) {
        const key = pairKey(onField[i], onField[j]);
        bump(pairPoints, key, 1);
        if (!decided) continue;
        bump(pairDecided, key, 1);
        bump(pairPaa, key, value);
        if (won) bump(pairWins, key, 1);
      }
    }
  }

  const players: PlayerAdvanced[] = [];
  for (let i = 0; i < payload.players.length; i++) {
    const t = tallies[i];
    if (t.pointsPlayed === 0) continue;
    const p = payload.players[i];

    // "Off" = the rest of the points in the games this player appeared in.
    // Restricting to those games is what keeps impact difficulty-neutral: a
    // player who only played the hard games is compared against team-mates in
    // those same hard games.
    let seenDecided = 0;
    let seenWins = 0;
    let seenPoints = 0;
    for (const gameIndex of t.games) {
      seenDecided += gameDecided[gameIndex];
      seenWins += gameWins[gameIndex];
      seenPoints += gamePoints[gameIndex];
    }
    const offDecided = seenDecided - t.decided;
    const offWins = seenWins - t.wins;
    const conversion = ratio(t.wins, t.decided);
    const offConversion = ratio(offWins, offDecided);

    type GameRecord = [number, { decided: number; wins: number; paa: number }];

    // Spread of per-game conversion, over games with a real sample.
    const perGameRates: number[] = [];
    const chronological = [...t.perGame.entries()].sort(
      (a: GameRecord, b: GameRecord) => a[0] - b[0],
    );
    for (const [, rec] of chronological) {
      if (rec.decided >= 3) perGameRates.push(rec.wins / rec.decided);
    }
    const consistency =
      perGameRates.length >= 3
        ? stdev(perGameRates, mean(perGameRates))
        : null;

    // Trajectory: later half of their games against the earlier half. Games are
    // packed in chronological order, so index order is time order.
    //
    // Measured on PAA rather than raw wins, because raw wins track the *team's*
    // season — an easier back half of the schedule would otherwise read as every
    // player improving at once. PAA already nets out what each point was worth,
    // so what's left is the player's own trend.
    let trajectory: number | null = null;
    const scored = chronological.filter((e: GameRecord) => e[1].decided >= 2);
    if (scored.length >= 4) {
      const half = Math.floor(scored.length / 2);
      const early = scored.slice(0, half);
      const late = scored.slice(scored.length - half);
      const rate = (rows: GameRecord[]): number | null => {
        let d = 0;
        let paa = 0;
        for (const [, rec] of rows) {
          d += rec.decided;
          paa += rec.paa;
        }
        return ratio(paa, d);
      };
      const earlyRate = rate(early);
      const lateRate = rate(late);
      if (earlyRate !== null && lateRate !== null) {
        trajectory = lateRate - earlyRate;
      }
    }

    players.push({
      id: p.id,
      name: p.name,
      number: p.number,
      role: p.role,
      roleRelative: EMPTY_ROLE_RELATIVE,
      rolePeers: 0,
      roleProvisional: true,
      archetypes: [],
      gamesPlayed: t.games.size,
      pointsPlayed: t.pointsPlayed,
      oPoints: t.oPoints,
      dPoints: t.dPoints,
      decided: t.decided,
      wins: t.wins,
      losses: t.losses,
      conversion,
      holds: t.holds,
      holdOpps: t.holdOpps,
      holdPct: ratio(t.holds, t.holdOpps),
      breaks: t.breaks,
      breakOpps: t.breakOpps,
      breakPct: ratio(t.breaks, t.breakOpps),
      goals: t.goals,
      assists: t.assists,
      hockeyAssists: t.hockeyAssists,
      blocks: t.blocks,
      turnovers: t.turnovers,
      oTurnovers: t.oTurnovers,
      dTurnovers: t.dTurnovers,
      callahans: t.callahans,
      blocksPerDPoint: ratio(t.blocks, t.dPoints),
      turnoverRate: ratio(t.turnovers, t.pointsPlayed),
      involvement: ratio(t.goals + t.assists, t.pointsPlayed),
      chainInvolvement: ratio(
        t.goals + t.assists + t.hockeyAssists,
        t.pointsPlayed,
      ),
      toughDecided: t.toughDecided,
      toughConversion: ratio(t.toughWins, t.toughDecided),
      easyDecided: t.easyDecided,
      easyConversion: ratio(t.easyWins, t.easyDecided),
      consistency,
      gamesWithSample: perGameRates.length,
      trajectory,
      avgSynergy: null,
      synergyPartners: 0,
      loadShare: ratio(t.pointsPlayed, seenPoints),
      oShare: ratio(t.oPoints, t.pointsPlayed),
      paa: t.paa,
      paaPer10: t.decided > 0 ? (t.paa / t.decided) * 10 : null,
      offConversion,
      impact:
        conversion !== null && offConversion !== null
          ? conversion - offConversion
          : null,
      plusMinus: t.wins - t.losses,
    });
  }

  const pairs = buildPairs(
    payload,
    playerCount,
    tallies,
    pairPoints,
    pairDecided,
    pairWins,
    pairPaa,
    opts.minPoints,
  );

  // Chemistry has to land on the players before archetypes read it.
  applyChemistry(players, pairs);

  // Role-relative numbers and archetypes are judged against the players who
  // cleared the minimum-points bar, so a one-point cameo can't move a baseline.
  const eligible = players.filter(
    (p: PlayerAdvanced) => p.pointsPlayed >= opts.minPoints,
  );
  applyRoleRelative(players, eligible);

  // Team-wide splits by game difficulty, so "big game" means better than the
  // squad managed in those same games rather than better than their own average.
  let toughWins = 0;
  let toughDecided = 0;
  let easyWins = 0;
  let easyDecided = 0;
  for (let i = 0; i < analyses.length; i++) {
    if (!included[i]) continue;
    const d = analyses[i].difficulty;
    if (d === "TOUGH" || d === "OUT_OF_REACH") {
      toughWins += gameWins[i];
      toughDecided += gameDecided[i];
    } else if (d === "EASY") {
      easyWins += gameWins[i];
      easyDecided += gameDecided[i];
    }
  }

  applyArchetypes(players, eligible, {
    teamToughConversion: ratio(toughWins, toughDecided),
    teamEasyConversion: ratio(easyWins, easyDecided),
  });

  const allShapes = Array.from(shapeTally.values());
  for (const s of allShapes) {
    s.conversion = ratio(s.wins, s.decided);
    s.oConversion = ratio(s.oWins, s.oDecided);
    s.dConversion = ratio(s.dWins, s.dDecided);
  }
  const shapes = allShapes
    .filter((s: ShapeStats) => s.cutters >= 0)
    .sort((a: ShapeStats, b: ShapeStats) => b.points - a.points);
  const handlerShapes = allShapes
    .filter((s: ShapeStats) => s.cutters < 0)
    .sort((a: ShapeStats, b: ShapeStats) => a.handlers - b.handlers);

  return {
    players,
    pairs,
    analyses,
    includedGames: included,
    shapes,
    handlerShapes,
    gameCount: included.filter((v: boolean) => v).length,
    pointCount: totalPoints,
    conversion: ratio(totalWins, totalDecided),
  };
}

// ---------------------------------------------------------------------------
// Role-relative scoring
// ---------------------------------------------------------------------------

type MetricKey = keyof RoleRelative;

const ROLE_METRICS: MetricKey[] = [
  "conversion",
  "impact",
  "paaPer10",
  "holdPct",
  "breakPct",
  "involvement",
  "turnoverRate",
];

function metricValue(p: PlayerAdvanced, key: MetricKey): number | null {
  switch (key) {
    case "conversion":
      return p.conversion;
    case "impact":
      return p.impact;
    case "paaPer10":
      return p.paaPer10;
    case "holdPct":
      return p.holdPct;
    case "breakPct":
      return p.breakPct;
    case "involvement":
      return p.involvement;
    case "turnoverRate":
      return p.turnoverRate;
  }
}

function applyRoleRelative(
  players: PlayerAdvanced[],
  eligible: PlayerAdvanced[],
): void {
  for (const p of players) {
    const peers = eligible.filter(
      (o: PlayerAdvanced) => o.role === p.role && o.id !== p.id,
    );
    p.rolePeers = peers.length;
    p.roleProvisional =
      peers.length < MIN_ROLE_PEERS || p.pointsPlayed === 0 ? true : false;

    if (peers.length === 0) {
      p.roleRelative = EMPTY_ROLE_RELATIVE;
      continue;
    }

    const relative: RoleRelative = { ...EMPTY_ROLE_RELATIVE };
    for (const key of ROLE_METRICS) {
      const own = metricValue(p, key);
      if (own === null) continue;
      // Leave-one-out peer mean: comparing against a group you're inside of
      // pulls every gap toward zero, which matters a lot at n = 5.
      const peerValues = peers
        .map((o: PlayerAdvanced) => metricValue(o, key))
        .filter((v: number | null): v is number => v !== null);
      if (peerValues.length === 0) continue;
      relative[key] = own - mean(peerValues);
    }
    p.roleRelative = relative;
  }
}

// ---------------------------------------------------------------------------
// Archetypes
// ---------------------------------------------------------------------------

/** How far above the team rate a player must sit to earn a scoring label. */
const ARCHETYPE_RATE_MULTIPLIER = 1.4;
/** Percentage-point edge required for the conversion-based labels. */
const ARCHETYPE_PCT_EDGE = 0.1;
/** At most this many badges per player, one per family, strongest first. */
const MAX_ARCHETYPES = 4;

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a: number, b: number) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(q * sorted.length) - 1),
  );
  return sorted[idx];
}

type ArchetypeContext = {
  teamGoalRate: number;
  teamAssistRate: number;
  teamHockeyAssistRate: number;
  teamTurnoverRate: number;
  teamInvolvement: number;
  teamHold: number | null;
  teamBreak: number | null;
  teamToughConversion: number | null;
  teamEasyConversion: number | null;
  heavyLoad: number;
  lightLoad: number;
  squadSize: number;
};

type RuleHit = { strength: number; detail: string };

type ArchetypeRule = {
  id: string;
  label: string;
  family: ArchetypeFamily;
  tone: ArchetypeTone;
  /** Returns null when the player doesn't qualify. */
  test: (p: PlayerAdvanced, ctx: ArchetypeContext) => RuleHit | null;
};

/**
 * The catalogue. Rules are grouped into families and only the strongest hit
 * from each family survives, so a player never picks up two labels that say
 * the same thing. `strength` is "how far past the bar", used purely to rank.
 */
const ARCHETYPE_RULES: ArchetypeRule[] = [
  // --- Scoring -------------------------------------------------------------
  {
    id: "dual-threat",
    label: "Dual Threat",
    family: "scoring",
    tone: "positive",
    test: (p: PlayerAdvanced, ctx: ArchetypeContext) => {
      if (p.goals < 3 || p.assists < 3) return null;
      const g = ratio(p.goals, p.pointsPlayed) ?? 0;
      const a = ratio(p.assists, p.pointsPlayed) ?? 0;
      if (ctx.teamGoalRate <= 0 || ctx.teamAssistRate <= 0) return null;
      const gx = g / ctx.teamGoalRate;
      const ax = a / ctx.teamAssistRate;
      if (gx < 1.2 || ax < 1.2) return null;
      return {
        strength: Math.min(gx, ax),
        detail: `${p.goals}G and ${p.assists}A — both well above team rate`,
      };
    },
  },
  {
    id: "closer",
    label: "Closer",
    family: "scoring",
    tone: "positive",
    test: (p: PlayerAdvanced, ctx: ArchetypeContext) => {
      if (p.goals < 3 || ctx.teamGoalRate <= 0) return null;
      const rate = ratio(p.goals, p.pointsPlayed) ?? 0;
      const x = rate / ctx.teamGoalRate;
      if (x < ARCHETYPE_RATE_MULTIPLIER) return null;
      return {
        strength: x,
        detail: `${rate.toFixed(2)} goals/pt vs ${ctx.teamGoalRate.toFixed(2)} team`,
      };
    },
  },
  {
    id: "distributor",
    label: "Distributor",
    family: "scoring",
    tone: "positive",
    test: (p: PlayerAdvanced, ctx: ArchetypeContext) => {
      if (p.assists < 3 || ctx.teamAssistRate <= 0) return null;
      const rate = ratio(p.assists, p.pointsPlayed) ?? 0;
      const x = rate / ctx.teamAssistRate;
      if (x < ARCHETYPE_RATE_MULTIPLIER) return null;
      return {
        strength: x,
        detail: `${rate.toFixed(2)} assists/pt vs ${ctx.teamAssistRate.toFixed(2)} team`,
      };
    },
  },
  {
    id: "quiet",
    label: "Quiet",
    family: "scoring",
    tone: "neutral",
    test: (p: PlayerAdvanced, ctx: ArchetypeContext) => {
      // Only notable when they're on the field a lot and still never appear on
      // the scoresheet. A loose threshold here fires on half the squad.
      if (p.pointsPlayed < 20 || ctx.teamInvolvement <= 0) return null;
      if (p.pointsPlayed < ctx.heavyLoad) return null;
      if (p.involvement === null) return null;
      const x = p.involvement / ctx.teamInvolvement;
      if (x > 0.3) return null;
      return {
        strength: 1 - x,
        detail: `heavy usage but on the scoresheet for only ${pct(p.involvement)} of points`,
      };
    },
  },

  // --- Efficiency ----------------------------------------------------------
  {
    id: "spark",
    label: "Spark",
    family: "efficiency",
    tone: "positive",
    test: (p: PlayerAdvanced) => {
      if (p.impact === null || p.decided < 15 || p.impact < 0.08) return null;
      return {
        strength: p.impact * 10,
        detail: `team converts ${ppDelta(p.impact)}pp better with them on`,
      };
    },
  },
  {
    id: "glue",
    label: "Glue",
    family: "efficiency",
    tone: "positive",
    test: (p: PlayerAdvanced, ctx: ArchetypeContext) => {
      if (p.impact === null || p.decided < 15 || p.impact < 0.06) return null;
      if (p.involvement === null || ctx.teamInvolvement <= 0) return null;
      if (p.involvement / ctx.teamInvolvement > 0.6) return null;
      return {
        strength: p.impact * 10 + 1,
        detail: `${ppDelta(p.impact)}pp on-field swing without needing the disc`,
      };
    },
  },
  {
    id: "drag",
    label: "Drag",
    family: "efficiency",
    tone: "watch",
    test: (p: PlayerAdvanced) => {
      if (p.impact === null || p.decided < 15 || p.impact > -0.08) return null;
      return {
        strength: Math.abs(p.impact) * 10,
        detail: `team converts ${ppDelta(p.impact)}pp worse with them on`,
      };
    },
  },

  // --- Conversion specialists ---------------------------------------------
  {
    id: "anchor",
    label: "Anchor",
    family: "conversion",
    tone: "positive",
    test: (p: PlayerAdvanced, ctx: ArchetypeContext) => {
      if (p.holdPct === null || ctx.teamHold === null || p.holdOpps < 8) {
        return null;
      }
      const edge = p.holdPct - ctx.teamHold;
      if (edge < ARCHETYPE_PCT_EDGE) return null;
      return {
        strength: edge * 10,
        detail: `holds ${pct(p.holdPct)} vs ${pct(ctx.teamHold)} team`,
      };
    },
  },
  {
    id: "lockdown",
    label: "Lockdown",
    family: "conversion",
    tone: "positive",
    test: (p: PlayerAdvanced, ctx: ArchetypeContext) => {
      if (p.breakPct === null || ctx.teamBreak === null || p.breakOpps < 8) {
        return null;
      }
      const edge = p.breakPct - ctx.teamBreak;
      if (edge < ARCHETYPE_PCT_EDGE) return null;
      const blockNote = p.blocks > 0 ? `, ${p.blocks} blocks` : "";
      return {
        strength: edge * 10 + 0.5,
        detail: `breaks ${pct(p.breakPct)} vs ${pct(ctx.teamBreak)} team${blockNote}`,
      };
    },
  },

  // --- Line usage ----------------------------------------------------------
  {
    id: "o-line",
    label: "O-Line",
    family: "line",
    tone: "neutral",
    test: (p: PlayerAdvanced) => {
      if (p.oShare === null || p.pointsPlayed < 10 || p.oShare < 0.75) {
        return null;
      }
      return {
        strength: p.oShare,
        detail: `${pct(p.oShare)} of their points on offence`,
      };
    },
  },
  {
    id: "d-line",
    label: "D-Line",
    family: "line",
    tone: "neutral",
    test: (p: PlayerAdvanced) => {
      if (p.oShare === null || p.pointsPlayed < 10 || p.oShare > 0.25) {
        return null;
      }
      return {
        strength: 1 - p.oShare,
        detail: `${pct(1 - p.oShare)} of their points on defence`,
      };
    },
  },
  {
    id: "two-way",
    label: "Two-Way",
    family: "line",
    tone: "positive",
    test: (p: PlayerAdvanced) => {
      if (p.oShare === null || p.pointsPlayed < 15) return null;
      if (p.oShare < 0.4 || p.oShare > 0.6) return null;
      return {
        strength: 1 - Math.abs(p.oShare - 0.5) * 4,
        detail: `${p.oPoints} O and ${p.dPoints} D points — used on both lines`,
      };
    },
  },

  // --- Load ----------------------------------------------------------------
  {
    id: "ironman",
    label: "Ironman",
    family: "load",
    tone: "neutral",
    test: (p: PlayerAdvanced) => {
      if (p.loadShare === null || p.pointsPlayed < 15 || p.loadShare < 0.6) {
        return null;
      }
      return {
        strength: p.loadShare + 1,
        detail: `on the field for ${pct(p.loadShare)} of points in their games`,
      };
    },
  },
  {
    id: "workhorse",
    label: "Workhorse",
    family: "load",
    tone: "neutral",
    test: (p: PlayerAdvanced, ctx: ArchetypeContext) => {
      if (ctx.squadSize < 4 || p.pointsPlayed < ctx.heavyLoad) return null;
      return {
        strength: 1,
        detail: `${p.pointsPlayed} points played, top quarter of the squad`,
      };
    },
  },
  {
    id: "cameo",
    label: "Cameo",
    family: "load",
    tone: "neutral",
    test: (p: PlayerAdvanced, ctx: ArchetypeContext) => {
      if (ctx.squadSize < 4 || p.pointsPlayed > ctx.lightLoad) return null;
      return {
        strength: 0.5,
        detail: `${p.pointsPlayed} points played, bottom quarter of the squad`,
      };
    },
  },

  // --- Situational ---------------------------------------------------------
  {
    id: "big-game",
    label: "Big Game",
    family: "situational",
    tone: "positive",
    test: (p: PlayerAdvanced, ctx: ArchetypeContext) => {
      if (
        p.toughConversion === null ||
        ctx.teamToughConversion === null ||
        p.toughDecided < 8
      ) {
        return null;
      }
      const edge = p.toughConversion - ctx.teamToughConversion;
      if (edge < 0.08) return null;
      return {
        strength: edge * 10 + 1,
        detail: `${pct(p.toughConversion)} in tough games vs ${pct(ctx.teamToughConversion)} team`,
      };
    },
  },
  {
    id: "front-runner",
    label: "Front-Runner",
    family: "situational",
    tone: "watch",
    test: (p: PlayerAdvanced, ctx: ArchetypeContext) => {
      if (
        p.toughConversion === null ||
        p.easyConversion === null ||
        ctx.teamToughConversion === null ||
        p.toughDecided < 8 ||
        p.easyDecided < 8
      ) {
        return null;
      }
      const toughEdge = p.toughConversion - ctx.teamToughConversion;
      if (toughEdge > -0.05) return null;
      const gap = p.easyConversion - p.toughConversion;
      if (gap < 0.15) return null;
      return {
        strength: gap * 5,
        detail: `${pct(p.easyConversion)} in easy games, ${pct(p.toughConversion)} in tough ones`,
      };
    },
  },

  // --- Chemistry -----------------------------------------------------------
  {
    id: "connector",
    label: "Connector",
    family: "chemistry",
    tone: "positive",
    test: (p: PlayerAdvanced) => {
      if (
        p.avgSynergy === null ||
        p.synergyPartners < 3 ||
        p.avgSynergy < 0.05
      ) {
        return null;
      }
      return {
        strength: p.avgSynergy * 10,
        detail: `lifts ${p.synergyPartners} partners by ${ppDelta(p.avgSynergy)}pp on average`,
      };
    },
  },
  {
    id: "lone-wolf",
    label: "Lone Wolf",
    family: "chemistry",
    tone: "watch",
    test: (p: PlayerAdvanced) => {
      if (
        p.avgSynergy === null ||
        p.synergyPartners < 3 ||
        p.avgSynergy > -0.05
      ) {
        return null;
      }
      return {
        strength: Math.abs(p.avgSynergy) * 10,
        detail: `pairs convert ${ppDelta(p.avgSynergy)}pp below what each does apart`,
      };
    },
  },

  // --- Consistency ---------------------------------------------------------
  {
    id: "metronome",
    label: "Metronome",
    family: "consistency",
    tone: "positive",
    test: (p: PlayerAdvanced) => {
      if (
        p.consistency === null ||
        p.gamesWithSample < 4 ||
        p.consistency > 0.15
      ) {
        return null;
      }
      return {
        strength: 1 - p.consistency,
        detail: `same output game to game across ${p.gamesWithSample} games`,
      };
    },
  },
  {
    id: "streaky",
    label: "Streaky",
    family: "consistency",
    tone: "watch",
    test: (p: PlayerAdvanced) => {
      if (
        p.consistency === null ||
        p.gamesWithSample < 4 ||
        p.consistency < 0.3
      ) {
        return null;
      }
      return {
        strength: p.consistency,
        detail: `swings hard between games (spread ${Math.round(p.consistency * 100)}pp)`,
      };
    },
  },

  // --- Trajectory ----------------------------------------------------------
  {
    id: "rising",
    label: "Rising",
    family: "trajectory",
    tone: "positive",
    test: (p: PlayerAdvanced) => {
      if (p.trajectory === null || p.trajectory < 0.12) return null;
      return {
        strength: p.trajectory * 5,
        detail: `${ppDelta(p.trajectory)}pp above their own earlier form, schedule aside`,
      };
    },
  },
  {
    id: "fading",
    label: "Fading",
    family: "trajectory",
    tone: "watch",
    test: (p: PlayerAdvanced) => {
      if (p.trajectory === null || p.trajectory > -0.12) return null;
      return {
        strength: Math.abs(p.trajectory) * 5,
        detail: `${ppDelta(p.trajectory)}pp down on their own earlier form, schedule aside`,
      };
    },
  },

  // --- Defence -------------------------------------------------------------
  {
    id: "ball-hawk",
    label: "Ball Hawk",
    family: "defence",
    tone: "positive",
    test: (p: PlayerAdvanced) => {
      if (
        p.blocksPerDPoint === null ||
        p.dPoints < 8 ||
        p.blocksPerDPoint < 0.25
      ) {
        return null;
      }
      return {
        strength: p.blocksPerDPoint * 4,
        detail: `${p.blocks} blocks, ${p.blocksPerDPoint.toFixed(2)} per D point`,
      };
    },
  },
  {
    id: "callahan",
    label: "Callahan",
    family: "defence",
    tone: "positive",
    test: (p: PlayerAdvanced) => {
      if (p.callahans < 1) return null;
      return {
        strength: 10,
        detail: `${p.callahans} callahan${p.callahans === 1 ? "" : "s"}`,
      };
    },
  },

  // --- Scoring chain -------------------------------------------------------
  {
    id: "facilitator",
    label: "Facilitator",
    family: "chain",
    tone: "positive",
    test: (p: PlayerAdvanced, ctx: ArchetypeContext) => {
      if (p.hockeyAssists < 3 || ctx.teamHockeyAssistRate <= 0) return null;
      const rate = ratio(p.hockeyAssists, p.pointsPlayed) ?? 0;
      const x = rate / ctx.teamHockeyAssistRate;
      if (x < ARCHETYPE_RATE_MULTIPLIER) return null;
      return {
        strength: x,
        detail: `${p.hockeyAssists} hockey assists — the pass that makes the assist, ${x.toFixed(1)}× team rate`,
      };
    },
  },

  // --- Possession ----------------------------------------------------------
  {
    id: "safe-hands",
    label: "Safe Hands",
    family: "possession",
    tone: "positive",
    test: (p: PlayerAdvanced, ctx: ArchetypeContext) => {
      if (p.pointsPlayed < 15 || ctx.teamTurnoverRate <= 0) return null;
      if (p.turnoverRate === null) return null;
      const x = p.turnoverRate / ctx.teamTurnoverRate;
      if (x > 0.5) return null;
      return {
        strength: 1 - x,
        detail: `${p.turnovers} turnovers over ${p.pointsPlayed} points, half the team's rate or better`,
      };
    },
  },
  {
    id: "loose",
    label: "Loose With It",
    family: "possession",
    tone: "watch",
    test: (p: PlayerAdvanced, ctx: ArchetypeContext) => {
      if (p.pointsPlayed < 15 || ctx.teamTurnoverRate <= 0) return null;
      if (p.turnoverRate === null || p.turnovers < 3) return null;
      const x = p.turnoverRate / ctx.teamTurnoverRate;
      if (x < 1.6) return null;
      return {
        strength: x,
        detail: `${p.turnoverRate.toFixed(2)} turnovers/pt vs ${ctx.teamTurnoverRate.toFixed(2)} team`,
      };
    },
  },
];

/** Mean chemistry across a player's partners, for the Connector/Lone Wolf split. */
function applyChemistry(
  players: PlayerAdvanced[],
  pairs: PairAdvanced[],
): void {
  const totals = new Map<string, { sum: number; count: number }>();
  const add = (id: string, synergy: number): void => {
    const entry = totals.get(id);
    if (entry) {
      entry.sum += synergy;
      entry.count++;
    } else {
      totals.set(id, { sum: synergy, count: 1 });
    }
  };

  for (const pair of pairs) {
    if (pair.synergy === null) continue;
    add(pair.a.id, pair.synergy);
    add(pair.b.id, pair.synergy);
  }

  for (const p of players) {
    const entry = totals.get(p.id);
    if (!entry || entry.count === 0) {
      p.avgSynergy = null;
      p.synergyPartners = 0;
      continue;
    }
    p.avgSynergy = entry.sum / entry.count;
    p.synergyPartners = entry.count;
  }
}

function applyArchetypes(
  players: PlayerAdvanced[],
  eligible: PlayerAdvanced[],
  splits: {
    teamToughConversion: number | null;
    teamEasyConversion: number | null;
  },
): void {
  if (eligible.length === 0) return;

  let goals = 0;
  let assists = 0;
  let hockeyAssists = 0;
  let turnovers = 0;
  let onFieldPoints = 0;
  let holds = 0;
  let holdOpps = 0;
  let breaks = 0;
  let breakOpps = 0;
  for (const p of eligible) {
    goals += p.goals;
    assists += p.assists;
    hockeyAssists += p.hockeyAssists;
    turnovers += p.turnovers;
    onFieldPoints += p.pointsPlayed;
    holds += p.holds;
    holdOpps += p.holdOpps;
    breaks += p.breaks;
    breakOpps += p.breakOpps;
  }

  const loads = eligible.map((p: PlayerAdvanced) => p.pointsPlayed);
  const ctx: ArchetypeContext = {
    teamGoalRate: ratio(goals, onFieldPoints) ?? 0,
    teamAssistRate: ratio(assists, onFieldPoints) ?? 0,
    teamHockeyAssistRate: ratio(hockeyAssists, onFieldPoints) ?? 0,
    teamTurnoverRate: ratio(turnovers, onFieldPoints) ?? 0,
    teamInvolvement: ratio(goals + assists, onFieldPoints) ?? 0,
    teamHold: ratio(holds, holdOpps),
    teamBreak: ratio(breaks, breakOpps),
    teamToughConversion: splits.teamToughConversion,
    teamEasyConversion: splits.teamEasyConversion,
    heavyLoad: percentile(loads, 0.75),
    lightLoad: percentile(loads, 0.25),
    squadSize: eligible.length,
  };

  const eligibleIds = new Set<string>(
    eligible.map((p: PlayerAdvanced) => p.id),
  );

  for (const p of players) {
    if (!eligibleIds.has(p.id)) {
      p.archetypes = [];
      continue;
    }

    // Keep only the strongest hit per family, so no player collects two
    // labels that are really the same observation worded differently.
    const best = new Map<ArchetypeFamily, Archetype & { strength: number }>();
    for (const rule of ARCHETYPE_RULES) {
      const hit = rule.test(p, ctx);
      if (!hit) continue;
      const current = best.get(rule.family);
      if (current && current.strength >= hit.strength) continue;
      best.set(rule.family, {
        id: rule.id,
        label: rule.label,
        detail: hit.detail,
        family: rule.family,
        tone: rule.tone,
        strength: hit.strength,
      });
    }

    p.archetypes = [...best.values()]
      .sort(
        (
          a: Archetype & { strength: number },
          b: Archetype & { strength: number },
        ) => {
          // Praise before diagnosis, then by how far past the bar.
          const rank = (t: ArchetypeTone): number =>
            t === "positive" ? 0 : t === "neutral" ? 1 : 2;
          const byTone = rank(a.tone) - rank(b.tone);
          return byTone !== 0 ? byTone : b.strength - a.strength;
        },
      )
      .slice(0, MAX_ARCHETYPES)
      .map((a: Archetype & { strength: number }) => ({
        id: a.id,
        label: a.label,
        detail: a.detail,
        family: a.family,
        tone: a.tone,
      }));
  }
}

// ---------------------------------------------------------------------------
// Pair stats
// ---------------------------------------------------------------------------

export type PairAdvanced = {
  key: string;
  a: PayloadPlayer;
  b: PayloadPlayer;
  /** Points the two played together (decided ones only, for the rates). */
  pointsTogether: number;
  decidedTogether: number;
  winsTogether: number;
  plusMinus: number;
  /** Conversion with both on the field. */
  together: number | null;
  /** A's conversion on the points where B sat, and vice versa. */
  aWithout: number | null;
  bWithout: number | null;
  aWithoutPoints: number;
  bWithoutPoints: number;
  /** What the pair "should" convert, from each player's solo-without form. */
  expected: number | null;
  /**
   * Chemistry: how much better (or worse) the pair does than the average of
   * what each does apart. Positive means the two lift each other.
   */
  synergy: number | null;
};

function buildPairs(
  payload: StatsPayload,
  playerCount: number,
  tallies: PlayerTally[],
  pairPoints: Map<number, number>,
  pairDecided: Map<number, number>,
  pairWins: Map<number, number>,
  pairPaa: Map<number, number>,
  minPoints: number,
): PairAdvanced[] {
  const out: PairAdvanced[] = [];

  for (const [key, points] of pairPoints) {
    if (points < minPoints) continue;
    const ai = Math.floor(key / playerCount);
    const bi = key % playerCount;
    const a = payload.players[ai];
    const b = payload.players[bi];
    if (!a || !b) continue;

    const ta = tallies[ai];
    const tb = tallies[bi];
    const decided = pairDecided.get(key) ?? 0;
    const wins = pairWins.get(key) ?? 0;
    const paa = pairPaa.get(key) ?? 0;

    // Each player's points split cleanly into "with partner" and "without".
    const aWithoutDecided = ta.decided - decided;
    const bWithoutDecided = tb.decided - decided;
    const aWithoutPaa = ta.paa - paa;
    const bWithoutPaa = tb.paa - paa;

    const togetherRate = ratio(paa, decided);
    const aWithoutRate = ratio(aWithoutPaa, aWithoutDecided);
    const bWithoutRate = ratio(bWithoutPaa, bWithoutDecided);

    // Only claim chemistry when both players have a real sample apart.
    const haveSplit =
      togetherRate !== null &&
      aWithoutRate !== null &&
      bWithoutRate !== null &&
      aWithoutDecided >= MIN_WITHOUT_POINTS &&
      bWithoutDecided >= MIN_WITHOUT_POINTS;

    const expectedRate = haveSplit
      ? ((aWithoutRate as number) + (bWithoutRate as number)) / 2
      : null;

    const togetherConversion = ratio(wins, decided);

    out.push({
      key: `${a.id}|${b.id}`,
      a,
      b,
      pointsTogether: points,
      decidedTogether: decided,
      winsTogether: wins,
      plusMinus: wins - (decided - wins),
      together: togetherConversion,
      aWithout: ratio(ta.wins - wins, aWithoutDecided),
      bWithout: ratio(tb.wins - wins, bWithoutDecided),
      aWithoutPoints: aWithoutDecided,
      bWithoutPoints: bWithoutDecided,
      expected:
        expectedRate !== null && togetherConversion !== null
          ? togetherConversion - ((togetherRate as number) - expectedRate)
          : null,
      synergy:
        expectedRate !== null ? (togetherRate as number) - expectedRate : null,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Formatting helpers, shared by the tables
// ---------------------------------------------------------------------------

export function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "–";
  return `${Math.round(value * 100)}%`;
}

/** Percentage-point deltas read better with an explicit sign. */
export function ppDelta(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "–";
  const points = Math.round(value * 100);
  return points > 0 ? `+${points}` : String(points);
}

export function signed(value: number | null, digits: number = 1): string {
  if (value === null || !Number.isFinite(value)) return "–";
  const fixed = value.toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
}

export function toneFor(value: number | null): string | undefined {
  if (value === null || !Number.isFinite(value) || value === 0) return undefined;
  return value > 0 ? "text-emerald-600" : "text-rose-500";
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  EASY: "Easy",
  EVEN: "Even",
  TOUGH: "Tough",
  OUT_OF_REACH: "Out of reach",
};

export const DIFFICULTY_TONE: Record<Difficulty, string> = {
  EASY: "bg-sky-100 text-sky-800",
  EVEN: "bg-muted text-muted-foreground",
  TOUGH: "bg-amber-100 text-amber-900",
  OUT_OF_REACH: "bg-rose-100 text-rose-900",
};
