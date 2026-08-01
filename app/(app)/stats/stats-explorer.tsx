"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  analyzeGames,
  computeStats,
  DEFAULT_OPTIONS,
  pct,
  type DifficultyFilter,
  type Mode,
  type StatsOptions,
  type StatsPayload,
} from "@/lib/advanced-stats";
import { PlayersTable } from "./players-table";
import { PairsTable } from "./pairs-table";
import { RolesPanel } from "./roles-panel";
import { GamesPanel } from "./games-panel";

type Tab = "players" | "pairs" | "roles" | "games";

const TABS: { id: Tab; label: string }[] = [
  { id: "players", label: "Players" },
  { id: "pairs", label: "Pairs" },
  { id: "roles", label: "Roles" },
  { id: "games", label: "Games" },
];

const MODES: { id: Mode; label: string; hint: string }[] = [
  {
    id: "adjusted",
    label: "Adjusted",
    hint: "Every point is scored against what that same game was converting, so tough games neither punish nor flatter anyone.",
  },
  {
    id: "raw",
    label: "Raw",
    hint: "One season-wide bar for O and D points. Tough games drag their players down.",
  },
  {
    id: "noOutliers",
    label: "No outliers",
    hint: "Drops games whose conversion was a statistical outlier, then scores against the season bar.",
  },
];

const DIFFICULTIES: { id: DifficultyFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "EASY", label: "Easy" },
  { id: "EVEN", label: "Even" },
  { id: "TOUGH", label: "Tough" },
  { id: "OUT_OF_REACH", label: "Out of reach" },
];

const MIN_POINTS: number[] = [1, 5, 10, 20];

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium",
        className,
      )}
    >
      {options.map((o: { id: T; label: string }) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "px-2.5 py-1 rounded-md transition-colors whitespace-nowrap",
            value === o.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StatsExplorer({ payload }: { payload: StatsPayload }) {
  const [tab, setTab] = useState<Tab>("players");
  const [opts, setOpts] = useState<StatsOptions>(DEFAULT_OPTIONS);

  // Difficulty is scored once over every game, so labels stay put as filters move.
  const analyses = useMemo(() => analyzeGames(payload), [payload]);
  const computed = useMemo(
    () => computeStats(payload, opts, analyses),
    [payload, opts, analyses],
  );

  const activeMode = MODES.find((m: (typeof MODES)[number]) => m.id === opts.mode);

  const tournamentOptions: { id: string; label: string }[] = [
    { id: "", label: "All tournaments" },
    ...payload.tournaments.map(
      (t: (typeof payload.tournaments)[number]) => ({
        id: t.id,
        label: t.name,
      }),
    ),
  ];

  function update(patch: Partial<StatsOptions>) {
    setOpts((prev: StatsOptions) => ({ ...prev, ...patch }));
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tournament
            </p>
            <select
              value={opts.tournamentId ?? ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                update({ tournamentId: e.target.value || null })
              }
              className="w-full h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {tournamentOptions.map(
                (t: (typeof tournamentOptions)[number]) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tough games
            </p>
            <Segmented
              options={MODES.map((m: (typeof MODES)[number]) => ({
                id: m.id,
                label: m.label,
              }))}
              value={opts.mode}
              onChange={(mode: Mode) => update({ mode })}
              className="flex-wrap"
            />
            {activeMode && (
              <p className="text-xs text-muted-foreground leading-snug">
                {activeMode.hint}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Only
              </p>
              <Segmented
                options={DIFFICULTIES}
                value={opts.difficulty}
                onChange={(difficulty: DifficultyFilter) =>
                  update({ difficulty })
                }
                className="flex-wrap"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Min points
              </p>
              <Segmented
                options={MIN_POINTS.map((n: number) => ({
                  id: n,
                  label: String(n),
                }))}
                value={opts.minPoints}
                onChange={(minPoints: number) => update({ minPoints })}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground border-t pt-2.5">
            {computed.gameCount} game{computed.gameCount === 1 ? "" : "s"} ·{" "}
            {computed.pointCount} point{computed.pointCount === 1 ? "" : "s"} ·
            team converting {pct(computed.conversion)}
          </p>
        </CardContent>
      </Card>

      <Segmented
        options={TABS}
        value={tab}
        onChange={(next: Tab) => setTab(next)}
      />

      {computed.pointCount === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No points match these filters.
          </CardContent>
        </Card>
      ) : tab === "players" ? (
        <PlayersTable players={computed.players} minPoints={opts.minPoints} />
      ) : tab === "pairs" ? (
        <PairsTable pairs={computed.pairs} minPoints={opts.minPoints} />
      ) : tab === "roles" ? (
        <RolesPanel
          players={computed.players}
          shapes={computed.shapes}
          handlerShapes={computed.handlerShapes}
          minPoints={opts.minPoints}
        />
      ) : (
        <GamesPanel
          analyses={computed.analyses}
          included={computed.includedGames}
          tournaments={payload.tournaments}
        />
      )}
    </div>
  );
}
