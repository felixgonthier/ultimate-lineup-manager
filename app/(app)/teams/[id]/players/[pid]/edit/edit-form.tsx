"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePlayer, deletePlayer } from "@/lib/actions/teams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ChevronLeft, Trash2 } from "lucide-react";
import Link from "next/link";

type PlayerRole = "HANDLER" | "CUTTER" | "HYBRID";
type Player = {
  id: string;
  name: string;
  number: number | null;
  role: PlayerRole;
  teamId: string;
};

const ROLES: { value: PlayerRole; label: string }[] = [
  { value: "HANDLER", label: "Handler" },
  { value: "CUTTER", label: "Cutter" },
  { value: "HYBRID", label: "Hybrid" },
];

export function EditPlayerForm({ player, teamId }: { player: Player; teamId: string }) {
  const router = useRouter();
  const [name, setName] = useState(player.name);
  const [number, setNumber] = useState(player.number?.toString() ?? "");
  const [role, setRole] = useState<PlayerRole>(player.role);
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await updatePlayer(player.id, {
      name: name.trim(),
      number: number ? parseInt(number) : null,
      role,
    });
    router.push(`/teams/${teamId}`);
  }

  async function handleDelete() {
    await deletePlayer(player.id, teamId);
    router.push(`/teams/${teamId}`);
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href={`/teams/${teamId}`}>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Edit Player</h1>
        </div>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
              />
            }
          >
            <Trash2 className="h-4 w-4" />
          </DialogTrigger>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Remove Player</DialogTitle>
              <DialogDescription>
                Remove {player.name} from the team? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
          {loading ? "Saving…" : "Save Changes"}
        </Button>
      </form>
    </div>
  );
}
