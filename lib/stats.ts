export type PlayerStats = {
  id: string;
  name: string;
  number: number | null;
  goals: number;
  assists: number;
  pointsPlayed: number;
  oPoints: number;
  dPoints: number;
  oGoals: number;
  dGoals: number;
  oAssists: number;
  dAssists: number;
  plusMinus: number;
  holds: number;
  holdOpps: number;
  breaks: number;
  breakOpps: number;
};

function emptyStats(): Omit<PlayerStats, "id" | "name" | "number"> {
  return {
    goals: 0,
    assists: 0,
    pointsPlayed: 0,
    oPoints: 0,
    dPoints: 0,
    oGoals: 0,
    dGoals: 0,
    oAssists: 0,
    dAssists: 0,
    plusMinus: 0,
    holds: 0,
    holdOpps: 0,
    breaks: 0,
    breakOpps: 0,
  };
}

export type PointForStats = {
  ourOffense: boolean;
  scoredByUs: boolean | null;
  goalPlayerId: string | null;
  assistPlayerId: string | null;
  players: { playerId: string }[];
};

export function computePlayerStatsFromPoints(
  points: PointForStats[],
  players: { id: string; name: string; number: number | null }[],
): PlayerStats[] {
  const stats: Record<string, Omit<PlayerStats, "id" | "name" | "number">> = {};
  const ensure = (id: string) => (stats[id] ??= emptyStats());

  for (const pt of points) {
    const scored = pt.scoredByUs === true;
    const lost = pt.scoredByUs === false;
    for (const pp of pt.players) {
      const s = ensure(pp.playerId);
      s.pointsPlayed++;
      if (pt.ourOffense) {
        s.oPoints++;
        if (scored) s.holds++;
        if (scored || lost) s.holdOpps++;
      } else {
        s.dPoints++;
        if (scored) s.breaks++;
        if (scored || lost) s.breakOpps++;
      }
      if (scored) s.plusMinus++;
      else if (lost) s.plusMinus--;
    }
    if (pt.scoredByUs !== true) continue;
    if (pt.goalPlayerId) {
      const s = ensure(pt.goalPlayerId);
      s.goals++;
      if (pt.ourOffense) s.oGoals++;
      else s.dGoals++;
    }
    if (pt.assistPlayerId) {
      const s = ensure(pt.assistPlayerId);
      s.assists++;
      if (pt.ourOffense) s.oAssists++;
      else s.dAssists++;
    }
  }

  return players
    .filter((p: (typeof players)[number]) => stats[p.id])
    .map((p: (typeof players)[number]) => ({
      id: p.id,
      name: p.name,
      number: p.number,
      ...stats[p.id],
    }));
}

type GroupPlayer = { id: string; name: string; number: number | null };

export type GroupStats = {
  size: number;
  playerIds: string[];
  players: GroupPlayer[];
  pointsTogether: number;
  wins: number;
  losses: number;
  plusMinus: number;
};

function forEachCombination(
  ids: string[],
  k: number,
  cb: (combo: string[]) => void,
): void {
  const n = ids.length;
  if (k > n || k <= 0) return;
  const idx: number[] = Array.from({ length: k }, (_: unknown, i: number) => i);
  const combo: string[] = new Array(k);
  while (true) {
    for (let i = 0; i < k; i++) combo[i] = ids[idx[i]];
    cb(combo);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

export function computeGroupStatsFromPoints(
  points: PointForStats[],
  players: GroupPlayer[],
  sizes: number[],
  minPointsTogether: number = 1,
): GroupStats[] {
  const tally = new Map<
    string,
    { size: number; ids: string[]; pts: number; wins: number; losses: number }
  >();

  for (const pt of points) {
    const scored = pt.scoredByUs === true;
    const lost = pt.scoredByUs === false;
    const ids = pt.players
      .map((pp: (typeof pt.players)[number]) => pp.playerId)
      .sort();
    for (const size of sizes) {
      forEachCombination(ids, size, (combo: string[]) => {
        const key = `${size}:${combo.join("|")}`;
        let entry = tally.get(key);
        if (!entry) {
          entry = { size, ids: combo.slice(), pts: 0, wins: 0, losses: 0 };
          tally.set(key, entry);
        }
        entry.pts++;
        if (scored) entry.wins++;
        else if (lost) entry.losses++;
      });
    }
  }

  const byId = new Map<string, GroupPlayer>(
    players.map((p: GroupPlayer) => [p.id, p]),
  );
  const out: GroupStats[] = [];
  for (const entry of tally.values()) {
    if (entry.pts < minPointsTogether) continue;
    const groupPlayers = entry.ids
      .map((id: string) => byId.get(id))
      .filter((p: GroupPlayer | undefined): p is GroupPlayer => Boolean(p));
    if (groupPlayers.length !== entry.ids.length) continue;
    out.push({
      size: entry.size,
      playerIds: entry.ids,
      players: groupPlayers,
      pointsTogether: entry.pts,
      wins: entry.wins,
      losses: entry.losses,
      plusMinus: entry.wins - entry.losses,
    });
  }
  return out;
}
