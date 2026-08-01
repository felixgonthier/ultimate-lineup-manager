/**
 * Who leads the team at holding and at breaking, in a form `suggestLine` can
 * rank on.
 *
 * Raw leaderboards are the wrong tool here: a player who converted 3 of 4 break
 * chances tops the table at 75% while telling you almost nothing. So every rate
 * is pulled toward the team's pooled rate by `SHRINK_K` pseudo-opportunities,
 * and `dataWeight` reports how much sample is actually behind it so the caller
 * can blend against the coach's own assessment.
 */

import type { PlayerStats } from "./stats";

/** Pseudo-opportunities of prior mixed into every rate. */
export const SHRINK_K = 8;

/** Blocks per D point that earns the full defensive work-rate bonus. */
const BLOCK_REFERENCE = 0.35;
/** Size of that bonus, in conversion-rate terms. */
const BLOCK_BONUS = 0.15;

/** ±2 standard deviations spans the 0..1 range. */
const NORMALISE_SPREAD = 4;

/** Cache tag for a team's ratings, invalidated whenever a point is recorded. */
export function ratingsCacheTag(teamId: string): string {
  return `lineup-ratings:${teamId}`;
}

export type RatingMetric = "hold" | "break";

export type Rating = {
  /** Shrunk and normalised across the roster to 0..1. */
  score: number;
  /** Confidence from sample size, 0..1. */
  dataWeight: number;
};

export type CandidateRatings = Partial<Record<RatingMetric, Rating>>;

type MetricSpec = {
  /** null when this player has no opportunities to judge. */
  value: (p: PlayerStats) => number | null;
  opps: (p: PlayerStats) => number;
};

const SPECS: Record<RatingMetric, MetricSpec> = {
  hold: {
    value: (p: PlayerStats) =>
      p.holdOpps > 0 ? p.holds / p.holdOpps : null,
    opps: (p: PlayerStats) => p.holdOpps,
  },
  break: {
    // Generating the turn is most of the job on a D point, so defensive work
    // rate nudges break conversion rather than being ranked separately.
    value: (p: PlayerStats) => {
      if (p.breakOpps === 0) return null;
      const blocksPerDPoint = p.dPoints > 0 ? p.blocks / p.dPoints : 0;
      return (
        p.breaks / p.breakOpps +
        BLOCK_BONUS * Math.min(1, blocksPerDPoint / BLOCK_REFERENCE)
      );
    },
    opps: (p: PlayerStats) => p.breakOpps,
  },
};

const METRICS = Object.keys(SPECS) as RatingMetric[];

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function ratingsForMetric(
  players: PlayerStats[],
  spec: MetricSpec,
): Map<string, Rating> {
  type Row = { id: string; value: number | null; opps: number };
  const rows: Row[] = players.map((p: PlayerStats) => {
    const value = spec.value(p);
    // No measurement means no confidence, however many points they have played.
    const opps = value === null ? 0 : Math.max(0, spec.opps(p));
    return { id: p.id, value, opps };
  });

  // Opportunity-weighted pooled rate: the bar a thin sample regresses toward.
  let num = 0;
  let den = 0;
  for (const r of rows) {
    if (r.value !== null && r.opps > 0) {
      num += r.value * r.opps;
      den += r.opps;
    }
  }
  const prior = den > 0 ? num / den : 0;

  const shrunk = rows.map((r: Row) => ({
    id: r.id,
    opps: r.opps,
    value:
      ((r.value ?? prior) * r.opps + prior * SHRINK_K) / (r.opps + SHRINK_K),
  }));

  const mean =
    shrunk.reduce(
      (sum: number, s: (typeof shrunk)[number]) => sum + s.value,
      0,
    ) / (shrunk.length || 1);
  const variance =
    shrunk.reduce(
      (sum: number, s: (typeof shrunk)[number]) => sum + (s.value - mean) ** 2,
      0,
    ) / (shrunk.length || 1);
  const sd = Math.sqrt(variance);

  return new Map<string, Rating>(
    shrunk.map((s: (typeof shrunk)[number]) => [
      s.id,
      {
        score:
          sd > 0
            ? clamp01(0.5 + (s.value - mean) / (NORMALISE_SPREAD * sd))
            : 0.5,
        dataWeight: s.opps / (s.opps + SHRINK_K),
      },
    ]),
  );
}

/** Hold and break ratings keyed by player id. */
export function buildLineupRatings(
  players: PlayerStats[],
): Record<string, CandidateRatings> {
  const out: Record<string, CandidateRatings> = {};
  if (players.length === 0) return out;

  for (const metric of METRICS) {
    for (const [id, rating] of ratingsForMetric(players, SPECS[metric])) {
      (out[id] ??= {})[metric] = rating;
    }
  }
  return out;
}
