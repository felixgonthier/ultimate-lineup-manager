import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CHEMISTRY_SHRINK_K,
  buildPairChemistry,
  pairKey,
  synergyWithLine,
  type PointForChemistry,
} from "./lineup-chemistry.ts";

/** `won: null` is an undecided point. */
function pt(won: boolean | null, ids: string[]): PointForChemistry {
  return {
    scoredByUs: won,
    players: ids.map((id: string) => ({ playerId: id })),
  };
}

function repeat(n: number, make: () => PointForChemistry): PointForChemistry[] {
  return Array.from({ length: n }, () => make());
}

describe("pairKey", () => {
  it("does not care about order", () => {
    assert.equal(pairKey("a", "b"), pairKey("b", "a"));
  });
});

describe("synergy is measured against playing apart", () => {
  it("finds a pair that lifts each other", () => {
    const points = [
      ...repeat(8, () => pt(true, ["a", "b", "c", "d"])),
      ...repeat(4, () => pt(false, ["a", "e", "f", "g"])),
      ...repeat(4, () => pt(false, ["b", "e", "f", "g"])),
    ];
    const chem = buildPairChemistry(points);
    const ab = chem[pairKey("a", "b")];
    assert.ok(ab, "the pair should clear both sample gates");
    assert.ok(ab.synergy > 0.3, `expected strong positive, got ${ab.synergy}`);
    assert.equal(ab.pointsTogether, 8);
  });

  it("finds a pair that drags", () => {
    const points = [
      ...repeat(8, () => pt(false, ["x", "y", "c", "d"])),
      ...repeat(4, () => pt(true, ["x", "e", "f", "g"])),
      ...repeat(4, () => pt(true, ["y", "e", "f", "g"])),
    ];
    const chem = buildPairChemistry(points);
    const xy = chem[pairKey("x", "y")];
    assert.ok(xy);
    assert.ok(xy.synergy < -0.3, `expected strong negative, got ${xy.synergy}`);
  });

  it("reports nothing for a pair with too few points together", () => {
    const points = [
      ...repeat(5, () => pt(true, ["a", "b"])),
      ...repeat(5, () => pt(false, ["a", "e"])),
      ...repeat(5, () => pt(false, ["b", "e"])),
    ];
    assert.equal(buildPairChemistry(points)[pairKey("a", "b")], undefined);
  });

  it("reports nothing for two players who never play apart", () => {
    // Inseparable pair: no baseline exists, so no claim can be made.
    const points = repeat(20, () => pt(true, ["a", "b"]));
    assert.equal(buildPairChemistry(points)[pairKey("a", "b")], undefined);
  });

  it("shrinks a thin pairing harder than a thick one", () => {
    const build = (together: number) =>
      buildPairChemistry([
        ...repeat(together, () => pt(true, ["a", "b"])),
        ...repeat(6, () => pt(false, ["a", "e", "f"])),
        ...repeat(6, () => pt(false, ["b", "e", "f"])),
      ])[pairKey("a", "b")];

    const thin = build(6);
    const thick = build(20);
    assert.ok(thin && thick);
    assert.ok(
      thick.synergy > thin.synergy,
      "the same edge over more points should survive shrinkage better",
    );
    // Raw synergy is 1.0 in both cases, so the factor is the shrinkage itself.
    assert.equal(thin.synergy, 6 / (6 + CHEMISTRY_SHRINK_K));
  });

  it("ignores undecided points", () => {
    const points = [
      ...repeat(8, () => pt(true, ["a", "b"])),
      ...repeat(20, () => pt(null, ["a", "b"])),
      ...repeat(4, () => pt(false, ["a", "e"])),
      ...repeat(4, () => pt(false, ["b", "e"])),
    ];
    assert.equal(buildPairChemistry(points)[pairKey("a", "b")].pointsTogether, 8);
  });

  it("returns nothing for no points", () => {
    assert.deepEqual(buildPairChemistry([]), {});
  });
});

describe("synergyWithLine", () => {
  const chem = {
    [pairKey("a", "b")]: { synergy: 0.2, pointsTogether: 10 },
    [pairKey("a", "c")]: { synergy: -0.1, pointsTogether: 10 },
  };

  it("averages only the pairings that have data", () => {
    const got = synergyWithLine(chem, "a", ["b", "c", "zzz"]);
    assert.deepEqual(got, { mean: (0.2 - 0.1) / 2, pairs: 2 });
  });

  it("skips the player themselves", () => {
    const got = synergyWithLine(chem, "a", ["a", "b"]);
    assert.deepEqual(got, { mean: 0.2, pairs: 1 });
  });

  it("returns null when no pairing has enough history", () => {
    assert.equal(synergyWithLine(chem, "a", ["zzz"]), null);
    assert.equal(synergyWithLine(chem, "a", []), null);
  });
});
