import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  clampRung,
  defaultRung,
  metricFor,
  rungLabel,
  suggestLine,
  type Candidate,
  type Role,
  type Situation,
  type Tier,
} from "./lineup.ts";

/**
 * The original fairness-only picker, copied from play-view.tsx before
 * result-based line calling existed. FAIR mode must reproduce it exactly.
 */
function legacyRecommendedIds(players: Candidate[]): Set<string> {
  if (players.length <= 7) return new Set(players.map((p: Candidate) => p.id));

  const sorted = [...players].sort(
    (a: Candidate, b: Candidate) => a.gamePoints - b.gamePoints,
  );
  const handlers = sorted.filter((p: Candidate) => p.role === "HANDLER");
  const handlerHybrids = sorted.filter(
    (p: Candidate) => p.role === "HANDLER" || p.role === "HYBRID",
  );

  if (handlers.length === 0 || handlerHybrids.length < 3) {
    return new Set(sorted.slice(0, 7).map((p: Candidate) => p.id));
  }

  const pickedIds = new Set<string>();
  const picked: Candidate[] = [];

  picked.push(handlers[0]);
  pickedIds.add(handlers[0].id);

  for (const p of handlerHybrids) {
    if (picked.length >= 3) break;
    if (!pickedIds.has(p.id)) {
      picked.push(p);
      pickedIds.add(p.id);
    }
  }
  for (const p of sorted) {
    if (picked.length >= 7) break;
    if (!pickedIds.has(p.id)) {
      picked.push(p);
      pickedIds.add(p.id);
    }
  }
  return new Set(picked.map((p: Candidate) => p.id));
}

const CALM: Situation = {
  ourOffense: true,
  attackingUpwind: null,
  windStrength: "NONE",
};

