/**
 * Line suggestion — one scoring function, three modes.
 *
 * FAIR mode is a strict superset of the fairness-only picker that shipped before
 * result-based line calling existed: with skill/fatigue/situation weights at
 * zero, the ordering collapses to "fewest points played first" and the role
 * floor is unchanged. `lib/lineup.test.ts` pins that equivalence against a copy
 * of the original algorithm, so FAIR mode cannot regress.
 */

import type { CandidateRatings, RatingMetric } from "./lineup-ratings";

export type { CandidateRatings, Rating, RatingMetric } from "./lineup-ratings";

export type LineupMode = "FAIR" | "BALANCED" | "RESULTS";

/**
 * D-line aggression ladder, rest → all-in. Naming follows the common
 * sub-calling vocabulary (depth / rotation / starting / push lines).
 */
export type Rung =
  | "DEPTH"
  | "ROTATION"
  | "STARTING"
  | "HALF_PUSH"
  | "FULL_PUSH";

export type Pool = "O" | "D" | "BOTH";
export type Tier = "STAR" | "CORE" | "DEPTH";
/** Risk profile. Orthogonal to tier: a STAR can be either. */
export type Variance = "LOW" | "HIGH";
export type Role = "HANDLER" | "CUTTER" | "HYBRID";
export type WindStrength = "NONE" | "MODERATE" | "STRONG";

export type Candidate = {
  id: string;
  role: Role;
  pool: Pool;
  tier: Tier;
  variance: Variance;
  /** Measured hold/break ratings, when there is data behind them. */
  ratings?: CandidateRatings;
  /** Points played in this game — drives fairness. */
  gamePoints: number;
  /** Points played across the whole tournament — drives the fatigue budget. */
  tournamentPoints: number;
  /** Consecutive points played ending with the most recent point. */
  streak: number;
};

export type Situation = {
  ourOffense: boolean;
  /** Which end we attack this point. null when wind is irrelevant. */
  attackingUpwind: boolean | null;
  windStrength: WindStrength;
};

export type SuggestInput = {
  candidates: Candidate[];
  mode: LineupMode;
  situation: Situation;
  /** Omit to derive from mode + situation. Always clamped to what mode allows. */
  rung?: Rung;
  /** Minimum points per player this game. Players below it are picked first. */
  fairnessFloor?: number;
  size?: number;
};

export type Suggestion = {
  playerIds: string[];
  /** The rung actually used, after clamping. */
  rung: Rung;
  mode: LineupMode;
  /** The measured metric that ranked this line, if any. */
  metric: RatingMetric | null;
  /** Per-candidate score, for explaining a call in the UI. */
  scores: Record<string, number>;
};

export const LINE_SIZE = 7;
const MIN_HANDLERS = 1;
const MIN_HANDLER_HYBRID = 3;
/** Points in a full tournament day that count as one unit of accumulated load. */
const TOURNAMENT_LOAD_UNIT = 60;
/** Large enough to dominate every other term, so the floor acts as a constraint. */
const FLOOR_BONUS = 100;
/** Performance drops off after this many points back-to-back. */
const STREAK_HARD_LIMIT = 3;

type Weights = {
  skill: number;
  fair: number;
  fatigue: number;
  situation: number;
};

const MODE_WEIGHTS: Record<LineupMode, Weights> = {
  // Zeros here are load-bearing — they are what makes FAIR reduce to the
  // original fewest-points-first ordering.
  FAIR: { skill: 0, fair: 1, fatigue: 0, situation: 0 },
  BALANCED: { skill: 0.5, fair: 0.5, fatigue: 0.4, situation: 0.6 },
  RESULTS: { skill: 1, fair: 0.15, fatigue: 0.7, situation: 1 },
};

type RungModifier = {
  skill: number;
  fair: number;
  fatigue: number;
  /** null = every tier eligible. */
  tiers: Tier[] | null;
};

const RUNG_MODIFIERS: Record<Rung, RungModifier> = {
  DEPTH: { skill: 0, fair: 1.5, fatigue: 0.5, tiers: ["DEPTH", "CORE"] },
  ROTATION: { skill: 0.5, fair: 1.2, fatigue: 1, tiers: null },
  STARTING: { skill: 1, fair: 1, fatigue: 1, tiers: null },
  HALF_PUSH: { skill: 1.3, fair: 0.5, fatigue: 0.8, tiers: null },
  FULL_PUSH: { skill: 1.6, fair: 0, fatigue: 0.4, tiers: null },
};

/**
 * Push rungs are named for the situation they answer, since that is how a call
 * is actually made on the sideline — you need a break, or you need a hold.
 */
