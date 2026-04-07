"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTeam } from "@/lib/actions/teams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export default function NewTeamPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const team = await createTeam(name.trim());
    router.push(`/teams/${team.id}`);
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/teams">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold">New Team</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Team name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Furious George"
            autoFocus
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
          {loading ? "Creating…" : "Create Team"}
        </Button>
      </form>
    </div>
  );
}
