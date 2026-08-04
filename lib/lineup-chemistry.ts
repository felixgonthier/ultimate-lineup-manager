/**
 * Which pairs of players lift each other, and which drag.
 *
 * This is the one thing the player row cannot say on its own: every other chip
 * describes an individual, while a line is a combination. So chemistry is
 * measured against what each player manages *apart* from the other — a pair that
 * converts 60% means nothing until you know they convert 55% without each other.
 *
 * Two guards keep it from surfacing noise. A pair needs `MIN_POINTS_TOGETHER`
 * decided points before it appears at all, and whatever survives is shrunk toward
 * "no effect" by `CHEMISTRY_SHRINK_K` pseudo-points. Pair samples are inherently
 * thinner than individual ones, so both are stricter than the rating shrinkage.
 */

/** Only the fields chemistry needs, so the point query can evolve freely. */
export type PointForChemistry = {
  scoredByUs: boolean | null;
  players: { playerId: string }[];
};

/** Decided points a pair must share before their chemistry is worth showing. */
export const MIN_POINTS_TOGETHER = 6;
/** Decided points each player needs apart from the other to form a baseline. */
export const MIN_POINTS_APART = 3;
/** Pseudo-points of prior, pulling thin pairs toward no effect. */
export const CHEMISTRY_SHRINK_K = 10;

export type PairChemistry = {
  /**
   * Shrunk synergy as a share of points, e.g. 0.07 means the pair converts seven
   * points per hundred above what the two manage apart. Positive means they lift.
   */
  synergy: number;
  pointsTogether: number;
};

/** Order-free key, so lookup does not care which player is named first. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function buildPairChemistry(
  points: PointForChemistry[],
): Record<string, PairChemistry> {
  const soloDecided = new Map<string, number>();
  const soloWins = new Map<string, number>();
  const bothDecided = new Map<string, number>();
  const bothWins = new Map<string, number>();

  const bump = (m: Map<string, number>, k: string, by: number) =>
    m.set(k, (m.get(k) ?? 0) + by);

  for (const pt of points) {
    // An undecided point says nothing about whether a pairing works.
    if (pt.scoredByUs === null) continue;
    const won = pt.scoredByUs ? 1 : 0;

    const ids = Array.from(
      new Set(pt.players.map((pp: PointForChemistry["players"][number]) => pp.playerId)),
    );
    for (const id of ids) {
      bump(soloDecided, id, 1);
      bump(soloWins, id, won);
    }
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = pairKey(ids[i], ids[j]);
        bump(bothDecided, key, 1);
        bump(bothWins, key, won);
      }
    }
  }

  const out: Record<string, PairChemistry> = {};

  for (const [key, together] of bothDecided) {
    if (together < MIN_POINTS_TOGETHER) continue;
    const [a, b] = key.split("|");

    // Points where one played and the other sat, derived rather than tallied:
    // every shared point is counted in both players' solo totals.
    const aApart = (soloDecided.get(a) ?? 0) - together;
    const bApart = (soloDecided.get(b) ?? 0) - together;
    if (aApart < MIN_POINTS_APART || bApart < MIN_POINTS_APART) continue;

    const aApartRate = ((soloWins.get(a) ?? 0) - (bothWins.get(key) ?? 0)) / aApart;
    const bApartRate = ((soloWins.get(b) ?? 0) - (bothWins.get(key) ?? 0)) / bApart;
    const togetherRate = (bothWins.get(key) ?? 0) / together;

    const expected = (aApartRate + bApartRate) / 2;
    const raw = togetherRate - expected;

    out[key] = {
      synergy: raw * (together / (together + CHEMISTRY_SHRINK_K)),
      pointsTogether: together,
    };
  }

  return out;
}

/**
 * Mean synergy between one player and everyone already picked, ignoring pairs
 * with too little shared history. null when no pairing has enough to say.
 */
export function synergyWithLine(
  chemistry: Record<string, PairChemistry>,
  playerId: string,
  lineIds: string[],
): { mean: number; pairs: number } | null {
  const values: number[] = [];
  for (const other of lineIds) {
    if (other === playerId) continue;
    const pair = chemistry[pairKey(playerId, other)];
    if (pair) values.push(pair.synergy);
  }
  if (values.length === 0) return null;
  return {
    mean: values.reduce((s: number, v: number) => s + v, 0) / values.length,
    pairs: values.length,
  };
}
