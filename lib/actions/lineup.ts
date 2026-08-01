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
const RATED_DIFFICULTIES = ["EVEN", "TOUGH"] as const;

/**
 * Hold/break ratings for a team, cached until a point is recorded.
 *
 * The team lookup deliberately stays outside the cached scope: reading cookies
 * inside one is unsupported, so the resolved `teamId` is passed in as the cache
 * key instead. `revalidateTag` in `recordPoint`/`deleteLastPoint` clears it.
 */
const loadRatings = (teamId: string) =>
  unstable_cache(
    async (): Promise<Record<string, CandidateRatings>> => {
      const [points, players] = await Promise.all([
        prisma.point.findMany({
          where: {
            game: {
              tournament: { teamId },
              excludeFromStats: false,
              difficulty: { in: [...RATED_DIFFICULTIES] },
            },
          },
          select: {
            ourOffense: true,
            scoredByUs: true,
            callahan: true,
            goalPlayerId: true,
            assistPlayerId: true,
            players: { select: { playerId: true, blocks: true } },
          },
        }),
        prisma.player.findMany({
          where: { teamId },
          select: { id: true, name: true, number: true },
        }),
      ]);

      if (points.length === 0) return {};
      return buildLineupRatings(
        computePlayerStatsFromPoints(points, players),
      );
    },
    ["lineup-ratings", teamId],
    { tags: [ratingsCacheTag(teamId)] },
  );

export async function getLineupRatings(): Promise<
  Record<string, CandidateRatings>
> {
  const { team } = await requireTeam();
  return loadRatings(team.id)();
}