function player(id: string, over: Partial<Candidate> = {}): Candidate {
  return {
    id,
    role: "CUTTER",
    pool: "BOTH",
    tier: "CORE",
    variance: "LOW",
    gamePoints: 0,
    tournamentPoints: 0,
    streak: 0,
    ...over,
  };
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randomRoster(rng: () => number, size: number): Candidate[] {
  const roles: Role[] = ["HANDLER", "CUTTER", "HYBRID"];
  const tiers: Tier[] = ["STAR", "CORE", "DEPTH"];
  return Array.from({ length: size }, (_: unknown, i: number) =>
    player(`p${i}`, {
      role: roles[Math.floor(rng() * roles.length)],
      tier: tiers[Math.floor(rng() * tiers.length)],
      pool: rng() < 0.4 ? "O" : rng() < 0.7 ? "D" : "BOTH",
      variance: rng() < 0.5 ? "LOW" : "HIGH",
      gamePoints: Math.floor(rng() * 12),
      tournamentPoints: Math.floor(rng() * 50),
      streak: Math.floor(rng() * 5),
    }),
  );
}

describe("FAIR mode is backwards compatible", () => {
  it("matches the original picker across randomised rosters", () => {
    const rng = makeRng(20260801);
    for (let trial = 0; trial < 500; trial++) {
      const roster = randomRoster(rng, 8 + Math.floor(rng() * 16));
      const got = new Set(
        suggestLine({ candidates: roster, mode: "FAIR", situation: CALM })
          .playerIds,
      );
      assert.deepEqual(
        got,
        legacyRecommendedIds(roster),
        `trial ${trial} diverged`,
      );
    }
  });

  it("matches the original picker regardless of the rung requested", () => {
    const rng = makeRng(7);
    const roster = randomRoster(rng, 14);
    const expected = legacyRecommendedIds(roster);
    for (const rung of ["DEPTH", "STARTING", "FULL_PUSH"] as const) {
      const got = suggestLine({
        candidates: roster,
        mode: "FAIR",
        situation: CALM,
        rung,
      });
      assert.equal(got.rung, "ROTATION", "FAIR has no aggression ladder");
      assert.deepEqual(new Set(got.playerIds), expected);
    }
  });

  it("returns everyone when the roster is at or under line size", () => {
    const roster = Array.from({ length: 6 }, (_: unknown, i: number) =>
      player(`p${i}`),
    );
    const got = suggestLine({
      candidates: roster,
      mode: "RESULTS",
      situation: CALM,
    });
    assert.equal(got.playerIds.length, 6);
  });
});

describe("role floor", () => {
  it("holds even when fairness would field zero handlers", () => {
    const roster = [
      ...Array.from({ length: 7 }, (_: unknown, i: number) =>
        player(`c${i}`, { gamePoints: 0 }),
      ),
      ...Array.from({ length: 3 }, (_: unknown, i: number) =>
        player(`h${i}`, { role: "HANDLER", gamePoints: 9 }),
      ),
    ];
    const { playerIds } = suggestLine({
      candidates: roster,
      mode: "FAIR",
      situation: CALM,
    });
    const picked = playerIds.map(
      (id: string) => roster.find((p: Candidate) => p.id === id)!,
    );
    assert.ok(
      picked.filter((p: Candidate) => p.role === "HANDLER").length >= 1,
    );
    assert.ok(
      picked.filter(
        (p: Candidate) => p.role === "HANDLER" || p.role === "HYBRID",
      ).length >= 3,
    );
  });
});

describe("mode changes who plays", () => {
  // One heavily-used star plus a bench of fresh depth players. Fairness benches
  // the star; results-based line calling does the opposite.
  const roster: Candidate[] = [
    player("star", {
      tier: "STAR",
      pool: "O",
      variance: "LOW",
      gamePoints: 5,
      tournamentPoints: 20,
    }),
    ...Array.from({ length: 5 }, (_: unknown, i: number) =>
      player(`d${i}`, { tier: "DEPTH", pool: "D", variance: "HIGH" }),
    ),
    ...Array.from({ length: 3 }, (_: unknown, i: number) =>
      player(`h${i}`, { role: "HANDLER", tier: "DEPTH", pool: "D" }),
    ),
  ];

  it("RESULTS mode fields the overworked star", () => {
    const { playerIds } = suggestLine({
      candidates: roster,
      mode: "RESULTS",
      situation: CALM,
    });
    assert.ok(playerIds.includes("star"));
  });

  it("FAIR mode benches the same star for having played most", () => {
    const { playerIds } = suggestLine({
      candidates: roster,
      mode: "FAIR",
      situation: CALM,
    });
    assert.ok(!playerIds.includes("star"));
  });
});

describe("fatigue", () => {
  const roster: Candidate[] = [
    player("star", { tier: "STAR", streak: 3 }),
    ...Array.from({ length: 5 }, (_: unknown, i: number) =>
      player(`d${i}`, { tier: "DEPTH" }),
    ),
    ...Array.from({ length: 3 }, (_: unknown, i: number) =>
      player(`h${i}`, { role: "HANDLER", tier: "DEPTH" }),
    ),
  ];

  it("plays a gassed star on a results-mode starting call", () => {
    const { playerIds } = suggestLine({
      candidates: roster,
      mode: "RESULTS",
      situation: CALM,
      rung: "STARTING",
    });
    assert.ok(playerIds.includes("star"));
  });

  it("still benches a gassed star on a rest rung", () => {
    const { playerIds } = suggestLine({
      candidates: roster,
      mode: "RESULTS",
      situation: CALM,
      rung: "ROTATION",
    });
    assert.ok(!playerIds.includes("star"));
  });

  it("benches a gassed star on a balanced starting call", () => {
    const { playerIds } = suggestLine({
      candidates: roster,
      mode: "BALANCED",
      situation: CALM,
      rung: "STARTING",
    });
    assert.ok(!playerIds.includes("star"));
  });

  it("plays them anyway on a full push", () => {
    const { playerIds } = suggestLine({
      candidates: roster,
      mode: "RESULTS",
      situation: CALM,
      rung: "FULL_PUSH",
    });
    assert.ok(playerIds.includes("star"));
  });

  it("still fields a full line when everyone is gassed", () => {
    const gassed = Array.from({ length: 9 }, (_: unknown, i: number) =>
      player(`p${i}`, { streak: 4 }),
    );
    const { playerIds } = suggestLine({
      candidates: gassed,
      mode: "RESULTS",
      situation: CALM,
      rung: "STARTING",
    });
    assert.equal(playerIds.length, 7);
  });
});

describe("star guarantee on a results starting call", () => {
  // Three star cutters who are wrong-pool, high-variance and heavily played —
  // every non-skill term in the score is against them.
  const roster: Candidate[] = [
    ...Array.from({ length: 3 }, (_: unknown, i: number) =>
      player(`star${i}`, {
        tier: "STAR",
        pool: "D",
        variance: "HIGH",
        gamePoints: 12,
        tournamentPoints: 55,
        streak: 2,
      }),
    ),
    ...Array.from({ length: 4 }, (_: unknown, i: number) =>
      player(`c${i}`, { tier: "CORE", pool: "O" }),
    ),
    ...Array.from({ length: 4 }, (_: unknown, i: number) =>
      player(`h${i}`, { role: "HANDLER", tier: "CORE", pool: "O" }),
    ),
  ];

  const onOffense: Situation = {
    ourOffense: true,
    attackingUpwind: null,
    windStrength: "NONE",
  };

  it("fields every star regardless of fatigue, fairness and fit", () => {
    const { playerIds } = suggestLine({
      candidates: roster,
      mode: "RESULTS",
      situation: onOffense,
      rung: "STARTING",
    });
    for (const id of ["star0", "star1", "star2"]) {
      assert.ok(playerIds.includes(id), `expected ${id} on the line`);
    }
  });

  it("outranks the fairness floor", () => {
    const { playerIds } = suggestLine({
      candidates: roster,
      mode: "RESULTS",
      situation: onOffense,
      rung: "STARTING",
      fairnessFloor: 5,
    });
    for (const id of ["star0", "star1", "star2"]) {
      assert.ok(playerIds.includes(id), `expected ${id} on the line`);
    }
  });

  it("keeps the role floor when the stars are all cutters", () => {
    const { playerIds } = suggestLine({
      candidates: [
        ...Array.from({ length: 7 }, (_: unknown, i: number) =>
          player(`star${i}`, { tier: "STAR" }),
        ),
        ...Array.from({ length: 3 }, (_: unknown, i: number) =>
          player(`h${i}`, { role: "HANDLER", tier: "DEPTH" }),
        ),
      ],
      mode: "RESULTS",
      situation: onOffense,
      rung: "STARTING",
    });
    const handlers = playerIds.filter((id: string) => id.startsWith("h"));
    assert.equal(handlers.length, 3);
    assert.equal(playerIds.length, 7);
  });

  it("does not apply on a balanced starting call", () => {
    const { playerIds } = suggestLine({
      candidates: roster,
      mode: "BALANCED",
      situation: onOffense,
      rung: "STARTING",
    });
    assert.ok(!playerIds.includes("star0"));
  });
});

describe("fairness floor", () => {
  const roster: Candidate[] = [
    player("bench0", { tier: "DEPTH", pool: "D", variance: "HIGH" }),
    player("bench1", { tier: "DEPTH", pool: "D", variance: "HIGH" }),
    ...Array.from({ length: 4 }, (_: unknown, i: number) =>
      player(`s${i}`, { tier: "STAR", pool: "O", gamePoints: 10 }),
    ),
    ...Array.from({ length: 3 }, (_: unknown, i: number) =>
      player(`h${i}`, {
        role: "HANDLER",
        tier: "STAR",
        pool: "O",
        gamePoints: 10,
      }),
    ),
  ];

  it("forces under-played players onto the field even in RESULTS mode", () => {
    const { playerIds } = suggestLine({
      candidates: roster,
      mode: "RESULTS",
      situation: CALM,
      rung: "ROTATION",
      fairnessFloor: 2,
    });
    assert.ok(playerIds.includes("bench0"));
    assert.ok(playerIds.includes("bench1"));
  });

  it("yields to the star guarantee on a results starting call", () => {
    const { playerIds } = suggestLine({
      candidates: roster,
      mode: "RESULTS",
      situation: CALM,
      rung: "STARTING",
      fairnessFloor: 2,
    });
    // Seven stars means seven slots — the floor only ever fills what they leave.
    assert.ok(!playerIds.includes("bench0"));
    assert.ok(!playerIds.includes("bench1"));
  });
});

describe("wind", () => {
  // Nine otherwise-identical players: four handlers, five cutters.
  const roster: Candidate[] = [
    ...Array.from({ length: 5 }, (_: unknown, i: number) => player(`c${i}`)),
    ...Array.from({ length: 4 }, (_: unknown, i: number) =>
      player(`h${i}`, { role: "HANDLER" }),
    ),
  ];

  function handlersPicked(situation: Situation): number {
    const { playerIds } = suggestLine({
      candidates: roster,
      mode: "RESULTS",
      situation,
      rung: "STARTING",
    });
    return playerIds.filter((id: string) => id.startsWith("h")).length;
  }

  it("loads up on throwers for an upwind hold", () => {
    const upwind = handlersPicked({
      ourOffense: true,
      attackingUpwind: true,
      windStrength: "STRONG",
    });
    const calm = handlersPicked(CALM);
    assert.equal(calm, 3, "calm weather fields only the role floor");
    assert.ok(upwind > calm, `expected more than ${calm} handlers, got ${upwind}`);
  });
});

describe("rung selection", () => {
  it("full pushes the point where the opponent must go upwind", () => {
    assert.equal(
      defaultRung("RESULTS", {
        ourOffense: false,
        attackingUpwind: false,
        windStrength: "MODERATE",
      }),
      "FULL_PUSH",
    );
  });

  it("rests when the opponent is cruising downwind", () => {
    assert.equal(
      defaultRung("RESULTS", {
        ourOffense: false,
        attackingUpwind: true,
        windStrength: "STRONG",
      }),
      "ROTATION",
    );
  });

  it("defaults to starting lines otherwise", () => {
    assert.equal(defaultRung("RESULTS", CALM), "STARTING");
    assert.equal(defaultRung("BALANCED", CALM), "STARTING");
    assert.equal(defaultRung("FAIR", CALM), "ROTATION");
  });

  it("clamps each mode to its ceiling", () => {
    assert.equal(clampRung("FAIR", "FULL_PUSH"), "ROTATION");
    assert.equal(clampRung("BALANCED", "FULL_PUSH"), "HALF_PUSH");
    assert.equal(clampRung("BALANCED", "ROTATION"), "ROTATION");
    assert.equal(clampRung("RESULTS", "FULL_PUSH"), "FULL_PUSH");
  });
});

describe("push rungs are named for the situation", () => {
  const onD: Situation = {
    ourOffense: false,
    attackingUpwind: null,
    windStrength: "NONE",
  };
  const onO: Situation = { ...onD, ourOffense: true };

  it("labels the push rungs by what the point needs", () => {
    assert.equal(rungLabel("HALF_PUSH", onD), "Need a break");
    assert.equal(rungLabel("HALF_PUSH", onO), "Need a hold");
    assert.equal(rungLabel("FULL_PUSH", onD), "Must break");
    assert.equal(rungLabel("FULL_PUSH", onO), "Must hold");
  });

  it("leaves the non-push rungs alone", () => {
    assert.equal(rungLabel("ROTATION", onD), "Rotation");
    assert.equal(rungLabel("ROTATION", onO), "Rotation");
  });

  it("ranks on break converters on D and hold converters on O", () => {
    assert.equal(metricFor("RESULTS", "FULL_PUSH", onD), "break");
    assert.equal(metricFor("RESULTS", "FULL_PUSH", onO), "hold");
    assert.equal(metricFor("RESULTS", "HALF_PUSH", onD), "break");
  });

  it("uses no measured metric off the push rungs, or in fair mode", () => {
    assert.equal(metricFor("RESULTS", "STARTING", onD), null);
    assert.equal(metricFor("RESULTS", "ROTATION", onD), null);
    assert.equal(metricFor("FAIR", "FULL_PUSH", onD), null);
  });
});
