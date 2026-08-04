"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  pct,
  ppDelta,
  signed,
  toneFor,
  ROLES,
  ROLE_LABEL,
  ROLE_SHORT,
  ROLE_TONE,
  type PlayerAdvanced,
  type Role,
  type RoleRelative,
} from "@/lib/advanced-stats";

type Column = {
  key: string;
  label: string;
  title: string;
  width: string;
  display: (p: PlayerAdvanced) => string;
  sortValue: (p: PlayerAdvanced) => number;
  tone?: (p: PlayerAdvanced) => string | undefined;
  dim?: boolean;
  /**
   * The matching field on RoleRelative. Columns without one (raw counts like
   * points played) stay absolute even in "vs role" mode.
   */
  roleKey?: keyof RoleRelative;
  /** How the role-relative gap is rendered: a rate delta or a raw delta. */
  roleFormat?: "pp" | "number";
  /** Metrics where less is more — turnovers. Flips the colouring. */
  lowerIsBetter?: boolean;
};

type Dir = "asc" | "desc";

type Baseline = "absolute" | "role";

type RoleFilter = Role | "ALL";

/** Tone for a metric where a bigger number is a worse number. */
function toneAgainst(value: number | null): string | undefined {
  return toneFor(value === null ? null : -value);
}

/** Sorts nulls last regardless of direction by pushing them to -Infinity. */
function nullLast(value: number | null): number {
  return value === null || !Number.isFinite(value)
    ? Number.NEGATIVE_INFINITY
    : value;
}

function SortArrow({ active, dir }: { active: boolean; dir: Dir }) {
  if (!active) return null;
  return dir === "asc" ? (
    <ChevronUp className="h-3 w-3 inline align-middle" />
  ) : (
    <ChevronDown className="h-3 w-3 inline align-middle" />
  );
}

const COLUMNS: Column[] = [
  {
    key: "pts",
    label: "Pts",
    title: "Points played",
    width: "w-10",
    display: (p: PlayerAdvanced) => String(p.pointsPlayed),
    sortValue: (p: PlayerAdvanced) => p.pointsPlayed,
    dim: true,
  },
  {
    key: "conv",
    label: "Conv",
    title: "Team conversion with this player on the field",
    width: "w-12",
    display: (p: PlayerAdvanced) => pct(p.conversion),
    sortValue: (p: PlayerAdvanced) => nullLast(p.conversion),
    roleKey: "conversion",
    roleFormat: "pp",
  },
  {
    key: "impact",
    label: "Impact",
    title:
      "On-field conversion minus off-field conversion, in percentage points, within the games this player appeared in",
    width: "w-14",
    display: (p: PlayerAdvanced) => ppDelta(p.impact),
    sortValue: (p: PlayerAdvanced) => nullLast(p.impact),
    tone: (p: PlayerAdvanced) => toneFor(p.impact),
    roleKey: "impact",
    roleFormat: "pp",
  },
  {
    key: "paa",
    label: "PAA/10",
    title: "Points won above expectation, per 10 points played",
    width: "w-14",
    display: (p: PlayerAdvanced) => signed(p.paaPer10),
    sortValue: (p: PlayerAdvanced) => nullLast(p.paaPer10),
    tone: (p: PlayerAdvanced) => toneFor(p.paaPer10),
    roleKey: "paaPer10",
    roleFormat: "number",
  },
  {
    key: "hold",
    label: "Hold",
    title: "Conversion on offence points",
    width: "w-12",
    display: (p: PlayerAdvanced) => pct(p.holdPct),
    sortValue: (p: PlayerAdvanced) => nullLast(p.holdPct),
    roleKey: "holdPct",
    roleFormat: "pp",
  },
  {
    key: "brk",
    label: "Brk",
    title: "Conversion on defence points",
    width: "w-12",
    display: (p: PlayerAdvanced) => pct(p.breakPct),
    sortValue: (p: PlayerAdvanced) => nullLast(p.breakPct),
    roleKey: "breakPct",
    roleFormat: "pp",
  },
  {
    key: "blk",
    label: "Blk/D",
    title: "Blocks per defence point",
    width: "w-14",
    display: (p: PlayerAdvanced) =>
      p.blocksPerDPoint === null ? "–" : p.blocksPerDPoint.toFixed(2),
    sortValue: (p: PlayerAdvanced) => nullLast(p.blocksPerDPoint),
  },
  {
    key: "to",
    label: "TO/pt",
    title: "Drops and throwaways per point played — lower is better",
    width: "w-14",
    display: (p: PlayerAdvanced) =>
      p.turnoverRate === null ? "–" : p.turnoverRate.toFixed(2),
    sortValue: (p: PlayerAdvanced) => nullLast(p.turnoverRate),
    tone: (p: PlayerAdvanced) =>
      p.turnovers > 0 ? "text-amber-600" : undefined,
    roleKey: "turnoverRate",
    roleFormat: "number",
    lowerIsBetter: true,
  },
  {
    key: "inv",
    label: "Inv",
    title: "Share of on-field points where this player scored or assisted",
    width: "w-12",
    display: (p: PlayerAdvanced) => pct(p.involvement),
    sortValue: (p: PlayerAdvanced) => nullLast(p.involvement),
    roleKey: "involvement",
    roleFormat: "pp",
  },
  {
    key: "chain",
    label: "Chain",
    title:
      "Scoring-chain credits per point played: goals, assists and hockey assists together",
    width: "w-14",
    display: (p: PlayerAdvanced) => pct(p.chainInvolvement),
    sortValue: (p: PlayerAdvanced) => nullLast(p.chainInvolvement),
  },
];

