"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { ratingsCacheTag } from "@/lib/lineup-ratings";
import {
  assertGameOwned,
  assertPlayerOwned,
  assertTournamentOwned,
  requireTeam,
} from "@/lib/session";
import { computePlayerStatsFromPoints, isCallahanPoint } from "@/lib/stats";
import type { Rung } from "@/lib/lineup";

export async function recordPoint(data: {
  gameId: string;
  tournamentId: string;
  pointNumber: number;
  ourOffense: boolean;
  /** Which end we attacked. null/undefined when wind is irrelevant. */
  attackingUpwind?: boolean | null;
  /** Rung of the aggression ladder this line was called from. */
  rung?: Rung | null;
  playerIds: string[];
  /** Defensive blocks ("D"s) credited this point, keyed by player id. */
  blocks?: Record<string, number>;
  /** Drops and throwaways charged this point, keyed by player id. */
  turnovers?: Record<string, number>;
  scoredByUs?: boolean;
  assistPlayerId?: string;
  goalPlayerId?: string;
  /** Thrower of the pass before the assist. */
  hockeyAssistPlayerId?: string;
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
  if (data.hockeyAssistPlayerId) {
    await assertPlayerOwned(data.hockeyAssistPlayerId, team.id);
  }

  const { playerIds, tournamentId, blocks, turnovers, ...rest } = data;

  // Implied, not chosen: a goal with no assist can only have been a callahan.
  const callahan = isCallahanPoint(rest);
  // A hockey assist only exists behind an assist, and nobody throws to themself.
  const hockeyAssistPlayerId =
    rest.assistPlayerId &&
    rest.hockeyAssistPlayerId &&
    rest.hockeyAssistPlayerId !== rest.assistPlayerId
      ? rest.hockeyAssistPlayerId
      : null;
  const pointData = { ...rest, hockeyAssistPlayerId, callahan };

  // Blocks are only credited to players who were on the field for this point.
  const blockCount = (playerId: string): number => {
    const raw = blocks?.[playerId] ?? 0;
    const n = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
    // A callahan implies the scorer got the block, even if it wasn't tapped in.
    if (callahan && playerId === pointData.goalPlayerId) return Math.max(1, n);
    return n;
  };

  // Same rule for turnovers: only chargeable to someone who was on the field.
  const turnoverCount = (playerId: string): number => {
    const raw = turnovers?.[playerId] ?? 0;
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  };

  const point = await prisma.point.create({
    data: {
      ...pointData,
      players: {
        create: playerIds.map((playerId: string) => ({
          playerId,
          blocks: blockCount(playerId),
          turnovers: turnoverCount(playerId),
        })),
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

  // "max" marks the ratings stale rather than expiring them, so the next point
  // is served from cache while fresh rates load behind it.
  revalidateTag(ratingsCacheTag(team.id), "max");
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
  // "max" marks the ratings stale rather than expiring them, so the next point
  // is served from cache while fresh rates load behind it.
  revalidateTag(ratingsCacheTag(team.id), "max");
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

/**
 * Season-so-far form for the sideline: every player's conversion, defensive work
 * rate and scoring involvement across this tournament. A single game gives too
 * thin a sample to call a line off — one blown hold and a 0/1 reads like a
 * liability — so the play screen shows the day's numbers alongside the game's.
 */
export async function getTournamentPlayerStats(tournamentId: string) {
  const { team } = await requireTeam();
  await assertTournamentOwned(tournamentId, team.id);

  const [points, players] = await Promise.all([
    prisma.point.findMany({
      where: { game: { tournamentId } },
      select: {
        ourOffense: true,
        scoredByUs: true,
        callahan: true,
        goalPlayerId: true,
        assistPlayerId: true,
        hockeyAssistPlayerId: true,
        players: { select: { playerId: true, blocks: true, turnovers: true } },
      },
    }),
    prisma.player.findMany({
      where: { teamId: team.id, active: true },
      select: { id: true, name: true, number: true },
    }),
  ]);

  return computePlayerStatsFromPoints(points, players);
}

/**
 * Points recorded across the tournament — the denominator that turns a player's
 * count into a share of the day.
 */
export async function getTournamentPointTotal(
  tournamentId: string,
): Promise<number> {
  const { team } = await requireTeam();
  await assertTournamentOwned(tournamentId, team.id);
  return prisma.point.count({ where: { game: { tournamentId } } });
}

/**
 * Points played across the whole tournament. Fairness is scoped per game — a
 * results-mode bracket game must not distort the next game's fairness math —
 * but fatigue accumulates across the day, so it needs the wider count.
 */
export async function getTournamentPointCounts(tournamentId: string) {
  const { team } = await requireTeam();
  await assertTournamentOwned(tournamentId, team.id);

  const pointPlayers = await prisma.pointPlayer.findMany({
    where: { point: { game: { tournamentId } } },
    select: { playerId: true },
  });

  const counts: Record<string, number> = {};
  for (const pp of pointPlayers) {
    counts[pp.playerId] = (counts[pp.playerId] || 0) + 1;
  }
  return counts;
}
