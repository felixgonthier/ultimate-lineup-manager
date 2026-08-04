import { notFound } from "next/navigation";
import { getGamePlayData } from "@/lib/actions/games";
import {
  getPlayerPointCounts,
  getTournamentPointCounts,
  getTournamentPointTotal,
  getTournamentPlayerStats,
} from "@/lib/actions/points";
import { getLineupRatings } from "@/lib/actions/lineup";
import { PlayView, type GameImpact, type PlayerForm } from "./play-view";

export const dynamic = "force-dynamic";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string; gid: string }>;
}) {
  const { id: tournamentId, gid } = await params;
  const [
    playData,
    pointCounts,
    tournamentPointCounts,
    tournamentPointTotal,
    tournamentStats,
    ratings,
  ] = await Promise.all([
    getGamePlayData(gid),
    getPlayerPointCounts(gid),
    getTournamentPointCounts(tournamentId),
    getTournamentPointTotal(tournamentId),
    getTournamentPlayerStats(tournamentId),
    getLineupRatings(),
  ]);

  if (!playData || playData.game.tournament.id !== tournamentId) notFound();

  const { game, teamPlayers } = playData;
  const lines = game.tournament.lines;

  // "Hot" players: 2+ contributions (goal or assist) in their last 4 points played
  const hotPlayerIds: string[] = [];
  type GamePoint = (typeof game.points)[number];
  type PointPlayer = (typeof game.points)[number]["players"][number];
  const allPlayerIds: string[] = Array.from(
    new Set(
      game.points.flatMap((pt: GamePoint) =>
        pt.players.map((pp: PointPlayer) => pp.playerId as string),
      ),
    ),
  );
  for (const playerId of allPlayerIds) {
    const playerPoints = game.points.filter((pt: GamePoint) =>
      pt.players.some((pp: PointPlayer) => pp.playerId === playerId),
    );
    const last4 = playerPoints.slice(-4);
    const contributions = last4.filter(
      (pt: GamePoint) =>
        pt.goalPlayerId === playerId || pt.assistPlayerId === playerId,
    ).length;
    if (contributions >= 2) hotPlayerIds.push(playerId);
  }

  // Consecutive points played from the end (streak)
  const sortedPoints = [...game.points].sort(
    (a: GamePoint, b: GamePoint) => a.pointNumber - b.pointNumber,
  );
  const consecutiveCounts: Record<string, number> = {};
  for (const playerId of allPlayerIds) {
    let streak = 0;
    for (let i = sortedPoints.length - 1; i >= 0; i--) {
      if (
        sortedPoints[i].players.some(
          (pp: PointPlayer) => pp.playerId === playerId,
        )
      ) {
        streak++;
      } else {
        break;
      }
    }
    if (streak > 0) consecutiveCounts[playerId] = streak;
  }

  // What each player has actually done in this game, and how hard they have been
  // going lately — the two things a coach reads off a name between points.
  const RECENT_WINDOW = 9;
  const recentPoints = sortedPoints.slice(-RECENT_WINDOW);
  const impacts: Record<string, GameImpact> = {};
  // Every player on the roster, not just those who have played: an all-empty
  // load bar is itself the signal that someone has been sat.
  for (const playerId of teamPlayers.map(
    (p: (typeof teamPlayers)[number]) => p.id,
  )) {
    let goals = 0;
    let assists = 0;
    let blocks = 0;
    let holds = 0;
    let holdOpps = 0;
    let breaks = 0;
    let breakOpps = 0;
    for (const pt of sortedPoints) {
      const on = pt.players.find((pp: PointPlayer) => pp.playerId === playerId);
      if (!on) continue;
      blocks += on.blocks;
      if (pt.goalPlayerId === playerId) goals++;
      if (pt.assistPlayerId === playerId) assists++;
      // An unrecorded outcome is not an opportunity missed, so it counts as
      // neither. Offence points are holds to convert, defence points breaks.
      if (pt.scoredByUs === null) continue;
      if (pt.ourOffense) {
        holdOpps++;
        if (pt.scoredByUs) holds++;
      } else {
        breakOpps++;
        if (pt.scoredByUs) breaks++;
      }
    }
    impacts[playerId] = {
      goals,
      assists,
      blocks,
      holds,
      holdOpps,
      breaks,
      breakOpps,
      recent: recentPoints.map((pt: GamePoint) =>
        pt.players.some((pp: PointPlayer) => pp.playerId === playerId),
      ),
    };
  }

  // Breaks either way. A break is a point won by the team that pulled: we
  // started on defence and scored, or we started on offence and conceded.
  let breaksUs = 0;
  let breaksThem = 0;
  for (const pt of sortedPoints) {
    if (pt.scoredByUs === null) continue;
    if (!pt.ourOffense && pt.scoredByUs) breaksUs++;
    if (pt.ourOffense && !pt.scoredByUs) breaksThem++;
  }

  // The day's form, trimmed to what the row actually renders.
  const forms: Record<string, PlayerForm> = {};
  for (const st of tournamentStats) {
    forms[st.id] = {
      holds: st.holds,
      holdOpps: st.holdOpps,
      breaks: st.breaks,
      breakOpps: st.breakOpps,
      blocks: st.blocks,
      dPoints: st.dPoints,
      scores: st.goals + st.assists,
      pointsPlayed: st.pointsPlayed,
    };
  }

  // Current run of scores, so the header can say why the point matters.
  let runCount = 0;
  let runByUs: boolean | null = null;
  for (let i = sortedPoints.length - 1; i >= 0; i--) {
    const scored = sortedPoints[i].scoredByUs;
    if (scored === null) break;
    if (runByUs === null) runByUs = scored;
    else if (scored !== runByUs) break;
    runCount++;
  }

  const players = teamPlayers.map((p: (typeof teamPlayers)[number]) => ({
    id: p.id,
    name: p.name,
    role: p.role as string,
    pool: p.pool,
    tier: p.tier,
    variance: p.variance,
    pointCount: pointCounts[p.id] ?? 0,
    tournamentPointCount: tournamentPointCounts[p.id] ?? 0,
    lineIds: lines
      .filter((l: (typeof lines)[number]) =>
        l.players.some(
          (lp: (typeof lines)[number]["players"][number]) =>
            lp.player.id === p.id,
        ),
      )
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
        // Per-game override wins; otherwise inherit the tournament default.
        lineupMode: game.lineupMode ?? game.tournament.lineupMode,
        windStrength: game.windStrength,
        startAttackingUpwind: game.startAttackingUpwind,
        fairnessFloor: game.fairnessFloor,
      }}
      players={players}
      lines={lines.map((l: (typeof lines)[number]) => ({
        id: l.id,
        name: l.name,
        type: l.type as "NORMAL" | "POWER",
      }))}
      nextPointNumber={nextPointNumber}
      gamePointTotal={game.points.length}
      tournamentPointTotal={tournamentPointTotal}
      hotPlayerIds={hotPlayerIds}
      consecutiveCounts={consecutiveCounts}
      impacts={impacts}
      breaks={{ us: breaksUs, them: breaksThem }}
      forms={forms}
      run={runCount > 0 && runByUs !== null ? { count: runCount, byUs: runByUs } : null}
      ratings={ratings}
    />
  );
}
