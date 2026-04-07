import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Users, ChevronRight, Disc } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [teams, recentTournaments] = await Promise.all([
    prisma.team.findMany({
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { _count: { select: { players: { where: { active: true } } } } },
    }),
    prisma.tournament.findMany({
      orderBy: { date: "desc" },
      take: 3,
      include: {
        team: { select: { name: true } },
        games: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { _count: { select: { points: true } } },
        },
      },
    }),
  ]);

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Disc className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Lineup Manager</h1>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/teams">
          <Card className="h-full hover:bg-accent transition-colors">
            <CardContent className="flex flex-col items-center justify-center py-6 gap-2">
              <Users className="h-8 w-8 text-primary" />
              <span className="font-medium text-sm">Teams</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/tournaments">
          <Card className="h-full hover:bg-accent transition-colors">
            <CardContent className="flex flex-col items-center justify-center py-6 gap-2">
              <Trophy className="h-8 w-8 text-primary" />
              <span className="font-medium text-sm">Tournaments</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent tournaments */}
      {recentTournaments.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Recent Tournaments
            </h2>
            <Link href="/tournaments" className="text-sm text-primary">
              See all
            </Link>
          </div>
          <div className="space-y-2">
            {recentTournaments.map((t: (typeof recentTournaments)[number]) => {
              const lastGame = t.games[0];
              return (
                <Link key={t.id} href={`/tournaments/${t.id}`}>
                  <Card className="hover:bg-accent transition-colors">
                    <CardContent className="flex items-center justify-between py-3 px-4">
                      <div>
                        <p className="font-medium">{t.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.team.name} · {new Date(t.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {lastGame && (
                          <Badge variant="secondary" className="text-xs">
                            {lastGame._count.points}pts
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Teams overview */}
      {teams.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Teams
            </h2>
            <Link href="/teams" className="text-sm text-primary">
              See all
            </Link>
          </div>
          <div className="space-y-2">
            {teams.map((team: (typeof teams)[number]) => (
              <Link key={team.id} href={`/teams/${team.id}`}>
                <Card className="hover:bg-accent transition-colors">
                  <CardContent className="flex items-center justify-between py-3 px-4">
                    <p className="font-medium">{team.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {team._count.players} players
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {teams.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No teams yet</p>
              <p className="text-sm text-muted-foreground">Create a team to get started</p>
            </div>
            <Link href="/teams/new">
              <Button>Create Team</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
