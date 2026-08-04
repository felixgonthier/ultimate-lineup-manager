"use server";

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { requireTeam } from "@/lib/session";
import { computePlayerStatsFromPoints } from "@/lib/stats";
import {
  buildLineupRatings,
  ratingsCacheTag,
  type CandidateRatings,
} from "@/lib/lineup-ratings";

/** Only competitive games say anything useful about who converts under pressure. */
const RATED_DIFFICULTIES: string[] = ["EVEN", "TOUGH"];

export type LineupIntel = {
  /** Absolute hold/break rates, so only competitive games count. */
  ratings: Record<string, CandidateRatings>;
};

/**
 * Line-calling intel for a team, cached until a point is recorded.
 *
 * The team lookup deliberately stays outside the cached scope: reading cookies
 * inside one is unsupported, so the resolved `teamId` is passed in as the cache
 * key instead. `revalidateTag` in `recordPoint`/`deleteLastPoint` clears it.
 */
const loadIntel = (teamId: string) =>
  unstable_cache(
    async (): Promise<LineupIntel> => {
      const [points, players] = await Promise.all([
        prisma.point.findMany({
          where: {
            game: { tournament: { teamId }, excludeFromStats: false },
          },
          select: {
            ourOffense: true,
            scoredByUs: true,
            callahan: true,
            goalPlayerId: true,
            assistPlayerId: true,
            hockeyAssistPlayerId: true,
            players: {
              select: { playerId: true, blocks: true, turnovers: true },
            },
            game: { select: { difficulty: true } },
          },
        }),
        prisma.player.findMany({
          where: { teamId },
          select: { id: true, name: true, number: true },
        }),
      ]);

      if (points.length === 0) return { ratings: {} };

      const rated = points.filter((pt: (typeof points)[number]) =>
        pt.game.difficulty
          ? RATED_DIFFICULTIES.includes(pt.game.difficulty)
          : false,
      );

      return {
        ratings: buildLineupRatings(
          computePlayerStatsFromPoints(rated, players),
        ),
      };
    },
    ["lineup-intel", teamId],
    { tags: [ratingsCacheTag(teamId)] },
  );

export async function getLineupIntel(): Promise<LineupIntel> {
  const { team } = await requireTeam();
  return loadIntel(team.id)();
}
