"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlayerStats } from "@/lib/stats";

type View = "overall" | "offense" | "defense" | "plusminus";
type Dir = "asc" | "desc";

const VIEWS: { id: View; label: string }[] = [
  { id: "overall", label: "Overall" },
  { id: "offense", label: "Offense" },
  { id: "defense", label: "Defense" },
  { id: "plusminus", label: "+/−" },
];

type Column = {
  key: string;
  label: string;
  display: (s: PlayerStats) => string;
  sortValue: (s: PlayerStats) => number;
  dim?: boolean;
  tone?: (s: PlayerStats) => string | undefined;
};

function countOrDash(n: number): string {
  return n ? String(n) : "–";
}

function pctOrDash(num: number, denom: number): string {
  if (!denom) return "–";
  return `${Math.round((num / denom) * 100)}%`;
}

function plusMinusDisplay(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return String(n);
  return "0";
}

function plusMinusTone(n: number): string | undefined {
  if (n > 0) return "text-emerald-600";
  if (n < 0) return "text-rose-500";
  return undefined;
}

const MIN_OPPS_FOR_RATE = 3;

function rate(num: number, denom: number): number {
  if (!denom) return Number.NEGATIVE_INFINITY;
  return denom >= MIN_OPPS_FOR_RATE ? num / denom : -1;
}

const COLUMNS: Record<View, Column[]> = {
  overall: [
    {
      key: "g",
      label: "G",
      display: (s: PlayerStats) => countOrDash(s.goals),
      sortValue: (s: PlayerStats) => s.goals,
    },
    {
      key: "a",
      label: "A",
      display: (s: PlayerStats) => countOrDash(s.assists),
      sortValue: (s: PlayerStats) => s.assists,
    },
    {
      key: "pts",
      label: "Pts",
      display: (s: PlayerStats) => String(s.pointsPlayed),
      sortValue: (s: PlayerStats) => s.pointsPlayed,
      dim: true,
    },
  ],
  offense: [
    {
      key: "opts",
      label: "Pts",
      display: (s: PlayerStats) => String(s.oPoints),
      sortValue: (s: PlayerStats) => s.oPoints,
      dim: true,
    },
    {
      key: "og",
      label: "G",
      display: (s: PlayerStats) => countOrDash(s.oGoals),
      sortValue: (s: PlayerStats) => s.oGoals,
    },
    {
      key: "oa",
      label: "A",
      display: (s: PlayerStats) => countOrDash(s.oAssists),
      sortValue: (s: PlayerStats) => s.oAssists,
    },
    {
      key: "hold",
      label: "Hold",
      display: (s: PlayerStats) => pctOrDash(s.holds, s.holdOpps),
      sortValue: (s: PlayerStats) => rate(s.holds, s.holdOpps),
    },
  ],
  defense: [
    {
      key: "dpts",
      label: "Pts",
      display: (s: PlayerStats) => String(s.dPoints),
      sortValue: (s: PlayerStats) => s.dPoints,
      dim: true,
    },
    {
      key: "dg",
      label: "G",
      display: (s: PlayerStats) => countOrDash(s.dGoals),
      sortValue: (s: PlayerStats) => s.dGoals,
    },
    {
      key: "da",
      label: "A",
      display: (s: PlayerStats) => countOrDash(s.dAssists),
      sortValue: (s: PlayerStats) => s.dAssists,
    },
    {
      key: "break",
      label: "Brk",
      display: (s: PlayerStats) => pctOrDash(s.breaks, s.breakOpps),
      sortValue: (s: PlayerStats) => rate(s.breaks, s.breakOpps),
    },
  ],
  plusminus: [
    {
      key: "pts",
      label: "Pts",
      display: (s: PlayerStats) => String(s.pointsPlayed),
      sortValue: (s: PlayerStats) => s.pointsPlayed,
      dim: true,
    },
    {
      key: "pm",
      label: "+/−",
      display: (s: PlayerStats) => plusMinusDisplay(s.plusMinus),
      sortValue: (s: PlayerStats) => s.plusMinus,
      tone: (s: PlayerStats) => plusMinusTone(s.plusMinus),
    },
  ],
};

