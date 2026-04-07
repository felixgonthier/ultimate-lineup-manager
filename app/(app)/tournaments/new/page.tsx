"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createTournament } from "@/lib/actions/tournaments";
import { getTeams } from "@/lib/actions/teams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export default function NewTournamentPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [teamId, setTeamId] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getTeams().then((t) => {
      setTeams(t);
      if (t.length === 1) setTeamId(t[0].id);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId || !name.trim()) return;
    setLoading(true);
    const tournament = await createTournament({
      teamId,
      name: name.trim(),
      location: location.trim() || undefined,
      date: new Date(date),
    });
    router.push(`/tournaments/${tournament.id}`);
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/tournaments">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold">New Tournament</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {teams.length > 1 && (
          <div className="space-y-2">
            <Label htmlFor="team">Team</Label>
            <select
              id="team"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              required
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select a team…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="name">Tournament name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nationals 2025"
            autoFocus
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location (optional)</Label>
          <Input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Vancouver, BC"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={loading || !teamId || !name.trim()}
        >
          {loading ? "Creating…" : "Create Tournament"}
        </Button>
      </form>
    </div>
  );
}
