"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createPlayer } from "@/lib/actions/teams";
type PlayerRole = "HANDLER" | "CUTTER" | "HYBRID";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

const ROLES: { value: PlayerRole; label: string }[] = [
  { value: "HANDLER", label: "Handler" },
  { value: "CUTTER", label: "Cutter" },
  { value: "HYBRID", label: "Hybrid" },
];

export default function NewPlayerPage() {
  const router = useRouter();
  const params = useParams();
  const teamId = params.id as string;

  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [role, setRole] = useState<PlayerRole>("CUTTER");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await createPlayer({
      teamId,
      name: name.trim(),
      number: number ? parseInt(number) : null,
      role,
    });
    router.push(`/teams/${teamId}`);
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href={`/teams/${teamId}`}>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold">Add Player</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            autoFocus
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="number">Jersey number (optional)</Label>
          <Input
            id="number"
            type="number"
            min="0"
            max="99"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="e.g. 7"
          />
        </div>

        <div className="space-y-2">
          <Label>Role</Label>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                className={`py-2 px-3 rounded-md border text-sm font-medium transition-colors ${
                  role === r.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-input hover:bg-accent"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
          {loading ? "Adding…" : "Add Player"}
        </Button>
      </form>
    </div>
  );
}