const DEFAULT_SORT: Record<View, string> = {
  overall: "g",
  offense: "hold",
  defense: "break",
  plusminus: "pm",
};

export function StatsLeaderboard({ stats }: { stats: PlayerStats[] }) {
  const [view, setView] = useState<View>("overall");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<Dir>("desc");
  const cols = COLUMNS[view];
  const activeKey = sortKey ?? DEFAULT_SORT[view];

  function sortValue(s: PlayerStats, key: string): number | string {
    if (key === "num") return s.number ?? Number.POSITIVE_INFINITY;
    if (key === "player") return s.name.toLowerCase();
    const col = cols.find((c: Column) => c.key === key);
    return col ? col.sortValue(s) : 0;
  }

  const sorted = [...stats].sort((a: PlayerStats, b: PlayerStats) => {
    const av = sortValue(a, activeKey);
    const bv = sortValue(b, activeKey);
    let cmp: number;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv));
    if (cmp === 0) cmp = a.name.localeCompare(b.name);
    return sortDir === "asc" ? cmp : -cmp;
  });

  function handleSort(key: string) {
    if (activeKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "player" || key === "num" ? "asc" : "desc");
    }
  }

  const gridCols =
    cols.length === 2
      ? "grid-cols-[auto_1fr_auto_auto]"
      : cols.length === 3
        ? "grid-cols-[auto_1fr_auto_auto_auto]"
        : "grid-cols-[auto_1fr_auto_auto_auto_auto]";

  function SortArrow({ active }: { active: boolean }) {
    if (!active) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3 inline align-middle" />
    ) : (
      <ChevronDown className="h-3 w-3 inline align-middle" />
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4" />
          Stats
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-4 pb-2">
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium">
            {VIEWS.map((v: (typeof VIEWS)[number]) => (
              <button
                key={v.id}
                onClick={() => {
                  setView(v.id);
                  setSortKey(null);
                  setSortDir("desc");
                }}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors",
                  view === v.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div
          className={cn(
            "grid text-xs text-muted-foreground font-medium uppercase tracking-wide px-4 py-1 border-b",
            gridCols,
          )}
        >
          <button
            onClick={() => handleSort("num")}
            className={cn(
              "w-8 text-center hover:text-foreground transition-colors flex items-center gap-1",
              activeKey === "num" && "text-foreground",
            )}
          >
            # <SortArrow active={activeKey === "num"} />
          </button>
          <button
            onClick={() => handleSort("player")}
            className={cn(
              "text-left hover:text-foreground transition-colors flex items-center gap-1",
              activeKey === "player" && "text-foreground",
            )}
          >
            Player <SortArrow active={activeKey === "player"} />
          </button>
          {cols.map((c: Column) => (
            <button
              key={c.key}
              onClick={() => handleSort(c.key)}
              className={cn(
                "w-11 text-center hover:text-foreground transition-colors flex items-center gap-1 justify-center",
                activeKey === c.key && "text-foreground",
              )}
            >
              {c.label} <SortArrow active={activeKey === c.key} />
            </button>
          ))}
        </div>
        {sorted.map((s: PlayerStats, i: number) => (
          <div
            key={s.id}
            className={cn(
              "grid items-center px-4 py-2 text-sm",
              gridCols,
              i < sorted.length - 1 ? "border-b" : "",
            )}
          >
            <span className="w-8 text-center tabular-nums text-muted-foreground">
              {s.number != null ? s.number : "–"}
            </span>
            <span className="font-medium truncate">{s.name}</span>
            {cols.map((c: Column) => (
              <span
                key={c.key}
                className={cn(
                  "w-11 text-center tabular-nums",
                  c.dim && "text-muted-foreground",
                  c.tone?.(s),
                )}
              >
                {c.display(s)}
              </span>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
