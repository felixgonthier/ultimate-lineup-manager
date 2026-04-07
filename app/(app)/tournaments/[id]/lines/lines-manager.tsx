"use client";

import { useState, useTransition } from "react";
import { createLine, deleteLine, setLinePlayers } from "@/lib/actions/lines";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Check, Zap } from "lucide-react";
import { useRouter } from "next/navigation";

type Player = {
  id: string;
  name: string;
  number: number | null;
  role: string;
};

type LineWithPlayers = {
  id: string;
  name: string;
  type: "NORMAL" | "POWER";
  players: { player: Player }[];
};

const ROLE_COLORS: Record<string, string> = {
  HANDLER: "bg-blue-100 text-blue-800",
  CUTTER: "bg-green-100 text-green-800",
  HYBRID: "bg-purple-100 text-purple-800",
};
const ROLE_LABELS: Record<string, string> = {
  HANDLER: "H",
  CUTTER: "C",
  HYBRID: "Hy",
};

export function LinesManager({
  tournamentId,
  lines: initialLines,
  allPlayers,
}: {
  tournamentId: string;
  lines: LineWithPlayers[];
  allPlayers: Player[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lines, setLines] = useState(initialLines);
  const [newLineName, setNewLineName] = useState("");
  const [newLineType, setNewLineType] = useState<"NORMAL" | "POWER">("NORMAL");
  const [expandedLine, setExpandedLine] = useState<string | null>(
    initialLines.length > 0 ? initialLines[0].id : null
  );

  async function handleAddLine(e: React.FormEvent) {
    e.preventDefault();
    if (!newLineName.trim()) return;
    const line = await createLine(tournamentId, newLineName.trim(), newLineType);
    setLines((prev) => [...prev, { id: line.id, name: line.name, type: line.type as "NORMAL" | "POWER", players: [] }]);
    setNewLineName("");
    setExpandedLine(line.id);
  }

  async function handleDeleteLine(lineId: string) {
    await deleteLine(lineId, tournamentId);
    setLines((prev) => prev.filter((l) => l.id !== lineId));
    if (expandedLine === lineId) setExpandedLine(null);
  }

  async function handleTogglePlayer(lineId: string, playerId: string) {
    const line = lines.find((l) => l.id === lineId)!;
    const isAssigned = line.players.some((lp) => lp.player.id === playerId);
    const newPlayerIds = isAssigned
      ? line.players.filter((lp) => lp.player.id !== playerId).map((lp) => lp.player.id)
      : [...line.players.map((lp) => lp.player.id), playerId];

    // Optimistic update
    const newPlayer = allPlayers.find((p) => p.id === playerId)!;
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? {
              ...l,
              players: isAssigned
                ? l.players.filter((lp) => lp.player.id !== playerId)
                : [...l.players, { player: newPlayer }],
            }
          : l
      )
    );

    await setLinePlayers(lineId, newPlayerIds, tournamentId);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3">
      {/* Add line form */}
      <form onSubmit={handleAddLine} className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={newLineName}
            onChange={(e) => setNewLineName(e.target.value)}
            placeholder="Line name (e.g. O-line, D-line)"
            className="flex-1"
          />
          <Button type="submit" disabled={!newLineName.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setNewLineType("NORMAL")}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium border transition-colors ${
              newLineType === "NORMAL"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-input hover:bg-accent"
            }`}
          >
            Normal
          </button>
          <button
            type="button"
            onClick={() => setNewLineType("POWER")}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium border transition-colors flex items-center justify-center gap-1.5 ${
              newLineType === "POWER"
                ? "bg-amber-500 text-white border-amber-500"
                : "border-input hover:bg-accent"
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            Power
          </button>
        </div>
      </form>

      {lines.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Add lines to start assigning players
        </p>
      )}

      {lines.map((line) => {
        const isExpanded = expandedLine === line.id;
        const assignedIds = new Set(line.players.map((lp) => lp.player.id));

        // Players already in another normal line are locked (for normal lines only)
        const lockedIds = new Set<string>();
        if (line.type === "NORMAL") {
          for (const otherLine of lines) {
            if (otherLine.id !== line.id && otherLine.type === "NORMAL") {
              for (const lp of otherLine.players) {
                lockedIds.add(lp.player.id);
              }
            }
          }
        }

        return (
          <Card key={line.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="flex items-center gap-2 flex-1 text-left"
                  onClick={() => setExpandedLine(isExpanded ? null : line.id)}
                >
                  <CardTitle className="text-base">{line.name}</CardTitle>
                  {line.type === "POWER" && (
                    <Badge className="text-xs bg-amber-500 hover:bg-amber-500 text-white gap-0.5">
                      <Zap className="h-2.5 w-2.5" />
                      Power
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {line.players.length} players
                  </Badge>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDeleteLine(line.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 gap-1.5">
                  {allPlayers.map((player) => {
                    const assigned = assignedIds.has(player.id);
                    const locked = !assigned && lockedIds.has(player.id);
                    return (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => !locked && handleTogglePlayer(line.id, player.id)}
                        disabled={locked}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-md border text-sm transition-colors ${
                          locked
                            ? "opacity-40 cursor-not-allowed border-input"
                            : assigned
                            ? "bg-primary/10 border-primary/40 text-primary"
                            : "border-input hover:bg-accent"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {player.number != null && (
                            <span className="text-xs font-mono w-5 text-muted-foreground">
                              #{player.number}
                            </span>
                          )}
                          <span className="font-medium">{player.name}</span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[player.role]}`}
                          >
                            {ROLE_LABELS[player.role]}
                          </span>
                        </div>
                        {assigned && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
