import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { SHRINK_K, buildLineupRatings } from "./lineup-ratings.ts";
import { suggestLine, type Candidate, type Situation } from "./lineup.ts";
import type { PlayerStats } from "./stats.ts";

function stats(id: string, over: Partial<PlayerStats> = {}): PlayerStats {
  return {
    id,
    name: id,
    number: null,
    goals: 0,
    assists: 0,
    hockeyAssists: 0,
    blocks: 0,
    turnovers: 0,
    callahans: 0,
    pointsPlayed: 0,
    oPoints: 0,
    dPoints: 0,
    oGoals: 0,
    dGoals: 0,
    oAssists: 0,
    dAssists: 0,
    oHockeyAssists: 0,
    dHockeyAssists: 0,
    oTurnovers: 0,
    dTurnovers: 0,
    plusMinus: 0,
    holds: 0,
    holdOpps: 0,
    breaks: 0,
    breakOpps: 0,
    ...over,
  };
}

const ON_D: Situation = {
  ourOffense: false,
  attackingUpwind: null,
  windStrength: "NONE",
};
const ON_O: Situation = { ...ON_D, ourOffense: true };

describe("shrinkage keeps small samples honest", () => {
  it("does not let 3-for-4 outrank a proven converter", () => {
    const players = [
      stats("hotstreak", { breaks: 3, breakOpps: 4 }),
      stats("proven", { breaks: 33, breakOpps: 60 }),
      ...Array.from({ length: 6 }, (_: unknown, i: number) =>
        stats(`avg${i}`, { breaks: 12, breakOpps: 40 }),
      ),
    ];
    const r = buildLineupRatings(players);
    assert.ok(
      r["proven"].break!.score > r["hotstreak"].break!.score,
      "55% over 60 chances should beat 75% over 4",
    );
  });

  it("scales confidence with opportunities", () => {
    const r = buildLineupRatings([
      stats("thin", { breaks: 1, breakOpps: 2 }),
      stats("thick", { breaks: 100, breakOpps: 200 }),
    ]);
    assert.ok(r["thin"].break!.dataWeight < 0.3);
    assert.ok(r["thick"].break!.dataWeight > 0.9);
    assert.equal(r["thin"].break!.dataWeight, 2 / (2 + SHRINK_K));
  });

  it("gives zero confidence to a player with no opportunities", () => {
    const r = buildLineupRatings([
      stats("nodata", { breakOpps: 0, pointsPlayed: 80 }),
      stats("measured", { breaks: 20, breakOpps: 50 }),
    ]);
    assert.equal(r["nodata"].break!.dataWeight, 0);
  });

  it("credits defensive work rate on the break rating", () => {
    const r = buildLineupRatings([
      stats("blocker", {
        breaks: 20,
        breakOpps: 50,
        dPoints: 50,
        blocks: 20,
      }),
      stats("passenger", {
        breaks: 20,
        breakOpps: 50,
        dPoints: 50,
        blocks: 0,
      }),
    ]);
    assert.ok(r["blocker"].break!.score > r["passenger"].break!.score);
  });

  it("charges giveaways against the hold rating", () => {
    const r = buildLineupRatings([
      stats("careless", {
        holds: 30,
        holdOpps: 50,
        oPoints: 50,
        oTurnovers: 20,
      }),
      stats("safe", { holds: 30, holdOpps: 50, oPoints: 50, oTurnovers: 0 }),
    ]);
    assert.ok(r["safe"].hold!.score > r["careless"].hold!.score);
  });

  it("charges giveaways against the break rating too", () => {
    const r = buildLineupRatings([
      stats("careless", {
        breaks: 20,
        breakOpps: 50,
        dPoints: 50,
        dTurnovers: 20,
      }),
      stats("safe", { breaks: 20, breakOpps: 50, dPoints: 50, dTurnovers: 0 }),
    ]);
    assert.ok(r["safe"].break!.score > r["careless"].break!.score);
  });

  it("keeps a turnover on defence out of the hold rating", () => {
    const r = buildLineupRatings([
      stats("a", {
        holds: 30,
        holdOpps: 50,
        oPoints: 50,
        dPoints: 50,
        dTurnovers: 20,
      }),
      stats("b", { holds: 30, holdOpps: 50, oPoints: 50, dPoints: 50 }),
    ]);
    assert.equal(r["a"].hold!.score, r["b"].hold!.score);
  });

  it("rates hold and break independently", () => {
    const r = buildLineupRatings([
      stats("holder", { holds: 45, holdOpps: 50, breaks: 5, breakOpps: 50 }),
      stats("breaker", { holds: 20, holdOpps: 50, breaks: 25, breakOpps: 50 }),
    ]);
    assert.ok(r["holder"].hold!.score > r["breaker"].hold!.score);
    assert.ok(r["breaker"].break!.score > r["holder"].break!.score);
  });

  it("returns nothing for an empty roster", () => {
    assert.deepEqual(buildLineupRatings([]), {});
  });
});

