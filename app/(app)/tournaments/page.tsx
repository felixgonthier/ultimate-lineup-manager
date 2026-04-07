import Link from "next/link";
import { getTournaments } from "@/lib/actions/tournaments";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trophy, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TournamentsPage() {
  const tournaments = await getTournaments();

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Tournaments</h1>
        <Link href="/tournaments/new">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </Link>
      </div>

      {tournaments.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No tournaments yet</p>
              <p className="text-sm text-muted-foreground">Create a tournament to start tracking games</p>
            </div>
            <Link href="/tournaments/new">
              <Button>Create Tournament</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tournaments.map((t) => (
            <Link key={t.id} href={`/tournaments/${t.id}`}>
              <Card className="hover:bg-accent transition-colors">
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.team.name} · {new Date(t.date).toLocaleDateString()}
                      {t.location ? ` · ${t.location}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {t._count.games}g
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
