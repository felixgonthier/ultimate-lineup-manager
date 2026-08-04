/**
 * Why a player is (or is not) on the suggested line.
 *
 * Deliberately derived from the same inputs `suggestLine` scores on rather than
 * returned by it: the suggester stays a pure ordering function with its
 * equivalence tests intact, and the sideline still gets an answer to "why them?"
 * The tags are ranked by how much they actually drove the call, and callers show
 * only the first few — a chip row that never wraps beats a complete explanation
 * nobody reads between points.
 */

import type {
  Candidate,
  LineupMode,
  RatingMetric,
  Rung,
  Situation,
} from "./lineup";

export type ReasonTone = "good" | "fair" | "warn";

export type Reason = {
  label: string;
  tone: ReasonTone;
  /** Long form for the title attribute. */
  detail: string;
};

/**
 * A tag that fits everyone tells you nothing. Fairness and freshness tags are
 * therefore gated on the pool actually having spread — at 0–0 nobody is "fresh"
 * or "owed", they are all just unplayed.
 */
function fairnessDiscriminates(min: number, max: number): boolean {
  return max > 0 && min < max;
}

/** Rating at or above this is worth calling out as a strength. */
const STRONG_RATING = 0.58;
/** …but only once there is enough sample behind it to mean anything. */
const MIN_DATA_WEIGHT = 0.25;
/** Consecutive points at which the suggester starts blocking a player. */
const GASSED_STREAK = 3;

export type ExplainInput = {
  candidate: Candidate;
  mode: LineupMode;
  rung: Rung;
  situation: Situation;
  /** The metric ranking this call, from the suggestion. */
  metric: RatingMetric | null;
  fairnessFloor?: number;
  /** Fewest game points across the eligible pool — the fairness front-runner. */
  minGamePoints: number;
  /** Most game points across the eligible pool — the spread the tags need. */
  maxGamePoints: number;
};

export function explainCandidate(input: ExplainInput): Reason[] {
  const { candidate: c, mode, rung, situation, metric } = input;
  const spread = fairnessDiscriminates(input.minGamePoints, input.maxGamePoints);
  const reasons: Reason[] = [];

  // Fatigue first: it is the one tag that argues against the pick, and a coach
  // scanning the list needs to see it even when the player is recommended.
  if (c.streak >= GASSED_STREAK) {
    reasons.push({
      label: `${c.streak} straight`,
      tone: "warn",
      detail: `Played the last ${c.streak} points — blocked from most calls`,
    });
  }

  // No "fewest points" tag: the points column already shows the count over the
  // game total, so a tag saying the same thing is a word where a number was
  // enough. Only an explicit fairness floor — a rule the coach set — is worth
  // spending a tag on.
  if (
    spread &&
    input.fairnessFloor !== undefined &&
    c.gamePoints < input.fairnessFloor
  ) {
    reasons.push({
      label: "Owed",
      tone: "fair",
      detail: `Below the ${input.fairnessFloor}-point floor for this game`,
    });
  }

  // No plain "Star" tag — the tier badge beside the name already says it. The
  // one case worth a word is the guarantee, which is a rule doing the picking
  // rather than an attribute of the player.
  if (mode === "RESULTS" && rung === "STARTING" && c.tier === "STAR") {
    reasons.push({
      label: "Locked in",
      tone: "good",
      detail: "Results-mode starting call — stars are fielded first",
    });
  }

  if (metric) {
    const rating = c.ratings?.[metric];
    if (
      rating &&
      rating.score >= STRONG_RATING &&
      rating.dataWeight >= MIN_DATA_WEIGHT
    ) {
      reasons.push({
        // "Top holds", not "Holds" — the row already carries this game's H 4/5,
        // and these two must not read as the same number.
        label: metric === "hold" ? "Top holds" : "Top breaks",
        tone: "good",
        detail: `Measured ${metric} conversion across rated games is above the team's rate`,
      });
    }
  }

  if (mode !== "FAIR") {
    const wantsO = situation.ourOffense;
    // No pool tag: the row no longer shows O/D anywhere, and "matches the pool
    // we asked for" is the baseline for most of the suggested seven rather than
    // a distinguishing reason.

    const windy = situation.windStrength !== "NONE";
    if (windy && situation.attackingUpwind === true && wantsO) {
      if (c.role === "HANDLER" || c.role === "HYBRID") {
        reasons.push({
          label: "Upwind thrower",
          tone: "good",
          detail: "Handling into the wind on an upwind hold",
        });
      }
      if (c.variance === "LOW") {
        reasons.push({
          label: "Safe hands",
          tone: "good",
          detail: "Low-variance for an upwind hold",
        });
      }
    }
    if (windy && situation.attackingUpwind === false && !wantsO) {
      if (c.variance === "HIGH") {
        reasons.push({
          label: "Poaches",
          tone: "good",
          detail: "High-variance for a downwind break chance",
        });
      }
    }

    if (spread && c.streak === 0 && reasons.length < 3) {
      reasons.push({
        label: "Fresh",
        tone: "good",
        detail: "Did not play the last point",
      });
    }
  }

  return reasons;
}
