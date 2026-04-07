"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createGame } from "@/lib/actions/games";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export default function NewGamePage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.id as string;

  const [opponent, setOpponent] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!opponent.trim()) return;
    setLoading(true);
    const game = await createGame({ tournamentId, opponentName: opponent.trim() });
    router.push(`/tournaments/${tournamentId}/games/${game.id}/play`);
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href={`/tournaments/${tournamentId}`}>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold">New Game</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="opponent">Opponent name</Label>
          <Input
            id="opponent"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="e.g. Furious George"
            autoFocus
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading || !opponent.trim()}>
          {loading ? "Starting…" : "Start Game"}
        </Button>
      </form>
    </div>
  );
}
