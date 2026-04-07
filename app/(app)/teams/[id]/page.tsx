import Link from "next/link";
import { notFound } from "next/navigation";
import { getTeam } from "@/lib/actions/teams";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { DeleteTeamButton } from "./delete-button";

export const dynamic = "force-dynamic";

const ROLE_LABELS = { HANDLER: "Handler", CUTTER: "Cutter", HYBRID: "Hybrid" };
const ROLE_COLORS: Record<string, string> = {
  HANDLER: "bg-blue-100 text-blue-800",
  CUTTER: "bg-green-100 text-green-800",
  HYBRID: "bg-purple-100 text-purple-800",
};

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await getTeam(id);
  if (!team) notFound();

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/teams">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">{team.name}</h1>
        </div>
        <DeleteTeamButton id={team.id} />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {team.players.length} active player{team.players.length !== 1 ? "s" : ""}
        </p>
        <Link href={`/teams/${team.id}/players/new`}>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Player
          </Button>
        </Link>
      </div>

      {team.players.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <p className="font-medium">No players yet</p>
            <p className="text-sm text-muted-foreground">Add players to your roster</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="p-0 gap-0">
          {team.players.map((player, i) => (
            <Link key={player.id} href={`/teams/${team.id}/players/${player.id}/edit`}>
              <div className={`flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors${i > 0 ? " border-t" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-8 shrink-0">
                    {player.number != null ? `#${player.number}` : ""}
                  </span>
                  <span className="font-medium">{player.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[player.role]}`}>
                    {ROLE_LABELS[player.role]}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
