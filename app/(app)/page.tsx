import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Users, ChevronRight, Disc } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const team = user.team;

  const [teams, recentTournaments] = team
    ? await Promise.all([
        prisma.team.findMany({
          where: { id: team.id },
          orderBy: { createdAt: "desc" },
          take: 3,
          include: {
            _count: { select: { players: { where: { active: true } } } },
          },
        }),
        prisma.tournament.findMany({
          where: { teamId: team.id },
          orderBy: { date: "desc" },
          take: 3,
          include: {
            team: { select: { name: true } },
            _count: { select: { games: true } },
          },
        }),
      ])
    : [[], []];

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Disc className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Lineup Manager</h1>
        </div>
        <span className="text-sm text-muted-foreground">
          {user.name || user.username}
        </span>
      </div>

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
          <div className="rounded-2xl border divide-y overflow-hidden">
            {recentTournaments.map((t: (typeof recentTournaments)[number]) => (
              <Link key={t.id} href={`/tournaments/${t.id}`}>
                <div className="flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.team.name} · {new Date(t.date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {t._count.games}g
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {teams.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Team
            </h2>
            <Link href="/teams" className="text-sm text-primary">
              See all
            </Link>
          </div>
          <div className="rounded-2xl border divide-y overflow-hidden">
            {teams.map((t: (typeof teams)[number]) => (
              <Link key={t.id} href={`/teams/${t.id}`}>
                <div className="flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors">
                  <p className="font-medium">{t.name}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {t._count.players} players
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!team && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No team yet</p>
              <p className="text-sm text-muted-foreground">
                Create your team to get started
              </p>
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
