import Link from "next/link";
import { notFound } from "next/navigation";
import { getTournament, getTournamentPlayerStats } from "@/lib/actions/tournaments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ChevronLeft, ChevronRight, Layers, Play, Trophy } from "lucide-react";
import { DeleteTournamentButton } from "./delete-button";

export const dynamic = "force-dynamic";

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tournament, playerStats] = await Promise.all([
    getTournament(id),
    getTournamentPlayerStats(id),
  ]);
  if (!tournament) notFound();

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/tournaments">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold leading-tight">{tournament.name}</h1>
            <p className="text-xs text-muted-foreground">
              {tournament.team.name} · {new Date(tournament.date).toLocaleDateString()}
              {tournament.location ? ` · ${tournament.location}` : ""}
            </p>
          </div>
        </div>
        <DeleteTournamentButton id={tournament.id} />
      </div>

      {/* Lines section */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Lines
            </CardTitle>
            <Link href={`/tournaments/${id}/lines`}>
              <Button variant="outline" size="sm">
                Manage
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {tournament.lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lines set up yet</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tournament.lines.map((line: (typeof tournament.lines)[number]) => (
                <Badge key={line.id} variant="secondary">
                  {line.name} ({line.players.length})
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats leaderboard */}
      {playerStats.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-[1fr_auto_auto_auto] text-xs text-muted-foreground font-medium uppercase tracking-wide px-4 py-1 border-b">
              <span>Player</span>
              <span className="w-8 text-center">G</span>
              <span className="w-8 text-center">A</span>
              <span className="w-8 text-center">Pts</span>
            </div>
            {playerStats.map((s: (typeof playerStats)[number], i: number) => (
              <div
                key={s.id}
                className={`grid grid-cols-[1fr_auto_auto_auto] items-center px-4 py-2 text-sm ${i < playerStats.length - 1 ? "border-b" : ""}`}
              >
                <span className="font-medium truncate">
                  {s.number != null && (
                    <span className="text-muted-foreground mr-1.5">#{s.number}</span>
                  )}
                  {s.name}
                </span>
                <span className="w-8 text-center tabular-nums">{s.goals || "–"}</span>
                <span className="w-8 text-center tabular-nums">{s.assists || "–"}</span>
                <span className="w-8 text-center tabular-nums text-muted-foreground">{s.pointsPlayed}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Games section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Games</h2>
          <Link href={`/tournaments/${id}/games/new`}>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Game
            </Button>
          </Link>
        </div>

        {tournament.games.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-6 gap-2 text-center">
              <p className="text-sm text-muted-foreground">No games yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {tournament.games.map((game: (typeof tournament.games)[number]) => (
              <Card key={game.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-center">
                    <Link
                      href={`/tournaments/${id}/games/${game.id}`}
                      className="flex-1 flex items-center justify-between py-3 px-4 hover:bg-accent transition-colors"
                    >
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                          vs {game.opponentName}
                        </p>
                        <p className={`text-2xl font-bold tabular-nums leading-tight ${
                          game.scoreUs > game.scoreThem
                            ? "text-green-600"
                            : game.scoreUs < game.scoreThem
                            ? "text-red-500"
                            : "text-foreground"
                        }`}>
                          {game.scoreUs}–{game.scoreThem}
                        </p>
                        <p className="text-xs text-muted-foreground">{game._count.points} points played</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    <div className="pr-3">
                      <Link href={`/tournaments/${id}/games/${game.id}/play`}>
                        <Button size="icon" variant="default" className="h-9 w-9 rounded-full">
                          <Play className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
