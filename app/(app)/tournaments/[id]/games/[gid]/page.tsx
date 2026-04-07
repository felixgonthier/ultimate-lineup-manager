import Link from "next/link";
import { notFound } from "next/navigation";
import { getGame } from "@/lib/actions/games";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Play } from "lucide-react";
export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string; gid: string }>;
}) {
  const { id: tournamentId, gid } = await params;
  const game = await getGame(gid);
  if (!game || game.tournament.id !== tournamentId) notFound();

  // Get all unique players from points, tallying pts/assists/goals
  const playerMap = new Map<string, { name: string; number: number | null; role: string; count: number; assists: number; goals: number }>();

  function ensurePlayer(player: { id: string; name: string; number: number | null; role: string }) {
    if (!playerMap.has(player.id)) {
      playerMap.set(player.id, { name: player.name, number: player.number, role: player.role, count: 0, assists: 0, goals: 0 });
    }
    return playerMap.get(player.id)!;
  }

  for (const point of game.points) {
    for (const pp of point.players) {
      ensurePlayer(pp.player).count++;
    }
    if (point.assistPlayer) ensurePlayer(point.assistPlayer).assists++;
    if (point.goalPlayer) ensurePlayer(point.goalPlayer).goals++;
  }

  const sortedPlayers = Array.from(playerMap.entries()).sort(
    ([, a], [, b]) => b.count - a.count
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
      {sortedPlayers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Player Stats</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Player</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground w-12">Pts</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground w-12">Ast</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground w-12">Gls</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map(([playerId, p]) => (
                  <tr key={playerId} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium">
                      {p.number != null && <span className="text-muted-foreground font-mono text-xs mr-1">#{p.number}</span>}
                      {p.name}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.count}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{p.assists || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{p.goals || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Points history */}
      {game.points.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Points ({game.points.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {game.points.map((point, i) => {
              // Compute running score up to and including this point
              const pointsSoFar = game.points.slice(0, i + 1);
              const us = pointsSoFar.filter((p) => p.scoredByUs === true).length;
              const them = pointsSoFar.filter((p) => p.scoredByUs === false).length;
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
                      {point.players.map((pp) => pp.player.name).join(" · ")}
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
