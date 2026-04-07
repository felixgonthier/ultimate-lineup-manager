"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

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
  const { playerIds, tournamentId, ...pointData } = data;

  const point = await prisma.point.create({
    data: {
      ...pointData,
      players: {
        create: playerIds.map((playerId) => ({ playerId })),
      },
    },
  });

  // Update game score
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
  const lastPoint = await prisma.point.findFirst({
    where: { gameId },
    orderBy: { pointNumber: "desc" },
  });

  if (!lastPoint) return null;

  // Reverse score if needed
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