describe("push rungs field the team's leaders", () => {
  const measured = buildLineupRatings([
    stats("breaker", { breaks: 30, breakOpps: 50, holds: 20, holdOpps: 50 }),
    stats("holder", { breaks: 5, breakOpps: 50, holds: 45, holdOpps: 50 }),
    ...Array.from({ length: 4 }, (_: unknown, i: number) =>
      stats(`c${i}`, { breaks: 10, breakOpps: 50, holds: 30, holdOpps: 50 }),
    ),
    ...Array.from({ length: 3 }, (_: unknown, i: number) =>
      stats(`h${i}`, { breaks: 10, breakOpps: 50, holds: 30, holdOpps: 50 }),
    ),
  ]);

  function roster(): Candidate[] {
    const base = (id: string): Candidate => ({
      id,
      role: "CUTTER",
      pool: "BOTH",
      tier: "CORE",
      variance: "LOW",
      ratings: measured[id],
      gamePoints: 0,
      tournamentPoints: 0,
      streak: 0,
    });
    return [
      base("breaker"),
      base("holder"),
      ...Array.from({ length: 4 }, (_: unknown, i: number) => base(`c${i}`)),
      ...Array.from({ length: 3 }, (_: unknown, i: number) => ({
        ...base(`h${i}`),
        role: "HANDLER" as const,
      })),
    ];
  }

  it("fields the break leader when a break is needed", () => {
    const { playerIds, metric } = suggestLine({
      candidates: roster(),
      mode: "RESULTS",
      situation: ON_D,
      rung: "FULL_PUSH",
    });
    assert.equal(metric, "break");
    assert.ok(playerIds.includes("breaker"));
  });

  it("fields the hold leader when a hold is needed", () => {
    const { playerIds, metric } = suggestLine({
      candidates: roster(),
      mode: "RESULTS",
      situation: ON_O,
      rung: "FULL_PUSH",
    });
    assert.equal(metric, "hold");
    assert.ok(playerIds.includes("holder"));
  });

  it("ignores measured ratings entirely in FAIR mode", () => {
    const { metric } = suggestLine({
      candidates: roster(),
      mode: "FAIR",
      situation: ON_D,
      rung: "FULL_PUSH",
    });
    assert.equal(metric, null);
  });

  // A star the numbers dislike, against depth players the numbers love.
  function contested(): Candidate[] {
    const base = (id: string, tier: Candidate["tier"]): Candidate => ({
      id,
      role: "CUTTER",
      pool: "BOTH",
      tier,
      variance: "LOW",
      ratings: {
        break: {
          score: tier === "STAR" ? 0.1 : 0.95,
          dataWeight: 1,
        },
      },
      gamePoints: 0,
      tournamentPoints: 0,
      streak: 0,
    });
    return [
      base("star", "STAR"),
      ...Array.from({ length: 5 }, (_: unknown, i: number) =>
        base(`d${i}`, "DEPTH"),
      ),
      ...Array.from({ length: 3 }, (_: unknown, i: number) => ({
        ...base(`h${i}`, "DEPTH" as const),
        role: "HANDLER" as const,
      })),
    ];
  }

  it("RESULTS mode still fields the star on a push the numbers disagree with", () => {
    const { playerIds } = suggestLine({
      candidates: contested(),
      mode: "RESULTS",
      situation: ON_D,
      rung: "FULL_PUSH",
    });
    assert.ok(
      playerIds.includes("star"),
      "a star must not be rated off a must-win point",
    );
  });

  it("BALANCED mode lets the numbers outrank the star", () => {
    const { playerIds } = suggestLine({
      candidates: contested(),
      mode: "BALANCED",
      situation: ON_D,
      rung: "HALF_PUSH",
    });
    assert.ok(
      !playerIds.includes("star"),
      "outside results mode the measured rate should still be able to demote",
    );
  });

  it("still promotes a well-rated non-star above a poorly-rated one", () => {
    const roster = contested().map(
      (c: Candidate): Candidate =>
        c.id === "d0"
          ? { ...c, ratings: { break: { score: 0.05, dataWeight: 1 } } }
          : c,
    );
    const { playerIds } = suggestLine({
      candidates: roster,
      mode: "RESULTS",
      situation: ON_D,
      rung: "FULL_PUSH",
    });
    assert.ok(playerIds.includes("star"));
    assert.ok(!playerIds.includes("d0"), "the worst-rated depth player sits");
  });

  it("falls back to the coach's tier with no rating data", () => {
    const noData = roster().map(
      (c: Candidate): Candidate => ({
        ...c,
        ratings: undefined,
        tier: c.id === "breaker" ? "STAR" : "DEPTH",
      }),
    );
    const { playerIds } = suggestLine({
      candidates: noData,
      mode: "RESULTS",
      situation: ON_D,
      rung: "FULL_PUSH",
    });
    assert.ok(playerIds.includes("breaker"));
  });
});