const RUNG_LABELS: Record<Rung, string | { o: string; d: string }> = {
  DEPTH: "Depth",
  ROTATION: "Rotation",
  STARTING: "Starting",
  HALF_PUSH: { o: "Need a hold", d: "Need a break" },
  FULL_PUSH: { o: "Must hold", d: "Must break" },
};

export function rungLabel(rung: Rung, situation: Situation): string {
  const label = RUNG_LABELS[rung];
  if (typeof label === "string") return label;
  return situation.ourOffense ? label.o : label.d;
}

/**
 * Which measured rating ranks a line. Only the push rungs use one, and which
 * one follows from the point rather than being chosen: on defence you want the
 * team's break converters, on offence its hold converters.
 */
export function metricFor(
  mode: LineupMode,
  rung: Rung,
  situation: Situation,
): RatingMetric | null {
  if (mode === "FAIR") return null;
  if (rung !== "HALF_PUSH" && rung !== "FULL_PUSH") return null;
  return situation.ourOffense ? "hold" : "break";
}

const TIER_WEIGHT: Record<Tier, number> = {
  STAR: 1,
  CORE: 0.6,
  DEPTH: 0.2,
};

/**
 * Share of the skill term the coach's tier keeps on a results-mode push call.
 * Capping the measured side here, and flooring the result at the tier weight, is
 * what guarantees a star is never rated off a must-win point: data can promote a
 * player above their tier, but it cannot demote one below it.
 */
const PUSH_TIER_SHARE = 0.5;

function skillScore(
  c: Candidate,
  metric: RatingMetric | null,
  starsFirst: boolean,
): number {
  const tier = TIER_WEIGHT[c.tier];
  const rating = metric ? c.ratings?.[metric] : undefined;
  if (!rating) return tier;

  const dataShare = starsFirst
    ? Math.min(rating.dataWeight, 1 - PUSH_TIER_SHARE)
    : rating.dataWeight;
  const blended = tier * (1 - dataShare) + rating.score * dataShare;
  return starsFirst ? Math.max(tier, blended) : blended;
}

/** Rungs above a mode's ceiling collapse to that ceiling. */
export function clampRung(mode: LineupMode, rung: Rung): Rung {
  if (mode === "FAIR") return "ROTATION";
  if (mode === "BALANCED") return rung === "FULL_PUSH" ? "HALF_PUSH" : rung;
  return rung;
}

export function defaultRung(mode: LineupMode, situation: Situation): Rung {
  if (mode === "FAIR") return "ROTATION";
  if (mode === "BALANCED") return "STARTING";

  const windy = situation.windStrength !== "NONE";
  if (!situation.ourOffense && windy && situation.attackingUpwind === false) {
    // They have to go upwind — the highest-probability break in the game.
    return "FULL_PUSH";
  }
  if (
    !situation.ourOffense &&
    situation.windStrength === "STRONG" &&
    situation.attackingUpwind === true
  ) {
    // They are cruising downwind. Low break odds regardless — rest here.
    return "ROTATION";
  }
  return "STARTING";
}

function fatiguePenalty(c: Candidate): number {
  const streak =
    c.streak >= STREAK_HARD_LIMIT
      ? 1
      : c.streak === 2
        ? 0.5
        : c.streak === 1
          ? 0.2
          : 0;
  const load = Math.min(1, c.tournamentPoints / TOURNAMENT_LOAD_UNIT);
  return streak + 0.5 * load;
}

function situationFit(c: Candidate, s: Situation): number {
  const wantsOffensivePersonnel = s.ourOffense;
  let fit = 0;

  // Pool fit is a strong preference, never a hard filter, so a line stays
  // fillable when the right pool is thin (injuries, blowout subbing).
  if (c.pool === "BOTH") fit += 0.15;
  else if (wantsOffensivePersonnel === (c.pool === "O")) fit += 0.5;
  else fit -= 0.5;

  // Variance allocation: a turnover derails an O drive, but a break score is
  // worth more than a failed risk costs, so D is where risk-taking pays.
  if (wantsOffensivePersonnel) {
    fit += c.variance === "LOW" ? 0.3 : -0.2;
  } else {
    fit += c.variance === "HIGH" ? 0.3 : -0.1;
  }

  if (s.attackingUpwind === null || s.windStrength === "NONE") return fit;

  const wind = s.windStrength === "STRONG" ? 1 : 0.5;
  if (s.ourOffense && s.attackingUpwind) {
    // Upwind hold: needs throwers who can actually move it into the wind.
    if (c.role === "HANDLER") fit += 0.4 * wind;
    else if (c.role === "HYBRID") fit += 0.2 * wind;
    if (c.variance === "LOW") fit += 0.3 * wind;
  } else if (!s.ourOffense && !s.attackingUpwind) {
    // Break chance we cannot waste, and we convert downwind.
    if (c.tier === "STAR") fit += 0.3 * wind;
    if (c.variance === "HIGH") fit += 0.2 * wind;
  }
  return fit;
}

