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
  type GamePoint = (typeof game.points)[number];
  type PointPlayer = (typeof game.points)[number]["players"][number];
  const allPlayerIds = new Set(game.points.flatMap((pt: GamePoint) => pt.players.map((pp: PointPlayer) => pp.playerId)));
  for (const playerId of allPlayerIds) {
    const playerPoints = game.points.filter((pt: GamePoint) => pt.players.some((pp: PointPlayer) => pp.playerId === playerId));
    const last4 = playerPoints.slice(-4);
    const contributions = last4.filter(
      (pt: GamePoint) => pt.goalPlayerId === playerId || pt.assistPlayerId === playerId
    ).length;
    if (contributions >= 2) hotPlayerIds.push(playerId);
  }

  // Consecutive points played from the end (streak)
  const sortedPoints = [...game.points].sort((a: GamePoint, b: GamePoint) => a.pointNumber - b.pointNumber);
  const consecutiveCounts: Record<string, number> = {};
  for (const playerId of allPlayerIds) {
    let streak = 0;
    for (let i = sortedPoints.length - 1; i >= 0; i--) {
      if (sortedPoints[i].players.some((pp: PointPlayer) => pp.playerId === playerId)) {
        streak++;
      } else {
        break;
      }
    }
    if (streak > 0) consecutiveCounts[playerId] = streak;
  }

  const players = teamPlayers.map((p: (typeof teamPlayers)[number]) => ({
    id: p.id,
    name: p.name,
    number: p.number,
    role: p.role as string,
    pointCount: pointCounts[p.id] ?? 0,
    lineIds: lines
      .filter((l: (typeof lines)[number]) => l.players.some((lp: (typeof lines)[number]["players"][number]) => lp.player.id === p.id))
      .map((l: (typeof lines)[number]) => l.id),
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
      lines={lines.map((l: (typeof lines)[number]) => ({ id: l.id, name: l.name, type: l.type as "NORMAL" | "POWER" }))}
      nextPointNumber={nextPointNumber}
      hotPlayerIds={hotPlayerIds}
      consecutiveCounts={consecutiveCounts}
    />
  );
}
