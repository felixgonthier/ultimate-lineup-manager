"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ROLE_SHORT,
  ROLE_TONE,
  type PlayerAdvanced,
} from "@/lib/advanced-stats";

/**
 * The box score: what actually happened, in whole numbers. Every other tab on
 * this screen answers "how good is this player" with rates, shrinkage and peer
 * baselines — this one answers "what did they do", which is the question a
 * player asks about their own season and the one a rate can never show.
 *
 * Deliberately unfiltered by the minimum-points bar: a count of zero games'
 * worth of work is still that player's line in the book.
 */

type Column = {
  key: string;
  label: string;
  title: string;
  width: string;
  value: (p: PlayerAdvanced) => number;
  /** Counts read better as a dash at zero; totals and points played do not. */
  zeroAsDash?: boolean;
  tone?: (p: PlayerAdvanced) => string | undefined;
  dim?: boolean;
};

type Dir = "asc" | "desc";

const COLUMNS: Column[] = [
  {
    key: "pts",
    label: "Pts",
    title: "Points played",
    width: "w-12",
    value: (p: PlayerAdvanced) => p.pointsPlayed,
    dim: true,
  },
  {
    key: "opts",
    label: "O",
    title: "Offence points played",
    width: "w-10",
    value: (p: PlayerAdvanced) => p.oPoints,
    dim: true,
  },
  {
    key: "dpts",
    label: "D pts",
    title: "Defence points played",
    width: "w-12",
    value: (p: PlayerAdvanced) => p.dPoints,
    dim: true,
  },
  {
    key: "g",
    label: "G",
    title: "Goals caught",
    width: "w-10",
    value: (p: PlayerAdvanced) => p.goals,
    zeroAsDash: true,
  },
  {
    key: "a",
    label: "A",
    title: "Assists thrown",
    width: "w-10",
    value: (p: PlayerAdvanced) => p.assists,
    zeroAsDash: true,
  },
  {
    key: "a2",
    label: "HA",
    title: "Hockey assists — the pass before the assist",
    width: "w-10",
    value: (p: PlayerAdvanced) => p.hockeyAssists,
    zeroAsDash: true,
  },
  {
    key: "d",
    label: "Ds",
    title: "Blocks",
    width: "w-11",
    value: (p: PlayerAdvanced) => p.blocks,
    zeroAsDash: true,
    tone: (p: PlayerAdvanced) => (p.blocks > 0 ? "text-sky-600" : undefined),
  },
  {
    key: "to",
    label: "TO",
    title: "Turnovers — drops and throwaways charged to this player",
    width: "w-11",
    value: (p: PlayerAdvanced) => p.turnovers,
    zeroAsDash: true,
    tone: (p: PlayerAdvanced) => (p.turnovers > 0 ? "text-amber-600" : undefined),
  },
  {
    key: "cal",
    label: "Cal",
    title: "Callahans",
    width: "w-10",
    value: (p: PlayerAdvanced) => p.callahans,
    zeroAsDash: true,
    tone: (p: PlayerAdvanced) =>
      p.callahans > 0 ? "text-amber-600 font-semibold" : undefined,
  },
  {
    key: "pm",
    label: "+/−",
    title: "Points won minus points lost while on the field",
    width: "w-12",
    value: (p: PlayerAdvanced) => p.plusMinus,
    tone: (p: PlayerAdvanced) =>
      p.plusMinus > 0
        ? "text-emerald-600"
        : p.plusMinus < 0
          ? "text-rose-500"
          : undefined,
  },
];

function cell(c: Column, value: number): string {
  if (c.key === "pm") return value > 0 ? `+${value}` : String(value);
  if (c.zeroAsDash && value === 0) return "–";
  return String(value);
}

function SortArrow({ active, dir }: { active: boolean; dir: Dir }) {
  if (!active) return null;
  return dir === "asc" ? (
    <ChevronUp className="h-3 w-3 inline align-middle" />
  ) : (
    <ChevronDown className="h-3 w-3 inline align-middle" />
  );
}

