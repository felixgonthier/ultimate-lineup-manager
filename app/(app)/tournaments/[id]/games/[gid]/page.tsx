import Link from "next/link";
import { notFound } from "next/navigation";
import { getGame } from "@/lib/actions/games";
import { computePlayerStatsFromPoints } from "@/lib/stats";
import { requireUser } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Play } from "lucide-react";
import { StatsLeaderboard } from "../../stats-leaderboard";
export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string; gid: string }>;
}) {
  const { id: tournamentId, gid } = await params;
  const [user, game] = await Promise.all([requireUser(), getGame(gid)]);
  if (!game || game.tournament.id !== tournamentId) notFound();
  const isAdmin = user.type === "ADMIN";

  const playerLookup = new Map<string, { id: string; name: string; number: number | null }>();
  for (const pt of game.points) {
    for (const pp of pt.players) {
      playerLookup.set(pp.player.id, { id: pp.player.id, name: pp.player.name, number: pp.player.number });
    }
    if (pt.assistPlayer) {
      playerLookup.set(pt.assistPlayer.id, { id: pt.assistPlayer.id, name: pt.assistPlayer.name, number: pt.assistPlayer.number });
    }
    if (pt.goalPlayer) {
      playerLookup.set(pt.goalPlayer.id, { id: pt.goalPlayer.id, name: pt.goalPlayer.name, number: pt.goalPlayer.number });
    }
  }
  const playerStats = computePlayerStatsFromPoints(
    game.points.map((pt: (typeof game.points)[number]) => ({
      ourOffense: pt.ourOffense,
      scoredByUs: pt.scoredByUs,
      goalPlayerId: pt.goalPlayerId,
      assistPlayerId: pt.assistPlayerId,
      players: pt.players.map((pp: (typeof pt.players)[number]) => ({ playerId: pp.player.id })),
    })),
    Array.from(playerLookup.values()),
  );

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href={`/tournaments/${tournamentId}`}>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">vs {game.opponentName}</h1>
            <p className="text-xs text-muted-foreground">{game.tournament.name}</p>
          </div>
        </div>
        <Link href={`/tournaments/${tournamentId}/games/${gid}/play`}>
          <Button size="sm">
            <Play className="h-4 w-4 mr-1" />
            Play
          </Button>
        </Link>
      </div>

      {/* Score */}
      <Card>
        <CardContent className="flex items-center justify-center gap-6 py-6">
          <div className="text-center">
            <p className="text-4xl font-bold">{game.scoreUs}</p>
            <p className="text-xs text-muted-foreground">Us</p>
          </div>
          <span className="text-2xl text-muted-foreground">–</span>
          <div className="text-center">
            <p className="text-4xl font-bold">{game.scoreThem}</p>
            <p className="text-xs text-muted-foreground">{game.opponentName}</p>
          </div>
        </CardContent>
      </Card>

      {/* Player stats */}
      {playerStats.length > 0 && (
        <StatsLeaderboard stats={playerStats} showAdvanced={isAdmin} />
      )}

      {/* Points history */}
      {game.points.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Points ({game.points.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {game.points.map((point: (typeof game.points)[number], i: number) => {
              // Compute running score up to and including this point
              const pointsSoFar = game.points.slice(0, i + 1);
              const us = pointsSoFar.filter((p: (typeof game.points)[number]) => p.scoredByUs === true).length;
              const them = pointsSoFar.filter((p: (typeof game.points)[number]) => p.scoredByUs === false).length;
              const scored = point.scoredByUs === true;
              const lost = point.scoredByUs === false;

              return (
                <div
                  key={point.id}
                  className="flex items-start gap-3 px-4 py-3 border-b last:border-0"
                >
                  {/* Left: outcome dot */}
                  <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                    <div className={`h-2 w-2 rounded-full mt-1 ${scored ? "bg-emerald-500" : lost ? "bg-rose-400" : "bg-muted-foreground/30"}`} />
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {/* O/D pill */}
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${point.ourOffense ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
                        {point.ourOffense ? "Off" : "Def"}
                      </span>
                      {/* Running score */}
                      <span className={`font-bold tabular-nums text-sm ${scored ? "text-emerald-600" : lost ? "text-rose-500" : ""}`}>
                        {us}–{them}
                      </span>
                      {/* Scorer */}
                      {point.goalPlayer && (
                        <span className="text-sm text-foreground/80 truncate">
                          {point.assistPlayer
                            ? <>{point.assistPlayer.name} <span className="text-muted-foreground">→</span> <span className="font-medium">{point.goalPlayer.name}</span></>
                            : <span className="font-medium">{point.goalPlayer.name}</span>
                          }
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {point.players.map((pp: (typeof point.players)[number]) => pp.player.name).join(" · ")}
                    </p>
                  </div>

                  {/* Point number */}
                  <span className="text-xs text-muted-foreground/50 font-mono shrink-0 pt-1">#{point.pointNumber}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
