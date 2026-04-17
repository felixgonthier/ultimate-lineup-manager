"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  assertGameOwned,
  assertTournamentOwned,
  requireTeam,
  requireUser,
} from "@/lib/session";

export async function createGame(data: {
  tournamentId: string;
  opponentName: string;
}) {
  const { team } = await requireTeam();
  await assertTournamentOwned(data.tournamentId, team.id);
  const game = await prisma.game.create({ data });
  revalidatePath(`/tournaments/${data.tournamentId}`);
  return game;
}

export async function getGame(id: string) {
  const user = await requireUser();
  if (!user.team) return null;
  const game = await prisma.game.findUnique({
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
  if (!game || game.tournament.teamId !== user.team.id) return null;
  return game;
}

export async function updateGameScore(
  id: string,
  scoreUs: number,
  scoreThem: number,
  tournamentId: string,
) {
  const { team } = await requireTeam();
  await assertGameOwned(id, team.id);
  const game = await prisma.game.update({
    where: { id },
    data: { scoreUs, scoreThem },
  });
  revalidatePath(`/tournaments/${tournamentId}/games/${id}`);
  return game;
}

export async function deleteGame(id: string, tournamentId: string) {
  const { team } = await requireTeam();
  await assertGameOwned(id, team.id);
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
