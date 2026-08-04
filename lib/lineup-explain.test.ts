import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { explainCandidate, type Reason } from "./lineup-explain.ts";
import type { Candidate, Situation } from "./lineup.ts";

const ON_D: Situation = {
  ourOffense: false,
  attackingUpwind: null,
  windStrength: "NONE",
};

function candidate(id: string, over: Partial<Candidate> = {}): Candidate {
  return {
    id,
    role: "CUTTER",
    pool: "BOTH",
    tier: "CORE",
    variance: "LOW",
    gamePoints: 2,
    tournamentPoints: 10,
    streak: 0,
    ...over,
  };
}

const labels = (reasons: Reason[]) => reasons.map((r: Reason) => r.label);

describe("the Fresh tag is gone", () => {
  it("never labels an unplayed player Fresh", () => {
    const reasons = explainCandidate({
      candidate: candidate("me", { streak: 0 }),
      mode: "RESULTS",
      rung: "STARTING",
      situation: ON_D,
      metric: null,
      minGamePoints: 0,
      maxGamePoints: 6,
    });
    assert.ok(!labels(reasons).includes("Fresh"));
  });
});
