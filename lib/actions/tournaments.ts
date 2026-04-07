"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function getTournaments(teamId?: string) {
  return prisma.tournament.findMany({
    where: teamId ? { teamId } : undefined,
    orderBy: { date: "desc" },
    include: {
      team: { select: { name: true } },
      _count: { select: { games: true, lines: true } },
    },
  });
}

export async function getTournament(id: string) {
  return prisma.tournament.findUnique({
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
}

export async function createTournament(data: {
  teamId: string;
  name: string;
  location?: string;
  date: Date;
}) {
  const tournament = await prisma.tournament.create({ data });
  revalidatePath("/tournaments");
  return tournament;
}

export async function updateTournament(
  id: string,
  data: { name?: string; location?: string; date?: Date }
) {
  const tournament = await prisma.tournament.update({ where: { id }, data });
  revalidatePath("/tournaments");
  revalidatePath(`/tournaments/${id}`);
  return tournament;
}

export async function deleteTournament(id: string) {
  await prisma.tournament.delete({ where: { id } });
  revalidatePath("/tournaments");
}

export async function getTournamentPlayerStats(tournamentId: string) {
  const [goalsData, assistsData, pointsPlayedData] = await Promise.all([
    prisma.point.groupBy({
      by: ["goalPlayerId"],
      where: { game: { tournamentId }, scoredByUs: true, goalPlayerId: { not: null } },
      _count: { goalPlayerId: true },
    }),
    prisma.point.groupBy({
      by: ["assistPlayerId"],
      where: { game: { tournamentId }, scoredByUs: true, assistPlayerId: { not: null } },
      _count: { assistPlayerId: true },
    }),
    prisma.pointPlayer.groupBy({
      by: ["playerId"],
      where: { point: { game: { tournamentId } } },
      _count: { playerId: true },
    }),
  ]);

  const stats: Record<string, { goals: number; assists: number; pointsPlayed: number }> = {};

  for (const g of goalsData) {
    if (!g.goalPlayerId) continue;
    stats[g.goalPlayerId] ??= { goals: 0, assists: 0, pointsPlayed: 0 };
    stats[g.goalPlayerId].goals = g._count.goalPlayerId;
  }
  for (const a of assistsData) {
    if (!a.assistPlayerId) continue;
    stats[a.assistPlayerId] ??= { goals: 0, assists: 0, pointsPlayed: 0 };
    stats[a.assistPlayerId].assists = a._count.assistPlayerId;
  }
  for (const p of pointsPlayedData) {
    stats[p.playerId] ??= { goals: 0, assists: 0, pointsPlayed: 0 };
    stats[p.playerId].pointsPlayed = p._count.playerId;
  }

  const playerIds = Object.keys(stats);
  if (playerIds.length === 0) return [];

  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, name: true, number: true },
  });

  return players
    .map((p) => ({ ...p, ...(stats[p.id] ?? { goals: 0, assists: 0, pointsPlayed: 0 }) }))
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.pointsPlayed - a.pointsPlayed);
}
