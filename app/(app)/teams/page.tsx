import Link from "next/link";
import { getTeams } from "@/lib/actions/teams";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ChevronRight, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const teams = await getTeams();

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Teams</h1>
        <Link href="/teams/new">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </Link>
      </div>

      {teams.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No teams yet</p>
              <p className="text-sm text-muted-foreground">Create your first team</p>
            </div>
            <Link href="/teams/new">
              <Button>Create Team</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
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
      )}
    </div>
  );
}
