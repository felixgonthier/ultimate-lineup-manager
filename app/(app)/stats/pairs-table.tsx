"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { pct, ppDelta, toneFor, type PairAdvanced } from "@/lib/advanced-stats";

type Mode = "best" | "worst" | "most";

const MODES: { id: Mode; label: string }[] = [
  { id: "best", label: "Best chemistry" },
  { id: "worst", label: "Worst" },
  { id: "most", label: "Most played" },
];

const LIMIT = 15;

export function PairsTable({
  pairs,
  minPoints,
}: {
  pairs: PairAdvanced[];
  minPoints: number;
}) {
  const [mode, setMode] = useState<Mode>("best");

  // Chemistry needs both players to have a real sample apart from each other.
  const rated = pairs.filter((p: PairAdvanced) => p.synergy !== null);
  const pool = mode === "most" ? pairs : rated;

  const sorted = [...pool].sort((a: PairAdvanced, b: PairAdvanced) => {
    if (mode === "most") return b.pointsTogether - a.pointsTogether;
    const av = a.synergy ?? 0;
    const bv = b.synergy ?? 0;
    const cmp = mode === "best" ? bv - av : av - bv;
    return cmp !== 0 ? cmp : b.pointsTogether - a.pointsTogether;
  });

  const top = sorted.slice(0, LIMIT);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 pt-4 pb-2">
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium">
            {MODES.map((m: (typeof MODES)[number]) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors whitespace-nowrap",
                  mode === m.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {top.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            No pair has {minPoints}+ points together with enough apart to compare
            yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] text-xs text-muted-foreground font-medium uppercase tracking-wide px-4 py-1.5 border-b bg-muted/30">
              <span>Pair</span>
              <span className="w-9 text-center" title="Points together">
                Pts
              </span>
              <span
                className="w-12 text-center"
                title="Conversion with both on the field"
              >
                Conv
              </span>
              <span
                className="w-12 text-center"
                title="What the pair should convert, from how each does apart"
              >
                Exp
              </span>
              <span
                className="w-12 text-center"
                title="Conversion above expectation, in percentage points"
              >
                Syn
              </span>
            </div>

            {top.map((p: PairAdvanced, i: number) => (
              <div
                key={p.key}
                className={cn(
                  "grid grid-cols-[1fr_auto_auto_auto_auto] items-center px-4 py-2 text-sm",
                  i < top.length - 1 && "border-b",
                )}
              >
                <div className="pr-2 min-w-0">
                  <p className="font-medium leading-snug truncate">
                    {p.a.name}
                    <span className="text-muted-foreground mx-1">·</span>
                    {p.b.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    apart: {pct(p.aWithout)} / {pct(p.bWithout)}
                  </p>
                </div>
                <span className="w-9 text-center tabular-nums text-muted-foreground text-xs">
                  {p.pointsTogether}
                </span>
                <span className="w-12 text-center tabular-nums">
                  {pct(p.together)}
                </span>
                <span className="w-12 text-center tabular-nums text-muted-foreground">
                  {pct(p.expected)}
                </span>
                <span
                  className={cn(
                    "w-12 text-center tabular-nums font-semibold",
                    toneFor(p.synergy) ?? "text-muted-foreground",
                  )}
                >
                  {ppDelta(p.synergy)}
                </span>
              </div>
            ))}
          </>
        )}

        <p className="px-4 py-3 text-xs text-muted-foreground leading-relaxed border-t">
          <strong className="font-medium text-foreground">Syn</strong> compares
          how the pair converts together against the average of how each converts
          without the other. A positive number means they lift each other beyond
          what either does alone — that is chemistry, not just two good players.
        </p>
      </CardContent>
    </Card>
  );
}