export function CountsTable({ players }: { players: PlayerAdvanced[] }) {
  const [sortKey, setSortKey] = useState<string>("g");
  const [sortDir, setSortDir] = useState<Dir>("desc");

  function valueFor(p: PlayerAdvanced, key: string): number | string {
    if (key === "num") return p.number ?? Number.POSITIVE_INFINITY;
    if (key === "player") return p.name.toLowerCase();
    const col = COLUMNS.find((c: Column) => c.key === key);
    return col ? col.value(p) : 0;
  }

  const sorted = [...players].sort((a: PlayerAdvanced, b: PlayerAdvanced) => {
    const av = valueFor(a, sortKey);
    const bv = valueFor(b, sortKey);
    let cmp: number;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv));
    if (cmp === 0) cmp = a.name.localeCompare(b.name);
    return sortDir === "asc" ? cmp : -cmp;
  });

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "player" || key === "num" ? "asc" : "desc");
    }
  }

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nobody has played a point under these filters.
        </CardContent>
      </Card>
    );
  }

  // Team totals, over the countable columns only. Points played and plus-minus
  // are per-player views of the same points — seven players share every one, so
  // summing them says nothing about the team.
  const summable = (c: Column): boolean => !c.dim && c.key !== "pm";
  const totals: Record<string, number> = {};
  for (const c of COLUMNS) {
    if (!summable(c)) continue;
    totals[c.key] = sorted.reduce(
      (sum: number, p: PlayerAdvanced) => sum + c.value(p),
      0,
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-max">
            <div className="flex items-center gap-1 px-4 py-2 text-xs text-muted-foreground font-medium uppercase tracking-wide border-b">
              <button
                type="button"
                onClick={() => handleSort("num")}
                className={cn(
                  "w-7 text-center shrink-0 hover:text-foreground transition-colors",
                  sortKey === "num" && "text-foreground",
                )}
              >
                # <SortArrow active={sortKey === "num"} dir={sortDir} />
              </button>
              <button
                type="button"
                onClick={() => handleSort("player")}
                className={cn(
                  "w-28 text-left shrink-0 hover:text-foreground transition-colors",
                  sortKey === "player" && "text-foreground",
                )}
              >
                Player <SortArrow active={sortKey === "player"} dir={sortDir} />
              </button>
              <span className="w-10 text-center shrink-0">Role</span>
              {COLUMNS.map((c: Column) => (
                <button
                  key={c.key}
                  type="button"
                  title={c.title}
                  onClick={() => handleSort(c.key)}
                  className={cn(
                    c.width,
                    "text-center shrink-0 hover:text-foreground transition-colors",
                    sortKey === c.key && "text-foreground",
                  )}
                >
                  {c.label} <SortArrow active={sortKey === c.key} dir={sortDir} />
                </button>
              ))}
            </div>

            {sorted.map((p: PlayerAdvanced, i: number) => (
              <div
                key={p.id}
                className={cn(
                  "flex items-center gap-1 px-4 py-2 text-sm",
                  i < sorted.length - 1 && "border-b",
                )}
              >
                <span className="w-7 text-center shrink-0 tabular-nums text-muted-foreground">
                  {p.number ?? "–"}
                </span>
                <span className="w-28 shrink-0 font-medium truncate">
                  {p.name}
                </span>
                <span className="w-10 text-center shrink-0">
                  <span
                    className={cn(
                      "inline-block px-1.5 py-0.5 rounded text-xs font-medium",
                      ROLE_TONE[p.role],
                    )}
                  >
                    {ROLE_SHORT[p.role]}
                  </span>
                </span>
                {COLUMNS.map((c: Column) => (
                  <span
                    key={c.key}
                    className={cn(
                      c.width,
                      "text-center shrink-0 tabular-nums",
                      c.dim && "text-muted-foreground",
                      c.tone?.(p),
                    )}
                  >
                    {cell(c, c.value(p))}
                  </span>
                ))}
              </div>
            ))}

            <div className="flex items-center gap-1 px-4 py-2 text-sm border-t bg-muted/40 font-semibold">
              <span className="w-7 shrink-0" />
              <span className="w-28 shrink-0 truncate">Team</span>
              <span className="w-10 shrink-0" />
              {COLUMNS.map((c: Column) => (
                <span
                  key={c.key}
                  className={cn(
                    c.width,
                    "text-center shrink-0 tabular-nums",
                    !summable(c) && "text-muted-foreground/50 font-normal",
                  )}
                  title={
                    summable(c)
                      ? undefined
                      : "Not summable — seven players share every point"
                  }
                >
                  {summable(c) ? String(totals[c.key]) : "–"}
                </span>
              ))}
            </div>
          </div>
        </div>

        <p className="px-4 py-3 text-xs text-muted-foreground leading-relaxed border-t">
          Raw counts over the filtered games — no shrinkage, no peer baseline, no
          minimum-points bar. Goals and assists are only credited on points we
          scored; <strong className="font-medium text-foreground">Ds</strong> and{" "}
          <strong className="font-medium text-foreground">TO</strong> are counted
          on every point, won or lost. A player can appear here with a turnover
          and nothing else.
        </p>
      </CardContent>
    </Card>
  );
}
