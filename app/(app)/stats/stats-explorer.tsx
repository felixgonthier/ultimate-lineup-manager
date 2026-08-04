"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  analyzeGames,
  computeStats,
  DEFAULT_OPTIONS,
  DIFFICULTY_LABEL,
  pct,
  type DifficultyFilter,
  type GameAnalysis,
  type Mode,
  type PayloadTournament,
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
  const [gamesOpen, setGamesOpen] = useState(false);

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

  // Games the picker offers: everything the tournament filter leaves standing,
  // minus the ones excluded outright (those can never come back from here).
  // Newest tournament first, then newest game, matching the Games tab.
  const scopedGames = useMemo(() => {
    const tournamentIndex =
      opts.tournamentId === null
        ? -1
        : payload.tournaments.findIndex(
            (t: PayloadTournament) => t.id === opts.tournamentId,
          );
    return analyses
      .filter(
        (g: GameAnalysis) =>
          !g.excluded &&
          (tournamentIndex < 0 || g.tournamentIndex === tournamentIndex),
      )
      .sort((a: GameAnalysis, b: GameAnalysis) =>
        a.tournamentIndex !== b.tournamentIndex
          ? a.tournamentIndex - b.tournamentIndex
          : b.index - a.index,
      );
  }, [analyses, opts.tournamentId, payload.tournaments]);

  const pickedIds = opts.gameIds === null ? null : new Set<string>(opts.gameIds);
  const isPicked = (g: GameAnalysis): boolean =>
    pickedIds === null || pickedIds.has(g.id);
  const pickedCount = scopedGames.filter(isPicked).length;

  function update(patch: Partial<StatsOptions>) {
    setOpts((prev: StatsOptions) => ({ ...prev, ...patch }));
  }

  /** Toggling from the "all games" state starts from the full in-scope list. */
  function toggleGame(game: GameAnalysis) {
    const base = opts.gameIds ?? scopedGames.map((g: GameAnalysis) => g.id);
    const next = base.includes(game.id)
      ? base.filter((id: string) => id !== game.id)
      : [...base, game.id];
    // Back to a full house — collapse to null so the filters stay live rather
    // than pinning today's list of games.
    const nextSet = new Set<string>(next);
    const coversAll = scopedGames.every((g: GameAnalysis) => nextSet.has(g.id));
    update({ gameIds: coversAll ? null : next });
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
                // A game pick is scoped to the games it was made from, so
                // switching tournament starts the selection over.
                update({
                  tournamentId: e.target.value || null,
                  gameIds: null,
                })
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

          {scopedGames.length > 0 && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setGamesOpen((prev: boolean) => !prev)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Games
                </p>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {opts.gameIds === null
                    ? `All ${scopedGames.length}`
                    : `${pickedCount} of ${scopedGames.length}`}
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      gamesOpen && "rotate-180",
                    )}
                  />
                </span>
              </button>

              {gamesOpen && (
                <div className="rounded-lg border">
                  <div className="flex items-center justify-between gap-2 border-b px-2.5 py-1.5">
                    <span className="text-xs text-muted-foreground">
                      Pick the games to include
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => update({ gameIds: null })}
                        className="rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => update({ gameIds: [] })}
                        className="rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {scopedGames.map((g: GameAnalysis) => {
                      const tournament = payload.tournaments[g.tournamentIndex];
                      return (
                        <label
                          key={g.id}
                          className="flex cursor-pointer items-center gap-2.5 border-b px-2.5 py-2 last:border-b-0 hover:bg-accent/50"
                        >
                          <input
                            type="checkbox"
                            checked={isPicked(g)}
                            onChange={() => toggleGame(g)}
                            className="h-4 w-4 shrink-0 accent-primary"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm leading-tight">
                              vs {g.opponent}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {opts.tournamentId === null && tournament
                                ? `${tournament.name} · `
                                : ""}
                              {g.pointsPlayed} pts
                              {g.difficulty
                                ? ` · ${DIFFICULTY_LABEL[g.difficulty]}`
                                : ""}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "shrink-0 text-sm font-semibold tabular-nums",
                              g.scoreUs > g.scoreThem
                                ? "text-green-600"
                                : g.scoreUs < g.scoreThem
                                  ? "text-red-500"
                                  : "text-foreground",
                            )}
                          >
                            {g.scoreUs}–{g.scoreThem}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

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
