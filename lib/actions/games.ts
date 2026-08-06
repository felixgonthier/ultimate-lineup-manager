"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  assertGameOwned,
  assertPlayerOwned,
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
          hockeyAssistPlayer: true,
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

/**
 * Lineup settings for a single game. `lineupMode: null` falls back to the
 * tournament default; `startAttackingUpwind: null` means wind is irrelevant.
 */
export async function updateGameLineupSettings(
  id: string,
  tournamentId: string,
  data: {
    lineupMode?: "FAIR" | "BALANCED" | "RESULTS" | null;
    windStrength?: "NONE" | "MODERATE" | "STRONG";
    startAttackingUpwind?: boolean | null;
    fairnessFloor?: number | null;
  },
) {
  const { team } = await requireTeam();
  await assertGameOwned(id, team.id);
  const game = await prisma.game.update({ where: { id }, data });
  revalidatePath(`/tournaments/${tournamentId}/games/${id}`);
  revalidatePath(`/tournaments/${tournamentId}/games/${id}/play`);
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

  const [teamPlayers, absences] = await Promise.all([
    prisma.player.findMany({
      where: { teamId: game.tournament.team.id, active: true },
      orderBy: [{ number: "asc" }, { name: "asc" }],
    }),
    prisma.gameAbsence.findMany({
      where: { gameId },
      select: { playerId: true },
    }),
  ]);

  return {
    game,
    teamPlayers,
    absentPlayerIds: absences.map(
      (a: (typeof absences)[number]) => a.playerId,
    ),
  };
}

/**
 * Sit a player out of this game, or bring them back in. A toggle rather than a
 * whole-roster write so rapid taps in the roster sheet commute — they can land
 * in any order and still agree with what the caller sees.
 */
export async function setGameAbsence(
  gameId: string,
  tournamentId: string,
  playerId: string,
  absent: boolean,
) {
  const { team } = await requireTeam();
  await assertGameOwned(gameId, team.id);
  await assertPlayerOwned(playerId, team.id);
  if (absent) {
    await prisma.gameAbsence.upsert({
      where: { gameId_playerId: { gameId, playerId } },
      create: { gameId, playerId },
      update: {},
    });
  } else {
    await prisma.gameAbsence.deleteMany({ where: { gameId, playerId } });
  }
  revalidatePath(`/tournaments/${tournamentId}/games/${gameId}`);
  revalidatePath(`/tournaments/${tournamentId}/games/${gameId}/play`);
}

/** Everyone back in — the one bulk move worth a button. */
export async function clearGameAbsences(gameId: string, tournamentId: string) {
  const { team } = await requireTeam();
  await assertGameOwned(gameId, team.id);
  await prisma.gameAbsence.deleteMany({ where: { gameId } });
  revalidatePath(`/tournaments/${tournamentId}/games/${gameId}`);
  revalidatePath(`/tournaments/${tournamentId}/games/${gameId}/play`);
}