/** In "vs role" mode a column shows the gap to same-role peers, not the value. */
function roleDisplay(p: PlayerAdvanced, c: Column): string {
  if (!c.roleKey) return c.display(p);
  const gap = p.roleRelative[c.roleKey];
  if (gap === null) return "–";
  return c.roleFormat === "number" ? signed(gap) : ppDelta(gap);
}

function roleSortValue(p: PlayerAdvanced, c: Column): number {
  if (!c.roleKey) return c.sortValue(p);
  return nullLast(p.roleRelative[c.roleKey]);
}

export function PlayersTable({
  players,
  minPoints,
}: {
  players: PlayerAdvanced[];
  minPoints: number;
}) {
  const [sortKey, setSortKey] = useState<string>("impact");
  const [sortDir, setSortDir] = useState<Dir>("desc");
  const [baseline, setBaseline] = useState<Baseline>("absolute");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");

  const eligible = players
    .filter((p: PlayerAdvanced) => p.pointsPlayed >= minPoints)
    .filter((p: PlayerAdvanced) =>
      roleFilter === "ALL" ? true : p.role === roleFilter,
    );

  function valueFor(p: PlayerAdvanced, key: string): number | string {
    if (key === "num") return p.number ?? Number.POSITIVE_INFINITY;
    if (key === "player") return p.name.toLowerCase();
    if (key === "role") return p.role;
    const col = COLUMNS.find((c: Column) => c.key === key);
    if (!col) return 0;
    return baseline === "role" ? roleSortValue(p, col) : col.sortValue(p);
  }

  const sorted = [...eligible].sort(
    (a: PlayerAdvanced, b: PlayerAdvanced) => {
      const av = valueFor(a, sortKey);
      const bv = valueFor(b, sortKey);
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      if (cmp === 0) cmp = a.name.localeCompare(b.name);
      return sortDir === "asc" ? cmp : -cmp;
    },
  );

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "player" || key === "num" ? "asc" : "desc");
    }
  }

  const controls = (
    <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-2">
      <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium">
        {(
          [
            { id: "absolute", label: "Absolute" },
            { id: "role", label: "vs Role" },
          ] as { id: Baseline; label: string }[]
        ).map((b: { id: Baseline; label: string }) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBaseline(b.id)}
            className={cn(
              "px-2.5 py-1 rounded-md transition-colors whitespace-nowrap",
              baseline === b.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="inline-flex flex-wrap rounded-lg bg-muted p-0.5 text-xs font-medium">
        {(["ALL", ...ROLES] as RoleFilter[]).map((r: RoleFilter) => (
          <button
            key={r}
            type="button"
            onClick={() => setRoleFilter(r)}
            className={cn(
              "px-2.5 py-1 rounded-md transition-colors whitespace-nowrap",
              roleFilter === r
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r === "ALL" ? "All" : ROLE_LABEL[r]}
          </button>
        ))}
      </div>
    </div>
  );

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          {controls}
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            No player has {minPoints}+ points under these filters.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        {controls}
        <div className="overflow-x-auto">
          <div className="min-w-max">
            <div className="flex items-center gap-1 px-4 py-1.5 border-b text-xs text-muted-foreground font-medium uppercase tracking-wide">
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
              <button
                type="button"
                onClick={() => handleSort("role")}
                className={cn(
                  "w-10 text-center shrink-0 hover:text-foreground transition-colors",
                  sortKey === "role" && "text-foreground",
                )}
              >
                Role <SortArrow active={sortKey === "role"} dir={sortDir} />
              </button>
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
                  {baseline === "role" && p.roleProvisional && (
                    <span
                      title={`Provisional — only ${p.rolePeers} peer${p.rolePeers === 1 ? "" : "s"} in this role`}
                      className="text-muted-foreground"
                    >
                      {" "}
                      ·
                    </span>
                  )}
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
                {COLUMNS.map((c: Column) => {
                  const roleMode = baseline === "role" && Boolean(c.roleKey);
                  const value = roleMode ? roleDisplay(p, c) : c.display(p);
                  const gap = roleMode
                    ? p.roleRelative[c.roleKey as keyof RoleRelative]
                    : null;
                  const tone = roleMode
                    ? c.lowerIsBetter
                      ? toneAgainst(gap)
                      : toneFor(gap)
                    : c.tone?.(p);
                  return (
                    <span
                      key={c.key}
                      className={cn(
                        c.width,
                        "text-center shrink-0 tabular-nums",
                        c.dim && "text-muted-foreground",
                        roleMode && p.roleProvisional && "opacity-60",
                        tone,
                      )}
                    >
                      {value}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <p className="px-4 py-3 text-xs text-muted-foreground leading-relaxed border-t">
          {baseline === "role" ? (
            <>
              Every figure is the gap to <em>other players in the same role</em>,
              with the player left out of that average. A handler is judged
              against handlers, so their lower involvement stops reading as
              weakness. A <span className="text-foreground">·</span> after a name
              means the peer group is under {5} players — suggestive, not
              evidence.
            </>
          ) : (
            <>
              <strong className="font-medium text-foreground">Impact</strong> is
              the headline efficiency number: how much better the team converts
              with a player on than off, measured only across games they played,
              so it is not skewed by which games they were at.{" "}
              <strong className="font-medium text-foreground">PAA/10</strong>{" "}
              counts points won above what an average point in that situation was
              worth.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
