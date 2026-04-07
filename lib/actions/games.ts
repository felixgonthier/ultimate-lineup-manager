"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function createGame(data: {
  tournamentId: string;
  opponentName: string;
}) {
  const game = await prisma.game.create({ data });
  revalidatePath(`/tournaments/${data.tournamentId}`);
  return game;
}

export async function getGame(id: string) {
  return prisma.game.findUnique({
    where: { id },
    include: {
      tournament: {
        include: {
          team: true,
          lines: {
            include: {
              players: { include: { player: true } },
            },
          },
        },
      },
      points: {
        orderBy: { pointNumber: "asc" },
        include: {
          players: { include: { player: true } },
          assistPlayer: true,
          goalPlayer: true,
        },
      },
    },
  });
}

export async function updateGameScore(id: string, scoreUs: number, scoreThem: number, tournamentId: string) {
  const game = await prisma.game.update({
    where: { id },
    data: { scoreUs, scoreThem },
  });
  revalidatePath(`/tournaments/${tournamentId}/games/${id}`);
  return game;
}

export async function deleteGame(id: string, tournamentId: string) {
  await prisma.game.delete({ where: { id } });
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function getGamePlayData(gameId: string) {
  const game = await getGame(gameId);
  if (!game) return null;

  const teamPlayers = await prisma.player.findMany({
    where: { teamId: game.tournament.team.id, active: true },
    orderBy: [{ number: "asc" }, { name: "asc" }],
  });

  return { game, teamPlayers };
}
