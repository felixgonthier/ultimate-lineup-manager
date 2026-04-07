import { notFound } from "next/navigation";
import { getGamePlayData } from "@/lib/actions/games";
import { getPlayerPointCounts } from "@/lib/actions/points";
import { PlayView } from "./play-view";

export const dynamic = "force-dynamic";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string; gid: string }>;
}) {
  const { id: tournamentId, gid } = await params;
  const [playData, pointCounts] = await Promise.all([
    getGamePlayData(gid),
    getPlayerPointCounts(gid),
  ]);

  if (!playData || playData.game.tournament.id !== tournamentId) notFound();

  const { game, teamPlayers } = playData;
  const lines = game.tournament.lines;

  // "Hot" players: 2+ contributions (goal or assist) in their last 4 points played
  const hotPlayerIds: string[] = [];
  const allPlayerIds = new Set(game.points.flatMap((pt) => pt.players.map((pp) => pp.playerId)));
  for (const playerId of allPlayerIds) {
    const playerPoints = game.points.filter((pt) => pt.players.some((pp) => pp.playerId === playerId));
    const last4 = playerPoints.slice(-4);
    const contributions = last4.filter(
      (pt) => pt.goalPlayerId === playerId || pt.assistPlayerId === playerId
    ).length;
    if (contributions >= 2) hotPlayerIds.push(playerId);
  }

  // Consecutive points played from the end (streak)
  const sortedPoints = [...game.points].sort((a, b) => a.pointNumber - b.pointNumber);
  const consecutiveCounts: Record<string, number> = {};
  for (const playerId of allPlayerIds) {
    let streak = 0;
    for (let i = sortedPoints.length - 1; i >= 0; i--) {
      if (sortedPoints[i].players.some((pp) => pp.playerId === playerId)) {
        streak++;
      } else {
        break;
      }
    }
    if (streak > 0) consecutiveCounts[playerId] = streak;
  }

  const players = teamPlayers.map((p) => ({
    id: p.id,
    name: p.name,
    number: p.number,
    role: p.role as string,
    pointCount: pointCounts[p.id] ?? 0,
    lineIds: lines
      .filter((l) => l.players.some((lp) => lp.player.id === p.id))
      .map((l) => l.id),
  }));

  const nextPointNumber = game.points.length + 1;

  return (
    <PlayView
      game={{
        id: game.id,
        tournamentId,
        opponentName: game.opponentName,
        scoreUs: game.scoreUs,
        scoreThem: game.scoreThem,
      }}
      players={players}
      lines={lines.map((l) => ({ id: l.id, name: l.name, type: l.type as "NORMAL" | "POWER" }))}
      nextPointNumber={nextPointNumber}
      hotPlayerIds={hotPlayerIds}
      consecutiveCounts={consecutiveCounts}
    />
  );
}
