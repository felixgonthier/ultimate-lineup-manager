"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  assertTournamentOwned,
  requireTeam,
  requireUser,
} from "@/lib/session";
import {
  computeGroupStatsFromPoints,
  computePlayerStatsFromPoints,
  type GroupStats,
  type PlayerStats,
} from "@/lib/stats";

export async function getTournaments() {
  const user = await requireUser();
  if (!user.team) return [];
  return prisma.tournament.findMany({
    where: { teamId: user.team.id },
    orderBy: { date: "desc" },
    include: {
      team: { select: { name: true } },
      _count: { select: { games: true, lines: true } },
    },
  });
}

export async function getTournament(id: string) {
  const user = await requireUser();
  if (!user.team) return null;
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      team: true,
      lines: {
        orderBy: { createdAt: "asc" },
        include: {
          players: {
            include: {
              player: true,
            },
          },
        },
      },
      games: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { points: true } },
        },
      },
    },
  });
  if (!tournament || tournament.teamId !== user.team.id) return null;
  return tournament;
}

export async function createTournament(data: {
  teamId: string;
  name: string;
  location?: string;
  date: Date;
}) {
  const { team } = await requireTeam();
  if (team.id !== data.teamId) throw new Error("Not authorized");
  const tournament = await prisma.tournament.create({ data });
  revalidatePath("/tournaments");
  return tournament;
}

export async function updateTournament(
  id: string,
  data: { name?: string; location?: string; date?: Date },
) {
  const { team } = await requireTeam();
  await assertTournamentOwned(id, team.id);
  const tournament = await prisma.tournament.update({
    where: { id },
    data,
  });
  revalidatePath("/tournaments");
  revalidatePath(`/tournaments/${id}`);
  return tournament;
}

export async function deleteTournament(id: string) {
  const { team } = await requireTeam();
  await assertTournamentOwned(id, team.id);
  await prisma.tournament.delete({ where: { id } });
  revalidatePath("/tournaments");
}

export async function getTournamentPlayerStats(tournamentId: string): Promise<PlayerStats[]> {
  const user = await requireUser();
  if (!user.team) return [];
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { teamId: true },
  });
  if (!t || t.teamId !== user.team.id) return [];

  const points = await prisma.point.findMany({
    where: { game: { tournamentId } },
    select: {
      ourOffense: true,
      scoredByUs: true,
      goalPlayerId: true,
      assistPlayerId: true,
      players: { select: { playerId: true } },
    },
  });

  const playerIds = new Set<string>();
  for (const pt of points) {
    for (const pp of pt.players) playerIds.add(pp.playerId);
    if (pt.goalPlayerId) playerIds.add(pt.goalPlayerId);
    if (pt.assistPlayerId) playerIds.add(pt.assistPlayerId);
  }
  if (playerIds.size === 0) return [];

  const players = await prisma.player.findMany({
    where: { id: { in: Array.from(playerIds) } },
    select: { id: true, name: true, number: true },
  });

  return computePlayerStatsFromPoints(points, players).sort(
    (a: PlayerStats, b: PlayerStats) =>
      b.goals - a.goals || b.assists - a.assists || b.pointsPlayed - a.pointsPlayed,
  );
}

const GROUP_SIZES = [2, 3, 4, 5];
const MIN_POINTS_TOGETHER = 3;

export async function getTournamentGroupStats(tournamentId: string): Promise<GroupStats[]> {
  const user = await requireUser();
  if (!user.team) return [];
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { teamId: true },
  });
  if (!t || t.teamId !== user.team.id) return [];

  const points = await prisma.point.findMany({
    where: { game: { tournamentId } },
    select: {
      ourOffense: true,
      scoredByUs: true,
      goalPlayerId: true,
      assistPlayerId: true,
      players: { select: { playerId: true } },
    },
  });

  const playerIds = new Set<string>();
  for (const pt of points) for (const pp of pt.players) playerIds.add(pp.playerId);
  if (playerIds.size === 0) return [];

  const players = await prisma.player.findMany({
    where: { id: { in: Array.from(playerIds) } },
    select: { id: true, name: true, number: true },
  });

  return computeGroupStatsFromPoints(points, players, GROUP_SIZES, MIN_POINTS_TOGETHER);
}
