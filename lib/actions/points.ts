"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  assertGameOwned,
  assertPlayerOwned,
  requireTeam,
} from "@/lib/session";

export async function recordPoint(data: {
  gameId: string;
  tournamentId: string;
  pointNumber: number;
  ourOffense: boolean;
  playerIds: string[];
  scoredByUs?: boolean;
  assistPlayerId?: string;
  goalPlayerId?: string;
}) {
  const { team } = await requireTeam();
  await assertGameOwned(data.gameId, team.id);
  await Promise.all(
    data.playerIds.map((id: string) => assertPlayerOwned(id, team.id)),
  );
  if (data.assistPlayerId) {
    await assertPlayerOwned(data.assistPlayerId, team.id);
  }
  if (data.goalPlayerId) {
    await assertPlayerOwned(data.goalPlayerId, team.id);
  }

  const { playerIds, tournamentId, ...pointData } = data;

  const point = await prisma.point.create({
    data: {
      ...pointData,
      players: {
        create: playerIds.map((playerId: string) => ({ playerId })),
      },
    },
  });

  if (pointData.scoredByUs !== undefined) {
    const game = await prisma.game.findUnique({
      where: { id: pointData.gameId },
    });
    if (game) {
      await prisma.game.update({
        where: { id: pointData.gameId },
        data: {
          scoreUs: pointData.scoredByUs ? game.scoreUs + 1 : game.scoreUs,
          scoreThem: pointData.scoredByUs ? game.scoreThem : game.scoreThem + 1,
        },
      });
    }
  }

  revalidatePath(`/tournaments/${tournamentId}/games/${pointData.gameId}/play`);
  revalidatePath(`/tournaments/${tournamentId}/games/${pointData.gameId}`);
  return point;
}

export async function deleteLastPoint(gameId: string, tournamentId: string) {
  const { team } = await requireTeam();
  await assertGameOwned(gameId, team.id);

  const lastPoint = await prisma.point.findFirst({
    where: { gameId },
    orderBy: { pointNumber: "desc" },
  });

  if (!lastPoint) return null;

  if (lastPoint.scoredByUs !== null) {
    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (game) {
      await prisma.game.update({
        where: { id: gameId },
        data: {
          scoreUs: lastPoint.scoredByUs ? game.scoreUs - 1 : game.scoreUs,
          scoreThem: lastPoint.scoredByUs ? game.scoreThem : game.scoreThem - 1,
        },
      });
    }
  }

  await prisma.point.delete({ where: { id: lastPoint.id } });
  revalidatePath(`/tournaments/${tournamentId}/games/${gameId}/play`);
  revalidatePath(`/tournaments/${tournamentId}/games/${gameId}`);
  return lastPoint;
}

export async function getPlayerPointCounts(gameId: string) {
  const { team } = await requireTeam();
  await assertGameOwned(gameId, team.id);

  const pointPlayers = await prisma.pointPlayer.findMany({
    where: { point: { gameId } },
    include: { player: true },
  });

  const counts: Record<string, number> = {};
  for (const pp of pointPlayers) {
    counts[pp.playerId] = (counts[pp.playerId] || 0) + 1;
  }
  return counts;
}
