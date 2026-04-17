"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GroupStats } from "@/lib/stats";

type Mode = "best" | "worst";

const SIZES = [2, 3, 4, 5] as const;
type Size = (typeof SIZES)[number];

const LIMIT = 10;

function playerLabel(p: { name: string; number: number | null }): string {
  return p.name;
}

export function CombosCard({ groups }: { groups: GroupStats[] }) {
  const [size, setSize] = useState<Size>(2);
  const [mode, setMode] = useState<Mode>("best");

  const filtered = groups.filter((g: GroupStats) => g.size === size);
  const sorted = [...filtered].sort((a: GroupStats, b: GroupStats) =>
    mode === "best"
      ? b.plusMinus - a.plusMinus || b.pointsTogether - a.pointsTogether
      : a.plusMinus - b.plusMinus || b.pointsTogether - a.pointsTogether,
  );
  const top = sorted.slice(0, LIMIT);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Combos
          </CardTitle>
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium">
            {(["best", "worst"] as const).map((m: Mode) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors capitalize",
                  mode === m
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1.5">
          {SIZES.map((s: Size) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={cn(
                "h-8 w-8 rounded-full text-xs font-semibold tabular-nums transition-colors",
                size === s
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {top.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            Not enough data for {size}-player combos yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_auto_auto] text-xs text-muted-foreground font-medium uppercase tracking-wide px-4 py-1.5 border-b bg-muted/30">
              <span>Combo</span>
              <span className="w-9 text-center">Pts</span>
              <span className="w-11 text-center">+/−</span>
              <span className="w-11 text-center">Win%</span>
            </div>
            {top.map((g: GroupStats, i: number) => {
              const decided = g.wins + g.losses;
              const winPct = decided
                ? Math.round((g.wins / decided) * 100)
                : null;
              return (
                <div
                  key={g.playerIds.join("|")}
                  className={cn(
                    "grid grid-cols-[1fr_auto_auto_auto] items-center px-4 py-2 text-sm",
                    i < top.length - 1 ? "border-b" : "",
                  )}
                >
                  <span className="font-medium leading-snug pr-2">
                    {g.players.map(
                      (p: GroupStats["players"][number], idx: number) => (
                        <span key={p.id}>
                          {idx > 0 && (
                            <span className="text-muted-foreground mx-1">
                              ·
                            </span>
                          )}
                          {playerLabel(p)}
                        </span>
                      ),
                    )}
                  </span>
                  <span className="w-9 text-center tabular-nums text-muted-foreground text-xs">
                    {g.pointsTogether}
                  </span>
                  <span
                    className={cn(
                      "w-11 text-center tabular-nums font-semibold",
                      g.plusMinus > 0 && "text-emerald-600",
                      g.plusMinus < 0 && "text-rose-500",
                      g.plusMinus === 0 && "text-muted-foreground",
                    )}
                  >
                    {g.plusMinus > 0 ? `+${g.plusMinus}` : g.plusMinus}
                  </span>
                  <span
                    className={cn(
                      "w-11 text-center tabular-nums text-xs",
                      winPct != null &&
                        winPct > 50 &&
                        "text-emerald-600 font-medium",
                      winPct != null &&
                        winPct < 50 &&
                        "text-rose-500 font-medium",
                      (winPct == null || winPct === 50) &&
                        "text-muted-foreground",
                    )}
                  >
                    {winPct != null ? `${winPct}%` : "–"}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </CardContent>
    </Card>
  );
}
