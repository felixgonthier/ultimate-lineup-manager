"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertGameOwned, requireAdminTeam } from "@/lib/session";
import {
  RESULT_LOST,
  RESULT_UNDECIDED,
  RESULT_WON,
  type Difficulty,
  type PackedPoint,
  type Role,
  type StatsPayload,
} from "@/lib/advanced-stats";

/**
 * Ships every point the team has played, packed into index arrays so the admin
 * screen can recompute stats client-side as the controls change instead of
 * round-tripping per toggle.
 */
export async function getAdvancedStatsPayload(): Promise<StatsPayload> {
  const { team } = await requireAdminTeam();

  const [players, tournaments, games, points] = await Promise.all([
    prisma.player.findMany({
      where: { teamId: team.id },
      select: { id: true, name: true, number: true, role: true },
      orderBy: [{ number: "asc" }, { name: "asc" }],
    }),
    prisma.tournament.findMany({
      where: { teamId: team.id },
      select: { id: true, name: true, date: true },
      orderBy: { date: "desc" },
    }),
    prisma.game.findMany({
      where: { tournament: { teamId: team.id } },
      select: {
        id: true,
        tournamentId: true,
        opponentName: true,
        scoreUs: true,
        scoreThem: true,
        difficulty: true,
        excludeFromStats: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.point.findMany({
      where: { game: { tournament: { teamId: team.id } } },
      select: {
        gameId: true,
        ourOffense: true,
        scoredByUs: true,
        callahan: true,
        goalPlayerId: true,
        assistPlayerId: true,
        players: { select: { playerId: true, blocks: true } },
      },
      orderBy: [{ gameId: "asc" }, { pointNumber: "asc" }],
    }),
  ]);

  const playerIndex = new Map<string, number>(
    players.map((p: (typeof players)[number], i: number) => [p.id, i]),
  );
  const tournamentIndex = new Map<string, number>(
    tournaments.map((t: (typeof tournaments)[number], i: number) => [t.id, i]),
  );
  const gameIndex = new Map<string, number>(
    games.map((g: (typeof games)[number], i: number) => [g.id, i]),
  );

  const packedPoints: PackedPoint[] = [];
  const blocks: number[][] = [];

  for (const pt of points) {
    const gi = gameIndex.get(pt.gameId);
    if (gi === undefined) continue;

    const result =
      pt.scoredByUs === true
        ? RESULT_WON
        : pt.scoredByUs === false
          ? RESULT_LOST
          : RESULT_UNDECIDED;

    const onField: number[] = [];
    const pointBlocks: [number, number][] = [];
    for (const pp of pt.players) {
      const pi = playerIndex.get(pp.playerId);
      if (pi === undefined) continue;
      onField.push(pi);
      if (pp.blocks > 0) pointBlocks.push([pi, pp.blocks]);
    }

    const goalIdx =
      pt.goalPlayerId !== null ? (playerIndex.get(pt.goalPlayerId) ?? -1) : -1;
    const assistIdx =
      pt.assistPlayerId !== null
        ? (playerIndex.get(pt.assistPlayerId) ?? -1)
        : -1;

    const packedIndex = packedPoints.length;
    packedPoints.push([
      gi,
      pt.ourOffense ? 1 : 0,
      result,
      goalIdx,
      assistIdx,
      pt.callahan ? 1 : 0,
      ...onField,
    ]);

    for (const [pi, count] of pointBlocks) {
      blocks.push([packedIndex, pi, count]);
    }
  }

  return {
    players: players.map((p: (typeof players)[number]) => ({
      id: p.id,
      name: p.name,
      number: p.number,
      role: p.role as Role,
    })),
    tournaments: tournaments.map((t: (typeof tournaments)[number]) => ({
      id: t.id,
      name: t.name,
      date: t.date.toISOString(),
    })),
    games: games.map((g: (typeof games)[number]) => ({
      id: g.id,
      tournamentIndex: tournamentIndex.get(g.tournamentId) ?? -1,
      opponent: g.opponentName,
      scoreUs: g.scoreUs,
      scoreThem: g.scoreThem,
      manualDifficulty: g.difficulty as Difficulty | null,
      excluded: g.excludeFromStats,
    })),
    points: packedPoints,
    blocks,
  };
}

export async function setGameDifficulty(
  gameId: string,
  difficulty: Difficulty | null,
): Promise<void> {
  const { team } = await requireAdminTeam();
  await assertGameOwned(gameId, team.id);
  await prisma.game.update({
    where: { id: gameId },
    data: { difficulty },
  });
  revalidatePath("/stats");
}

/** Drops a game from every stats view, in all modes. */
export async function setGameExcluded(
  gameId: string,
  excluded: boolean,
): Promise<void> {
  const { team } = await requireAdminTeam();
  await assertGameOwned(gameId, team.id);
  await prisma.game.update({
    where: { id: gameId },
    data: { excludeFromStats: excluded },
  });
  revalidatePath("/stats");
}