/**
 * Fatigue exclusions, with graceful degrade: if blocking gassed players leaves
 * too few to field a line, the freshest blocked players come back in.
 */
function eligibleCandidates(
  candidates: Candidate[],
  mode: LineupMode,
  rung: Rung,
  size: number,
): Candidate[] {
  if (mode === "FAIR") return candidates;

  const pushing = rung === "FULL_PUSH";
  const allowedTiers = RUNG_MODIFIERS[rung].tiers;

  const blocked: Candidate[] = [];
  const eligible = candidates.filter((c: Candidate) => {
    const gassed = !pushing && c.streak >= STREAK_HARD_LIMIT;
    const wrongTier = allowedTiers !== null && !allowedTiers.includes(c.tier);
    if (gassed || wrongTier) {
      blocked.push(c);
      return false;
    }
    return true;
  });

  if (eligible.length >= size) return eligible;

  const restored = [...blocked].sort(
    (a: Candidate, b: Candidate) => fatiguePenalty(a) - fatiguePenalty(b),
  );
  return [...eligible, ...restored.slice(0, size - eligible.length)];
}

/**
 * Pick `size` players, honouring the role floor. Structurally identical to the
 * original picker — only the ordering key differs, which is what keeps FAIR
 * mode bit-for-bit compatible.
 */
function pickWithRoleFloor(ordered: Candidate[], size: number): Candidate[] {
  if (ordered.length <= size) return ordered;

  const handlers = ordered.filter((p: Candidate) => p.role === "HANDLER");
  const handlerHybrids = ordered.filter(
    (p: Candidate) => p.role === "HANDLER" || p.role === "HYBRID",
  );

  // Role floor unreachable — fall back to pure ordering rather than distort it.
  if (
    handlers.length < MIN_HANDLERS ||
    handlerHybrids.length < MIN_HANDLER_HYBRID
  ) {
    return ordered.slice(0, size);
  }

  const picked: Candidate[] = [handlers[0]];
  const pickedIds = new Set<string>([handlers[0].id]);

  for (const p of handlerHybrids) {
    if (picked.length >= MIN_HANDLER_HYBRID) break;
    if (!pickedIds.has(p.id)) {
      picked.push(p);
      pickedIds.add(p.id);
    }
  }
  for (const p of ordered) {
    if (picked.length >= size) break;
    if (!pickedIds.has(p.id)) {
      picked.push(p);
      pickedIds.add(p.id);
    }
  }
  return picked;
}

export function suggestLine(input: SuggestInput): Suggestion {
  const { candidates, mode, situation, fairnessFloor } = input;
  const size = input.size ?? LINE_SIZE;
  const rung = clampRung(mode, input.rung ?? defaultRung(mode, situation));
  const metric = metricFor(mode, rung, situation);
  // Results mode treats a push call as "field the stars" — measured rates then
  // order everyone else rather than deciding who is trusted with the point.
  const starsFirst = mode === "RESULTS" && metric !== null;

  const weights = MODE_WEIGHTS[mode];
  const modifier = RUNG_MODIFIERS[rung];
  const maxGamePoints = Math.max(
    1,
    ...candidates.map((c: Candidate) => c.gamePoints),
  );

  const scores: Record<string, number> = {};
  for (const c of candidates) {
    // Negated and normalised so that, in FAIR mode, ordering by score descending
    // is exactly ordering by points played ascending.
    const fairness = -c.gamePoints / maxGamePoints;
    let score =
      weights.skill * modifier.skill * skillScore(c, metric, starsFirst) +
      weights.fair * modifier.fair * fairness -
      weights.fatigue * modifier.fatigue * fatiguePenalty(c) +
      weights.situation * situationFit(c, situation);
    if (fairnessFloor !== undefined && c.gamePoints < fairnessFloor) {
      score += FLOOR_BONUS;
    }
    scores[c.id] = score;
  }

  const eligible = eligibleCandidates(candidates, mode, rung, size);
  // Stable sort: equal scores keep input order, matching the original picker.
  const ordered = [...eligible].sort(
    (a: Candidate, b: Candidate) => scores[b.id] - scores[a.id],
  );

  return {
    playerIds: pickWithRoleFloor(ordered, size).map((c: Candidate) => c.id),
    rung,
    mode,
    metric,
    scores,
  };
}
