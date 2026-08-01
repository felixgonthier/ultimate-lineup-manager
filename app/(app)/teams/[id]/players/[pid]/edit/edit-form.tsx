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
type PlayerPool = "O" | "D" | "BOTH";
type PlayerTier = "STAR" | "CORE" | "DEPTH";
type PlayerVariance = "LOW" | "HIGH";

type Player = {
  id: string;
  name: string;
  number: number | null;
  role: PlayerRole;
  pool: PlayerPool;
  tier: PlayerTier;
  variance: PlayerVariance;
  teamId: string;
};

const ROLES: { value: PlayerRole; label: string }[] = [
  { value: "HANDLER", label: "Handler" },
  { value: "CUTTER", label: "Cutter" },
  { value: "HYBRID", label: "Hybrid" },
];

const POOLS: { value: PlayerPool; label: string }[] = [
  { value: "O", label: "O-line" },
  { value: "D", label: "D-line" },
  { value: "BOTH", label: "Swing" },
];

const TIERS: { value: PlayerTier; label: string }[] = [
  { value: "STAR", label: "Star" },
  { value: "CORE", label: "Core" },
  { value: "DEPTH", label: "Depth" },
];

const VARIANCES: { value: PlayerVariance; label: string }[] = [
  { value: "LOW", label: "Low risk" },
  { value: "HIGH", label: "High risk" },
];

function ChoiceRow<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div
        className={`grid gap-2 ${options.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}
      >
        {options.map((o: { value: T; label: string }) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`py-2 px-3 rounded-md border text-sm font-medium transition-colors ${
              value === o.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-input hover:bg-accent"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EditPlayerForm({ player, teamId }: { player: Player; teamId: string }) {
  const router = useRouter();
  const [name, setName] = useState(player.name);
  const [number, setNumber] = useState(player.number?.toString() ?? "");
  const [role, setRole] = useState<PlayerRole>(player.role);
  const [pool, setPool] = useState<PlayerPool>(player.pool);
  const [tier, setTier] = useState<PlayerTier>(player.tier);
  const [variance, setVariance] = useState<PlayerVariance>(player.variance);
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await updatePlayer(player.id, {
      name: name.trim(),
      number: number ? parseInt(number) : null,
      role,
      pool,
      tier,
      variance,
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

        <ChoiceRow
          label="Role"
          value={role}
          options={ROLES}
          onChange={setRole}
        />

        <ChoiceRow
          label="Pool"
          hint="Which unit they belong to. Swing players are eligible for both and get pulled in for high-leverage points."
          value={pool}
          options={POOLS}
          onChange={setPool}
        />

        <ChoiceRow
          label="Usage tier"
          hint="Priority when a game is being played to win. Stars get the points that decide games."
          value={tier}
          options={TIERS}
          onChange={setTier}
        />

        <ChoiceRow
          label="Risk profile"
          hint="Low-risk players protect O-line drives; high-risk players generate the blocks that win D points."
          value={variance}
          options={VARIANCES}
          onChange={setVariance}
        />

        <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
          {loading ? "Saving…" : "Save Changes"}
        </Button>
      </form>
    </div>
  );
}
