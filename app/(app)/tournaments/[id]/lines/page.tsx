import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { LinesManager } from "./lines-manager";

export const dynamic = "force-dynamic";

export default async function LinesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      lines: {
        orderBy: { createdAt: "asc" },
        include: {
          players: { include: { player: true } },
        },
      },
      team: {
        include: {
          players: {
            where: { active: true },
            orderBy: [{ number: "asc" }, { name: "asc" }],
          },
        },
      },
    },
  });

  if (!tournament) notFound();

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/tournaments/${tournamentId}`}>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold">Manage Lines</h1>
      </div>
      <p className="text-sm text-muted-foreground">{tournament.name}</p>

      <LinesManager
        tournamentId={tournamentId}
        lines={tournament.lines}
        allPlayers={tournament.team.players}
      />
    </div>
  );
}
